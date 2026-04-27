(function () {
    "use strict";

    const STATUS_TEXT = {
        pending: "等待中",
        running: "进行中",
        pass: "成功",
        fail: "失败"
    };

    function wait(ms) {
        return new Promise((resolve) => {
            window.setTimeout(resolve, ms);
        });
    }

    function assert(condition, message) {
        if (!condition) {
            throw new Error(message || "断言失败");
        }
    }

    function assertEqual(actual, expected, message) {
        if (actual !== expected) {
            throw new Error(message || `断言失败：期望 ${String(expected)}，实际 ${String(actual)}`);
        }
    }

    function assertThrows(fn, messagePart) {
        let thrown = null;
        try {
            fn();
        } catch (error) {
            thrown = error;
        }
        if (!thrown) {
            throw new Error("断言失败：预期抛出异常，但没有抛出");
        }
        if (messagePart && !String(thrown.message || "").includes(messagePart)) {
            throw new Error(`断言失败：异常信息不包含 '${messagePart}'，实际 '${String(thrown.message || "")}'`);
        }
    }

    async function assertRejects(asyncFn, messagePart) {
        let thrown = null;
        try {
            await asyncFn();
        } catch (error) {
            thrown = error;
        }
        if (!thrown) {
            throw new Error("断言失败：预期 Promise reject，但未 reject");
        }
        if (messagePart && !String(thrown.message || "").includes(messagePart)) {
            throw new Error(`断言失败：异常信息不包含 '${messagePart}'，实际 '${String(thrown.message || "")}'`);
        }
    }

    async function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "readonly");
        textarea.style.position = "fixed";
        textarea.style.top = "-1000px";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!ok) {
            throw new Error("浏览器不支持复制到剪贴板");
        }
    }

    function nowText() {
        const date = new Date();
        const h = String(date.getHours()).padStart(2, "0");
        const m = String(date.getMinutes()).padStart(2, "0");
        const s = String(date.getSeconds()).padStart(2, "0");
        return `${h}:${m}:${s}`;
    }

    function createRunner(options) {
        const cfg = options || {};
        const listEl = cfg.listEl;
        const summaryEl = cfg.summaryEl;
        const logsEl = cfg.logsEl;
        const copyBtnEl = cfg.copyBtnEl;

        const state = {
            tests: [],
            logs: [],
            finished: false,
            copyBuilder: null,
            running: false
        };

        function appendLog(text) {
            const line = `[${nowText()}] ${String(text)}`;
            state.logs.push(line);
            if (logsEl) {
                logsEl.textContent = `${state.logs.join("\n")}\n`;
                logsEl.scrollTop = logsEl.scrollHeight;
            }
        }

        function countByStatus(status) {
            return state.tests.filter((item) => item.status === status).length;
        }

        function allFinished() {
            return state.tests.length > 0 && state.tests.every((item) => item.status === "pass" || item.status === "fail");
        }

        function hasRunningLike() {
            return state.tests.some((item) => item.status === "pending" || item.status === "running");
        }

        function hasFail() {
            return state.tests.some((item) => item.status === "fail");
        }

        function allPassed() {
            return state.tests.length > 0 && state.tests.every((item) => item.status === "pass");
        }

        function refreshCopyBtnColor() {
            if (!copyBtnEl) {
                return;
            }
            copyBtnEl.classList.remove("state-running", "state-pass", "state-fail");
            if (hasRunningLike()) {
                copyBtnEl.classList.add("state-running");
                return;
            }
            if (hasFail()) {
                copyBtnEl.classList.add("state-fail");
                return;
            }
            if (allPassed()) {
                copyBtnEl.classList.add("state-pass");
                return;
            }
            copyBtnEl.classList.add("state-running");
        }

        function refreshSummary() {
            if (!summaryEl) {
                return;
            }
            const passCount = countByStatus("pass");
            const failCount = countByStatus("fail");
            const runningCount = countByStatus("running");
            const pendingCount = countByStatus("pending");
            const total = state.tests.length;

            let stageText = "进行中";
            if (allFinished()) {
                stageText = failCount > 0 ? "已完成（有失败）" : "已完成（全部成功）";
            }
            summaryEl.textContent = `状态：${stageText} | 总计：${total} | 成功：${passCount} | 失败：${failCount} | 进行中：${runningCount} | 等待中：${pendingCount}`;
        }

        function renderTestItem(test) {
            if (!listEl) {
                return;
            }
            const li = document.createElement("li");
            li.className = "test-item";

            const name = document.createElement("span");
            name.className = "test-name";
            name.textContent = test.name;

            const status = document.createElement("span");
            status.className = "test-status status-pending";
            status.textContent = STATUS_TEXT.pending;

            li.appendChild(name);
            li.appendChild(status);
            listEl.appendChild(li);

            test._nodes = { li, status };
        }

        function updateTestVisual(test) {
            if (!test._nodes || !test._nodes.status) {
                return;
            }
            const statusNode = test._nodes.status;
            statusNode.className = `test-status status-${test.status}`;
            statusNode.textContent = STATUS_TEXT[test.status] || test.status;
            if (test.status === "fail" && test.error) {
                statusNode.title = test.error;
            }
        }

        function addTest(name, fn) {
            const test = {
                name: String(name || "未命名测试"),
                fn,
                status: "pending",
                error: ""
            };
            state.tests.push(test);
            renderTestItem(test);
            refreshSummary();
            refreshCopyBtnColor();
            return test;
        }

        function setCopyBuilder(builderFn) {
            state.copyBuilder = builderFn;
        }

        function buildReport(options) {
            const cfg = options || {};
            const title = cfg.title || "AirCopy 测试报告";
            const includeLogs = cfg.includeLogs !== false;
            const lines = [];
            lines.push(title);
            lines.push(`生成时间：${new Date().toLocaleString()}`);
            lines.push("");
            lines.push(`总计：${state.tests.length}`);
            lines.push(`成功：${countByStatus("pass")}`);
            lines.push(`失败：${countByStatus("fail")}`);
            lines.push("");
            for (let i = 0; i < state.tests.length; i += 1) {
                const t = state.tests[i];
                const head = `[${String(t.status || "pending").toUpperCase()}] ${t.name}`;
                lines.push(head);
                if (t.error) {
                    lines.push(`  ${t.error}`);
                }
            }
            if (includeLogs) {
                lines.push("");
                lines.push("日志：");
                if (state.logs.length === 0) {
                    lines.push("(无)");
                } else {
                    lines.push(state.logs.join("\n"));
                }
            }
            return lines.join("\n");
        }

        async function handleCopyClick() {
            if (!copyBtnEl) {
                return;
            }
            copyBtnEl.disabled = true;
            try {
                const text = state.copyBuilder
                    ? await state.copyBuilder()
                    : buildReport({ title: "AirCopy 本地测试报告" });
                await copyText(text);
                appendLog("测试日志已复制到剪贴板");
            } catch (error) {
                appendLog(`复制日志失败：${String(error && error.message ? error.message : error)}`);
            } finally {
                copyBtnEl.disabled = false;
            }
        }

        async function run() {
            if (state.running) {
                appendLog("测试正在执行，忽略重复触发");
                return;
            }
            state.running = true;
            appendLog("开始执行测试");
            for (let i = 0; i < state.tests.length; i += 1) {
                const test = state.tests[i];
                test.status = "running";
                test.error = "";
                updateTestVisual(test);
                refreshSummary();
                refreshCopyBtnColor();
                appendLog(`执行：${test.name}`);
                try {
                    await test.fn();
                    test.status = "pass";
                    appendLog(`成功：${test.name}`);
                } catch (error) {
                    test.status = "fail";
                    test.error = String(error && error.message ? error.message : error);
                    appendLog(`失败：${test.name} -> ${test.error}`);
                }
                updateTestVisual(test);
                refreshSummary();
                refreshCopyBtnColor();
            }
            state.running = false;
            state.finished = true;
            appendLog("测试执行结束");
            refreshSummary();
            refreshCopyBtnColor();
        }

        function getState() {
            return state;
        }

        if (copyBtnEl) {
            copyBtnEl.addEventListener("click", () => {
                handleCopyClick();
            });
        }

        return {
            addTest,
            run,
            appendLog,
            setCopyBuilder,
            buildReport,
            getState,
            refreshSummary,
            refreshCopyBtnColor
        };
    }

    function ensureLzStringPolyfill() {
        if (typeof window.LZString !== "undefined") {
            return;
        }

        function utf8ToBase64(str) {
            const bytes = new TextEncoder().encode(str);
            let binary = "";
            for (let i = 0; i < bytes.length; i += 1) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary);
        }

        function base64ToUtf8(b64) {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) {
                bytes[i] = binary.charCodeAt(i);
            }
            return new TextDecoder().decode(bytes);
        }

        window.LZString = {
            compressToEncodedURIComponent(input) {
                return encodeURIComponent(utf8ToBase64(String(input || "")));
            },
            decompressFromEncodedURIComponent(payload) {
                try {
                    return base64ToUtf8(decodeURIComponent(String(payload || "")));
                } catch (_error) {
                    return "";
                }
            }
        };
    }

    function createMockConn(peerId, options) {
        const opts = options || {};
        const handlers = {};
        const conn = {
            peer: String(peerId || "peer-x"),
            open: opts.open !== false,
            metadata: opts.metadata || {},
            peerConnection: opts.peerConnection || null,
            dataChannel: opts.dataChannel || null,
            sent: [],
            closed: false,
            on(eventName, cb) {
                handlers[eventName] = cb;
            },
            emit(eventName, payload) {
                if (typeof handlers[eventName] === "function") {
                    handlers[eventName](payload);
                }
            },
            send(payload) {
                this.sent.push(payload);
            },
            close() {
                this.closed = true;
                this.open = false;
                if (typeof handlers.close === "function") {
                    handlers.close();
                }
            }
        };
        return conn;
    }

    function createMockEventTarget(initialState) {
        const state = initialState || {};
        const listeners = new Map();
        return {
            ...state,
            addEventListener(eventName, cb) {
                const list = listeners.get(eventName) || [];
                list.push(cb);
                listeners.set(eventName, list);
            },
            removeEventListener(eventName, cb) {
                const list = listeners.get(eventName) || [];
                const index = list.indexOf(cb);
                if (index >= 0) {
                    list.splice(index, 1);
                }
                listeners.set(eventName, list);
            },
            emit(eventName) {
                const list = listeners.get(eventName) || [];
                for (let i = 0; i < list.length; i += 1) {
                    list[i]();
                }
            }
        };
    }

    function setDocumentHiddenForTest(hidden) {
        const hadOwnDescriptor = Object.prototype.hasOwnProperty.call(document, "hidden");
        const ownDescriptor = hadOwnDescriptor ? Object.getOwnPropertyDescriptor(document, "hidden") : null;
        Object.defineProperty(document, "hidden", {
            configurable: true,
            value: Boolean(hidden)
        });
        return () => {
            if (hadOwnDescriptor && ownDescriptor) {
                Object.defineProperty(document, "hidden", ownDescriptor);
                return;
            }
            delete document.hidden;
        };
    }

    function createMockPeer(connectImpl) {
        return {
            connectCalls: [],
            connect(target, options) {
                this.connectCalls.push({ target, options });
                if (typeof connectImpl === "function") {
                    return connectImpl(target, options);
                }
                return createMockConn(target);
            },
            destroy() {
                this.destroyed = true;
            }
        };
    }

    function createMockCall(options) {
        const opts = options || {};
        const handlers = {};
        const call = {
            peer: String(opts.peer || "peer-x"),
            metadata: opts.metadata || {},
            closed: false,
            answeredStream: null,
            on(eventName, cb) {
                handlers[eventName] = cb;
            },
            emit(eventName, payload) {
                if (typeof handlers[eventName] === "function") {
                    handlers[eventName](payload);
                }
            },
            answer(stream) {
                this.answeredStream = stream || null;
            },
            close() {
                this.closed = true;
                if (typeof handlers.close === "function") {
                    handlers.close();
                }
            }
        };
        return call;
    }

    function addCoreTests(runner) {
        runner.addTest("PeerManager 可用", () => {
            assert(typeof PeerManager === "function", "PeerManager 未加载");
            assert(typeof encodePeerSignal === "function", "encodePeerSignal 未加载");
            assert(typeof decodePeerSignal === "function", "decodePeerSignal 未加载");
        });

        runner.addTest("UiChat/UiFileOffer 可用", () => {
            assert(typeof UiChat === "object", "UiChat 未加载");
            assert(typeof UiChat.bindFileDrop === "function", "UiChat.bindFileDrop 未加载");
            assert(typeof UiFileOffer === "object", "UiFileOffer 未加载");
            assert(typeof UiFileOffer.sendFiles === "function", "UiFileOffer.sendFiles 未加载");
        });

        runner.addTest("快捷码 peerId 生成与解析可往返", () => {
            const code = generateShortcutCode();
            assert(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/.test(code), "快捷码字符集不正确");
            const peerId = createPeerIdFromShortcutCode(code.toLowerCase());
            assertEqual(peerId, `AirCopy${code}`, "快捷码生成的 peerId 不正确");
            assertEqual(getShortcutCodeFromPeerId(peerId), code, "peerId 解析快捷码失败");
            assertEqual(getShortcutPeerPrefix(), "AirCopy", "快捷码前缀不正确");
        });

        runner.addTest("快捷码输入清洗会去掉易混淆字符", () => {
            assertEqual(sanitizeShortcutCodeInput("ab-0o1ilz2", 6), "ABZ2", "快捷码输入清洗结果错误");
            assertEqual(sanitizeShortcutCodeInput("AirCopyab2cd3", 6), "AB2CD3", "完整 peerId 应能提取为快捷码");
            assertEqual(normalizeShortcutCode("ab2cd3"), "AB2CD3", "快捷码标准化失败");
            assertEqual(normalizeShortcutCode("ab0cd3"), "", "包含禁用字符时不应通过标准化");
        });

        runner.addTest("encodePeerSignal/decodePeerSignal URL 往返", () => {
            const token = `peer-${Date.now()}`;
            const encoded = encodePeerSignal(token);
            const decoded = decodePeerSignal(encoded);
            assertEqual(decoded, token, "URL 编解码结果不一致");
            assert(encoded.includes("pairId="), "编码结果缺少 pairId 参数");
        });

        runner.addTest("decodePeerSignal 兼容前缀格式", () => {
            const decoded = decodePeerSignal("AIRCOPYP1:abc-123");
            assertEqual(decoded, "abc-123", "前缀格式解析失败");
        });

        runner.addTest("decodePeerSignal 对非法输入抛错", () => {
            assertThrows(() => decodePeerSignal("not-a-url"), "不是 AirCopy Peer 信令");
        });

        runner.addTest("PeerManager.connect 参数校验", () => {
            const pm = new PeerManager();
            assertThrows(() => pm.connect("xx"), "尚未初始化");
            pm.peer = createMockPeer();
            pm.localPeerId = "local";
            assertThrows(() => pm.connect(""), "为空");
            assertThrows(() => pm.connect("local"), "不能连接到自己");
        });

        runner.addTest("PeerManager.connect 重用已有连接", () => {
            const pm = new PeerManager();
            pm.peer = createMockPeer();
            pm.localPeerId = "local";
            pm.remoteDisplayName = "old-peer";
            pm.remotePersistentId = "pid-old";
            pm.connection = createMockConn("remote-A", { open: true });
            const reused = pm.connect("remote-A");
            assertEqual(Boolean(reused.reused), true, "应复用已有连接");
            assertEqual(reused.peerName, "old-peer", "复用时应返回已有对端名称");
        });

        runner.addTest("PeerManager.connect 会携带 metadata", () => {
            let capturedOptions = null;
            const pm = new PeerManager();
            pm.displayName = "Tester";
            pm.persistentId = "pid-1";
            pm.localPeerId = "local-1";
            pm.peer = createMockPeer((target, options) => {
                capturedOptions = options;
                return createMockConn(target);
            });
            const result = pm.connect("remote-1", { force: true });
            assertEqual(Boolean(result.reused), false, "force 连接时不应复用");
            assert(capturedOptions && capturedOptions.metadata, "连接参数缺少 metadata");
            assertEqual(capturedOptions.metadata.name, "Tester", "metadata.name 不正确");
            assertEqual(capturedOptions.metadata.pid, "pid-1", "metadata.pid 不正确");
        });

        runner.addTest("PeerManager 忽略失活连接事件", () => {
            const connectedPeerIds = [];
            const received = [];
            const pm = new PeerManager({
                onConnected(info) {
                    connectedPeerIds.push(String(info && info.peerId ? info.peerId : ""));
                },
                onMessage(message) {
                    received.push(message);
                }
            });
            pm.displayName = "Tester";
            pm.persistentId = "pid-2";

            const staleConn = createMockConn("url-peer", { open: false });
            const activeConn = createMockConn("scan-peer", { open: false });
            pm._attachConnection(staleConn, false);
            pm._attachConnection(activeConn, false);

            staleConn.open = true;
            staleConn.emit("open");
            staleConn.emit("data", { t: "text", b: "from-stale" });

            activeConn.open = true;
            activeConn.emit("open");
            activeConn.emit("data", { t: "text", b: "from-active" });

            assertEqual(connectedPeerIds.length, 1, "失活连接不应触发 connected");
            assertEqual(connectedPeerIds[0], "scan-peer", "应只接收当前连接的 open 事件");
            assertEqual(received.length, 1, "失活连接不应触发消息处理");
            assertEqual(received[0].body, "from-active", "应只处理当前连接的数据");
        });

        runner.addTest("PeerManager 心跳超时会关闭连接", () => {
            const closed = [];
            const pm = new PeerManager({
                onConnectionClosed(info) {
                    closed.push(info);
                }
            });
            pm.connection = createMockConn("remote-timeout", { open: true });
            pm.lastHeartbeatReplyAt = Date.now() - (11 * 60 * 1000);

            pm._sendHeartbeat();

            assertEqual(pm.connection, null, "心跳超时后应清空当前连接");
            assertEqual(closed.length, 1, "心跳超时后应触发关闭回调");
            assert(String(closed[0].reason || "").includes("心跳超时"), "关闭原因应包含心跳超时");
        });

        runner.addTest("PeerManager 页面恢复时不会因 RTC disconnected 立即断开", () => {
            const restoreHidden = setDocumentHiddenForTest(true);
            const closed = [];
            try {
                const peerConnection = createMockEventTarget({
                    connectionState: "connected",
                    iceConnectionState: "disconnected"
                });
                const dataChannel = createMockEventTarget({
                    readyState: "open"
                });
                const pm = new PeerManager({
                    onConnectionClosed(info) {
                        closed.push(info);
                    }
                });
                const conn = createMockConn("remote-visibility", {
                    open: false,
                    peerConnection,
                    dataChannel
                });

                pm._attachConnection(conn, false);
                conn.open = true;
                conn.emit("open");

                restoreHidden();
                document.dispatchEvent(new Event("visibilitychange"));

                assertEqual(pm.connection, conn, "切回前台时不应立即清空连接");
                assertEqual(closed.length, 0, "切回前台时不应立即触发关闭回调");
            } finally {
                restoreHidden();
            }
        });

        runner.addTest("PeerManager 检测到底层 RTC failed 不会立刻关闭连接", () => {
            const errors = [];
            const closed = [];
            const peerConnection = createMockEventTarget({
                connectionState: "connected",
                iceConnectionState: "connected"
            });
            const dataChannel = createMockEventTarget({
                readyState: "open"
            });
            const pm = new PeerManager({
                onError(error) {
                    errors.push(error);
                },
                onConnectionClosed(info) {
                    closed.push(info);
                }
            });
            pm.lastHeartbeatReplyAt = Date.now();
            const conn = createMockConn("remote-rtc", {
                open: false,
                peerConnection,
                dataChannel
            });

            pm._attachConnection(conn, false);
            conn.open = true;
            conn.emit("open");
            peerConnection.connectionState = "failed";
            peerConnection.emit("connectionstatechange");

            assertEqual(pm.connection, conn, "RTC failed 后不应立即清空当前连接");
            assertEqual(closed.length, 0, "RTC failed 后不应立即触发关闭回调");
            assertEqual(errors.length, 0, "RTC failed 后不应立即触发错误回调");
        });

        runner.addTest("PeerManager 检测到底层 data closed 会关闭连接", () => {
            const closed = [];
            const peerConnection = createMockEventTarget({
                connectionState: "connected",
                iceConnectionState: "connected"
            });
            const dataChannel = createMockEventTarget({
                readyState: "open"
            });
            const pm = new PeerManager({
                onConnectionClosed(info) {
                    closed.push(info);
                }
            });
            const conn = createMockConn("remote-rtc", {
                open: false,
                peerConnection,
                dataChannel
            });

            pm._attachConnection(conn, false);
            conn.open = true;
            conn.emit("open");
            dataChannel.readyState = "closed";
            dataChannel.emit("close");

            assertEqual(pm.connection, null, "data closed 后应清空当前连接");
            assertEqual(closed.length, 1, "data closed 后应触发关闭回调");
            assert(String(closed[0].reason || "").includes("data:closed"), "关闭原因应包含 data:closed");
        });

        runner.addTest("PeerManager.sendText 封包正确", () => {
            const pm = new PeerManager();
            pm.displayName = "Tester";
            pm.persistentId = "pid-t";
            pm.connection = createMockConn("remote-send", { open: true });
            pm.sendText("hello");
            assertEqual(pm.connection.sent.length, 1, "未发送消息");
            const payload = pm.connection.sent[0];
            assertEqual(payload.t, "text", "消息类型错误");
            assertEqual(payload.b, "hello", "消息内容错误");
            assertEqual(payload.name, "Tester", "name 未写入");
            assertEqual(payload.pid, "pid-t", "pid 未写入");
        });

        runner.addTest("PeerManager 发送失败会统一错误并关闭连接", () => {
            const errors = [];
            const closed = [];
            const pm = new PeerManager({
                onError(error) {
                    errors.push(error);
                },
                onConnectionClosed(info) {
                    closed.push(info);
                }
            });
            const conn = createMockConn("remote-send-fail", { open: true });
            conn.send = () => {
                throw new Error("send failed");
            };
            pm.connection = conn;

            pm._sendIfConnected({ t: "text", b: "hello" });

            assertEqual(errors.length, 1, "发送失败应上报一次错误");
            assertEqual(Boolean(errors[0].handledByConnectionClose), true, "错误应标记为由断链回调接管");
            assertEqual(errors[0].source, "data", "错误来源应标记为 data");
            assertEqual(closed.length, 1, "发送失败后应触发关闭回调");
            assertEqual(closed[0].error, errors[0], "关闭回调应复用同一个错误对象");
            assert(String(closed[0].reason || "").includes("发送失败"), "关闭原因应包含发送失败");
        });

        runner.addTest("PeerManager 收到 call-hangup 会同步结束通话", () => {
            const states = [];
            const pm = new PeerManager({
                onCallState(state) {
                    states.push(state);
                }
            });
            pm.connection = createMockConn("remote-call", { open: true });
            const activeCall = createMockCall({ peer: "remote-call" });
            const incomingCall = createMockCall({ peer: "remote-call" });
            pm.mediaCall = activeCall;
            pm.pendingIncomingCall = incomingCall;

            pm._onData({ t: "call-hangup" });

            assertEqual(pm.connection.sent.length, 0, "收到 call-hangup 后不应回发挂断消息");
            assertEqual(pm.mediaCall, null, "mediaCall 应被清理");
            assertEqual(pm.pendingIncomingCall, null, "pendingIncomingCall 应被清理");
            assertEqual(activeCall.closed, true, "进行中的通话应被关闭");
            assertEqual(incomingCall.closed, true, "待接听通话应被关闭");
            assert(states.length >= 1, "应触发 onCallState");
            assertEqual(states[states.length - 1].state, "idle", "最终状态应为 idle");
        });

        runner.addTest("PeerManager 来电未接听时对端取消会回到 idle", () => {
            const states = [];
            const pm = new PeerManager({
                onCallState(state) {
                    states.push(state);
                }
            });
            pm.connection = createMockConn("remote-call", { open: true });
            const incoming = createMockCall({ peer: "remote-call" });

            pm._onIncomingCall(incoming);
            incoming.close();

            assertEqual(pm.pendingIncomingCall, null, "挂起来电应被清理");
            assert(states.length >= 1, "应触发 onCallState");
            assertEqual(states[states.length - 1].state, "idle", "对端取消后应回到 idle");
        });

        runner.addTest("PeerManager.sendFile 输入校验", async () => {
            const pm = new PeerManager();
            pm.connection = createMockConn("remote-file", { open: true });
            await assertRejects(async () => {
                await pm.sendFile({ notBlob: true });
            }, "文件对象无效");
        });

        runner.addTest("PeerManager._toArrayBuffer 支持 TypedArray", () => {
            const pm = new PeerManager();
            const bytes = new Uint8Array([10, 11, 12]);
            const buffer = pm._toArrayBuffer(bytes);
            assert(buffer instanceof ArrayBuffer, "返回值不是 ArrayBuffer");
            const read = Array.from(new Uint8Array(buffer));
            assertEqual(read.join(","), "10,11,12", "TypedArray 转换结果不正确");
        });

        runner.addTest("PeerManager 文件接收组包与进度", async () => {
            let receivedPayload = null;
            const progressList = [];
            const pm = new PeerManager({
                onFileReceived(payload) {
                    receivedPayload = payload;
                },
                onTransferProgress(progress) {
                    progressList.push(progress);
                }
            });
            pm.connection = createMockConn("remote-file", { open: true });

            pm._onTransferPayload({
                t: "file-start",
                id: "t1",
                kind: "file",
                name: "demo.txt",
                mime: "text/plain",
                size: 3,
                totalChunks: 2
            });
            pm._onTransferPayload({ t: "file-chunk", id: "t1", seq: 0, d: new Uint8Array([97, 98]).buffer });
            pm._onTransferPayload({ t: "file-chunk", id: "t1", seq: 1, d: new Uint8Array([99]).buffer });
            pm._onTransferPayload({ t: "file-end", id: "t1" });

            await wait(0);

            assertEqual(pm.connection.sent.length > 0, true, "未发送文件 ACK");
            assert(receivedPayload !== null, "未触发 onFileReceived");
            assert(receivedPayload.blob instanceof Blob, "接收结果缺少 Blob");
            const text = await receivedPayload.blob.text();
            assertEqual(text, "abc", "组包内容错误");
            assert(progressList.length >= 1, "未上报接收进度");
        });

        runner.addTest("UiFileOffer.sendFiles 会顺序发送拖拽文件", async () => {
            const originalCreateObjectURL = URL.createObjectURL;
            const originalRevokeObjectURL = URL.revokeObjectURL;
            const createdUrls = [];
            URL.createObjectURL = (blob) => {
                const url = `blob:test-${createdUrls.length}`;
                createdUrls.push({ url, blob });
                return url;
            };
            URL.revokeObjectURL = () => {};
            try {
                const sentCalls = [];
                const messages = [];
                const statuses = [];
                const appState = {
                    currentConversationId: "conv-1",
                    conversations: {
                        "conv-1": { peerId: "peer-drop" }
                    },
                    transferViews: {},
                    objectUrls: []
                };
                const elements = {
                    chatMessages: document.createElement("div")
                };
                const helpers = {
                    setStatus(text) {
                        statuses.push(String(text || ""));
                    },
                    appendMessage(from, text, isSystem, options) {
                        messages.push({ from, text, isSystem, options });
                    },
                    isCurrentConversationConnected() {
                        return true;
                    }
                };
                const peerManager = {
                    sendFile(peerId, file, options) {
                        sentCalls.push({ peerId, file, options });
                        return Promise.resolve({
                            transferId: `tx-${sentCalls.length}`,
                            fileName: file.name,
                            mimeType: file.type,
                            size: file.size
                        });
                    }
                };
                const files = [
                    new File(["abc"], "demo-a.txt", { type: "text/plain" }),
                    new File(["xyz"], "demo-b.txt", { type: "text/plain" })
                ];

                await UiFileOffer.sendFiles(files, appState, elements, peerManager, helpers);

                assertEqual(sentCalls.length, 2, "应顺序发送两个文件");
                assertEqual(sentCalls[0].peerId, "peer-drop", "应使用当前会话 peerId");
                assertEqual(sentCalls[1].file.name, "demo-b.txt", "第二个文件未继续发送");
                assertEqual(messages.length, 2, "每个文件都应追加附件消息");
                assert(String(statuses[statuses.length - 1] || "").includes("demo-b.txt"), "最终状态应包含最后一个文件名");
            } finally {
                URL.createObjectURL = originalCreateObjectURL;
                URL.revokeObjectURL = originalRevokeObjectURL;
            }
        });

        runner.addTest("UiChat.bindFileDrop 会接收文件拖拽", () => {
            const dropZone = document.createElement("div");
            const appState = {
                currentConversationId: "conv-1",
                conversations: {
                    "conv-1": { peerId: "peer-drop" }
                },
                connected: true
            };
            const elements = {
                chatInputArea: dropZone
            };
            const droppedFiles = [];
            UiChat.bindFileDrop(appState, elements, {
                onDropFiles(files) {
                    droppedFiles.push.apply(droppedFiles, files);
                }
            });

            const file = new File(["drag-demo"], "drag-demo.txt", { type: "text/plain" });
            const dragEnterEvent = new Event("dragenter", { bubbles: true, cancelable: true });
            Object.defineProperty(dragEnterEvent, "dataTransfer", {
                configurable: true,
                value: { types: ["Files"], files: [file] }
            });
            dropZone.dispatchEvent(dragEnterEvent);
            assert(dropZone.classList.contains("file-drop-active"), "拖入文件时应高亮聊天框");

            const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
            Object.defineProperty(dropEvent, "dataTransfer", {
                configurable: true,
                value: { types: ["Files"], files: [file] }
            });
            dropZone.dispatchEvent(dropEvent);

            assertEqual(droppedFiles.length, 1, "拖拽文件后应触发发送回调");
            assertEqual(droppedFiles[0].name, "drag-demo.txt", "拖拽得到的文件名不正确");
            assert(!dropZone.classList.contains("file-drop-active"), "放下文件后应取消高亮");
        });

        runner.addTest("UiConnector.connectByShortcutCode 会补 AirCopy 前缀连接", async () => {
            const statuses = [];
            let connectedPeerId = "";
            const elements = {
                statusText: document.createElement("p"),
                shortcutCodeText: document.createElement("strong"),
                shortcutCodeInput: document.createElement("input")
            };
            const appState = {
                peerManager: {
                    connect(peerId) {
                        connectedPeerId = peerId;
                        return { reused: false, peerId };
                    }
                },
                ensurePeerReady() {
                    return Promise.resolve("AirCopyZXCVBN");
                },
                clearRefreshReconnectPending() {},
                setSessionPanelOpen() {},
                setStatus(text) {
                    statuses.push(String(text || ""));
                }
            };

            const ok = await UiConnector.connectByShortcutCode(appState, elements, "ab2cd3");

            assertEqual(ok, true, "快捷码连接应成功发起");
            assertEqual(connectedPeerId, "AirCopyAB2CD3", "快捷码应补全 AirCopy 前缀");
            assertEqual(elements.shortcutCodeText.textContent, "ZXCVBN", "应同步展示本端快捷码");
            assertEqual(elements.shortcutCodeInput.value, "", "发起连接后应清空输入框");
            assert(String(statuses[statuses.length - 1] || "").includes("AB2CD3"), "状态提示应包含快捷码");
        });

        runner.addTest("WebRTCManager 可用", () => {
            assert(typeof WebRTCManager === "function", "WebRTCManager 未加载");
            assert(typeof encodeSignal === "function", "encodeSignal 未加载");
            assert(typeof decodeSignal === "function", "decodeSignal 未加载");
            assert(typeof uint8ToBase64Url === "function", "uint8ToBase64Url 未加载");
            assert(typeof base64UrlToUint8 === "function", "base64UrlToUint8 未加载");
        });

        runner.addTest("WebRTCManager.sendText 连接校验", () => {
            const manager = new WebRTCManager();
            assertThrows(() => manager.sendText("x"), "数据通道未连接");

            let sent = "";
            manager.dataChannel = {
                readyState: "open",
                send(payload) {
                    sent = payload;
                }
            };
            manager.sendText("hello");
            const parsed = JSON.parse(sent);
            assertEqual(parsed.t, "text", "sendText 封包类型错误");
            assertEqual(parsed.b, "hello", "sendText 内容错误");
        });

        runner.addTest("WebRTCManager._compactSdp 过滤候选", () => {
            const manager = new WebRTCManager();
            const rawSdp = [
                "v=0",
                "m=application 9 DTLS/SCTP 5000",
                "a=candidate:1 1 udp 2122260223 10.0.0.1 5000 typ host",
                "a=candidate:2 1 udp 2122260223 10.0.0.2 5001 typ host",
                "a=candidate:3 1 udp 1686052607 203.0.113.1 6000 typ srflx",
                "a=candidate:4 1 tcp 1518280447 10.0.0.3 9 typ host tcptype active",
                ""
            ].join("\r\n");

            const compacted = manager._compactSdp(rawSdp);
            assert(compacted.includes("typ srflx"), "应保留 srflx candidate");
            assert(compacted.includes("10.0.0.1"), "应保留第一个 host candidate");
            assert(!compacted.includes("10.0.0.2"), "应移除重复 host candidate");
            assert(!compacted.includes(" tcptype active"), "应移除 tcp candidate");
        });

        runner.addTest("WebRTC 信令 encode/decode 往返", () => {
            ensureLzStringPolyfill();
            const signal = { t: "offer", s: "v=0\r\n...", n: "tester" };
            const encoded = encodeSignal(signal);
            assert(encoded.startsWith("AIRCOPY1:"), "编码结果缺少 AirCopy 前缀");
            const decoded = decodeSignal(encoded);
            assertEqual(decoded.t, "offer", "解码 t 错误");
            assertEqual(decoded.s, "v=0\r\n...", "解码 s 错误");
            assertEqual(decoded.n, "tester", "解码 n 错误");
        });

        runner.addTest("decodeSignal 对非法前缀抛错", () => {
            ensureLzStringPolyfill();
            assertThrows(() => decodeSignal("invalid"), "不是 AirCopy 信令");
        });

        runner.addTest("base64Url 编解码往返", () => {
            const source = new Uint8Array([1, 2, 3, 254, 255]);
            const encoded = uint8ToBase64Url(source);
            const decoded = base64UrlToUint8(encoded);
            assertEqual(Array.from(decoded).join(","), Array.from(source).join(","), "base64Url 往返不一致");
        });
    }

    function setupStandaloneIfNeeded() {
        const body = document.body;
        const mode = body ? body.getAttribute("data-test-mode") : "";
        if (mode !== "single") {
            return;
        }

        const runner = createRunner({
            listEl: document.getElementById("test-list"),
            summaryEl: document.getElementById("test-summary"),
            logsEl: document.getElementById("test-logs"),
            copyBtnEl: document.getElementById("copy-logs-btn")
        });

        addCoreTests(runner);
        runner.run();
    }

    window.AirCopyTestKit = {
        createRunner,
        addCoreTests,
        wait,
        copyText
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", setupStandaloneIfNeeded, { once: true });
    } else {
        setupStandaloneIfNeeded();
    }
})();
