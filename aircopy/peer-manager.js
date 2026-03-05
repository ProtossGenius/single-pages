const AIRCOPY_PEER_PREFIX = "AIRCOPYP1:";

class PeerManager {
    constructor(handlers = {}) {
        this.handlers = handlers;
        this.peer = null;
        this.connection = null;
        this.localPeerId = "";
        this.displayName = "匿名用户";
        this.helloSent = false;
        this.remoteDisplayName = "";
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
            metadata: { name: this.displayName }
        });
        this._attachConnection(conn, false);
    }

    sendText(text) {
        if (!this.connection || !this.connection.open) {
            throw new Error("连接未建立。");
        }
        this.connection.send({
            t: "text",
            b: text,
            name: this.displayName
        });
    }

    closeConnection() {
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
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

        conn.on("open", () => {
            if (this.handlers.onConnected) {
                this.handlers.onConnected({
                    peerId: conn.peer,
                    isIncoming,
                    peerName: this.remoteDisplayName
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
            name: this.displayName
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

        const body = payload && payload.b ? String(payload.b) : "";
        const type = payload && payload.t ? String(payload.t) : "text";
        const name = payload && payload.name ? String(payload.name) : "";
        if (name) {
            this.remoteDisplayName = name;
        }

        if (this.handlers.onMessage) {
            this.handlers.onMessage({
                from: "peer",
                type,
                body,
                name
            });
        }
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
