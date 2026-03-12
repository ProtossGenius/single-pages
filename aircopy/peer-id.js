/**
 * peer-id.js - Stable PeerJS peerId generation and persistence.
 *
 * Generates a stable peerId on first visit, stored in localStorage.
 * Format: `aircopy-{random12hex}` (valid PeerJS id).
 * The existing `persistentId` mechanism for cross-device identity is separate.
 */

const PEER_ID_STORAGE_KEY = "aircopy.peer.id.v1";

function getOrCreatePeerId() {
    let peerId = "";
    try {
        peerId = String(localStorage.getItem(PEER_ID_STORAGE_KEY) || "").trim();
    } catch (_error) {
        // Ignore storage failures.
    }
    if (peerId && isValidPeerId(peerId)) {
        return peerId;
    }
    peerId = generatePeerId();
    try {
        localStorage.setItem(PEER_ID_STORAGE_KEY, peerId);
    } catch (_error) {
        // Continue with runtime-only id.
    }
    return peerId;
}

function getPeerId() {
    try {
        return String(localStorage.getItem(PEER_ID_STORAGE_KEY) || "").trim();
    } catch (_error) {
        return "";
    }
}

function generatePeerId() {
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
        const bytes = new Uint8Array(12);
        window.crypto.getRandomValues(bytes);
        let hex = "";
        for (let i = 0; i < bytes.length; i += 1) {
            hex += bytes[i].toString(16).padStart(2, "0");
        }
        return `aircopy-${hex}`;
    }
    return `aircopy-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function isValidPeerId(peerId) {
    if (!peerId || typeof peerId !== "string") {
        return false;
    }
    // PeerJS ids must be alphanumeric with dashes/underscores
    return /^[a-zA-Z0-9_-]+$/.test(peerId) && peerId.length >= 8;
}
