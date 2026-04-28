/**
 * ui-chat.js - Chat messages, session list, emoji panel, input area.
 *
 * Depends on: utils.js, storage.js
 */

var UiChat = (function () {

    var EMOJI_SET = ["😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤔", "😭", "😡", "👍", "👎", "🙏", "👏", "🎉"];
    var HEART_FLOAT_CHARS = ["❤", "♥", "❥"];
    var MESSAGE_LOG_PREVIEW_MAX = 160;

    function appendMessage(appState, elements, from, text, isSystem, options) {
        options = options || {};
        ensureActiveConversation(appState);
        var kind = options.kind || "text";
        var message = {
            from: from,
            text: String(text || ""),
            isSystem: Boolean(isSystem || from === "system"),
            timeText: options.timeText || formatNowHHMM(),
            kind: kind,
            fileName: options.fileName ? String(options.fileName) : "",
            fileSize: Math.max(0, Number(options.fileSize || 0)),
            mimeType: options.mimeType ? String(options.mimeType) : "",
            blobUrl: options.blobUrl ? String(options.blobUrl) : "",
            durationSec: Math.max(0, Number(options.durationSec || 0))
        };
        if (message.isSystem) {
            var systemText = normalizeMessageLogText(message.text);
            appendStatusLog(appState, "系统消息 kind=" + kind + " text=" + (systemText || "(空)"), "system-msg");
        }
        renderMessage(elements, message);
        if (options.persist !== false) {
            appState.chatHistory.push(message);
            if (appState.chatHistory.length > CHAT_HISTORY_MAX) {
                appState.chatHistory = appState.chatHistory.slice(-CHAT_HISTORY_MAX);
            }
            syncConversationFromState(appState);
            persistChatState(appState);
        }
    }

    function renderMessage(elements, message) {
        var div = document.createElement("div");
        div.className = "message";
        if (message.kind === "file" || message.kind === "voice" || message.kind === "transfer") {
            div.classList.add(message.kind);
        }
        if (message.isSystem || message.from === "system") {
            div.classList.add("system");
        } else if (message.from === "me") {
            div.classList.add("me");
        } else {
            div.classList.add("peer");
        }

        var timestamp = document.createElement("span");
        timestamp.className = "message-time";
        timestamp.textContent = message.timeText || formatNowHHMM();
        div.appendChild(timestamp);

        var body = renderMessageBody(message);
        div.appendChild(body);

        elements.chatMessages.appendChild(div);
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    }

    function renderMessageBody(message) {
        var body = document.createElement("span");
        body.className = "message-body";
        if (message.kind === "file" || message.kind === "voice") {
            var info = document.createElement("span");
            info.textContent = message.text || "";
            body.appendChild(info);

            if (message.blobUrl) {
                if (message.kind === "voice") {
                    var audio = document.createElement("audio");
                    audio.className = "voice-audio";
                    audio.controls = true;
                    audio.src = message.blobUrl;
                    body.appendChild(audio);
                }
                var link = document.createElement("a");
                link.className = "attachment-link";
                link.href = message.blobUrl;
                link.download = message.fileName || "aircopy-file";
                link.textContent = message.kind === "voice" ? "下载语音" : "下载文件";
                body.appendChild(link);

                if (window.showSaveFilePicker) {
                    var saveBtn = document.createElement("button");
                    saveBtn.type = "button";
                    saveBtn.className = "secondary";
                    saveBtn.textContent = "选择位置保存";
                    (function (blobUrl, fileName, mimeType) {
                        saveBtn.addEventListener("click", async function () {
                            try {
                                await saveBlobUrlToDisk(blobUrl, fileName, mimeType);
                            } catch (error) {}
                        });
                    })(message.blobUrl, message.fileName, message.mimeType);
                    body.appendChild(saveBtn);
                }
            } else {
                var tip = document.createElement("span");
                tip.textContent = "（刷新后附件不可恢复）";
                body.appendChild(tip);
            }
            return body;
        }
        var standaloneUrl = getStandaloneMessageUrl(message.text);
        if (standaloneUrl) {
            var link = document.createElement("a");
            link.className = "attachment-link";
            link.href = standaloneUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = message.text || "";
            body.appendChild(link);
            return body;
        }
        body.textContent = message.text || "";
        return body;
    }

    function getStandaloneMessageUrl(text) {
        var raw = String(text || "");
        var trimmed = raw.trim();
        if (!trimmed || raw !== trimmed) {
            return "";
        }
        try {
            var url = new URL(trimmed);
            if (url.protocol !== "http:" && url.protocol !== "https:") {
                return "";
            }
            return url.href;
        } catch (_error) {
            return "";
        }
    }

    async function saveBlobUrlToDisk(blobUrl, fileName, mimeType) {
        if (!window.showSaveFilePicker || !blobUrl) { return; }
        var response = await fetch(blobUrl);
        var blob = await response.blob();
        var ext = guessExt(fileName);
        var handle = await window.showSaveFilePicker({
            suggestedName: fileName || ("aircopy-" + Date.now()),
            types: [{ description: "保存文件", accept: { [mimeType || blob.type || "application/octet-stream"]: ["." + ext] } }]
        });
        var writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
    }

    function guessExt(fileName) {
        var name = String(fileName || "");
        var idx = name.lastIndexOf(".");
        if (idx <= 0 || idx === name.length - 1) { return "bin"; }
        return name.slice(idx + 1).toLowerCase();
    }

    function renderHistoryFromState(appState, elements) {
        elements.chatMessages.innerHTML = "";
        for (var i = 0; i < appState.chatHistory.length; i += 1) {
            renderMessage(elements, appState.chatHistory[i]);
        }
    }

    function normalizeMessageLogText(text, maxLen) {
        maxLen = maxLen || MESSAGE_LOG_PREVIEW_MAX;
        var normalized = String(text || "").replace(/\s+/g, " ").trim();
        if (!normalized) { return ""; }
        if (normalized.length <= maxLen) { return normalized; }
        return normalized.slice(0, maxLen) + "…";
    }

    function logPeerMessageTraffic(appState, direction, message) {
        var rawDirection = direction === "out" ? "out" : "in";
        var type = message && message.type ? String(message.type) : "text";
        var body = normalizeMessageLogText(message && message.body ? message.body : "");
        var peerName = normalizeMessageLogText(message && message.name ? message.name : "", 36);
        var sourceTag = rawDirection === "out" ? "msg-out" : "msg-in";
        var action = rawDirection === "out" ? "发送" : "接收";
        var fromText = peerName ? " name=" + peerName : "";
        var bodyText = body ? " body=" + body : " body=(空)";
        appendStatusLog(appState, action + "消息 type=" + type + fromText + bodyText, sourceTag);
    }

    function sendCurrentMessage(appState, elements) {
        var text = elements.messageInput.value.trim();
        if (!text) { return; }
        if (!isCurrentConversationConnected(appState)) {
            appState.setStatus("当前会话未连接，当前无法发送消息。");
            return;
        }
        try {
            var conv = appState.conversations[appState.currentConversationId];
            var peerId = conv && conv.peerId ? conv.peerId : "";
            appState.peerManager.sendText(peerId, text);
            logPeerMessageTraffic(appState, "out", { type: "text", body: text });
            appendMessage(appState, elements, "me", text);
            elements.messageInput.value = "";
        } catch (error) {
            appState.setStatus("发送失败：" + toErrorMessage(error));
        }
    }

    function renderSessionList(appState, elements) {
        if (!elements.sessionList) { return; }
        var list = elements.sessionList;
        list.innerHTML = "";

        var ids = Object.keys(appState.conversations);
        if (ids.length === 0) {
            var emptyItem = document.createElement("li");
            emptyItem.className = "session-item session-empty";
            emptyItem.textContent = "暂无会话";
            emptyItem.dataset.empty = "1";
            list.appendChild(emptyItem);
            return;
        }

        for (var i = 0; i < ids.length; i += 1) {
            var id = ids[i];
            var conversation = appState.conversations[id];
            var li = document.createElement("li");
            li.className = "session-item";
            li.dataset.id = id;
            if (id === appState.currentConversationId) { li.classList.add("active"); }

            var avatar = document.createElement("span");
            avatar.className = "avatar";
            var name = conversation.peerName || "未命名会话";
            avatar.textContent = name ? name.slice(0, 1).toUpperCase() : "?";
            li.appendChild(avatar);

            var nameSpan = document.createElement("span");
            nameSpan.className = "name";
            nameSpan.textContent = name;
            li.appendChild(nameSpan);

            var presence = getConversationPresence(appState, conversation);
            var statusSpan = document.createElement("span");
            statusSpan.className = "session-status " + presence;
            statusSpan.textContent = presence === "away" ? "暂离" : (presence === "online" ? "在线" : "离线");
            li.appendChild(statusSpan);

            var unreadCount = Math.max(0, Number(conversation.unreadCount || 0));
            if (unreadCount > 0) {
                var unread = document.createElement("span");
                unread.className = "session-unread";
                unread.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
                li.appendChild(unread);
            }

            var deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "session-delete";
            deleteBtn.textContent = "×";
            deleteBtn.setAttribute("aria-label", "删除会话");
            li.appendChild(deleteBtn);

            list.appendChild(li);
        }
    }

    function getConversationPresence(appState, conversation) {
        if (!conversation) { return "offline"; }
        if (conversation.id && conversation.id === appState.currentConversationId) {
            var normalized = normalizePeerPresence(appState.peerPresence || "offline");
            if (normalized !== "offline") { return normalized; }
        }
        if (!conversation.peerId || !appState.peerManager || typeof appState.peerManager.isPeerConnected !== "function") {
            return "offline";
        }
        var peerId = String(conversation.peerId).trim();
        if (!peerId) { return "offline"; }
        // Use per-peer status from PeerManager
        var status = appState.peerManager.getStatus(peerId);
        if (status === "online" || status === "away") { return status; }
        return appState.peerManager.isPeerConnected(peerId) ? "online" : "offline";
    }

    function normalizePeerPresence(value) {
        var raw = String(value || "").trim().toLowerCase();
        if (raw === "away" || raw === "暂离") { return "away"; }
        if (raw === "online" || raw === "在线") { return "online"; }
        return "offline";
    }

    function selectConversation(appState, elements, conversationId) {
        var id = String(conversationId || "").trim();
        if (!id || !appState.conversations[id]) { return; }
        if (appState.currentConversationId === id && elements.chatMessages.dataset.inited) { return; }
        var conversation = appState.conversations[id];
        appState.currentConversationId = id;
        appState.chatHistory = conversation.messages.slice(-CHAT_HISTORY_MAX);
        appState.unreadCount = Math.max(0, Number(conversation.unreadCount || 0));
        setPeerName(appState, elements, conversation.peerName || "", { persist: false });
        if (elements.chatMessages.dataset.inited) { renderHistoryFromState(appState, elements); }
        if (isChatActive(elements)) {
            clearUnread(appState, elements);
        } else {
            renderUnread(appState, elements);
        }
        renderSessionList(appState, elements);
        updateSendControlsEnabledState(appState, elements);
    }

    function handleDeleteConversation(appState, elements, conversationId) {
        var id = String(conversationId || "").trim();
        if (!id || !appState.conversations[id]) { return; }
        if (id === appState.currentConversationId) {
            appState.setStatus("不能删除当前正在聊天的会话，请先切换到其他会话。");
            return;
        }
        delete appState.conversations[id];
        persistChatState(appState);
        renderSessionList(appState, elements);
    }

    function isChatActive(elements) {
        if (document.hidden) { return false; }
        return !elements.chatInterface.classList.contains("hidden");
    }

    function isCurrentConversationConnected(appState) {
        var currentId = String(appState.currentConversationId || "").trim();
        if (!currentId) { return false; }
        var conversation = appState.conversations[currentId];
        return isConversationConnected(appState, conversation);
    }

    function isConversationConnected(appState, conversation) {
        if (!conversation) { return false; }
        var peerId = conversation.peerId ? String(conversation.peerId).trim() : "";
        if (!peerId || !appState.peerManager || typeof appState.peerManager.isPeerConnected !== "function") {
            return Boolean(appState.connected);
        }
        return appState.peerManager.isPeerConnected(peerId);
    }

    function setPeerName(appState, elements, name, options) {
        options = options || {};
        appState.peerName = String(name || "").trim();
        var viewName = appState.peerName || "当前会话";
        if (elements.chatTitle) { elements.chatTitle.textContent = viewName; }
        if (elements.peerSessionName) { elements.peerSessionName.textContent = viewName; }
        if (options.persist !== false) {
            syncConversationFromState(appState);
            persistChatState(appState);
        }
    }

    function setPeerPresence(appState, elements, presence) {
        var next = normalizePeerPresence(presence);
        if (!isCurrentConversationConnected(appState) && next !== "offline") {
            next = "offline";
        }
        appState.peerPresence = next;
        var statusText = next === "away" ? "暂离" : (next === "online" ? "在线" : "离线");
        if (elements.chatStatus) {
            elements.chatStatus.textContent = statusText;
            elements.chatStatus.classList.toggle("online", next === "online");
            elements.chatStatus.classList.toggle("away", next === "away");
            elements.chatStatus.classList.toggle("offline", next === "offline");
        }
        if (elements.peerSessionStatus) {
            elements.peerSessionStatus.textContent = statusText;
            elements.peerSessionStatus.classList.toggle("online", next === "online");
            elements.peerSessionStatus.classList.toggle("away", next === "away");
            elements.peerSessionStatus.classList.toggle("offline", next === "offline");
        }
        var showReconnect = next === "offline";
        if (elements.chatReconnect) {
            elements.chatReconnect.classList.toggle("hidden", !showReconnect);
            elements.chatReconnect.disabled = !showReconnect || appState.manualReconnectInProgress;
        }
        if (elements.peerSessionReconnect) {
            elements.peerSessionReconnect.classList.toggle("hidden", !showReconnect);
            elements.peerSessionReconnect.disabled = !showReconnect || appState.manualReconnectInProgress;
        }
    }

    function markUnreadIfNeeded(appState, elements, isPeerMessage) {
        if (!isPeerMessage) { return; }
        if (isChatActive(elements)) {
            clearUnread(appState, elements);
            return;
        }
        appState.unreadCount += 1;
        renderUnread(appState, elements);
    }

    function clearUnread(appState, elements) {
        if (appState.unreadCount === 0) { return; }
        appState.unreadCount = 0;
        syncConversationFromState(appState);
        renderUnread(appState, elements);
    }

    function renderUnread(appState, elements) {
        var count = appState.unreadCount;
        var view = count > 99 ? "99+" : String(count);
        if (elements.chatUnread) {
            elements.chatUnread.textContent = view;
            elements.chatUnread.classList.toggle("hidden", count <= 0);
        }
        if (elements.peerSessionUnread) {
            elements.peerSessionUnread.textContent = view;
            elements.peerSessionUnread.classList.toggle("hidden", count <= 0);
        }
        syncConversationFromState(appState);
        persistChatState(appState);
    }

    function updateSendControlsEnabledState(appState, elements) {
        var online = isCurrentConversationConnected(appState);
        if (elements.sendBtn) { elements.sendBtn.disabled = !online; }
        if (elements.sendFile) { elements.sendFile.disabled = !online; }
        if (elements.sendEmoji) { elements.sendEmoji.disabled = !online; }
        if (elements.recordVoice) { elements.recordVoice.disabled = !online; }
        if (elements.videoCall) { elements.videoCall.disabled = !online; }
        if (elements.messageInput) {
            elements.messageInput.disabled = !online;
            elements.messageInput.placeholder = online ? "输入消息..." : "当前会话未连接，连接后可发送消息...";
        }
    }

    function bindFileDrop(appState, elements, options) {
        var cfg = options || {};
        var dropZone = elements.chatInputArea || null;
        if (!dropZone) {
            return;
        }
        var dragDepth = 0;

        function clearDropState() {
            dragDepth = 0;
            dropZone.classList.remove("file-drop-active");
        }

        dropZone.addEventListener("dragenter", function (event) {
            if (!isFileDragEvent(event)) {
                return;
            }
            event.preventDefault();
            dragDepth += 1;
            dropZone.classList.add("file-drop-active");
        });

        dropZone.addEventListener("dragover", function (event) {
            if (!isFileDragEvent(event)) {
                return;
            }
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = isCurrentConversationConnected(appState) ? "copy" : "none";
            }
            dropZone.classList.add("file-drop-active");
        });

        dropZone.addEventListener("dragleave", function (event) {
            if (!isFileDragEvent(event)) {
                return;
            }
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) {
                clearDropState();
            }
        });

        dropZone.addEventListener("drop", function (event) {
            if (!isFileDragEvent(event)) {
                clearDropState();
                return;
            }
            event.preventDefault();
            var files = getDraggedFiles(event);
            if (files.length === 0) {
                clearDropState();
                return;
            }
            clearDropState();
            if (typeof cfg.onDropFiles === "function") {
                cfg.onDropFiles(files);
            }
        });
    }

    function isFileDragEvent(event) {
        var dataTransfer = event && event.dataTransfer ? event.dataTransfer : null;
        if (!dataTransfer) {
            return false;
        }
        var types = dataTransfer.types;
        if (types && typeof types.length === "number") {
            for (var i = 0; i < types.length; i += 1) {
                if (types[i] === "Files") {
                    return true;
                }
            }
        }
        return Boolean(dataTransfer.files && dataTransfer.files.length > 0);
    }

    function getDraggedFiles(event) {
        var dataTransfer = event && event.dataTransfer ? event.dataTransfer : null;
        if (!dataTransfer || !dataTransfer.files || typeof dataTransfer.files.length !== "number") {
            return [];
        }
        var files = [];
        for (var i = 0; i < dataTransfer.files.length; i += 1) {
            var file = dataTransfer.files[i];
            if (file instanceof Blob) {
                files.push(file);
            }
        }
        return files;
    }

    function enterChatInterface(appState, elements) {
        UiConnector.closeQrModal(elements);
        appState.setSessionPanelOpen(false);
        showChatScreen(elements);
        if (!elements.chatMessages.dataset.inited) {
            elements.chatMessages.dataset.inited = "1";
            if (appState.chatHistory.length > 0) {
                renderHistoryFromState(appState, elements);
            } else {
                appendMessage(appState, elements, "system", "连接成功，等待双方 hello 消息…", true);
            }
        }
    }

    function showChatScreen(elements) {
        elements.connectionSetup.classList.add("hidden");
        elements.chatInterface.classList.remove("hidden");
        elements.backToChat.classList.add("hidden");
        document.body.classList.add("chat-active");
    }

    function initEmojiPanel(appState, elements) {
        if (!elements.emojiPanel) { return; }
        elements.emojiPanel.innerHTML = "";
        for (var i = 0; i < EMOJI_SET.length; i += 1) {
            var emoji = EMOJI_SET[i];
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "emoji-btn";
            btn.textContent = emoji;
            btn.setAttribute("aria-label", "插入表情 " + emoji);
            (function (e) {
                btn.addEventListener("click", function () {
                    insertTextAtCursor(elements.messageInput, e);
                    elements.messageInput.focus();
                });
            })(emoji);
            elements.emojiPanel.appendChild(btn);
        }
    }

    function toggleEmojiPanel(appState, elements) {
        if (!isCurrentConversationConnected(appState)) {
            appState.setStatus("当前会话未连接，当前无法发送表情。");
            return;
        }
        elements.emojiPanel.classList.toggle("hidden");
    }

    function closeEmojiPanel(elements) {
        if (elements.emojiPanel) {
            elements.emojiPanel.classList.add("hidden");
        }
    }

    function insertTextAtCursor(textarea, text) {
        if (!textarea) { return; }
        var start = Number(textarea.selectionStart || 0);
        var end = Number(textarea.selectionEnd || 0);
        var current = textarea.value || "";
        textarea.value = current.slice(0, start) + text + current.slice(end);
        var cursor = start + text.length;
        textarea.selectionStart = cursor;
        textarea.selectionEnd = cursor;
    }

    function playHeartbeatFloatBurst(appState, elements) {
        if (!appState.connected) { return; }
        spawnStatusHeartBurst(elements.chatStatus, 8);
        spawnStatusHeartBurst(elements.peerSessionStatus, 8);
    }

    function spawnStatusHeartBurst(anchor, count) {
        count = count || 8;
        if (!anchor || !anchor.classList || !anchor.classList.contains("online")) { return; }
        var total = Math.max(4, Number(count) || 0);
        for (var i = 0; i < total; i += 1) {
            var delay = i * 95 + Math.random() * 90;
            (function (a) {
                window.setTimeout(function () { spawnStatusHeart(a); }, delay);
            })(anchor);
        }
    }

    function spawnStatusHeart(anchor) {
        if (!anchor || !anchor.isConnected || !anchor.classList.contains("online")) { return; }
        var heart = document.createElement("span");
        heart.className = "status-heart-float";
        heart.textContent = HEART_FLOAT_CHARS[Math.floor(Math.random() * HEART_FLOAT_CHARS.length)] || "❤";
        var drift = (Math.random() * 26 - 13).toFixed(1);
        var rise = (48 + Math.random() * 26).toFixed(1);
        var duration = Math.round(900 + Math.random() * 700);
        var scale = (0.82 + Math.random() * 0.48).toFixed(2);
        heart.style.setProperty("--heart-drift", drift + "px");
        heart.style.setProperty("--heart-rise", rise + "px");
        heart.style.setProperty("--heart-duration", duration + "ms");
        heart.style.setProperty("--heart-scale", scale);
        anchor.appendChild(heart);
        window.setTimeout(function () { if (heart.parentNode) { heart.parentNode.removeChild(heart); } }, duration + 200);
    }

    return {
        appendMessage: appendMessage,
        renderMessage: renderMessage,
        renderHistoryFromState: renderHistoryFromState,
        logPeerMessageTraffic: logPeerMessageTraffic,
        sendCurrentMessage: sendCurrentMessage,
        renderSessionList: renderSessionList,
        selectConversation: selectConversation,
        handleDeleteConversation: handleDeleteConversation,
        isChatActive: isChatActive,
        isCurrentConversationConnected: isCurrentConversationConnected,
        isConversationConnected: isConversationConnected,
        setPeerName: setPeerName,
        setPeerPresence: setPeerPresence,
        normalizePeerPresence: normalizePeerPresence,
        markUnreadIfNeeded: markUnreadIfNeeded,
        clearUnread: clearUnread,
        renderUnread: renderUnread,
        updateSendControlsEnabledState: updateSendControlsEnabledState,
        bindFileDrop: bindFileDrop,
        enterChatInterface: enterChatInterface,
        showChatScreen: showChatScreen,
        initEmojiPanel: initEmojiPanel,
        toggleEmojiPanel: toggleEmojiPanel,
        closeEmojiPanel: closeEmojiPanel,
        playHeartbeatFloatBurst: playHeartbeatFloatBurst,
        getConversationPresence: getConversationPresence
    };
})();
