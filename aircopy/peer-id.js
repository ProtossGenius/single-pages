/**
 * peer-id.js - Stable PeerJS peerId generation and persistence.
 *
 * Generates a stable peerId on first visit, stored in localStorage.
 * Format: `AirCopyXXXXXX`, where X is a digit or uppercase letter with
 * ambiguous characters such as 0/O/1/I/L removed.
 * The existing `persistentId` mechanism for cross-device identity is separate.
 */

const PEER_ID_STORAGE_KEY = "aircopy.peer.id.v1";
const PEER_ID_SHORTCUT_PREFIX = "AirCopy";
const PEER_ID_SHORTCUT_LENGTH = 6;
const PEER_ID_SHORTCUT_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function getOrCreatePeerId() {
    let peerId = "";
    try {
        peerId = String(localStorage.getItem(PEER_ID_STORAGE_KEY) || "").trim();
    } catch (_error) {
        // Ignore storage failures.
    }
    if (peerId && getShortcutCodeFromPeerId(peerId)) {
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
    return createPeerIdFromShortcutCode(generateShortcutCode());
}

function generateShortcutCode() {
    const alphabet = PEER_ID_SHORTCUT_ALPHABET;
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
        const bytes = new Uint8Array(PEER_ID_SHORTCUT_LENGTH);
        window.crypto.getRandomValues(bytes);
        let code = "";
        for (let i = 0; i < bytes.length; i += 1) {
            code += alphabet[bytes[i] % alphabet.length];
        }
        return code;
    }
    let fallback = "";
    for (let i = 0; i < PEER_ID_SHORTCUT_LENGTH; i += 1) {
        const index = Math.floor(Math.random() * alphabet.length);
        fallback += alphabet[index];
    }
    return fallback;
}

function sanitizeShortcutCodeInput(value, maxLength) {
    const compact = String(value || "").toUpperCase().replace(/[\s-]+/g, "");
    const prefix = PEER_ID_SHORTCUT_PREFIX.toUpperCase();
    const raw = compact.indexOf(prefix) === 0 ? compact.slice(prefix.length) : compact;
    const limit = Math.max(1, Number(maxLength) || PEER_ID_SHORTCUT_LENGTH);
    let result = "";
    for (let i = 0; i < raw.length; i += 1) {
        const char = raw.charAt(i);
        if (PEER_ID_SHORTCUT_ALPHABET.indexOf(char) >= 0) {
            result += char;
        }
        if (result.length >= limit) {
            break;
        }
    }
    return result;
}

function normalizeShortcutCode(value) {
    const code = sanitizeShortcutCodeInput(value, PEER_ID_SHORTCUT_LENGTH);
    return code.length === PEER_ID_SHORTCUT_LENGTH ? code : "";
}

function createPeerIdFromShortcutCode(shortcutCode) {
    const normalized = normalizeShortcutCode(shortcutCode);
    if (!normalized) {
        throw new Error("快捷码格式无效，应为 6 位数字/大写字母（已排除 0/O/1/I/L）。");
    }
    return `${PEER_ID_SHORTCUT_PREFIX}${normalized}`;
}

function getShortcutCodeFromPeerId(peerId) {
    const value = String(peerId || "").trim();
    if (!value || value.indexOf(PEER_ID_SHORTCUT_PREFIX) !== 0) {
        return "";
    }
    const code = value.slice(PEER_ID_SHORTCUT_PREFIX.length);
    return normalizeShortcutCode(code);
}

function isValidShortcutCode(value) {
    return normalizeShortcutCode(value) === String(value || "").trim().toUpperCase();
}

function getShortcutPeerPrefix() {
    return PEER_ID_SHORTCUT_PREFIX;
}

function getShortcutCodeHint() {
    return `${PEER_ID_SHORTCUT_LENGTH} 位数字/大写字母（已排除 0/O/1/I/L）`;
}

function isValidPeerId(peerId) {
    if (!peerId || typeof peerId !== "string") {
        return false;
    }
    // PeerJS ids must be alphanumeric with dashes/underscores
    return /^[a-zA-Z0-9_-]+$/.test(peerId) && peerId.length >= 8;
}
