const AIRCOPY_PEER_PREFIX = "AIRCOPYP1:";
const FILE_CHUNK_SIZE = 60 * 1024;
const FILE_ACK_TIMEOUT_MS = 120000;
const HEARTBEAT_INTERVAL_MS = 15000;

class PeerManager {
    constructor(handlers = {}) {
        this.handlers = handlers;
        this.peer = null;
        this.connection = null;
        this.localPeerId = "";
        this.displayName = "匿名用户";
        this.persistentId = "";
        this.helloSent = false;
        this.remoteDisplayName = "";
        this.heartbeatTimer = null;
        this.heartbeatSequence = 0;

        this.incomingTransfers = new Map();
        this.outgoingTransferAcks = new Map();

        this.pendingIncomingCall = null;
        this.mediaCall = null;
        this.localMediaStream = null;
        this.remoteMediaStream = null;
    }

    async init(displayName) {
        this.displayName = displayName || "匿名用户";
        this.destroy();

        return new Promise((resolve, reject) => {
            const peer = new Peer(undefined, {
                debug: 1,
                secure: true,
                host: "0.peerjs.com",
                port: 443,
                path: "/"
            });
            this.peer = peer;

            let ready = false;
            peer.on("open", (id) => {
                ready = true;
                this.localPeerId = id;
                if (this.handlers.onLocalId) {
                    this.handlers.onLocalId(id);
                }
                resolve(id);
            });

            peer.on("connection", (conn) => {
                this._attachConnection(conn, true);
            });

            peer.on("call", (call) => {
                this._onIncomingCall(call);
            });

            peer.on("error", (error) => {
                if (!ready) {
                    reject(error);
                }
                if (this.handlers.onError) {
                    this.handlers.onError(error);
                }
            });

            peer.on("disconnected", () => {
                if (this.handlers.onStateChange) {
                    this.handlers.onStateChange("disconnected");
                }
            });
        });
    }

    connect(targetPeerId) {
        if (!this.peer || !this.localPeerId) {
            throw new Error("Peer 尚未初始化完成。");
        }
        const remoteId = String(targetPeerId || "").trim();
        if (!remoteId) {
            throw new Error("目标 peerId 为空。");
        }
        if (remoteId === this.localPeerId) {
            throw new Error("不能连接到自己。");
        }

        const conn = this.peer.connect(remoteId, {
            reliable: true,
            metadata: {
                name: this.displayName,
                pid: this.persistentId
            }
        });
        this._attachConnection(conn, false);
    }

    sendText(text) {
        this._assertConnectionReady();
        this.connection.send({
            t: "text",
            b: text,
            name: this.displayName,
            pid: this.persistentId
        });
    }

    async sendFile(file, options = {}) {
        this._assertConnectionReady();
        const blob = file instanceof Blob ? file : null;
        if (!blob) {
            throw new Error("文件对象无效。");
        }

        const kind = options.kind === "voice" ? "voice" : "file";
        const transferId = this._createTransferId();
        const fileName = options.fileName || (file && file.name) || `${kind}-${Date.now()}`;
        const mimeType = options.mimeType || blob.type || "application/octet-stream";
        const chunkSize = Math.max(8 * 1024, Number(options.chunkSize) || FILE_CHUNK_SIZE);
        const totalChunks = Math.max(1, Math.ceil(blob.size / chunkSize));

        this.connection.send({
            t: "file-start",
            id: transferId,
            kind,
            name: fileName,
            mime: mimeType,
            size: blob.size,
            chunkSize,
            totalChunks,
            nameMeta: this.displayName,
            pid: this.persistentId
        });

        const ack = await this._waitTransferAck(transferId);
        if (!ack.accepted) {
            const reason = ack.reason ? `（${ack.reason}）` : "";
            throw new Error(`对方拒绝接收${reason}`);
        }

        for (let index = 0; index < totalChunks; index += 1) {
            const start = index * chunkSize;
            const end = Math.min(blob.size, start + chunkSize);
            const chunkBuffer = await blob.slice(start, end).arrayBuffer();
            this.connection.send({
                t: "file-chunk",
                id: transferId,
                seq: index,
                d: chunkBuffer
            });

            if (this.handlers.onTransferProgress) {
                this.handlers.onTransferProgress({
                    transferId,
                    direction: "send",
                    sentChunks: index + 1,
                    totalChunks,
                    kind,
                    fileName,
                    size: blob.size
                });
            }

            if (index % 8 === 7) {
                await this._pause(0);
            }
        }

        this.connection.send({
            t: "file-end",
            id: transferId,
            totalChunks
        });

        return {
            transferId,
            kind,
            fileName,
            mimeType,
            size: blob.size
        };
    }

    acceptIncomingFile(transferId, options = {}) {
        const id = String(transferId || "").trim();
        if (!id) {
            throw new Error("transferId 为空。");
        }
        const transfer = this.incomingTransfers.get(id);
        if (!transfer) {
            throw new Error("未找到待确认文件。");
        }

        transfer.state = "accepted";
        if (options.writable) {
            transfer.writable = options.writable;
            this._flushCachedChunksToWritable(transfer);
        }

        this._sendIfConnected({ t: "file-ack", id, accepted: true });
    }

    rejectIncomingFile(transferId, reason = "rejected") {
        const id = String(transferId || "").trim();
        if (!id) {
            return;
        }
        const transfer = this.incomingTransfers.get(id);
        if (!transfer) {
            return;
        }
        transfer.state = "rejected";
        this._sendIfConnected({ t: "file-ack", id, accepted: false, reason: String(reason || "rejected") });
        this._cleanupIncomingTransfer(transfer, { closeWritable: true });
    }

    setIncomingFileWritable(transferId, writable) {
        const id = String(transferId || "").trim();
        if (!id || !writable) {
            return;
        }
        const transfer = this.incomingTransfers.get(id);
        if (!transfer || transfer.state !== "accepted") {
            return;
        }
        transfer.writable = writable;
        this._flushCachedChunksToWritable(transfer);
    }

    async startVideoCall(options = {}) {
        if (!this.peer || !this.connection || !this.connection.open) {
            throw new Error("连接未建立，无法发起视频通话。");
        }
        const targetPeerId = this.connection.peer;
        if (!targetPeerId) {
            throw new Error("未找到对端 peerId。");
        }

        const media = await this._createLocalMediaStream({
            showVideo: options.showVideo !== false,
            requireAudio: options.requireAudio !== false
        });
        this._setLocalMediaStream(media.stream, { hasVideoTrack: media.hasVideoTrack, requestedVideo: media.requestedVideo });

        const call = this.peer.call(targetPeerId, media.stream, {
            metadata: {
                name: this.displayName,
                pid: this.persistentId,
                videoEnabled: media.hasVideoTrack
            }
        });

        this._attachMediaCall(call, { incoming: false });
        if (this.handlers.onCallState) {
            this.handlers.onCallState({ state: "calling", incoming: false, hasVideoTrack: media.hasVideoTrack });
        }
    }

    async acceptIncomingCall(options = {}) {
        if (!this.pendingIncomingCall) {
            throw new Error("当前没有可接听的视频通话。");
        }
        const call = this.pendingIncomingCall;
        this.pendingIncomingCall = null;

        const media = await this._createLocalMediaStream({
            showVideo: options.showVideo !== false,
            requireAudio: options.requireAudio !== false
        });
        this._setLocalMediaStream(media.stream, { hasVideoTrack: media.hasVideoTrack, requestedVideo: media.requestedVideo });

        call.answer(media.stream);
        this._attachMediaCall(call, { incoming: true });
        if (this.handlers.onCallState) {
            this.handlers.onCallState({ state: "connecting", incoming: true, hasVideoTrack: media.hasVideoTrack });
        }
    }

    rejectIncomingCall() {
        if (!this.pendingIncomingCall) {
            return;
        }
        this.pendingIncomingCall.close();
        this.pendingIncomingCall = null;
        if (this.handlers.onCallState) {
            this.handlers.onCallState({ state: "rejected", incoming: true });
        }
    }

    hangupVideoCall() {
        if (this.mediaCall) {
            this.mediaCall.close();
            this.mediaCall = null;
        }
        this.pendingIncomingCall = null;
        this._setRemoteMediaStream(null, { hasVideoTrack: false });
        this._stopLocalMedia();
        if (this.handlers.onCallState) {
            this.handlers.onCallState({ state: "idle", incoming: false });
        }
    }

    closeConnection() {
        this._stopHeartbeatLoop();
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
        this.hangupVideoCall();
        this._resetIncomingTransfers();
        this._resetOutgoingTransferAcks("连接已断开");
        this.helloSent = false;
        this.remoteDisplayName = "";
    }

    destroy() {
        this.closeConnection();
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.localPeerId = "";
    }

    setDisplayName(name) {
        this.displayName = name || "匿名用户";
    }

    setPersistentId(id) {
        this.persistentId = String(id || "").trim();
    }

    _assertConnectionReady() {
        if (!this.connection || !this.connection.open) {
            throw new Error("连接未建立。");
        }
    }

    _attachConnection(conn, isIncoming) {
        if (!conn) {
            return;
        }
        if (this.connection && this.connection !== conn) {
            this.connection.close();
        }
        this.connection = conn;
        this.helloSent = false;
        this.remoteDisplayName = (conn.metadata && conn.metadata.name) ? String(conn.metadata.name) : "";
        const remotePersistentId = (conn.metadata && conn.metadata.pid) ? String(conn.metadata.pid) : "";

        conn.on("open", () => {
            if (this.handlers.onConnected) {
                this.handlers.onConnected({
                    peerId: conn.peer,
                    isIncoming,
                    peerName: this.remoteDisplayName,
                    peerPersistentId: remotePersistentId
                });
            }
            this._sendHello();
            this._startHeartbeatLoop();
        });

        conn.on("data", (payload) => {
            this._onData(payload);
        });

        conn.on("close", () => {
            if (this.connection === conn) {
                this.connection = null;
                this.helloSent = false;
                this._stopHeartbeatLoop();
            }
            this.hangupVideoCall();
            this._resetIncomingTransfers();
            this._resetOutgoingTransferAcks("连接已断开");
            if (this.handlers.onConnectionClosed) {
                this.handlers.onConnectionClosed();
            }
        });

        conn.on("error", (error) => {
            if (this.handlers.onError) {
                this.handlers.onError(error);
            }
        });
    }

    _sendHello() {
        if (!this.connection || !this.connection.open || this.helloSent) {
            return;
        }
        this.helloSent = true;
        this.connection.send({
            t: "hello",
            b: "hello",
            name: this.displayName,
            pid: this.persistentId
        });
    }

    _onData(rawPayload) {
        let payload = rawPayload;
        if (typeof rawPayload === "string") {
            try {
                payload = JSON.parse(rawPayload);
            } catch (_error) {
                payload = { t: "text", b: rawPayload };
            }
        }

        if (!payload || typeof payload !== "object") {
            return;
        }

        const type = payload.t ? String(payload.t) : "text";
        if (type === "heartbeat") {
            this._handleIncomingHeartbeat(payload);
            return;
        }
        if (type === "heartbeat-ack") {
            return;
        }
        if (type === "file-start" || type === "file-chunk" || type === "file-end" || type === "file-ack") {
            this._onTransferPayload(payload);
            return;
        }

        const body = payload && payload.b ? String(payload.b) : "";
        const name = payload && payload.name ? String(payload.name) : "";
        const persistentId = payload && payload.pid ? String(payload.pid) : "";
        if (name) {
            this.remoteDisplayName = name;
        }

        if (this.handlers.onMessage) {
            this.handlers.onMessage({
                from: "peer",
                type,
                body,
                name,
                persistentId,
                peerId: this.connection ? this.connection.peer : ""
            });
        }
    }

    _onTransferPayload(payload) {
        const transferId = payload.id ? String(payload.id) : "";
        if (!transferId) {
            return;
        }

        if (payload.t === "file-start") {
            const transfer = {
                id: transferId,
                kind: payload.kind === "voice" ? "voice" : "file",
                name: payload.name ? String(payload.name) : "文件",
                mime: payload.mime ? String(payload.mime) : "application/octet-stream",
                size: Math.max(0, Number(payload.size) || 0),
                totalChunks: Math.max(1, Number(payload.totalChunks) || 1),
                chunks: [],
                receivedSeq: new Set(),
                receivedChunks: 0,
                writable: null,
                writeQueue: Promise.resolve(),
                state: "pending"
            };
            this.incomingTransfers.set(transferId, transfer);

            if (this.handlers.onIncomingFileOffer) {
                this.handlers.onIncomingFileOffer({
                    transferId,
                    kind: transfer.kind,
                    fileName: transfer.name,
                    mimeType: transfer.mime,
                    size: transfer.size,
                    totalChunks: transfer.totalChunks
                });
            } else {
                this.acceptIncomingFile(transferId);
            }
            return;
        }

        if (payload.t === "file-ack") {
            const pending = this.outgoingTransferAcks.get(transferId);
            if (!pending) {
                return;
            }
            clearTimeout(pending.timer);
            this.outgoingTransferAcks.delete(transferId);
            pending.resolve({
                accepted: Boolean(payload.accepted),
                reason: payload.reason ? String(payload.reason) : ""
            });
            return;
        }

        const transfer = this.incomingTransfers.get(transferId);
        if (!transfer || transfer.state === "rejected") {
            return;
        }

        if (payload.t === "file-chunk") {
            const chunkData = this._toArrayBuffer(payload.d);
            if (!chunkData) {
                return;
            }
            const seq = Math.max(0, Number(payload.seq) || 0);
            if (transfer.receivedSeq.has(seq)) {
                return;
            }
            transfer.receivedSeq.add(seq);
            transfer.receivedChunks = transfer.receivedSeq.size;

            if (transfer.writable) {
                transfer.writeQueue = transfer.writeQueue.then(() => transfer.writable.write(new Uint8Array(chunkData)));
            } else {
                transfer.chunks[seq] = chunkData;
            }

            if (this.handlers.onTransferProgress) {
                this.handlers.onTransferProgress({
                    transferId,
                    direction: "receive",
                    receivedChunks: transfer.receivedChunks,
                    totalChunks: transfer.totalChunks,
                    kind: transfer.kind,
                    fileName: transfer.name,
                    size: transfer.size
                });
            }
            return;
        }

        if (payload.t === "file-end") {
            transfer.writeQueue
                .then(async () => {
                    if (transfer.writable && typeof transfer.writable.close === "function") {
                        await transfer.writable.close();
                    }

                    if (!this.handlers.onFileReceived) {
                        return;
                    }

                    if (transfer.writable) {
                        this.handlers.onFileReceived({
                            transferId,
                            kind: transfer.kind,
                            fileName: transfer.name,
                            mimeType: transfer.mime,
                            size: transfer.size,
                            blob: null,
                            savedToDisk: true
                        });
                        return;
                    }

                    const ordered = [];
                    for (let i = 0; i < transfer.totalChunks; i += 1) {
                        const chunk = transfer.chunks[i];
                        if (chunk) {
                            ordered.push(chunk);
                        }
                    }
                    const blob = new Blob(ordered, { type: transfer.mime });
                    this.handlers.onFileReceived({
                        transferId,
                        kind: transfer.kind,
                        fileName: transfer.name,
                        mimeType: transfer.mime,
                        size: transfer.size,
                        blob,
                        savedToDisk: false
                    });
                })
                .catch((error) => {
                    if (this.handlers.onError) {
                        this.handlers.onError(error);
                    }
                })
                .finally(() => {
                    this.incomingTransfers.delete(transferId);
                });
        }
    }

    _waitTransferAck(transferId) {
        return new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => {
                this.outgoingTransferAcks.delete(transferId);
                reject(new Error("等待对方确认接收文件超时。"));
            }, FILE_ACK_TIMEOUT_MS);

            this.outgoingTransferAcks.set(transferId, {
                timer,
                resolve,
                reject
            });
        });
    }

    _flushCachedChunksToWritable(transfer) {
        if (!transfer || !transfer.writable) {
            return;
        }
        for (let i = 0; i < transfer.chunks.length; i += 1) {
            const chunk = transfer.chunks[i];
            if (!chunk) {
                continue;
            }
            transfer.writeQueue = transfer.writeQueue.then(() => transfer.writable.write(new Uint8Array(chunk)));
            transfer.chunks[i] = null;
        }
    }

    _resetIncomingTransfers() {
        const ids = Array.from(this.incomingTransfers.keys());
        for (let i = 0; i < ids.length; i += 1) {
            const transfer = this.incomingTransfers.get(ids[i]);
            this._cleanupIncomingTransfer(transfer, { closeWritable: true });
        }
    }

    _cleanupIncomingTransfer(transfer, options = {}) {
        if (!transfer) {
            return;
        }
        this.incomingTransfers.delete(transfer.id);
        if (options.closeWritable && transfer.writable && typeof transfer.writable.close === "function") {
            try {
                transfer.writable.close();
            } catch (_error) {
                // Ignore close errors.
            }
        }
    }

    _resetOutgoingTransferAcks(reasonText) {
        const ids = Array.from(this.outgoingTransferAcks.keys());
        for (let i = 0; i < ids.length; i += 1) {
            const id = ids[i];
            const pending = this.outgoingTransferAcks.get(id);
            if (!pending) {
                continue;
            }
            clearTimeout(pending.timer);
            pending.reject(new Error(reasonText || "文件发送失败"));
            this.outgoingTransferAcks.delete(id);
        }
    }

    async _createLocalMediaStream(options = {}) {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
            throw new Error("当前浏览器不支持媒体采集。");
        }

        const showVideo = options.showVideo !== false;
        const requireAudio = options.requireAudio !== false;

        const candidates = [];
        candidates.push({ audio: requireAudio, video: showVideo });
        if (showVideo) {
            candidates.push({ audio: requireAudio, video: false });
        }
        candidates.push({ audio: false, video: showVideo });
        if (showVideo) {
            candidates.push({ audio: false, video: false });
        }

        let stream = null;
        for (let i = 0; i < candidates.length; i += 1) {
            const c = candidates[i];
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: c.audio,
                    video: c.video ? { facingMode: "user" } : false
                });
                break;
            } catch (_error) {
                // Try next fallback.
            }
        }

        if (!stream) {
            stream = new MediaStream();
        }

        if (showVideo && stream.getVideoTracks().length === 0) {
            const blackTrack = this._createBlackVideoTrack();
            if (blackTrack) {
                stream.addTrack(blackTrack);
            }
        }

        return {
            stream,
            requestedVideo: showVideo,
            hasVideoTrack: stream.getVideoTracks().length > 0
        };
    }

    _createBlackVideoTrack() {
        try {
            const canvas = document.createElement("canvas");
            canvas.width = 640;
            canvas.height = 360;
            const ctx = canvas.getContext("2d");
            if (!ctx || typeof canvas.captureStream !== "function") {
                return null;
            }
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const stream = canvas.captureStream(1);
            const track = stream.getVideoTracks()[0] || null;
            return track;
        } catch (_error) {
            return null;
        }
    }

    _sendIfConnected(payload) {
        if (!this.connection || !this.connection.open) {
            return;
        }
        this.connection.send(payload);
    }

    _startHeartbeatLoop() {
        this._stopHeartbeatLoop();
        this._sendHeartbeat();
        this.heartbeatTimer = window.setInterval(() => {
            this._sendHeartbeat();
        }, HEARTBEAT_INTERVAL_MS);
    }

    _stopHeartbeatLoop() {
        if (this.heartbeatTimer !== null) {
            window.clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    _sendHeartbeat() {
        if (!this.connection || !this.connection.open) {
            return;
        }
        this.heartbeatSequence += 1;
        this.connection.send({
            t: "heartbeat",
            id: `hb${Date.now().toString(36)}${this.heartbeatSequence.toString(36)}`,
            ts: Date.now(),
            name: this.displayName,
            pid: this.persistentId
        });
    }

    _handleIncomingHeartbeat(payload) {
        const heartbeatId = payload && payload.id ? String(payload.id) : "";
        this._sendIfConnected({
            t: "heartbeat-ack",
            id: heartbeatId,
            ts: Date.now()
        });
        if (this.handlers.onHeartbeat) {
            this.handlers.onHeartbeat({
                id: heartbeatId,
                peerId: this.connection ? this.connection.peer : "",
                timestamp: payload && payload.ts ? Number(payload.ts) : Date.now()
            });
        }
    }

    _toArrayBuffer(value) {
        if (!value) {
            return null;
        }
        if (value instanceof ArrayBuffer) {
            return value;
        }
        if (ArrayBuffer.isView(value)) {
            return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
        }
        return null;
    }

    _onIncomingCall(call) {
        if (!call) {
            return;
        }
        if (this.mediaCall || this.pendingIncomingCall) {
            call.close();
            return;
        }
        this.pendingIncomingCall = call;

        if (this.handlers.onIncomingCall) {
            this.handlers.onIncomingCall({
                peerId: call.peer,
                metadata: call.metadata || {}
            });
        }

        call.on("close", () => {
            if (this.pendingIncomingCall === call) {
                this.pendingIncomingCall = null;
            }
        });
    }

    _attachMediaCall(call, options = {}) {
        if (!call) {
            return;
        }
        if (this.mediaCall && this.mediaCall !== call) {
            this.mediaCall.close();
        }
        this.mediaCall = call;

        call.on("stream", (stream) => {
            const hasVideoTrack = stream && stream.getVideoTracks().length > 0;
            this._setRemoteMediaStream(stream, { hasVideoTrack });
            if (this.handlers.onCallState) {
                this.handlers.onCallState({
                    state: "connected",
                    incoming: Boolean(options.incoming),
                    hasVideoTrack
                });
            }
        });

        call.on("close", () => {
            if (this.mediaCall === call) {
                this.mediaCall = null;
            }
            this._setRemoteMediaStream(null, { hasVideoTrack: false });
            this._stopLocalMedia();
            if (this.handlers.onCallState) {
                this.handlers.onCallState({ state: "idle", incoming: Boolean(options.incoming) });
            }
        });

        call.on("error", (error) => {
            if (this.handlers.onError) {
                this.handlers.onError(error);
            }
            if (this.handlers.onCallState) {
                this.handlers.onCallState({ state: "error", incoming: Boolean(options.incoming) });
            }
        });
    }

    _setLocalMediaStream(stream, info = {}) {
        this._stopLocalMedia();
        this.localMediaStream = stream || null;
        if (this.handlers.onLocalStream) {
            this.handlers.onLocalStream(this.localMediaStream, {
                hasVideoTrack: Boolean(info.hasVideoTrack),
                requestedVideo: Boolean(info.requestedVideo)
            });
        }
    }

    _setRemoteMediaStream(stream, info = {}) {
        this.remoteMediaStream = stream || null;
        if (this.handlers.onRemoteStream) {
            this.handlers.onRemoteStream(this.remoteMediaStream, {
                hasVideoTrack: Boolean(info.hasVideoTrack)
            });
        }
    }

    _stopLocalMedia() {
        if (this.localMediaStream) {
            this.localMediaStream.getTracks().forEach((track) => {
                track.stop();
            });
            this.localMediaStream = null;
        }
        if (this.handlers.onLocalStream) {
            this.handlers.onLocalStream(null, { hasVideoTrack: false, requestedVideo: false });
        }
    }

    _createTransferId() {
        return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }

    _pause(ms) {
        return new Promise((resolve) => {
            window.setTimeout(resolve, ms);
        });
    }
}

function encodePeerSignal(peerId) {
    const id = String(peerId || "").trim();
    if (!id) {
        throw new Error("peerId 为空，无法生成二维码。");
    }
    return `${AIRCOPY_PEER_PREFIX}${id}`;
}

function decodePeerSignal(rawText) {
    const text = String(rawText || "").trim();
    if (!text.startsWith(AIRCOPY_PEER_PREFIX)) {
        throw new Error("二维码内容不是 AirCopy Peer 信令。");
    }
    const peerId = text.slice(AIRCOPY_PEER_PREFIX.length).trim();
    if (!peerId) {
        throw new Error("二维码中的 peerId 为空。");
    }
    return peerId;
}
