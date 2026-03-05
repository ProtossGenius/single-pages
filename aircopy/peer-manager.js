const AIRCOPY_PEER_PREFIX = "AIRCOPYP1:";
const FILE_CHUNK_SIZE = 60 * 1024;

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

        this.incomingTransfers = new Map();

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
                    kind
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

    async startVideoCall(constraints = { video: true, audio: true }) {
        if (!this.peer || !this.connection || !this.connection.open) {
            throw new Error("连接未建立，无法发起视频通话。");
        }
        const targetPeerId = this.connection.peer;
        if (!targetPeerId) {
            throw new Error("未找到对端 peerId。");
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this._setLocalMediaStream(stream);

        const call = this.peer.call(targetPeerId, stream, {
            metadata: {
                name: this.displayName,
                pid: this.persistentId
            }
        });
        this._attachMediaCall(call, { incoming: false });
        if (this.handlers.onCallState) {
            this.handlers.onCallState({ state: "calling", incoming: false });
        }
    }

    async acceptIncomingCall(constraints = { video: true, audio: true }) {
        if (!this.pendingIncomingCall) {
            throw new Error("当前没有可接听的视频通话。");
        }
        const call = this.pendingIncomingCall;
        this.pendingIncomingCall = null;
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this._setLocalMediaStream(stream);
        call.answer(stream);
        this._attachMediaCall(call, { incoming: true });
        if (this.handlers.onCallState) {
            this.handlers.onCallState({ state: "connecting", incoming: true });
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
        this._setRemoteMediaStream(null);
        this._stopLocalMedia();
        if (this.handlers.onCallState) {
            this.handlers.onCallState({ state: "idle", incoming: false });
        }
    }

    closeConnection() {
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
        this.hangupVideoCall();
        this.incomingTransfers.clear();
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
        });

        conn.on("data", (payload) => {
            this._onData(payload);
        });

        conn.on("close", () => {
            if (this.connection === conn) {
                this.connection = null;
                this.helloSent = false;
            }
            this.hangupVideoCall();
            this.incomingTransfers.clear();
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
        if (type === "file-start" || type === "file-chunk" || type === "file-end") {
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
            this.incomingTransfers.set(transferId, {
                id: transferId,
                kind: payload.kind === "voice" ? "voice" : "file",
                name: payload.name ? String(payload.name) : "文件",
                mime: payload.mime ? String(payload.mime) : "application/octet-stream",
                size: Math.max(0, Number(payload.size) || 0),
                totalChunks: Math.max(1, Number(payload.totalChunks) || 1),
                chunks: []
            });
            return;
        }

        const transfer = this.incomingTransfers.get(transferId);
        if (!transfer) {
            return;
        }

        if (payload.t === "file-chunk") {
            const chunkData = this._toArrayBuffer(payload.d);
            if (!chunkData) {
                return;
            }
            const seq = Math.max(0, Number(payload.seq) || 0);
            transfer.chunks[seq] = chunkData;

            if (this.handlers.onTransferProgress) {
                const receivedChunks = transfer.chunks.filter(Boolean).length;
                this.handlers.onTransferProgress({
                    transferId,
                    direction: "receive",
                    receivedChunks,
                    totalChunks: transfer.totalChunks,
                    kind: transfer.kind
                });
            }
            return;
        }

        if (payload.t === "file-end") {
            const ordered = [];
            for (let i = 0; i < transfer.totalChunks; i += 1) {
                const chunk = transfer.chunks[i];
                if (chunk) {
                    ordered.push(chunk);
                }
            }
            const blob = new Blob(ordered, { type: transfer.mime });
            this.incomingTransfers.delete(transferId);

            if (this.handlers.onFileReceived) {
                this.handlers.onFileReceived({
                    transferId,
                    kind: transfer.kind,
                    fileName: transfer.name,
                    mimeType: transfer.mime,
                    size: transfer.size,
                    blob
                });
            }
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
        if (this.mediaCall) {
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
            this._setRemoteMediaStream(stream);
            if (this.handlers.onCallState) {
                this.handlers.onCallState({ state: "connected", incoming: Boolean(options.incoming) });
            }
        });

        call.on("close", () => {
            if (this.mediaCall === call) {
                this.mediaCall = null;
            }
            this._setRemoteMediaStream(null);
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

    _setLocalMediaStream(stream) {
        this._stopLocalMedia();
        this.localMediaStream = stream || null;
        if (this.handlers.onLocalStream) {
            this.handlers.onLocalStream(this.localMediaStream);
        }
    }

    _setRemoteMediaStream(stream) {
        this.remoteMediaStream = stream || null;
        if (this.handlers.onRemoteStream) {
            this.handlers.onRemoteStream(this.remoteMediaStream);
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
            this.handlers.onLocalStream(null);
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
