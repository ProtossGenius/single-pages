/**
 * ui-board.js - Shared whiteboard, layered raster rendering, viewport sync.
 *
 * Depends on: storage.js, ui-video.js, utils.js
 */

var UiBoard = (function () {
    var TILE_SIZE = 512;
    var MIN_ZOOM = 0.2;
    var MAX_ZOOM = 6;
    var DEFAULT_BRUSH_COLOR = "#2563eb";
    var DEFAULT_BRUSH_SIZE = 12;
    var VIEWPORT_BROADCAST_DELAY_MS = 80;

    function ensureBoardRoot(appState) {
        if (!appState.boardSessions || typeof appState.boardSessions !== "object") {
            appState.boardSessions = {};
        }
        if (!appState.boardPointerState || typeof appState.boardPointerState !== "object") {
            appState.boardPointerState = {
                pointers: {},
                gestureMode: "",
                drawPointerId: null,
                panPointerId: null,
                lastWorldPoint: null,
                lastScreenPoint: null,
                pinchBaseDistance: 0,
                pinchBaseViewport: null,
                pinchBaseCenter: null
            };
        }
    }

    function createEmptyBoardSession(conversationId) {
        return {
            conversationId: String(conversationId || "").trim(),
            viewport: {
                centerX: 0,
                centerY: 0,
                zoom: 1
            },
            tool: "brush",
            brushColor: DEFAULT_BRUSH_COLOR,
            brushSize: DEFAULT_BRUSH_SIZE,
            participants: {},
            renderQueued: false,
            viewportBroadcastTimer: null
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
        ensureParticipant(session, getLocalParticipantId(appState), getLocalParticipantName(appState, elements));
        applyStoredPrefsToSession(appState, session);
        return session;
    }

    function applyStoredPrefsToSession(appState, session) {
        if (!session) {
            return;
        }
        var prefs = ensureBoardConversationPrefs(appState, session.conversationId);
        if (prefs.followParticipantId) {
            session.followParticipantId = prefs.followParticipantId;
        } else if (!session.followParticipantId) {
            session.followParticipantId = "";
        }
        session.shareViewport = Boolean(prefs.shareViewport);
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
                tiles: {},
                ops: [],
                seenOpIds: {},
                lastViewport: null
            };
        } else if (name) {
            session.participants[id].name = String(name || "").trim() || session.participants[id].name;
        }
        return session.participants[id];
    }

    function getConversationPeerId(appState, conversationId) {
        var id = String(conversationId || getCurrentConversationId(appState)).trim();
        if (!id || !appState.conversations || !appState.conversations[id]) {
            return "";
        }
        return String(appState.conversations[id].peerId || "").trim();
    }

    function updateConversationMeta(appState, conversationId, peerId, peerName) {
        var id = String(conversationId || "").trim();
        if (!id) {
            return;
        }
        var changed = false;
        var conversation = ensureConversation(appState, id);
        if (!conversation) {
            return;
        }
        var normalizedPeerId = String(peerId || "").trim();
        var normalizedPeerName = String(peerName || "").trim();
        if (normalizedPeerId && conversation.peerId !== normalizedPeerId) {
            conversation.peerId = normalizedPeerId;
            changed = true;
        }
        if (normalizedPeerName && conversation.peerName !== normalizedPeerName) {
            conversation.peerName = normalizedPeerName;
            changed = true;
        }
        if (changed) {
            persistChatState(appState);
        }
    }

    function resolveConversationId(appState, payload, pc) {
        var persistentId = payload && payload.pid ? String(payload.pid).trim() : "";
        var peerId = pc && pc.peerId ? String(pc.peerId).trim() : "";
        if (persistentId) {
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

    function openBoardModal(appState, elements, peerManager, helpers) {
        if (!helpers || typeof helpers.isCurrentConversationConnected !== "function" || !helpers.isCurrentConversationConnected()) {
            if (helpers && typeof helpers.setStatus === "function") {
                helpers.setStatus("当前会话未连接，当前无法打开共享画板。");
            }
            return;
        }
        var session = ensureBoardSession(appState, elements);
        if (!session || !elements.boardModal) {
            return;
        }
        appState.boardModalOpen = true;
        elements.boardModal.classList.remove("hidden");
        syncControlsFromSession(appState, elements, session);
        resizeBoardCanvas(elements);
        syncLayerList(appState, elements, session);
        requestBoardSync(appState, elements, peerManager, session.conversationId);
        requestRender(appState, elements, session.conversationId);
        updateBoardMediaUI(appState, elements);
    }

    function closeBoardModal(appState, elements) {
        appState.boardModalOpen = false;
        if (elements.boardModal) {
            elements.boardModal.classList.add("hidden");
        }
    }

    function toggleBoardModal(appState, elements, peerManager, helpers) {
        if (!elements.boardModal) {
            return;
        }
        if (appState.boardModalOpen) {
            closeBoardModal(appState, elements);
            return;
        }
        openBoardModal(appState, elements, peerManager, helpers);
    }

    function syncControlsFromSession(appState, elements, session) {
        if (!session) {
            return;
        }
        if (elements.boardColor) {
            elements.boardColor.value = session.brushColor || DEFAULT_BRUSH_COLOR;
        }
        if (elements.boardSize) {
            elements.boardSize.value = String(session.brushSize || DEFAULT_BRUSH_SIZE);
        }
        if (elements.boardShareViewToggle) {
            elements.boardShareViewToggle.checked = Boolean(session.shareViewport);
        }
        if (elements.boardFollowViewToggle) {
            elements.boardFollowViewToggle.checked = Boolean(session.followParticipantId);
        }
        updateToolButtons(elements, session.tool);
        updateBoardStatus(appState, elements, session);
    }

    function updateToolButtons(elements, tool) {
        if (!elements) {
            return;
        }
        var current = String(tool || "brush");
        toggleButtonActive(elements.boardToolBrush, current === "brush");
        toggleButtonActive(elements.boardToolEraser, current === "eraser");
        toggleButtonActive(elements.boardToolPan, current === "pan");
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
        var toolLabel = session.tool === "eraser" ? "橡皮" : (session.tool === "pan" ? "平移" : "画笔");
        var followText = session.followParticipantId ? "，跟随对方视角中" : "";
        var shareText = session.shareViewport ? "，正在共享我的视角" : "";
        elements.boardStatus.textContent = toolLabel + followText + shareText;
    }

    function resizeBoardCanvas(elements) {
        if (!elements || !elements.boardCanvas || !elements.boardStage) {
            return;
        }
        var canvas = elements.boardCanvas;
        var rect = elements.boardStage.getBoundingClientRect();
        var width = Math.max(320, Math.round(rect.width || 0));
        var height = Math.max(240, Math.round(rect.height || 0));
        var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = width + "px";
        canvas.style.height = height + "px";
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
        });
    }

    function renderBoard(appState, elements, session) {
        if (!appState.boardModalOpen || !session || !elements.boardCanvas) {
            return;
        }
        var canvas = elements.boardCanvas;
        var ctx = canvas.getContext("2d");
        if (!ctx) {
            return;
        }
        var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        var width = canvas.width / dpr;
        var height = canvas.height / dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.scale(dpr, dpr);
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(0, 0, width, height);
        drawGrid(ctx, session.viewport, width, height);
        drawParticipants(ctx, appState, session, width, height);
        drawViewportHint(ctx, session, width, height);
    }

    function drawGrid(ctx, viewport, width, height) {
        var spacing = 80 * viewport.zoom;
        while (spacing < 36) {
            spacing *= 2;
        }
        ctx.save();
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1;
        ctx.beginPath();
        var startX = modulo(width / 2 - viewport.centerX * viewport.zoom, spacing);
        for (var x = startX; x <= width; x += spacing) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
        }
        var startY = modulo(height / 2 - viewport.centerY * viewport.zoom, spacing);
        for (var y = startY; y <= height; y += spacing) {
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }
        ctx.stroke();
        ctx.restore();
    }

    function modulo(value, divisor) {
        if (!divisor) {
            return 0;
        }
        var result = value % divisor;
        return result < 0 ? result + divisor : result;
    }

    function drawParticipants(ctx, appState, session, width, height) {
        var participants = getOrderedParticipants(appState, session);
        for (var i = 0; i < participants.length; i += 1) {
            var participant = participants[i];
            var layerPrefs = getLayerPrefs(appState, session.conversationId, participant.id);
            if (layerPrefs.hidden) {
                continue;
            }
            drawParticipantTiles(ctx, session.viewport, width, height, participant, layerPrefs.opacity);
        }
    }

    function getOrderedParticipants(appState, session) {
        var list = Object.keys(session.participants).map(function (participantId) {
            return session.participants[participantId];
        });
        list.sort(function (a, b) {
            var aPrefs = getLayerPrefs(appState, session.conversationId, a.id);
            var bPrefs = getLayerPrefs(appState, session.conversationId, b.id);
            if (aPrefs.order !== bPrefs.order) {
                return aPrefs.order - bPrefs.order;
            }
            return String(a.name || a.id).localeCompare(String(b.name || b.id), "zh-CN");
        });
        return list;
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

    function drawParticipantTiles(ctx, viewport, width, height, participant, opacity) {
        var tileKeys = Object.keys(participant.tiles);
        if (tileKeys.length === 0) {
            return;
        }
        ctx.save();
        ctx.globalAlpha = typeof opacity === "number" ? opacity : 1;
        for (var i = 0; i < tileKeys.length; i += 1) {
            var key = tileKeys[i];
            var tile = participant.tiles[key];
            if (!tile || !tile.canvas) {
                continue;
            }
            var worldX = tile.tx * TILE_SIZE;
            var worldY = tile.ty * TILE_SIZE;
            var topLeft = worldToScreen(viewport, width, height, worldX, worldY);
            var size = TILE_SIZE * viewport.zoom;
            if (topLeft.x + size < 0 || topLeft.y + size < 0 || topLeft.x > width || topLeft.y > height) {
                continue;
            }
            ctx.drawImage(tile.canvas, topLeft.x, topLeft.y, size, size);
        }
        ctx.restore();
    }

    function drawViewportHint(ctx, session, width, height) {
        var followId = String(session.followParticipantId || "").trim();
        if (!followId) {
            return;
        }
        var participant = session.participants[followId];
        if (!participant || !participant.lastViewport) {
            return;
        }
        ctx.save();
        ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
        ctx.font = "12px sans-serif";
        ctx.fillText("正在跟随 " + (participant.name || "对方") + " 的视角", 14, 22);
        ctx.restore();
    }

    function worldToScreen(viewport, width, height, worldX, worldY) {
        return {
            x: (worldX - viewport.centerX) * viewport.zoom + width / 2,
            y: (worldY - viewport.centerY) * viewport.zoom + height / 2
        };
    }

    function screenToWorld(viewport, width, height, screenX, screenY) {
        return {
            x: (screenX - width / 2) / viewport.zoom + viewport.centerX,
            y: (screenY - height / 2) / viewport.zoom + viewport.centerY
        };
    }

    function createTile(tx, ty) {
        var canvas = document.createElement("canvas");
        canvas.width = TILE_SIZE;
        canvas.height = TILE_SIZE;
        return {
            tx: tx,
            ty: ty,
            canvas: canvas
        };
    }

    function getOrCreateTile(participant, tx, ty) {
        var key = tx + "," + ty;
        if (!participant.tiles[key]) {
            participant.tiles[key] = createTile(tx, ty);
        }
        return participant.tiles[key];
    }

    function drawSegmentOnParticipant(participant, op) {
        if (!participant || !op || !op.points || op.points.length < 2) {
            return;
        }
        var padding = Math.max(8, Number(op.size || DEFAULT_BRUSH_SIZE) + 8);
        var minX = Math.min(op.points[0].x, op.points[1].x) - padding;
        var minY = Math.min(op.points[0].y, op.points[1].y) - padding;
        var maxX = Math.max(op.points[0].x, op.points[1].x) + padding;
        var maxY = Math.max(op.points[0].y, op.points[1].y) + padding;
        var startTx = Math.floor(minX / TILE_SIZE);
        var endTx = Math.floor(maxX / TILE_SIZE);
        var startTy = Math.floor(minY / TILE_SIZE);
        var endTy = Math.floor(maxY / TILE_SIZE);
        for (var tx = startTx; tx <= endTx; tx += 1) {
            for (var ty = startTy; ty <= endTy; ty += 1) {
                var tile = getOrCreateTile(participant, tx, ty);
                drawSegmentOnTile(tile, op);
            }
        }
    }

    function drawSegmentOnTile(tile, op) {
        if (!tile || !tile.canvas) {
            return;
        }
        var ctx = tile.canvas.getContext("2d");
        if (!ctx) {
            return;
        }
        var offsetX = tile.tx * TILE_SIZE;
        var offsetY = tile.ty * TILE_SIZE;
        var p0 = op.points[0];
        var p1 = op.points[1];
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(1, Number(op.size || DEFAULT_BRUSH_SIZE));
        if (op.tool === "eraser") {
            ctx.globalCompositeOperation = "destination-out";
            ctx.strokeStyle = "rgba(0,0,0,1)";
            ctx.fillStyle = "rgba(0,0,0,1)";
        } else {
            ctx.globalCompositeOperation = "source-over";
            ctx.strokeStyle = String(op.color || DEFAULT_BRUSH_COLOR);
            ctx.fillStyle = String(op.color || DEFAULT_BRUSH_COLOR);
        }
        ctx.beginPath();
        ctx.moveTo(p0.x - offsetX, p0.y - offsetY);
        ctx.lineTo(p1.x - offsetX, p1.y - offsetY);
        ctx.stroke();
        if (Math.abs(p0.x - p1.x) < 0.01 && Math.abs(p0.y - p1.y) < 0.01) {
            ctx.beginPath();
            ctx.arc(p0.x - offsetX, p0.y - offsetY, Math.max(1, Number(op.size || DEFAULT_BRUSH_SIZE)) / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function applyOpToSession(appState, elements, session, participantId, participantName, op) {
        var participant = ensureParticipant(session, participantId, participantName);
        if (!participant || !op || !op.id) {
            return false;
        }
        if (participant.seenOpIds[op.id]) {
            return false;
        }
        participant.seenOpIds[op.id] = 1;
        participant.ops.push(op);
        drawSegmentOnParticipant(participant, op);
        syncLayerList(appState, elements, session);
        requestRender(appState, elements, session.conversationId);
        return true;
    }

    function buildOp(session, fromPoint, toPoint) {
        return {
            id: "op-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9),
            tool: session.tool === "eraser" ? "eraser" : "brush",
            color: session.brushColor || DEFAULT_BRUSH_COLOR,
            size: Math.max(1, Number(session.brushSize || DEFAULT_BRUSH_SIZE)),
            points: [
                normalizePoint(fromPoint),
                normalizePoint(toPoint)
            ],
            ts: Date.now()
        };
    }

    function normalizePoint(point) {
        return {
            x: roundPointCoord(point && point.x),
            y: roundPointCoord(point && point.y)
        };
    }

    function roundPointCoord(value) {
        var num = Number(value);
        if (!Number.isFinite(num)) {
            return 0;
        }
        return Math.round(num * 100) / 100;
    }

    function sanitizeIncomingOp(payload) {
        var source = payload && payload.op && typeof payload.op === "object" ? payload.op : payload;
        if (!source || !source.id || !Array.isArray(source.points) || source.points.length < 2) {
            return null;
        }
        return {
            id: String(source.id),
            tool: source.tool === "eraser" ? "eraser" : "brush",
            color: String(source.color || DEFAULT_BRUSH_COLOR),
            size: Math.max(1, Number(source.size || DEFAULT_BRUSH_SIZE)),
            points: [
                normalizePoint(source.points[0]),
                normalizePoint(source.points[1])
            ],
            ts: Math.max(0, Number(source.ts || Date.now()))
        };
    }

    function broadcastOp(appState, peerManager, conversationId, op) {
        if (!peerManager || typeof peerManager.sendStructured !== "function") {
            return;
        }
        var peerId = getConversationPeerId(appState, conversationId);
        if (!peerId || (typeof peerManager.isPeerConnected === "function" && !peerManager.isPeerConnected(peerId))) {
            return;
        }
        peerManager.sendStructured(peerId, "board-op", {
            op: op
        });
    }

    function requestBoardSync(appState, elements, peerManager, conversationId) {
        if (!peerManager || typeof peerManager.sendStructured !== "function") {
            return;
        }
        var session = ensureBoardSession(appState, elements, conversationId);
        var peerId = getConversationPeerId(appState, conversationId);
        if (!session || !peerId || (typeof peerManager.isPeerConnected === "function" && !peerManager.isPeerConnected(peerId))) {
            return;
        }
        peerManager.sendStructured(peerId, "board-sync-request", {
            requestId: "sync-" + Date.now().toString(36),
            wantViewport: true
        });
    }

    function sendBoardSnapshot(appState, elements, peerManager, conversationId, peerId) {
        if (!peerManager || typeof peerManager.sendStructured !== "function") {
            return;
        }
        var session = ensureBoardSession(appState, elements, conversationId);
        if (!session || !peerId || (typeof peerManager.isPeerConnected === "function" && !peerManager.isPeerConnected(peerId))) {
            return;
        }
        var localParticipant = ensureParticipant(session, getLocalParticipantId(appState), getLocalParticipantName(appState, elements));
        var payload = {
            ops: localParticipant.ops.slice(),
            viewport: session.shareViewport ? serializeViewport(session.viewport) : null
        };
        peerManager.sendStructured(peerId, "board-sync-snapshot", payload);
    }

    function serializeViewport(viewport) {
        return {
            centerX: roundPointCoord(viewport.centerX),
            centerY: roundPointCoord(viewport.centerY),
            zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(viewport.zoom || 1)))
        };
    }

    function sanitizeViewport(rawViewport) {
        if (!rawViewport || typeof rawViewport !== "object") {
            return null;
        }
        var zoom = Number(rawViewport.zoom || 1);
        if (!Number.isFinite(zoom)) {
            zoom = 1;
        }
        return {
            centerX: roundPointCoord(rawViewport.centerX),
            centerY: roundPointCoord(rawViewport.centerY),
            zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
        };
    }

    function scheduleViewportBroadcast(appState, elements, peerManager, conversationId) {
        var session = ensureBoardSession(appState, elements, conversationId);
        if (!session || !session.shareViewport) {
            return;
        }
        if (session.viewportBroadcastTimer) {
            window.clearTimeout(session.viewportBroadcastTimer);
        }
        session.viewportBroadcastTimer = window.setTimeout(function () {
            session.viewportBroadcastTimer = null;
            sendViewport(appState, elements, peerManager, session.conversationId);
        }, VIEWPORT_BROADCAST_DELAY_MS);
    }

    function sendViewport(appState, elements, peerManager, conversationId) {
        if (!peerManager || typeof peerManager.sendStructured !== "function") {
            return;
        }
        var session = ensureBoardSession(appState, elements, conversationId);
        var peerId = getConversationPeerId(appState, conversationId);
        if (
            !session
            || !peerId
            || !session.shareViewport
            || (typeof peerManager.isPeerConnected === "function" && !peerManager.isPeerConnected(peerId))
        ) {
            return;
        }
        peerManager.sendStructured(peerId, "board-viewport", {
            viewport: serializeViewport(session.viewport)
        });
    }

    function setTool(appState, elements, tool) {
        var session = ensureBoardSession(appState, elements);
        if (!session) {
            return;
        }
        session.tool = tool === "eraser" || tool === "pan" ? tool : "brush";
        updateToolButtons(elements, session.tool);
        updateBoardStatus(appState, elements, session);
    }

    function setBrushColor(appState, elements, color) {
        var session = ensureBoardSession(appState, elements);
        if (!session) {
            return;
        }
        session.brushColor = String(color || DEFAULT_BRUSH_COLOR);
    }

    function setBrushSize(appState, elements, size) {
        var session = ensureBoardSession(appState, elements);
        if (!session) {
            return;
        }
        session.brushSize = Math.max(1, Math.min(72, Number(size || DEFAULT_BRUSH_SIZE)));
    }

    function setShareViewport(appState, elements, peerManager, enabled) {
        var session = ensureBoardSession(appState, elements);
        if (!session) {
            return;
        }
        session.shareViewport = Boolean(enabled);
        setBoardConversationPrefs(appState, session.conversationId, {
            shareViewport: session.shareViewport
        });
        updateBoardStatus(appState, elements, session);
        if (session.shareViewport) {
            sendViewport(appState, elements, peerManager, session.conversationId);
        }
    }

    function setFollowViewport(appState, elements, enabled) {
        var session = ensureBoardSession(appState, elements);
        if (!session) {
            return;
        }
        if (!enabled) {
            session.followParticipantId = "";
        } else {
            var remoteParticipantId = getFirstRemoteParticipantId(appState, session);
            session.followParticipantId = remoteParticipantId;
            if (remoteParticipantId) {
                var remoteParticipant = session.participants[remoteParticipantId];
                if (remoteParticipant && remoteParticipant.lastViewport) {
                    session.viewport = {
                        centerX: remoteParticipant.lastViewport.centerX,
                        centerY: remoteParticipant.lastViewport.centerY,
                        zoom: remoteParticipant.lastViewport.zoom
                    };
                }
            }
        }
        setBoardConversationPrefs(appState, session.conversationId, {
            followParticipantId: session.followParticipantId
        });
        if (elements.boardFollowViewToggle) {
            elements.boardFollowViewToggle.checked = Boolean(session.followParticipantId);
        }
        updateBoardStatus(appState, elements, session);
        requestRender(appState, elements, session.conversationId);
    }

    function getFirstRemoteParticipantId(appState, session) {
        var localParticipantId = getLocalParticipantId(appState);
        var ids = Object.keys(session.participants);
        for (var i = 0; i < ids.length; i += 1) {
            if (ids[i] !== localParticipantId) {
                return ids[i];
            }
        }
        return "";
    }

    function syncLayerList(appState, elements, session) {
        if (!elements || !elements.boardLayerList || !session) {
            return;
        }
        var layerList = elements.boardLayerList;
        layerList.innerHTML = "";
        var participants = getOrderedParticipants(appState, session);
        if (participants.length === 0) {
            var empty = document.createElement("p");
            empty.className = "board-layer-empty";
            empty.textContent = "暂无图层";
            layerList.appendChild(empty);
            return;
        }
        for (var i = 0; i < participants.length; i += 1) {
            var participant = participants[i];
            var layerPrefs = getLayerPrefs(appState, session.conversationId, participant.id);
            layerList.appendChild(createLayerRow(appState, elements, session, participant, layerPrefs));
        }
    }

    function createLayerRow(appState, elements, session, participant, layerPrefs) {
        var row = document.createElement("div");
        row.className = "board-layer-row";
        row.dataset.participantId = participant.id;

        var title = document.createElement("div");
        title.className = "board-layer-title";
        var isLocal = participant.id === getLocalParticipantId(appState);
        var shareBadge = participant.lastViewport ? "（可跟随视角）" : "";
        title.textContent = (participant.name || participant.id) + (isLocal ? "（我）" : "") + shareBadge;
        row.appendChild(title);

        var actions = document.createElement("div");
        actions.className = "board-layer-actions";

        var toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.className = "secondary";
        toggleBtn.textContent = layerPrefs.hidden ? "显示" : "隐藏";
        toggleBtn.addEventListener("click", function () {
            setBoardLayerPrefs(appState, session.conversationId, participant.id, {
                hidden: !layerPrefs.hidden
            });
            syncLayerList(appState, elements, session);
            requestRender(appState, elements, session.conversationId);
        });
        actions.appendChild(toggleBtn);

        var frontBtn = document.createElement("button");
        frontBtn.type = "button";
        frontBtn.className = "secondary";
        frontBtn.textContent = "前置";
        frontBtn.addEventListener("click", function () {
            moveLayerOrder(appState, session, participant.id, "front");
            syncLayerList(appState, elements, session);
            requestRender(appState, elements, session.conversationId);
        });
        actions.appendChild(frontBtn);

        var backBtn = document.createElement("button");
        backBtn.type = "button";
        backBtn.className = "secondary";
        backBtn.textContent = "后置";
        backBtn.addEventListener("click", function () {
            moveLayerOrder(appState, session, participant.id, "back");
            syncLayerList(appState, elements, session);
            requestRender(appState, elements, session.conversationId);
        });
        actions.appendChild(backBtn);

        row.appendChild(actions);

        var opacityWrap = document.createElement("label");
        opacityWrap.className = "board-layer-opacity";
        opacityWrap.textContent = "透明度";
        var opacityInput = document.createElement("input");
        opacityInput.type = "range";
        opacityInput.min = "0.1";
        opacityInput.max = "1";
        opacityInput.step = "0.05";
        opacityInput.value = String(layerPrefs.opacity || 1);
        opacityInput.addEventListener("input", function () {
            setBoardLayerPrefs(appState, session.conversationId, participant.id, {
                opacity: opacityInput.value
            });
            requestRender(appState, elements, session.conversationId);
        });
        opacityWrap.appendChild(opacityInput);
        row.appendChild(opacityWrap);

        return row;
    }

    function moveLayerOrder(appState, session, participantId, direction) {
        var ids = Object.keys(session.participants);
        if (ids.length === 0) {
            return;
        }
        var orderValues = ids.map(function (id) {
            return getLayerPrefs(appState, session.conversationId, id).order;
        });
        var maxOrder = Math.max.apply(null, orderValues.concat([0]));
        var minOrder = Math.min.apply(null, orderValues.concat([0]));
        setBoardLayerPrefs(appState, session.conversationId, participantId, {
            order: direction === "front" ? maxOrder + 1 : minOrder - 1
        });
    }

    function handleStructuredPayload(appState, elements, peerManager, helpers, payload, pc) {
        if (!payload || !payload.t) {
            return false;
        }
        var type = String(payload.t || "");
        if (type !== "board-op" && type !== "board-sync-request" && type !== "board-sync-snapshot" && type !== "board-viewport") {
            return false;
        }
        var conversationId = resolveConversationId(appState, payload, pc);
        var participantId = resolveParticipantId(payload, pc);
        var participantName = payload && payload.name ? String(payload.name) : "对方";
        var peerId = pc && pc.peerId ? String(pc.peerId) : "";
        updateConversationMeta(appState, conversationId, peerId, participantName);
        var session = ensureBoardSession(appState, elements, conversationId);
        if (!session) {
            return true;
        }
        if (type === "board-sync-request") {
            sendBoardSnapshot(appState, elements, peerManager, conversationId, peerId);
            return true;
        }
        if (type === "board-sync-snapshot") {
            ensureParticipant(session, participantId, participantName);
            var ops = Array.isArray(payload.ops) ? payload.ops : [];
            for (var i = 0; i < ops.length; i += 1) {
                var syncOp = sanitizeIncomingOp(ops[i]);
                if (syncOp) {
                    applyOpToSession(appState, elements, session, participantId, participantName, syncOp);
                }
            }
            if (payload.viewport) {
                var snapshotViewport = sanitizeViewport(payload.viewport);
                if (snapshotViewport) {
                    session.participants[participantId].lastViewport = snapshotViewport;
                    maybeFollowRemoteViewport(appState, elements, session, participantId, snapshotViewport);
                }
            }
            syncLayerList(appState, elements, session);
            requestRender(appState, elements, conversationId);
            return true;
        }
        if (type === "board-viewport") {
            var nextViewport = sanitizeViewport(payload.viewport);
            if (!nextViewport) {
                return true;
            }
            var participant = ensureParticipant(session, participantId, participantName);
            participant.lastViewport = nextViewport;
            maybeFollowRemoteViewport(appState, elements, session, participantId, nextViewport);
            syncLayerList(appState, elements, session);
            requestRender(appState, elements, conversationId);
            return true;
        }
        if (type === "board-op") {
            var incomingOp = sanitizeIncomingOp(payload);
            if (!incomingOp) {
                return true;
            }
            applyOpToSession(appState, elements, session, participantId, participantName, incomingOp);
            return true;
        }
        return true;
    }

    function maybeFollowRemoteViewport(appState, elements, session, participantId, viewport) {
        if (String(session.followParticipantId || "").trim() !== String(participantId || "").trim()) {
            return;
        }
        session.viewport = {
            centerX: viewport.centerX,
            centerY: viewport.centerY,
            zoom: viewport.zoom
        };
        requestRender(appState, elements, session.conversationId);
    }

    function updateMediaStreamPreview(target, stream, muted) {
        if (!target) {
            return;
        }
        target.srcObject = stream || null;
        target.muted = Boolean(muted);
        target.autoplay = true;
        target.playsInline = true;
        target.setAttribute("playsinline", "true");
    }

    function onLocalStream(appState, elements, stream) {
        updateMediaStreamPreview(elements.boardLocalMedia, stream, true);
        if (typeof UiVideo !== "undefined" && UiVideo && typeof UiVideo.ensureVideoPlayback === "function" && elements.boardLocalMedia) {
            UiVideo.ensureVideoPlayback(elements.boardLocalMedia, appState, {
                setStatus: function () {}
            }, { muted: true });
        }
        updateBoardMediaUI(appState, elements);
    }

    function onRemoteStream(appState, elements, stream) {
        updateMediaStreamPreview(elements.boardRemoteMedia, stream, false);
        if (typeof UiVideo !== "undefined" && UiVideo && typeof UiVideo.ensureVideoPlayback === "function" && elements.boardRemoteMedia) {
            UiVideo.ensureVideoPlayback(elements.boardRemoteMedia, appState, {
                setStatus: function () {}
            }, { muted: false });
        }
        updateBoardMediaUI(appState, elements);
    }

    function updateBoardMediaUI(appState, elements) {
        if (!elements) {
            return;
        }
        var sourceMode = String(appState.localMediaSourceMode || "camera");
        var videoState = String(appState.videoState || "idle");
        if (elements.boardVoiceToggle) {
            elements.boardVoiceToggle.textContent = videoState === "idle" ? "开启语音" : "挂断语音/通话";
        }
        if (elements.boardScreenToggle) {
            if (videoState !== "idle" && sourceMode === "screen") {
                elements.boardScreenToggle.textContent = "停止屏幕共享";
            } else if (videoState === "idle") {
                elements.boardScreenToggle.textContent = "共享屏幕";
            } else {
                elements.boardScreenToggle.textContent = "切换到屏幕";
            }
        }
        if (elements.boardMediaHint) {
            if (videoState === "idle") {
                elements.boardMediaHint.textContent = "当前未建立语音/视频连接";
            } else if (sourceMode === "screen") {
                elements.boardMediaHint.textContent = "当前正在共享屏幕（同时保留语音）";
            } else if (sourceMode === "audio") {
                elements.boardMediaHint.textContent = "当前为纯语音模式";
            } else {
                elements.boardMediaHint.textContent = "当前为摄像头 + 语音模式";
            }
        }
    }

    async function toggleVoice(appState, elements, peerManager, helpers) {
        var session = ensureBoardSession(appState, elements);
        if (!session) {
            return;
        }
        var peerId = getConversationPeerId(appState, session.conversationId);
        if (!peerId) {
            helpers.setStatus("当前会话未连接，无法开启语音。");
            return;
        }
        try {
            if (appState.videoState !== "idle") {
                peerManager.hangupVideoCall();
                appState.videoState = "idle";
                updateBoardMediaUI(appState, elements);
                return;
            }
            appState.localMediaSourceMode = "audio";
            await peerManager.startVideoCall(peerId, {
                sourceMode: "audio",
                showVideo: false,
                requireAudio: true
            });
            updateBoardMediaUI(appState, elements);
        } catch (error) {
            helpers.setStatus("开启语音失败：" + toErrorMessage(error));
        }
    }

    async function toggleScreenShare(appState, elements, peerManager, helpers) {
        var session = ensureBoardSession(appState, elements);
        if (!session) {
            return;
        }
        var peerId = getConversationPeerId(appState, session.conversationId);
        if (!peerId) {
            helpers.setStatus("当前会话未连接，无法共享屏幕。");
            return;
        }
        try {
            if (appState.videoState !== "idle" && String(appState.localMediaSourceMode || "") === "screen") {
                peerManager.hangupVideoCall();
                appState.videoState = "idle";
                updateBoardMediaUI(appState, elements);
                return;
            }
            if (appState.videoState !== "idle") {
                peerManager.hangupVideoCall();
            }
            appState.localMediaSourceMode = "screen";
            await peerManager.startVideoCall(peerId, {
                sourceMode: "screen",
                showVideo: true,
                requireAudio: true
            });
            updateBoardMediaUI(appState, elements);
        } catch (error) {
            helpers.setStatus("屏幕共享失败：" + toErrorMessage(error));
        }
    }

    function openVideoSettings(elements) {
        if (!elements || !elements.videoModal) {
            return;
        }
        elements.videoModal.classList.remove("hidden");
    }

    function getCanvasMetrics(elements) {
        if (!elements || !elements.boardCanvas) {
            return null;
        }
        var canvas = elements.boardCanvas;
        var rect = canvas.getBoundingClientRect();
        var width = Math.max(1, rect.width || parseFloat(canvas.style.width) || 1);
        var height = Math.max(1, rect.height || parseFloat(canvas.style.height) || 1);
        return {
            rect: rect,
            width: width,
            height: height
        };
    }

    function getEventScreenPoint(event, metrics) {
        return {
            x: Number(event.clientX || 0) - metrics.rect.left,
            y: Number(event.clientY || 0) - metrics.rect.top
        };
    }

    function handlePointerDown(event, appState, elements, peerManager) {
        if (!appState.boardModalOpen) {
            return;
        }
        var session = ensureBoardSession(appState, elements);
        var metrics = getCanvasMetrics(elements);
        if (!session || !metrics) {
            return;
        }
        var pointerState = appState.boardPointerState;
        var pointerId = Number(event.pointerId);
        var screenPoint = getEventScreenPoint(event, metrics);
        pointerState.pointers[pointerId] = screenPoint;
        if (elements.boardCanvas && typeof elements.boardCanvas.setPointerCapture === "function") {
            try {
                elements.boardCanvas.setPointerCapture(pointerId);
            } catch (_error) {}
        }
        var pointerIds = Object.keys(pointerState.pointers);
        if (pointerIds.length >= 2) {
            beginPinchGesture(appState, elements, session);
            event.preventDefault();
            return;
        }
        if (session.tool === "pan") {
            pointerState.gestureMode = "pan";
            pointerState.panPointerId = pointerId;
            pointerState.lastScreenPoint = screenPoint;
            event.preventDefault();
            return;
        }
        var worldPoint = screenToWorld(session.viewport, metrics.width, metrics.height, screenPoint.x, screenPoint.y);
        pointerState.gestureMode = "draw";
        pointerState.drawPointerId = pointerId;
        pointerState.lastWorldPoint = worldPoint;
        commitStrokeSegment(appState, elements, peerManager, session, worldPoint, worldPoint);
        event.preventDefault();
    }

    function beginPinchGesture(appState, elements, session) {
        var pointerState = appState.boardPointerState;
        var points = Object.keys(pointerState.pointers).slice(0, 2).map(function (pointerId) {
            return pointerState.pointers[pointerId];
        });
        if (points.length < 2) {
            return;
        }
        pointerState.gestureMode = "pinch";
        pointerState.drawPointerId = null;
        pointerState.panPointerId = null;
        pointerState.lastWorldPoint = null;
        pointerState.lastScreenPoint = null;
        pointerState.pinchBaseDistance = distanceBetween(points[0], points[1]);
        pointerState.pinchBaseViewport = {
            centerX: session.viewport.centerX,
            centerY: session.viewport.centerY,
            zoom: session.viewport.zoom
        };
        pointerState.pinchBaseCenter = midpoint(points[0], points[1]);
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
        var pointerState = appState.boardPointerState;
        var pointerId = Number(event.pointerId);
        if (!Object.prototype.hasOwnProperty.call(pointerState.pointers, pointerId)) {
            return;
        }
        var screenPoint = getEventScreenPoint(event, metrics);
        pointerState.pointers[pointerId] = screenPoint;

        if (pointerState.gestureMode === "pinch") {
            updatePinchGesture(appState, elements, peerManager, session, metrics);
            event.preventDefault();
            return;
        }
        if (pointerState.gestureMode === "pan" && pointerState.panPointerId === pointerId) {
            var lastPan = pointerState.lastScreenPoint || screenPoint;
            session.viewport.centerX -= (screenPoint.x - lastPan.x) / session.viewport.zoom;
            session.viewport.centerY -= (screenPoint.y - lastPan.y) / session.viewport.zoom;
            pointerState.lastScreenPoint = screenPoint;
            onViewportChanged(appState, elements, peerManager, session);
            event.preventDefault();
            return;
        }
        if (pointerState.gestureMode === "draw" && pointerState.drawPointerId === pointerId) {
            var worldPoint = screenToWorld(session.viewport, metrics.width, metrics.height, screenPoint.x, screenPoint.y);
            var lastWorld = pointerState.lastWorldPoint || worldPoint;
            commitStrokeSegment(appState, elements, peerManager, session, lastWorld, worldPoint);
            pointerState.lastWorldPoint = worldPoint;
            event.preventDefault();
        }
    }

    function updatePinchGesture(appState, elements, peerManager, session, metrics) {
        var pointerState = appState.boardPointerState;
        var pointerIds = Object.keys(pointerState.pointers);
        if (pointerIds.length < 2 || !pointerState.pinchBaseViewport || !pointerState.pinchBaseCenter) {
            return;
        }
        var p0 = pointerState.pointers[pointerIds[0]];
        var p1 = pointerState.pointers[pointerIds[1]];
        var currentDistance = Math.max(20, distanceBetween(p0, p1));
        var baseDistance = Math.max(20, Number(pointerState.pinchBaseDistance || currentDistance));
        var nextZoom = pointerState.pinchBaseViewport.zoom * (currentDistance / baseDistance);
        nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
        var currentCenter = midpoint(p0, p1);
        var baseWorldCenter = screenToWorld(
            pointerState.pinchBaseViewport,
            metrics.width,
            metrics.height,
            pointerState.pinchBaseCenter.x,
            pointerState.pinchBaseCenter.y
        );
        session.viewport.zoom = nextZoom;
        session.viewport.centerX = baseWorldCenter.x - (currentCenter.x - metrics.width / 2) / nextZoom;
        session.viewport.centerY = baseWorldCenter.y - (currentCenter.y - metrics.height / 2) / nextZoom;
        onViewportChanged(appState, elements, peerManager, session);
    }

    function handlePointerUp(event, appState) {
        var pointerState = appState.boardPointerState;
        var pointerId = Number(event.pointerId);
        delete pointerState.pointers[pointerId];
        if (pointerState.drawPointerId === pointerId) {
            pointerState.drawPointerId = null;
            pointerState.lastWorldPoint = null;
        }
        if (pointerState.panPointerId === pointerId) {
            pointerState.panPointerId = null;
            pointerState.lastScreenPoint = null;
        }
        var remaining = Object.keys(pointerState.pointers).length;
        if (remaining === 0) {
            pointerState.gestureMode = "";
            pointerState.pinchBaseDistance = 0;
            pointerState.pinchBaseViewport = null;
            pointerState.pinchBaseCenter = null;
        } else if (remaining === 1 && pointerState.gestureMode === "pinch") {
            pointerState.gestureMode = "";
            pointerState.pinchBaseDistance = 0;
            pointerState.pinchBaseViewport = null;
            pointerState.pinchBaseCenter = null;
        }
    }

    function commitStrokeSegment(appState, elements, peerManager, session, fromPoint, toPoint) {
        if (!session || session.tool === "pan") {
            return;
        }
        var op = buildOp(session, fromPoint, toPoint);
        var localParticipantId = getLocalParticipantId(appState);
        var localParticipantName = getLocalParticipantName(appState, elements);
        applyOpToSession(appState, elements, session, localParticipantId, localParticipantName, op);
        broadcastOp(appState, peerManager, session.conversationId, op);
    }

    function distanceBetween(a, b) {
        var dx = Number((a && a.x) || 0) - Number((b && b.x) || 0);
        var dy = Number((a && a.y) || 0) - Number((b && b.y) || 0);
        return Math.sqrt(dx * dx + dy * dy);
    }

    function midpoint(a, b) {
        return {
            x: (Number((a && a.x) || 0) + Number((b && b.x) || 0)) / 2,
            y: (Number((a && a.y) || 0) + Number((b && b.y) || 0)) / 2
        };
    }

    function handleWheel(event, appState, elements, peerManager) {
        if (!appState.boardModalOpen) {
            return;
        }
        var session = ensureBoardSession(appState, elements);
        var metrics = getCanvasMetrics(elements);
        if (!session || !metrics) {
            return;
        }
        event.preventDefault();
        var screenPoint = getEventScreenPoint(event, metrics);
        var worldBefore = screenToWorld(session.viewport, metrics.width, metrics.height, screenPoint.x, screenPoint.y);
        var factor = event.deltaY < 0 ? 1.12 : 0.9;
        session.viewport.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, session.viewport.zoom * factor));
        session.viewport.centerX = worldBefore.x - (screenPoint.x - metrics.width / 2) / session.viewport.zoom;
        session.viewport.centerY = worldBefore.y - (screenPoint.y - metrics.height / 2) / session.viewport.zoom;
        onViewportChanged(appState, elements, peerManager, session);
    }

    function onViewportChanged(appState, elements, peerManager, session) {
        updateBoardStatus(appState, elements, session);
        requestRender(appState, elements, session.conversationId);
        if (peerManager) {
            scheduleViewportBroadcast(appState, elements, peerManager, session.conversationId);
        }
    }

    function onConversationChanged(appState, elements) {
        var session = ensureBoardSession(appState, elements);
        if (!session) {
            return;
        }
        syncControlsFromSession(appState, elements, session);
        syncLayerList(appState, elements, session);
        requestRender(appState, elements, session.conversationId);
    }

    function onPeerConnected(appState, elements, peerManager, info) {
        if (!info || !info.peerId) {
            return;
        }
        var conversationId = info.peerPersistentId ? "pid:" + String(info.peerPersistentId).trim() : "peer:" + String(info.peerId).trim();
        updateConversationMeta(appState, conversationId, info.peerId, info.peerName || "");
        requestBoardSync(appState, elements, peerManager, conversationId);
    }

    function migrateSession(appState, fromConversationId, toConversationId) {
        ensureBoardRoot(appState);
        var fromId = String(fromConversationId || "").trim();
        var toId = String(toConversationId || "").trim();
        if (!fromId || !toId || fromId === toId) {
            return;
        }
        if (appState.boardSessions[fromId]) {
            if (!appState.boardSessions[toId]) {
                appState.boardSessions[toId] = appState.boardSessions[fromId];
            } else {
                var fromSession = appState.boardSessions[fromId];
                var toSession = appState.boardSessions[toId];
                var participantIds = Object.keys(fromSession.participants || {});
                for (var i = 0; i < participantIds.length; i += 1) {
                    var participantId = participantIds[i];
                    if (!toSession.participants[participantId]) {
                        toSession.participants[participantId] = fromSession.participants[participantId];
                    }
                }
            }
            appState.boardSessions[toId].conversationId = toId;
            delete appState.boardSessions[fromId];
        }
        if (appState.boardPreferences && appState.boardPreferences[fromId]) {
            if (!appState.boardPreferences[toId]) {
                appState.boardPreferences[toId] = appState.boardPreferences[fromId];
            } else {
                var targetPrefs = appState.boardPreferences[toId];
                var sourcePrefs = appState.boardPreferences[fromId];
                targetPrefs.shareViewport = targetPrefs.shareViewport || sourcePrefs.shareViewport;
                targetPrefs.followParticipantId = targetPrefs.followParticipantId || sourcePrefs.followParticipantId;
                targetPrefs.layers = {
                    ...(sourcePrefs.layers || {}),
                    ...(targetPrefs.layers || {})
                };
            }
            delete appState.boardPreferences[fromId];
            persistBoardPreferences(appState);
        }
    }

    return {
        openBoardModal: openBoardModal,
        closeBoardModal: closeBoardModal,
        toggleBoardModal: toggleBoardModal,
        resizeBoardCanvas: resizeBoardCanvas,
        handleStructuredPayload: handleStructuredPayload,
        setTool: setTool,
        setBrushColor: setBrushColor,
        setBrushSize: setBrushSize,
        setShareViewport: setShareViewport,
        setFollowViewport: setFollowViewport,
        onConversationChanged: onConversationChanged,
        onPeerConnected: onPeerConnected,
        migrateSession: migrateSession,
        onLocalStream: onLocalStream,
        onRemoteStream: onRemoteStream,
        updateBoardMediaUI: updateBoardMediaUI,
        toggleVoice: toggleVoice,
        toggleScreenShare: toggleScreenShare,
        openVideoSettings: openVideoSettings,
        handlePointerDown: handlePointerDown,
        handlePointerMove: handlePointerMove,
        handlePointerUp: handlePointerUp,
        handleWheel: handleWheel,
        requestRender: requestRender,
        syncLayerList: syncLayerList
    };
})();
