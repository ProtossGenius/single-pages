const AIRCOPY_PEER_PREFIX = "AIRCOPYP1:";
const FILE_CHUNK_SIZE = 60 * 1024;
const FILE_ACK_TIMEOUT_MS = 120000;
const FILE_SEND_DRAIN_TIMEOUT_MS = 20000;
const FILE_SEND_DRAIN_THRESHOLD_BYTES = 96 * 1024;
const HEARTBEAT_INTERVAL_MS = 5000;
const HEARTBEAT_AWAY_MISS_COUNT = 3;
const HEARTBEAT_OFFLINE_MISS_COUNT = 5;
const CONNECTION_HEALTH_RECHECK_DELAY_MS = 3000;
const CONNECTION_HEALTH_RECHECK_RTC_DELAY_MS = 30 * 1000;
const CONNECTION_HEALTH_RECHECK_HIDDEN_DELAY_MS = 90 * 1000;
const CONNECTION_HEALTH_RTC_FAILURE_GRACE_MS = 90 * 1000;

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
        this.remotePersistentId = "";
        this.heartbeatTimer = null;
        this.lastHeartbeatReplyAt = 0;
        this.heartbeatSequence = 0;
        this.pendingHeartbeatId = "";
        this.heartbeatDueAt = 0;
        this.heartbeatMissCount = 0;
        this.heartbeatStatus = "online";
        this.connectionHealthCleanup = null;
        this.connectionHealthCheckTimer = null;

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
                this._emitError(error, {
                    source: "peer",
                    code: "peer-error",
                    phase: ready ? "runtime" : "init"
                });
            });

            peer.on("disconnected", () => {
                if (this.handlers.onStateChange) {
                    this.handlers.onStateChange("disconnected");
                }
            });
        });
    }

    connect(targetPeerId, options = {}) {
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

        if (!options.force && this.connection && this.connection.open && this.connection.peer === remoteId) {
            return {
                reused: true,
                peerId: remoteId,
                peerName: this.remoteDisplayName,
                peerPersistentId: this.remotePersistentId
            };
        }

        const conn = this.peer.connect(remoteId, {
            reliable: true,
            metadata: {
                name: this.displayName,
                pid: this.persistentId
            }
        });
        this._attachConnection(conn, false);
        return {
            reused: false,
            peerId: remoteId
        };
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
        await this._waitForDataChannelDrain(FILE_SEND_DRAIN_TIMEOUT_MS, FILE_SEND_DRAIN_THRESHOLD_BYTES);

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
        try {
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
        } catch (error) {
            throw error;
        }
    }

    async acceptIncomingCall(options = {}) {
        if (!this.pendingIncomingCall) {
            throw new Error("当前没有可接听的视频通话。");
        }
        const call = this.pendingIncomingCall;
        this.pendingIncomingCall = null;
        try {
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
        } catch (error) {
            throw error;
        }
    }

    rejectIncomingCall() {
        if (!this.pendingIncomingCall) {
            return;
        }
        this._sendIfConnected({ t: "call-hangup" });
        this.pendingIncomingCall.close();
        this.pendingIncomingCall = null;
        if (this.handlers.onCallState) {
            this.handlers.onCallState({ state: "rejected", incoming: true });
        }
    }

    hangupVideoCall(options = {}) {
        if (options.notifyPeer !== false) {
            this._sendIfConnected({ t: "call-hangup" });
        }

        const activeCall = this.mediaCall;
        this.mediaCall = null;
        if (activeCall) {
            activeCall.close();
        }

        const pendingCall = this.pendingIncomingCall;
        this.pendingIncomingCall = null;
        if (pendingCall) {
            pendingCall.close();
        }

        this._setRemoteMediaStream(null, { hasVideoTrack: false });
        this._stopLocalMedia();
        if (this.handlers.onCallState) {
            this.handlers.onCallState({ state: "idle", incoming: false });
        }
    }

    closeConnection() {
        this._clearConnectionHealthWatch();
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
        this.remotePersistentId = "";
    }

    destroy() {
        this.closeConnection();
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.localPeerId = "";
    }

    isSignalingConnected() {
        return Boolean(
            this.peer
            && !this.peer.destroyed
            && !this.peer.disconnected
            && this.localPeerId
        );
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
        this._clearConnectionHealthWatch();
        this.connection = conn;
        this.helloSent = false;
        this.remoteDisplayName = (conn.metadata && conn.metadata.name) ? String(conn.metadata.name) : "";
        this.remotePersistentId = isIncoming && conn.metadata && conn.metadata.pid ? String(conn.metadata.pid) : "";
        this._installConnectionHealthWatch(conn);

        conn.on("open", () => {
            if (this.connection !== conn) {
                return;
            }
            this._installConnectionHealthWatch(conn);
            if (this.handlers.onConnected) {
                this.handlers.onConnected({
                    peerId: conn.peer,
                    isIncoming,
                    peerName: this.remoteDisplayName,
                    peerPersistentId: this.remotePersistentId
                });
            }
            this._sendHello();
            this._startHeartbeatLoop();
        });

        conn.on("data", (payload) => {
            if (this.connection !== conn) {
                return;
            }
            this._onData(payload);
        });

        conn.on("close", () => {
            if (this.connection !== conn) {
                return;
            }
            this._handleActiveConnectionClosed("连接已断开", {
                source: "data",
                code: "closed",
                peerId: conn.peer
            });
        });

        conn.on("error", (error) => {
            if (this.connection !== conn) {
                return;
            }
            this._emitError(error, {
                source: "data",
                code: "connection-error",
                peerId: conn.peer,
                phase: "runtime"
            });
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
            this._handleHeartbeatAck(payload);
            return;
        }
        if (type === "file-start" || type === "file-chunk" || type === "file-end" || type === "file-ack") {
            this._onTransferPayload(payload);
            return;
        }
        if (type === "call-hangup") {
            this.hangupVideoCall({ notifyPeer: false });
            return;
        }

        const body = payload && payload.b ? String(payload.b) : "";
        const name = payload && payload.name ? String(payload.name) : "";
        const persistentId = payload && payload.pid ? String(payload.pid) : "";
        if (name) {
            this.remoteDisplayName = name;
        }
        if (persistentId) {
            this.remotePersistentId = persistentId;
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
                    this._emitError(error, {
                        source: "file",
                        code: "receive-error",
                        peerId: this.connection && this.connection.peer ? this.connection.peer : "",
                        phase: "runtime"
                    });
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
        if (typeof window !== "undefined" && window.isSecureContext === false) {
            throw new Error("当前页面不是 HTTPS，iPad Safari 无法访问摄像头/麦克风。");
        }

        const showVideo = options.showVideo !== false;
        const requireAudio = options.requireAudio !== false;
        if (!showVideo && !requireAudio) {
            return {
                stream: new MediaStream(),
                requestedVideo: false,
                hasVideoTrack: false
            };
        }

        const candidates = [];
        if (showVideo && requireAudio) {
            candidates.push({ audio: true, video: { facingMode: { ideal: "user" } } });
            candidates.push({ audio: true, video: true });
        } else {
            candidates.push({ audio: requireAudio, video: showVideo });
        }
        if (showVideo) {
            candidates.push({ audio: false, video: { facingMode: { ideal: "user" } } });
            candidates.push({ audio: false, video: true });
        }
        if (requireAudio) {
            candidates.push({ audio: true, video: false });
        }

        let stream = null;
        let lastError = null;
        let permissionDenied = false;
        for (let i = 0; i < candidates.length; i += 1) {
            const c = candidates[i];
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: c.audio,
                    video: c.video
                });
                if (stream && typeof stream.getTracks === "function" && stream.getTracks().length > 0) {
                    break;
                }
                this._stopStreamTracks(stream);
                stream = null;
            } catch (_error) {
                const errorName = _error && _error.name ? String(_error.name) : "";
                if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
                    permissionDenied = true;
                }
                lastError = _error;
                // Try next fallback.
            }
        }

        if (!stream) {
            if (permissionDenied) {
                const source = showVideo ? "摄像头/麦克风" : "麦克风";
                throw new Error(`无法访问${source}，请在浏览器网站设置中允许权限后重试。`);
            }
            if (lastError && lastError.message) {
                throw new Error(`媒体采集失败：${lastError.message}`);
            }
            throw new Error("媒体采集失败，请确认摄像头和麦克风可用。");
        }

        if (showVideo && stream.getVideoTracks().length === 0) {
            const blackTrack = this._createBlackVideoTrack();
            if (blackTrack) {
                stream.addTrack(blackTrack);
            }
        }
        if (stream.getTracks().length === 0) {
            throw new Error("媒体采集失败：未拿到任何可用媒体轨道。");
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
        try {
            this.connection.send(payload);
        } catch (error) {
            const managedError = this._emitError(error, {
                source: "data",
                code: "send-failed",
                phase: "runtime",
                reason: "连接发送失败，连接已断开",
                handledByConnectionClose: true
            });
            this._handleActiveConnectionClosed("连接发送失败，连接已断开", {
                error: managedError
            });
        }
    }

    _startHeartbeatLoop() {
        this._stopHeartbeatLoop();
        const now = Date.now();
        this.lastHeartbeatReplyAt = now;
        this.heartbeatMissCount = 0;
        this.heartbeatStatus = "online";
        this._emitHeartbeatStatus("online");
        this._sendHeartbeat();
        this._scheduleHeartbeatTick();
    }

    _stopHeartbeatLoop() {
        if (this.heartbeatTimer !== null) {
            window.clearTimeout(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        this.lastHeartbeatReplyAt = 0;
        this.heartbeatMissCount = 0;
        this.pendingHeartbeatId = "";
        this.heartbeatDueAt = 0;
    }

    _scheduleHeartbeatTick() {
        if (this.heartbeatTimer !== null) {
            window.clearTimeout(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (!this.connection || !this.connection.open) {
            return;
        }
        if (this.heartbeatDueAt <= 0) {
            this.heartbeatDueAt = Date.now() + HEARTBEAT_INTERVAL_MS;
        }
        const delay = Math.max(0, this.heartbeatDueAt - Date.now());
        this.heartbeatTimer = window.setTimeout(() => {
            this._handleHeartbeatTick();
        }, delay);
    }

    _handleHeartbeatTick() {
        this.heartbeatTimer = null;
        if (!this.connection || !this.connection.open) {
            return;
        }
        const now = Date.now();
        if (this.heartbeatDueAt > 0 && now + 10 < this.heartbeatDueAt) {
            this._scheduleHeartbeatTick();
            return;
        }
        this._sendHeartbeat();
        this._scheduleHeartbeatTick();
    }

    _markHeartbeatResponse(now = Date.now()) {
        this.lastHeartbeatReplyAt = now;
        this.heartbeatMissCount = 0;
        this.pendingHeartbeatId = "";
        this.heartbeatDueAt = now + HEARTBEAT_INTERVAL_MS;
        if (this.heartbeatStatus !== "online") {
            this.heartbeatStatus = "online";
            this._emitHeartbeatStatus("online");
        }
    }

    _emitHeartbeatStatus(status) {
        if (this.handlers.onHeartbeatStatus) {
            this.handlers.onHeartbeatStatus({
                status: String(status || "online"),
                missCount: Math.max(0, Number(this.heartbeatMissCount || 0)),
                lastReplyAt: Math.max(0, Number(this.lastHeartbeatReplyAt || 0)),
                peerId: this.connection && this.connection.peer ? String(this.connection.peer) : ""
            });
        }
    }

    _sendHeartbeat() {
        if (!this.connection || !this.connection.open) {
            return;
        }

        if (this.pendingHeartbeatId) {
            this.heartbeatMissCount += 1;
            if (this.heartbeatMissCount >= HEARTBEAT_OFFLINE_MISS_COUNT) {
                this._handleActiveConnectionClosed("心跳超时 25 秒未响应，连接已断开", {
                    source: "heartbeat",
                    code: "timeout"
                });
                return;
            }
            if (this.heartbeatMissCount >= HEARTBEAT_AWAY_MISS_COUNT && this.heartbeatStatus !== "away") {
                this.heartbeatStatus = "away";
                this._emitHeartbeatStatus("away");
            }
        }

        const now = Date.now();
        this.heartbeatSequence += 1;
        const heartbeatId = `hb${now.toString(36)}${this.heartbeatSequence.toString(36)}`;
        try {
            this.connection.send({
                t: "heartbeat",
                id: heartbeatId,
                ts: now,
                name: this.displayName,
                pid: this.persistentId
            });
        } catch (error) {
            const managedError = this._emitError(error, {
                source: "heartbeat",
                code: "send-failed",
                phase: "runtime",
                reason: "心跳发送失败，连接已断开",
                handledByConnectionClose: true
            });
            this._handleActiveConnectionClosed("心跳发送失败，连接已断开", {
                error: managedError
            });
            return;
        }
        this.pendingHeartbeatId = heartbeatId;
        this.heartbeatDueAt = now + HEARTBEAT_INTERVAL_MS;
    }

    _handleIncomingHeartbeat(payload) {
        const heartbeatId = payload && payload.id ? String(payload.id) : "";
        this._markHeartbeatResponse();
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

    _handleHeartbeatAck(payload) {
        this._markHeartbeatResponse();
    }

    _handleActiveConnectionClosed(reasonText, options = {}) {
        const activeConnection = this.connection;
        const closedPeerId = activeConnection && activeConnection.peer ? String(activeConnection.peer) : "";
        const finalReason = reasonText || "连接已断开";
        const closeError = options.error || this._createManagedError(null, {
            source: options.source || "connection",
            code: options.code || "closed",
            phase: options.phase || "runtime",
            peerId: closedPeerId,
            reason: finalReason
        });
        this.connection = null;
        this.helloSent = false;
        this.remoteDisplayName = "";
        this.remotePersistentId = "";
        this._clearConnectionHealthWatch();
        this._stopHeartbeatLoop();
        this.heartbeatStatus = "offline";
        if (activeConnection) {
            try {
                activeConnection.close();
            } catch (_error) {
                // Ignore close errors.
            }
        }
        this.hangupVideoCall();
        this._resetIncomingTransfers();
        this._resetOutgoingTransferAcks(finalReason);
        if (this.handlers.onConnectionClosed) {
            this.handlers.onConnectionClosed({
                reason: finalReason,
                peerId: closedPeerId,
                error: closeError
            });
        }
    }

    _clearConnectionHealthWatch() {
        if (this.connectionHealthCheckTimer !== null) {
            window.clearTimeout(this.connectionHealthCheckTimer);
            this.connectionHealthCheckTimer = null;
        }
        if (typeof this.connectionHealthCleanup === "function") {
            try {
                this.connectionHealthCleanup();
            } catch (_error) {
                // Ignore cleanup errors.
            }
        }
        this.connectionHealthCleanup = null;
    }

    _installConnectionHealthWatch(conn) {
        if (!conn || this.connection !== conn) {
            return;
        }
        this._clearConnectionHealthWatch();
        const cleanups = [];
        const bindEvent = (target, eventName, handler) => {
            if (!target || typeof target.addEventListener !== "function") {
                return;
            }
            target.addEventListener(eventName, handler);
            cleanups.push(() => {
                try {
                    target.removeEventListener(eventName, handler);
                } catch (_error) {
                    // Ignore remove listener errors.
                }
            });
        };

        const peerConnection = conn.peerConnection;
        if (peerConnection) {
            const onConnectionStateChange = () => {
                this._observeTransportState(conn, "rtc", peerConnection.connectionState);
            };
            const onIceConnectionStateChange = () => {
                this._observeTransportState(conn, "ice", peerConnection.iceConnectionState);
            };
            bindEvent(peerConnection, "connectionstatechange", onConnectionStateChange);
            bindEvent(peerConnection, "iceconnectionstatechange", onIceConnectionStateChange);
            onConnectionStateChange();
            onIceConnectionStateChange();
        }

        const dataChannel = conn.dataChannel;
        if (dataChannel) {
            const onDataChannelStateChange = () => {
                this._observeTransportState(conn, "data", dataChannel.readyState);
            };
            const onDataChannelClose = () => {
                this._observeTransportState(conn, "data", "closed");
            };
            bindEvent(dataChannel, "closing", onDataChannelStateChange);
            bindEvent(dataChannel, "close", onDataChannelClose);
            onDataChannelStateChange();
        }

        const onVisibilityChange = () => {
            if (typeof document === "undefined" || document.hidden) {
                return;
            }
            if (this.connection !== conn) {
                return;
            }
            const issue = this._getTransportIssue(conn);
            if (issue) {
                this._scheduleConnectionHealthRecheck(conn, issue.source, issue.state);
            }
        };
        if (typeof document !== "undefined") {
            bindEvent(document, "visibilitychange", onVisibilityChange);
        }

        this.connectionHealthCleanup = () => {
            for (let i = 0; i < cleanups.length; i += 1) {
                cleanups[i]();
            }
        };
    }

    _observeTransportState(conn, source, state) {
        if (!conn || this.connection !== conn) {
            return;
        }
        const normalizedState = String(state || "").trim().toLowerCase();
        if (!normalizedState) {
            return;
        }
        if (
            normalizedState === "connected"
            || normalizedState === "completed"
            || normalizedState === "open"
        ) {
            if (this.connectionHealthCheckTimer !== null) {
                window.clearTimeout(this.connectionHealthCheckTimer);
                this.connectionHealthCheckTimer = null;
            }
            return;
        }
        const isHardFailure = normalizedState === "failed" || normalizedState === "closed";
        if (isHardFailure && source === "data") {
            this._handleActiveConnectionClosed(`连接已断开（${source}:${normalizedState}）`, {
                source,
                code: normalizedState
            });
            return;
        }
        if (
            !isHardFailure
            && normalizedState !== "disconnected"
            && normalizedState !== "closing"
        ) {
            return;
        }
        if (this.connectionHealthCheckTimer !== null) {
            window.clearTimeout(this.connectionHealthCheckTimer);
        }
        this._scheduleConnectionHealthRecheck(conn, source, normalizedState);
    }

    _resolveConnectionHealthRecheckDelay(source, normalizedState) {
        const isRtcSide = source === "ice" || source === "rtc";
        if (!isRtcSide) {
            return CONNECTION_HEALTH_RECHECK_DELAY_MS;
        }
        if (normalizedState === "failed" || normalizedState === "closed") {
            return CONNECTION_HEALTH_RTC_FAILURE_GRACE_MS;
        }
        const isHidden = typeof document !== "undefined" && Boolean(document.hidden);
        if (isHidden) {
            return CONNECTION_HEALTH_RECHECK_HIDDEN_DELAY_MS;
        }
        if (normalizedState === "disconnected" || normalizedState === "closing") {
            return CONNECTION_HEALTH_RECHECK_RTC_DELAY_MS;
        }
        return CONNECTION_HEALTH_RECHECK_DELAY_MS;
    }

    _scheduleConnectionHealthRecheck(conn, source, normalizedState, delayMs) {
        if (!conn || this.connection !== conn) {
            return;
        }
        if (this.connectionHealthCheckTimer !== null) {
            window.clearTimeout(this.connectionHealthCheckTimer);
        }
        const recheckDelayMs = Math.max(
            0,
            Number.isFinite(Number(delayMs))
                ? Number(delayMs)
                : this._resolveConnectionHealthRecheckDelay(source, normalizedState)
        );
        this.connectionHealthCheckTimer = window.setTimeout(() => {
            this.connectionHealthCheckTimer = null;
            if (this.connection !== conn) {
                return;
            }
            const issue = this._getTransportIssue(conn);
            if (!issue) {
                return;
            }
            if (!this._shouldCloseForTransportIssue(conn, issue)) {
                this._scheduleConnectionHealthRecheck(conn, issue.source, issue.state);
                return;
            }
            this._handleActiveConnectionClosed(`连接已断开（${source}:${normalizedState}）`, {
                source,
                code: normalizedState
            });
        }, recheckDelayMs);
    }

    _shouldCloseForTransportIssue(conn, issue) {
        if (!issue) {
            return false;
        }
        if (issue.source === "data") {
            return true;
        }
        if (issue.source !== "rtc" && issue.source !== "ice") {
            return true;
        }
        if (this._isDataChannelOpen(conn) && this._hasRecentHeartbeatReply(CONNECTION_HEALTH_RTC_FAILURE_GRACE_MS)) {
            return false;
        }
        return !this._hasRecentHeartbeatReply(CONNECTION_HEALTH_RTC_FAILURE_GRACE_MS);
    }

    _isDataChannelOpen(conn) {
        if (!conn || !conn.dataChannel) {
            return false;
        }
        const readyState = String(conn.dataChannel.readyState || "").trim().toLowerCase();
        return readyState === "open";
    }

    _hasRecentHeartbeatReply(maxAgeMs) {
        if (!(this.lastHeartbeatReplyAt > 0)) {
            return false;
        }
        return (Date.now() - this.lastHeartbeatReplyAt) < Math.max(0, Number(maxAgeMs) || 0);
    }

    _getTransportIssue(conn) {
        if (!conn) {
            return null;
        }
        const dataChannel = conn.dataChannel;
        if (dataChannel) {
            const readyState = String(dataChannel.readyState || "").trim().toLowerCase();
            if (readyState === "closing" || readyState === "closed") {
                return {
                    source: "data",
                    state: readyState
                };
            }
        }
        const peerConnection = conn.peerConnection;
        if (!peerConnection) {
            return null;
        }
        const connectionState = String(peerConnection.connectionState || "").trim().toLowerCase();
        if (
            connectionState === "failed"
            || connectionState === "closed"
            || connectionState === "disconnected"
        ) {
            return {
                source: "rtc",
                state: connectionState
            };
        }
        const iceConnectionState = String(peerConnection.iceConnectionState || "").trim().toLowerCase();
        if (
            iceConnectionState === "failed"
            || iceConnectionState === "closed"
            || iceConnectionState === "disconnected"
        ) {
            return {
                source: "ice",
                state: iceConnectionState
            };
        }
        return null;
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
            if (this.pendingIncomingCall !== call) {
                return;
            }
            this.pendingIncomingCall = null;
            this._setRemoteMediaStream(null, { hasVideoTrack: false });
            this._stopLocalMedia();
            if (this.handlers.onCallState) {
                this.handlers.onCallState({ state: "idle", incoming: true });
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
            const isCurrentCall = this.mediaCall === call;
            if (!isCurrentCall) {
                return;
            }
            this.mediaCall = null;
            this._setRemoteMediaStream(null, { hasVideoTrack: false });
            this._stopLocalMedia();
            if (this.handlers.onCallState) {
                this.handlers.onCallState({ state: "idle", incoming: Boolean(options.incoming) });
            }
        });

        call.on("error", (error) => {
            this._emitError(error, {
                source: "call",
                code: "media-call-error",
                peerId: call.peer,
                phase: "runtime"
            });
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
        this._stopStreamTracks(this.localMediaStream);
        this.localMediaStream = null;
        if (this.handlers.onLocalStream) {
            this.handlers.onLocalStream(null, { hasVideoTrack: false, requestedVideo: false });
        }
    }

    _stopStreamTracks(stream) {
        if (!stream || typeof stream.getTracks !== "function") {
            return;
        }
        stream.getTracks().forEach((track) => {
            try {
                track.stop();
            } catch (_error) {
                // Ignore stop errors.
            }
        });
    }

    _createTransferId() {
        return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }

    _pause(ms) {
        return new Promise((resolve) => {
            window.setTimeout(resolve, ms);
        });
    }

    _waitForDataChannelDrain(timeoutMs, thresholdBytes) {
        const activeConn = this.connection;
        if (!activeConn || !activeConn.open) {
            return Promise.resolve();
        }
        const channel = activeConn.dataChannel;
        if (!channel || typeof channel.bufferedAmount !== "number") {
            return this._pause(120);
        }

        const threshold = Math.max(0, Number(thresholdBytes) || 0);
        if (channel.bufferedAmount <= threshold) {
            return Promise.resolve();
        }

        const deadline = Date.now() + Math.max(300, Number(timeoutMs) || 0);
        return new Promise((resolve) => {
            const poll = () => {
                if (this.connection !== activeConn || !activeConn.open) {
                    resolve();
                    return;
                }
                if (channel.bufferedAmount <= threshold) {
                    resolve();
                    return;
                }
                if (Date.now() >= deadline) {
                    resolve();
                    return;
                }
                window.setTimeout(poll, 60);
            };
            poll();
        });
    }

    _emitError(error, context = {}) {
        const managedError = this._createManagedError(error, context);
        if (this.handlers.onError) {
            this.handlers.onError(managedError);
        }
        return managedError;
    }

    _createManagedError(error, context = {}) {
        const fallbackMessage = context.reason || context.message || "未知错误";
        const message = this._getErrorMessage(error, fallbackMessage);
        const managedError = new Error(message);
        managedError.name = error && error.name ? String(error.name) : "Error";
        managedError.source = context.source ? String(context.source) : "peer";
        managedError.code = context.code ? String(context.code) : "";
        managedError.phase = context.phase ? String(context.phase) : "";
        managedError.peerId = context.peerId
            ? String(context.peerId)
            : (this.connection && this.connection.peer ? String(this.connection.peer) : "");
        managedError.reason = context.reason ? String(context.reason) : message;
        managedError.recoverable = context.recoverable !== false;
        managedError.handledByConnectionClose = Boolean(context.handledByConnectionClose);
        managedError.raw = error || null;
        return managedError;
    }

    _getErrorMessage(error, fallbackMessage) {
        if (!error) {
            return String(fallbackMessage || "未知错误");
        }
        if (typeof error === "string") {
            return error;
        }
        if (error.message) {
            return String(error.message);
        }
        if (error.name) {
            return String(error.name);
        }
        try {
            return JSON.stringify(error);
        } catch (_error) {
            return String(fallbackMessage || error);
        }
    }
}

function encodePeerSignal(peerId) {
    const id = String(peerId || "").trim();
    if (!id) {
        throw new Error("peerId 为空，无法生成二维码。");
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("pairId");
    url.searchParams.delete("peerId");
    url.searchParams.set("pairId", id);
    return url.toString();
}

function decodePeerSignal(rawText) {
    const text = String(rawText || "").trim();
    if (text.startsWith(AIRCOPY_PEER_PREFIX)) {
        const peerId = text.slice(AIRCOPY_PEER_PREFIX.length).trim();
        if (!peerId) {
            throw new Error("二维码中的 peerId 为空。");
        }
        return peerId;
    }
    let parsedUrl = null;
    try {
        parsedUrl = new URL(text);
    } catch (error) {
        throw new Error("二维码内容不是 AirCopy Peer 信令。");
    }
    const peerId = String(
        parsedUrl.searchParams.get("pairId")
        || parsedUrl.searchParams.get("peerId")
        || ""
    ).trim();
    if (!peerId) {
        throw new Error("二维码中的 pairId 为空。");
    }
    return peerId;
}
