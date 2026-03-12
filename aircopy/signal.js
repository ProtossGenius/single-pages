/**
 * signal.js - Signal encoding/decoding for AirCopy peer discovery.
 */

const AIRCOPY_PEER_PREFIX = "AIRCOPYP1:";

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
