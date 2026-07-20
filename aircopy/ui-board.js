/**
 * ui-board.js - Shared whiteboard with full-stage canvas and floating controls.
 *
 * Depends on: storage.js, ui-video.js, utils.js
 */

var UiBoard = (function () {
    var MIN_ZOOM = 0.2;
    var MAX_ZOOM = 10;
    var DEFAULT_BRUSH_COLOR = "#2563eb";
    var DEFAULT_BRUSH_SIZE = 12;
    var VIEWPORT_BROADCAST_DELAY_MS = 80;
    var MIN_POINT_DISTANCE_PX = 0.6;
    var SELF_FOLLOW_VALUE = "__self__";
    var LASER_TTL_MS = 1200;
    var LASER_SEND_INTERVAL_MS = 33;

    function ensureBoardRoot(appState) {
        if (!appState.boardSessions || typeof appState.boardSessions !== "object") {
            appState.boardSessions = {};
        }
        if (!appState.boardUi || typeof appState.boardUi !== "object") {
            appState.boardUi = {
                controlsCollapsed: false,
                layerPopoverOpen: false,
                pseudoFullscreen: false,
                fullscreenRequested: false,
                dragParticipantId: "",
                touchDragTimer: null,
                touchDragPending: null,
                touchDragState: null
            };
        }
        if (!appState.boardPointerState || typeof appState.boardPointerState !== "object") {
            appState.boardPointerState = createPointerState();
        }
    }

    function createPointerState() {
        return {
            pointers: {},
            gestureMode: "",
            drawPointerId: null,
            panPointerId: null,
            lastScreenPoint: null,
            pinchBaseDistance: 0,
            pinchBaseViewport: null,
            pinchBaseCenterWorld: null,
            pinchBaseScreenCenter: null
        };
    }

    function createEmptyBoardSession(conversationId) {
        return {
            conversationId: String(conversationId || "").trim(),
            viewport: createDefaultViewport(),
            tool: "brush",
            brushColor: DEFAULT_BRUSH_COLOR,
            brushSize: DEFAULT_BRUSH_SIZE,
            viewMode: "free",
            followParticipantId: "",
            sessionState: "idle",
            incomingInviteName: "",
            participants: {},
            liveStroke: null,
            renderQueued: false,
            viewportBroadcastTimer: null,
            laserRenderQueued: false,
            laserAutoClearTimer: null,
            laserSendAt: 0
        };
    }

    function createDefaultViewport() {
        return {
            centerX: 0,
            centerY: 0,
            zoom: 1
        };
    }

    function getCurrentConversationId(appState) {
        return String(appState.currentConversationId || "").trim();
    }

    function getLocalParticipantId(appState) {
        return String(appState.localPersistentId || "").trim() || "local:self";
    }

    function getLocalParticipantName(appState, elements) {
        if (elements && elements.displayName && elements.displayName.value) {
            return String(elements.displayName.value || "").trim() || "我";
        }
        return "我";
    }

    function ensureBoardSession(appState, elements, conversationId) {
        ensureBoardRoot(appState);
        var id = String(conversationId || getCurrentConversationId(appState)).trim();
        if (!id) {
            return null;
        }
        if (!appState.boardSessions[id]) {
            appState.boardSessions[id] = createEmptyBoardSession(id);
        }
        var session = appState.boardSessions[id];
        session.conversationId = id;
        applyStoredPrefsToSession(appState, session);
        ensureParticipant(session, getLocalParticipantId(appState), getLocalParticipantName(appState, elements));
        return session;
    }

    function applyStoredPrefsToSession(appState, session) {
        if (!session) {
            return;
        }
        var prefs = ensureBoardConversationPrefs(appState, session.conversationId);
        session.viewMode = prefs && prefs.viewMode === "follow" ? "follow" : "free";
        session.followParticipantId = session.viewMode === "follow"
            ? String(prefs.followParticipantId || "").trim()
            : "";
    }

    function ensureParticipant(session, participantId, name) {
        var id = String(participantId || "").trim();
        if (!id) {
            return null;
        }
        if (!session.participants[id]) {
            session.participants[id] = {
                id: id,
                name: String(name || "").trim() || "匿名用户",
                strokes: [],
                strokeMap: {},
                historyDone: [],
                historyUndone: [],
                lastViewport: null,
                laser: null
            };
        } else if (name) {
            session.participants[id].name = String(name || "").trim() || session.participants[id].name;
        }
        return session.participants[id];
    }

    function getLocalParticipant(appState, elements, session) {
        return ensureParticipant(session, getLocalParticipantId(appState), getLocalParticipantName(appState, elements));
    }

    function getConversationPeerId(appState, conversationId) {
        var id = String(conversationId || getCurrentConversationId(appState)).trim();
        if (!id || !appState.conversations || !appState.conversations[id]) {
            return "";
        }
        return String(appState.conversations[id].peerId || "").trim();
    }

    function getConversationDisplayName(appState, conversationId) {
        var id = String(conversationId || getCurrentConversationId(appState)).trim();
        if (!id || !appState.conversations || !appState.conversations[id]) {
            return "";
        }
        return String(appState.conversations[id].peerName || "").trim();
    }

    function getSessionState(session) {
        if (!session || !session.sessionState) {
            return "idle";
        }
        return String(session.sessionState);
    }

    function setSessionState(session, nextState) {
        if (!session) {
            return;
        }
        if (nextState !== "outgoing" && nextState !== "incoming" && nextState !== "active") {
            nextState = "idle";
        }
        session.sessionState = nextState;
        if (nextState !== "incoming") {
            session.incomingInviteName = "";
        }
    }

    function supportsScreenShare() {
        return Boolean(
            navigator.mediaDevices
            && typeof navigator.mediaDevices.getDisplayMedia === "function"
        );
    }

    function supportsFullscreen(target) {
        if (canUseNativeFullscreen(target)) {
            return true;
        }
        return canUseInstalledAppFullscreen(target);
    }

    function isFullscreenActive(elements) {
        if (!elements || !elements.boardModal) {
            return false;
        }
        if (elements.boardModal.classList.contains("board-modal-pseudo-fullscreen")) {
            return true;
        }
        var active = getNativeFullscreenElement();
        return Boolean(active && (active === elements.boardModal || elements.boardModal.contains(active)));
    }

    function getNativeFullscreenElement() {
        if (document.fullscreenElement) {
            return document.fullscreenElement;
        }
        if (document.webkitFullscreenElement) {
            return document.webkitFullscreenElement;
        }
        return null;
    }

    function shouldUseFullscreenGuard() {
        var touchCapable = Boolean(
            (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0)
            || (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
        );
        if (!touchCapable) {
            return false;
        }
        var ua = typeof navigator !== "undefined" ? String(navigator.userAgent || "") : "";
        return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touchCapable);
    }

    function isStandaloneDisplayMode() {
        var navigatorStandalone = typeof navigator !== "undefined" && navigator.standalone === true;
        var mediaStandalone = typeof window !== "undefined"
            && window.matchMedia
            && window.matchMedia("(display-mode: standalone)").matches;
        return Boolean(navigatorStandalone || mediaStandalone);
    }

    function canUseInstalledAppFullscreen(target) {
        return Boolean(
            target
            && shouldUseFullscreenGuard()
            && isStandaloneDisplayMode()
        );
    }

    function getMobileBrowserLabel() {
        var ua = typeof navigator !== "undefined" ? String(navigator.userAgent || "") : "";
        if (/CriOS/i.test(ua)) {
            return "Chrome";
        }
        if (/FxiOS/i.test(ua)) {
            return "Firefox";
        }
        if (/EdgiOS/i.test(ua)) {
            return "Edge";
        }
        if (/Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua)) {
            return "Safari";
        }
        return "当前浏览器";
    }

    function canUseNativeFullscreen(target) {
        return Boolean(
            target
            && typeof target.requestFullscreen === "function"
            && document
            && document.fullscreenEnabled !== false
        );
    }

    function setPseudoFullscreen(appState, elements, active) {
        ensureBoardRoot(appState);
        var enabled = Boolean(active);
        appState.boardUi.pseudoFullscreen = enabled;
        if (!elements || !elements.boardModal) {
            return;
        }
        elements.boardModal.classList.toggle("board-modal-pseudo-fullscreen", enabled);
        if (document && document.documentElement) {
            document.documentElement.classList.toggle("board-pseudo-fullscreen", enabled);
        }
        if (document && document.body) {
            document.body.classList.toggle("board-pseudo-fullscreen", enabled);
        }
    }

    function getViewportMetaElement() {
        return document.querySelector('meta[name="viewport"]');
    }

    function clearDocumentSelection() {
        if (!window.getSelection) {
            return;
        }
        var selection = window.getSelection();
        if (selection && typeof selection.removeAllRanges === "function" && String(selection).length > 0) {
            selection.removeAllRanges();
        }
    }

    function lockBoardViewportGestures(appState) {
        ensureBoardRoot(appState);
        if (appState.boardUi.viewportLockActive) {
            return;
        }
        var viewportMeta = getViewportMetaElement();
        appState.boardUi.viewportMetaElement = viewportMeta || null;
        appState.boardUi.viewportMetaOriginal = viewportMeta ? String(viewportMeta.getAttribute("content") || "") : "";
        if (viewportMeta) {
            viewportMeta.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
        }
        var blockGesture = function (event) {
            if (!appState.boardModalOpen || !event || !event.cancelable) {
                return;
            }
            event.preventDefault();
        };
        var blockBoardPinch = function (event) {
            if (!appState.boardModalOpen || !event || !event.cancelable) {
                return;
            }
            var target = event.target;
            if (!(target instanceof HTMLElement) || !target.closest("#board-modal")) {
                return;
            }
            if (event.touches && event.touches.length >= 2) {
                event.preventDefault();
            }
        };
        var blockSelection = function (event) {
            if (!appState.boardModalOpen || !event || !event.cancelable) {
                return;
            }
            event.preventDefault();
        };
        var clearSelection = function () {
            if (!appState.boardModalOpen) {
                return;
            }
            clearDocumentSelection();
        };
        var blockBoardContextMenu = function (event) {
            if (!appState.boardModalOpen || !event || !event.cancelable) {
                return;
            }
            var target = event.target;
            if (!(target instanceof HTMLElement) || !target.closest("#board-modal")) {
                return;
            }
            event.preventDefault();
        };
        var blockBoardDblClick = function (event) {
            if (!appState.boardModalOpen || !event) {
                return;
            }
            var target = event.target;
            if (!(target instanceof HTMLElement) || !target.closest("#board-modal")) {
                return;
            }
            if (event.cancelable) {
                event.preventDefault();
            }
            event.stopPropagation();
        };
        clearDocumentSelection();
        if (document && document.documentElement) {
            document.documentElement.classList.add("board-interaction-lock");
        }
        if (document && document.body) {
            document.body.classList.add("board-interaction-lock");
        }
        document.addEventListener("gesturestart", blockGesture, { passive: false });
        document.addEventListener("gesturechange", blockGesture, { passive: false });
        document.addEventListener("gestureend", blockGesture, { passive: false });
        document.addEventListener("touchmove", blockBoardPinch, { passive: false });
        document.addEventListener("selectstart", blockSelection, true);
        document.addEventListener("selectionchange", clearSelection, true);
        document.addEventListener("contextmenu", blockBoardContextMenu, true);
        document.addEventListener("dblclick", blockBoardDblClick, true);
        appState.boardUi.viewportLockHandlers = {
            blockGesture: blockGesture,
            blockBoardPinch: blockBoardPinch,
            blockSelection: blockSelection,
            clearSelection: clearSelection,
            blockBoardContextMenu: blockBoardContextMenu,
            blockBoardDblClick: blockBoardDblClick
        };
        appState.boardUi.viewportLockActive = true;
    }

    function unlockBoardViewportGestures(appState) {
        ensureBoardRoot(appState);
        if (!appState.boardUi.viewportLockActive) {
            return;
        }
        var handlers = appState.boardUi.viewportLockHandlers || null;
        if (handlers) {
            document.removeEventListener("gesturestart", handlers.blockGesture, { passive: false });
            document.removeEventListener("gesturechange", handlers.blockGesture, { passive: false });
            document.removeEventListener("gestureend", handlers.blockGesture, { passive: false });
            document.removeEventListener("touchmove", handlers.blockBoardPinch, { passive: false });
            document.removeEventListener("selectstart", handlers.blockSelection, true);
            document.removeEventListener("selectionchange", handlers.clearSelection, true);
            document.removeEventListener("contextmenu", handlers.blockBoardContextMenu, true);
            document.removeEventListener("dblclick", handlers.blockBoardDblClick, true);
        }
        var viewportMeta = appState.boardUi.viewportMetaElement || getViewportMetaElement();
        if (viewportMeta && typeof appState.boardUi.viewportMetaOriginal === "string") {
            viewportMeta.setAttribute("content", appState.boardUi.viewportMetaOriginal || "width=device-width, initial-scale=1.0");
        }
        clearDocumentSelection();
        if (document && document.documentElement) {
            document.documentElement.classList.remove("board-interaction-lock");
        }
        if (document && document.body) {
            document.body.classList.remove("board-interaction-lock");
        }
        appState.boardUi.viewportLockHandlers = null;
        appState.boardUi.viewportMetaElement = null;
        appState.boardUi.viewportMetaOriginal = "";
        appState.boardUi.viewportLockActive = false;
    }

    function isRemoteScreenBackgroundActive(appState, elements) {
        return Boolean(
            appState.remoteMediaSourceMode === "screen"
            && elements
            && elements.remoteVideo
            && elements.remoteVideo.srcObject
            && elements.remoteVideo.readyState >= 2
        );
    }

    function canUseDesktopLayerDrag() {
        if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
            return true;
        }
        return false;
    }

    function openBoardModal(appState, elements, peerManager, helpers, conversationId) {
        if (!helpers || typeof helpers.isCurrentConversationConnected !== "function" || !helpers.isCurrentConversationConnected()) {
            if (helpers && typeof helpers.setStatus === "function") {
                helpers.setStatus("当前会话未连接，当前无法打开共享画板。");
            }
            return;
        }
        var session = ensureBoardSession(appState, elements, conversationId);
        if (!session || !elements.boardModal) {
            return;
        }
        setSessionState(session, "active");
        appState.boardModalOpen = true;
        closeBoardInviteModal(elements);
        lockBoardViewportGestures(appState);
        elements.boardModal.classList.remove("hidden");
        resizeBoardCanvas(elements);
        syncBoardUI(appState, elements, session);
        sendViewportUpdate(appState, elements, peerManager, session.conversationId, true);
        requestBoardSync(appState, elements, peerManager, session.conversationId);
        requestRender(appState, elements, session.conversationId);
    }

    function closeBoardModal(appState, elements) {
        ensureBoardRoot(appState);
        appState.boardUi.fullscreenRequested = false;
        setPseudoFullscreen(appState, elements, false);
        unlockBoardViewportGestures(appState);
        if (getNativeFullscreenElement() && document.exitFullscreen) {
            document.exitFullscreen().catch(function () {
                return;
            });
        }
        appState.boardModalOpen = false;
        appState.boardUi.layerPopoverOpen = false;
        clearTouchLayerDrag(appState);
        appState.boardPointerState = createPointerState();
        if (elements.boardModal) {
            elements.boardModal.classList.add("hidden");
        }
        if (elements.boardLayerPopover) {
            elements.boardLayerPopover.classList.add("hidden");
        }
    }

    function resetSessionUiState(session) {
        if (!session) {
            return;
        }
        session.liveStroke = null;
        session.viewportBroadcastTimer = null;
        setSessionState(session, "idle");
    }

    function handleBoardToggle(appState, elements, peerManager, helpers) {
        var session = ensureBoardSession(appState, elements);
        if (!session) {
            return;
        }
        var state = getSessionState(session);
        if (state === "active" || state === "outgoing") {
            leaveBoardSession(appState, elements, peerManager);
            return;
        }
        if (state === "incoming") {
            openBoardInviteModal(elements, (session.incomingInviteName || getConversationDisplayName(appState, session.conversationId) || "对方") + " 邀请你进入共享画板");
            return;
        }
        requestBoardSession(appState, elements, peerManager, helpers);
    }

    function requestBoardSession(appState, elements, peerManager, helpers) {
        if (!helpers || typeof helpers.isCurrentConversationConnected !== "function" || !helpers.isCurrentConversationConnected()) {
            if (helpers && typeof helpers.setStatus === "function") {
                helpers.setStatus("当前会话未连接，当前无法发起共享画板。");
            }
            return;
        }
        var session = ensureBoardSession(appState, elements);
        var peerId = getConversationPeerId(appState, session && session.conversationId);
        if (!session || !peerId || !peerManager || typeof peerManager.sendStructured !== "function") {
            return;
        }
        setSessionState(session, "outgoing");
        updateBoardButton(appState, elements, session);
        peerManager.sendStructured(peerId, "board-invite", {
            pid: getLocalParticipantId(appState),
            name: getLocalParticipantName(appState, elements)
        });
        if (helpers && typeof helpers.setStatus === "function") {
            helpers.setStatus("已发送共享画板邀请，等待对方确认。");
        }
    }

    function acceptBoardInvite(appState, elements, peerManager, helpers) {
        var session = ensureBoardSession(appState, elements);
        var peerId = getConversationPeerId(appState, session && session.conversationId);
        if (!session || getSessionState(session) !== "incoming" || !peerId || !peerManager || typeof peerManager.sendStructured !== "function") {
            return;
        }
        peerManager.sendStructured(peerId, "board-invite-response", {
            pid: getLocalParticipantId(appState),
            name: getLocalParticipantName(appState, elements),
            accepted: true
        });
        openBoardModal(appState, elements, peerManager, helpers || {
            isCurrentConversationConnected: function () {
                return true;
            }
        }, session.conversationId);
    }

    function rejectBoardInvite(appState, elements, peerManager) {
        var session = ensureBoardSession(appState, elements);
        var peerId = getConversationPeerId(appState, session && session.conversationId);
        if (!session) {
            return;
        }
        if (getSessionState(session) === "incoming" && peerId && peerManager && typeof peerManager.sendStructured === "function") {
            peerManager.sendStructured(peerId, "board-invite-response", {
                pid: getLocalParticipantId(appState),
                name: getLocalParticipantName(appState, elements),
                accepted: false
            });
        }
        resetSessionUiState(session);
        closeBoardInviteModal(elements);
        closeBoardModal(appState, elements);
        updateBoardButton(appState, elements, session);
    }

    function leaveBoardSession(appState, elements, peerManager, options) {
        options = options || {};
        var session = ensureBoardSession(appState, elements);
        if (!session) {
            closeBoardModal(appState, elements);
            closeBoardInviteModal(elements);
            return;
        }
        var peerId = getConversationPeerId(appState, session.conversationId);
        if (options.notify !== false && peerId && peerManager && typeof peerManager.sendStructured === "function") {
            peerManager.sendStructured(peerId, "board-session-ended", {
                pid: getLocalParticipantId(appState),
                name: getLocalParticipantName(appState, elements)
            });
        }
        resetSessionUiState(session);
        closeBoardModal(appState, elements);
        closeBoardInviteModal(elements);
        updateBoardButton(appState, elements, session);
    }

    function syncBoardUI(appState, elements, session) {
        if (!session) {
            return;
        }
        updateBoardButton(appState, elements, session);
        if (elements.boardColor) {
            elements.boardColor.value = session.brushColor || DEFAULT_BRUSH_COLOR;
        }
        if (elements.boardSize) {
            elements.boardSize.value = String(session.brushSize || DEFAULT_BRUSH_SIZE);
        }
        updateToolButtons(elements, session.tool);
        toggleButtonActive(elements.boardFreeView, session.viewMode !== "follow");
        toggleButtonActive(elements.boardLayerToggle, Boolean(appState.boardUi && appState.boardUi.layerPopoverOpen));
        updateBoardStatus(appState, elements, session);
        updateBoardMediaUI(appState, elements);
        updateHistoryButtons(appState, elements, session);
        syncControlsState(appState, elements);
        syncLayerList(appState, elements, session);
        syncFollowList(appState, elements, session);
        syncFullscreenButton(appState, elements);
    }

    function updateBoardButton(appState, elements, session) {
        if (!elements || !elements.boardToggle) {
            return;
        }
        var currentSession = session || ensureBoardSession(appState, elements);
        var state = getSessionState(currentSession);
        if (state === "active") {
            elements.boardToggle.textContent = "退出画板";
            return;
        }
        if (state === "outgoing") {
            elements.boardToggle.textContent = "取消画板邀请";
            return;
        }
        if (state === "incoming") {
            elements.boardToggle.textContent = "处理画板邀请";
            return;
        }
        elements.boardToggle.textContent = "发起画板";
    }

    function openBoardInviteModal(elements, text) {
        if (!elements || !elements.boardInviteModal) {
            return;
        }
        if (elements.boardInviteText) {
            elements.boardInviteText.textContent = text || "对方邀请你进入共享画板";
        }
        elements.boardInviteModal.classList.remove("hidden");
    }

    function closeBoardInviteModal(elements) {
        if (!elements || !elements.boardInviteModal) {
            return;
        }
        elements.boardInviteModal.classList.add("hidden");
    }

    function syncControlsState(appState, elements) {
        ensureBoardRoot(appState);
        var collapsed = Boolean(appState.boardUi.controlsCollapsed);
        if (elements.boardControls) {
            elements.boardControls.classList.toggle("collapsed", collapsed);
        }
        if (elements.boardControlsToggle) {
            elements.boardControlsToggle.textContent = collapsed ? "展开" : "收起";
        }
        if (elements.boardLayerPopover) {
            elements.boardLayerPopover.classList.toggle("hidden", !appState.boardUi.layerPopoverOpen || collapsed);
        }
        toggleButtonActive(elements.boardLayerToggle, Boolean(appState.boardUi.layerPopoverOpen && !collapsed));
    }

    function updateToolButtons(elements, tool) {
        toggleButtonActive(elements.boardToolBrush, String(tool || "") === "brush");
        toggleButtonActive(elements.boardToolEraser, String(tool || "") === "eraser");
        toggleButtonActive(elements.boardToolLaser, String(tool || "") === "laser");
        toggleButtonActive(elements.boardToolPan, String(tool || "") === "pan");
    }

    function toggleButtonActive(element, active) {
        if (!element) {
            return;
        }
        element.classList.toggle("active", Boolean(active));
    }

    function updateBoardStatus(appState, elements, session) {
        if (!elements || !elements.boardStatus) {
            return;
        }
        if (!session) {
            elements.boardStatus.textContent = "未打开";
            return;
        }
        var toolLabel = session.tool === "eraser"
            ? "橡皮"
            : (session.tool === "pan"
                ? "平移"
                : (session.tool === "laser" ? "激光棒" : "画笔"));
        var viewLabel = session.viewMode === "follow"
            ? "跟随：" + getParticipantDisplayName(session, session.followParticipantId)
            : "自由视角";
        var screenLabel = isRemoteScreenBackgroundActive(appState, elements) ? " · 对方屏幕背景" : "";
        elements.boardStatus.textContent = toolLabel + " · " + viewLabel + screenLabel;
    }

    function updateBoardMediaUI(appState, elements) {
        if (!elements) {
            return;
        }
        var voiceActive = appState.videoState !== "idle" && appState.localMediaSourceMode === "audio";
        var screenActive = appState.videoState !== "idle" && appState.localMediaSourceMode === "screen";
        if (elements.boardVoiceToggle) {
            elements.boardVoiceToggle.textContent = voiceActive ? "关闭语音" : "开启语音";
            elements.boardVoiceToggle.classList.toggle("active", voiceActive);
        }
        if (elements.boardScreenToggle) {
            var screenSupported = supportsScreenShare();
            elements.boardScreenToggle.classList.toggle("hidden", !screenSupported);
            elements.boardScreenToggle.textContent = screenActive ? "停止共享屏幕" : "共享屏幕";
            elements.boardScreenToggle.classList.toggle("active", screenActive);
        }
        if (elements.boardMediaHint) {
            if (appState.videoState === "idle") {
                elements.boardMediaHint.textContent = "默认自动共享我的视角；如需语音或屏幕共享，可在这里直接切换。";
            } else if (appState.localMediaSourceMode === "screen") {
                elements.boardMediaHint.textContent = "我正在共享屏幕，若对方跟随我会看到相同背景。";
            } else if (appState.remoteMediaSourceMode === "screen") {
                elements.boardMediaHint.textContent = "对方屏幕正作为背景显示，清空和擦除都不会影响背景。";
            } else if (appState.localMediaSourceMode === "audio") {
                elements.boardMediaHint.textContent = "当前为语音模式，画板仍会继续同步。";
            } else {
                elements.boardMediaHint.textContent = "当前媒体已连接，可继续绘制或切换语音/屏幕共享。";
            }
        }
    }

    function updateHistoryButtons(appState, elements, session) {
        if (!elements || !session) {
            return;
        }
        var participant = session.participants[getLocalParticipantId(appState)];
        var canUndo = getLastVisibleHistoryStroke(participant) !== null;
        var canRedo = getLastHiddenRedoStroke(participant) !== null;
        if (elements.boardUndo) {
            elements.boardUndo.disabled = !canUndo;
        }
        if (elements.boardRedo) {
            elements.boardRedo.disabled = !canRedo;
        }
    }

    function syncFullscreenButton(appState, elements) {
        if (!elements || !elements.boardFullscreenToggle) {
            return;
        }
        var canFullscreen = supportsFullscreen(elements.boardModal);
        elements.boardFullscreenToggle.classList.toggle("hidden", !canFullscreen);
        elements.boardFullscreenToggle.textContent = isFullscreenActive(elements) ? "退出全屏" : "全屏";
        updateFullscreenHint(appState, elements);
    }

    function updateFullscreenHint(appState, elements) {
        if (!elements || !elements.boardFullscreenHint) {
            return;
        }
        var showHint = shouldUseFullscreenGuard();
        elements.boardFullscreenHint.classList.toggle("hidden", !showHint);
        if (!showHint) {
            elements.boardFullscreenHint.textContent = "";
            return;
        }
        if (canUseInstalledAppFullscreen(elements.boardModal)) {
            elements.boardFullscreenHint.textContent = isFullscreenActive(elements)
                ? "当前已从主屏幕 App 模式运行；若退出全屏，按钮会按真实状态自动恢复。"
                : "已处于主屏幕 App 模式；此时全屏不会受 Safari 标签页手势干扰。";
            return;
        }
        var browserLabel = getMobileBrowserLabel();
        if (browserLabel !== "Safari") {
            elements.boardFullscreenHint.textContent = "你当前在 iPad " + browserLabel + " 中；这里看不到主屏幕独立启动。若要规避全屏上扫/下扫退出，请改用 Safari 打开本页，再点“分享”→“添加到主屏幕”，然后从主屏幕启动 AirCopy。";
            return;
        }
        elements.boardFullscreenHint.textContent = "若要规避 iPad 上扫/下扫导致的全屏退出，请在 Safari 里点“分享”→“添加到主屏幕”，再从主屏幕打开 AirCopy 后使用全屏。";
    }

    function toggleControlsCollapsed(appState, elements) {
        ensureBoardRoot(appState);
        appState.boardUi.controlsCollapsed = !appState.boardUi.controlsCollapsed;
        if (appState.boardUi.controlsCollapsed) {
            appState.boardUi.layerPopoverOpen = false;
        }
        syncControlsState(appState, elements);
    }

    function resizeBoardCanvas(elements) {
        if (!elements || !elements.boardCanvas || !elements.boardStage) {
            return;
        }
        var rect = elements.boardStage.getBoundingClientRect();
        var width = Math.max(320, Math.round(rect.width || 0));
        var height = Math.max(240, Math.round(rect.height || 0));
        var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        resizeCanvasElement(elements.boardCanvas, width, height, dpr);
        if (elements.boardLaserCanvas) {
            resizeCanvasElement(elements.boardLaserCanvas, width, height, dpr);
        }
    }

    function resizeCanvasElement(canvas, width, height, dpr) {
        if (!canvas) {
            return;
        }
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = width + "px";
        canvas.style.height = height + "px";
    }

    function getCanvasMetrics(elements) {
        if (!elements || !elements.boardCanvas) {
            return null;
        }
        var rect = elements.boardCanvas.getBoundingClientRect();
        var width = Math.max(1, rect.width || parseFloat(elements.boardCanvas.style.width) || 1);
        var height = Math.max(1, rect.height || parseFloat(elements.boardCanvas.style.height) || 1);
        var dpr = width > 0 ? (elements.boardCanvas.width / width) : 1;
        return {
            rect: rect,
            width: width,
            height: height,
            dpr: Math.max(1, dpr || 1)
        };
    }

    function requestRender(appState, elements, conversationId) {
        var session = ensureBoardSession(appState, elements, conversationId);
        if (!session || session.renderQueued || !appState.boardModalOpen) {
            return;
        }
        session.renderQueued = true;
        window.requestAnimationFrame(function () {
            session.renderQueued = false;
            renderBoard(appState, elements, session);
            renderLaserOverlay(appState, elements, session, getCanvasMetrics(elements));
            if (appState.boardModalOpen && isRemoteScreenBackgroundActive(appState, elements)) {
                requestRender(appState, elements, session.conversationId);
            }
        });
    }

    function renderBoard(appState, elements, session) {
        if (!appState.boardModalOpen || !session || !elements.boardCanvas) {
            return;
        }
        var metrics = getCanvasMetrics(elements);
        if (!metrics) {
            return;
        }
        var canvas = elements.boardCanvas;
        var ctx = canvas.getContext("2d");
        if (!ctx) {
            return;
        }
        ctx.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0);
        ctx.clearRect(0, 0, metrics.width, metrics.height);
        drawBoardBackground(ctx, appState, elements, session, metrics);

        var ordered = getOrderedParticipants(appState, session);
        var tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        var tempCtx = tempCanvas.getContext("2d");
        for (var i = 0; i < ordered.length; i += 1) {
            var participant = ordered[i];
            var layerPrefs = getLayerPrefs(appState, session.conversationId, participant.id);
            if (layerPrefs.hidden) {
                continue;
            }
            renderParticipantLayer(tempCtx, participant, session.liveStroke, layerPrefs, session.viewport, metrics);
            ctx.save();
            ctx.globalAlpha = layerPrefs.opacity;
            ctx.drawImage(tempCanvas, 0, 0, metrics.width, metrics.height);
            ctx.restore();
        }
    }

    function requestLaserRender(appState, elements, conversationId) {
        var session = ensureBoardSession(appState, elements, conversationId);
        if (!session || session.laserRenderQueued || !appState.boardModalOpen) {
            return;
        }
        session.laserRenderQueued = true;
        window.requestAnimationFrame(function () {
            session.laserRenderQueued = false;
            renderLaserOverlay(appState, elements, session, getCanvasMetrics(elements));
            scheduleLaserAutoClear(appState, elements, session);
        });
    }

    function renderLaserOverlay(appState, elements, session, metrics) {
        if (!appState.boardModalOpen || !session || !elements || !elements.boardLaserCanvas || !metrics) {
            return;
        }
        var ctx = elements.boardLaserCanvas.getContext("2d");
        if (!ctx) {
            return;
        }
        ctx.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0);
        ctx.clearRect(0, 0, metrics.width, metrics.height);

        var now = Date.now();
        var ordered = getOrderedParticipants(appState, session);
        for (var i = 0; i < ordered.length; i += 1) {
            var participant = ordered[i];
            var laser = participant && participant.laser ? participant.laser : null;
            if (!laser || !laser.point || typeof laser.point !== "object") {
                continue;
            }
            var updatedAt = Number(laser.updatedAt) || 0;
            var age = now - updatedAt;
            if (age > LASER_TTL_MS) {
                continue;
            }
            var alpha = Math.max(0, 1 - (age / LASER_TTL_MS));
            if (alpha <= 0) {
                continue;
            }

            var screen = worldToScreen(session.viewport, laser.point, metrics);
            var radius = 6;
            ctx.save();
            ctx.globalAlpha = 0.95 * alpha;
            ctx.fillStyle = "rgba(239, 68, 68, 1)";
            ctx.shadowColor = "rgba(239, 68, 68, 1)";
            ctx.shadowBlur = 12 * alpha;
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    function scheduleLaserAutoClear(appState, elements, session) {
        if (!session) {
            return;
        }
        if (session.laserAutoClearTimer) {
            window.clearTimeout(session.laserAutoClearTimer);
            session.laserAutoClearTimer = null;
        }
        var delay = getNextLaserExpiryDelayMs(session);
        if (!delay) {
            return;
        }
        session.laserAutoClearTimer = window.setTimeout(function () {
            session.laserAutoClearTimer = null;
            requestLaserRender(appState, elements, session.conversationId);
        }, Math.max(30, delay + 30));
    }

    function getNextLaserExpiryDelayMs(session) {
        if (!session || !session.participants) {
            return 0;
        }
        var now = Date.now();
        var ids = Object.keys(session.participants);
        var min = Infinity;
        for (var i = 0; i < ids.length; i += 1) {
            var participant = session.participants[ids[i]];
            var laser = participant && participant.laser ? participant.laser : null;
            if (!laser) {
                continue;
            }
            var updatedAt = Number(laser.updatedAt) || 0;
            if (!updatedAt) {
                continue;
            }
            var remaining = (updatedAt + LASER_TTL_MS) - now;
            if (remaining > 0) {
                min = Math.min(min, remaining);
            }
        }
        return Number.isFinite(min) ? min : 0;
    }

    function drawBoardBackground(ctx, appState, elements, session, metrics) {
        ctx.save();
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(0, 0, metrics.width, metrics.height);
        ctx.restore();
        drawRemoteScreenBackground(ctx, appState, elements, session.viewport, metrics);
        drawGrid(ctx, session.viewport, metrics);
    }

    function drawRemoteScreenBackground(ctx, appState, elements, viewport, metrics) {
        if (!isRemoteScreenBackgroundActive(appState, elements)) {
            return;
        }
        var video = elements.remoteVideo;
        var videoWidth = Math.max(320, Number(video.videoWidth || 0) || 1280);
        var videoHeight = Math.max(180, Number(video.videoHeight || 0) || 720);
        var screenCenter = worldToScreen(viewport, { x: 0, y: 0 }, metrics);
        var drawWidth = videoWidth * viewport.zoom;
        var drawHeight = videoHeight * viewport.zoom;
        ctx.save();
        ctx.drawImage(
            video,
            screenCenter.x - drawWidth / 2,
            screenCenter.y - drawHeight / 2,
            drawWidth,
            drawHeight
        );
        ctx.restore();
    }

    function drawGrid(ctx, viewport, metrics) {
        var base = viewport.zoom >= 4 ? 40 : (viewport.zoom >= 1 ? 80 : 160);
        var spacing = base * viewport.zoom;
        if (spacing < 18) {
            return;
        }
        var offsetX = ((-viewport.centerX * viewport.zoom) % spacing + spacing) % spacing;
        var offsetY = ((-viewport.centerY * viewport.zoom) % spacing + spacing) % spacing;
        ctx.save();
        ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
        ctx.lineWidth = 1;
        for (var x = offsetX; x <= metrics.width; x += spacing) {
            ctx.beginPath();
            ctx.moveTo(Math.round(x) + 0.5, 0);
            ctx.lineTo(Math.round(x) + 0.5, metrics.height);
            ctx.stroke();
        }
        for (var y = offsetY; y <= metrics.height; y += spacing) {
            ctx.beginPath();
            ctx.moveTo(0, Math.round(y) + 0.5);
            ctx.lineTo(metrics.width, Math.round(y) + 0.5);
            ctx.stroke();
        }
        ctx.restore();
    }

    function renderParticipantLayer(tempCtx, participant, liveStroke, layerPrefs, viewport, metrics) {
        if (!tempCtx) {
            return;
        }
        tempCtx.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0);
        tempCtx.clearRect(0, 0, metrics.width, metrics.height);
        var strokes = participant && participant.strokes ? participant.strokes : [];
        for (var i = 0; i < strokes.length; i += 1) {
            drawStroke(tempCtx, strokes[i], viewport, metrics);
        }
        if (liveStroke && participant && liveStroke.participantId === participant.id) {
            drawStroke(tempCtx, liveStroke, viewport, metrics);
        }
    }

    function drawStroke(ctx, stroke, viewport, metrics) {
        if (!stroke || stroke.hidden || !stroke.points || stroke.points.length === 0) {
            return;
        }
        var points = stroke.points;
        var lineWidth = Math.max(0.5, Number(stroke.size || 0) * viewport.zoom);
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = lineWidth;
        ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
        ctx.strokeStyle = stroke.color || DEFAULT_BRUSH_COLOR;
        ctx.beginPath();
        var first = worldToScreen(viewport, points[0], metrics);
        ctx.moveTo(first.x, first.y);
        for (var i = 1; i < points.length; i += 1) {
            var next = worldToScreen(viewport, points[i], metrics);
            ctx.lineTo(next.x, next.y);
        }
        if (points.length === 1) {
            ctx.lineTo(first.x + 0.01, first.y + 0.01);
        }
        ctx.stroke();
        ctx.restore();
    }

    function getOrderedParticipants(appState, session) {
        var ids = Object.keys(session.participants || {});
        return ids.map(function (participantId) {
            return session.participants[participantId];
        }).sort(function (a, b) {
            var aPrefs = getLayerPrefs(appState, session.conversationId, a.id);
            var bPrefs = getLayerPrefs(appState, session.conversationId, b.id);
            if (aPrefs.order !== bPrefs.order) {
                return aPrefs.order - bPrefs.order;
            }
            if (a.id === getLocalParticipantId(appState)) {
                return -1;
            }
            if (b.id === getLocalParticipantId(appState)) {
                return 1;
            }
            return String(a.name || a.id).localeCompare(String(b.name || b.id), "zh-CN");
        });
    }

    function getLayerPrefs(appState, conversationId, participantId) {
        var prefs = ensureBoardConversationPrefs(appState, conversationId);
        return prefs.layers && prefs.layers[participantId]
            ? prefs.layers[participantId]
            : {
                hidden: false,
                opacity: 1,
                order: 0
            };
    }

    function syncFollowList(appState, elements, session) {
        if (!elements || !elements.boardFollowList) {
            return;
        }
        elements.boardFollowList.innerHTML = "";
        var ordered = getOrderedParticipants(appState, session);
        if (!ordered.length) {
            var empty = document.createElement("div");
            empty.className = "board-layer-empty";
            empty.textContent = "当前没有可跟随的视角。";
            elements.boardFollowList.appendChild(empty);
            return;
        }

        var selfId = getLocalParticipantId(appState);
        var selfSelected = session.viewMode !== "follow" || !session.followParticipantId || session.followParticipantId === selfId;
        elements.boardFollowList.appendChild(createFollowRow(appState, elements, session, selfId, "我", "自己操作，不跟随别人", selfSelected));

        for (var i = 0; i < ordered.length; i += 1) {
            var participant = ordered[i];
            if (!participant || participant.id === selfId) {
                continue;
            }
            var selected = session.viewMode === "follow" && session.followParticipantId === participant.id;
            elements.boardFollowList.appendChild(
                createFollowRow(
                    appState,
                    elements,
                    session,
                    participant.id,
                    participant.name || participant.id,
                    participant.lastViewport ? "自动跟随对方当前视角" : "等待对方发送视角",
                    selected
                )
            );
        }
    }

    function createFollowRow(appState, elements, session, participantId, title, subtitle, selected) {
        var row = document.createElement("label");
        row.className = "board-follow-row" + (selected ? " active" : "");
        var input = document.createElement("input");
        input.type = "radio";
        input.name = "board-follow-target";
        input.value = participantId === getLocalParticipantId(appState) ? SELF_FOLLOW_VALUE : participantId;
        input.checked = Boolean(selected);
        input.addEventListener("change", function () {
            if (participantId === getLocalParticipantId(appState)) {
                setViewMode(appState, elements, null, "free", session.conversationId);
                return;
            }
            setFollowTarget(appState, elements, null, participantId, session.conversationId);
        });
        var copy = document.createElement("span");
        copy.className = "board-follow-copy";
        var strong = document.createElement("strong");
        strong.textContent = title;
        var small = document.createElement("small");
        small.textContent = subtitle;
        copy.appendChild(strong);
        copy.appendChild(small);
        row.appendChild(input);
        row.appendChild(copy);
        return row;
    }

    function syncLayerList(appState, elements, session) {
        if (!elements || !elements.boardLayerList) {
            return;
        }
        elements.boardLayerList.innerHTML = "";
        var ordered = getOrderedParticipants(appState, session);
        if (!ordered.length) {
            var empty = document.createElement("div");
            empty.className = "board-layer-empty";
            empty.textContent = "当前没有可展示的涂层。";
            elements.boardLayerList.appendChild(empty);
            return;
        }
        var allowDrag = canUseDesktopLayerDrag();
        for (var i = 0; i < ordered.length; i += 1) {
            elements.boardLayerList.appendChild(createLayerRow(appState, elements, session, ordered[i], allowDrag));
        }
    }

    function createLayerRow(appState, elements, session, participant, allowDrag) {
        var layerPrefs = getLayerPrefs(appState, session.conversationId, participant.id);
        var row = document.createElement("div");
        row.className = "board-layer-row";
        row.dataset.participantId = participant.id;
        row.draggable = allowDrag;
        if (allowDrag) {
            row.addEventListener("dragstart", handleLayerDragStart.bind(null, appState));
            row.addEventListener("dragover", handleLayerDragOver);
            row.addEventListener("dragleave", handleLayerDragLeave);
            row.addEventListener("drop", handleLayerDrop.bind(null, appState, elements, session));
            row.addEventListener("dragend", handleLayerDragEnd);
        }
        row.addEventListener("pointerdown", handleTouchLayerPointerDown.bind(null, appState, elements, session));
        row.addEventListener("pointermove", handleTouchLayerPointerMove.bind(null, appState, elements, session));
        row.addEventListener("pointerup", handleTouchLayerPointerUp.bind(null, appState, elements, session));
        row.addEventListener("pointercancel", handleTouchLayerPointerUp.bind(null, appState, elements, session));

        var title = document.createElement("div");
        title.className = "board-layer-title";
        var label = document.createElement("span");
        label.textContent = getParticipantDisplayName(session, participant.id);
        title.appendChild(label);
        var handle = document.createElement("span");
        handle.className = "board-layer-handle";
        handle.textContent = allowDrag ? "拖动排序" : "长按拖动排序";
        title.appendChild(handle);
        row.appendChild(title);

        var inline = document.createElement("div");
        inline.className = "board-layer-inline";

        var visibleLabel = document.createElement("label");
        visibleLabel.className = "board-field";
        var visibleCheckbox = document.createElement("input");
        visibleCheckbox.type = "checkbox";
        visibleCheckbox.checked = !layerPrefs.hidden;
        visibleCheckbox.addEventListener("change", function () {
            setBoardLayerPrefs(appState, session.conversationId, participant.id, { hidden: !visibleCheckbox.checked });
            requestRender(appState, elements, session.conversationId);
            syncLayerList(appState, elements, session);
        });
        var visibleText = document.createElement("span");
        visibleText.textContent = "显示";
        visibleLabel.appendChild(visibleCheckbox);
        visibleLabel.appendChild(visibleText);
        inline.appendChild(visibleLabel);

        var opacityWrap = document.createElement("label");
        opacityWrap.className = "board-layer-opacity";
        var opacityText = document.createElement("span");
        opacityText.textContent = "透明度";
        var opacityRange = document.createElement("input");
        opacityRange.type = "range";
        opacityRange.min = "0.1";
        opacityRange.max = "1";
        opacityRange.step = "0.05";
        opacityRange.value = String(layerPrefs.opacity);
        opacityRange.addEventListener("input", function () {
            setBoardLayerPrefs(appState, session.conversationId, participant.id, { opacity: opacityRange.value });
            requestRender(appState, elements, session.conversationId);
        });
        opacityWrap.appendChild(opacityText);
        opacityWrap.appendChild(opacityRange);
        inline.appendChild(opacityWrap);

        row.appendChild(inline);
        return row;
    }

    function handleLayerDragStart(appState, event) {
        var target = event.currentTarget;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        ensureBoardRoot(appState);
        appState.boardUi.dragParticipantId = String(target.dataset.participantId || "").trim();
        target.classList.add("dragging");
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", appState.boardUi.dragParticipantId);
        }
    }

    function handleLayerDragOver(event) {
        event.preventDefault();
        var target = event.currentTarget;
        if (target instanceof HTMLElement) {
            target.classList.add("drag-over");
        }
    }

    function handleLayerDragLeave(event) {
        var target = event.currentTarget;
        if (target instanceof HTMLElement) {
            target.classList.remove("drag-over");
        }
    }

    function handleLayerDrop(appState, elements, session, event) {
        event.preventDefault();
        var target = event.currentTarget;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        target.classList.remove("drag-over");
        var targetParticipantId = String(target.dataset.participantId || "").trim();
        var sourceParticipantId = String(appState.boardUi.dragParticipantId || "").trim();
        if (!sourceParticipantId || !targetParticipantId || sourceParticipantId === targetParticipantId) {
            return;
        }
        reorderLayerPrefs(appState, session, sourceParticipantId, targetParticipantId);
        syncLayerList(appState, elements, session);
        requestRender(appState, elements, session.conversationId);
    }

    function handleLayerDragEnd(event) {
        var target = event.currentTarget;
        if (target instanceof HTMLElement) {
            target.classList.remove("dragging");
            target.classList.remove("drag-over");
        }
    }

    function handleTouchLayerPointerDown(appState, elements, session, event) {
        if (event.pointerType !== "touch") {
            return;
        }
        var row = event.currentTarget;
        var target = event.target;
        if (!(row instanceof HTMLElement) || !(target instanceof HTMLElement)) {
            return;
        }
        if (target.closest("input, button")) {
            return;
        }
        clearTouchLayerDrag(appState);
        appState.boardUi.touchDragPending = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY
        };
        appState.boardUi.touchDragTimer = window.setTimeout(function () {
            startTouchLayerDrag(appState, row, event.pointerId, event.clientX, event.clientY);
        }, 380);
    }

    function handleTouchLayerPointerMove(appState, elements, session, event) {
        if (event.pointerType !== "touch") {
            return;
        }
        var touchDragState = appState.boardUi && appState.boardUi.touchDragState ? appState.boardUi.touchDragState : null;
        if (!touchDragState) {
            if (appState.boardUi && appState.boardUi.touchDragTimer && appState.boardUi.touchDragPending && appState.boardUi.touchDragPending.pointerId === event.pointerId) {
                var moved = distanceBetweenScreenPoints(
                    { x: appState.boardUi.touchDragPending.startX, y: appState.boardUi.touchDragPending.startY },
                    { x: event.clientX, y: event.clientY }
                );
                if (moved > 10) {
                    clearTouchLayerDrag(appState);
                }
            }
            return;
        }
        if (touchDragState.pointerId !== event.pointerId) {
            return;
        }
        event.preventDefault();
        touchDragState.lastX = event.clientX;
        touchDragState.lastY = event.clientY;
        if (touchDragState.row) {
            touchDragState.row.style.transform = "translateY(" + (event.clientY - touchDragState.startY) + "px)";
        }
        updateTouchDragTarget(elements, touchDragState, event.clientX, event.clientY);
    }

    function handleTouchLayerPointerUp(appState, elements, session, event) {
        if (event.pointerType !== "touch") {
            return;
        }
        if (appState.boardUi && appState.boardUi.touchDragTimer) {
            window.clearTimeout(appState.boardUi.touchDragTimer);
            appState.boardUi.touchDragTimer = null;
        }
        var touchDragState = appState.boardUi && appState.boardUi.touchDragState ? appState.boardUi.touchDragState : null;
        if (!touchDragState || touchDragState.pointerId !== event.pointerId) {
            return;
        }
        var sourceParticipantId = String(touchDragState.participantId || "").trim();
        var targetParticipantId = String(touchDragState.targetParticipantId || "").trim();
        clearTouchLayerDrag(appState);
        if (!sourceParticipantId || !targetParticipantId || sourceParticipantId === targetParticipantId) {
            syncLayerList(appState, elements, session);
            return;
        }
        reorderLayerPrefs(appState, session, sourceParticipantId, targetParticipantId);
        syncLayerList(appState, elements, session);
        requestRender(appState, elements, session.conversationId);
    }

    function startTouchLayerDrag(appState, row, pointerId, startX, startY) {
        if (!(row instanceof HTMLElement)) {
            return;
        }
        clearTouchLayerDrag(appState);
        appState.boardUi.touchDragState = {
            participantId: String(row.dataset.participantId || "").trim(),
            pointerId: pointerId,
            row: row,
            startX: startX,
            startY: startY,
            lastX: startX,
            lastY: startY,
            targetParticipantId: String(row.dataset.participantId || "").trim(),
            targetRow: row
        };
        appState.boardUi.touchDragPending = null;
        row.classList.add("dragging");
        row.classList.add("touch-dragging");
        row.style.pointerEvents = "none";
    }

    function updateTouchDragTarget(elements, touchDragState, clientX, clientY) {
        if (!touchDragState) {
            return;
        }
        if (touchDragState.targetRow) {
            touchDragState.targetRow.classList.remove("drag-over");
        }
        var element = document.elementFromPoint(clientX, clientY);
        var row = element && element.closest ? element.closest(".board-layer-row") : null;
        if (!(row instanceof HTMLElement)) {
            touchDragState.targetParticipantId = touchDragState.participantId;
            touchDragState.targetRow = null;
            return;
        }
        row.classList.add("drag-over");
        touchDragState.targetRow = row;
        touchDragState.targetParticipantId = String(row.dataset.participantId || touchDragState.participantId || "").trim();
    }

    function clearTouchLayerDrag(appState) {
        if (!appState.boardUi) {
            return;
        }
        if (appState.boardUi.touchDragTimer) {
            window.clearTimeout(appState.boardUi.touchDragTimer);
            appState.boardUi.touchDragTimer = null;
        }
        appState.boardUi.touchDragPending = null;
        var touchDragState = appState.boardUi.touchDragState;
        if (touchDragState && touchDragState.row) {
            touchDragState.row.classList.remove("dragging");
            touchDragState.row.classList.remove("touch-dragging");
            touchDragState.row.style.transform = "";
            touchDragState.row.style.pointerEvents = "";
        }
        if (touchDragState && touchDragState.targetRow) {
            touchDragState.targetRow.classList.remove("drag-over");
        }
        appState.boardUi.touchDragState = null;
    }

    function reorderLayerPrefs(appState, session, sourceParticipantId, targetParticipantId) {
        var conversationId = session && session.conversationId ? session.conversationId : "";
        var prefs = ensureBoardConversationPrefs(appState, conversationId);
        var layers = prefs.layers || {};
        var ids = Object.keys((session && session.participants) || {});
        for (var i = 0; i < Object.keys(layers).length; i += 1) {
            var layerId = Object.keys(layers)[i];
            if (ids.indexOf(layerId) === -1) {
                ids.push(layerId);
            }
        }
        if (ids.indexOf(sourceParticipantId) === -1) {
            ids.push(sourceParticipantId);
        }
        if (ids.indexOf(targetParticipantId) === -1) {
            ids.push(targetParticipantId);
        }
        ids.sort(function (a, b) {
            return getLayerPrefs(appState, conversationId, a).order - getLayerPrefs(appState, conversationId, b).order;
        });
        var sourceIndex = ids.indexOf(sourceParticipantId);
        var targetIndex = ids.indexOf(targetParticipantId);
        if (sourceIndex === -1 || targetIndex === -1) {
            return;
        }
        ids.splice(sourceIndex, 1);
        ids.splice(targetIndex, 0, sourceParticipantId);
        for (var index = 0; index < ids.length; index += 1) {
            setBoardLayerPrefs(appState, conversationId, ids[index], { order: index });
        }
    }

    function toggleLayerPopover(appState, elements, forceOpen) {
        ensureBoardRoot(appState);
        if (typeof forceOpen === "boolean") {
            appState.boardUi.layerPopoverOpen = forceOpen;
        } else {
            appState.boardUi.layerPopoverOpen = !appState.boardUi.layerPopoverOpen;
        }
        if (appState.boardUi.controlsCollapsed) {
            appState.boardUi.layerPopoverOpen = false;
        }
        var session = ensureBoardSession(appState, elements);
        if (session) {
            syncFollowList(appState, elements, session);
            syncLayerList(appState, elements, session);
        }
        syncControlsState(appState, elements);
    }

    function handleDocumentClick(appState, elements, event) {
        if (!appState.boardModalOpen || !appState.boardUi || !appState.boardUi.layerPopoverOpen) {
            return;
        }
        var target = event && event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        if (target.closest && target.closest("#board-controls")) {
            return;
        }
        toggleLayerPopover(appState, elements, false);
    }

    function setTool(appState, elements, tool, conversationId) {
        var session = ensureBoardSession(appState, elements, conversationId);
        if (!session) {
            return;
        }
        var nextTool = tool === "eraser" || tool === "pan" || tool === "laser" ? tool : "brush";
        session.tool = nextTool;
        updateToolButtons(elements, nextTool);
        updateBoardStatus(appState, elements, session);
    }

    function setBrushColor(appState, elements, color, conversationId) {
        var session = ensureBoardSession(appState, elements, conversationId);
        if (!session) {
            return;
        }
        session.brushColor = String(color || "").trim() || DEFAULT_BRUSH_COLOR;
    }

    function setBrushSize(appState, elements, size, conversationId) {
        var session = ensureBoardSession(appState, elements, conversationId);
        if (!session) {
            return;
        }
        var numeric = Number(size);
        session.brushSize = Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_BRUSH_SIZE;
    }

    function setViewMode(appState, elements, peerManager, mode, conversationId) {
        var session = ensureBoardSession(appState, elements, conversationId);
        if (!session) {
            return;
        }
        session.viewMode = mode === "follow" ? "follow" : "free";
        if (session.viewMode !== "follow") {
            session.followParticipantId = "";
        }
        persistViewPrefs(appState, session);
        if (elements) {
            updateBoardStatus(appState, elements, session);
            syncFollowList(appState, elements, session);
        }
    }

    function setFollowTarget(appState, elements, peerManager, participantId, conversationId) {
        var session = ensureBoardSession(appState, elements, conversationId);
        if (!session) {
            return;
        }
        var normalized = String(participantId || "").trim();
        if (!normalized || normalized === getLocalParticipantId(appState)) {
            setViewMode(appState, elements, peerManager, "free", session.conversationId);
            return;
        }
        session.viewMode = "follow";
        session.followParticipantId = normalized;
        var participant = ensureParticipant(session, normalized, "");
        if (participant && participant.lastViewport) {
            session.viewport = cloneViewport(participant.lastViewport);
        }
        persistViewPrefs(appState, session);
        if (elements) {
            updateBoardStatus(appState, elements, session);
            syncFollowList(appState, elements, session);
            requestRender(appState, elements, session.conversationId);
        }
    }

    function persistViewPrefs(appState, session) {
        setBoardConversationPrefs(appState, session.conversationId, {
            viewMode: session.viewMode,
            followParticipantId: session.viewMode === "follow" ? session.followParticipantId : ""
        });
    }

    function clearVisible(appState, elements, peerManager, conversationId) {
        var session = ensureBoardSession(appState, elements, conversationId);
        if (!session) {
            return;
        }
        var bounds = getViewportWorldBounds(session, elements);
        if (!bounds) {
            return;
        }
        applyClearVisible(session, bounds);
        updateHistoryButtons(appState, elements, session);
        requestRender(appState, elements, session.conversationId);
        var peerId = getConversationPeerId(appState, session.conversationId);
        if (peerId && peerManager && typeof peerManager.sendStructured === "function") {
            peerManager.sendStructured(peerId, "board-clear", {
                pid: getLocalParticipantId(appState),
                name: getLocalParticipantName(appState, elements),
                bounds: bounds
            });
        }
    }

    function resetBoard(appState, elements, peerManager, conversationId) {
        var session = ensureBoardSession(appState, elements, conversationId);
        if (!session) {
            return;
        }
        applyResetSession(appState, session);
        syncBoardUI(appState, elements, session);
        requestRender(appState, elements, session.conversationId);
        var peerId = getConversationPeerId(appState, session.conversationId);
        if (peerId && peerManager && typeof peerManager.sendStructured === "function") {
            peerManager.sendStructured(peerId, "board-reset", {
                pid: getLocalParticipantId(appState),
                name: getLocalParticipantName(appState, elements)
            });
        }
    }

    function applyClearVisible(session, bounds) {
        var participantIds = Object.keys(session.participants || {});
        for (var i = 0; i < participantIds.length; i += 1) {
            var participant = session.participants[participantIds[i]];
            var affectedIds = [];
            for (var j = 0; j < participant.strokes.length; j += 1) {
                var stroke = participant.strokes[j];
                if (!stroke.hidden && strokeIntersectsBounds(stroke, bounds)) {
                    stroke.hidden = true;
                    affectedIds.push(stroke.id);
                }
            }
            if (affectedIds.length) {
                participant.historyDone = participant.historyDone.filter(function (strokeId) {
                    return affectedIds.indexOf(strokeId) === -1;
                });
                participant.historyUndone = participant.historyUndone.filter(function (strokeId) {
                    return affectedIds.indexOf(strokeId) === -1;
                });
            }
        }
    }

    function applyResetSession(appState, session) {
        var participantIds = Object.keys(session.participants || {});
        for (var i = 0; i < participantIds.length; i += 1) {
            var participant = session.participants[participantIds[i]];
            participant.strokes = [];
            participant.strokeMap = {};
            participant.historyDone = [];
            participant.historyUndone = [];
            participant.lastViewport = null;
        }
        session.liveStroke = null;
        session.viewport = createDefaultViewport();
        session.viewMode = "free";
        session.followParticipantId = "";
        setBoardConversationPrefs(appState, session.conversationId, {
            viewMode: "free",
            followParticipantId: "",
            layers: {}
        });
    }

    function undo(appState, elements, peerManager, conversationId) {
        var session = ensureBoardSession(appState, elements, conversationId);
        if (!session) {
            return;
        }
        var participant = getLocalParticipant(appState, elements, session);
        var stroke = getLastVisibleHistoryStroke(participant);
        if (!stroke) {
            return;
        }
        stroke.hidden = true;
        participant.historyDone = participant.historyDone.filter(function (strokeId) {
            return strokeId !== stroke.id;
        });
        participant.historyUndone.push(stroke.id);
        updateHistoryButtons(appState, elements, session);
        requestRender(appState, elements, session.conversationId);
        sendStrokeVisibility(appState, elements, peerManager, session.conversationId, stroke.id, true);
    }

    function redo(appState, elements, peerManager, conversationId) {
        var session = ensureBoardSession(appState, elements, conversationId);
        if (!session) {
            return;
        }
        var participant = getLocalParticipant(appState, elements, session);
        var stroke = getLastHiddenRedoStroke(participant);
        if (!stroke) {
            return;
        }
        stroke.hidden = false;
        participant.historyUndone = participant.historyUndone.filter(function (strokeId) {
            return strokeId !== stroke.id;
        });
        participant.historyDone.push(stroke.id);
        updateHistoryButtons(appState, elements, session);
        requestRender(appState, elements, session.conversationId);
        sendStrokeVisibility(appState, elements, peerManager, session.conversationId, stroke.id, false);
    }

    function getLastVisibleHistoryStroke(participant) {
        if (!participant || !participant.historyDone) {
            return null;
        }
        for (var i = participant.historyDone.length - 1; i >= 0; i -= 1) {
            var stroke = participant.strokeMap[participant.historyDone[i]];
            if (stroke && !stroke.hidden) {
                return stroke;
            }
        }
        return null;
    }

    function getLastHiddenRedoStroke(participant) {
        if (!participant || !participant.historyUndone) {
            return null;
        }
        for (var i = participant.historyUndone.length - 1; i >= 0; i -= 1) {
            var stroke = participant.strokeMap[participant.historyUndone[i]];
            if (stroke && stroke.hidden) {
                return stroke;
            }
        }
        return null;
    }

    function sendStrokeVisibility(appState, elements, peerManager, conversationId, strokeId, hidden) {
        var peerId = getConversationPeerId(appState, conversationId);
        if (!peerId || !peerManager || typeof peerManager.sendStructured !== "function") {
            return;
        }
        peerManager.sendStructured(peerId, "board-stroke-visibility", {
            pid: getLocalParticipantId(appState),
            name: getLocalParticipantName(appState, elements),
            strokeId: strokeId,
            hidden: Boolean(hidden)
        });
    }

    function updateLocalLaser(appState, elements, peerManager, session, point, active, forceSend) {
        if (!session) {
            return;
        }
        var participant = getLocalParticipant(appState, elements, session);
        var now = Date.now();

        if (!active) {
            if (participant) {
                participant.laser = null;
            }
        } else if (participant && point) {
            participant.laser = { point: point, active: true, updatedAt: now };
        }

        requestLaserRender(appState, elements, session.conversationId);

        if (!peerManager || typeof peerManager.sendStructured !== "function") {
            return;
        }
        var shouldSend = Boolean(forceSend);
        if (!shouldSend) {
            var lastSentAt = Number(session.laserSendAt) || 0;
            shouldSend = (now - lastSentAt) >= LASER_SEND_INTERVAL_MS;
        }
        if (shouldSend) {
            session.laserSendAt = now;
            sendLaserPoint(session.conversationId, appState, elements, peerManager, point, active);
        }
    }

    function handlePointerDown(event, appState, elements, peerManager) {
        if (!appState.boardModalOpen) {
            return;
        }
        if (event && event.cancelable) {
            event.preventDefault();
        }
        var session = ensureBoardSession(appState, elements);
        var metrics = getCanvasMetrics(elements);
        if (!session || !metrics) {
            return;
        }
        var pointerState = appState.boardPointerState || createPointerState();
        appState.boardPointerState = pointerState;
        updatePointerRecord(pointerState, event, session, metrics);

        if (elements.boardCanvas && typeof elements.boardCanvas.setPointerCapture === "function") {
            try {
                elements.boardCanvas.setPointerCapture(event.pointerId);
            } catch (_error) {}
        }

        if (Object.keys(pointerState.pointers).length >= 2) {
            var localParticipant = getLocalParticipant(appState, elements, session);
            if (localParticipant && localParticipant.laser && localParticipant.laser.active) {
                updateLocalLaser(appState, elements, peerManager, session, localParticipant.laser.point, false, true);
            }
            if (session.liveStroke) {
                finalizeLiveStroke(appState, elements, peerManager, session, false);
            }
            startPinchGesture(pointerState, session, metrics);
            return;
        }

        if (shouldUsePanGesture(event, session)) {
            if (session.viewMode === "follow") {
                setViewMode(appState, elements, peerManager, "free", session.conversationId);
            }
            pointerState.gestureMode = "pan";
            pointerState.panPointerId = event.pointerId;
            pointerState.lastScreenPoint = {
                x: event.clientX,
                y: event.clientY
            };
            return;
        }

        if (session.tool === "laser") {
            pointerState.gestureMode = "laser";
            pointerState.drawPointerId = event.pointerId;
            updateLocalLaser(
                appState,
                elements,
                peerManager,
                session,
                screenToWorld(metrics, session.viewport, event.clientX, event.clientY),
                true,
                true
            );
            return;
        }

        pointerState.gestureMode = "draw";
        pointerState.drawPointerId = event.pointerId;
        startLiveStroke(appState, elements, session, event, metrics);
        requestRender(appState, elements, session.conversationId);
    }

    function handlePointerMove(event, appState, elements, peerManager) {
        if (!appState.boardModalOpen) {
            return;
        }
        var session = ensureBoardSession(appState, elements);
        var metrics = getCanvasMetrics(elements);
        if (!session || !metrics) {
            return;
        }
        var pointerState = appState.boardPointerState || createPointerState();
        appState.boardPointerState = pointerState;
        updatePointerRecord(pointerState, event, session, metrics);

        if (pointerState.gestureMode === "pinch" && Object.keys(pointerState.pointers).length >= 2) {
            event.preventDefault();
            updatePinchGesture(pointerState, session, metrics);
            persistViewportChange(appState, elements, peerManager, session);
            return;
        }

        if (pointerState.gestureMode === "pan" && pointerState.panPointerId === event.pointerId) {
            event.preventDefault();
            if (!pointerState.lastScreenPoint) {
                pointerState.lastScreenPoint = { x: event.clientX, y: event.clientY };
            }
            var dx = event.clientX - pointerState.lastScreenPoint.x;
            var dy = event.clientY - pointerState.lastScreenPoint.y;
            pointerState.lastScreenPoint = { x: event.clientX, y: event.clientY };
            session.viewport.centerX -= dx / session.viewport.zoom;
            session.viewport.centerY -= dy / session.viewport.zoom;
            persistViewportChange(appState, elements, peerManager, session);
            return;
        }

        if (pointerState.gestureMode === "laser" && pointerState.drawPointerId === event.pointerId) {
            event.preventDefault();
            updateLocalLaser(
                appState,
                elements,
                peerManager,
                session,
                screenToWorld(metrics, session.viewport, event.clientX, event.clientY),
                true,
                false
            );
            return;
        }

        if (pointerState.gestureMode === "draw" && pointerState.drawPointerId === event.pointerId && session.liveStroke) {
            event.preventDefault();
            appendPointToLiveStroke(session.liveStroke, screenToWorld(metrics, session.viewport, event.clientX, event.clientY), session.viewport.zoom);
            requestRender(appState, elements, session.conversationId);
        }
    }

    function handlePointerUp(event, appState, elements, peerManager) {
        if (!appState.boardModalOpen) {
            return;
        }
        var session = ensureBoardSession(appState, elements);
        if (!session) {
            return;
        }
        var pointerState = appState.boardPointerState || createPointerState();
        appState.boardPointerState = pointerState;

        if (pointerState.gestureMode === "laser" && pointerState.drawPointerId === event.pointerId) {
            var laserMetrics = getCanvasMetrics(elements);
            var point = laserMetrics ? screenToWorld(laserMetrics, session.viewport, event.clientX, event.clientY) : null;
            updateLocalLaser(appState, elements, peerManager, session, point, false, true);
        }

        if (pointerState.gestureMode === "draw" && pointerState.drawPointerId === event.pointerId && session.liveStroke) {
            var metrics = getCanvasMetrics(elements);
            if (metrics) {
                appendPointToLiveStroke(session.liveStroke, screenToWorld(metrics, session.viewport, event.clientX, event.clientY), session.viewport.zoom);
            }
            finalizeLiveStroke(appState, elements, peerManager, session, true);
        }

        if (pointerState.panPointerId === event.pointerId) {
            pointerState.panPointerId = null;
            pointerState.lastScreenPoint = null;
        }
        if (pointerState.drawPointerId === event.pointerId) {
            pointerState.drawPointerId = null;
        }
        delete pointerState.pointers[event.pointerId];
        if (Object.keys(pointerState.pointers).length < 2 && pointerState.gestureMode === "pinch") {
            pointerState.gestureMode = "";
            pointerState.pinchBaseDistance = 0;
            pointerState.pinchBaseViewport = null;
        } else if (!pointerState.panPointerId && !pointerState.drawPointerId) {
            pointerState.gestureMode = "";
        }

        if (elements.boardCanvas && typeof elements.boardCanvas.releasePointerCapture === "function") {
            try {
                elements.boardCanvas.releasePointerCapture(event.pointerId);
            } catch (_error) {}
        }
    }

    function handleWheel(event, appState, elements, peerManager) {
        if (!appState.boardModalOpen) {
            return;
        }
        event.preventDefault();
        var session = ensureBoardSession(appState, elements);
        var metrics = getCanvasMetrics(elements);
        if (!session || !metrics) {
            return;
        }
        if (session.viewMode === "follow") {
            setViewMode(appState, elements, peerManager, "free", session.conversationId);
        }
        var anchor = screenToWorld(metrics, session.viewport, event.clientX, event.clientY);
        var factor = event.deltaY < 0 ? 1.12 : (1 / 1.12);
        zoomViewportAroundPoint(session.viewport, anchor, factor);
        persistViewportChange(appState, elements, peerManager, session);
    }

    function shouldUsePanGesture(event, session) {
        if (session.tool === "pan") {
            return true;
        }
        if (event.pointerType === "touch") {
            return false;
        }
        return event.button === 2 || Boolean(event.ctrlKey);
    }

    function updatePointerRecord(pointerState, event, session, metrics) {
        pointerState.pointers[event.pointerId] = {
            x: event.clientX,
            y: event.clientY,
            world: screenToWorld(metrics, session.viewport, event.clientX, event.clientY)
        };
    }

    function startPinchGesture(pointerState, session, metrics) {
        var pointers = Object.keys(pointerState.pointers).slice(0, 2).map(function (pointerId) {
            return pointerState.pointers[pointerId];
        });
        if (pointers.length < 2) {
            return;
        }
        pointerState.gestureMode = "pinch";
        pointerState.panPointerId = null;
        pointerState.drawPointerId = null;
        pointerState.lastScreenPoint = null;
        pointerState.pinchBaseDistance = distanceBetweenScreenPoints(pointers[0], pointers[1]);
        pointerState.pinchBaseViewport = cloneViewport(session.viewport);
        pointerState.pinchBaseScreenCenter = {
            x: (pointers[0].x + pointers[1].x) / 2,
            y: (pointers[0].y + pointers[1].y) / 2
        };
        pointerState.pinchBaseCenterWorld = screenToWorld(
            metrics,
            session.viewport,
            pointerState.pinchBaseScreenCenter.x,
            pointerState.pinchBaseScreenCenter.y
        );
    }

    function updatePinchGesture(pointerState, session, metrics) {
        var pointers = Object.keys(pointerState.pointers).slice(0, 2).map(function (pointerId) {
            return pointerState.pointers[pointerId];
        });
        if (pointers.length < 2 || !pointerState.pinchBaseViewport || !pointerState.pinchBaseCenterWorld) {
            return;
        }
        var currentCenter = {
            x: (pointers[0].x + pointers[1].x) / 2,
            y: (pointers[0].y + pointers[1].y) / 2
        };
        var currentDistance = Math.max(1, distanceBetweenScreenPoints(pointers[0], pointers[1]));
        var scale = currentDistance / Math.max(1, pointerState.pinchBaseDistance);
        var newZoom = clampZoom(pointerState.pinchBaseViewport.zoom * scale);
        session.viewport.zoom = newZoom;
        session.viewport.centerX = pointerState.pinchBaseCenterWorld.x - ((currentCenter.x - metrics.width / 2) / newZoom);
        session.viewport.centerY = pointerState.pinchBaseCenterWorld.y - ((currentCenter.y - metrics.height / 2) / newZoom);
    }

    function startLiveStroke(appState, elements, session, event, metrics) {
        var participantId = getLocalParticipantId(appState);
        ensureParticipant(session, participantId, getLocalParticipantName(appState, elements));
        session.liveStroke = {
            id: createStrokeId(),
            participantId: participantId,
            tool: session.tool === "eraser" ? "eraser" : "brush",
            color: session.brushColor || DEFAULT_BRUSH_COLOR,
            size: Math.max(0.5, Number(session.brushSize || DEFAULT_BRUSH_SIZE) / session.viewport.zoom),
            points: [screenToWorld(metrics, session.viewport, event.clientX, event.clientY)],
            hidden: false,
            createdAt: Date.now()
        };
    }

    function appendPointToLiveStroke(stroke, point, zoom) {
        if (!stroke || !point) {
            return;
        }
        var points = stroke.points || [];
        if (!points.length) {
            points.push(point);
            return;
        }
        var last = points[points.length - 1];
        var dx = (point.x - last.x) * zoom;
        var dy = (point.y - last.y) * zoom;
        if (Math.sqrt(dx * dx + dy * dy) < MIN_POINT_DISTANCE_PX) {
            return;
        }
        points.push(point);
    }

    function finalizeLiveStroke(appState, elements, peerManager, session, sendRemote) {
        var stroke = session.liveStroke;
        session.liveStroke = null;
        if (!stroke) {
            requestRender(appState, elements, session.conversationId);
            return;
        }
        if (!stroke.points || !stroke.points.length) {
            requestRender(appState, elements, session.conversationId);
            return;
        }
        if (stroke.points.length === 1) {
            stroke.points.push({
                x: stroke.points[0].x + 0.0001,
                y: stroke.points[0].y + 0.0001
            });
        }
        var participant = getLocalParticipant(appState, elements, session);
        participant.strokes.push(stroke);
        participant.strokeMap[stroke.id] = stroke;
        participant.historyDone.push(stroke.id);
        participant.historyUndone = [];
        updateHistoryButtons(appState, elements, session);
        requestRender(appState, elements, session.conversationId);
        if (sendRemote) {
            sendStroke(session.conversationId, appState, elements, peerManager, stroke);
        }
    }

    function sendStroke(conversationId, appState, elements, peerManager, stroke) {
        var peerId = getConversationPeerId(appState, conversationId);
        if (!peerId || !peerManager || typeof peerManager.sendStructured !== "function") {
            return;
        }
        peerManager.sendStructured(peerId, "board-stroke", {
            pid: getLocalParticipantId(appState),
            name: getLocalParticipantName(appState, elements),
            stroke: serializeStroke(stroke)
        });
    }

    function sendLaserPoint(conversationId, appState, elements, peerManager, point, active) {
        var peerId = getConversationPeerId(appState, conversationId);
        if (!peerId || !peerManager || typeof peerManager.sendStructured !== "function") {
            return;
        }
        var normalized = point && typeof point === "object"
            ? { x: Number(point.x) || 0, y: Number(point.y) || 0 }
            : null;
        peerManager.sendStructured(peerId, "board-laser", {
            pid: getLocalParticipantId(appState),
            name: getLocalParticipantName(appState, elements),
            point: normalized,
            active: Boolean(active),
            ts: Date.now()
        });
    }
    function requestBoardSync(appState, elements, peerManager, conversationId) {
        var peerId = getConversationPeerId(appState, conversationId);
        if (!peerId || !peerManager || typeof peerManager.sendStructured !== "function") {
            return;
        }
        peerManager.sendStructured(peerId, "board-sync-request", {
            pid: getLocalParticipantId(appState),
            name: getLocalParticipantName(appState, elements)
        });
    }

    function sendBoardSnapshot(appState, elements, peerManager, conversationId) {
        var session = ensureBoardSession(appState, elements, conversationId);
        var peerId = getConversationPeerId(appState, conversationId);
        if (!session || !peerId || !peerManager || typeof peerManager.sendStructured !== "function") {
            return;
        }
        var participantIds = Object.keys(session.participants || {});
        var snapshotParticipants = [];
        for (var i = 0; i < participantIds.length; i += 1) {
            var participant = session.participants[participantIds[i]];
            snapshotParticipants.push({
                id: participant.id,
                name: participant.name,
                lastViewport: cloneViewport(participant.lastViewport),
                strokes: participant.strokes.map(serializeStroke)
            });
        }
        peerManager.sendStructured(peerId, "board-sync-snapshot", {
            pid: getLocalParticipantId(appState),
            name: getLocalParticipantName(appState, elements),
            viewport: cloneViewport(session.viewport),
            participants: snapshotParticipants
        });
    }

    function sendViewportUpdate(appState, elements, peerManager, conversationId, immediate) {
        var session = ensureBoardSession(appState, elements, conversationId);
        if (!session) {
            return;
        }
        var localParticipant = ensureParticipant(session, getLocalParticipantId(appState), getLocalParticipantName(appState, elements));
        if (localParticipant) {
            localParticipant.lastViewport = cloneViewport(session.viewport);
        }
        if (immediate) {
            flushViewportBroadcast(appState, elements, peerManager, session);
            return;
        }
        if (session.viewportBroadcastTimer) {
            window.clearTimeout(session.viewportBroadcastTimer);
        }
        session.viewportBroadcastTimer = window.setTimeout(function () {
            session.viewportBroadcastTimer = null;
            flushViewportBroadcast(appState, elements, peerManager, session);
        }, VIEWPORT_BROADCAST_DELAY_MS);
    }

    function flushViewportBroadcast(appState, elements, peerManager, session) {
        var peerId = getConversationPeerId(appState, session.conversationId);
        if (!peerId || !peerManager || typeof peerManager.sendStructured !== "function") {
            return;
        }
        peerManager.sendStructured(peerId, "board-viewport", {
            pid: getLocalParticipantId(appState),
            name: getLocalParticipantName(appState, elements),
            viewport: cloneViewport(session.viewport)
        });
    }

    function persistViewportChange(appState, elements, peerManager, session) {
        updateBoardStatus(appState, elements, session);
        requestRender(appState, elements, session.conversationId);
        sendViewportUpdate(appState, elements, peerManager, session.conversationId, false);
    }

    function handleStructuredPayload(appState, elements, peerManager, helpers, payload, pc) {
        if (!payload || typeof payload !== "object") {
            return false;
        }
        var type = String(payload.t || payload.type || "").trim();
        if (
            type !== "board-invite"
            && type !== "board-invite-response"
            && type !== "board-session-ended"
            && type !== "board-stroke"
            && type !== "board-stroke-visibility"
            && type !== "board-laser"
            && type !== "board-sync-request"
            && type !== "board-sync-snapshot"
            && type !== "board-viewport"
            && type !== "board-clear"
            && type !== "board-reset"
        ) {
            return false;
        }
        var conversationId = resolveConversationId(appState, payload, pc);
        var session = ensureBoardSession(appState, elements, conversationId);
        if (!session) {
            return true;
        }
        var participantId = resolveParticipantId(payload, pc);
        var participantName = resolveParticipantName(appState, payload, pc, conversationId, participantId);
        if (participantId) {
            ensureParticipant(session, participantId, participantName);
        }

        if (type === "board-invite") {
            setSessionState(session, "incoming");
            session.incomingInviteName = participantName || getConversationDisplayName(appState, conversationId) || "对方";
            openBoardInviteModal(elements, session.incomingInviteName + " 邀请你进入共享画板");
            updateBoardButton(appState, elements, session);
            return true;
        }
        if (type === "board-invite-response") {
            if (payload.accepted) {
                openBoardModal(appState, elements, peerManager, helpers || {
                    isCurrentConversationConnected: function () {
                        return true;
                    }
                }, session.conversationId);
            } else {
                resetSessionUiState(session);
                closeBoardInviteModal(elements);
                closeBoardModal(appState, elements);
                updateBoardButton(appState, elements, session);
                if (helpers && typeof helpers.setStatus === "function") {
                    helpers.setStatus((participantName || "对方") + " 拒绝了共享画板邀请。");
                }
            }
            return true;
        }
        if (type === "board-session-ended") {
            resetSessionUiState(session);
            closeBoardInviteModal(elements);
            closeBoardModal(appState, elements);
            updateBoardButton(appState, elements, session);
            if (helpers && typeof helpers.setStatus === "function") {
                helpers.setStatus((participantName || "对方") + " 已退出共享画板。");
            }
            return true;
        }

        if (getSessionState(session) !== "active") {
            return true;
        }

        if (type === "board-sync-request") {
            sendBoardSnapshot(appState, elements, peerManager, session.conversationId);
            return true;
        }
        if (type === "board-sync-snapshot") {
            applySnapshot(appState, elements, session, payload, participantId);
            return true;
        }
        if (type === "board-viewport") {
            applyRemoteViewport(appState, elements, session, participantId, payload.viewport);
            return true;
        }
        if (type === "board-stroke") {
            applyIncomingStroke(appState, elements, session, participantId, participantName, payload.stroke);
            return true;
        }
        if (type === "board-stroke-visibility") {
            applyStrokeVisibility(appState, elements, session, participantId, payload.strokeId, payload.hidden);
            return true;
        }
        if (type === "board-laser") {
            applyIncomingLaser(appState, elements, session, participantId, participantName, payload);
            return true;
        }
        if (type === "board-clear") {
            applyClearVisible(session, sanitizeBounds(payload.bounds));
            updateHistoryButtons(appState, elements, session);
            requestRender(appState, elements, session.conversationId);
            return true;
        }
        if (type === "board-reset") {
            applyResetSession(appState, session);
            syncBoardUI(appState, elements, session);
            requestRender(appState, elements, session.conversationId);
            return true;
        }
        return true;
    }

    function resolveParticipantName(appState, payload, pc, conversationId, participantId) {
        var fromPayload = payload && payload.name ? String(payload.name || "").trim() : "";
        if (fromPayload) {
            return fromPayload;
        }
        var fromConnection = pc && pc.remoteDisplayName ? String(pc.remoteDisplayName || "").trim() : "";
        if (fromConnection) {
            return fromConnection;
        }
        var fromConversation = getConversationDisplayName(appState, conversationId);
        if (fromConversation) {
            return fromConversation;
        }
        var session = appState && appState.boardSessions ? appState.boardSessions[String(conversationId || "").trim()] : null;
        var existing = session && session.participants && participantId ? session.participants[participantId] : null;
        if (existing && existing.name) {
            return String(existing.name || "").trim();
        }
        return "";
    }

    function resolveConversationId(appState, payload, pc) {
        var persistentId = payload && payload.pid ? String(payload.pid).trim() : "";
        var peerId = pc && pc.peerId ? String(pc.peerId).trim() : "";
        if (persistentId && persistentId !== getLocalParticipantId(appState)) {
            return "pid:" + persistentId;
        }
        if (peerId) {
            return "peer:" + peerId;
        }
        return getCurrentConversationId(appState);
    }

    function resolveParticipantId(payload, pc) {
        var persistentId = payload && payload.pid ? String(payload.pid).trim() : "";
        if (persistentId) {
            return persistentId;
        }
        if (pc && pc.peerId) {
            return "peer:" + String(pc.peerId).trim();
        }
        return "";
    }

    function applySnapshot(appState, elements, session, payload, senderParticipantId) {
        var participants = Array.isArray(payload.participants) ? payload.participants : [];
        var localParticipantId = getLocalParticipantId(appState);
        for (var i = 0; i < participants.length; i += 1) {
            var incoming = participants[i] && typeof participants[i] === "object" ? participants[i] : null;
            if (!incoming || !incoming.id || incoming.id === localParticipantId) {
                continue;
            }
            var participant = ensureParticipant(session, incoming.id, incoming.name || "");
            participant.lastViewport = sanitizeViewport(incoming.lastViewport) || participant.lastViewport;
            participant.strokes = [];
            participant.strokeMap = {};
            participant.historyDone = [];
            participant.historyUndone = [];
            var strokes = Array.isArray(incoming.strokes) ? incoming.strokes : [];
            for (var j = 0; j < strokes.length; j += 1) {
                var stroke = deserializeStroke(strokes[j], incoming.id);
                if (!stroke) {
                    continue;
                }
                participant.strokes.push(stroke);
                participant.strokeMap[stroke.id] = stroke;
                if (stroke.hidden) {
                    participant.historyUndone.push(stroke.id);
                } else {
                    participant.historyDone.push(stroke.id);
                }
            }
        }
        if (senderParticipantId && payload.viewport) {
            var sender = ensureParticipant(session, senderParticipantId, resolveParticipantName(appState, payload, null, session.conversationId, senderParticipantId));
            sender.lastViewport = sanitizeViewport(payload.viewport) || sender.lastViewport;
            if (session.viewMode === "follow" && session.followParticipantId === senderParticipantId && sender.lastViewport) {
                session.viewport = cloneViewport(sender.lastViewport);
            }
        }
        syncBoardUI(appState, elements, session);
        requestRender(appState, elements, session.conversationId);
    }

    function applyRemoteViewport(appState, elements, session, participantId, viewport) {
        if (!participantId) {
            return;
        }
        var participant = ensureParticipant(session, participantId, "");
        participant.lastViewport = sanitizeViewport(viewport);
        if (session.viewMode === "follow" && session.followParticipantId === participantId && participant.lastViewport) {
            session.viewport = cloneViewport(participant.lastViewport);
            updateBoardStatus(appState, elements, session);
            requestRender(appState, elements, session.conversationId);
        }
        syncFollowList(appState, elements, session);
    }

    function applyIncomingStroke(appState, elements, session, participantId, participantName, rawStroke) {
        if (!participantId) {
            return;
        }
        var participant = ensureParticipant(session, participantId, participantName);
        var stroke = deserializeStroke(rawStroke, participantId);
        if (!stroke || participant.strokeMap[stroke.id]) {
            return;
        }
        participant.strokes.push(stroke);
        participant.strokeMap[stroke.id] = stroke;
        if (stroke.hidden) {
            participant.historyUndone.push(stroke.id);
        } else {
            participant.historyDone.push(stroke.id);
        }
        syncLayerList(appState, elements, session);
        syncFollowList(appState, elements, session);
        requestRender(appState, elements, session.conversationId);
    }

    function sanitizeWorldPoint(rawPoint) {
        if (!rawPoint || typeof rawPoint !== "object") {
            return null;
        }
        var x = Number(rawPoint.x);
        var y = Number(rawPoint.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
        }
        return { x: x, y: y };
    }

    function applyIncomingLaser(appState, elements, session, participantId, participantName, payload) {
        if (!participantId) {
            return;
        }
        var participant = ensureParticipant(session, participantId, participantName);
        var active = payload && typeof payload.active === "boolean" ? Boolean(payload.active) : true;
        var point = sanitizeWorldPoint(payload && payload.point);
        var now = Date.now();

        if (!active) {
            participant.laser = null;
            requestLaserRender(appState, elements, session.conversationId);
            return;
        }

        if (!point) {
            return;
        }

        participant.laser = { point: point, active: true, updatedAt: now };
        requestLaserRender(appState, elements, session.conversationId);
    }

    function applyStrokeVisibility(appState, elements, session, participantId, strokeId, hidden) {
        if (!participantId || !strokeId) {
            return;
        }
        var participant = ensureParticipant(session, participantId, "");
        var stroke = participant.strokeMap[String(strokeId || "").trim()];
        if (!stroke) {
            return;
        }
        stroke.hidden = Boolean(hidden);
        participant.historyDone = participant.historyDone.filter(function (id) {
            return id !== stroke.id;
        });
        participant.historyUndone = participant.historyUndone.filter(function (id) {
            return id !== stroke.id;
        });
        if (stroke.hidden) {
            participant.historyUndone.push(stroke.id);
        } else {
            participant.historyDone.push(stroke.id);
        }
        updateHistoryButtons(appState, elements, session);
        requestRender(appState, elements, session.conversationId);
    }

    function onConversationChanged(appState, elements) {
        var session = ensureBoardSession(appState, elements);
        if (!session) {
            return;
        }
        ensureParticipant(session, getLocalParticipantId(appState), getLocalParticipantName(appState, elements));
        updateBoardButton(appState, elements, session);
        if (getSessionState(session) === "incoming") {
            openBoardInviteModal(elements, (session.incomingInviteName || getConversationDisplayName(appState, session.conversationId) || "对方") + " 邀请你进入共享画板");
        } else {
            closeBoardInviteModal(elements);
        }
        if (appState.boardModalOpen && getSessionState(session) === "active") {
            syncBoardUI(appState, elements, session);
            requestRender(appState, elements, session.conversationId);
        } else if (appState.boardModalOpen) {
            closeBoardModal(appState, elements);
        }
    }

    function onPeerConnected(appState, elements, peerManager, info) {
        if (!info) {
            return;
        }
        var conversationId = info.peerPersistentId ? ("pid:" + info.peerPersistentId) : (info.peerId ? ("peer:" + info.peerId) : getCurrentConversationId(appState));
        var session = ensureBoardSession(appState, elements, conversationId);
        if (!session) {
            return;
        }
        var participantId = String(info.peerPersistentId || "").trim() || (info.peerId ? ("peer:" + info.peerId) : "");
        if (participantId) {
            ensureParticipant(session, participantId, info.peerName || getConversationDisplayName(appState, conversationId));
        }
        updateBoardButton(appState, elements, session);
        if (getSessionState(session) === "active") {
            requestBoardSync(appState, elements, peerManager, conversationId);
            sendViewportUpdate(appState, elements, peerManager, conversationId, true);
        }
        if (appState.boardModalOpen && conversationId === getCurrentConversationId(appState)) {
            syncBoardUI(appState, elements, session);
            requestRender(appState, elements, conversationId);
        }
    }

    function migrateSession(appState, fromConversationId, toConversationId) {
        ensureBoardRoot(appState);
        var fromId = String(fromConversationId || "").trim();
        var toId = String(toConversationId || "").trim();
        if (!fromId || !toId || fromId === toId) {
            return;
        }
        if (appState.boardSessions[fromId] && !appState.boardSessions[toId]) {
            appState.boardSessions[toId] = appState.boardSessions[fromId];
            appState.boardSessions[toId].conversationId = toId;
        }
        delete appState.boardSessions[fromId];
        if (appState.boardPreferences && appState.boardPreferences[fromId] && !appState.boardPreferences[toId]) {
            appState.boardPreferences[toId] = appState.boardPreferences[fromId];
            persistBoardPreferences(appState);
        }
        if (appState.boardPreferences && appState.boardPreferences[fromId]) {
            delete appState.boardPreferences[fromId];
            persistBoardPreferences(appState);
        }
    }

    function handlePeerDisconnected(appState, elements, info) {
        ensureBoardRoot(appState);
        var currentConversationId = getCurrentConversationId(appState);
        var affectedIds = [];
        var peerPersistentId = info && info.peerPersistentId ? String(info.peerPersistentId || "").trim() : "";
        var peerId = info && info.peerId ? String(info.peerId || "").trim() : "";
        if (peerPersistentId) {
            affectedIds.push("pid:" + peerPersistentId);
        }
        if (peerId) {
            affectedIds.push("peer:" + peerId);
        }
        if (!affectedIds.length && currentConversationId) {
            affectedIds.push(currentConversationId);
        }
        for (var i = 0; i < affectedIds.length; i += 1) {
            var session = appState.boardSessions[affectedIds[i]];
            if (!session) {
                continue;
            }
            resetSessionUiState(session);
        }
        closeBoardInviteModal(elements);
        closeBoardModal(appState, elements);
        var currentSession = ensureBoardSession(appState, elements, currentConversationId);
        if (currentSession) {
            updateBoardButton(appState, elements, currentSession);
        }
    }

    function onLocalStream(appState, elements, stream, info) {
        updateBoardMediaUI(appState, elements);
        if (appState.boardModalOpen) {
            requestRender(appState, elements);
        }
    }

    function onRemoteStream(appState, elements, stream, info) {
        updateBoardMediaUI(appState, elements);
        if (appState.boardModalOpen) {
            requestRender(appState, elements);
        }
    }

    function openVideoSettings() {
        return;
    }

    async function toggleVoice(appState, elements, peerManager, helpers) {
        if (!elements || !elements.videoSourceSelect) {
            return;
        }
        if (appState.videoState !== "idle" && appState.localMediaSourceMode === "audio") {
            peerManager.hangupVideoCall();
            appState.videoState = "idle";
            updateBoardMediaUI(appState, elements);
            if (typeof UiVideo !== "undefined" && UiVideo && typeof UiVideo.updateVideoButton === "function") {
                UiVideo.updateVideoButton(appState, elements);
            }
            return;
        }
        elements.videoSourceSelect.value = "audio";
        if (appState.videoState === "idle" || appState.videoState === "incoming") {
            await UiVideo.applySelectedSource(appState, elements, peerManager, helpers);
            if (appState.videoState === "idle") {
                await UiVideo.startVideoCall(appState, elements, peerManager, helpers, { silent: true });
            }
        } else {
            await UiVideo.applySelectedSource(appState, elements, peerManager, helpers);
        }
        updateBoardMediaUI(appState, elements);
    }

    async function toggleScreenShare(appState, elements, peerManager, helpers) {
        if (!elements || !elements.videoSourceSelect || !supportsScreenShare()) {
            return;
        }
        elements.videoSourceSelect.value = appState.localMediaSourceMode === "screen" ? "camera" : "screen";
        if (appState.videoState === "idle" || appState.videoState === "incoming") {
            await UiVideo.applySelectedSource(appState, elements, peerManager, helpers);
            if (elements.videoSourceSelect.value === "screen" && appState.videoState === "idle") {
                await UiVideo.startVideoCall(appState, elements, peerManager, helpers, { silent: true });
            }
        } else {
            await UiVideo.applySelectedSource(appState, elements, peerManager, helpers);
        }
        updateBoardMediaUI(appState, elements);
    }

    async function toggleFullscreen(appState, elements) {
        if (!elements || !elements.boardModal || !supportsFullscreen(elements.boardModal)) {
            return;
        }
        ensureBoardRoot(appState);
        if (isFullscreenActive(elements)) {
            appState.boardUi.fullscreenRequested = false;
            setPseudoFullscreen(appState, elements, false);
            if (getNativeFullscreenElement() && document.exitFullscreen) {
                await document.exitFullscreen();
            }
            return;
        }
        appState.boardUi.fullscreenRequested = true;
        if (canUseInstalledAppFullscreen(elements.boardModal)) {
            setPseudoFullscreen(appState, elements, true);
            syncFullscreenButton(appState, elements);
            requestRender(appState, elements);
            return;
        }
        if (canUseNativeFullscreen(elements.boardModal)) {
            try {
                await elements.boardModal.requestFullscreen();
                return;
            } catch (_error) {
                appState.boardUi.fullscreenRequested = false;
                throw _error;
            }
        }
    }

    function onFullscreenChanged(appState, elements) {
        ensureBoardRoot(appState);
        if (getNativeFullscreenElement()) {
            setPseudoFullscreen(appState, elements, false);
        } else if (appState.boardModalOpen && appState.boardUi.fullscreenRequested && canUseInstalledAppFullscreen(elements.boardModal)) {
            setPseudoFullscreen(appState, elements, true);
        }
        syncFullscreenButton(appState, elements);
        requestRender(appState, elements);
    }

    function worldToScreen(viewport, point, metrics) {
        return {
            x: (point.x - viewport.centerX) * viewport.zoom + (metrics.width / 2),
            y: (point.y - viewport.centerY) * viewport.zoom + (metrics.height / 2)
        };
    }

    function screenToWorld(metrics, viewport, clientX, clientY) {
        var x = clientX - metrics.rect.left;
        var y = clientY - metrics.rect.top;
        return {
            x: ((x - (metrics.width / 2)) / viewport.zoom) + viewport.centerX,
            y: ((y - (metrics.height / 2)) / viewport.zoom) + viewport.centerY
        };
    }

    function getViewportWorldBounds(session, elements) {
        var metrics = getCanvasMetrics(elements);
        if (!metrics || !session) {
            return null;
        }
        var halfWidth = metrics.width / (2 * session.viewport.zoom);
        var halfHeight = metrics.height / (2 * session.viewport.zoom);
        return {
            left: session.viewport.centerX - halfWidth,
            top: session.viewport.centerY - halfHeight,
            right: session.viewport.centerX + halfWidth,
            bottom: session.viewport.centerY + halfHeight
        };
    }

    function strokeIntersectsBounds(stroke, bounds) {
        if (!stroke || !bounds) {
            return false;
        }
        var bbox = getStrokeBounds(stroke);
        return Boolean(
            bbox.right >= bounds.left
            && bbox.left <= bounds.right
            && bbox.bottom >= bounds.top
            && bbox.top <= bounds.bottom
        );
    }

    function getStrokeBounds(stroke) {
        var points = stroke.points || [];
        var first = points[0] || { x: 0, y: 0 };
        var left = first.x;
        var right = first.x;
        var top = first.y;
        var bottom = first.y;
        for (var i = 1; i < points.length; i += 1) {
            left = Math.min(left, points[i].x);
            right = Math.max(right, points[i].x);
            top = Math.min(top, points[i].y);
            bottom = Math.max(bottom, points[i].y);
        }
        var pad = Math.max(0.5, Number(stroke.size || 0)) / 2;
        return {
            left: left - pad,
            top: top - pad,
            right: right + pad,
            bottom: bottom + pad
        };
    }

    function zoomViewportAroundPoint(viewport, anchorWorld, factor) {
        var nextZoom = clampZoom(viewport.zoom * factor);
        viewport.centerX = anchorWorld.x - (((anchorWorld.x - viewport.centerX) * viewport.zoom) / nextZoom);
        viewport.centerY = anchorWorld.y - (((anchorWorld.y - viewport.centerY) * viewport.zoom) / nextZoom);
        viewport.zoom = nextZoom;
    }

    function clampZoom(value) {
        var numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return 1;
        }
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, numeric));
    }

    function distanceBetweenScreenPoints(a, b) {
        var dx = (a.x || 0) - (b.x || 0);
        var dy = (a.y || 0) - (b.y || 0);
        return Math.sqrt(dx * dx + dy * dy);
    }

    function serializeStroke(stroke) {
        return {
            id: stroke.id,
            participantId: stroke.participantId,
            tool: stroke.tool,
            color: stroke.color,
            size: stroke.size,
            hidden: Boolean(stroke.hidden),
            points: Array.isArray(stroke.points) ? stroke.points.map(function (point) {
                return { x: Number(point.x) || 0, y: Number(point.y) || 0 };
            }) : []
        };
    }

    function deserializeStroke(rawStroke, participantId) {
        if (!rawStroke || typeof rawStroke !== "object") {
            return null;
        }
        var id = String(rawStroke.id || "").trim();
        if (!id) {
            return null;
        }
        var size = Number(rawStroke.size);
        var tool = rawStroke.tool === "eraser" ? "eraser" : "brush";
        var points = Array.isArray(rawStroke.points) ? rawStroke.points.map(function (point) {
            return {
                x: Number(point && point.x),
                y: Number(point && point.y)
            };
        }).filter(function (point) {
            return Number.isFinite(point.x) && Number.isFinite(point.y);
        }) : [];
        if (!points.length) {
            return null;
        }
        return {
            id: id,
            participantId: String(participantId || rawStroke.participantId || "").trim(),
            tool: tool,
            color: String(rawStroke.color || DEFAULT_BRUSH_COLOR),
            size: Number.isFinite(size) && size > 0 ? size : (DEFAULT_BRUSH_SIZE / 1),
            hidden: Boolean(rawStroke.hidden),
            points: points
        };
    }

    function sanitizeViewport(rawViewport) {
        if (!rawViewport || typeof rawViewport !== "object") {
            return null;
        }
        var centerX = Number(rawViewport.centerX);
        var centerY = Number(rawViewport.centerY);
        var zoom = clampZoom(rawViewport.zoom);
        if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
            return null;
        }
        return {
            centerX: centerX,
            centerY: centerY,
            zoom: zoom
        };
    }

    function cloneViewport(viewport) {
        return {
            centerX: Number(viewport && viewport.centerX) || 0,
            centerY: Number(viewport && viewport.centerY) || 0,
            zoom: clampZoom(viewport && viewport.zoom)
        };
    }

    function sanitizeBounds(rawBounds) {
        if (!rawBounds || typeof rawBounds !== "object") {
            return null;
        }
        var left = Number(rawBounds.left);
        var top = Number(rawBounds.top);
        var right = Number(rawBounds.right);
        var bottom = Number(rawBounds.bottom);
        if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
            return null;
        }
        return {
            left: Math.min(left, right),
            top: Math.min(top, bottom),
            right: Math.max(left, right),
            bottom: Math.max(top, bottom)
        };
    }

    function getParticipantDisplayName(session, participantId) {
        var normalized = String(participantId || "").trim();
        if (!normalized) {
            return "我";
        }
        var participant = session && session.participants ? session.participants[normalized] : null;
        return participant && participant.name ? participant.name : normalized;
    }

    function createStrokeId() {
        if (window.crypto && typeof window.crypto.getRandomValues === "function") {
            var bytes = new Uint8Array(8);
            window.crypto.getRandomValues(bytes);
            var hex = "";
            for (var i = 0; i < bytes.length; i += 1) {
                hex += bytes[i].toString(16).padStart(2, "0");
            }
            return "s" + hex;
        }
        return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    return {
        openBoardModal: openBoardModal,
        closeBoardModal: closeBoardModal,
        handleBoardToggle: handleBoardToggle,
        requestBoardSession: requestBoardSession,
        acceptBoardInvite: acceptBoardInvite,
        rejectBoardInvite: rejectBoardInvite,
        leaveBoardSession: leaveBoardSession,
        resizeBoardCanvas: resizeBoardCanvas,
        handleStructuredPayload: handleStructuredPayload,
        handleDocumentClick: handleDocumentClick,
        setTool: setTool,
        setBrushColor: setBrushColor,
        setBrushSize: setBrushSize,
        setViewMode: setViewMode,
        setFollowTarget: setFollowTarget,
        toggleLayerPopover: toggleLayerPopover,
        toggleControlsCollapsed: toggleControlsCollapsed,
        undo: undo,
        redo: redo,
        clearVisible: clearVisible,
        resetBoard: resetBoard,
        onConversationChanged: onConversationChanged,
        onPeerConnected: onPeerConnected,
        handlePeerDisconnected: handlePeerDisconnected,
        migrateSession: migrateSession,
        onLocalStream: onLocalStream,
        onRemoteStream: onRemoteStream,
        updateBoardMediaUI: updateBoardMediaUI,
        updateBoardButton: updateBoardButton,
        openVideoSettings: openVideoSettings,
        toggleVoice: toggleVoice,
        toggleScreenShare: toggleScreenShare,
        toggleFullscreen: toggleFullscreen,
        onFullscreenChanged: onFullscreenChanged,
        handlePointerDown: handlePointerDown,
        handlePointerMove: handlePointerMove,
        handlePointerUp: handlePointerUp,
        handleWheel: handleWheel,
        requestRender: requestRender,
        syncLayerList: syncLayerList
    };
})();
