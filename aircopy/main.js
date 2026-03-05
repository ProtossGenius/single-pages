(function () {
    const appState = {
        mode: "qr",
        scannerRunning: false,
        handlingScan: false,
        scanSessionId: 0,
        currentQrText: "",
        lastScanErrorAt: 0,
        scanControls: null,
        localPeerId: "",
        modeTask: Promise.resolve(),
        scannerTask: Promise.resolve()
    };

    const elements = {
        connectionSetup: document.getElementById("connection-setup"),
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
        qrModal: document.getElementById("qr-modal"),
        qrModalClose: document.getElementById("qr-modal-close"),
        qrcodeLarge: document.getElementById("qrcode-large"),
        displayName: document.getElementById("display-name"),
        statusText: document.getElementById("status-text"),
        chatMessages: document.getElementById("chat-messages"),
        messageInput: document.getElementById("message-input"),
        sendBtn: document.getElementById("send-btn"),
        exitChat: document.getElementById("exit-chat")
    };

    const peerManager = new PeerManager({
        onLocalId: (id) => {
            appState.localPeerId = id;
        },
        onConnected: () => {
            enterChatInterface();
            setStatus("连接成功。");
        },
        onConnectionClosed: () => {
            appendMessage("system", "连接已断开。", true);
            setStatus("连接已断开，可重新扫码连接。");
        },
        onError: (error) => {
            setStatus(`连接异常：${toErrorMessage(error)}`);
        },
        onMessage: (message) => {
            appendMessage(message.from, message.body, message.type === "hello");
        },
        onStateChange: (state) => {
            if (state === "disconnected") {
                setStatus("Peer 服务连接断开，尝试刷新二维码重连。");
            }
        }
    });

    const codeReader = new ZXingBrowser.BrowserQRCodeReader();

    init();

    function init() {
        const seed = Math.floor(Math.random() * 9000 + 1000);
        elements.displayName.value = `用户_${seed}`;
        peerManager.setDisplayName(getDisplayName());
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

        elements.enlargeQr.addEventListener("click", openQrModal);
        elements.qrcode.addEventListener("dblclick", openQrModal);
        elements.qrModalClose.addEventListener("click", closeQrModal);
        elements.qrModal.addEventListener("click", (event) => {
            if (event.target === elements.qrModal) {
                closeQrModal();
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closeQrModal();
            }
        });

        elements.sendBtn.addEventListener("click", sendCurrentMessage);
        elements.exitChat.addEventListener("click", resetToSetup);
        elements.messageInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendCurrentMessage();
            }
        });

        const isMobile = /Android|webOS|iPhone|iPod|iPad|Mobile/i.test(navigator.userAgent);
        setMode(isMobile ? "scanner" : "qr", { force: true });
    }

    function setMode(mode, options = {}) {
        appState.modeTask = appState.modeTask.then(async () => {
            if (!options.force && mode === appState.mode) {
                return;
            }

            appState.mode = mode;
            const isQr = mode === "qr";
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
                setStatus("已切到扫码模式，点击“开始扫码”后扫描对方二维码即可连接。");
            }
            updateScanButton();
        }).catch((error) => {
            setStatus(`模式切换失败：${toErrorMessage(error)}`);
        });

        return appState.modeTask;
    }

    async function ensurePeerReady() {
        if (appState.localPeerId) {
            return appState.localPeerId;
        }
        const id = await peerManager.init(getDisplayName());
        appState.localPeerId = id;
        return id;
    }

    async function regenerateOffer() {
        if (appState.mode !== "qr") {
            return;
        }
        try {
            setStatus("正在初始化 Peer 节点并生成二维码…");
            const peerId = await ensurePeerReady();
            const encoded = encodePeerSignal(peerId);
            renderQr(encoded);
            setStatus(`请让对方扫码该二维码（长度 ${encoded.length}）。扫码后将直接发起连接。`);
        } catch (error) {
            setStatus(`生成二维码失败：${toErrorMessage(error)}`);
        }
    }

    function startScan() {
        appState.scannerTask = appState.scannerTask.then(async () => {
            if (appState.mode !== "scanner" || appState.scannerRunning) {
                return;
            }
            if (!window.isSecureContext) {
                setStatus(`当前不是安全上下文，无法调用摄像头。请使用 https 或 localhost。当前地址：${window.location.origin}`);
                return;
            }
            try {
                await ensurePeerReady();
                appState.scanSessionId += 1;
                const sessionId = appState.scanSessionId;
                setStatus("正在启动摄像头…");
                const readerView = ensureScannerView();
                const deviceId = await pickCameraDeviceId();
                const scanPromise = deviceId
                    ? codeReader.decodeFromVideoDevice(
                        deviceId,
                        readerView,
                        (result, error) => handleScanFrame(result, error, sessionId)
                    )
                    : codeReader.decodeFromConstraints(
                        getScannerConstraints(),
                        readerView,
                        (result, error) => handleScanFrame(result, error, sessionId)
                    );

                appState.scanControls = await scanPromise;
                appState.scannerRunning = true;
                updateScanButton();
                setStatus("摄像头已开启，正在识别二维码…");
            } catch (error) {
                appState.scannerRunning = false;
                appState.scanControls = null;
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
                if (typeof codeReader.reset === "function") {
                    codeReader.reset();
                }
            } catch (_error) {
                // Ignore stop errors when scanner is already closed.
            }
            appState.scannerRunning = false;
            appState.scanControls = null;
            updateScanButton();
        });
        return appState.scannerTask;
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

        appState.handlingScan = true;
        try {
            await stopScanIfRunning();
            setStatus("已识别 peerId，正在发起连接…");
            peerManager.connect(remotePeerId);
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
        elements.qrcodeLarge.innerHTML = "";
        new QRCode(elements.qrcodeLarge, {
            text: appState.currentQrText,
            width: 900,
            height: 900,
            correctLevel: QRCode.CorrectLevel.M
        });
    }

    function updateScanButton() {
        elements.scanTrigger.textContent = appState.scannerRunning ? "停止扫码" : "开始扫码";
        if (elements.scannerShell) {
            elements.scannerShell.classList.toggle("scanning", appState.scannerRunning);
        }
    }

    function enterChatInterface() {
        closeQrModal();
        elements.connectionSetup.classList.add("hidden");
        elements.chatInterface.classList.remove("hidden");
        if (!elements.chatMessages.dataset.inited) {
            elements.chatMessages.dataset.inited = "1";
            appendMessage("system", "连接成功：hello world", true);
        }
    }

    function appendMessage(from, text, isSystem = false) {
        const div = document.createElement("div");
        div.className = "message";
        if (isSystem || from === "system") {
            div.classList.add("system");
        } else if (from === "me") {
            div.classList.add("me");
        } else {
            div.classList.add("peer");
        }
        div.textContent = text;
        elements.chatMessages.appendChild(div);
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    }

    function sendCurrentMessage() {
        const text = elements.messageInput.value.trim();
        if (!text) {
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
        closeQrModal();
        await stopScanIfRunning();
        peerManager.destroy();
        appState.localPeerId = "";
        appState.currentQrText = "";
        appState.handlingScan = false;
        elements.chatMessages.innerHTML = "";
        delete elements.chatMessages.dataset.inited;
        elements.chatInterface.classList.add("hidden");
        elements.connectionSetup.classList.remove("hidden");
        await setMode("qr", { force: true });
        setStatus("已退出会话，请重新扫码连接。");
    }

    function getDisplayName() {
        const name = elements.displayName.value.trim();
        return name || "匿名用户";
    }

    function setStatus(text) {
        elements.statusText.textContent = text;
    }

    async function pickCameraDeviceId() {
        try {
            if (ZXingBrowser.BrowserCodeReader && typeof ZXingBrowser.BrowserCodeReader.listVideoInputDevices === "function") {
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

    window.addEventListener("beforeunload", () => {
        closeQrModal();
        stopScanIfRunning();
        peerManager.destroy();
    });
})();
