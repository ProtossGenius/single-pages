/**
 * peer-manager.js - Orchestrator managing multiple PeerConnection instances.
 *
 * Key changes vs original:
 * - No single `this.connection` - uses Map<peerId, PeerConnection>
 * - sendText(peerId, text) requires explicit target
 * - getStatus(peerId) returns per-peer status
 * - Incoming connections automatically create a PeerConnection and add to map
 * - Uses stable peerId from peer-id.js
 *
 * Depends on: peer-id.js, peer-connection.js, file-transfer.js, media-call.js, signal.js, utils.js
 */

class PeerManager {
    constructor(handlers = {}) {
        this.handlers = handlers;
        this.peer = null;
        this.localPeerId = "";
        this.displayName = "匿名用户";
        this.persistentId = "";

        /** @type {Map<string, PeerConnection>} */
        this.connections = new Map();

        // File transfer state (managed by FileTransferManager)
        this.fileTransfer = null;

        // Media call state (managed by MediaCallManager)
        this.mediaCallManager = null;
    }

    async init(displayName) {
        this.displayName = displayName || "匿名用户";
        this.destroy();

        const storedPeerId = getOrCreatePeerId();

        return new Promise((resolve, reject) => {
            const peer = new Peer(storedPeerId, {
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
                this._onIncomingConnection(conn);
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

    connect(targetPeerId, options) {
        options = options || {};
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

        const existing = this.connections.get(remoteId);
        if (!options.force && existing && existing.isOpen()) {
            return {
                reused: true,
                peerId: remoteId,
                peerName: existing.remoteDisplayName,
                peerPersistentId: existing.remotePersistentId
            };
        }

        // Close existing connection if forcing reconnect
        if (existing) {
            existing.close();
            this.connections.delete(remoteId);
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

    disconnect(peerId) {
        const id = String(peerId || "").trim();
        const pc = this.connections.get(id);
        if (pc) {
            pc.close();
            this.connections.delete(id);
        }
    }

    destroy() {
        // Close all connections
        for (const [id, pc] of this.connections) {
            pc.close();
        }
        this.connections.clear();

        // Cleanup media call
        if (this.mediaCallManager) {
            this.mediaCallManager.hangup();
        }

        // Cleanup file transfers
        if (this.fileTransfer) {
            this.fileTransfer.resetAll();
        }

        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.localPeerId = "";
    }

    // ── Query methods ──

    getConnection(peerId) {
        return this.connections.get(String(peerId || "").trim()) || null;
    }

    getConnectionByPersistentId(pid) {
        const normalizedPid = String(pid || "").trim();
        if (!normalizedPid) {
            return null;
        }
        for (const [, pc] of this.connections) {
            if (pc.remotePersistentId === normalizedPid) {
                return pc;
            }
        }
        return null;
    }

    getAllConnections() {
        return Array.from(this.connections.values());
    }

    getStatus(peerId) {
        const pc = this.getConnection(peerId);
        if (!pc) {
            return "offline";
        }
        return pc.status;
    }

    isPeerConnected(targetPeerId) {
        const pc = this.getConnection(targetPeerId);
        return Boolean(pc && pc.isOpen());
    }

    hasAnyConnection() {
        for (const [, pc] of this.connections) {
            if (pc.isOpen()) {
                return true;
            }
        }
        return false;
    }

    isSignalingConnected() {
        return Boolean(
            this.peer
            && !this.peer.destroyed
            && !this.peer.disconnected
            && this.localPeerId
        );
    }

    // ── Delegating methods ──

    sendText(peerId, text) {
        const pc = this._getConnectionOrThrow(peerId);
        pc.sendText(text);
    }

    async sendFile(peerId, file, options) {
        const pc = this._getConnectionOrThrow(peerId);
        if (!this.fileTransfer) {
            throw new Error("文件传输模块未初始化。");
        }
        return this.fileTransfer.sendFile(pc, file, options);
    }

    acceptIncomingFile(transferId, options) {
        if (!this.fileTransfer) {
            throw new Error("文件传输模块未初始化。");
        }
        this.fileTransfer.acceptIncomingFile(transferId, options);
    }

    rejectIncomingFile(transferId, reason) {
        if (!this.fileTransfer) {
            return;
        }
        this.fileTransfer.rejectIncomingFile(transferId, reason);
    }

    setIncomingFileWritable(transferId, writable) {
        if (!this.fileTransfer) {
            return;
        }
        this.fileTransfer.setIncomingFileWritable(transferId, writable);
    }

    async startVideoCall(peerId, options) {
        if (!this.mediaCallManager) {
            throw new Error("视频通话模块未初始化。");
        }
        const pc = this._getConnectionOrThrow(peerId);
        return this.mediaCallManager.startCall(pc, options);
    }

    async acceptIncomingCall(options) {
        if (!this.mediaCallManager) {
            throw new Error("视频通话模块未初始化。");
        }
        return this.mediaCallManager.acceptCall(options);
    }

    rejectIncomingCall() {
        if (this.mediaCallManager) {
            this.mediaCallManager.rejectCall();
        }
    }

    hangupVideoCall(options) {
        if (this.mediaCallManager) {
            this.mediaCallManager.hangup(options);
        }
    }

    setDisplayName(name) {
        this.displayName = name || "匿名用户";
        // Update localInfo on all connections
        for (const [, pc] of this.connections) {
            pc.localInfo.displayName = this.displayName;
        }
    }

    setPersistentId(id) {
        this.persistentId = String(id || "").trim();
        for (const [, pc] of this.connections) {
            pc.localInfo.persistentId = this.persistentId;
        }
    }

    // ── Backward compat: setActivePeer is a no-op (removed concept) ──
    setActivePeer(_targetPeerId) {
        // No-op: all connections are independently managed now.
        // Kept for backward compatibility during migration.
        return true;
    }

    // ── Internal ──

    _getConnectionOrThrow(peerId) {
        const id = String(peerId || "").trim();
        const pc = this.connections.get(id);
        if (!pc || !pc.isOpen()) {
            throw new Error("连接未建立。");
        }
        return pc;
    }

    _onIncomingConnection(conn) {
        if (!conn) {
            return;
        }
        this._attachConnection(conn, true);
    }

    _attachConnection(conn, isIncoming) {
        if (!conn) {
            return;
        }
        const peerId = String(conn.peer || "").trim();
        if (!peerId) {
            return;
        }

        const localInfo = {
            displayName: this.displayName,
            persistentId: this.persistentId
        };

        const self = this;
        const handlers = {
            onMessage: function(msg) {
                if (self.handlers.onMessage) {
                    self.handlers.onMessage(msg);
                }
            },
            onHeartbeat: function(info) {
                if (self.handlers.onHeartbeat) {
                    self.handlers.onHeartbeat(info);
                }
            },
            onPeerStatusChange: function(payload) {
                if (self.handlers.onHeartbeatStatus) {
                    self.handlers.onHeartbeatStatus(payload);
                }
            },
            onTransferPayload: function(payload, pc) {
                if (self.fileTransfer) {
                    self.fileTransfer.onTransferPayload(payload, pc);
                }
            },
            onCallHangup: function(pc) {
                if (self.mediaCallManager) {
                    self.mediaCallManager.hangup({ notifyPeer: false });
                }
            },
            onConnectionClosed: function(info) {
                const closedPeerId = info && info.peerId ? String(info.peerId) : peerId;
                self.connections.delete(closedPeerId);

                // Cleanup file transfers for this peer
                if (self.fileTransfer) {
                    self.fileTransfer.onPeerDisconnected(closedPeerId);
                }

                // Cleanup media call if it was with this peer
                if (self.mediaCallManager) {
                    self.mediaCallManager.onPeerDisconnected(closedPeerId);
                }

                if (self.handlers.onConnectionClosed) {
                    const closeError = self._createManagedError(null, {
                        source: info.source || "connection",
                        code: info.code || "closed",
                        phase: "runtime",
                        peerId: closedPeerId,
                        reason: info.reason || "连接已断开"
                    });
                    self.handlers.onConnectionClosed({
                        reason: info.reason || "连接已断开",
                        peerId: closedPeerId,
                        error: closeError
                    });
                }
            }
        };

        const pc = new PeerConnection(peerId, conn, handlers, localInfo);

        conn.on("open", () => {
            // Store in map on open
            self.connections.set(peerId, pc);
            pc.installHealthWatch();
            pc.sendHello();
            pc.startHeartbeat();

            if (self.handlers.onConnected) {
                self.handlers.onConnected({
                    peerId,
                    isIncoming,
                    peerName: (conn.metadata && conn.metadata.name) ? String(conn.metadata.name) : "",
                    peerPersistentId: isIncoming && conn.metadata && conn.metadata.pid ? String(conn.metadata.pid) : ""
                });
            }
        });

        conn.on("data", function(payload) {
            pc.onData(payload);
        });

        conn.on("close", function() {
            pc._handleConnectionClosed("连接已断开", {
                source: "data",
                code: "closed"
            });
        });

        conn.on("error", function(error) {
            self._emitError(error, {
                source: "data",
                code: "connection-error",
                peerId: peerId,
                phase: "runtime"
            });
        });
    }

    _onIncomingCall(call) {
        if (!call) {
            return;
        }
        if (this.mediaCallManager) {
            this.mediaCallManager.onIncomingCall(call);
        }
    }

    _emitError(error, context) {
        context = context || {};
        const managedError = this._createManagedError(error, context);
        if (this.handlers.onError) {
            this.handlers.onError(managedError);
        }
        return managedError;
    }

    _createManagedError(error, context) {
        context = context || {};
        const fallbackMessage = context.reason || context.message || "未知错误";
        const message = this._getErrorMessage(error, fallbackMessage);
        const managedError = new Error(message);
        managedError.name = error && error.name ? String(error.name) : "Error";
        managedError.source = context.source ? String(context.source) : "peer";
        managedError.code = context.code ? String(context.code) : "";
        managedError.phase = context.phase ? String(context.phase) : "";
        managedError.peerId = context.peerId ? String(context.peerId) : "";
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
