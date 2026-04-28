/**
 * ui-connector.js - QR code generation, scanner, mode switching.
 *
 * Depends on: utils.js, signal.js, storage.js
 */

var UiConnector = (function () {

    var codeReader = null;

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

    function hasScannerDependency() {
        return Boolean(window.ZXingBrowser && window.ZXingBrowser.BrowserQRCodeReader);
    }

    function hasQrDependency() {
        return typeof window.QRCode === "function";
    }

    function setMode(appState, elements, mode, options) {
        options = options || {};
        appState.modeTask = appState.modeTask.then(async function () {
            var normalizedMode = normalizeConnectorMode(mode);
            if (!options.force && normalizedMode === appState.mode) {
                return;
            }

            appState.mode = normalizedMode;
            persistConnectorModePreference(appState, normalizedMode);
            var isQr = normalizedMode === "qr";
            if (isQr) {
                await stopScanIfRunning(appState, elements);
            }

            elements.qrContainer.classList.toggle("hidden", !isQr);
            elements.scannerContainer.classList.toggle("hidden", isQr);
            elements.scanTrigger.classList.toggle("hidden", isQr);
            elements.regenOffer.classList.toggle("hidden", !isQr);
            elements.enlargeQr.classList.toggle("hidden", !isQr);
            elements.toggleMethod.textContent = isQr ? "切换到扫描框" : "切换到二维码";

            if (isQr) {
                if (!options.preserveQr && options.generateIfNeeded !== false) {
                    await regenerateOffer(appState, elements);
                }
            } else {
                try {
                    var localPeerId = await appState.ensurePeerReady();
                    var shortcutCode = updateShortcutCodeDisplay(elements, localPeerId);
                    if (hasScannerDependency()) {
                        var shortcutText = shortcutCode ? "；也可让对方直接输入快捷码 " + shortcutCode + " 连接。" : "。";
                        setStatus(appState, elements, '已切到扫码模式，点击"开始扫码"后扫描对方页面 URL 二维码即可连接' + shortcutText);
                    } else {
                        setStatus(appState, elements, "已切到扫码模式，但扫码依赖未加载。请检查网络后刷新页面。");
                    }
                } catch (error) {
                    setStatus(appState, elements, "初始化快捷码失败：" + toErrorMessage(error));
                }
            }
            updateScanButton(appState, elements);
        }).catch(function (error) {
            setStatus(appState, elements, "模式切换失败：" + toErrorMessage(error));
        });

        return appState.modeTask;
    }

    async function regenerateOffer(appState, elements) {
        if (appState.mode !== "qr") {
            return;
        }
        try {
            setScanVisualSuccess(appState, elements, false);
            setStatus(appState, elements, "正在初始化 Peer 节点并生成二维码…");
            var peerId = await appState.ensurePeerReady();
            updateShortcutCodeDisplay(elements, peerId);
            var encoded = encodePeerSignal(peerId);
            renderQr(appState, elements, encoded);
            var shortcutCode = getShortcutCodeFromPeerId(peerId);
            var shortcutText = shortcutCode ? "，也可让对方直接输入快捷码 " + shortcutCode : "";
            setStatus(appState, elements, "请让对方扫码该二维码（长度 " + encoded.length + "）" + shortcutText + "。");
        } catch (error) {
            setStatus(appState, elements, "生成二维码失败：" + toErrorMessage(error));
        }
    }

    function startScan(appState, elements) {
        appState.scannerTask = appState.scannerTask.then(async function () {
            if (appState.mode !== "scanner" || appState.scannerRunning) {
                return;
            }
            appState.clearRefreshReconnectPending();
            if (!hasScannerDependency()) {
                setStatus(appState, elements, "扫码依赖未加载，无法启动内置扫码。请检查网络后刷新页面。");
                return;
            }
            if (!window.isSecureContext) {
                setStatus(appState, elements, "当前不是安全上下文，无法调用摄像头。请使用 https 或 localhost。当前地址：" + window.location.origin);
                return;
            }
            try {
                var reader = ensureCodeReader();
                setScanVisualSuccess(appState, elements, false);
                await appState.ensurePeerReady();
                appState.scanSessionId += 1;
                var sessionId = appState.scanSessionId;
                setStatus(appState, elements, "正在启动摄像头…");
                var readerView = ensureScannerView(elements);
                var deviceId = await pickCameraDeviceId();
                var scanPromise = deviceId
                    ? reader.decodeFromVideoDevice(
                        deviceId,
                        readerView,
                        function (result, error) { handleScanFrame(appState, elements, result, error, sessionId); }
                    )
                    : reader.decodeFromConstraints(
                        getScannerConstraints(),
                        readerView,
                        function (result, error) { handleScanFrame(appState, elements, result, error, sessionId); }
                    );

                appState.scanControls = await scanPromise;
                appState.scannerRunning = true;
                updateScanButton(appState, elements);
                startSmartRegionLoop(appState, elements, sessionId);
                setStatus(appState, elements, "摄像头已开启，正在识别二维码…");
            } catch (error) {
                appState.scannerRunning = false;
                appState.scanControls = null;
                stopSmartRegionLoop(appState);
                updateScanButton(appState, elements);
                setStatus(appState, elements, "启动扫码失败：" + toErrorMessage(error));
            }
        });
        return appState.scannerTask;
    }

    function stopScanIfRunning(appState, elements) {
        appState.scannerTask = appState.scannerTask.then(async function () {
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
            } catch (_error) {}
            appState.scannerRunning = false;
            appState.scanControls = null;
            stopSmartRegionLoop(appState);
            updateScanButton(appState, elements);
        });
        return appState.scannerTask;
    }

    function startSmartRegionLoop(appState, elements, sessionId) {
        stopSmartRegionLoop(appState);
        if (typeof jsQR !== "function") {
            return;
        }
        var tick = function () {
            if (!appState.scannerRunning || sessionId !== appState.scanSessionId) {
                return;
            }
            tryDecodeDarkRegions(appState, elements, sessionId);
            appState.smartRegionTimer = window.setTimeout(tick, 220);
        };
        appState.smartRegionTimer = window.setTimeout(tick, 320);
    }

    function stopSmartRegionLoop(appState) {
        if (appState.smartRegionTimer) {
            clearTimeout(appState.smartRegionTimer);
            appState.smartRegionTimer = null;
        }
    }

    function tryDecodeDarkRegions(appState, elements, sessionId) {
        if (appState.handlingScan || !appState.scannerRunning || sessionId !== appState.scanSessionId) {
            return;
        }
        var video = elements.reader.querySelector("video");
        if (!video || !video.videoWidth || !video.videoHeight) {
            return;
        }
        var frame = captureFrame(appState, video, 900);
        if (!frame) {
            return;
        }
        var candidates = detectDarkRegionCandidates(frame.imageData, frame.width, frame.height);
        if (candidates.length === 0) {
            return;
        }
        for (var i = 0; i < candidates.length; i += 1) {
            var rect = candidates[i];
            var roi;
            try {
                roi = appState.smartCtx.getImageData(rect.x, rect.y, rect.w, rect.h);
            } catch (_error) {
                continue;
            }
            var result = jsQR(roi.data, rect.w, rect.h, { inversionAttempts: "attemptBoth" });
            if (result && result.data) {
                onScanSuccess(appState, elements, result.data, sessionId);
                return;
            }
        }
    }

    function captureFrame(appState, video, maxEdge) {
        var sourceW = video.videoWidth;
        var sourceH = video.videoHeight;
        if (!sourceW || !sourceH) {
            return null;
        }
        var scale = Math.min(1, maxEdge / Math.max(sourceW, sourceH));
        var width = Math.max(1, Math.floor(sourceW * scale));
        var height = Math.max(1, Math.floor(sourceH * scale));
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
        var imageData = appState.smartCtx.getImageData(0, 0, width, height);
        return { imageData: imageData, width: width, height: height };
    }

    function detectDarkRegionCandidates(imageData, width, height) {
        var pixels = imageData.data;
        var cellSize = Math.max(10, Math.floor(Math.min(width, height) / 28));
        var cols = Math.max(1, Math.floor(width / cellSize));
        var rows = Math.max(1, Math.floor(height / cellSize));
        var darkRatio = new Float32Array(rows * cols);
        var flagged = new Uint8Array(rows * cols);
        var visited = new Uint8Array(rows * cols);
        var stride = width * 4;

        for (var gy = 0; gy < rows; gy += 1) {
            for (var gx = 0; gx < cols; gx += 1) {
                var startX = gx * cellSize, startY = gy * cellSize;
                var endX = Math.min(width, startX + cellSize);
                var endY = Math.min(height, startY + cellSize);
                var samples = 0, dark = 0;
                for (var y = startY; y < endY; y += 2) {
                    var rowOffset = y * stride;
                    for (var x = startX; x < endX; x += 2) {
                        var index = rowOffset + x * 4;
                        var lum = (pixels[index] * 38 + pixels[index + 1] * 75 + pixels[index + 2] * 15) >> 7;
                        samples += 1;
                        if (lum < 90) { dark += 1; }
                    }
                }
                var idx = gy * cols + gx;
                var ratio = samples ? dark / samples : 0;
                darkRatio[idx] = ratio;
                if (ratio > 0.28) { flagged[idx] = 1; }
            }
        }

        var candidates = [];
        var queueX = [], queueY = [];
        for (var gy2 = 0; gy2 < rows; gy2 += 1) {
            for (var gx2 = 0; gx2 < cols; gx2 += 1) {
                var startIdx = gy2 * cols + gx2;
                if (!flagged[startIdx] || visited[startIdx]) { continue; }
                var head = 0;
                queueX.length = 0; queueY.length = 0;
                queueX.push(gx2); queueY.push(gy2);
                visited[startIdx] = 1;
                var minX = gx2, maxX = gx2, minY = gy2, maxY = gy2;
                var cellCount = 0, darkSum = 0;
                while (head < queueX.length) {
                    var cx = queueX[head], cy = queueY[head]; head += 1;
                    var cIdx = cy * cols + cx;
                    cellCount += 1; darkSum += darkRatio[cIdx];
                    minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
                    minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
                    for (var oy = -1; oy <= 1; oy += 1) {
                        for (var ox = -1; ox <= 1; ox += 1) {
                            if (ox === 0 && oy === 0) { continue; }
                            var nx = cx + ox, ny = cy + oy;
                            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) { continue; }
                            var nIdx = ny * cols + nx;
                            if (!flagged[nIdx] || visited[nIdx]) { continue; }
                            visited[nIdx] = 1;
                            queueX.push(nx); queueY.push(ny);
                        }
                    }
                }
                var avgDark = darkSum / Math.max(1, cellCount);
                if (cellCount < 5 || avgDark < 0.3) { continue; }
                var rect = expandToSquare(
                    (minX - 1) * cellSize, (minY - 1) * cellSize,
                    (maxX - minX + 3) * cellSize, (maxY - minY + 3) * cellSize,
                    width, height
                );
                if (!rect) { continue; }
                var aspect = rect.w / rect.h;
                if (aspect < 0.6 || aspect > 1.7) { continue; }
                if (rect.w < 70 || rect.h < 70) { continue; }
                candidates.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, score: cellCount * avgDark });
            }
        }

        candidates.sort(function (a, b) { return b.score - a.score; });
        var deduped = [];
        for (var i = 0; i < candidates.length; i += 1) {
            var current = candidates[i];
            var overlap = false;
            for (var j = 0; j < deduped.length; j += 1) {
                if (rectIoU(current, deduped[j]) > 0.58) { overlap = true; break; }
            }
            if (!overlap) { deduped.push(current); }
            if (deduped.length >= 8) { break; }
        }
        return deduped;
    }

    function expandToSquare(x, y, w, h, maxW, maxH) {
        var cx = x + w / 2, cy = y + h / 2;
        var side = Math.max(w, h) * 1.26, half = side / 2;
        var left = Math.max(0, Math.floor(cx - half));
        var top = Math.max(0, Math.floor(cy - half));
        var right = Math.min(maxW, Math.ceil(cx + half));
        var bottom = Math.min(maxH, Math.ceil(cy + half));
        var rw = right - left, rh = bottom - top;
        if (rw <= 0 || rh <= 0) { return null; }
        return { x: left, y: top, w: rw, h: rh };
    }

    function rectIoU(a, b) {
        var x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
        var x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
        var iw = Math.max(0, x2 - x1), ih = Math.max(0, y2 - y1);
        var inter = iw * ih;
        if (inter <= 0) { return 0; }
        var union = a.w * a.h + b.w * b.h - inter;
        return union > 0 ? inter / union : 0;
    }

    function handleScanFrame(appState, elements, result, error, sessionId) {
        if (result) {
            var text = typeof result.getText === "function" ? result.getText() : String(result.text || result || "");
            if (text) { onScanSuccess(appState, elements, text, sessionId); }
            return;
        }
        if (error) { onScanFailure(appState, elements, error, sessionId); }
    }

    async function onScanSuccess(appState, elements, decodedText, sessionId) {
        if (sessionId !== appState.scanSessionId || appState.handlingScan) {
            return;
        }
        var normalized = String(decodedText || "").trim();
        var remotePeerId = "";
        try {
            remotePeerId = decodePeerSignal(normalized);
        } catch (error) {
            var msg = toErrorMessage(error);
            if (msg.includes("不是 AirCopy Peer 信令")) { return; }
            throttleScanStatus(appState, elements, "扫码识别失败：" + msg);
            return;
        }
        if (remotePeerId === appState.localPeerId) {
            throttleScanStatus(appState, elements, "扫描到了自己的二维码，请扫描对方二维码。");
            return;
        }
        setScanVisualSuccess(appState, elements, true);
        appState.handlingScan = true;
        try {
            await stopScanIfRunning(appState, elements);
            var localPeerId = await appState.ensurePeerReady();
            if (remotePeerId === localPeerId) {
                setStatus(appState, elements, "扫描到了自己的二维码，请扫描对方二维码。");
                return;
            }
            appState.clearRefreshReconnectPending();
            var connectResult = appState.peerManager.connect(remotePeerId);
            if (connectResult && connectResult.reused) {
                appState.handleReusedConnection(remotePeerId, connectResult);
                return;
            }
            setStatus(appState, elements, "扫码成功，正在发起连接…");
            appState.setSessionPanelOpen(false);
        } catch (error) {
            setStatus(appState, elements, "发起连接失败：" + toErrorMessage(error));
        } finally {
            appState.handlingScan = false;
        }
    }

    function onScanFailure(appState, elements, errorText, sessionId) {
        if (sessionId !== appState.scanSessionId) { return; }
        var message = toErrorMessage(errorText);
        if (isIgnorableScanError(errorText, message)) { return; }
        throttleScanStatus(appState, elements, "扫码异常：" + message);
    }

    function isIgnorableScanError(error, message) {
        var raw = String(message || "").trim();
        var normalized = raw.toLowerCase();
        if (!normalized) { return true; }
        if (normalized === "e" || normalized === "undefined" || normalized === "null") { return true; }
        if (normalized.length <= 2 && /^[a-z]$/.test(normalized)) { return true; }
        var benignPatterns = ["notfoundexception", "not found", "checksum", "format", "decode"];
        if (benignPatterns.some(function (token) { return normalized.includes(token); })) { return true; }
        var name = error && error.name ? String(error.name).toLowerCase() : "";
        if (name === "e" || name.includes("notfound")) { return true; }
        return false;
    }

    function throttleScanStatus(appState, elements, text) {
        var now = Date.now();
        if (now - appState.lastScanErrorAt < 1800) { return; }
        appState.lastScanErrorAt = now;
        setStatus(appState, elements, text);
    }

    function getScannerConstraints() {
        var idealSize = Math.max(720, Math.min(1400, Math.floor((window.innerWidth || 360) * 1.8)));
        return { video: { facingMode: { ideal: "environment" }, width: { ideal: idealSize }, height: { ideal: idealSize } }, audio: false };
    }

    function ensureScannerView(elements) {
        var video = elements.reader.querySelector("video");
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

    function renderQr(appState, elements, text) {
        if (!hasQrDependency()) {
            throw new Error("二维码依赖 QRCode 未加载。");
        }
        appState.currentQrText = text;
        elements.qrcode.innerHTML = "";
        var size = Math.min(320, Math.max(260, Math.floor((window.innerWidth || 1000) * 0.32)));
        new QRCode(elements.qrcode, { text: text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
        renderLargeQrIfOpen(appState, elements);
    }

    function openQrModal(appState, elements) {
        if (!appState.currentQrText) {
            setStatus(appState, elements, "当前没有可放大的二维码。");
            return;
        }
        elements.qrModal.classList.remove("hidden");
        renderLargeQrIfOpen(appState, elements);
    }

    function closeQrModal(elements) {
        elements.qrModal.classList.add("hidden");
    }

    function renderLargeQrIfOpen(appState, elements) {
        if (elements.qrModal.classList.contains("hidden") || !appState.currentQrText) { return; }
        if (!hasQrDependency()) { return; }
        elements.qrcodeLarge.innerHTML = "";
        new QRCode(elements.qrcodeLarge, { text: appState.currentQrText, width: 900, height: 900, correctLevel: QRCode.CorrectLevel.M });
    }

    function updateShortcutCodeDisplay(elements, peerId) {
        if (!elements.shortcutCodeText) {
            return "";
        }
        var code = getShortcutCodeFromPeerId(peerId);
        elements.shortcutCodeText.textContent = code || "------";
        elements.shortcutCodeText.classList.toggle("is-empty", !code);
        return code;
    }

    async function connectByShortcutCode(appState, elements, rawCode) {
        var normalizedInput = sanitizeShortcutCodeInput(rawCode, PEER_ID_SHORTCUT_LENGTH);
        if (elements.shortcutCodeInput) {
            elements.shortcutCodeInput.value = normalizedInput;
        }
        if (!normalizedInput) {
            setStatus(appState, elements, "请输入对方快捷码。");
            return false;
        }
        if (normalizedInput.length !== PEER_ID_SHORTCUT_LENGTH) {
            setStatus(appState, elements, "快捷码格式无效，应为 " + getShortcutCodeHint() + "。");
            return false;
        }
        var remotePeerId = "";
        try {
            remotePeerId = createPeerIdFromShortcutCode(normalizedInput);
        } catch (error) {
            setStatus(appState, elements, toErrorMessage(error));
            return false;
        }
        try {
            var localPeerId = await appState.ensurePeerReady();
            updateShortcutCodeDisplay(elements, localPeerId);
            if (remotePeerId === localPeerId) {
                setStatus(appState, elements, "输入的是自己的快捷码，请输入对方快捷码。");
                return false;
            }
            await stopScanIfRunning(appState, elements);
            appState.clearRefreshReconnectPending();
            if (appState.autoReconnectPeers) {
                appState.autoReconnectPeers = {};
            }
            var connectResult = appState.peerManager.connect(remotePeerId);
            if (connectResult && connectResult.reused) {
                appState.clearRefreshReconnectPending();
                if (typeof appState.handleReusedConnection === "function") {
                    appState.handleReusedConnection(remotePeerId, connectResult);
                }
                if (elements.shortcutCodeInput) {
                    elements.shortcutCodeInput.value = "";
                }
                setStatus(appState, elements, "已连接到快捷码 " + normalizedInput + " 对应会话。");
                return true;
            }
            if (elements.shortcutCodeInput) {
                elements.shortcutCodeInput.value = "";
            }
            setStatus(appState, elements, "正在通过快捷码 " + normalizedInput + " 发起连接…");
            appState.setSessionPanelOpen(false);
            return true;
        } catch (error) {
            setStatus(appState, elements, "快捷连入失败：" + toErrorMessage(error));
            return false;
        }
    }

    function setScanVisualSuccess(appState, elements, success) {
        appState.scanVisualSuccess = Boolean(success);
        if (elements.scannerShell) { elements.scannerShell.classList.toggle("scan-success", appState.scanVisualSuccess); }
        if (elements.qrContainer) { elements.qrContainer.classList.toggle("scan-success", appState.scanVisualSuccess); }
    }

    function updateScanButton(appState, elements) {
        elements.scanTrigger.textContent = appState.scannerRunning ? "停止扫码" : "开始扫码";
        if (elements.scannerShell) { elements.scannerShell.classList.toggle("scanning", appState.scannerRunning); }
    }

    function showConnectorScreen(appState, elements) {
        setScanVisualSuccess(appState, elements, false);
        appState.setHeaderMenuOpen(false);
        elements.chatInterface.classList.add("hidden");
        elements.connectionSetup.classList.remove("hidden");
        elements.backToChat.classList.toggle("hidden", !appState.connected);
        document.body.classList.remove("chat-active");
        updateShortcutCodeDisplay(elements, appState.localPeerId);
        var preferred = getPreferredConnectorMode(appState, appState.isMobileLayout ? "scanner" : "qr");
        setMode(appState, elements, preferred, { force: true });
    }

    async function pickCameraDeviceId() {
        try {
            if (window.ZXingBrowser && ZXingBrowser.BrowserCodeReader && typeof ZXingBrowser.BrowserCodeReader.listVideoInputDevices === "function") {
                var cameras = await ZXingBrowser.BrowserCodeReader.listVideoInputDevices();
                if (Array.isArray(cameras) && cameras.length > 0) {
                    var back = cameras.find(function (camera) { return /back|rear|environment|后置/i.test(camera.label || ""); });
                    return (back || cameras[0]).deviceId || (back || cameras[0]).id || null;
                }
            }
        } catch (_error) {}
        return null;
    }

    // Helper: setStatus calls back to appState
    function setStatus(appState, elements, text) {
        if (appState.setStatus) {
            appState.setStatus(text);
        } else {
            var message = String(text || "");
            elements.statusText.textContent = message;
            appendStatusLog(appState, message, "status");
        }
    }

    return {
        setMode: setMode,
        regenerateOffer: regenerateOffer,
        startScan: startScan,
        stopScanIfRunning: stopScanIfRunning,
        openQrModal: openQrModal,
        closeQrModal: closeQrModal,
        renderQr: renderQr,
        updateShortcutCodeDisplay: updateShortcutCodeDisplay,
        connectByShortcutCode: connectByShortcutCode,
        setScanVisualSuccess: setScanVisualSuccess,
        updateScanButton: updateScanButton,
        showConnectorScreen: showConnectorScreen,
        hasScannerDependency: hasScannerDependency,
        hasQrDependency: hasQrDependency
    };
})();
