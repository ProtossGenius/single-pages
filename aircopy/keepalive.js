/**
 * keepalive.js - Background keepalive using silent audio loop and Visibility API.
 *
 * Prevents the browser from throttling timers/connections when the page is hidden.
 * Uses silent-loop.mp3 to keep an audio context active.
 * Auto-stops after a configurable idle timeout (default 10 minutes without heartbeat).
 */

class KeepAlive {
    constructor(options) {
        options = options || {};
        this.audioSrc = options.audioSrc || "./silent-loop.mp3";
        this.idleTimeoutMs = Math.max(60000, Number(options.idleTimeoutMs) || 10 * 60 * 1000);

        this._audio = null;
        this._running = false;
        this._lastActivityAt = 0;
        this._idleTimer = null;
        this._onVisibilityChange = this._onVisibilityChange.bind(this);
    }

    /**
     * Start keepalive. Called when a connection is established.
     */
    start() {
        if (this._running) {
            this.markActivity();
            return;
        }
        this._running = true;
        this._lastActivityAt = Date.now();

        if (typeof document !== "undefined") {
            document.addEventListener("visibilitychange", this._onVisibilityChange);
        }

        // Start audio immediately if page is hidden
        if (typeof document !== "undefined" && document.hidden) {
            this._startAudio();
        }

        this._scheduleIdleCheck();
    }

    /**
     * Stop keepalive. Called when all connections close.
     */
    stop() {
        this._running = false;
        this._stopAudio();
        this._clearIdleTimer();

        if (typeof document !== "undefined") {
            document.removeEventListener("visibilitychange", this._onVisibilityChange);
        }
    }

    /**
     * Mark activity (e.g., heartbeat received/sent) to reset the idle timer.
     */
    markActivity() {
        this._lastActivityAt = Date.now();
    }

    /**
     * Check if keepalive is currently active.
     */
    isRunning() {
        return this._running;
    }

    // ── Private ──

    _onVisibilityChange() {
        if (!this._running) {
            return;
        }
        if (typeof document !== "undefined" && document.hidden) {
            this._startAudio();
        } else {
            this._stopAudio();
        }
    }

    _startAudio() {
        if (this._audio) {
            return;
        }
        try {
            const audio = new Audio(this.audioSrc);
            audio.loop = true;
            audio.volume = 0.01; // near-silent but enough to keep audio context alive
            const playPromise = audio.play();
            if (playPromise && typeof playPromise.catch === "function") {
                playPromise.catch((_error) => {
                    // Autoplay blocked - this is expected on some browsers
                    // The keepalive will be less effective but won't crash
                });
            }
            this._audio = audio;
        } catch (_error) {
            // Audio creation failed - continue without keepalive audio
        }
    }

    _stopAudio() {
        if (!this._audio) {
            return;
        }
        try {
            this._audio.pause();
            this._audio.src = "";
            this._audio.load();
        } catch (_error) {
            // Ignore cleanup errors
        }
        this._audio = null;
    }

    _scheduleIdleCheck() {
        this._clearIdleTimer();
        if (!this._running) {
            return;
        }
        this._idleTimer = window.setTimeout(() => {
            this._idleTimer = null;
            if (!this._running) {
                return;
            }
            const elapsed = Date.now() - this._lastActivityAt;
            if (elapsed >= this.idleTimeoutMs) {
                // Idle timeout reached - stop keepalive
                this.stop();
                return;
            }
            this._scheduleIdleCheck();
        }, Math.min(60000, this.idleTimeoutMs / 2));
    }

    _clearIdleTimer() {
        if (this._idleTimer !== null) {
            window.clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }
    }
}
