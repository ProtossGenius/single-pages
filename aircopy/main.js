(function () {
    const PEER_INIT_TIMEOUT_MS = 20000;
    const COPY_LOGS_FEEDBACK_MS = 1200;
    const INIT_STAGE_ORDER = ["bootstrap", "location", "dependency", "peer", "qrcode"];
    const INIT_STAGE_LABELS = {
        bootstrap: "页面启动",
        location: "页面地址解析",
        dependency: "依赖检查",
        peer: "Peer 节点初始化",
        qrcode: "二维码生成"
    };
    const DEPENDENCY_CDN_URLS = {
        peerjs: ["./vendor/peerjs.min.js"],
        qrcode: ["./vendor/qrcode.min.js"],
        zxing: ["./vendor/zxing-browser.min.js"],
        jsqr: ["./vendor/jsQR.min.js"]
    };
    const REFRESH_RECONNECT_TIMEOUT_MS = 12000;

    const appState = {
        mode: "qr",
        scannerRunning: false,
        handlingScan: false,
        scanSessionId: 0,
        currentQrText: "",
        scanVisualSuccess: false,
        lastScanErrorAt: 0,
        scanControls: null,
        smartRegionTimer: null,
        smartCanvas: null,
        smartCtx: null,
        localPeerId: "",
        localPersistentId: "",
        preferredConnectorMode: "",
        recentNodeHint: null,
        remotePersistentId: "",
        currentConversationId: "",
        peerName: "",
        connected: false,
        peerPresence: "offline",
        unreadCount: 0,
        chatHistory: [],
        conversations: {},
        statusLogs: [],
        statusLogMax: STATUS_LOG_DEFAULT_MAX,
        isMobileLayout: false,
        sidebarCollapsedDesktop: false,
        sessionOpenMobile: false,
        settingsOpen: false,
        headerMenuOpen: false,
        copyLogsFeedbackTimer: null,
        clearLogsFeedbackTimer: null,
        recordingVoice: false,
        voiceRecorder: null,
        voiceChunks: [],
        voiceStream: null,
        voiceSendAfterStop: true,
        lastVideoPlayHintAt: 0,
        videoState: "idle",
        videoModalOpen: false,
        incomingCallInfo: null,
        incomingFileOffer: null,
        transferViews: {},
        objectUrls: [],
        refreshReconnectAttempted: false,
        refreshReconnectPending: null,
        manualReconnectInProgress: false,
        autoReconnectPeers: {},
        peerInitTask: null,
        initStages: createDefaultInitStages(),
        modeTask: Promise.resolve(),
        scannerTask: Promise.resolve(),
        // Methods attached below for UI module access.
        peerManager: null,
        setStatus: null,
        ensurePeerReady: null,
        setSessionPanelOpen: null,
        setHeaderMenuOpen: null,
        clearRefreshReconnectPending: null,
        handleReusedConnection: null
    };

    const elements = {
        connectionSetup: document.getElementById("connection-setup"),
        baseUrlText: document.getElementById("base-url-text"),
        chatInterface: document.getElementById("chat-interface"),
        qrContainer: document.getElementById("qr-container"),
        scannerContainer: document.getElementById("scanner-container"),
        qrcode: document.getElementById("qrcode"),
        reader: document.getElementById("reader"),
        scannerShell: document.getElementById("scanner-shell"),
        toggleMethod: document.getElementById("toggle-method"),
        scanTrigger: document.getElementById("scan-trigger"),
        regenOffer: document.getElementById("regen-offer"),
        enlargeQr: document.getElementById("enlarge-qr"),
        backToChat: document.getElementById("back-to-chat"),
        qrModal: document.getElementById("qr-modal"),
        qrModalClose: document.getElementById("qr-modal-close"),
        qrcodeLarge: document.getElementById("qrcode-large"),
        chatTitle: document.getElementById("chat-title"),
        chatStatus: document.getElementById("chat-status"),
        chatUnread: document.getElementById("chat-unread"),
        sessionList: document.getElementById("session-list"),
        settingsToggle: document.getElementById("settings-toggle"),
        sidebarSettings: document.getElementById("sidebar-settings"),
        copyLatestLogs: document.getElementById("copy-latest-logs"),
        clearLatestLogs: document.getElementById("clear-latest-logs"),
        statusLogMaxInput: document.getElementById("status-log-max"),
        peerSessionName: document.getElementById("peer-session-name"),
        peerSessionReconnect: document.getElementById("peer-session-reconnect"),
        peerSessionStatus: document.getElementById("peer-session-status"),
        peerSessionUnread: document.getElementById("peer-session-unread"),
        sessionToggle: document.getElementById("session-toggle"),
        chatReconnect: document.getElementById("chat-reconnect"),
        sessionBackdrop: document.getElementById("session-backdrop"),
        chatMenuToggle: document.getElementById("chat-menu-toggle"),
        chatMenu: document.getElementById("chat-menu"),
        openConnector: document.getElementById("open-connector"),
        chatInterfaceRoot: document.getElementById("chat-interface"),
        displayName: document.getElementById("display-name"),
        statusText: document.getElementById("status-text"),
        chatMessages: document.getElementById("chat-messages"),
        messageInput: document.getElementById("message-input"),
        sendBtn: document.getElementById("send-btn"),
        exitChat: document.getElementById("exit-chat"),
        sendFile: document.getElementById("send-file"),
        sendEmoji: document.getElementById("send-emoji"),
        recordVoice: document.getElementById("record-voice"),
        videoCall: document.getElementById("video-call"),
        fileInput: document.getElementById("file-input"),
        emojiPanel: document.getElementById("emoji-panel"),
        videoModal: document.getElementById("video-modal"),
        videoStatus: document.getElementById("video-status"),
        videoShowToggle: document.getElementById("video-show-toggle"),
        videoMuteToggle: document.getElementById("video-mute-toggle"),
        localVideo: document.getElementById("local-video"),
        remoteVideo: document.getElementById("remote-video"),
        incomingCallActions: document.getElementById("incoming-call-actions"),
        acceptVideoCall: document.getElementById("accept-video-call"),
        rejectVideoCall: document.getElementById("reject-video-call"),
        hangupVideo: document.getElementById("hangup-video"),
        closeVideoModal: document.getElementById("close-video-modal"),
        fileOfferModal: document.getElementById("file-offer-modal"),
        fileOfferText: document.getElementById("file-offer-text"),
        acceptFileOffer: document.getElementById("accept-file-offer"),
        rejectFileOffer: document.getElementById("reject-file-offer")
    };

    // ── PeerManager ──

    const peerManager = (typeof PeerManager === "function") ? new PeerManager({
        onLocalId: (id) => {
            appState.localPeerId = id;
        },
        onConnected: (info) => {
            clearRefreshReconnectPending();
            if (info && info.peerName) {
                UiChat.setPeerName(appState, elements, info.peerName, { persist: false });
            }
            if (info) {
                bindConversation(info.peerPersistentId || "", info.peerName || appState.peerName || "", info.peerId || "");
                rememberPeerNode(appState, {
                    persistentId: info.peerPersistentId || "",
                    peerName: info.peerName || appState.peerName || "",
                    peerId: info.peerId || ""
                });
            }
            setConnectionState(true);
            UiChat.clearUnread(appState, elements);
            UiChat.enterChatInterface(appState, elements);
            setStatus("连接成功。");
            if (info && info.peerId && appState.autoReconnectPeers && appState.autoReconnectPeers[info.peerId]) {
                delete appState.autoReconnectPeers[info.peerId];
            }
        },
        onConnectionClosed: (info) => {
            const wasConnected = appState.connected;
            const closeDetails = describePeerRuntimeError(
                info && info.error ? info.error : (info && info.reason ? { message: info.reason, reason: info.reason } : null),
                "连接已断开"
            );
            const closeReason = closeDetails.reason;
            const hiddenText = document.hidden ? "是" : "否";
            if (wasConnected) {
                UiChat.appendMessage(appState, elements, "system", `连接已断开：${closeReason}（页面隐藏：${hiddenText}）`, true);
                UiChat.setPeerName(appState, elements, "", { persist: false });
                appState.remotePersistentId = "";
                setConnectionState(false);
                UiFileOffer.clearAllTransferProgress(appState);
                UiVideo.resetVideoUI(appState, elements, "未开始");
                UiFileOffer.closeFileOfferModal(appState, elements);
            }
            if (wasConnected) {
                setStatus(`连接已断开：${closeReason}（页面隐藏：${hiddenText}），可点击重连或重新扫码连接。`);
            }
            if (isRefreshReconnectPending()) {
                handleRefreshReconnectFailure(closeReason);
                return;
            }
            const closedPeerId = info && info.peerId ? String(info.peerId).trim() : "";
            if (closedPeerId && appState.autoReconnectPeers && appState.autoReconnectPeers[closedPeerId]) {
                handleAutoReconnectPeerFailure(closedPeerId, closeReason);
            }
            UiChat.renderSessionList(appState, elements);
        },
        onError: (error) => {
            const details = describePeerRuntimeError(error, "连接异常");
            appendPeerRuntimeErrorLog(details, "peer-error");
            if (details.handledByConnectionClose) {
                return;
            }
            if (details.source === "peer" && appState.connected) {
                return;
            }
            if (isRefreshReconnectPending()) {
                handleRefreshReconnectFailure(details.message);
                return;
            }
            if (details.peerId && appState.autoReconnectPeers && appState.autoReconnectPeers[details.peerId]) {
                handleAutoReconnectPeerFailure(details.peerId, details.message);
                return;
            }
            setStatus(`连接异常：${details.message}`);
        },
        onMessage: (message) => {
            UiChat.logPeerMessageTraffic(appState, "in", message);
            const remotePersistentId = message && message.persistentId ? String(message.persistentId) : "";
            if (remotePersistentId) {
                bindConversation(remotePersistentId, message.name || appState.peerName || "", message.peerId || "");
                rememberPeerNode(appState, {
                    persistentId: remotePersistentId,
                    peerName: message.name || appState.peerName || "",
                    peerId: message.peerId || ""
                });
            }
            if (!appState.connected && peerManager && typeof peerManager.hasAnyConnection === "function" && peerManager.hasAnyConnection()) {
                setConnectionState(true);
            }
            if (message.type === "hello") {
                const remoteName = message.name || appState.peerName || "对方";
                UiChat.setPeerName(appState, elements, remoteName);
                UiChat.appendMessage(appState, elements, "system", `hello ${getDisplayName()} 与 ${remoteName}`, true);
                UiChat.markUnreadIfNeeded(appState, elements, true);
                return;
            }
            UiChat.appendMessage(appState, elements, message.from, message.body, message.type === "hello");
            UiChat.markUnreadIfNeeded(appState, elements, message.from === "peer");
        },
        onHeartbeat: (info) => {
            handleHeartbeatPing(info);
        },
        onHeartbeatStatus: (payload) => {
            const status = payload && payload.status ? String(payload.status) : "online";
            UiChat.setPeerPresence(appState, elements, status === "away" ? "away" : "online");
            UiChat.renderSessionList(appState, elements);
        },
        onIncomingFileOffer: (offer) => {
            appState.incomingFileOffer = offer || null;
            UiFileOffer.showFileOfferModal(appState, elements);
        },
        onTransferProgress: (progress) => {
            UiFileOffer.updateTransferProgress(appState, elements, progress);
        },
        onFileReceived: async (payload) => {
            UiFileOffer.clearTransferProgress(appState, payload.transferId);
            await UiFileOffer.appendAttachmentMessage("peer", payload, appState, elements, helpers);
            UiChat.markUnreadIfNeeded(appState, elements, true);
            if (payload.savedToDisk) {
                UiChat.appendMessage(appState, elements, "system", `文件已保存到本地：${payload.fileName}`, true);
            } else if (payload.kind === "voice") {
                setStatus(`收到语音：${payload.fileName}`);
            } else {
                setStatus(`收到文件：${payload.fileName}`);
            }
        },
        onIncomingCall: (info) => {
            appState.incomingCallInfo = info || null;
            appState.videoState = "incoming";
            const callerName = info && info.metadata && info.metadata.name ? String(info.metadata.name) : (appState.peerName || "对方");
            UiVideo.setVideoStatus(elements, `${callerName} 邀请视频通话`);
            UiVideo.openVideoModal(appState, elements, { incoming: true });
            UiVideo.updateVideoButton(appState, elements);
        },
        onLocalStream: (stream, info) => {
            elements.localVideo.srcObject = stream || null;
            if (elements.localVideo && elements.localVideo.parentElement) {
                const noVideo = !info || !info.hasVideoTrack;
                elements.localVideo.parentElement.classList.toggle("video-off", noVideo);
            }
            UiVideo.applyLocalMediaTrackToggles(elements);
            UiVideo.ensureVideoPlayback(elements.localVideo, appState, helpers, { muted: true });
        },
        onRemoteStream: (stream, info) => {
            elements.remoteVideo.srcObject = stream || null;
            if (elements.remoteVideo && elements.remoteVideo.parentElement) {
                const noVideo = !info || !info.hasVideoTrack;
                elements.remoteVideo.parentElement.classList.toggle("video-off", noVideo);
            }
            UiVideo.ensureVideoPlayback(elements.remoteVideo, appState, helpers, { muted: false });
            if (stream) {
                UiVideo.openVideoModal(appState, elements, { incoming: false });
            }
        },
        onCallState: (state) => {
            const next = state && state.state ? state.state : "idle";
            if (next === "calling") {
                UiVideo.setVideoStatus(elements, "呼叫中...");
                appState.videoState = "calling";
            } else if (next === "connecting") {
                UiVideo.setVideoStatus(elements, "连接中...");
                appState.videoState = "connecting";
            } else if (next === "connected") {
                UiVideo.setVideoStatus(elements, "通话中");
                appState.videoState = "connected";
            } else if (next === "rejected") {
                UiVideo.setVideoStatus(elements, "对方未接听");
                appState.videoState = "idle";
            } else if (next === "error") {
                UiVideo.setVideoStatus(elements, "通话异常");
                appState.videoState = "idle";
            } else {
                UiVideo.setVideoStatus(elements, "未开始");
                appState.videoState = "idle";
                appState.incomingCallInfo = null;
                if (elements.videoModal && !elements.videoModal.classList.contains("hidden")) {
                    UiVideo.closeVideoModal(appState, elements, { keepCall: false, peerManager: peerManager });
                }
            }
            UiVideo.updateVideoButton(appState, elements);
        },
        onStateChange: (state) => {
            if (state === "disconnected") {
                setStatus("Peer 服务连接断开，请稍后手动重连。");
            }
        }
    }) : null;

    appState.peerManager = peerManager;

    // Helpers object for UiFileOffer / UiVideo.
    const helpers = {
        setStatus: (text) => setStatus(text),
        isCurrentConversationConnected: () => UiChat.isCurrentConversationConnected(appState),
        appendMessage: (from, text, isSystem, options) => UiChat.appendMessage(appState, elements, from, text, isSystem, options)
    };

    // Attach methods to appState for UI module callbacks.
    appState.setStatus = (text) => setStatus(text);
    appState.ensurePeerReady = () => ensurePeerReady();
    appState.setSessionPanelOpen = (open) => setSessionPanelOpen(open);
    appState.setHeaderMenuOpen = (open) => setHeaderMenuOpen(open);
    appState.clearRefreshReconnectPending = () => clearRefreshReconnectPending();
    appState.handleReusedConnection = (remotePeerId, connectResult) => {
        const knownPersistentId = appState.remotePersistentId || connectResult.peerPersistentId || "";
        const knownPeerName = connectResult.peerName || appState.peerName || "";
        bindConversation(knownPersistentId, knownPeerName, remotePeerId);
        rememberPeerNode(appState, {
            persistentId: knownPersistentId,
            peerName: knownPeerName,
            peerId: remotePeerId
        });
        setConnectionState(true);
        UiChat.clearUnread(appState, elements);
        UiChat.enterChatInterface(appState, elements);
        setStatus("已连接到该节点，已打开对应会话。");
    };

    // ── Error handlers ──

    window.addEventListener("error", (event) => {
        const reason = event && event.error ? toErrorMessage(event.error) : (event && event.message ? String(event.message) : "未知脚本错误");
        console.error("[AirCopy][Fatal]", reason, event && event.error ? event.error : "");
        setStatus(`初始化失败：${reason}`);
    });
    window.addEventListener("unhandledrejection", (event) => {
        const reason = event && event.reason ? toErrorMessage(event.reason) : "未知 Promise 异常";
        console.error("[AirCopy][UnhandledPromise]", reason, event && event.reason ? event.reason : "");
        setStatus(`初始化失败：${reason}`);
    });

    // ── Init ──

    void init().catch((error) => {
        console.error("[AirCopy][InitError]", error);
        setStatus(`初始化失败：${toErrorMessage(error)}`);
    });

    async function init() {
        appState.initStages = createDefaultInitStages();
        setInitStage("bootstrap", "running", "入口脚本已启动");
        ensureLocalPersistentId(appState);
        loadPersistedNodeHint(appState);
        loadConnectorModePreference(appState);
        loadStatusLogMaxSetting(appState);
        loadPersistedStatusLogs(appState);
        renderBaseUrlText();
        setInitStage("location", "success", "已读取当前页面链接");
        if (!peerManager) {
            const detail = "PeerManager 脚本未加载，请确认 peer-manager.js 可访问";
            setInitStage("peer", "error", detail);
            setStatus(`初始化失败：${detail}`);
            return;
        }
        setStatus("正在加载依赖资源…");
        await loadRuntimeDependencies();
        if (!validateRuntimeDependencies()) {
            return;
        }
        const seed = Math.floor(Math.random() * 9000 + 1000);
        elements.displayName.value = `用户_${seed}`;
        peerManager.setDisplayName(getDisplayName());
        peerManager.setPersistentId(appState.localPersistentId);
        if (elements.settingsToggle) {
            elements.settingsToggle.setAttribute("aria-expanded", "false");
        }

        bindEventListeners();

        updateLayoutMode();
        UiChat.initEmojiPanel(appState, elements);
        UiVideo.syncVideoPrefForCurrentPeer(appState, elements);
        setSettingsPanelOpen(false);
        setHeaderMenuOpen(false);
        setConnectionState(false);
        UiVideo.updateVideoButton(appState, elements);

        loadPersistedChatState(appState);
        UiChat.setPeerName(appState, elements, appState.peerName || "", { persist: false });
        UiChat.renderUnread(appState, elements);
        UiChat.renderSessionList(appState, elements);
        UiChat.updateSendControlsEnabledState(appState, elements);

        if (elements.statusLogMaxInput) {
            elements.statusLogMaxInput.value = String(appState.statusLogMax);
        }

        const isMobile = /Android|webOS|iPhone|iPod|iPad|Mobile/i.test(navigator.userAgent);
        const initialMode = getPreferredConnectorMode(appState, isMobile ? "scanner" : "qr");
        setInitStage("bootstrap", "success", "基础页面初始化完成");
        void (async () => {
            await UiConnector.setMode(appState, elements, initialMode, { force: true });
            const hasUrlPeerTarget = await tryConnectToUrlPeerIdOnFirstLoad();
            if (!hasUrlPeerTarget) {
                await tryRefreshReconnectFromPersistedNode();
            }
            await tryReconnectAllPersistedConversations();
        })();
    }

    // ── Event Listeners ──

    function bindEventListeners() {
        elements.displayName.addEventListener("input", () => {
            peerManager.setDisplayName(getDisplayName());
        });
        elements.toggleMethod.addEventListener("click", () => {
            const nextMode = appState.mode === "qr" ? "scanner" : "qr";
            UiConnector.setMode(appState, elements, nextMode);
        });
        elements.scanTrigger.addEventListener("click", () => {
            if (appState.scannerRunning) {
                UiConnector.stopScanIfRunning(appState, elements);
            } else {
                UiConnector.startScan(appState, elements);
            }
        });
        elements.regenOffer.addEventListener("click", () => {
            UiConnector.regenerateOffer(appState, elements);
        });
        elements.backToChat.addEventListener("click", () => {
            UiChat.showChatScreen(elements);
        });
        elements.enlargeQr.addEventListener("click", () => UiConnector.openQrModal(appState, elements));
        elements.qrcode.addEventListener("dblclick", () => UiConnector.openQrModal(appState, elements));
        elements.qrModalClose.addEventListener("click", () => UiConnector.closeQrModal(elements));
        elements.qrModal.addEventListener("click", (event) => {
            if (event.target === elements.qrModal) {
                UiConnector.closeQrModal(elements);
            }
        });
        elements.sessionToggle.addEventListener("click", toggleSessionPanel);
        elements.sessionBackdrop.addEventListener("click", () => {
            setSessionPanelOpen(false);
        });
        if (elements.chatMenuToggle) {
            elements.chatMenuToggle.addEventListener("click", (event) => {
                event.stopPropagation();
                setHeaderMenuOpen(!appState.headerMenuOpen);
            });
        }
        elements.openConnector.addEventListener("click", () => {
            setHeaderMenuOpen(false);
            UiConnector.showConnectorScreen(appState, elements);
        });
        if (elements.sessionList) {
            elements.sessionList.addEventListener("click", (event) => {
                const target = event.target;
                if (!(target instanceof HTMLElement)) { return; }
                const item = target.closest(".session-item");
                if (!item || item.dataset.empty === "1") { return; }
                const id = String(item.dataset.id || "").trim();
                if (!id) { return; }
                if (target.classList.contains("session-delete")) {
                    event.stopPropagation();
                    UiChat.handleDeleteConversation(appState, elements, id);
                    return;
                }
                UiChat.selectConversation(appState, elements, id);
                UiChat.clearUnread(appState, elements);
                if (appState.isMobileLayout) {
                    setSessionPanelOpen(false);
                }
            });
        }
        if (elements.settingsToggle) {
            elements.settingsToggle.addEventListener("click", () => {
                setSettingsPanelOpen(!appState.settingsOpen);
            });
        }
        if (elements.statusLogMaxInput) {
            elements.statusLogMaxInput.addEventListener("change", () => {
                const previous = appState.statusLogMax;
                setStatusLogMax(appState, elements.statusLogMaxInput.value);
                if (elements.statusLogMaxInput.value !== String(appState.statusLogMax)) {
                    elements.statusLogMaxInput.value = String(appState.statusLogMax);
                }
                if (appState.statusLogMax !== previous) {
                    setStatus(`日志保留上限已设置为 ${appState.statusLogMax} 条。`);
                }
            });
            elements.statusLogMaxInput.addEventListener("blur", () => {
                setStatusLogMax(appState, elements.statusLogMaxInput.value);
                if (elements.statusLogMaxInput.value !== String(appState.statusLogMax)) {
                    elements.statusLogMaxInput.value = String(appState.statusLogMax);
                }
            });
        }
        if (elements.copyLatestLogs) {
            elements.copyLatestLogs.addEventListener("click", copyLatestLogs);
        }
        if (elements.clearLatestLogs) {
            elements.clearLatestLogs.addEventListener("click", clearLatestLogs);
        }
        if (elements.chatReconnect) {
            elements.chatReconnect.addEventListener("click", (event) => {
                event.stopPropagation();
                void runManualReconnect();
            });
        }
        if (elements.peerSessionReconnect) {
            elements.peerSessionReconnect.addEventListener("click", (event) => {
                event.stopPropagation();
                void runManualReconnect();
            });
        }

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                UiConnector.closeQrModal(elements);
                setSessionPanelOpen(false);
                setSettingsPanelOpen(false);
                setHeaderMenuOpen(false);
                UiChat.closeEmojiPanel(elements);
                UiVideo.closeVideoModal(appState, elements, { keepCall: true });
                if (appState.incomingFileOffer) {
                    UiFileOffer.rejectIncomingFileOffer(appState, elements, peerManager, helpers);
                }
            }
        });
        window.addEventListener("resize", updateLayoutMode);
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
                UiChat.clearUnread(appState, elements);
            }
        });

        elements.sendBtn.addEventListener("click", () => UiChat.sendCurrentMessage(appState, elements));
        elements.exitChat.addEventListener("click", () => {
            setHeaderMenuOpen(false);
            void resetToSetup();
        });
        elements.sendFile.addEventListener("click", () => {
            if (!UiChat.isCurrentConversationConnected(appState)) {
                setStatus("当前会话未连接，当前无法发送文件。");
                return;
            }
            elements.fileInput.click();
        });
        elements.fileInput.addEventListener("change", (event) => {
            UiFileOffer.onFileInputChanged(event, appState, elements, peerManager, helpers);
        });
        elements.sendEmoji.addEventListener("click", () => UiChat.toggleEmojiPanel(elements));
        elements.recordVoice.addEventListener("click", () => UiFileOffer.toggleVoiceRecording(appState, elements, peerManager, helpers));
        elements.videoCall.addEventListener("click", () => UiVideo.toggleVideoCall(appState, elements, peerManager, helpers));
        elements.videoShowToggle.addEventListener("change", () => UiVideo.onVideoShowToggleChanged(elements));
        elements.videoMuteToggle.addEventListener("change", () => UiVideo.onVideoMuteToggleChanged(elements));
        elements.acceptVideoCall.addEventListener("click", () => UiVideo.acceptIncomingVideoCall(appState, elements, peerManager, helpers));
        elements.rejectVideoCall.addEventListener("click", () => UiVideo.rejectIncomingVideoCall(appState, elements, peerManager));
        elements.hangupVideo.addEventListener("click", () => {
            peerManager.hangupVideoCall();
            appState.videoState = "idle";
            UiVideo.updateVideoButton(appState, elements);
        });
        elements.closeVideoModal.addEventListener("click", () => UiVideo.closeVideoModal(appState, elements, { keepCall: true }));
        elements.localVideo.addEventListener("click", () => {
            UiVideo.ensureVideoPlayback(elements.localVideo, appState, helpers, { muted: true });
        });
        elements.remoteVideo.addEventListener("click", () => {
            UiVideo.ensureVideoPlayback(elements.remoteVideo, appState, helpers, { muted: false });
        });
        elements.acceptFileOffer.addEventListener("click", () => UiFileOffer.acceptIncomingFileOffer(appState, elements, peerManager, helpers));
        elements.rejectFileOffer.addEventListener("click", () => UiFileOffer.rejectIncomingFileOffer(appState, elements, peerManager, helpers));
        elements.messageInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                UiChat.sendCurrentMessage(appState, elements);
            }
        });
        document.addEventListener("click", (event) => {
            const target = event.target;
            const insideSettings =
                target instanceof HTMLElement &&
                target.closest &&
                (target.closest("#sidebar-settings") || target.closest("#settings-toggle"));
            if (appState.settingsOpen && !insideSettings) {
                setSettingsPanelOpen(false);
            }
            const insideHeaderMenu =
                target instanceof HTMLElement &&
                target.closest &&
                (target.closest("#chat-menu") || target.closest("#chat-menu-toggle"));
            if (appState.headerMenuOpen && !insideHeaderMenu) {
                setHeaderMenuOpen(false);
            }
            if (!elements.emojiPanel || elements.emojiPanel.classList.contains("hidden")) {
                return;
            }
            if (
                target instanceof HTMLElement &&
                target.closest &&
                (target.closest("#emoji-panel") || target.closest("#send-emoji"))
            ) {
                return;
            }
            UiChat.closeEmojiPanel(elements);
        });
    }

    // ── Init Stages ──

    function createDefaultInitStages() {
        return INIT_STAGE_ORDER.reduce((result, stage) => {
            result[stage] = { state: "pending", detail: "" };
            return result;
        }, {});
    }

    function setInitStage(stage, state, detail = "") {
        if (!appState.initStages[stage]) { return; }
        appState.initStages[stage] = { state: state || "pending", detail: detail ? String(detail) : "" };
        const stageLabel = INIT_STAGE_LABELS[stage] || stage;
        const markers = { success: "✓", running: "…", error: "✗" };
        const stateLabels = { success: "完成", running: "进行中", error: "失败" };
        const marker = markers[state] || "·";
        const stateLabel = stateLabels[state] || "等待";
        const detailText = detail ? ` | ${detail}` : "";
        console.info(`[AirCopy][Init] ${marker} ${stageLabel} ${stateLabel}${detailText}`);
    }

    // ── Dependencies ──

    function getHostFromUrl(url) {
        try { return new URL(String(url)).host || String(url); }
        catch (_error) { return String(url); }
    }

    async function loadDependencyFromUrls(label, urls, checkReady, options = {}) {
        if (typeof checkReady === "function" && checkReady()) { return true; }
        const list = Array.isArray(urls) ? urls : [];
        let lastError = null;
        for (let i = 0; i < list.length; i += 1) {
            const url = String(list[i] || "").trim();
            if (!url) { continue; }
            const host = getHostFromUrl(url);
            setStatus(`正在加载 ${label}（${host}）…`);
            try {
                await loadScriptOnce(url);
                if (typeof checkReady !== "function" || checkReady()) {
                    console.info(`[AirCopy][Dependency] ${label} loaded from ${host}`);
                    return true;
                }
                lastError = new Error(`${label} 脚本已加载但全局对象不可用`);
            } catch (error) {
                lastError = error;
                console.warn(`[AirCopy][Dependency] ${label} load failed from ${host}`, error);
            }
        }
        if (options.optional) {
            console.warn(`[AirCopy][Dependency] ${label} not available, continue without it`, lastError || "");
            return false;
        }
        throw (lastError || new Error(`${label} 加载失败`));
    }

    function hasPeerDependency() { return typeof window.Peer === "function"; }

    async function loadRuntimeDependencies() {
        setInitStage("dependency", "running", "开始加载第三方依赖");
        try {
            await loadDependencyFromUrls("PeerJS", DEPENDENCY_CDN_URLS.peerjs, hasPeerDependency);
            await loadDependencyFromUrls("QRCode", DEPENDENCY_CDN_URLS.qrcode, UiConnector.hasQrDependency);
            await loadDependencyFromUrls("ZXing", DEPENDENCY_CDN_URLS.zxing, UiConnector.hasScannerDependency, { optional: true });
            await loadDependencyFromUrls("jsQR", DEPENDENCY_CDN_URLS.jsqr, () => typeof jsQR === "function", { optional: true });
            setInitStage("dependency", "success", "依赖加载完成");
        } catch (error) {
            setInitStage("dependency", "error", toErrorMessage(error));
            throw error;
        }
    }

    function validateRuntimeDependencies() {
        const missingCore = [];
        if (!hasPeerDependency()) { missingCore.push("PeerJS"); }
        if (!UiConnector.hasQrDependency()) { missingCore.push("QRCode"); }
        const warnings = [];
        if (!UiConnector.hasScannerDependency()) { warnings.push("ZXing（内置扫码不可用）"); }
        if (missingCore.length > 0) {
            const detail = `缺少 ${missingCore.join(", ")}`;
            setInitStage("dependency", "error", detail);
            setStatus(`依赖加载失败：${detail}。请检查网络或 CDN 是否可用。`);
            return false;
        }
        const detail = warnings.length > 0 ? `可选依赖缺失：${warnings.join("，")}` : "依赖加载正常";
        setInitStage("dependency", "success", detail);
        return true;
    }

    // ── URL Helpers ──

    function getCurrentBaseUrl() {
        try {
            const url = new URL(String(window.location.href || document.URL || "").trim());
            url.searchParams.delete("pairId");
            url.searchParams.delete("peerId");
            return url.toString();
        } catch (_error) {
            const fallback = `${String(window.location.origin || "").trim()}${String(window.location.pathname || "").trim()}`;
            return fallback || String(window.location.href || document.URL || "").trim();
        }
    }

    function removePeerIdParamFromCurrentUrl(expectedPeerId = "") {
        try {
            const parsed = new URL(String(window.location.href || document.URL || ""));
            const urlPeerId = String(parsed.searchParams.get("peerId") || "").trim();
            if (!urlPeerId) { return false; }
            const expected = String(expectedPeerId || "").trim();
            if (expected && expected !== urlPeerId) { return false; }
            parsed.searchParams.delete("peerId");
            const nextUrl = parsed.toString();
            if (nextUrl !== window.location.href) {
                window.history.replaceState(window.history.state, "", nextUrl);
            }
            return true;
        } catch (_error) { return false; }
    }

    function renderBaseUrlText() {
        if (!elements.baseUrlText) { return; }
        const baseUrl = String(getCurrentBaseUrl() || "").trim();
        elements.baseUrlText.textContent = baseUrl || "(无法解析当前地址)";
        console.info(`[AirCopy][URL] base=${elements.baseUrlText.textContent} href=${window.location.href}`);
    }

    // ── Layout ──

    function updateLayoutMode() {
        appState.isMobileLayout = window.matchMedia("(max-width: 760px)").matches;
        if (!appState.isMobileLayout) { appState.sessionOpenMobile = false; }
        applySessionPanelState();
    }

    function toggleSessionPanel() {
        if (appState.isMobileLayout) {
            setSessionPanelOpen(!appState.sessionOpenMobile);
            return;
        }
        appState.sidebarCollapsedDesktop = !appState.sidebarCollapsedDesktop;
        if (!appState.sidebarCollapsedDesktop) { UiChat.clearUnread(appState, elements); }
        applySessionPanelState();
    }

    function setSessionPanelOpen(open) {
        appState.sessionOpenMobile = Boolean(open);
        applySessionPanelState();
        if (appState.sessionOpenMobile) { UiChat.clearUnread(appState, elements); }
    }

    function setSettingsPanelOpen(open) {
        appState.settingsOpen = Boolean(open);
        if (elements.sidebarSettings) { elements.sidebarSettings.classList.toggle("hidden", !appState.settingsOpen); }
        if (elements.settingsToggle) { elements.settingsToggle.setAttribute("aria-expanded", appState.settingsOpen ? "true" : "false"); }
    }

    function setHeaderMenuOpen(open) {
        appState.headerMenuOpen = Boolean(open);
        if (elements.chatMenu) { elements.chatMenu.classList.toggle("hidden", !appState.headerMenuOpen); }
        if (elements.chatMenuToggle) { elements.chatMenuToggle.setAttribute("aria-expanded", appState.headerMenuOpen ? "true" : "false"); }
    }

    function applySessionPanelState() {
        if (appState.isMobileLayout) {
            elements.chatInterfaceRoot.classList.toggle("session-open", appState.sessionOpenMobile);
            elements.chatInterfaceRoot.classList.remove("sidebar-collapsed");
        } else {
            elements.chatInterfaceRoot.classList.remove("session-open");
            elements.chatInterfaceRoot.classList.toggle("sidebar-collapsed", appState.sidebarCollapsedDesktop);
        }
    }

    // ── Peer Ready ──

    async function ensurePeerReady() {
        if (
            appState.localPeerId
            && peerManager
            && typeof peerManager.isSignalingConnected === "function"
            && peerManager.isSignalingConnected()
        ) {
            return appState.localPeerId;
        }
        appState.localPeerId = "";
        if (!hasPeerDependency()) {
            setInitStage("dependency", "error", "PeerJS 未加载");
            throw new Error("PeerJS 未加载，无法初始化节点。");
        }
        if (!appState.peerInitTask) {
            setInitStage("peer", "running", "正在连接 Peer 信令服务");
            appState.peerInitTask = withTimeout(
                peerManager.init(getDisplayName()),
                PEER_INIT_TIMEOUT_MS,
                `Peer 初始化超时（>${Math.round(PEER_INIT_TIMEOUT_MS / 1000)} 秒）`
            )
                .then((id) => {
                    appState.localPeerId = id;
                    setInitStage("peer", "success", `peerId=${formatPeerIdHint(id)}`);
                    return id;
                })
                .catch((error) => {
                    appState.localPeerId = "";
                    try { peerManager.destroy(); } catch (_destroyError) {}
                    setInitStage("peer", "error", toErrorMessage(error));
                    throw error;
                })
                .finally(() => {
                    appState.peerInitTask = null;
                });
        }
        return appState.peerInitTask;
    }

    // ── Connection State ──

    function setConnectionState(connected) {
        appState.connected = Boolean(connected);
        if (!appState.connected) {
            UiChat.closeEmojiPanel(elements);
            UiFileOffer.closeFileOfferModal(appState, elements);
            if (appState.recordingVoice) {
                UiFileOffer.stopVoiceRecording(appState, elements, false);
            }
        }
        UiChat.updateSendControlsEnabledState(appState, elements);
        UiFileOffer.updateVoiceButton(appState, elements);
        UiVideo.updateVideoButton(appState, elements);
        UiChat.setPeerPresence(appState, elements, appState.connected ? "online" : "offline");
    }

    function bindConversation(remotePersistentId, peerName = "", fallbackPeerId = "") {
        const normalizedPid = String(remotePersistentId || "").trim();
        let targetId = normalizedPid ? `pid:${normalizedPid}` : "";
        const fallbackId = String(fallbackPeerId || "").trim();
        if (!targetId && fallbackId) { targetId = `peer:${fallbackId}`; }
        if (!targetId) { return; }

        if (normalizedPid) {
            migrateTempConversationToPersistent(appState, targetId, fallbackId);
            appState.remotePersistentId = normalizedPid;
        }

        const conversation = ensureConversation(appState, targetId);
        if (peerName) { conversation.peerName = String(peerName); }
        if (fallbackId) { conversation.peerId = fallbackId.replace(/^peer:/, "") || fallbackId; }

        const switched = appState.currentConversationId !== targetId;
        appState.currentConversationId = targetId;
        appState.chatHistory = conversation.messages.slice(-CHAT_HISTORY_MAX);
        appState.unreadCount = Math.max(0, Number(conversation.unreadCount || 0));
        UiChat.setPeerName(appState, elements, conversation.peerName || peerName || "", { persist: false });
        UiVideo.syncVideoPrefForCurrentPeer(appState, elements);

        if (switched || elements.chatMessages.dataset.inited) {
            UiChat.renderHistoryFromState(appState, elements);
        }
        if (UiChat.isChatActive(elements)) {
            UiChat.clearUnread(appState, elements);
        } else {
            UiChat.renderUnread(appState, elements);
        }
        UiChat.renderSessionList(appState, elements);
        UiChat.updateSendControlsEnabledState(appState, elements);
        if (peerManager && typeof peerManager.setActivePeer === "function") {
            const targetPeerId = conversation.peerId || (fallbackPeerId ? String(fallbackPeerId).trim() : "");
            if (targetPeerId) { peerManager.setActivePeer(targetPeerId); }
        }
        persistChatState(appState);
    }

    // ── Reconnect Logic ──

    function clearRefreshReconnectPending() {
        if (!appState.refreshReconnectPending) { return; }
        if (appState.refreshReconnectPending.timer) {
            window.clearTimeout(appState.refreshReconnectPending.timer);
        }
        appState.refreshReconnectPending = null;
    }

    function isRefreshReconnectPending() {
        return Boolean(appState.refreshReconnectPending && appState.refreshReconnectPending.targetPeerId);
    }

    function markRefreshReconnectPending(targetPeerId, options = {}) {
        clearRefreshReconnectPending();
        const normalizedTargetPeerId = String(targetPeerId || "").trim();
        if (!normalizedTargetPeerId) { return; }
        const timeoutMs = Math.max(1000, Number(options.timeoutMs) || REFRESH_RECONNECT_TIMEOUT_MS);
        const pending = {
            targetPeerId: normalizedTargetPeerId,
            clearCachedPeerId: Boolean(options.clearCachedPeerId),
            removeUrlPeerIdParam: Boolean(options.removeUrlPeerIdParam),
            timer: null
        };
        pending.timer = window.setTimeout(() => {
            if (appState.refreshReconnectPending && appState.refreshReconnectPending.targetPeerId === normalizedTargetPeerId) {
                handleRefreshReconnectFailure("连接超时");
            }
        }, timeoutMs);
        appState.refreshReconnectPending = pending;
    }

    function handleRefreshReconnectFailure(reasonText) {
        const pending = appState.refreshReconnectPending;
        if (!pending) { return; }
        const targetPeerId = String(pending.targetPeerId || "").trim();
        clearRefreshReconnectPending();
        if (pending.clearCachedPeerId) { clearRecentNodePeerId(appState); }
        if (pending.removeUrlPeerIdParam) { removePeerIdParamFromCurrentUrl(targetPeerId); }
        const peerIdHint = formatPeerIdHint(targetPeerId);
        const suffix = peerIdHint ? `（目标 peerId: ${peerIdHint}）` : "";
        const clearText = pending.clearCachedPeerId ? "已清除缓存 peerId，不再自动重连。" : "本次不会自动重连。";
        const message = `重连失败${suffix}：${toErrorMessage(reasonText)}。${clearText}`;
        UiChat.appendMessage(appState, elements, "system", message, true);
        setStatus(message);
    }

    async function runManualReconnect() {
        if (appState.connected || appState.manualReconnectInProgress) { return false; }
        clearRefreshReconnectPending();
        const targetPeerId = getReconnectTargetPeerId(appState);
        if (!targetPeerId) {
            setStatus("没有可重连的 peerId，请重新扫码连接。");
            return false;
        }
        appState.manualReconnectInProgress = true;
        UiChat.setPeerPresence(appState, elements, appState.peerPresence);
        try {
            const localPeerId = await ensurePeerReady();
            if (targetPeerId === localPeerId) {
                clearRecentNodePeerId(appState);
                setStatus("保存的 peerId 指向当前节点，已清除，请重新扫码连接。");
                return false;
            }
            const peerIdHint = formatPeerIdHint(targetPeerId);
            const suffix = peerIdHint ? `（目标 peerId: ${peerIdHint}）` : "";
            setStatus(`正在重连${suffix}…`);
            peerManager.connect(targetPeerId, { force: true });
            return true;
        } catch (error) {
            setStatus(`重连失败：${toErrorMessage(error)}。`);
            return false;
        } finally {
            appState.manualReconnectInProgress = false;
            UiChat.setPeerPresence(appState, elements, appState.peerPresence);
        }
    }

    function readUrlPeerIdTarget() {
        try {
            const parsed = new URL(window.location.href);
            const hasPairIdParam = parsed.searchParams.has("pairId");
            const hasPeerIdParam = parsed.searchParams.has("peerId");
            const value = String(parsed.searchParams.get("pairId") || parsed.searchParams.get("peerId") || "").trim();
            return { hasTargetParam: hasPairIdParam || hasPeerIdParam, pairId: value, sourceParam: hasPairIdParam ? "pairId" : (hasPeerIdParam ? "peerId" : "") };
        } catch (_error) {
            return { hasTargetParam: false, pairId: "", sourceParam: "" };
        }
    }

    async function tryConnectToUrlPeerIdOnFirstLoad() {
        const target = readUrlPeerIdTarget();
        if (!target.hasTargetParam) { return false; }
        UiConnector.setScanVisualSuccess(appState, elements, true);
        appState.refreshReconnectAttempted = true;
        const urlPeerId = target.pairId;
        const sourceParam = target.sourceParam || "pairId";
        if (!urlPeerId) {
            if (sourceParam === "peerId") { removePeerIdParamFromCurrentUrl(); }
            setStatus("URL 中的 pairId/peerId 为空，请重新扫码连接。");
            return true;
        }
        try {
            const localPeerId = await ensurePeerReady();
            if (urlPeerId === localPeerId) {
                setStatus(`URL 中的 ${sourceParam} 指向当前节点，已跳过连接。`);
                return true;
            }
            markRefreshReconnectPending(urlPeerId, { clearCachedPeerId: false, removeUrlPeerIdParam: sourceParam === "peerId" });
            const connectResult = peerManager.connect(urlPeerId);
            if (connectResult && connectResult.reused) {
                clearRefreshReconnectPending();
                const knownPersistentId = appState.remotePersistentId || connectResult.peerPersistentId || "";
                const knownPeerName = connectResult.peerName || appState.peerName || "";
                bindConversation(knownPersistentId, knownPeerName, urlPeerId);
                rememberPeerNode(appState, { persistentId: knownPersistentId, peerName: knownPeerName, peerId: urlPeerId });
                setConnectionState(true);
                UiChat.clearUnread(appState, elements);
                UiChat.enterChatInterface(appState, elements);
                setStatus("已连接到 URL 指定节点，已打开对应会话。");
                return true;
            }
            setStatus(`检测到 URL ${sourceParam}，正在发起连接…`);
            setSessionPanelOpen(false);
            return true;
        } catch (error) {
            clearRefreshReconnectPending();
            if (sourceParam === "peerId") { removePeerIdParamFromCurrentUrl(urlPeerId); }
            setStatus(`URL ${sourceParam} 连接失败：${toErrorMessage(error)}。`);
            return true;
        }
    }

    async function tryRefreshReconnectFromPersistedNode() {
        if (appState.refreshReconnectAttempted) { return; }
        appState.refreshReconnectAttempted = true;
        const hint = appState.recentNodeHint;
        if (!hint || !hint.persistentId || !hint.lastPeerId) { return; }
        try {
            const targetPeerId = String(hint.lastPeerId || "").trim();
            if (!targetPeerId) { return; }
            const localPeerId = await ensurePeerReady();
            if (targetPeerId === localPeerId) { clearRecentNodePeerId(appState); return; }
            markRefreshReconnectPending(targetPeerId, { clearCachedPeerId: true, removeUrlPeerIdParam: false });
            const connectResult = peerManager.connect(targetPeerId, { force: true });
            if (connectResult && connectResult.reused) { clearRefreshReconnectPending(); return; }
            const peerIdHint = formatPeerIdHint(targetPeerId);
            const peerTitle = hint.peerName || hint.persistentId;
            setStatus(`检测到历史节点 ${peerTitle}，正在尝试一次重连（peerId: ${peerIdHint}）…`);
        } catch (error) {
            if (isRefreshReconnectPending()) { handleRefreshReconnectFailure(error); return; }
            clearRecentNodePeerId(appState);
            setStatus(`历史节点重连失败：${toErrorMessage(error)}。已清除缓存 peerId，不再自动重连。`);
        }
    }

    async function tryReconnectAllPersistedConversations() {
        const conversations = appState.conversations || {};
        const allIds = Object.keys(conversations);
        if (allIds.length === 0) { return; }
        const peerMap = {};
        for (let i = 0; i < allIds.length; i += 1) {
            const id = allIds[i];
            const conversation = conversations[id];
            if (!conversation || !conversation.peerId) { continue; }
            const peerId = String(conversation.peerId).trim();
            if (!peerId) { continue; }
            if (!peerMap[peerId]) { peerMap[peerId] = []; }
            peerMap[peerId].push(id);
        }
        const peerIds = Object.keys(peerMap);
        if (peerIds.length === 0) { return; }
        appState.autoReconnectPeers = peerMap;
        try { await ensurePeerReady(); }
        catch (_error) { appState.autoReconnectPeers = {}; return; }
        for (let i = 0; i < peerIds.length; i += 1) {
            const peerId = peerIds[i];
            try { peerManager.connect(peerId); }
            catch (error) { handleAutoReconnectPeerFailure(peerId, error); }
        }
    }

    function handleAutoReconnectPeerFailure(peerId, reason) {
        const id = String(peerId || "").trim();
        if (!id || !appState.autoReconnectPeers || !appState.autoReconnectPeers[id]) { return; }
        const relatedConversations = appState.autoReconnectPeers[id] || [];
        delete appState.autoReconnectPeers[id];
        let changed = false;
        for (let i = 0; i < relatedConversations.length; i += 1) {
            const convId = relatedConversations[i];
            const conversation = appState.conversations[convId];
            if (conversation && conversation.peerId === id) {
                conversation.peerId = "";
                changed = true;
            }
        }
        if (changed) {
            persistChatState(appState);
            if (relatedConversations.indexOf(appState.currentConversationId) >= 0) {
                UiChat.updateSendControlsEnabledState(appState, elements);
            }
        }
        if (reason) {
            appendStatusLog(appState, `自动重连失败：${toErrorMessage(reason)}（peerId=${formatPeerIdHint(id)}）`, "auto-reconnect");
        }
    }

    // ── Heartbeat ──

    function handleHeartbeatPing(info) {
        UiChat.playHeartbeatFloatBurst(appState, elements);
        const peerId = info && info.peerId ? String(info.peerId).trim() : "";
        if (!peerId) { return; }
        const currentId = String(appState.currentConversationId || "").trim();
        const currentConversation = currentId ? appState.conversations[currentId] : null;
        const currentPeerId = currentConversation && currentConversation.peerId ? String(currentConversation.peerId).trim() : "";
        if (
            currentPeerId && currentPeerId === peerId
            && !appState.connected
            && peerManager && typeof peerManager.hasAnyConnection === "function" && peerManager.hasAnyConnection()
        ) {
            setConnectionState(true);
        }
        UiChat.renderSessionList(appState, elements);
    }

    // ── Error Handling ──

    function describePeerRuntimeError(error, fallbackMessage = "连接异常") {
        const message = toErrorMessage(error) || String(fallbackMessage || "连接异常");
        return {
            message,
            reason: error && error.reason ? String(error.reason) : message,
            source: error && error.source ? String(error.source) : "",
            code: error && error.code ? String(error.code) : "",
            phase: error && error.phase ? String(error.phase) : "",
            peerId: error && error.peerId ? String(error.peerId) : "",
            handledByConnectionClose: Boolean(error && error.handledByConnectionClose)
        };
    }

    function appendPeerRuntimeErrorLog(details, source = "peer-error") {
        if (!details || !details.message) { return; }
        const tags = [];
        if (details.source) { tags.push(details.source); }
        if (details.code) { tags.push(details.code); }
        if (details.phase) { tags.push(details.phase); }
        const tagText = tags.length > 0 ? ` [${tags.join("/")}]` : "";
        const peerText = details.peerId ? ` peerId=${formatPeerIdHint(details.peerId)}` : "";
        appendStatusLog(appState, `${details.message}${tagText}${peerText}`, source);
    }

    // ── Reset ──

    async function resetToSetup() {
        clearRefreshReconnectPending();
        UiConnector.setScanVisualSuccess(appState, elements, false);
        UiConnector.closeQrModal(elements);
        UiChat.closeEmojiPanel(elements);
        UiFileOffer.closeFileOfferModal(appState, elements);
        setSessionPanelOpen(false);
        setHeaderMenuOpen(false);
        document.body.classList.remove("chat-active");
        appState.videoState = "idle";
        if (appState.recordingVoice) {
            await UiFileOffer.stopVoiceRecording(appState, elements, false);
        }
        await UiConnector.stopScanIfRunning(appState, elements);
        peerManager.destroy();
        appState.localPeerId = "";
        appState.peerInitTask = null;
        appState.peerName = "";
        appState.remotePersistentId = "";
        appState.currentConversationId = "";
        appState.currentQrText = "";
        appState.handlingScan = false;
        appState.sidebarCollapsedDesktop = false;
        UiFileOffer.clearAllTransferProgress(appState);
        appState.chatHistory = [];
        appState.unreadCount = 0;
        elements.chatMessages.innerHTML = "";
        delete elements.chatMessages.dataset.inited;
        setConnectionState(false);
        UiVideo.resetVideoUI(appState, elements, "未开始");
        UiVideo.closeVideoModal(appState, elements, { keepCall: false, peerManager: peerManager });
        UiFileOffer.releaseObjectUrls(appState);
        UiChat.renderUnread(appState, elements);
        UiChat.setPeerName(appState, elements, "", { persist: false });
        elements.chatInterface.classList.add("hidden");
        elements.connectionSetup.classList.remove("hidden");
        const preferredMode = getPreferredConnectorMode(appState, appState.isMobileLayout ? "scanner" : "qr");
        await UiConnector.setMode(appState, elements, preferredMode, { force: true });
        setStatus("已退出会话，请重新扫码连接。");
    }

    // ── Status & Logs ──

    function setStatus(text) {
        const message = String(text || "");
        elements.statusText.textContent = message;
        appendStatusLog(appState, message, "status");
        console.info(`[AirCopy][Status] ${message}`);
    }

    function formatPeerIdHint(peerId) {
        const value = String(peerId || "").trim();
        if (!value) { return ""; }
        if (value.length <= 14) { return value; }
        return `${value.slice(0, 7)}...${value.slice(-5)}`;
    }

    function getDisplayName() {
        const name = elements.displayName.value.trim();
        return name || "匿名用户";
    }

    function formatLogTimestamp(ts) {
        const stamp = Number(ts) || Date.now();
        try { return new Date(stamp).toLocaleString("zh-CN", { hour12: false }); }
        catch (_error) { return String(stamp); }
    }

    function buildLatestLogsText() {
        const lines = [];
        const exportLimit = appState.statusLogMax;
        lines.push("[AirCopy] 最新日志");
        lines.push(`导出时间: ${formatLogTimestamp(Date.now())}`);
        lines.push(`页面: ${window.location.href}`);
        lines.push(`UA: ${navigator.userAgent || "unknown"}`);
        lines.push(`日志导出上限: ${exportLimit}`);
        lines.push("");
        const records = appState.statusLogs.slice(-exportLimit);
        if (records.length === 0) {
            lines.push("(暂无日志)");
        } else {
            for (let i = 0; i < records.length; i += 1) {
                const item = records[i];
                lines.push(`${formatLogTimestamp(item.ts)} [${item.source}] ${item.text}`);
            }
        }
        return lines.join("\n");
    }

    function setCopyLatestLogsButtonFeedback(state = "idle") {
        if (!elements.copyLatestLogs) { return; }
        if (appState.copyLogsFeedbackTimer) {
            window.clearTimeout(appState.copyLogsFeedbackTimer);
            appState.copyLogsFeedbackTimer = null;
        }
        elements.copyLatestLogs.classList.remove("state-success");
        if (state === "success") {
            elements.copyLatestLogs.textContent = "已复制";
            elements.copyLatestLogs.classList.add("state-success");
            appState.copyLogsFeedbackTimer = window.setTimeout(() => setCopyLatestLogsButtonFeedback("idle"), COPY_LOGS_FEEDBACK_MS);
            return;
        }
        if (state === "error") {
            elements.copyLatestLogs.textContent = "复制失败";
            appState.copyLogsFeedbackTimer = window.setTimeout(() => setCopyLatestLogsButtonFeedback("idle"), COPY_LOGS_FEEDBACK_MS);
            return;
        }
        elements.copyLatestLogs.textContent = "复制最新日志";
    }

    function setClearLatestLogsButtonFeedback(state = "idle") {
        if (!elements.clearLatestLogs) { return; }
        if (appState.clearLogsFeedbackTimer) {
            window.clearTimeout(appState.clearLogsFeedbackTimer);
            appState.clearLogsFeedbackTimer = null;
        }
        elements.clearLatestLogs.classList.remove("state-success");
        if (state === "success") {
            elements.clearLatestLogs.textContent = "已清空";
            elements.clearLatestLogs.classList.add("state-success");
            appState.clearLogsFeedbackTimer = window.setTimeout(() => setClearLatestLogsButtonFeedback("idle"), COPY_LOGS_FEEDBACK_MS);
            return;
        }
        if (state === "error") {
            elements.clearLatestLogs.textContent = "清空失败";
            appState.clearLogsFeedbackTimer = window.setTimeout(() => setClearLatestLogsButtonFeedback("idle"), COPY_LOGS_FEEDBACK_MS);
            return;
        }
        elements.clearLatestLogs.textContent = "清空日志/缓存日志";
    }

    async function copyLatestLogs() {
        const logs = buildLatestLogsText();
        try {
            await copyTextToClipboard(logs);
            setCopyLatestLogsButtonFeedback("success");
            const copiedCount = Math.min(appState.statusLogs.length, appState.statusLogMax);
            setStatus(`已复制最新日志（${copiedCount} 条）。`);
        } catch (error) {
            setCopyLatestLogsButtonFeedback("error");
            setStatus(`复制日志失败：${toErrorMessage(error)}`);
        }
    }

    function clearLatestLogs() {
        try {
            appState.statusLogs = [];
            try { localStorage.removeItem(STATUS_LOG_STORAGE_KEY); } catch (_error) {}
            if (elements.statusText) { elements.statusText.textContent = "日志已清空。"; }
            setCopyLatestLogsButtonFeedback("idle");
            setClearLatestLogsButtonFeedback("success");
            console.info("[AirCopy][Status] 日志已清空。");
        } catch (error) {
            setClearLatestLogsButtonFeedback("error");
            setStatus(`清空日志失败：${toErrorMessage(error)}`);
        }
    }

    // ── Cleanup ──

    window.addEventListener("beforeunload", () => {
        if (appState.copyLogsFeedbackTimer) {
            window.clearTimeout(appState.copyLogsFeedbackTimer);
            appState.copyLogsFeedbackTimer = null;
        }
        if (appState.clearLogsFeedbackTimer) {
            window.clearTimeout(appState.clearLogsFeedbackTimer);
            appState.clearLogsFeedbackTimer = null;
        }
        clearRefreshReconnectPending();
        UiConnector.closeQrModal(elements);
        UiChat.closeEmojiPanel(elements);
        UiFileOffer.closeFileOfferModal(appState, elements);
        UiFileOffer.releaseObjectUrls(appState);
        UiConnector.stopScanIfRunning(appState, elements);
        if (peerManager) { peerManager.destroy(); }
    });
})();
