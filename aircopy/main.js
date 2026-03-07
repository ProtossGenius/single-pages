(function () {
    const CHAT_STORAGE_KEY = "aircopy.chat.state.v3";
    const LEGACY_CHAT_STORAGE_KEY = "aircopy.chat.state.v2";
    const SELF_ID_STORAGE_KEY = "aircopy.self.id.v1";
    const NODE_HINT_STORAGE_KEY = "aircopy.node.hint.v1";
    const CONNECTOR_MODE_STORAGE_KEY = "aircopy.connector.mode.v1";
    const STATUS_LOG_MAX_STORAGE_KEY = "aircopy.status.log.max.v1";
    const CHAT_HISTORY_MAX = 300;
    const STATUS_LOG_DEFAULT_MAX = 240;
    const STATUS_LOG_MIN = 20;
    const STATUS_LOG_HARD_MAX = 5000;
    const COPY_LOGS_FEEDBACK_MS = 1200;
    const PEER_INIT_TIMEOUT_MS = 20000;
    const EMOJI_SET = ["😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤔", "😭", "😡", "👍", "👎", "🙏", "👏", "🎉"];
    const HEART_FLOAT_CHARS = ["❤", "♥", "❥"];
    const INIT_STAGE_ORDER = ["bootstrap", "location", "dependency", "peer", "qrcode"];
    const INIT_STAGE_LABELS = {
        bootstrap: "页面启动",
        location: "页面地址解析",
        dependency: "依赖检查",
        peer: "Peer 节点初始化",
        qrcode: "二维码生成"
    };
    const SCRIPT_LOAD_TIMEOUT_MS = 4500;
    const DEPENDENCY_CDN_URLS = {
        peerjs: [
            "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js",
            "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js",
            "./vendor/peerjs.min.js"
        ],
        qrcode: [
            "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js",
            "https://unpkg.com/qrcodejs@1.0.0/qrcode.min.js",
            "./vendor/qrcode.min.js"
        ],
        zxing: [
            "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js",
            "https://unpkg.com/@zxing/browser@0.1.5/umd/zxing-browser.min.js",
            "./vendor/zxing-browser.min.js"
        ],
        jsqr: [
            "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js",
            "https://unpkg.com/jsqr@1.4.0/dist/jsQR.min.js",
            "./vendor/jsQR.min.js"
        ]
    };

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
        unreadCount: 0,
        chatHistory: [],
        conversations: {},
        statusLogs: [],
        statusLogMax: STATUS_LOG_DEFAULT_MAX,
        isMobileLayout: false,
        sidebarCollapsedDesktop: false,
        sessionOpenMobile: false,
        settingsOpen: false,
        copyLogsFeedbackTimer: null,
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
        autoReconnectAttempted: false,
        autoReconnectInProgress: false,
        autoReconnectTargetPeerId: "",
        autoReconnectLastFailureAt: 0,
        autoReconnectLastFailureReason: "",
        peerInitTask: null,
        initStages: createDefaultInitStages(),
        modeTask: Promise.resolve(),
        scannerTask: Promise.resolve()
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
        statusLogMaxInput: document.getElementById("status-log-max"),
        peerSessionName: document.getElementById("peer-session-name"),
        peerSessionStatus: document.getElementById("peer-session-status"),
        peerSessionUnread: document.getElementById("peer-session-unread"),
        sessionToggle: document.getElementById("session-toggle"),
        sessionBackdrop: document.getElementById("session-backdrop"),
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

    const peerManager = (typeof PeerManager === "function") ? new PeerManager({
        onLocalId: (id) => {
            appState.localPeerId = id;
        },
        onConnected: (info) => {
            clearAutoReconnectState();
            if (info && info.peerName) {
                setPeerName(info.peerName, { persist: false });
            }
            if (info) {
                bindConversation(info.peerPersistentId || "", info.peerName || appState.peerName || "", info.peerId || "");
                rememberPeerNode({
                    persistentId: info.peerPersistentId || "",
                    peerName: info.peerName || appState.peerName || "",
                    peerId: info.peerId || ""
                });
            }
            setConnectionState(true);
            clearUnread();
            enterChatInterface();
            setStatus("连接成功。");
        },
        onConnectionClosed: (info) => {
            const wasConnected = appState.connected;
            if (wasConnected) {
                appendMessage("system", "连接已断开。", true);
                setPeerName("", { persist: false });
                appState.remotePersistentId = "";
                setConnectionState(false);
                clearAllTransferProgress();
                resetVideoUI("未开始");
                closeFileOfferModal();
            }
            const closedPeerId = info && info.peerId ? String(info.peerId) : "";
            const reconnectTarget = closedPeerId || (
                appState.recentNodeHint && appState.recentNodeHint.lastPeerId
                    ? String(appState.recentNodeHint.lastPeerId)
                    : ""
            );
            const started = markReconnectTarget(reconnectTarget, {
                announce: wasConnected
            });
            if (!started && wasConnected) {
                setStatus("连接已断开，可重新扫码连接。");
            }
        },
        onError: (error) => {
            if (!appState.connected && isAutoReconnectActive()) {
                appState.autoReconnectInProgress = false;
                reportAutoReconnectFailure(error, { clearPeerId: true });
                return;
            }
            setStatus(`连接异常：${toErrorMessage(error)}`);
        },
        onMessage: (message) => {
            const remotePersistentId = message && message.persistentId ? String(message.persistentId) : "";
            if (remotePersistentId) {
                bindConversation(remotePersistentId, message.name || appState.peerName || "", message.peerId || "");
                rememberPeerNode({
                    persistentId: remotePersistentId,
                    peerName: message.name || appState.peerName || "",
                    peerId: message.peerId || ""
                });
            }
            if (message.type === "hello") {
                const remoteName = message.name || appState.peerName || "对方";
                setPeerName(remoteName);
                appendMessage("system", `hello ${getDisplayName()} 与 ${remoteName}`, true);
                markUnreadIfNeeded(true);
                return;
            }
            appendMessage(message.from, message.body, message.type === "hello");
            markUnreadIfNeeded(message.from === "peer");
        },
        onHeartbeat: () => {
            playHeartbeatFloatBurst();
        },
        onIncomingFileOffer: (offer) => {
            appState.incomingFileOffer = offer || null;
            showFileOfferModal();
        },
        onTransferProgress: (progress) => {
            updateTransferProgress(progress);
        },
        onFileReceived: async (payload) => {
            clearTransferProgress(payload.transferId);
            await appendAttachmentMessage("peer", payload);
            markUnreadIfNeeded(true);
            if (payload.savedToDisk) {
                appendMessage("system", `文件已保存到本地：${payload.fileName}`, true);
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
            setVideoStatus(`${callerName} 邀请视频通话`);
            openVideoModal({ incoming: true });
            updateVideoButton();
        },
        onLocalStream: (stream, info) => {
            elements.localVideo.srcObject = stream || null;
            if (elements.localVideo && elements.localVideo.parentElement) {
                const noVideo = !info || !info.hasVideoTrack;
                elements.localVideo.parentElement.classList.toggle("video-off", noVideo);
            }
            applyLocalMediaTrackToggles();
            ensureVideoPlayback(elements.localVideo, { muted: true });
        },
        onRemoteStream: (stream, info) => {
            elements.remoteVideo.srcObject = stream || null;
            if (elements.remoteVideo && elements.remoteVideo.parentElement) {
                const noVideo = !info || !info.hasVideoTrack;
                elements.remoteVideo.parentElement.classList.toggle("video-off", noVideo);
            }
            ensureVideoPlayback(elements.remoteVideo, { muted: false });
            if (stream) {
                openVideoModal({ incoming: false });
            }
        },
        onCallState: (state) => {
            const next = state && state.state ? state.state : "idle";
            if (next === "calling") {
                setVideoStatus("呼叫中...");
                appState.videoState = "calling";
            } else if (next === "connecting") {
                setVideoStatus("连接中...");
                appState.videoState = "connecting";
            } else if (next === "connected") {
                setVideoStatus("通话中");
                appState.videoState = "connected";
            } else if (next === "rejected") {
                setVideoStatus("对方未接听");
                appState.videoState = "idle";
            } else if (next === "error") {
                setVideoStatus("通话异常");
                appState.videoState = "idle";
            } else {
                setVideoStatus("未开始");
                appState.videoState = "idle";
                appState.incomingCallInfo = null;
                if (elements.videoModal && !elements.videoModal.classList.contains("hidden")) {
                    closeVideoModal({ keepCall: false });
                }
            }
            updateVideoButton();
        },
        onStateChange: (state) => {
            if (state === "disconnected") {
                appState.localPeerId = "";
                setStatus("Peer 服务连接断开，尝试刷新二维码重连。");
            }
        }
    }) : null;

    let codeReader = null;

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

    void init().catch((error) => {
        console.error("[AirCopy][InitError]", error);
        setStatus(`初始化失败：${toErrorMessage(error)}`);
    });

    async function init() {
        appState.initStages = createDefaultInitStages();
        setInitStage("bootstrap", "running", "入口脚本已启动");
        ensureLocalPersistentId();
        loadPersistedNodeHint();
        loadConnectorModePreference();
        loadStatusLogMaxSetting();
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
        elements.displayName.addEventListener("input", () => {
            peerManager.setDisplayName(getDisplayName());
        });

        elements.toggleMethod.addEventListener("click", () => {
            const nextMode = appState.mode === "qr" ? "scanner" : "qr";
            setMode(nextMode);
        });

        elements.scanTrigger.addEventListener("click", () => {
            if (appState.scannerRunning) {
                stopScanIfRunning();
            } else {
                startScan();
            }
        });

        elements.regenOffer.addEventListener("click", () => {
            regenerateOffer();
        });
        elements.backToChat.addEventListener("click", () => {
            showChatScreen();
        });

        elements.enlargeQr.addEventListener("click", openQrModal);
        elements.qrcode.addEventListener("dblclick", openQrModal);
        elements.qrModalClose.addEventListener("click", closeQrModal);
        elements.qrModal.addEventListener("click", (event) => {
            if (event.target === elements.qrModal) {
                closeQrModal();
            }
        });
        elements.sessionToggle.addEventListener("click", toggleSessionPanel);
        elements.sessionBackdrop.addEventListener("click", () => {
            setSessionPanelOpen(false);
        });
        elements.openConnector.addEventListener("click", () => {
            showConnectorScreen();
        });
        elements.sessionList.addEventListener("click", () => {
            clearUnread();
            if (appState.isMobileLayout) {
                setSessionPanelOpen(false);
            }
        });
        if (elements.settingsToggle) {
            elements.settingsToggle.addEventListener("click", () => {
                setSettingsPanelOpen(!appState.settingsOpen);
            });
        }
        if (elements.statusLogMaxInput) {
            elements.statusLogMaxInput.addEventListener("change", () => {
                const previous = appState.statusLogMax;
                setStatusLogMax(elements.statusLogMaxInput.value);
                if (appState.statusLogMax !== previous) {
                    setStatus(`日志保留上限已设置为 ${appState.statusLogMax} 条。`);
                }
            });
            elements.statusLogMaxInput.addEventListener("blur", () => {
                setStatusLogMax(elements.statusLogMaxInput.value);
            });
        }
        if (elements.copyLatestLogs) {
            elements.copyLatestLogs.addEventListener("click", copyLatestLogs);
        }

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closeQrModal();
                setSessionPanelOpen(false);
                setSettingsPanelOpen(false);
                closeEmojiPanel();
                closeVideoModal({ keepCall: true });
                if (appState.incomingFileOffer) {
                    rejectIncomingFileOffer();
                }
            }
        });
        window.addEventListener("resize", updateLayoutMode);
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
                clearUnread();
                void tryReconnectOnPageVisible();
            }
        });

        elements.sendBtn.addEventListener("click", sendCurrentMessage);
        elements.exitChat.addEventListener("click", resetToSetup);
        elements.sendFile.addEventListener("click", () => {
            if (!appState.connected) {
                setStatus("尚未连接，当前无法发送文件。");
                return;
            }
            elements.fileInput.click();
        });
        elements.fileInput.addEventListener("change", onFileInputChanged);
        elements.sendEmoji.addEventListener("click", toggleEmojiPanel);
        elements.recordVoice.addEventListener("click", toggleVoiceRecording);
        elements.videoCall.addEventListener("click", toggleVideoCall);
        elements.videoShowToggle.addEventListener("change", onVideoShowToggleChanged);
        elements.videoMuteToggle.addEventListener("change", onVideoMuteToggleChanged);
        elements.acceptVideoCall.addEventListener("click", acceptIncomingVideoCall);
        elements.rejectVideoCall.addEventListener("click", rejectIncomingVideoCall);
        elements.hangupVideo.addEventListener("click", () => {
            peerManager.hangupVideoCall();
            appState.videoState = "idle";
            updateVideoButton();
        });
        elements.closeVideoModal.addEventListener("click", () => closeVideoModal({ keepCall: true }));
        elements.localVideo.addEventListener("click", () => {
            ensureVideoPlayback(elements.localVideo, { muted: true });
        });
        elements.remoteVideo.addEventListener("click", () => {
            ensureVideoPlayback(elements.remoteVideo, { muted: false });
        });
        elements.acceptFileOffer.addEventListener("click", acceptIncomingFileOffer);
        elements.rejectFileOffer.addEventListener("click", rejectIncomingFileOffer);
        elements.messageInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendCurrentMessage();
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
            closeEmojiPanel();
        });

        updateLayoutMode();
        initEmojiPanel();
        syncVideoPrefForCurrentPeer();
        setSettingsPanelOpen(false);
        setConnectionState(false);
        updateVideoButton();
        loadPersistedChatState();
        const isMobile = /Android|webOS|iPhone|iPod|iPad|Mobile/i.test(navigator.userAgent);
        const initialMode = getPreferredConnectorMode(isMobile ? "scanner" : "qr");
        setInitStage("bootstrap", "success", "基础页面初始化完成");
        void (async () => {
            await setMode(initialMode, { force: true });
            const hasUrlPeerTarget = await tryConnectToUrlPeerIdOnFirstLoad();
            if (!hasUrlPeerTarget) {
                await tryAutoReconnectFromPersistedNode();
            }
        })();
    }

    function createDefaultInitStages() {
        return INIT_STAGE_ORDER.reduce((result, stage) => {
            result[stage] = {
                state: "pending",
                detail: ""
            };
            return result;
        }, {});
    }

    function getInitStageMarker(state) {
        if (state === "success") {
            return "✓";
        }
        if (state === "running") {
            return "…";
        }
        if (state === "error") {
            return "✗";
        }
        return "·";
    }

    function getInitStageStateLabel(state) {
        if (state === "success") {
            return "完成";
        }
        if (state === "running") {
            return "进行中";
        }
        if (state === "error") {
            return "失败";
        }
        return "等待";
    }

    function setInitStage(stage, state, detail = "") {
        if (!appState.initStages[stage]) {
            return;
        }
        appState.initStages[stage] = {
            state: state || "pending",
            detail: detail ? String(detail) : ""
        };
        const stageLabel = INIT_STAGE_LABELS[stage] || stage;
        const marker = getInitStageMarker(state);
        const stateLabel = getInitStageStateLabel(state);
        const detailText = detail ? ` | ${detail}` : "";
        console.info(`[AirCopy][Init] ${marker} ${stageLabel} ${stateLabel}${detailText}`);
    }

    function getHostFromUrl(url) {
        try {
            return new URL(String(url)).host || String(url);
        } catch (_error) {
            return String(url);
        }
    }

    function loadScriptOnce(url, timeoutMs = SCRIPT_LOAD_TIMEOUT_MS) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-aircopy-src="${url}"]`);
            if (existing && existing.dataset.loaded === "1") {
                resolve(url);
                return;
            }
            const script = existing || document.createElement("script");
            if (!existing) {
                script.src = url;
                script.async = true;
                script.dataset.aircopySrc = url;
                document.head.appendChild(script);
            }

            let settled = false;
            const done = (ok, value) => {
                if (settled) {
                    return;
                }
                settled = true;
                window.clearTimeout(timer);
                script.onload = null;
                script.onerror = null;
                if (ok) {
                    script.dataset.loaded = "1";
                    resolve(value);
                } else {
                    reject(value);
                }
            };

            const timer = window.setTimeout(() => {
                done(false, new Error(`加载超时: ${url}`));
                if (!existing) {
                    try {
                        script.remove();
                    } catch (_removeError) {
                        // Ignore.
                    }
                }
            }, Math.max(1000, Number(timeoutMs) || SCRIPT_LOAD_TIMEOUT_MS));

            script.onload = () => done(true, url);
            script.onerror = () => {
                done(false, new Error(`加载失败: ${url}`));
                if (!existing) {
                    try {
                        script.remove();
                    } catch (_removeError) {
                        // Ignore.
                    }
                }
            };
        });
    }

    async function loadDependencyFromUrls(label, urls, checkReady, options = {}) {
        if (typeof checkReady === "function" && checkReady()) {
            return true;
        }
        const list = Array.isArray(urls) ? urls : [];
        let lastError = null;
        for (let i = 0; i < list.length; i += 1) {
            const url = String(list[i] || "").trim();
            if (!url) {
                continue;
            }
            const host = getHostFromUrl(url);
            setStatus(`正在加载 ${label}（${host}）…`);
            try {
                await loadScriptOnce(url, SCRIPT_LOAD_TIMEOUT_MS);
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

    async function loadRuntimeDependencies() {
        setInitStage("dependency", "running", "开始加载第三方依赖");
        try {
            await loadDependencyFromUrls("PeerJS", DEPENDENCY_CDN_URLS.peerjs, hasPeerDependency);
            await loadDependencyFromUrls("QRCode", DEPENDENCY_CDN_URLS.qrcode, hasQrDependency);
            await loadDependencyFromUrls("ZXing", DEPENDENCY_CDN_URLS.zxing, hasScannerDependency, { optional: true });
            await loadDependencyFromUrls("jsQR", DEPENDENCY_CDN_URLS.jsqr, () => typeof jsQR === "function", { optional: true });
            setInitStage("dependency", "success", "依赖加载完成");
        } catch (error) {
            setInitStage("dependency", "error", toErrorMessage(error));
            throw error;
        }
    }

    function hasPeerDependency() {
        return typeof window.Peer === "function";
    }

    function hasQrDependency() {
        return typeof window.QRCode === "function";
    }

    function hasScannerDependency() {
        return Boolean(window.ZXingBrowser && window.ZXingBrowser.BrowserQRCodeReader);
    }

    function validateRuntimeDependencies() {
        const missingCore = [];
        if (!hasPeerDependency()) {
            missingCore.push("PeerJS");
        }
        if (!hasQrDependency()) {
            missingCore.push("QRCode");
        }
        const warnings = [];
        if (!hasScannerDependency()) {
            warnings.push("ZXing（内置扫码不可用）");
        }

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

    function ensureCodeReader() {
        if (codeReader) {
            return codeReader;
        }
        if (!hasScannerDependency()) {
            throw new Error("扫码依赖 ZXing 未加载，无法启动内置扫码。");
        }
        codeReader = new ZXingBrowser.BrowserQRCodeReader();
        return codeReader;
    }

    function withTimeout(taskPromise, timeoutMs, message) {
        const timeout = Math.max(0, Number(timeoutMs) || 0);
        if (!timeout) {
            return Promise.resolve(taskPromise);
        }
        return new Promise((resolve, reject) => {
            let settled = false;
            const timer = window.setTimeout(() => {
                if (settled) {
                    return;
                }
                settled = true;
                reject(new Error(message || "操作超时"));
            }, timeout);
            Promise.resolve(taskPromise)
                .then((value) => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    window.clearTimeout(timer);
                    resolve(value);
                })
                .catch((error) => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    window.clearTimeout(timer);
                    reject(error);
                });
        });
    }

    function getCurrentBaseUrl() {
        try {
            const href = String(window.location.href || document.URL || "").trim();
            const url = new URL(href);
            url.searchParams.delete("pairId");
            url.searchParams.delete("peerId");
            return url.toString();
        } catch (_error) {
            const origin = String(window.location.origin || "").trim();
            const path = String(window.location.pathname || "").trim();
            const fallback = `${origin}${path}`;
            if (fallback) {
                return fallback;
            }
            return String(window.location.href || document.URL || "").trim();
        }
    }

    function removePeerIdParamFromCurrentUrl(expectedPeerId = "") {
        try {
            const parsed = new URL(String(window.location.href || document.URL || ""));
            const urlPeerId = String(parsed.searchParams.get("peerId") || "").trim();
            if (!urlPeerId) {
                return false;
            }
            const expected = String(expectedPeerId || "").trim();
            if (expected && expected !== urlPeerId) {
                return false;
            }
            parsed.searchParams.delete("peerId");
            const nextUrl = parsed.toString();
            if (nextUrl !== window.location.href) {
                window.history.replaceState(window.history.state, "", nextUrl);
            }
            return true;
        } catch (_error) {
            return false;
        }
    }

    function renderBaseUrlText() {
        if (!elements.baseUrlText) {
            return;
        }
        const baseUrl = String(getCurrentBaseUrl() || "").trim();
        elements.baseUrlText.textContent = baseUrl || "(无法解析当前地址)";
        console.info(`[AirCopy][URL] base=${elements.baseUrlText.textContent} href=${window.location.href}`);
    }

    function setMode(mode, options = {}) {
        appState.modeTask = appState.modeTask.then(async () => {
            const normalizedMode = normalizeConnectorMode(mode);
            if (!options.force && normalizedMode === appState.mode) {
                return;
            }

            appState.mode = normalizedMode;
            persistConnectorModePreference(normalizedMode);
            const isQr = normalizedMode === "qr";
            if (isQr) {
                await stopScanIfRunning();
            }

            elements.qrContainer.classList.toggle("hidden", !isQr);
            elements.scannerContainer.classList.toggle("hidden", isQr);
            elements.scanTrigger.classList.toggle("hidden", isQr);
            elements.regenOffer.classList.toggle("hidden", !isQr);
            elements.enlargeQr.classList.toggle("hidden", !isQr);
            elements.toggleMethod.textContent = isQr ? "切换到扫描框" : "切换到二维码";

            if (isQr) {
                if (!options.preserveQr && options.generateIfNeeded !== false) {
                    await regenerateOffer();
                }
            } else {
                if (hasScannerDependency()) {
                    setStatus("已切到扫码模式，点击“开始扫码”后扫描对方页面 URL 二维码即可连接。");
                } else {
                    setStatus("已切到扫码模式，但扫码依赖未加载。请检查网络后刷新页面。");
                }
            }
            updateScanButton();
        }).catch((error) => {
            setStatus(`模式切换失败：${toErrorMessage(error)}`);
        });

        return appState.modeTask;
    }

    function updateLayoutMode() {
        appState.isMobileLayout = window.matchMedia("(max-width: 760px)").matches;
        if (!appState.isMobileLayout) {
            appState.sessionOpenMobile = false;
        }
        applySessionPanelState();
    }

    function toggleSessionPanel() {
        if (appState.isMobileLayout) {
            setSessionPanelOpen(!appState.sessionOpenMobile);
            return;
        }
        appState.sidebarCollapsedDesktop = !appState.sidebarCollapsedDesktop;
        if (!appState.sidebarCollapsedDesktop) {
            clearUnread();
        }
        applySessionPanelState();
    }

    function setSessionPanelOpen(open) {
        appState.sessionOpenMobile = Boolean(open);
        applySessionPanelState();
        if (appState.sessionOpenMobile) {
            clearUnread();
        }
    }

    function setSettingsPanelOpen(open) {
        appState.settingsOpen = Boolean(open);
        if (elements.sidebarSettings) {
            elements.sidebarSettings.classList.toggle("hidden", !appState.settingsOpen);
        }
        if (elements.settingsToggle) {
            elements.settingsToggle.setAttribute("aria-expanded", appState.settingsOpen ? "true" : "false");
        }
    }

    function normalizeStatusLogMax(value, fallback = STATUS_LOG_DEFAULT_MAX) {
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

    function loadStatusLogMaxSetting() {
        let next = STATUS_LOG_DEFAULT_MAX;
        try {
            const raw = localStorage.getItem(STATUS_LOG_MAX_STORAGE_KEY);
            if (raw !== null && raw !== "") {
                next = normalizeStatusLogMax(raw);
            }
        } catch (_error) {
            next = STATUS_LOG_DEFAULT_MAX;
        }
        setStatusLogMax(next, { persist: false });
    }

    function persistStatusLogMaxSetting() {
        try {
            localStorage.setItem(STATUS_LOG_MAX_STORAGE_KEY, String(appState.statusLogMax));
        } catch (_error) {
            // Ignore storage failures.
        }
    }

    function setStatusLogMax(maxCount, options = {}) {
        const normalized = normalizeStatusLogMax(maxCount, appState.statusLogMax);
        appState.statusLogMax = normalized;
        if (elements.statusLogMaxInput && elements.statusLogMaxInput.value !== String(normalized)) {
            elements.statusLogMaxInput.value = String(normalized);
        }
        if (appState.statusLogs.length > normalized) {
            appState.statusLogs.splice(0, appState.statusLogs.length - normalized);
        }
        if (options.persist !== false) {
            persistStatusLogMaxSetting();
        }
    }

    function normalizeConnectorMode(mode) {
        return mode === "scanner" ? "scanner" : "qr";
    }

    function loadConnectorModePreference() {
        try {
            const raw = String(localStorage.getItem(CONNECTOR_MODE_STORAGE_KEY) || "").trim();
            appState.preferredConnectorMode = raw === "scanner" || raw === "qr" ? raw : "";
        } catch (_error) {
            appState.preferredConnectorMode = "";
        }
    }

    function persistConnectorModePreference(mode) {
        const normalized = normalizeConnectorMode(mode);
        appState.preferredConnectorMode = normalized;
        try {
            localStorage.setItem(CONNECTOR_MODE_STORAGE_KEY, normalized);
        } catch (_error) {
            // Ignore storage failures.
        }
    }

    function getPreferredConnectorMode(fallbackMode = "qr") {
        if (appState.preferredConnectorMode === "qr" || appState.preferredConnectorMode === "scanner") {
            return appState.preferredConnectorMode;
        }
        return normalizeConnectorMode(fallbackMode);
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

    function showConnectorScreen() {
        setScanVisualSuccess(false);
        elements.chatInterface.classList.add("hidden");
        elements.connectionSetup.classList.remove("hidden");
        elements.backToChat.classList.toggle("hidden", !appState.connected);
        const preferred = getPreferredConnectorMode(appState.isMobileLayout ? "scanner" : "qr");
        setMode(preferred, { force: true });
    }

    function showChatScreen() {
        elements.connectionSetup.classList.add("hidden");
        elements.chatInterface.classList.remove("hidden");
        elements.backToChat.classList.add("hidden");
        clearUnread();
    }

    function ensureLocalPersistentId() {
        let persistentId = "";
        try {
            persistentId = String(localStorage.getItem(SELF_ID_STORAGE_KEY) || "").trim();
        } catch (_error) {
            // Ignore storage failures and fallback to runtime ID.
        }
        if (!persistentId) {
            persistentId = createPersistentId();
            try {
                localStorage.setItem(SELF_ID_STORAGE_KEY, persistentId);
            } catch (_error) {
                // Ignore storage failures and continue with runtime ID.
            }
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

    function loadPersistedNodeHint() {
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

    function persistNodeHint() {
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
        } catch (_error) {
            // Ignore storage failures.
        }
    }

    function rememberPeerNode(meta = {}) {
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
        persistNodeHint();
    }

    function formatPeerIdHint(peerId) {
        const value = String(peerId || "").trim();
        if (!value) {
            return "";
        }
        if (value.length <= 14) {
            return value;
        }
        return `${value.slice(0, 7)}...${value.slice(-5)}`;
    }

    function getRecentPeerHintText() {
        if (!appState.recentNodeHint) {
            return "";
        }
        const peerIdHint = formatPeerIdHint(appState.recentNodeHint.lastPeerId || "");
        if (!peerIdHint) {
            return "";
        }
        const peerName = appState.recentNodeHint.peerName || appState.recentNodeHint.persistentId;
        return `${peerName} / 最近 peerId: ${peerIdHint}`;
    }

    function clearRecentNodePeerId() {
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
        persistNodeHint();
    }

    function clearAutoReconnectState() {
        appState.autoReconnectInProgress = false;
        appState.autoReconnectTargetPeerId = "";
        appState.autoReconnectLastFailureAt = 0;
        appState.autoReconnectLastFailureReason = "";
    }

    function isAutoReconnectActive() {
        const targetPeerId = String(appState.autoReconnectTargetPeerId || "").trim();
        return Boolean(targetPeerId);
    }

    function getReconnectTargetPeerId() {
        const directTarget = String(appState.autoReconnectTargetPeerId || "").trim();
        if (directTarget) {
            return directTarget;
        }
        return appState.recentNodeHint && appState.recentNodeHint.lastPeerId
            ? String(appState.recentNodeHint.lastPeerId).trim()
            : "";
    }

    function reportAutoReconnectFailure(error, options = {}) {
        const reason = toErrorMessage(error);
        const targetPeerId = getReconnectTargetPeerId();
        const now = Date.now();
        const shouldSuppressLog = (
            reason &&
            reason === appState.autoReconnectLastFailureReason &&
            now - Number(appState.autoReconnectLastFailureAt || 0) < 1200
        );
        if (!shouldSuppressLog) {
            appState.autoReconnectLastFailureReason = reason;
            appState.autoReconnectLastFailureAt = now;
            const peerIdHint = formatPeerIdHint(targetPeerId);
            const targetText = peerIdHint ? `（目标 peerId: ${peerIdHint}）` : "";
            const suffix = options.clearPeerId
                ? "已清除保存的 peerId，请重新扫码连接。"
                : "请稍后重试。";
            const logText = `重连失败${targetText}：${reason}。${suffix}`;
            appendMessage("system", logText, true);
            setStatus(logText);
        }
        if (options.clearPeerId) {
            clearRecentNodePeerId();
            removePeerIdParamFromCurrentUrl(targetPeerId);
        }
        if (options.clearState !== false) {
            clearAutoReconnectState();
        }
    }

    function markReconnectTarget(peerId, options = {}) {
        const targetPeerId = String(peerId || "").trim() || (
            appState.recentNodeHint && appState.recentNodeHint.lastPeerId
                ? String(appState.recentNodeHint.lastPeerId).trim()
                : ""
        );
        if (!targetPeerId) {
            return false;
        }
        if (appState.localPeerId && targetPeerId === appState.localPeerId) {
            return false;
        }
        const targetChanged = appState.autoReconnectTargetPeerId !== targetPeerId;
        appState.autoReconnectTargetPeerId = targetPeerId;
        appState.autoReconnectInProgress = false;
        if (targetChanged) {
            appState.autoReconnectLastFailureAt = 0;
            appState.autoReconnectLastFailureReason = "";
        }
        if (options.announce !== false) {
            const peerIdHint = formatPeerIdHint(targetPeerId);
            const suffix = peerIdHint ? `（目标 peerId: ${peerIdHint}）` : "";
            setStatus(`连接已断开，页面回到前台时将尝试重连一次${suffix}。`);
        }
        return true;
    }

    async function tryReconnectOnPageVisible() {
        if (document.hidden || appState.connected || appState.autoReconnectInProgress) {
            return false;
        }
        const targetPeerId = getReconnectTargetPeerId();
        if (!targetPeerId) {
            return false;
        }
        appState.autoReconnectTargetPeerId = targetPeerId;
        appState.autoReconnectInProgress = true;
        try {
            const localPeerId = await ensurePeerReady();
            const activeTargetPeerId = getReconnectTargetPeerId();
            if (!activeTargetPeerId || activeTargetPeerId !== targetPeerId || appState.connected) {
                return false;
            }
            if (targetPeerId === localPeerId) {
                clearRecentNodePeerId();
                clearAutoReconnectState();
                setStatus("保存的 peerId 指向当前节点，已清除，请重新扫码连接。");
                return false;
            }
            const peerIdHint = formatPeerIdHint(targetPeerId);
            const suffix = peerIdHint ? `（目标 peerId: ${peerIdHint}）` : "";
            setStatus(`页面已回到前台，正在尝试重连${suffix}…`);
            peerManager.connect(targetPeerId);
            return true;
        } catch (error) {
            reportAutoReconnectFailure(error, { clearPeerId: true });
            return false;
        } finally {
            appState.autoReconnectInProgress = false;
        }
    }

    function readUrlPeerIdTarget() {
        try {
            const parsed = new URL(window.location.href);
            const hasPairIdParam = parsed.searchParams.has("pairId");
            const hasPeerIdParam = parsed.searchParams.has("peerId");
            const value = String(
                parsed.searchParams.get("pairId")
                || parsed.searchParams.get("peerId")
                || ""
            ).trim();
            return {
                hasTargetParam: hasPairIdParam || hasPeerIdParam,
                pairId: value,
                sourceParam: hasPairIdParam ? "pairId" : (hasPeerIdParam ? "peerId" : "")
            };
        } catch (_error) {
            return {
                hasTargetParam: false,
                pairId: "",
                sourceParam: ""
            };
        }
    }

    async function tryConnectToUrlPeerIdOnFirstLoad() {
        const target = readUrlPeerIdTarget();
        if (!target.hasTargetParam) {
            return false;
        }

        setScanVisualSuccess(true);
        appState.autoReconnectAttempted = true;
        const urlPeerId = target.pairId;
        const sourceParam = target.sourceParam || "pairId";
        if (!urlPeerId) {
            if (sourceParam === "peerId") {
                removePeerIdParamFromCurrentUrl();
            }
            setStatus("URL 中的 pairId/peerId 为空，请重新扫码连接。");
            return true;
        }

        try {
            const localPeerId = await ensurePeerReady();
            if (urlPeerId === localPeerId) {
                setStatus(`URL 中的 ${sourceParam} 指向当前节点，已跳过连接。`);
                return true;
            }
            clearAutoReconnectState();
            markReconnectTarget(urlPeerId, { announce: false });
            const connectResult = peerManager.connect(urlPeerId);
            if (connectResult && connectResult.reused) {
                clearAutoReconnectState();
                const knownPersistentId = appState.remotePersistentId || connectResult.peerPersistentId || "";
                const knownPeerName = connectResult.peerName || appState.peerName || "";
                bindConversation(knownPersistentId, knownPeerName, urlPeerId);
                rememberPeerNode({
                    persistentId: knownPersistentId,
                    peerName: knownPeerName,
                    peerId: urlPeerId
                });
                setConnectionState(true);
                clearUnread();
                enterChatInterface();
                setStatus("已连接到 URL 指定节点，已打开对应会话。");
                return true;
            }
            setStatus(`检测到 URL ${sourceParam}，正在发起连接…`);
            setSessionPanelOpen(false);
            return true;
        } catch (error) {
            clearAutoReconnectState();
            if (sourceParam === "peerId") {
                removePeerIdParamFromCurrentUrl(urlPeerId);
            }
            setStatus(`URL ${sourceParam} 连接失败：${toErrorMessage(error)}。`);
            return true;
        }
    }

    async function tryAutoReconnectFromPersistedNode() {
        if (appState.autoReconnectAttempted) {
            return;
        }
        appState.autoReconnectAttempted = true;

        const hint = appState.recentNodeHint;
        if (!hint || !hint.persistentId || !hint.lastPeerId) {
            return;
        }

        try {
            if (appState.localPeerId && hint.lastPeerId === appState.localPeerId) {
                return;
            }
            const peerIdHint = formatPeerIdHint(hint.lastPeerId);
            const peerTitle = hint.peerName || hint.persistentId;
            const armed = markReconnectTarget(hint.lastPeerId, { announce: false });
            if (!armed) {
                return;
            }
            setStatus(`检测到历史节点 ${peerTitle}，记录了最近 peerId ${peerIdHint}。回到页面前台时会尝试重连一次。`);
        } catch (error) {
            clearAutoReconnectState();
            const hintText = getRecentPeerHintText();
            const suffix = hintText ? `（${hintText}）` : "";
            setStatus(`重连准备失败：${toErrorMessage(error)}${suffix}。`);
        }
    }

    function bindConversation(remotePersistentId, peerName = "", fallbackPeerId = "") {
        const normalizedPid = String(remotePersistentId || "").trim();
        let targetId = normalizedPid ? `pid:${normalizedPid}` : "";
        const fallbackId = String(fallbackPeerId || "").trim();
        if (!targetId && fallbackId) {
            targetId = `peer:${fallbackId}`;
        }
        if (!targetId) {
            return;
        }

        if (normalizedPid) {
            migrateTempConversationToPersistent(targetId, fallbackId);
            appState.remotePersistentId = normalizedPid;
        }

        const conversation = ensureConversation(targetId);
        if (peerName) {
            conversation.peerName = String(peerName);
        }

        const switched = appState.currentConversationId !== targetId;
        appState.currentConversationId = targetId;
        appState.chatHistory = conversation.messages.slice(-CHAT_HISTORY_MAX);
        appState.unreadCount = Math.max(0, Number(conversation.unreadCount || 0));
        setPeerName(conversation.peerName || peerName || "", { persist: false });
        syncVideoPrefForCurrentPeer();

        if (switched || elements.chatMessages.dataset.inited) {
            renderHistoryFromState();
        }
        if (isChatActive()) {
            clearUnread();
        } else {
            renderUnread();
        }
        persistChatState();
    }

    function migrateTempConversationToPersistent(targetId, fallbackPeerId) {
        const tempKeys = [];
        if (fallbackPeerId) {
            tempKeys.push(`peer:${fallbackPeerId}`);
        }
        if (appState.currentConversationId && appState.currentConversationId.startsWith("peer:")) {
            tempKeys.push(appState.currentConversationId);
        }
        let targetConversation = ensureConversation(targetId);
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

    function mergeMessages(baseMessages, extraMessages) {
        const merged = []
            .concat(Array.isArray(baseMessages) ? baseMessages : [])
            .concat(Array.isArray(extraMessages) ? extraMessages : []);
        if (merged.length <= CHAT_HISTORY_MAX) {
            return merged;
        }
        return merged.slice(-CHAT_HISTORY_MAX);
    }

    function ensureConversation(conversationId) {
        const id = String(conversationId || "").trim();
        if (!id) {
            return null;
        }
        if (!appState.conversations[id]) {
            appState.conversations[id] = {
                id,
                peerName: "",
                unreadCount: 0,
                messages: []
            };
        }
        return appState.conversations[id];
    }

    function ensureActiveConversation() {
        if (appState.currentConversationId) {
            return ensureConversation(appState.currentConversationId);
        }
        const fallbackId = appState.remotePersistentId ? `pid:${appState.remotePersistentId}` : `local:${appState.localPersistentId}`;
        appState.currentConversationId = fallbackId;
        return ensureConversation(fallbackId);
    }

    function syncConversationFromState() {
        if (
            !appState.currentConversationId &&
            !appState.remotePersistentId &&
            appState.chatHistory.length === 0 &&
            !appState.peerName &&
            Number(appState.unreadCount || 0) === 0
        ) {
            return;
        }
        const conversation = ensureActiveConversation();
        if (!conversation) {
            return;
        }
        conversation.peerName = appState.peerName || conversation.peerName || "";
        conversation.unreadCount = Math.max(0, Number(appState.unreadCount || 0));
        conversation.messages = appState.chatHistory.slice(-CHAT_HISTORY_MAX).map((msg) => ({
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
        }));
    }

    function isChatActive() {
        if (document.hidden) {
            return false;
        }
        return !elements.chatInterface.classList.contains("hidden");
    }

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
                    try {
                        peerManager.destroy();
                    } catch (_destroyError) {
                        // Ignore cleanup errors.
                    }
                    setInitStage("peer", "error", toErrorMessage(error));
                    throw error;
                })
                .finally(() => {
                    appState.peerInitTask = null;
                });
        }
        return appState.peerInitTask;
    }

    async function regenerateOffer() {
        if (appState.mode !== "qr") {
            return;
        }
        try {
            setScanVisualSuccess(false);
            setInitStage("qrcode", "running", "开始生成二维码链接");
            setStatus("正在初始化 Peer 节点并生成二维码…");
            const peerId = await ensurePeerReady();
            const encoded = encodePeerSignal(peerId);
            renderQr(encoded);
            setInitStage("qrcode", "success", `链接长度=${encoded.length}`);
            setStatus(`请让对方扫码该二维码（长度 ${encoded.length}）。扫码后将直接发起连接。`);
        } catch (error) {
            setInitStage("qrcode", "error", toErrorMessage(error));
            setStatus(`生成二维码失败：${toErrorMessage(error)}`);
        }
    }

    function startScan() {
        appState.scannerTask = appState.scannerTask.then(async () => {
            if (appState.mode !== "scanner" || appState.scannerRunning) {
                return;
            }
            // 扫码由用户显式触发，应优先于 URL/历史自动重连，避免抢占连接目标。
            clearAutoReconnectState();
            if (!hasScannerDependency()) {
                setStatus("扫码依赖未加载，无法启动内置扫码。请检查网络后刷新页面。");
                return;
            }
            if (!window.isSecureContext) {
                setStatus(`当前不是安全上下文，无法调用摄像头。请使用 https 或 localhost。当前地址：${window.location.origin}`);
                return;
            }
            try {
                const reader = ensureCodeReader();
                setScanVisualSuccess(false);
                await ensurePeerReady();
                appState.scanSessionId += 1;
                const sessionId = appState.scanSessionId;
                setStatus("正在启动摄像头…");
                const readerView = ensureScannerView();
                const deviceId = await pickCameraDeviceId();
                const scanPromise = deviceId
                    ? reader.decodeFromVideoDevice(
                        deviceId,
                        readerView,
                        (result, error) => handleScanFrame(result, error, sessionId)
                    )
                    : reader.decodeFromConstraints(
                        getScannerConstraints(),
                        readerView,
                        (result, error) => handleScanFrame(result, error, sessionId)
                    );

                appState.scanControls = await scanPromise;
                appState.scannerRunning = true;
                updateScanButton();
                startSmartRegionLoop(sessionId);
                setStatus("摄像头已开启，正在识别二维码…");
            } catch (error) {
                appState.scannerRunning = false;
                appState.scanControls = null;
                stopSmartRegionLoop();
                updateScanButton();
                setStatus(`启动扫码失败：${toErrorMessage(error)}`);
            }
        });
        return appState.scannerTask;
    }

    function stopScanIfRunning() {
        appState.scannerTask = appState.scannerTask.then(async () => {
            if (!appState.scannerRunning) {
                return;
            }
            appState.scanSessionId += 1;
            try {
                if (appState.scanControls && typeof appState.scanControls.stop === "function") {
                    appState.scanControls.stop();
                }
                if (codeReader && typeof codeReader.reset === "function") {
                    codeReader.reset();
                }
            } catch (_error) {
                // Ignore stop errors when scanner is already closed.
            }
            appState.scannerRunning = false;
            appState.scanControls = null;
            stopSmartRegionLoop();
            updateScanButton();
        });
        return appState.scannerTask;
    }

    function startSmartRegionLoop(sessionId) {
        stopSmartRegionLoop();
        if (typeof jsQR !== "function") {
            return;
        }

        const tick = () => {
            if (!appState.scannerRunning || sessionId !== appState.scanSessionId) {
                return;
            }
            tryDecodeDarkRegions(sessionId);
            appState.smartRegionTimer = window.setTimeout(tick, 220);
        };
        appState.smartRegionTimer = window.setTimeout(tick, 320);
    }

    function stopSmartRegionLoop() {
        if (appState.smartRegionTimer) {
            clearTimeout(appState.smartRegionTimer);
            appState.smartRegionTimer = null;
        }
    }

    function tryDecodeDarkRegions(sessionId) {
        if (appState.handlingScan || !appState.scannerRunning || sessionId !== appState.scanSessionId) {
            return;
        }
        const video = elements.reader.querySelector("video");
        if (!video || !video.videoWidth || !video.videoHeight) {
            return;
        }
        const frame = captureFrame(video, 900);
        if (!frame) {
            return;
        }

        const candidates = detectDarkRegionCandidates(frame.imageData, frame.width, frame.height);
        if (candidates.length === 0) {
            return;
        }

        for (let i = 0; i < candidates.length; i += 1) {
            const rect = candidates[i];
            let roi;
            try {
                roi = appState.smartCtx.getImageData(rect.x, rect.y, rect.w, rect.h);
            } catch (_error) {
                continue;
            }
            const result = jsQR(roi.data, rect.w, rect.h, {
                inversionAttempts: "attemptBoth"
            });
            if (result && result.data) {
                onScanSuccess(result.data, sessionId);
                return;
            }
        }
    }

    function captureFrame(video, maxEdge) {
        const sourceW = video.videoWidth;
        const sourceH = video.videoHeight;
        if (!sourceW || !sourceH) {
            return null;
        }
        const scale = Math.min(1, maxEdge / Math.max(sourceW, sourceH));
        const width = Math.max(1, Math.floor(sourceW * scale));
        const height = Math.max(1, Math.floor(sourceH * scale));

        if (!appState.smartCanvas) {
            appState.smartCanvas = document.createElement("canvas");
            appState.smartCtx = appState.smartCanvas.getContext("2d", { willReadFrequently: true });
        }
        if (!appState.smartCtx) {
            return null;
        }

        appState.smartCanvas.width = width;
        appState.smartCanvas.height = height;
        appState.smartCtx.drawImage(video, 0, 0, width, height);
        const imageData = appState.smartCtx.getImageData(0, 0, width, height);
        return { imageData, width, height };
    }

    function detectDarkRegionCandidates(imageData, width, height) {
        const pixels = imageData.data;
        const cellSize = Math.max(10, Math.floor(Math.min(width, height) / 28));
        const cols = Math.max(1, Math.floor(width / cellSize));
        const rows = Math.max(1, Math.floor(height / cellSize));

        const darkRatio = new Float32Array(rows * cols);
        const flagged = new Uint8Array(rows * cols);
        const visited = new Uint8Array(rows * cols);
        const stride = width * 4;

        for (let gy = 0; gy < rows; gy += 1) {
            for (let gx = 0; gx < cols; gx += 1) {
                const startX = gx * cellSize;
                const startY = gy * cellSize;
                const endX = Math.min(width, startX + cellSize);
                const endY = Math.min(height, startY + cellSize);
                let samples = 0;
                let dark = 0;

                for (let y = startY; y < endY; y += 2) {
                    const rowOffset = y * stride;
                    for (let x = startX; x < endX; x += 2) {
                        const index = rowOffset + x * 4;
                        const r = pixels[index];
                        const g = pixels[index + 1];
                        const b = pixels[index + 2];
                        const lum = (r * 38 + g * 75 + b * 15) >> 7;
                        samples += 1;
                        if (lum < 90) {
                            dark += 1;
                        }
                    }
                }

                const idx = gy * cols + gx;
                const ratio = samples ? dark / samples : 0;
                darkRatio[idx] = ratio;
                if (ratio > 0.28) {
                    flagged[idx] = 1;
                }
            }
        }

        const candidates = [];
        const queueX = [];
        const queueY = [];
        for (let gy = 0; gy < rows; gy += 1) {
            for (let gx = 0; gx < cols; gx += 1) {
                const startIdx = gy * cols + gx;
                if (!flagged[startIdx] || visited[startIdx]) {
                    continue;
                }
                let head = 0;
                queueX.length = 0;
                queueY.length = 0;
                queueX.push(gx);
                queueY.push(gy);
                visited[startIdx] = 1;

                let minX = gx;
                let maxX = gx;
                let minY = gy;
                let maxY = gy;
                let cellCount = 0;
                let darkSum = 0;

                while (head < queueX.length) {
                    const cx = queueX[head];
                    const cy = queueY[head];
                    head += 1;
                    const idx = cy * cols + cx;
                    cellCount += 1;
                    darkSum += darkRatio[idx];
                    minX = Math.min(minX, cx);
                    maxX = Math.max(maxX, cx);
                    minY = Math.min(minY, cy);
                    maxY = Math.max(maxY, cy);

                    for (let oy = -1; oy <= 1; oy += 1) {
                        for (let ox = -1; ox <= 1; ox += 1) {
                            if (ox === 0 && oy === 0) {
                                continue;
                            }
                            const nx = cx + ox;
                            const ny = cy + oy;
                            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
                                continue;
                            }
                            const nIdx = ny * cols + nx;
                            if (!flagged[nIdx] || visited[nIdx]) {
                                continue;
                            }
                            visited[nIdx] = 1;
                            queueX.push(nx);
                            queueY.push(ny);
                        }
                    }
                }

                const avgDark = darkSum / Math.max(1, cellCount);
                if (cellCount < 5 || avgDark < 0.3) {
                    continue;
                }

                const rect = expandToSquare(
                    (minX - 1) * cellSize,
                    (minY - 1) * cellSize,
                    (maxX - minX + 3) * cellSize,
                    (maxY - minY + 3) * cellSize,
                    width,
                    height
                );
                if (!rect) {
                    continue;
                }

                const aspect = rect.w / rect.h;
                if (aspect < 0.6 || aspect > 1.7) {
                    continue;
                }
                if (rect.w < 70 || rect.h < 70) {
                    continue;
                }

                candidates.push({
                    x: rect.x,
                    y: rect.y,
                    w: rect.w,
                    h: rect.h,
                    score: cellCount * avgDark
                });
            }
        }

        candidates.sort((a, b) => b.score - a.score);
        const deduped = [];
        for (let i = 0; i < candidates.length; i += 1) {
            const current = candidates[i];
            let overlap = false;
            for (let j = 0; j < deduped.length; j += 1) {
                if (rectIoU(current, deduped[j]) > 0.58) {
                    overlap = true;
                    break;
                }
            }
            if (!overlap) {
                deduped.push(current);
            }
            if (deduped.length >= 8) {
                break;
            }
        }
        return deduped;
    }

    function expandToSquare(x, y, w, h, maxW, maxH) {
        const cx = x + w / 2;
        const cy = y + h / 2;
        const side = Math.max(w, h) * 1.26;
        const half = side / 2;
        let left = Math.floor(cx - half);
        let top = Math.floor(cy - half);
        let right = Math.ceil(cx + half);
        let bottom = Math.ceil(cy + half);

        left = Math.max(0, left);
        top = Math.max(0, top);
        right = Math.min(maxW, right);
        bottom = Math.min(maxH, bottom);
        const rw = right - left;
        const rh = bottom - top;
        if (rw <= 0 || rh <= 0) {
            return null;
        }
        return { x: left, y: top, w: rw, h: rh };
    }

    function rectIoU(a, b) {
        const x1 = Math.max(a.x, b.x);
        const y1 = Math.max(a.y, b.y);
        const x2 = Math.min(a.x + a.w, b.x + b.w);
        const y2 = Math.min(a.y + a.h, b.y + b.h);
        const iw = Math.max(0, x2 - x1);
        const ih = Math.max(0, y2 - y1);
        const inter = iw * ih;
        if (inter <= 0) {
            return 0;
        }
        const union = a.w * a.h + b.w * b.h - inter;
        return union > 0 ? inter / union : 0;
    }

    function handleScanFrame(result, error, sessionId) {
        if (result) {
            const text = typeof result.getText === "function" ? result.getText() : String(result.text || result || "");
            if (text) {
                onScanSuccess(text, sessionId);
            }
            return;
        }
        if (error) {
            onScanFailure(error, sessionId);
        }
    }

    async function onScanSuccess(decodedText, sessionId) {
        if (sessionId !== appState.scanSessionId || appState.handlingScan) {
            return;
        }
        const normalized = String(decodedText || "").trim();

        let remotePeerId = "";
        try {
            remotePeerId = decodePeerSignal(normalized);
        } catch (error) {
            const msg = toErrorMessage(error);
            if (msg.includes("不是 AirCopy Peer 信令")) {
                return;
            }
            throttleScanStatus(`扫码识别失败：${msg}`);
            return;
        }

        if (remotePeerId === appState.localPeerId) {
            throttleScanStatus("扫描到了自己的二维码，请扫描对方二维码。");
            return;
        }

        setScanVisualSuccess(true);
        appState.handlingScan = true;
        try {
            await stopScanIfRunning();
            const localPeerId = await ensurePeerReady();
            if (remotePeerId === localPeerId) {
                setStatus("扫描到了自己的二维码，请扫描对方二维码。");
                return;
            }
            clearAutoReconnectState();
            const connectResult = peerManager.connect(remotePeerId);
            if (connectResult && connectResult.reused) {
                const knownPersistentId = appState.remotePersistentId || connectResult.peerPersistentId || "";
                const knownPeerName = connectResult.peerName || appState.peerName || "";
                bindConversation(knownPersistentId, knownPeerName, remotePeerId);
                rememberPeerNode({
                    persistentId: knownPersistentId,
                    peerName: knownPeerName,
                    peerId: remotePeerId
                });
                setConnectionState(true);
                clearUnread();
                enterChatInterface();
                setStatus("已连接到该节点，已打开对应会话。");
                return;
            }
            setStatus("扫码成功，正在发起连接…");
            setSessionPanelOpen(false);
        } catch (error) {
            setStatus(`发起连接失败：${toErrorMessage(error)}`);
        } finally {
            appState.handlingScan = false;
        }
    }

    function onScanFailure(errorText, sessionId) {
        if (sessionId !== appState.scanSessionId) {
            return;
        }
        const message = toErrorMessage(errorText);
        if (isIgnorableScanError(errorText, message)) {
            return;
        }
        throttleScanStatus(`扫码异常：${message}`);
    }

    function isIgnorableScanError(error, message) {
        const raw = String(message || "").trim();
        const normalized = raw.toLowerCase();
        if (!normalized) {
            return true;
        }
        if (normalized === "e" || normalized === "undefined" || normalized === "null") {
            return true;
        }
        if (normalized.length <= 2 && /^[a-z]$/.test(normalized)) {
            return true;
        }
        const benignPatterns = [
            "notfoundexception",
            "not found",
            "checksum",
            "format",
            "decode"
        ];
        if (benignPatterns.some((token) => normalized.includes(token))) {
            return true;
        }
        const name = error && error.name ? String(error.name).toLowerCase() : "";
        if (name === "e" || name.includes("notfound")) {
            return true;
        }
        return false;
    }

    function throttleScanStatus(text) {
        const now = Date.now();
        if (now - appState.lastScanErrorAt < 1800) {
            return;
        }
        appState.lastScanErrorAt = now;
        setStatus(text);
    }

    function getScannerConstraints() {
        const idealSize = Math.max(720, Math.min(1400, Math.floor((window.innerWidth || 360) * 1.8)));
        return {
            video: {
                facingMode: { ideal: "environment" },
                width: { ideal: idealSize },
                height: { ideal: idealSize }
            },
            audio: false
        };
    }

    function ensureScannerView() {
        let video = elements.reader.querySelector("video");
        if (!video) {
            elements.reader.innerHTML = "";
            video = document.createElement("video");
            video.setAttribute("playsinline", "true");
            video.muted = true;
            video.autoplay = true;
            elements.reader.appendChild(video);
        }
        return video;
    }

    function renderQr(text) {
        if (!hasQrDependency()) {
            throw new Error("二维码依赖 QRCode 未加载。");
        }
        appState.currentQrText = text;
        elements.qrcode.innerHTML = "";
        const size = Math.min(320, Math.max(260, Math.floor((window.innerWidth || 1000) * 0.32)));
        new QRCode(elements.qrcode, {
            text,
            width: size,
            height: size,
            correctLevel: QRCode.CorrectLevel.M
        });
        renderLargeQrIfOpen();
    }

    function openQrModal() {
        if (!appState.currentQrText) {
            setStatus("当前没有可放大的二维码。");
            return;
        }
        elements.qrModal.classList.remove("hidden");
        renderLargeQrIfOpen();
    }

    function closeQrModal() {
        elements.qrModal.classList.add("hidden");
    }

    function renderLargeQrIfOpen() {
        if (elements.qrModal.classList.contains("hidden") || !appState.currentQrText) {
            return;
        }
        if (!hasQrDependency()) {
            return;
        }
        elements.qrcodeLarge.innerHTML = "";
        new QRCode(elements.qrcodeLarge, {
            text: appState.currentQrText,
            width: 900,
            height: 900,
            correctLevel: QRCode.CorrectLevel.M
        });
    }

    function setScanVisualSuccess(success) {
        appState.scanVisualSuccess = Boolean(success);
        if (elements.scannerShell) {
            elements.scannerShell.classList.toggle("scan-success", appState.scanVisualSuccess);
        }
        if (elements.qrContainer) {
            elements.qrContainer.classList.toggle("scan-success", appState.scanVisualSuccess);
        }
    }

    function updateScanButton() {
        elements.scanTrigger.textContent = appState.scannerRunning ? "停止扫码" : "开始扫码";
        if (elements.scannerShell) {
            elements.scannerShell.classList.toggle("scanning", appState.scannerRunning);
        }
    }

    function enterChatInterface() {
        closeQrModal();
        setSessionPanelOpen(false);
        showChatScreen();
        if (!elements.chatMessages.dataset.inited) {
            elements.chatMessages.dataset.inited = "1";
            if (appState.chatHistory.length > 0) {
                renderHistoryFromState();
            } else {
                appendMessage("system", "连接成功，等待双方 hello 消息…", true);
            }
        }
    }

    function initEmojiPanel() {
        if (!elements.emojiPanel) {
            return;
        }
        elements.emojiPanel.innerHTML = "";
        for (let i = 0; i < EMOJI_SET.length; i += 1) {
            const emoji = EMOJI_SET[i];
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "emoji-btn";
            btn.textContent = emoji;
            btn.setAttribute("aria-label", `插入表情 ${emoji}`);
            btn.addEventListener("click", () => {
                insertTextAtCursor(elements.messageInput, emoji);
                elements.messageInput.focus();
            });
            elements.emojiPanel.appendChild(btn);
        }
    }

    function toggleEmojiPanel() {
        if (!appState.connected) {
            setStatus("尚未连接，当前无法发送表情。");
            return;
        }
        elements.emojiPanel.classList.toggle("hidden");
    }

    function closeEmojiPanel() {
        elements.emojiPanel.classList.add("hidden");
    }

    function insertTextAtCursor(textarea, text) {
        if (!textarea) {
            return;
        }
        const start = Number(textarea.selectionStart || 0);
        const end = Number(textarea.selectionEnd || 0);
        const current = textarea.value || "";
        textarea.value = `${current.slice(0, start)}${text}${current.slice(end)}`;
        const cursor = start + text.length;
        textarea.selectionStart = cursor;
        textarea.selectionEnd = cursor;
    }

    async function onFileInputChanged(event) {
        const input = event && event.target ? event.target : null;
        const files = input && input.files ? input.files : null;
        const file = files && files.length > 0 ? files[0] : null;
        if (!file) {
            return;
        }
        let transferId = "";
        try {
            setStatus("等待对方确认接收文件...");
            const transfer = await peerManager.sendFile(file, { kind: "file" });
            transferId = transfer.transferId;
            initTransferProgress({
                transferId: transfer.transferId,
                direction: "send",
                kind: "file",
                fileName: transfer.fileName,
                size: transfer.size,
                mimeType: transfer.mimeType,
                totalChunks: Math.max(1, Math.ceil(file.size / (60 * 1024)))
            });
            await appendAttachmentMessage("me", {
                kind: "file",
                fileName: transfer.fileName,
                mimeType: transfer.mimeType,
                size: transfer.size,
                blob: file
            });
            clearTransferProgress(transfer.transferId, "已发送");
            setStatus(`文件已发送：${transfer.fileName}`);
        } catch (error) {
            if (transferId) {
                clearTransferProgress(transferId, "发送失败");
            }
            setStatus(`文件发送失败：${toErrorMessage(error)}`);
        } finally {
            if (input) {
                input.value = "";
            }
        }
    }

    async function appendAttachmentMessage(from, payload) {
        const kind = payload && payload.kind === "voice" ? "voice" : "file";
        const fileName = payload && payload.fileName ? String(payload.fileName) : (kind === "voice" ? "语音" : "文件");
        const size = Math.max(0, Number((payload && payload.size) || 0));
        const mimeType = payload && payload.mimeType ? String(payload.mimeType) : "application/octet-stream";
        const blob = payload && payload.blob ? payload.blob : null;
        const blobUrl = blob ? createObjectUrl(blob) : "";
        const durationSec = kind === "voice" && blob ? await getAudioDurationSec(blob) : 0;
        const text = buildAttachmentText(kind, fileName, size, durationSec);
        appendMessage(from, text, false, {
            kind,
            fileName,
            fileSize: size,
            mimeType,
            blobUrl,
            durationSec
        });
    }

    function buildAttachmentText(kind, fileName, size, durationSec) {
        if (kind === "voice") {
            const durationText = durationSec > 0 ? `，时长 ${formatDuration(durationSec)}` : "";
            return `语音：${fileName}${size > 0 ? ` (${formatFileSize(size)})` : ""}${durationText}`;
        }
        return `文件：${fileName}${size > 0 ? ` (${formatFileSize(size)})` : ""}`;
    }

    function createObjectUrl(blob) {
        if (!blob || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
            return "";
        }
        const url = URL.createObjectURL(blob);
        appState.objectUrls.push(url);
        return url;
    }

    function releaseObjectUrls() {
        if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") {
            appState.objectUrls = [];
            return;
        }
        while (appState.objectUrls.length > 0) {
            const url = appState.objectUrls.pop();
            try {
                URL.revokeObjectURL(url);
            } catch (_error) {
                // Ignore invalid object URLs.
            }
        }
    }

    function formatFileSize(size) {
        if (!size || size < 1024) {
            return `${size || 0} B`;
        }
        if (size < 1024 * 1024) {
            return `${(size / 1024).toFixed(1)} KB`;
        }
        return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    }

    function formatDuration(seconds) {
        const safe = Math.max(0, Math.round(Number(seconds) || 0));
        const mm = Math.floor(safe / 60);
        const ss = safe % 60;
        return `${mm}:${String(ss).padStart(2, "0")}`;
    }

    async function getAudioDurationSec(blob) {
        if (!blob) {
            return 0;
        }
        if (!window.AudioContext && !window.webkitAudioContext) {
            return 0;
        }
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const context = new Ctx();
        try {
            const buffer = await blob.arrayBuffer();
            const audioBuffer = await context.decodeAudioData(buffer.slice(0));
            return Math.max(0, Number(audioBuffer.duration || 0));
        } catch (_error) {
            return 0;
        } finally {
            if (context && typeof context.close === "function") {
                context.close();
            }
        }
    }

    function initTransferProgress(meta) {
        if (!meta || !meta.transferId || appState.transferViews[meta.transferId]) {
            return;
        }
        const div = document.createElement("div");
        div.className = `message ${meta.direction === "send" ? "me" : "peer"} file`;
        div.dataset.transferId = meta.transferId;

        const timestamp = document.createElement("span");
        timestamp.className = "message-time";
        timestamp.textContent = formatNowHHMM();
        div.appendChild(timestamp);

        const body = document.createElement("span");
        body.className = "message-body";

        const title = document.createElement("span");
        title.textContent = `${meta.kind === "voice" ? "语音" : "文件"}传输中：${meta.fileName || "未命名文件"}`;
        body.appendChild(title);

        const progress = document.createElement("progress");
        progress.className = "transfer-progress";
        progress.max = Math.max(1, Number(meta.totalChunks) || 1);
        progress.value = 0;
        body.appendChild(progress);

        const transferMeta = document.createElement("span");
        transferMeta.className = "transfer-meta";
        transferMeta.textContent = "0%";
        body.appendChild(transferMeta);

        let pickTargetBtn = null;
        if (meta.direction === "receive" && window.showSaveFilePicker) {
            pickTargetBtn = document.createElement("button");
            pickTargetBtn.type = "button";
            pickTargetBtn.className = "secondary";
            pickTargetBtn.textContent = "选择写入位置";
            pickTargetBtn.addEventListener("click", async () => {
                try {
                    const writable = await chooseWritableForIncomingFile({
                        fileName: meta.fileName,
                        mimeType: meta.mimeType || "application/octet-stream"
                    });
                    if (!writable) {
                        return;
                    }
                    peerManager.setIncomingFileWritable(meta.transferId, writable);
                    transferMeta.textContent = `${transferMeta.textContent}，已切换磁盘写入`;
                } catch (_error) {
                    // Ignore picker cancellation.
                }
            });
            body.appendChild(pickTargetBtn);
        }

        div.appendChild(body);
        elements.chatMessages.appendChild(div);
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;

        appState.transferViews[meta.transferId] = {
            id: meta.transferId,
            progress,
            transferMeta,
            div,
            pickTargetBtn
        };
    }

    function updateTransferProgress(progress) {
        if (!progress || !progress.transferId) {
            return;
        }
        const totalChunks = Math.max(1, Number(progress.totalChunks) || 1);
        const sentChunks = progress.direction === "send"
            ? Math.max(0, Number(progress.sentChunks) || 0)
            : Math.max(0, Number(progress.receivedChunks) || 0);

        if (!appState.transferViews[progress.transferId]) {
            initTransferProgress({
                transferId: progress.transferId,
                direction: progress.direction,
                kind: progress.kind || "file",
                fileName: progress.fileName || "未命名文件",
                size: progress.size || 0,
                totalChunks
            });
        }
        const view = appState.transferViews[progress.transferId];
        if (!view) {
            return;
        }
        view.progress.max = totalChunks;
        view.progress.value = Math.min(totalChunks, sentChunks);
        const pct = Math.min(100, Math.round((sentChunks / totalChunks) * 100));
        view.transferMeta.textContent = `${pct}%`;
    }

    function clearTransferProgress(transferId, summaryText) {
        const id = String(transferId || "").trim();
        if (!id || !appState.transferViews[id]) {
            return;
        }
        const view = appState.transferViews[id];
        if (summaryText) {
            view.transferMeta.textContent = summaryText;
        } else {
            view.transferMeta.textContent = "100%";
        }
        view.progress.value = view.progress.max;
        window.setTimeout(() => {
            if (view.div && view.div.parentNode) {
                view.div.parentNode.removeChild(view.div);
            }
        }, 1200);
        delete appState.transferViews[id];
    }

    function clearAllTransferProgress() {
        const ids = Object.keys(appState.transferViews);
        for (let i = 0; i < ids.length; i += 1) {
            clearTransferProgress(ids[i], "已中断");
        }
    }

    function showFileOfferModal() {
        if (!appState.incomingFileOffer) {
            return;
        }
        const offer = appState.incomingFileOffer;
        const kindText = offer.kind === "voice" ? "语音" : "文件";
        elements.fileOfferText.textContent = `对方请求发送${kindText}：${offer.fileName}（${formatFileSize(offer.size)}）`;
        elements.fileOfferModal.classList.remove("hidden");
    }

    function closeFileOfferModal() {
        elements.fileOfferModal.classList.add("hidden");
        appState.incomingFileOffer = null;
    }

    async function acceptIncomingFileOffer() {
        if (!appState.incomingFileOffer) {
            return;
        }
        const offer = appState.incomingFileOffer;
        closeFileOfferModal();
        let writable = null;
        try {
            writable = await chooseWritableForIncomingFile(offer);
        } catch (_error) {
            writable = null;
        }
        try {
            peerManager.acceptIncomingFile(offer.transferId, { writable });
            initTransferProgress({
                transferId: offer.transferId,
                direction: "receive",
                kind: offer.kind,
                fileName: offer.fileName,
                size: offer.size,
                mimeType: offer.mimeType,
                totalChunks: offer.totalChunks
            });
            if (writable) {
                setStatus("已选择保存位置，正在写入本地文件...");
            } else {
                setStatus("未选择保存位置，先缓存到内存。");
            }
        } catch (error) {
            setStatus(`接收文件失败：${toErrorMessage(error)}`);
        }
    }

    function rejectIncomingFileOffer() {
        if (!appState.incomingFileOffer) {
            return;
        }
        const offer = appState.incomingFileOffer;
        closeFileOfferModal();
        peerManager.rejectIncomingFile(offer.transferId, "用户拒绝");
        setStatus("已取消本次文件接收，连接保持不变。");
    }

    async function chooseWritableForIncomingFile(offer) {
        if (!window.showSaveFilePicker) {
            return null;
        }
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: offer.fileName || `aircopy-${Date.now()}`,
                types: [{
                    description: "接收文件",
                    accept: { [offer.mimeType || "application/octet-stream"]: [`.${guessExt(offer.fileName)}`] }
                }]
            });
            if (!handle || typeof handle.createWritable !== "function") {
                return null;
            }
            return handle.createWritable();
        } catch (_error) {
            return null;
        }
    }

    function guessExt(fileName) {
        const name = String(fileName || "");
        const idx = name.lastIndexOf(".");
        if (idx <= 0 || idx === name.length - 1) {
            return "bin";
        }
        return name.slice(idx + 1).toLowerCase();
    }

    async function toggleVoiceRecording() {
        if (!appState.connected) {
            setStatus("尚未连接，当前无法发送语音。");
            return;
        }
        if (appState.recordingVoice) {
            await stopVoiceRecording(true);
            return;
        }
        await startVoiceRecording();
    }

    async function startVoiceRecording() {
        if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setStatus("当前浏览器不支持语音录制。");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            appState.voiceRecorder = recorder;
            appState.voiceStream = stream;
            appState.voiceChunks = [];
            appState.voiceSendAfterStop = true;
            appState.recordingVoice = true;
            updateVoiceButton();
            setStatus("录音中，再次点击“语音”结束并发送。");

            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    appState.voiceChunks.push(event.data);
                }
            };

            recorder.onstop = async () => {
                const sendAfterStop = appState.voiceSendAfterStop;
                const chunks = appState.voiceChunks.slice();
                appState.voiceChunks = [];
                appState.recordingVoice = false;
                appState.voiceRecorder = null;
                appState.voiceSendAfterStop = true;
                if (appState.voiceStream) {
                    appState.voiceStream.getTracks().forEach((track) => track.stop());
                    appState.voiceStream = null;
                }
                updateVoiceButton();
                if (!sendAfterStop || chunks.length === 0) {
                    return;
                }
                const mimeType = recorder.mimeType || "audio/webm";
                const blob = new Blob(chunks, { type: mimeType });
                const fileName = `voice-${Date.now()}.webm`;
                try {
                    setStatus("等待对方确认接收语音...");
                    const transfer = await peerManager.sendFile(blob, { kind: "voice", fileName, mimeType });
                    initTransferProgress({
                        transferId: transfer.transferId,
                        direction: "send",
                        kind: "voice",
                        fileName: transfer.fileName,
                        size: transfer.size,
                        mimeType: transfer.mimeType,
                        totalChunks: Math.max(1, Math.ceil(blob.size / (60 * 1024)))
                    });
                    await appendAttachmentMessage("me", {
                        kind: "voice",
                        fileName: transfer.fileName,
                        mimeType: transfer.mimeType,
                        size: transfer.size,
                        blob
                    });
                    clearTransferProgress(transfer.transferId, "已发送");
                    setStatus("语音已发送。");
                } catch (error) {
                    setStatus(`语音发送失败：${toErrorMessage(error)}`);
                }
            };

            recorder.start(200);
        } catch (error) {
            setStatus(`启动录音失败：${toErrorMessage(error)}`);
            appState.recordingVoice = false;
            updateVoiceButton();
        }
    }

    async function stopVoiceRecording(sendAfterStop) {
        if (!appState.voiceRecorder) {
            return;
        }
        appState.voiceSendAfterStop = Boolean(sendAfterStop);
        try {
            appState.voiceRecorder.stop();
        } catch (_error) {
            appState.recordingVoice = false;
            updateVoiceButton();
        }
    }

    function syncVideoPrefForCurrentPeer() {
        setVideoControlDefaults();
        applyLocalMediaTrackToggles();
    }

    function onVideoShowToggleChanged() {
        applyLocalMediaTrackToggles();
    }

    function onVideoMuteToggleChanged() {
        applyLocalMediaTrackToggles();
    }

    function setVideoControlDefaults() {
        if (elements.videoShowToggle) {
            elements.videoShowToggle.checked = true;
        }
        if (elements.videoMuteToggle) {
            elements.videoMuteToggle.checked = false;
        }
    }

    function applyLocalMediaTrackToggles() {
        const stream = elements.localVideo ? elements.localVideo.srcObject : null;
        if (!stream || typeof stream.getTracks !== "function") {
            return;
        }
        const showVideo = Boolean(elements.videoShowToggle && elements.videoShowToggle.checked);
        const muteAudio = Boolean(elements.videoMuteToggle && elements.videoMuteToggle.checked);
        const videoTracks = typeof stream.getVideoTracks === "function" ? stream.getVideoTracks() : [];
        for (let i = 0; i < videoTracks.length; i += 1) {
            videoTracks[i].enabled = showVideo;
        }
        const audioTracks = typeof stream.getAudioTracks === "function" ? stream.getAudioTracks() : [];
        for (let i = 0; i < audioTracks.length; i += 1) {
            audioTracks[i].enabled = !muteAudio;
        }
    }

    function hasPendingTransfer() {
        return Boolean(
            appState.incomingFileOffer
            || Object.keys(appState.transferViews).length > 0
        );
    }

    function shouldShowOwnVideo() {
        return Boolean(elements.videoShowToggle.checked);
    }

    async function toggleVideoCall() {
        if (!appState.connected) {
            setStatus("尚未连接，当前无法发起视频通话。");
            return;
        }

        if (appState.videoState !== "idle") {
            if (!appState.videoModalOpen) {
                openVideoModal({ incoming: appState.videoState === "incoming" });
                return;
            }
            if (appState.videoState === "incoming") {
                return;
            }
            peerManager.hangupVideoCall();
            appState.videoState = "idle";
            updateVideoButton();
            setStatus("已挂断视频通话。");
            return;
        }
        await startVideoCall();
    }

    async function startVideoCall() {
        if (hasPendingTransfer()) {
            setStatus("文件传输进行中，请稍后再发起视频通话。");
            return;
        }
        try {
            await peerManager.startVideoCall({ showVideo: shouldShowOwnVideo(), requireAudio: true });
            appState.videoState = "calling";
            openVideoModal({ incoming: false });
            setVideoStatus("呼叫中...");
            updateVideoButton();
        } catch (error) {
            setStatus(`发起视频通话失败：${toErrorMessage(error)}`);
            appState.videoState = "idle";
            updateVideoButton();
        }
    }

    async function acceptIncomingVideoCall() {
        if (appState.videoState !== "incoming") {
            return;
        }
        try {
            await peerManager.acceptIncomingCall({
                showVideo: shouldShowOwnVideo(),
                requireAudio: true
            });
            appState.videoState = "connecting";
            setVideoStatus("连接中...");
            renderVideoModalActions();
            updateVideoButton();
        } catch (error) {
            setStatus(`接听失败：${toErrorMessage(error)}`);
            peerManager.hangupVideoCall();
            appState.videoState = "idle";
            updateVideoButton();
        }
    }

    function rejectIncomingVideoCall() {
        peerManager.rejectIncomingCall();
        appState.videoState = "idle";
        appState.incomingCallInfo = null;
        setVideoStatus("已拒绝");
        closeVideoModal({ keepCall: false });
        updateVideoButton();
    }

    function ensureVideoPlayback(videoElement, options = {}) {
        if (!videoElement) {
            return;
        }
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.setAttribute("playsinline", "true");
        if (typeof options.muted === "boolean") {
            videoElement.muted = options.muted;
        }
        if (!videoElement.srcObject || typeof videoElement.play !== "function") {
            return;
        }
        const playPromise = videoElement.play();
        if (!playPromise || typeof playPromise.catch !== "function") {
            return;
        }
        playPromise.catch((error) => {
            const errorName = error && error.name ? String(error.name) : "";
            if (errorName === "NotAllowedError" || errorName === "AbortError") {
                const now = Date.now();
                if (now - appState.lastVideoPlayHintAt > 2500) {
                    appState.lastVideoPlayHintAt = now;
                    setStatus("Safari 可能拦截了自动播放，请点一下视频画面继续播放。");
                }
                return;
            }
            console.warn("[AirCopy][VideoPlay] play failed", error);
        });
    }

    function setVideoStatus(text) {
        if (elements.videoStatus) {
            elements.videoStatus.textContent = text || "未开始";
        }
    }

    function resetVideoUI(statusText) {
        setVideoStatus(statusText || "未开始");
        setVideoControlDefaults();
        if (elements.localVideo) {
            elements.localVideo.srcObject = null;
        }
        if (elements.remoteVideo) {
            elements.remoteVideo.srcObject = null;
        }
        appState.videoState = "idle";
        appState.videoModalOpen = false;
        appState.incomingCallInfo = null;
        if (elements.localVideo && elements.localVideo.parentElement) {
            elements.localVideo.parentElement.classList.add("video-off");
        }
        if (elements.remoteVideo && elements.remoteVideo.parentElement) {
            elements.remoteVideo.parentElement.classList.add("video-off");
        }
        updateVideoButton();
    }

    function openVideoModal(options = {}) {
        appState.videoModalOpen = true;
        elements.videoModal.classList.remove("hidden");
        renderVideoModalActions(options.incoming);
    }

    function closeVideoModal(options = {}) {
        appState.videoModalOpen = false;
        elements.videoModal.classList.add("hidden");
        if (options.keepCall === false && appState.videoState !== "idle") {
            peerManager.hangupVideoCall();
            appState.videoState = "idle";
        }
        renderVideoModalActions(false);
        updateVideoButton();
    }

    function renderVideoModalActions(forceIncoming) {
        const isIncoming = typeof forceIncoming === "boolean"
            ? forceIncoming
            : appState.videoState === "incoming";
        elements.incomingCallActions.classList.toggle("hidden", !isIncoming);
        elements.hangupVideo.classList.toggle("hidden", isIncoming);
    }

    function updateVideoButton() {
        if (!elements.videoCall) {
            return;
        }
        if (appState.videoState === "idle") {
            elements.videoCall.textContent = "视频";
            return;
        }
        if (!appState.videoModalOpen) {
            elements.videoCall.textContent = "显示视频窗口";
            return;
        }
        elements.videoCall.textContent = appState.videoState === "incoming" ? "显示视频窗口" : "挂断视频";
    }

    function updateVoiceButton() {
        if (!elements.recordVoice) {
            return;
        }
        elements.recordVoice.textContent = appState.recordingVoice ? "停止录音" : "语音";
    }

    function appendMessage(from, text, isSystem = false, options = {}) {
        ensureActiveConversation();
        const kind = options.kind || "text";
        const message = {
            from,
            text: String(text || ""),
            isSystem: Boolean(isSystem || from === "system"),
            timeText: options.timeText || formatNowHHMM(),
            kind,
            fileName: options.fileName ? String(options.fileName) : "",
            fileSize: Math.max(0, Number(options.fileSize || 0)),
            mimeType: options.mimeType ? String(options.mimeType) : "",
            blobUrl: options.blobUrl ? String(options.blobUrl) : "",
            durationSec: Math.max(0, Number(options.durationSec || 0))
        };
        renderMessage(message);
        if (options.persist !== false) {
            appState.chatHistory.push(message);
            if (appState.chatHistory.length > CHAT_HISTORY_MAX) {
                appState.chatHistory = appState.chatHistory.slice(-CHAT_HISTORY_MAX);
            }
            syncConversationFromState();
            persistChatState();
        }
    }

    function renderMessage(message) {
        const div = document.createElement("div");
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

        const timestamp = document.createElement("span");
        timestamp.className = "message-time";
        timestamp.textContent = message.timeText || formatNowHHMM();
        div.appendChild(timestamp);

        const body = renderMessageBody(message);
        div.appendChild(body);

        elements.chatMessages.appendChild(div);
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    }

    function renderMessageBody(message) {
        const body = document.createElement("span");
        body.className = "message-body";
        if (message.kind === "file" || message.kind === "voice") {
            const info = document.createElement("span");
            info.textContent = message.text || "";
            body.appendChild(info);

            if (message.blobUrl) {
                if (message.kind === "voice") {
                    const audio = document.createElement("audio");
                    audio.className = "voice-audio";
                    audio.controls = true;
                    audio.src = message.blobUrl;
                    body.appendChild(audio);
                }
                const link = document.createElement("a");
                link.className = "attachment-link";
                link.href = message.blobUrl;
                link.download = message.fileName || "aircopy-file";
                link.textContent = message.kind === "voice" ? "下载语音" : "下载文件";
                body.appendChild(link);

                if (window.showSaveFilePicker) {
                    const saveBtn = document.createElement("button");
                    saveBtn.type = "button";
                    saveBtn.className = "secondary";
                    saveBtn.textContent = "选择位置保存";
                    saveBtn.addEventListener("click", async () => {
                        try {
                            await saveBlobUrlToDisk(message.blobUrl, message.fileName, message.mimeType);
                            setStatus(`已保存：${message.fileName}`);
                        } catch (error) {
                            setStatus(`保存失败：${toErrorMessage(error)}`);
                        }
                    });
                    body.appendChild(saveBtn);
                }
            } else {
                const tip = document.createElement("span");
                tip.textContent = "（刷新后附件不可恢复）";
                body.appendChild(tip);
            }
            return body;
        }
        body.textContent = message.text || "";
        return body;
    }

    async function saveBlobUrlToDisk(blobUrl, fileName, mimeType) {
        if (!window.showSaveFilePicker || !blobUrl) {
            return;
        }
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        const handle = await window.showSaveFilePicker({
            suggestedName: fileName || `aircopy-${Date.now()}`,
            types: [{
                description: "保存文件",
                accept: { [mimeType || blob.type || "application/octet-stream"]: [`.${guessExt(fileName)}`] }
            }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
    }

    function renderHistoryFromState() {
        elements.chatMessages.innerHTML = "";
        for (let i = 0; i < appState.chatHistory.length; i += 1) {
            renderMessage(appState.chatHistory[i]);
        }
    }

    function formatNowHHMM() {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        return `${hh}:${mm}`;
    }

    function sendCurrentMessage() {
        const text = elements.messageInput.value.trim();
        if (!text) {
            return;
        }
        if (!appState.connected) {
            setStatus("尚未连接，当前无法发送消息。");
            return;
        }
        try {
            peerManager.sendText(text);
            appendMessage("me", text);
            elements.messageInput.value = "";
        } catch (error) {
            setStatus(`发送失败：${toErrorMessage(error)}`);
        }
    }

    async function resetToSetup() {
        clearAutoReconnectState();
        setScanVisualSuccess(false);
        closeQrModal();
        closeEmojiPanel();
        closeFileOfferModal();
        setSessionPanelOpen(false);
        appState.videoState = "idle";
        if (appState.recordingVoice) {
            await stopVoiceRecording(false);
        }
        await stopScanIfRunning();
        peerManager.destroy();
        appState.localPeerId = "";
        appState.peerInitTask = null;
        appState.peerName = "";
        appState.remotePersistentId = "";
        appState.currentConversationId = "";
        appState.currentQrText = "";
        appState.handlingScan = false;
        appState.sidebarCollapsedDesktop = false;
        clearAllTransferProgress();
        appState.chatHistory = [];
        appState.unreadCount = 0;
        elements.chatMessages.innerHTML = "";
        delete elements.chatMessages.dataset.inited;
        setConnectionState(false);
        resetVideoUI("未开始");
        closeVideoModal({ keepCall: false });
        releaseObjectUrls();
        renderUnread();
        setPeerName("", { persist: false });
        elements.chatInterface.classList.add("hidden");
        elements.connectionSetup.classList.remove("hidden");
        const preferredMode = getPreferredConnectorMode(appState.isMobileLayout ? "scanner" : "qr");
        await setMode(preferredMode, { force: true });
        setStatus("已退出会话，请重新扫码连接。");
    }

    function setPeerName(name, options = {}) {
        appState.peerName = String(name || "").trim();
        const viewName = appState.peerName || "当前会话";
        if (elements.chatTitle) {
            elements.chatTitle.textContent = viewName;
        }
        if (elements.peerSessionName) {
            elements.peerSessionName.textContent = viewName;
        }
        if (options.persist !== false) {
            syncConversationFromState();
            persistChatState();
        }
    }

    function setConnectionState(connected) {
        appState.connected = Boolean(connected);
        if (elements.sendBtn) {
            elements.sendBtn.disabled = !appState.connected;
        }
        if (elements.sendFile) {
            elements.sendFile.disabled = !appState.connected;
        }
        if (elements.sendEmoji) {
            elements.sendEmoji.disabled = !appState.connected;
        }
        if (elements.recordVoice) {
            elements.recordVoice.disabled = !appState.connected;
        }
        if (elements.videoCall) {
            elements.videoCall.disabled = !appState.connected;
        }
        if (elements.messageInput) {
            elements.messageInput.disabled = !appState.connected;
            elements.messageInput.placeholder = appState.connected ? "输入消息..." : "连接后可发送消息...";
        }
        if (!appState.connected) {
            closeEmojiPanel();
            closeFileOfferModal();
            if (appState.recordingVoice) {
                stopVoiceRecording(false);
            }
        }
        updateVoiceButton();
        updateVideoButton();

        const statusText = appState.connected ? "在线" : "离线";
        if (elements.chatStatus) {
            elements.chatStatus.textContent = statusText;
            elements.chatStatus.classList.toggle("online", appState.connected);
            elements.chatStatus.classList.toggle("offline", !appState.connected);
        }
        if (elements.peerSessionStatus) {
            elements.peerSessionStatus.textContent = statusText;
            elements.peerSessionStatus.classList.toggle("online", appState.connected);
            elements.peerSessionStatus.classList.toggle("offline", !appState.connected);
        }
        syncHeartbeatKeepAlive();
    }

    function playHeartbeatFloatBurst() {
        if (!appState.connected) {
            return;
        }
        spawnStatusHeartBurst(elements.chatStatus, 8);
        spawnStatusHeartBurst(elements.peerSessionStatus, 8);
    }

    function spawnStatusHeartBurst(anchor, count = 8) {
        if (!anchor || !anchor.classList.contains("online")) {
            return;
        }
        const total = Math.max(4, Number(count) || 0);
        for (let i = 0; i < total; i += 1) {
            const delay = i * 95 + Math.random() * 90;
            window.setTimeout(() => {
                spawnStatusHeart(anchor);
            }, delay);
        }
    }

    function spawnStatusHeart(anchor) {
        if (!anchor || !anchor.isConnected || !anchor.classList.contains("online")) {
            return;
        }
        const heart = document.createElement("span");
        heart.className = "status-heart-float";
        heart.textContent = HEART_FLOAT_CHARS[Math.floor(Math.random() * HEART_FLOAT_CHARS.length)] || "❤";
        const drift = (Math.random() * 26 - 13).toFixed(1);
        const rise = (48 + Math.random() * 26).toFixed(1);
        const duration = Math.round(900 + Math.random() * 700);
        const scale = (0.82 + Math.random() * 0.48).toFixed(2);
        heart.style.setProperty("--heart-drift", `${drift}px`);
        heart.style.setProperty("--heart-rise", `${rise}px`);
        heart.style.setProperty("--heart-duration", `${duration}ms`);
        heart.style.setProperty("--heart-scale", scale);
        anchor.appendChild(heart);
        window.setTimeout(() => {
            if (heart.parentNode) {
                heart.parentNode.removeChild(heart);
            }
        }, duration + 200);
    }

    function shouldEnableHeartbeatKeepAlive() {
        return appState.connected;
    }

    function syncHeartbeatKeepAlive() {
        peerManager.setHeartbeatKeepAliveEnabled(shouldEnableHeartbeatKeepAlive());
    }

    function markUnreadIfNeeded(isPeerMessage) {
        if (!isPeerMessage) {
            return;
        }
        if (isChatActive()) {
            clearUnread();
            return;
        }
        appState.unreadCount += 1;
        renderUnread();
    }

    function clearUnread() {
        if (appState.unreadCount === 0) {
            return;
        }
        appState.unreadCount = 0;
        syncConversationFromState();
        renderUnread();
    }

    function renderUnread() {
        const count = appState.unreadCount;
        const view = count > 99 ? "99+" : String(count);
        if (elements.chatUnread) {
            elements.chatUnread.textContent = view;
            elements.chatUnread.classList.toggle("hidden", count <= 0);
        }
        if (elements.peerSessionUnread) {
            elements.peerSessionUnread.textContent = view;
            elements.peerSessionUnread.classList.toggle("hidden", count <= 0);
        }
        syncConversationFromState();
        persistChatState();
    }

    function getDisplayName() {
        const name = elements.displayName.value.trim();
        return name || "匿名用户";
    }

    function setStatus(text) {
        const message = String(text || "");
        elements.statusText.textContent = message;
        appendStatusLog(message, "status");
        console.info(`[AirCopy][Status] ${message}`);
    }

    function appendStatusLog(message, source = "status") {
        const text = String(message || "").trim();
        if (!text) {
            return;
        }
        appState.statusLogs.push({
            ts: Date.now(),
            source: String(source || "status"),
            text
        });
        if (appState.statusLogs.length > appState.statusLogMax) {
            appState.statusLogs.splice(0, appState.statusLogs.length - appState.statusLogMax);
        }
    }

    function formatLogTimestamp(ts) {
        const stamp = Number(ts) || Date.now();
        try {
            return new Date(stamp).toLocaleString("zh-CN", { hour12: false });
        } catch (_error) {
            return String(stamp);
        }
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

    async function copyTextToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(String(text || ""));
            return;
        }
        const textarea = document.createElement("textarea");
        textarea.value = String(text || "");
        textarea.setAttribute("readonly", "readonly");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        let copied = false;
        try {
            copied = document.execCommand("copy");
        } finally {
            textarea.remove();
        }
        if (!copied) {
            throw new Error("浏览器拒绝剪贴板写入");
        }
    }

    function setCopyLatestLogsButtonFeedback(state = "idle") {
        if (!elements.copyLatestLogs) {
            return;
        }
        if (appState.copyLogsFeedbackTimer) {
            window.clearTimeout(appState.copyLogsFeedbackTimer);
            appState.copyLogsFeedbackTimer = null;
        }
        elements.copyLatestLogs.classList.remove("state-success");
        if (state === "success") {
            elements.copyLatestLogs.textContent = "已复制";
            elements.copyLatestLogs.classList.add("state-success");
            appState.copyLogsFeedbackTimer = window.setTimeout(() => {
                setCopyLatestLogsButtonFeedback("idle");
            }, COPY_LOGS_FEEDBACK_MS);
            return;
        }
        if (state === "error") {
            elements.copyLatestLogs.textContent = "复制失败";
            appState.copyLogsFeedbackTimer = window.setTimeout(() => {
                setCopyLatestLogsButtonFeedback("idle");
            }, COPY_LOGS_FEEDBACK_MS);
            return;
        }
        elements.copyLatestLogs.textContent = "复制最新日志";
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

    async function pickCameraDeviceId() {
        try {
            if (
                window.ZXingBrowser
                && ZXingBrowser.BrowserCodeReader
                && typeof ZXingBrowser.BrowserCodeReader.listVideoInputDevices === "function"
            ) {
                const cameras = await ZXingBrowser.BrowserCodeReader.listVideoInputDevices();
                if (Array.isArray(cameras) && cameras.length > 0) {
                    const back = cameras.find((camera) => /back|rear|environment|后置/i.test(camera.label || ""));
                    return (back || cameras[0]).deviceId || (back || cameras[0]).id || null;
                }
            }
        } catch (_error) {
            // Fall through to constraints path.
        }
        return null;
    }

    function toErrorMessage(error) {
        if (!error) {
            return "未知错误";
        }
        if (typeof error === "string") {
            return error;
        }
        if (error.message) {
            return error.message;
        }
        if (error.name) {
            return error.name;
        }
        try {
            return JSON.stringify(error);
        } catch (_jsonError) {
            return String(error);
        }
    }

    function loadPersistedChatState() {
        const sanitizeMessages = (messages) => {
            if (!Array.isArray(messages)) {
                return [];
            }
            return messages
                .map((item) => ({
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
                }))
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
                appState.conversations = {
                    [legacyConversationId]: {
                        id: legacyConversationId,
                        peerName: parsed.peerName ? String(parsed.peerName) : "",
                        unreadCount: Math.max(0, Number(parsed.unreadCount || 0)),
                        messages: sanitizeMessages(parsed.messages)
                    }
                };
                appState.currentConversationId = legacyConversationId;
            } else {
                return;
            }

            const current = ensureConversation(appState.currentConversationId);
            if (current) {
                appState.chatHistory = current.messages.slice(-CHAT_HISTORY_MAX);
                appState.unreadCount = Math.max(0, Number(current.unreadCount || 0));
                setPeerName(current.peerName || "", { persist: false });
            } else {
                appState.chatHistory = [];
                appState.unreadCount = 0;
                setPeerName("", { persist: false });
            }
            renderUnread();
        } catch (_error) {
            // Ignore malformed local cache and continue.
        }
    }

    function persistChatState() {
        try {
            syncConversationFromState();
            const ids = Object.keys(appState.conversations);
            const serializedConversations = {};
            for (let i = 0; i < ids.length; i += 1) {
                const id = ids[i];
                const conversation = appState.conversations[id];
                serializedConversations[id] = {
                    peerName: conversation.peerName || "",
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
        } catch (_error) {
            // Ignore storage failures (private mode/quota).
        }
    }

    function sanitizeForStorage(messages) {
        if (!Array.isArray(messages)) {
            return [];
        }
        return messages.slice(-CHAT_HISTORY_MAX).map((msg) => ({
            from: msg.from,
            text: msg.text,
            isSystem: Boolean(msg.isSystem),
            timeText: msg.timeText,
            kind: msg.kind || "text",
            fileName: msg.fileName || "",
            fileSize: Math.max(0, Number(msg.fileSize || 0)),
            mimeType: msg.mimeType || "",
            durationSec: Math.max(0, Number(msg.durationSec || 0))
        }));
    }

    window.addEventListener("beforeunload", () => {
        if (appState.copyLogsFeedbackTimer) {
            window.clearTimeout(appState.copyLogsFeedbackTimer);
            appState.copyLogsFeedbackTimer = null;
        }
        clearAutoReconnectState();
        closeQrModal();
        closeEmojiPanel();
        closeFileOfferModal();
        releaseObjectUrls();
        stopScanIfRunning();
        peerManager.destroy();
    });
})();
