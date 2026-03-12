/**
 * media-call.js - Video/audio call management.
 *
 * Handles starting, accepting, rejecting, and hanging up video/audio calls.
 * Manages local/remote media streams.
 *
 * Depends on: peer-connection.js
 */

class MediaCallManager {
    /**
     * @param {Peer} peer - PeerJS Peer instance
     * @param {object} handlers - Callback handlers
     * @param {object} localInfo - { displayName, persistentId }
     */
    constructor(peer, handlers, localInfo) {
        this.peer = peer;
        this.handlers = handlers || {};
        this.localInfo = localInfo || {};

        this.pendingIncomingCall = null;
        this.mediaCall = null;
        this.localMediaStream = null;
        this.remoteMediaStream = null;
        this.activePeerId = "";
    }

    /**
     * Start a video call to a peer.
     * @param {PeerConnection} pc
     * @param {object} options
     */
    async startCall(pc, options) {
        options = options || {};
        if (!this.peer || !pc || !pc.isOpen()) {
            throw new Error("连接未建立，无法发起视频通话。");
        }
        const targetPeerId = pc.peerId;
        if (!targetPeerId) {
            throw new Error("未找到对端 peerId。");
        }
        const media = await this._createLocalMediaStream({
            showVideo: options.showVideo !== false,
            requireAudio: options.requireAudio !== false
        });
        this._setLocalMediaStream(media.stream, { hasVideoTrack: media.hasVideoTrack, requestedVideo: media.requestedVideo });
        this.activePeerId = targetPeerId;

        const call = this.peer.call(targetPeerId, media.stream, {
            metadata: {
                name: this.localInfo.displayName || "匿名用户",
                pid: this.localInfo.persistentId || "",
                videoEnabled: media.hasVideoTrack
            }
        });

        this._attachMediaCall(call, { incoming: false });
        if (this.handlers.onCallState) {
            this.handlers.onCallState({ state: "calling", incoming: false, hasVideoTrack: media.hasVideoTrack });
        }
    }

    /**
     * Accept a pending incoming call.
     */
    async acceptCall(options) {
        options = options || {};
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
        this.activePeerId = call.peer || "";

        call.answer(media.stream);
        this._attachMediaCall(call, { incoming: true });
        if (this.handlers.onCallState) {
            this.handlers.onCallState({ state: "connecting", incoming: true, hasVideoTrack: media.hasVideoTrack });
        }
    }

    /**
     * Reject a pending incoming call.
     */
    rejectCall() {
        if (!this.pendingIncomingCall) {
            return;
        }
        // Notify peer via data channel if possible (handled at higher level)
        this.pendingIncomingCall.close();
        this.pendingIncomingCall = null;
        if (this.handlers.onCallState) {
            this.handlers.onCallState({ state: "rejected", incoming: true });
        }
    }

    /**
     * Hang up the current call.
     */
    hangup(options) {
        options = options || {};

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
        this.activePeerId = "";
        if (this.handlers.onCallState) {
            this.handlers.onCallState({ state: "idle", incoming: false });
        }
    }

    /**
     * Handle an incoming PeerJS call.
     */
    onIncomingCall(call) {
        if (!call) {
            return;
        }
        if (this.mediaCall || this.pendingIncomingCall) {
            call.close();
            return;
        }
        this.pendingIncomingCall = call;
        this.activePeerId = call.peer || "";

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
            this.activePeerId = "";
            if (this.handlers.onCallState) {
                this.handlers.onCallState({ state: "idle", incoming: true });
            }
        });
    }

    /**
     * Cleanup when a peer disconnects.
     */
    onPeerDisconnected(peerId) {
        if (this.activePeerId && this.activePeerId === peerId) {
            this.hangup({ notifyPeer: false });
        }
    }

    /**
     * Update peer reference (when PeerManager re-inits).
     */
    setPeer(peer) {
        this.peer = peer;
    }

    // ── Private ──

    _attachMediaCall(call, options) {
        options = options || {};
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
            if (this.mediaCall !== call) {
                return;
            }
            this.mediaCall = null;
            this._setRemoteMediaStream(null, { hasVideoTrack: false });
            this._stopLocalMedia();
            this.activePeerId = "";
            if (this.handlers.onCallState) {
                this.handlers.onCallState({ state: "idle", incoming: Boolean(options.incoming) });
            }
        });

        call.on("error", (error) => {
            if (this.handlers.onError) {
                this.handlers.onError(error, {
                    source: "call",
                    code: "media-call-error",
                    peerId: call.peer,
                    phase: "runtime"
                });
            }
            if (this.handlers.onCallState) {
                this.handlers.onCallState({ state: "error", incoming: Boolean(options.incoming) });
            }
        });
    }

    async _createLocalMediaStream(options) {
        options = options || {};
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
            return stream.getVideoTracks()[0] || null;
        } catch (_error) {
            return null;
        }
    }

    _setLocalMediaStream(stream, info) {
        info = info || {};
        this._stopLocalMedia();
        this.localMediaStream = stream || null;
        if (this.handlers.onLocalStream) {
            this.handlers.onLocalStream(this.localMediaStream, {
                hasVideoTrack: Boolean(info.hasVideoTrack),
                requestedVideo: Boolean(info.requestedVideo)
            });
        }
    }

    _setRemoteMediaStream(stream, info) {
        info = info || {};
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
            } catch (_error) {}
        });
    }
}
