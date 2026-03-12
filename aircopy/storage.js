/**
 * storage.js - localStorage helpers for chat state, node hints, logs, settings.
 *
 * Depends on: utils.js
 */

const CHAT_STORAGE_KEY = "aircopy.chat.state.v3";
const LEGACY_CHAT_STORAGE_KEY = "aircopy.chat.state.v2";
const SELF_ID_STORAGE_KEY = "aircopy.self.id.v1";
const NODE_HINT_STORAGE_KEY = "aircopy.node.hint.v1";
const CONNECTOR_MODE_STORAGE_KEY = "aircopy.connector.mode.v1";
const STATUS_LOG_MAX_STORAGE_KEY = "aircopy.status.log.max.v1";
const STATUS_LOG_STORAGE_KEY = "aircopy.status.logs.v1";

const CHAT_HISTORY_MAX = 300;
const STATUS_LOG_DEFAULT_MAX = 240;
const STATUS_LOG_MIN = 20;
const STATUS_LOG_HARD_MAX = 5000;

// ── Persistent ID ──

function ensureLocalPersistentId(appState) {
    let persistentId = "";
    try {
        persistentId = String(localStorage.getItem(SELF_ID_STORAGE_KEY) || "").trim();
    } catch (_error) {}
    if (!persistentId) {
        persistentId = createPersistentId();
        try {
            localStorage.setItem(SELF_ID_STORAGE_KEY, persistentId);
        } catch (_error) {}
    }
    appState.localPersistentId = persistentId;
}

function createPersistentId() {
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
        const bytes = new Uint8Array(12);
        window.crypto.getRandomValues(bytes);
        let hex = "";
        for (let i = 0; i < bytes.length; i += 1) {
            hex += bytes[i].toString(16).padStart(2, "0");
        }
        return `p${hex}`;
    }
    return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// ── Node Hint ──

function loadPersistedNodeHint(appState) {
    try {
        const raw = localStorage.getItem(NODE_HINT_STORAGE_KEY);
        if (!raw) {
            appState.recentNodeHint = null;
            return;
        }
        const parsed = JSON.parse(raw);
        const node = parsed && parsed.node ? parsed.node : parsed;
        const persistentId = node && node.persistentId ? String(node.persistentId).trim() : "";
        if (!persistentId) {
            appState.recentNodeHint = null;
            return;
        }
        appState.recentNodeHint = {
            persistentId,
            peerName: node && node.peerName ? String(node.peerName).trim() : "",
            lastPeerId: node && node.lastPeerId ? String(node.lastPeerId).trim() : "",
            updatedAt: Math.max(0, Number((node && node.updatedAt) || 0))
        };
    } catch (_error) {
        appState.recentNodeHint = null;
    }
}

function persistNodeHint(appState) {
    try {
        if (!appState.recentNodeHint || !appState.recentNodeHint.persistentId) {
            localStorage.removeItem(NODE_HINT_STORAGE_KEY);
            return;
        }
        localStorage.setItem(
            NODE_HINT_STORAGE_KEY,
            JSON.stringify({
                version: 1,
                node: {
                    persistentId: appState.recentNodeHint.persistentId,
                    peerName: appState.recentNodeHint.peerName || "",
                    lastPeerId: appState.recentNodeHint.lastPeerId || "",
                    updatedAt: Math.max(0, Number(appState.recentNodeHint.updatedAt || 0))
                }
            })
        );
    } catch (_error) {}
}

function rememberPeerNode(appState, meta) {
    meta = meta || {};
    const persistentId = String(meta.persistentId || "").trim();
    if (!persistentId) {
        return;
    }
    const prev = appState.recentNodeHint && appState.recentNodeHint.persistentId === persistentId
        ? appState.recentNodeHint
        : null;
    appState.recentNodeHint = {
        persistentId,
        peerName: String(meta.peerName || (prev && prev.peerName) || "").trim(),
        lastPeerId: String(meta.peerId || (prev && prev.lastPeerId) || "").trim(),
        updatedAt: Date.now()
    };
    persistNodeHint(appState);
}

function clearRecentNodePeerId(appState) {
    if (!appState.recentNodeHint || !appState.recentNodeHint.persistentId) {
        return;
    }
    if (!appState.recentNodeHint.lastPeerId) {
        return;
    }
    appState.recentNodeHint = {
        ...appState.recentNodeHint,
        lastPeerId: "",
        updatedAt: Date.now()
    };
    persistNodeHint(appState);
}

function getReconnectTargetPeerId(appState) {
    return appState.recentNodeHint && appState.recentNodeHint.lastPeerId
        ? String(appState.recentNodeHint.lastPeerId).trim()
        : "";
}

// ── Connector Mode ──

function normalizeConnectorMode(mode) {
    return mode === "scanner" ? "scanner" : "qr";
}

function loadConnectorModePreference(appState) {
    try {
        const raw = String(localStorage.getItem(CONNECTOR_MODE_STORAGE_KEY) || "").trim();
        appState.preferredConnectorMode = raw === "scanner" || raw === "qr" ? raw : "";
    } catch (_error) {
        appState.preferredConnectorMode = "";
    }
}

function persistConnectorModePreference(appState, mode) {
    const normalized = normalizeConnectorMode(mode);
    appState.preferredConnectorMode = normalized;
    try {
        localStorage.setItem(CONNECTOR_MODE_STORAGE_KEY, normalized);
    } catch (_error) {}
}

function getPreferredConnectorMode(appState, fallbackMode) {
    fallbackMode = fallbackMode || "qr";
    if (appState.preferredConnectorMode === "qr" || appState.preferredConnectorMode === "scanner") {
        return appState.preferredConnectorMode;
    }
    return normalizeConnectorMode(fallbackMode);
}

// ── Status Logs ──

function normalizeStatusLogMax(value, fallback) {
    fallback = fallback || STATUS_LOG_DEFAULT_MAX;
    const parsed = Number.parseInt(String(value || ""), 10);
    if (!Number.isFinite(parsed)) {
        return normalizeStatusLogMax(fallback, STATUS_LOG_DEFAULT_MAX);
    }
    if (parsed < STATUS_LOG_MIN) {
        return STATUS_LOG_MIN;
    }
    if (parsed > STATUS_LOG_HARD_MAX) {
        return STATUS_LOG_HARD_MAX;
    }
    return parsed;
}

function loadStatusLogMaxSetting(appState) {
    let next = STATUS_LOG_DEFAULT_MAX;
    try {
        const raw = localStorage.getItem(STATUS_LOG_MAX_STORAGE_KEY);
        if (raw !== null && raw !== "") {
            next = normalizeStatusLogMax(raw);
        }
    } catch (_error) {
        next = STATUS_LOG_DEFAULT_MAX;
    }
    setStatusLogMax(appState, next, { persist: false });
}

function persistStatusLogMaxSetting(appState) {
    try {
        localStorage.setItem(STATUS_LOG_MAX_STORAGE_KEY, String(appState.statusLogMax));
    } catch (_error) {}
}

function setStatusLogMax(appState, maxCount, options) {
    options = options || {};
    const normalized = normalizeStatusLogMax(maxCount, appState.statusLogMax);
    appState.statusLogMax = normalized;
    if (appState.statusLogs.length > normalized) {
        appState.statusLogs.splice(0, appState.statusLogs.length - normalized);
    }
    if (options.persist !== false) {
        persistStatusLogs(appState);
        persistStatusLogMaxSetting(appState);
    }
}

function sanitizeStatusLogRecord(record) {
    if (!record || typeof record !== "object") {
        return null;
    }
    const text = String(record.text || "").trim();
    if (!text) {
        return null;
    }
    const source = String(record.source || "status").trim() || "status";
    const ts = Number(record.ts);
    return {
        ts: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
        source,
        text
    };
}

function loadPersistedStatusLogs(appState) {
    const loaded = [];
    try {
        const raw = localStorage.getItem(STATUS_LOG_STORAGE_KEY);
        if (!raw) {
            appState.statusLogs = [];
            return;
        }
        const parsed = JSON.parse(raw);
        const records = Array.isArray(parsed)
            ? parsed
            : (parsed && Array.isArray(parsed.logs) ? parsed.logs : []);
        for (let i = 0; i < records.length; i += 1) {
            const item = sanitizeStatusLogRecord(records[i]);
            if (item) {
                loaded.push(item);
            }
        }
    } catch (_error) {
        appState.statusLogs = [];
        return;
    }
    appState.statusLogs = loaded.slice(-appState.statusLogMax);
}

function persistStatusLogs(appState) {
    try {
        localStorage.setItem(STATUS_LOG_STORAGE_KEY, JSON.stringify({
            version: 1,
            logs: appState.statusLogs.slice(-appState.statusLogMax)
        }));
    } catch (_error) {}
}

function appendStatusLog(appState, message, source) {
    source = source || "status";
    const text = String(message || "").trim();
    if (!text) {
        return;
    }
    appState.statusLogs.push({
        ts: Date.now(),
        source: String(source),
        text
    });
    if (appState.statusLogs.length > appState.statusLogMax) {
        appState.statusLogs.splice(0, appState.statusLogs.length - appState.statusLogMax);
    }
    persistStatusLogs(appState);
}

// ── Chat State ──

function loadPersistedChatState(appState) {
    const sanitizeMessages = function(messages) {
        if (!Array.isArray(messages)) {
            return [];
        }
        return messages
            .map(function(item) {
                return {
                    from: item && item.from ? String(item.from) : "system",
                    text: item && item.text ? String(item.text) : "",
                    isSystem: Boolean(item && item.isSystem),
                    timeText: item && item.timeText ? String(item.timeText) : formatNowHHMM(),
                    kind: item && item.kind ? String(item.kind) : "text",
                    fileName: item && item.fileName ? String(item.fileName) : "",
                    fileSize: Math.max(0, Number((item && item.fileSize) || 0)),
                    mimeType: item && item.mimeType ? String(item.mimeType) : "",
                    blobUrl: "",
                    durationSec: Math.max(0, Number((item && item.durationSec) || 0))
                };
            })
            .slice(-CHAT_HISTORY_MAX);
    };
    try {
        const raw = localStorage.getItem(CHAT_STORAGE_KEY) || localStorage.getItem(LEGACY_CHAT_STORAGE_KEY);
        if (!raw) {
            return;
        }
        const parsed = JSON.parse(raw);
        if (!parsed) {
            return;
        }

        if (parsed.version === 3 && parsed.conversations && typeof parsed.conversations === "object") {
            const nextConversations = {};
            const ids = Object.keys(parsed.conversations);
            for (let i = 0; i < ids.length; i += 1) {
                const id = ids[i];
                const item = parsed.conversations[id];
                nextConversations[id] = {
                    id,
                    peerName: item && item.peerName ? String(item.peerName) : "",
                    peerId: item && item.peerId ? String(item.peerId).trim() : "",
                    unreadCount: Math.max(0, Number((item && item.unreadCount) || 0)),
                    messages: sanitizeMessages(item && item.messages)
                };
            }
            appState.conversations = nextConversations;
            const preferredId = parsed.currentConversationId ? String(parsed.currentConversationId) : "";
            const fallbackId = Object.keys(appState.conversations)[0] || "";
            appState.currentConversationId = preferredId && appState.conversations[preferredId] ? preferredId : fallbackId;
        } else if (Array.isArray(parsed.messages)) {
            const legacyConversationId = "legacy:single";
            appState.conversations = {};
            appState.conversations[legacyConversationId] = {
                id: legacyConversationId,
                peerName: parsed.peerName ? String(parsed.peerName) : "",
                peerId: "",
                unreadCount: Math.max(0, Number(parsed.unreadCount || 0)),
                messages: sanitizeMessages(parsed.messages)
            };
            appState.currentConversationId = legacyConversationId;
        } else {
            return;
        }

        const current = ensureConversation(appState, appState.currentConversationId);
        if (current) {
            appState.chatHistory = current.messages.slice(-CHAT_HISTORY_MAX);
            appState.unreadCount = Math.max(0, Number(current.unreadCount || 0));
            appState.peerName = current.peerName || "";
        } else {
            appState.chatHistory = [];
            appState.unreadCount = 0;
            appState.peerName = "";
        }
    } catch (_error) {}
}

function persistChatState(appState) {
    try {
        syncConversationFromState(appState);
        const ids = Object.keys(appState.conversations);
        const serializedConversations = {};
        for (let i = 0; i < ids.length; i += 1) {
            const id = ids[i];
            const conversation = appState.conversations[id];
            serializedConversations[id] = {
                peerName: conversation.peerName || "",
                peerId: conversation.peerId || "",
                unreadCount: Math.max(0, Number(conversation.unreadCount || 0)),
                messages: sanitizeForStorage(conversation.messages)
            };
        }
        const payload = {
            version: 3,
            selfPersistentId: appState.localPersistentId,
            currentConversationId: appState.currentConversationId,
            conversations: serializedConversations
        };
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(payload));
    } catch (_error) {}
}

function sanitizeForStorage(messages) {
    if (!Array.isArray(messages)) {
        return [];
    }
    return messages.slice(-CHAT_HISTORY_MAX).map(function(msg) {
        return {
            from: msg.from,
            text: msg.text,
            isSystem: Boolean(msg.isSystem),
            timeText: msg.timeText,
            kind: msg.kind || "text",
            fileName: msg.fileName || "",
            fileSize: Math.max(0, Number(msg.fileSize || 0)),
            mimeType: msg.mimeType || "",
            durationSec: Math.max(0, Number(msg.durationSec || 0))
        };
    });
}

// ── Conversation helpers ──

function ensureConversation(appState, conversationId) {
    const id = String(conversationId || "").trim();
    if (!id) {
        return null;
    }
    if (!appState.conversations[id]) {
        appState.conversations[id] = {
            id,
            peerName: "",
            peerId: "",
            unreadCount: 0,
            messages: []
        };
    }
    return appState.conversations[id];
}

function ensureActiveConversation(appState) {
    if (appState.currentConversationId) {
        return ensureConversation(appState, appState.currentConversationId);
    }
    const fallbackId = appState.remotePersistentId ? `pid:${appState.remotePersistentId}` : `local:${appState.localPersistentId}`;
    appState.currentConversationId = fallbackId;
    return ensureConversation(appState, fallbackId);
}

function syncConversationFromState(appState) {
    if (
        !appState.currentConversationId &&
        !appState.remotePersistentId &&
        appState.chatHistory.length === 0 &&
        !appState.peerName &&
        Number(appState.unreadCount || 0) === 0
    ) {
        return;
    }
    const conversation = ensureActiveConversation(appState);
    if (!conversation) {
        return;
    }
    conversation.peerName = appState.peerName || conversation.peerName || "";
    conversation.unreadCount = Math.max(0, Number(appState.unreadCount || 0));
    conversation.messages = appState.chatHistory.slice(-CHAT_HISTORY_MAX).map(function(msg) {
        return {
            from: msg.from,
            text: msg.text,
            isSystem: Boolean(msg.isSystem),
            timeText: msg.timeText,
            kind: msg.kind || "text",
            fileName: msg.fileName || "",
            fileSize: Math.max(0, Number(msg.fileSize || 0)),
            mimeType: msg.mimeType || "",
            blobUrl: msg.blobUrl || "",
            durationSec: Math.max(0, Number(msg.durationSec || 0))
        };
    });
}

function mergeMessages(baseMessages, extraMessages) {
    const merged = []
        .concat(Array.isArray(baseMessages) ? baseMessages : [])
        .concat(Array.isArray(extraMessages) ? extraMessages : []);
    if (merged.length <= CHAT_HISTORY_MAX) {
        return merged;
    }
    return merged.slice(-CHAT_HISTORY_MAX);
}

function migrateTempConversationToPersistent(appState, targetId, fallbackPeerId) {
    const tempKeys = [];
    if (fallbackPeerId) {
        tempKeys.push(`peer:${fallbackPeerId}`);
    }
    if (appState.currentConversationId && appState.currentConversationId.startsWith("peer:")) {
        tempKeys.push(appState.currentConversationId);
    }
    var targetConversation = ensureConversation(appState, targetId);
    for (let i = 0; i < tempKeys.length; i += 1) {
        const tempId = tempKeys[i];
        if (!tempId || tempId === targetId || !appState.conversations[tempId]) {
            continue;
        }
        const tempConversation = appState.conversations[tempId];
        targetConversation.messages = mergeMessages(targetConversation.messages, tempConversation.messages);
        targetConversation.unreadCount = Math.max(
            Number(targetConversation.unreadCount || 0),
            Number(tempConversation.unreadCount || 0)
        );
        if (!targetConversation.peerName && tempConversation.peerName) {
            targetConversation.peerName = tempConversation.peerName;
        }
        delete appState.conversations[tempId];
    }
}
