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

    function addCoreTests(runner) {
        runner.addTest("PeerManager 可用", () => {
            assert(typeof PeerManager === "function", "PeerManager 未加载");
            assert(typeof encodePeerSignal === "function", "encodePeerSignal 未加载");
            assert(typeof decodePeerSignal === "function", "decodePeerSignal 未加载");
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
