/**
 * peer-connection.js - Per-peer connection wrapper with independent heartbeat and status tracking.
 *
 * Each PeerConnection instance wraps a single PeerJS DataConnection to one remote peer,
 * managing its own heartbeat loop, online/away/offline status, and data routing.
 */

const HEARTBEAT_INTERVAL_MS = 5000;
const HEARTBEAT_AWAY_MISS_COUNT = 3;
const HEARTBEAT_OFFLINE_MISS_COUNT = 5;
const CONNECTION_HEALTH_RECHECK_DELAY_MS = 3000;
const CONNECTION_HEALTH_RECHECK_RTC_DELAY_MS = 30 * 1000;
const CONNECTION_HEALTH_RECHECK_HIDDEN_DELAY_MS = 90 * 1000;
const CONNECTION_HEALTH_RTC_FAILURE_GRACE_MS = 90 * 1000;

class PeerConnection {
    /**
     * @param {string} peerId - Remote peer's PeerJS id
     * @param {DataConnection} conn - PeerJS DataConnection
     * @param {object} handlers - Callback handlers
     * @param {object} localInfo - Local peer info { displayName, persistentId }
     */
    constructor(peerId, conn, handlers, localInfo) {
        this.peerId = peerId;
        this.conn = conn;
        this.handlers = handlers || {};
        this.localInfo = localInfo || {};

        this.remotePersistentId = "";
        this.remoteDisplayName = "";
        this.status = "online";
        this.helloSent = false;

        // Per-peer heartbeat state
        this.heartbeatTimer = null;
        this.lastHeartbeatReplyAt = 0;
        this.heartbeatSequence = 0;
        this.pendingHeartbeatId = "";
        this.heartbeatDueAt = 0;
        this.heartbeatMissCount = 0;

        // Connection health monitoring
        this.connectionHealthCleanup = null;
        this.connectionHealthCheckTimer = null;
    }

    isOpen() {
        return Boolean(this.conn && this.conn.open);
    }

    send(payload) {
        if (!this.conn || !this.conn.open) {
            throw new Error("连接未建立。");
        }
        this.conn.send(payload);
    }

    sendIfConnected(payload) {
        if (!this.conn || !this.conn.open) {
            return false;
        }
        try {
            this.conn.send(payload);
            return true;
        } catch (error) {
            return false;
        }
    }

    sendText(text) {
        this.send({
            t: "text",
            b: text,
            name: this.localInfo.displayName || "匿名用户",
            pid: this.localInfo.persistentId || ""
        });
    }

    sendHello() {
        if (!this.conn || !this.conn.open || this.helloSent) {
            return;
        }
        this.helloSent = true;
        this.conn.send({
            t: "hello",
            b: "hello",
            name: this.localInfo.displayName || "匿名用户",
            pid: this.localInfo.persistentId || ""
        });
    }

    // ── Heartbeat ──

    startHeartbeat() {
        this.stopHeartbeat();
        const now = Date.now();
        this.lastHeartbeatReplyAt = now;
        this.heartbeatMissCount = 0;
        this._setStatus("online");
        this._sendHeartbeat();
        this._scheduleHeartbeatTick();
    }

    stopHeartbeat() {
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
        if (!this.isOpen()) {
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
        if (!this.isOpen()) {
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

    _sendHeartbeat() {
        if (!this.isOpen()) {
            return;
        }

        const now = Date.now();

        if (this.pendingHeartbeatId) {
            this.heartbeatMissCount += 1;
            if (this.heartbeatMissCount >= HEARTBEAT_OFFLINE_MISS_COUNT) {
                this._handleConnectionClosed("心跳超时 25 秒未响应，连接已断开", {
                    source: "heartbeat",
                    code: "timeout"
                });
                return;
            }
            if (this.heartbeatMissCount >= HEARTBEAT_AWAY_MISS_COUNT && this.status !== "away") {
                this._setStatus("away");
            }
        }

        this.heartbeatSequence += 1;
        const heartbeatId = `hb${now.toString(36)}${this.heartbeatSequence.toString(36)}`;
        try {
            this.conn.send({
                t: "heartbeat",
                id: heartbeatId,
                ts: now,
                name: this.localInfo.displayName || "匿名用户",
                pid: this.localInfo.persistentId || ""
            });
        } catch (error) {
            this._handleConnectionClosed("心跳发送失败，连接已断开", {
                source: "heartbeat",
                code: "send-failed"
            });
            return;
        }
        this.pendingHeartbeatId = heartbeatId;
        this.heartbeatDueAt = now + HEARTBEAT_INTERVAL_MS;
    }

    _handleIncomingHeartbeat(payload) {
        const heartbeatId = payload && payload.id ? String(payload.id) : "";
        if (this.conn && this.conn.open) {
            try {
                this.conn.send({
                    t: "heartbeat-ack",
                    id: heartbeatId,
                    ts: Date.now()
                });
            } catch (_error) {
                // Ignore ACK send failure.
            }
        }
        this._markHeartbeatResponse();
        if (this.handlers.onHeartbeat) {
            this.handlers.onHeartbeat({
                id: heartbeatId,
                peerId: this.peerId,
                timestamp: payload && payload.ts ? Number(payload.ts) : Date.now()
            });
        }
    }

    _handleHeartbeatAck(payload) {
        this._markHeartbeatResponse();
    }

    _markHeartbeatResponse(now) {
        now = now || Date.now();
        this.lastHeartbeatReplyAt = now;
        this.heartbeatMissCount = 0;
        this.pendingHeartbeatId = "";
        this.heartbeatDueAt = now + HEARTBEAT_INTERVAL_MS;
        if (this.status !== "online") {
            this._setStatus("online");
        }
    }

    _setStatus(status) {
        const prev = this.status;
        this.status = status;
        if (prev !== status && this.handlers.onPeerStatusChange) {
            this.handlers.onPeerStatusChange({
                peerId: this.peerId,
                status,
                missCount: this.heartbeatMissCount,
                lastReplyAt: this.lastHeartbeatReplyAt
            });
        }
    }

    // ── Data handling ──

    onData(rawPayload) {
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

        // File transfer and call-hangup are delegated to handlers
        if (type === "file-start" || type === "file-chunk" || type === "file-end" || type === "file-ack") {
            if (this.handlers.onTransferPayload) {
                this.handlers.onTransferPayload(payload, this);
            }
            return;
        }
        if (type === "call-hangup") {
            if (this.handlers.onCallHangup) {
                this.handlers.onCallHangup(this);
            }
            return;
        }

        // Text/hello messages
        const body = payload.b ? String(payload.b) : "";
        const name = payload.name ? String(payload.name) : "";
        const persistentId = payload.pid ? String(payload.pid) : "";
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
                peerId: this.peerId
            });
        }
    }

    // ── Connection health monitoring ──

    installHealthWatch() {
        this.clearHealthWatch();
        const conn = this.conn;
        if (!conn) {
            return;
        }
        const cleanups = [];
        const bindEvent = (target, eventName, handler) => {
            if (!target || typeof target.addEventListener !== "function") {
                return;
            }
            target.addEventListener(eventName, handler);
            cleanups.push(() => {
                try {
                    target.removeEventListener(eventName, handler);
                } catch (_error) {}
            });
        };

        const peerConnection = conn.peerConnection;
        if (peerConnection) {
            const onConnectionStateChange = () => {
                this._observeTransportState("rtc", peerConnection.connectionState);
            };
            const onIceConnectionStateChange = () => {
                this._observeTransportState("ice", peerConnection.iceConnectionState);
            };
            bindEvent(peerConnection, "connectionstatechange", onConnectionStateChange);
            bindEvent(peerConnection, "iceconnectionstatechange", onIceConnectionStateChange);
            onConnectionStateChange();
            onIceConnectionStateChange();
        }

        const dataChannel = conn.dataChannel;
        if (dataChannel) {
            const onDataChannelStateChange = () => {
                this._observeTransportState("data", dataChannel.readyState);
            };
            const onDataChannelClose = () => {
                this._observeTransportState("data", "closed");
            };
            bindEvent(dataChannel, "closing", onDataChannelStateChange);
            bindEvent(dataChannel, "close", onDataChannelClose);
            onDataChannelStateChange();
        }

        const onVisibilityChange = () => {
            if (typeof document === "undefined" || document.hidden) {
                return;
            }
            const issue = this._getTransportIssue();
            if (issue) {
                this._scheduleHealthRecheck(issue.source, issue.state);
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

    clearHealthWatch() {
        if (this.connectionHealthCheckTimer !== null) {
            window.clearTimeout(this.connectionHealthCheckTimer);
            this.connectionHealthCheckTimer = null;
        }
        if (typeof this.connectionHealthCleanup === "function") {
            try {
                this.connectionHealthCleanup();
            } catch (_error) {}
        }
        this.connectionHealthCleanup = null;
    }

    _observeTransportState(source, state) {
        const normalizedState = String(state || "").trim().toLowerCase();
        if (!normalizedState) {
            return;
        }
        if (normalizedState === "connected" || normalizedState === "completed" || normalizedState === "open") {
            if (this.connectionHealthCheckTimer !== null) {
                window.clearTimeout(this.connectionHealthCheckTimer);
                this.connectionHealthCheckTimer = null;
            }
            return;
        }
        const isHardFailure = normalizedState === "failed" || normalizedState === "closed";
        if (isHardFailure && source === "data") {
            this._handleConnectionClosed(`连接已断开（${source}:${normalizedState}）`, {
                source,
                code: normalizedState
            });
            return;
        }
        if (!isHardFailure && normalizedState !== "disconnected" && normalizedState !== "closing") {
            return;
        }
        if (this.connectionHealthCheckTimer !== null) {
            window.clearTimeout(this.connectionHealthCheckTimer);
        }
        this._scheduleHealthRecheck(source, normalizedState);
    }

    _resolveRecheckDelay(source, normalizedState) {
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

    _scheduleHealthRecheck(source, normalizedState, delayMs) {
        if (this.connectionHealthCheckTimer !== null) {
            window.clearTimeout(this.connectionHealthCheckTimer);
        }
        const recheckDelayMs = Math.max(
            0,
            Number.isFinite(Number(delayMs))
                ? Number(delayMs)
                : this._resolveRecheckDelay(source, normalizedState)
        );
        this.connectionHealthCheckTimer = window.setTimeout(() => {
            this.connectionHealthCheckTimer = null;
            const issue = this._getTransportIssue();
            if (!issue) {
                return;
            }
            if (!this._shouldCloseForIssue(issue)) {
                this._scheduleHealthRecheck(issue.source, issue.state);
                return;
            }
            this._handleConnectionClosed(`连接已断开（${source}:${normalizedState}）`, {
                source,
                code: normalizedState
            });
        }, recheckDelayMs);
    }

    _shouldCloseForIssue(issue) {
        if (!issue) {
            return false;
        }
        if (issue.source === "data") {
            return true;
        }
        if (issue.source !== "rtc" && issue.source !== "ice") {
            return true;
        }
        if (this._isDataChannelOpen() && this._hasRecentHeartbeatReply(CONNECTION_HEALTH_RTC_FAILURE_GRACE_MS)) {
            return false;
        }
        return !this._hasRecentHeartbeatReply(CONNECTION_HEALTH_RTC_FAILURE_GRACE_MS);
    }

    _isDataChannelOpen() {
        if (!this.conn || !this.conn.dataChannel) {
            return false;
        }
        return String(this.conn.dataChannel.readyState || "").trim().toLowerCase() === "open";
    }

    _hasRecentHeartbeatReply(maxAgeMs) {
        if (!(this.lastHeartbeatReplyAt > 0)) {
            return false;
        }
        return (Date.now() - this.lastHeartbeatReplyAt) < Math.max(0, Number(maxAgeMs) || 0);
    }

    _getTransportIssue() {
        if (!this.conn) {
            return null;
        }
        const dataChannel = this.conn.dataChannel;
        if (dataChannel) {
            const readyState = String(dataChannel.readyState || "").trim().toLowerCase();
            if (readyState === "closing" || readyState === "closed") {
                return { source: "data", state: readyState };
            }
        }
        const peerConnection = this.conn.peerConnection;
        if (!peerConnection) {
            return null;
        }
        const connectionState = String(peerConnection.connectionState || "").trim().toLowerCase();
        if (connectionState === "failed" || connectionState === "closed" || connectionState === "disconnected") {
            return { source: "rtc", state: connectionState };
        }
        const iceConnectionState = String(peerConnection.iceConnectionState || "").trim().toLowerCase();
        if (iceConnectionState === "failed" || iceConnectionState === "closed" || iceConnectionState === "disconnected") {
            return { source: "ice", state: iceConnectionState };
        }
        return null;
    }

    // ── Lifecycle ──

    _handleConnectionClosed(reasonText, options) {
        options = options || {};
        const finalReason = reasonText || "连接已断开";
        this.clearHealthWatch();
        this.stopHeartbeat();
        this._setStatus("offline");
        if (this.conn) {
            try {
                this.conn.close();
            } catch (_error) {}
        }
        if (this.handlers.onConnectionClosed) {
            this.handlers.onConnectionClosed({
                reason: finalReason,
                peerId: this.peerId,
                source: options.source || "connection",
                code: options.code || "closed"
            });
        }
    }

    close() {
        this.clearHealthWatch();
        this.stopHeartbeat();
        this.helloSent = false;
        this.remoteDisplayName = "";
        this.remotePersistentId = "";
        this._setStatus("offline");
        if (this.conn) {
            try {
                this.conn.close();
            } catch (_error) {}
            this.conn = null;
        }
    }
}
