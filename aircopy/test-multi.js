(function () {
    "use strict";

    if (!document.body || document.body.getAttribute("data-test-mode") !== "multi") {
        return;
    }

    if (!window.AirCopyTestKit) {
        // 退化处理：页面上给出可见日志
        const fallback = document.getElementById("test-logs");
        if (fallback) {
            fallback.textContent = "AirCopyTestKit 未加载，无法运行测试。\n";
        }
        return;
    }

    const CMD_PREFIX = "AIRTESTV1:";
    const CONNECT_TIMEOUT_MS = 120000;
    const CONNECT_RETRY_INTERVAL_MS = 3000;
    const CONNECT_RETRY_MAX = 30;
    const PING_TIMEOUT_MS = 8000;
    const REMOTE_LOG_TIMEOUT_MS = 8000;

    const elements = {
        pairingPanel: document.getElementById("pairing-panel"),
        qrcode: document.getElementById("qrcode"),
        localPeerId: document.getElementById("local-peer-id"),
        pairUrl: document.getElementById("pair-url"),
        connStatus: document.getElementById("conn-status")
    };

    const runner = window.AirCopyTestKit.createRunner({
        listEl: document.getElementById("test-list"),
        summaryEl: document.getElementById("test-summary"),
        logsEl: document.getElementById("test-logs"),
        copyBtnEl: document.getElementById("copy-logs-btn")
    });

    let peerManager = null;
    let localPeerId = "";
    let remotePeerId = "";
    let connected = false;

    const pendingPings = new Map();
    const pendingLogRequests = new Map();

    const connectionDeferred = createDeferred();

    function createDeferred() {
        const box = {
            settled: false,
            resolve: null,
            reject: null,
            promise: null
        };
        box.promise = new Promise((resolve, reject) => {
            box.resolve = (value) => {
                if (box.settled) {
                    return;
                }
                box.settled = true;
                resolve(value);
            };
            box.reject = (error) => {
                if (box.settled) {
                    return;
                }
                box.settled = true;
                reject(error);
            };
        });
        return box;
    }

    function setConnStatus(text, tone) {
        if (!elements.connStatus) {
            return;
        }
        const toneClass = tone || "wait";
        elements.connStatus.className = `status-line ${toneClass}`;
        elements.connStatus.textContent = String(text || "");
    }

    function randomId(prefix) {
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function getPairIdFromUrl() {
        try {
            const url = new URL(window.location.href);
            return String(url.searchParams.get("pairId") || url.searchParams.get("peerId") || "").trim();
        } catch (_error) {
            return "";
        }
    }

    function buildPairUrl(peerId) {
        const url = new URL(window.location.href);
        url.searchParams.delete("peerId");
        url.searchParams.set("pairId", peerId);
        return url.toString();
    }

    function renderQrCode(urlText) {
        if (!elements.qrcode) {
            return;
        }
        elements.qrcode.innerHTML = "";
        if (typeof window.QRCode === "function") {
            new window.QRCode(elements.qrcode, {
                text: urlText,
                width: 220,
                height: 220,
                correctLevel: window.QRCode.CorrectLevel ? window.QRCode.CorrectLevel.M : 0
            });
            return;
        }
        elements.qrcode.textContent = "二维码库未加载，请复制下方链接手动打开";
    }

    function updatePairingUi() {
        if (elements.localPeerId) {
            elements.localPeerId.textContent = localPeerId || "初始化中...";
        }
        const pairUrl = localPeerId ? buildPairUrl(localPeerId) : "";
        if (elements.pairUrl) {
            elements.pairUrl.textContent = pairUrl || "初始化中...";
            elements.pairUrl.href = pairUrl || "#";
        }
        if (pairUrl) {
            renderQrCode(pairUrl);
        }
    }

    function showConnectedLayout() {
        if (elements.pairingPanel) {
            elements.pairingPanel.classList.add("hidden");
        }
    }

    function showPairingLayout() {
        if (elements.pairingPanel) {
            elements.pairingPanel.classList.remove("hidden");
        }
    }

    function clearPendingMapsOnDisconnect(reason) {
        const msg = String(reason || "连接已断开");
        pendingPings.forEach((pending) => {
            window.clearTimeout(pending.timer);
            pending.reject(new Error(msg));
        });
        pendingPings.clear();

        pendingLogRequests.forEach((pending) => {
            window.clearTimeout(pending.timer);
            pending.reject(new Error(msg));
        });
        pendingLogRequests.clear();
    }

    function sendCommand(type, data) {
        if (!peerManager || !connected) {
            throw new Error("当前未连接到对端");
        }
        const packet = {
            type: String(type || ""),
            data: data || {},
            ts: Date.now(),
            fromPeerId: localPeerId
        };
        peerManager.sendText(`${CMD_PREFIX}${JSON.stringify(packet)}`);
    }

    async function waitForConnection(timeoutMs) {
        if (connected) {
            return;
        }
        const timeout = Number(timeoutMs) || CONNECT_TIMEOUT_MS;
        await Promise.race([
            connectionDeferred.promise,
            window.AirCopyTestKit.wait(timeout).then(() => {
                throw new Error(`等待连接超时（>${Math.round(timeout / 1000)} 秒）`);
            })
        ]);
    }

    async function pingRemote() {
        await waitForConnection(CONNECT_TIMEOUT_MS);
        const nonce = randomId("ping");
        return new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => {
                pendingPings.delete(nonce);
                reject(new Error("等待对端 pong 超时"));
            }, PING_TIMEOUT_MS);

            pendingPings.set(nonce, {
                timer,
                resolve,
                reject
            });

            try {
                sendCommand("ping", { nonce });
            } catch (error) {
                window.clearTimeout(timer);
                pendingPings.delete(nonce);
                reject(error);
            }
        });
    }

    async function requestRemoteReport() {
        await waitForConnection(CONNECT_TIMEOUT_MS);
        const requestId = randomId("log");
        return new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => {
                pendingLogRequests.delete(requestId);
                reject(new Error("等待对端日志响应超时"));
            }, REMOTE_LOG_TIMEOUT_MS);

            pendingLogRequests.set(requestId, {
                timer,
                resolve,
                reject
            });

            try {
                sendCommand("logs-request", { requestId });
            } catch (error) {
                window.clearTimeout(timer);
                pendingLogRequests.delete(requestId);
                reject(error);
            }
        });
    }

    function parseCommandFromMessage(message) {
        if (!message || message.type !== "text") {
            return null;
        }
        const body = String(message.body || "");
        if (!body.startsWith(CMD_PREFIX)) {
            return null;
        }
        const json = body.slice(CMD_PREFIX.length);
        try {
            return JSON.parse(json);
        } catch (_error) {
            runner.appendLog("收到无法解析的协同消息");
            return null;
        }
    }

    function handlePeerCommand(packet) {
        if (!packet || typeof packet !== "object") {
            return;
        }
        const type = String(packet.type || "");
        const data = packet.data && typeof packet.data === "object" ? packet.data : {};

        if (type === "ping") {
            const nonce = String(data.nonce || "");
            try {
                sendCommand("pong", { nonce });
            } catch (error) {
                runner.appendLog(`回复 pong 失败：${String(error.message || error)}`);
            }
            return;
        }

        if (type === "pong") {
            const nonce = String(data.nonce || "");
            const pending = pendingPings.get(nonce);
            if (!pending) {
                return;
            }
            window.clearTimeout(pending.timer);
            pendingPings.delete(nonce);
            pending.resolve();
            return;
        }

        if (type === "logs-request") {
            const requestId = String(data.requestId || "");
            if (!requestId) {
                return;
            }
            const report = runner.buildReport({ title: `AirCopy 对端测试报告（${localPeerId || "unknown"}）` });
            try {
                sendCommand("logs-response", {
                    requestId,
                    report
                });
            } catch (error) {
                runner.appendLog(`回复日志失败：${String(error.message || error)}`);
            }
            return;
        }

        if (type === "logs-response") {
            const requestId = String(data.requestId || "");
            const report = String(data.report || "");
            const pending = pendingLogRequests.get(requestId);
            if (!pending) {
                return;
            }
            window.clearTimeout(pending.timer);
            pendingLogRequests.delete(requestId);
            pending.resolve(report);
        }
    }

    async function buildCombinedReport() {
        const localTitle = `AirCopy 本端测试报告（${localPeerId || "unknown"}）`;
        const localReport = runner.buildReport({ title: localTitle });

        if (!connected) {
            return `${localReport}\n\n===== 对端测试报告 =====\n当前未连接，无法获取。`;
        }

        try {
            const remoteReport = await requestRemoteReport();
            return `${localReport}\n\n===== 对端测试报告（${remotePeerId || "unknown"}） =====\n${remoteReport}`;
        } catch (error) {
            return `${localReport}\n\n===== 对端测试报告 =====\n获取失败：${String(error.message || error)}`;
        }
    }

    async function tryAutoConnect(targetPeerId) {
        const target = String(targetPeerId || "").trim();
        if (!target || !peerManager) {
            return;
        }

        for (let i = 1; i <= CONNECT_RETRY_MAX; i += 1) {
            if (connected) {
                return;
            }
            try {
                const result = peerManager.connect(target, { force: i > 1 });
                runner.appendLog(`发起连接尝试 #${i} -> ${target}（reused=${Boolean(result && result.reused)}）`);
            } catch (error) {
                runner.appendLog(`连接尝试 #${i} 失败：${String(error.message || error)}`);
            }
            await window.AirCopyTestKit.wait(CONNECT_RETRY_INTERVAL_MS);
        }

        if (!connected) {
            setConnStatus("自动连接仍未成功，请重新扫码", "fail");
        }
    }

    function setupPeerManagerHandlers() {
        peerManager = new PeerManager({
            onConnected(info) {
                connected = true;
                remotePeerId = info && info.peerId ? String(info.peerId) : remotePeerId;
                showConnectedLayout();
                setConnStatus(`连接成功：${remotePeerId || "未知对端"}`, "ok");
                runner.appendLog(`连接成功，peerId=${remotePeerId || "unknown"}`);
                connectionDeferred.resolve();
            },
            onConnectionClosed(info) {
                connected = false;
                const reason = info && info.reason ? String(info.reason) : "连接断开";
                runner.appendLog(`连接断开：${reason}`);
                clearPendingMapsOnDisconnect(reason);
                showPairingLayout();
                setConnStatus(`连接断开：${reason}`, "fail");
            },
            onError(error) {
                runner.appendLog(`Peer 错误：${String(error && error.message ? error.message : error)}`);
            },
            onMessage(message) {
                const packet = parseCommandFromMessage(message);
                if (!packet) {
                    return;
                }
                handlePeerCommand(packet);
            }
        });
    }

    async function initPeer() {
        if (typeof PeerManager !== "function") {
            throw new Error("PeerManager 未加载");
        }
        if (typeof window.Peer !== "function") {
            throw new Error("PeerJS 未加载（window.Peer 不存在）");
        }

        setupPeerManagerHandlers();

        const displayName = `tester-${Math.random().toString(36).slice(2, 8)}`;
        localPeerId = await peerManager.init(displayName);
        updatePairingUi();
        runner.appendLog(`本端 Peer 初始化完成：${localPeerId}`);
        setConnStatus("已生成二维码，等待扫码连接", "wait");

        const targetPeerId = getPairIdFromUrl();
        if (!targetPeerId) {
            runner.appendLog("未检测到 pairId，等待对端主动连入");
            return;
        }

        if (targetPeerId === localPeerId) {
            runner.appendLog("URL 中 pairId 与本端 peerId 相同，跳过自动连接");
            return;
        }

        runner.appendLog(`检测到 pairId=${targetPeerId}，开始自动连接`);
        setConnStatus(`检测到 pairId，尝试连接 ${targetPeerId}`, "wait");
        tryAutoConnect(targetPeerId);
    }

    function addCollaborativeTests() {
        runner.addTest("双端连接建立", async () => {
            await waitForConnection(CONNECT_TIMEOUT_MS);
        });

        runner.addTest("双端 Ping 往返", async () => {
            await pingRemote();
        });
    }

    function bootstrap() {
        window.AirCopyTestKit.addCoreTests(runner);
        addCollaborativeTests();
        runner.setCopyBuilder(buildCombinedReport);

        runner.appendLog("协同测试页面已加载，开始执行测试队列");
        runner.run();

        initPeer()
            .catch((error) => {
                setConnStatus(`初始化失败：${String(error && error.message ? error.message : error)}`, "fail");
                runner.appendLog(`初始化失败：${String(error && error.message ? error.message : error)}`);
            });
    }

    bootstrap();
})();
