/**
 * utils.js - Shared utility functions for AirCopy.
 */

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

function formatNowHHMM() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
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

function loadScriptOnce(url, timeoutMs) {
    const SCRIPT_LOAD_TIMEOUT_MS = 4500;
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
