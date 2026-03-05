const AIRCOPY_ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" }
];

const AIRCOPY_SIGNAL_PREFIX = "AIRCOPY1:";
const AIRCOPY_CODEC_LZ = "L";
const AIRCOPY_CODEC_DEFLATE = "D";

class WebRTCManager {
    constructor(handlers = {}) {
        this.handlers = handlers;
        this.peerConnection = null;
        this.dataChannel = null;
        this.helloSent = false;
    }

    async createOffer(displayName) {
        this._createPeerConnection({ initiator: true });
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        await this._waitIceGathering();

        return {
            t: "offer",
            n: displayName,
            s: this._compactSdp(this.peerConnection.localDescription.sdp)
        };
    }

    async createAnswerFromOffer(offerSignal, displayName) {
        this._createPeerConnection({ initiator: false });
        await this.peerConnection.setRemoteDescription({
            type: "offer",
            sdp: offerSignal.s
        });

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        await this._waitIceGathering();

        return {
            t: "answer",
            n: displayName,
            s: this._compactSdp(this.peerConnection.localDescription.sdp)
        };
    }

    async acceptAnswer(answerSignal) {
        if (!this.peerConnection) {
            throw new Error("当前没有可用的 offer 会话。");
        }
        await this.peerConnection.setRemoteDescription({
            type: "answer",
            sdp: answerSignal.s
        });
    }

    sendText(text) {
        if (!this.dataChannel || this.dataChannel.readyState !== "open") {
            throw new Error("数据通道未连接。");
        }
        this.dataChannel.send(JSON.stringify({ t: "text", b: text }));
    }

    close() {
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        this.helloSent = false;
    }

    _createPeerConnection({ initiator }) {
        this.close();
        this.peerConnection = new RTCPeerConnection({ iceServers: AIRCOPY_ICE_SERVERS });

        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            if (this.handlers.onConnectionStateChange) {
                this.handlers.onConnectionStateChange(state);
            }
            if (state === "connected" && this.handlers.onConnected) {
                this.handlers.onConnected();
            }
            if (state === "failed" && this.handlers.onFailed) {
                this.handlers.onFailed();
            }
        };

        this.peerConnection.ondatachannel = (event) => {
            this._setupDataChannel(event.channel);
        };

        if (initiator) {
            const channel = this.peerConnection.createDataChannel("aircopy-chat");
            this._setupDataChannel(channel);
        }
    }

    _setupDataChannel(channel) {
        this.dataChannel = channel;

        channel.onopen = () => {
            if (!this.helloSent) {
                this.helloSent = true;
                channel.send(JSON.stringify({ t: "hello", b: "hello world" }));
                if (this.handlers.onMessage) {
                    this.handlers.onMessage({
                        from: "me",
                        type: "hello",
                        body: "hello world"
                    });
                }
            }
            if (this.handlers.onChannelOpen) {
                this.handlers.onChannelOpen();
            }
        };

        channel.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (this.handlers.onMessage) {
                    this.handlers.onMessage({
                        from: "peer",
                        type: payload.t || "text",
                        body: payload.b || ""
                    });
                }
            } catch (_error) {
                if (this.handlers.onMessage) {
                    this.handlers.onMessage({
                        from: "peer",
                        type: "text",
                        body: event.data
                    });
                }
            }
        };
    }

    _waitIceGathering() {
        if (!this.peerConnection) {
            return Promise.resolve();
        }
        if (this.peerConnection.iceGatheringState === "complete") {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                resolve();
            }, 6000);

            const onChange = () => {
                if (this.peerConnection.iceGatheringState === "complete") {
                    clearTimeout(timer);
                    this.peerConnection.removeEventListener("icegatheringstatechange", onChange);
                    resolve();
                }
            };
            this.peerConnection.addEventListener("icegatheringstatechange", onChange);
        });
    }

    _compactSdp(sdp) {
        const lines = sdp.split("\r\n");
        const keptHostByMedia = new Set();
        let mediaIndex = -1;

        const compacted = lines.filter((line) => {
            if (!line) {
                return true;
            }
            if (line.startsWith("m=")) {
                mediaIndex += 1;
                return true;
            }
            if (!line.startsWith("a=candidate:")) {
                return true;
            }

            const typMatch = line.match(/ typ ([a-zA-Z0-9]+)/);
            const protocol = (line.split(" ")[2] || "").toLowerCase();
            if (protocol !== "udp") {
                return false;
            }

            const candidateType = typMatch ? typMatch[1] : "";
            if (candidateType === "srflx" || candidateType === "relay") {
                return true;
            }
            if (candidateType === "host") {
                const key = `m${mediaIndex}`;
                if (keptHostByMedia.has(key)) {
                    return false;
                }
                keptHostByMedia.add(key);
                return true;
            }
            return false;
        });

        return `${compacted.join("\r\n")}`;
    }
}

function encodeSignal(signal) {
    const raw = JSON.stringify(signal);
    const lzPayload = `${AIRCOPY_CODEC_LZ}${LZString.compressToEncodedURIComponent(raw)}`;
    let bestPayload = lzPayload;

    if (typeof pako !== "undefined") {
        try {
            const deflated = pako.deflate(raw, { level: 9 });
            const b64 = uint8ToBase64Url(deflated);
            const deflatePayload = `${AIRCOPY_CODEC_DEFLATE}${b64}`;
            if (deflatePayload.length < bestPayload.length) {
                bestPayload = deflatePayload;
            }
        } catch (_error) {
            // Ignore and keep LZ payload.
        }
    }

    return `${AIRCOPY_SIGNAL_PREFIX}${bestPayload}`;
}

function decodeSignal(rawText) {
    const text = String(rawText || "").trim();
    if (!text.startsWith(AIRCOPY_SIGNAL_PREFIX)) {
        throw new Error("二维码内容不是 AirCopy 信令。");
    }
    const payload = text.slice(AIRCOPY_SIGNAL_PREFIX.length);
    const raw = decodeSignalPayload(payload);
    const signal = JSON.parse(raw);
    if (!signal || !signal.t || !signal.s) {
        throw new Error("二维码信令格式无效。");
    }
    return signal;
}

function decodeSignalPayload(payload) {
    if (!payload) {
        throw new Error("二维码信令为空。");
    }

    const codec = payload[0];
    const body = payload.slice(1);

    if (codec === AIRCOPY_CODEC_DEFLATE) {
        if (typeof pako === "undefined") {
            throw new Error("当前页面缺少 Deflate 解压库。");
        }
        const bytes = base64UrlToUint8(body);
        return pako.inflate(bytes, { to: "string" });
    }

    if (codec === AIRCOPY_CODEC_LZ) {
        const lzRaw = LZString.decompressFromEncodedURIComponent(body);
        if (!lzRaw) {
            throw new Error("LZ 信令解压失败。");
        }
        return lzRaw;
    }

    // Backward compatibility with previous raw LZ payload (no codec prefix).
    const legacy = LZString.decompressFromEncodedURIComponent(payload);
    if (!legacy) {
        throw new Error("二维码信令解压失败。");
    }
    return legacy;
}

function uint8ToBase64Url(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToUint8(str) {
    const normalized = str.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + "=".repeat(padLength);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
