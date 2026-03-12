/**
 * ui-file-offer.js - File offer modal, transfer progress, voice recording.
 *
 * Depends on: utils.js, storage.js (appendStatusLog), peer-manager.js (via peerManager global)
 */

var UiFileOffer = (function () {

    function onFileInputChanged(event, appState, elements, peerManager, helpers) {
        var input = event && event.target ? event.target : null;
        var files = input && input.files ? input.files : null;
        var file = files && files.length > 0 ? files[0] : null;
        if (!file) {
            return Promise.resolve();
        }
        var transferId = "";
        return Promise.resolve().then(function () {
            helpers.setStatus("等待对方确认接收文件...");
            return peerManager.sendFile(file, { kind: "file" });
        }).then(function (transfer) {
            transferId = transfer.transferId;
            initTransferProgress(appState, elements, {
                transferId: transfer.transferId,
                direction: "send",
                kind: "file",
                fileName: transfer.fileName,
                size: transfer.size,
                mimeType: transfer.mimeType,
                totalChunks: Math.max(1, Math.ceil(file.size / (60 * 1024)))
            });
            return appendAttachmentMessage("me", {
                kind: "file",
                fileName: transfer.fileName,
                mimeType: transfer.mimeType,
                size: transfer.size,
                blob: file
            }, appState, elements, helpers);
        }).then(function () {
            var transfer = { transferId: transferId };
            clearTransferProgress(appState, transferId, "已发送");
            helpers.setStatus("文件已发送：" + (file.name || "未命名文件"));
        }).catch(function (error) {
            if (transferId) {
                clearTransferProgress(appState, transferId, "发送失败");
            }
            helpers.setStatus("文件发送失败：" + toErrorMessage(error));
        }).finally(function () {
            if (input) {
                input.value = "";
            }
        });
    }

    function appendAttachmentMessage(from, payload, appState, elements, helpers) {
        var kind = payload && payload.kind === "voice" ? "voice" : "file";
        var fileName = payload && payload.fileName ? String(payload.fileName) : (kind === "voice" ? "语音" : "文件");
        var size = Math.max(0, Number((payload && payload.size) || 0));
        var mimeType = payload && payload.mimeType ? String(payload.mimeType) : "application/octet-stream";
        var blob = payload && payload.blob ? payload.blob : null;
        var blobUrl = blob ? createObjectUrl(blob, appState) : "";
        return Promise.resolve().then(function () {
            if (kind === "voice" && blob) {
                return getAudioDurationSec(blob);
            }
            return 0;
        }).then(function (durationSec) {
            var text = buildAttachmentText(kind, fileName, size, durationSec);
            helpers.appendMessage(from, text, false, {
                kind: kind,
                fileName: fileName,
                fileSize: size,
                mimeType: mimeType,
                blobUrl: blobUrl,
                durationSec: durationSec
            });
        });
    }

    function buildAttachmentText(kind, fileName, size, durationSec) {
        if (kind === "voice") {
            var durationText = durationSec > 0 ? "，时长 " + formatDuration(durationSec) : "";
            return "语音：" + fileName + (size > 0 ? " (" + formatFileSize(size) + ")" : "") + durationText;
        }
        return "文件：" + fileName + (size > 0 ? " (" + formatFileSize(size) + ")" : "");
    }

    function createObjectUrl(blob, appState) {
        if (!blob || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
            return "";
        }
        var url = URL.createObjectURL(blob);
        appState.objectUrls.push(url);
        return url;
    }

    function releaseObjectUrls(appState) {
        if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") {
            appState.objectUrls = [];
            return;
        }
        while (appState.objectUrls.length > 0) {
            var url = appState.objectUrls.pop();
            try {
                URL.revokeObjectURL(url);
            } catch (_error) {}
        }
    }

    function getAudioDurationSec(blob) {
        if (!blob) {
            return Promise.resolve(0);
        }
        if (!window.AudioContext && !window.webkitAudioContext) {
            return Promise.resolve(0);
        }
        var Ctx = window.AudioContext || window.webkitAudioContext;
        var context = new Ctx();
        return blob.arrayBuffer().then(function (buffer) {
            return context.decodeAudioData(buffer.slice(0));
        }).then(function (audioBuffer) {
            return Math.max(0, Number(audioBuffer.duration || 0));
        }).catch(function () {
            return 0;
        }).finally(function () {
            if (context && typeof context.close === "function") {
                context.close();
            }
        });
    }

    function initTransferProgress(appState, elements, meta) {
        if (!meta || !meta.transferId || appState.transferViews[meta.transferId]) {
            return;
        }
        var div = document.createElement("div");
        div.className = "message " + (meta.direction === "send" ? "me" : "peer") + " file";
        div.dataset.transferId = meta.transferId;

        var timestamp = document.createElement("span");
        timestamp.className = "message-time";
        timestamp.textContent = formatNowHHMM();
        div.appendChild(timestamp);

        var body = document.createElement("span");
        body.className = "message-body";

        var title = document.createElement("span");
        title.textContent = (meta.kind === "voice" ? "语音" : "文件") + "传输中：" + (meta.fileName || "未命名文件");
        body.appendChild(title);

        var progress = document.createElement("progress");
        progress.className = "transfer-progress";
        progress.max = Math.max(1, Number(meta.totalChunks) || 1);
        progress.value = 0;
        body.appendChild(progress);

        var transferMeta = document.createElement("span");
        transferMeta.className = "transfer-meta";
        transferMeta.textContent = "0%";
        body.appendChild(transferMeta);

        var pickTargetBtn = null;
        if (meta.direction === "receive" && window.showSaveFilePicker) {
            pickTargetBtn = document.createElement("button");
            pickTargetBtn.type = "button";
            pickTargetBtn.className = "secondary";
            pickTargetBtn.textContent = "选择写入位置";
            pickTargetBtn.addEventListener("click", function () {
                chooseWritableForIncomingFile({
                    fileName: meta.fileName,
                    mimeType: meta.mimeType || "application/octet-stream"
                }).then(function (writable) {
                    if (!writable) {
                        return;
                    }
                    // peerManager accessed via closure from caller
                    if (meta._peerManager) {
                        meta._peerManager.setIncomingFileWritable(meta.transferId, writable);
                    }
                    transferMeta.textContent = transferMeta.textContent + "，已切换磁盘写入";
                }).catch(function () {
                    // Ignore picker cancellation.
                });
            });
            body.appendChild(pickTargetBtn);
        }

        div.appendChild(body);
        elements.chatMessages.appendChild(div);
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;

        appState.transferViews[meta.transferId] = {
            id: meta.transferId,
            progress: progress,
            transferMeta: transferMeta,
            div: div,
            pickTargetBtn: pickTargetBtn
        };
    }

    function updateTransferProgress(appState, elements, progress) {
        if (!progress || !progress.transferId) {
            return;
        }
        var totalChunks = Math.max(1, Number(progress.totalChunks) || 1);
        var sentChunks = progress.direction === "send"
            ? Math.max(0, Number(progress.sentChunks) || 0)
            : Math.max(0, Number(progress.receivedChunks) || 0);

        if (!appState.transferViews[progress.transferId]) {
            initTransferProgress(appState, elements, {
                transferId: progress.transferId,
                direction: progress.direction,
                kind: progress.kind || "file",
                fileName: progress.fileName || "未命名文件",
                size: progress.size || 0,
                totalChunks: totalChunks
            });
        }
        var view = appState.transferViews[progress.transferId];
        if (!view) {
            return;
        }
        view.progress.max = totalChunks;
        view.progress.value = Math.min(totalChunks, sentChunks);
        var pct = Math.min(100, Math.round((sentChunks / totalChunks) * 100));
        view.transferMeta.textContent = pct + "%";
    }

    function clearTransferProgress(appState, transferId, summaryText) {
        var id = String(transferId || "").trim();
        if (!id || !appState.transferViews[id]) {
            return;
        }
        var view = appState.transferViews[id];
        if (summaryText) {
            view.transferMeta.textContent = summaryText;
        } else {
            view.transferMeta.textContent = "100%";
        }
        view.progress.value = view.progress.max;
        window.setTimeout(function () {
            if (view.div && view.div.parentNode) {
                view.div.parentNode.removeChild(view.div);
            }
        }, 1200);
        delete appState.transferViews[id];
    }

    function clearAllTransferProgress(appState) {
        var ids = Object.keys(appState.transferViews);
        for (var i = 0; i < ids.length; i += 1) {
            clearTransferProgress(appState, ids[i], "已中断");
        }
    }

    function showFileOfferModal(appState, elements) {
        if (!appState.incomingFileOffer) {
            return;
        }
        var offer = appState.incomingFileOffer;
        var kindText = offer.kind === "voice" ? "语音" : "文件";
        elements.fileOfferText.textContent = "对方请求发送" + kindText + "：" + offer.fileName + "（" + formatFileSize(offer.size) + "）";
        elements.fileOfferModal.classList.remove("hidden");
    }

    function closeFileOfferModal(appState, elements) {
        elements.fileOfferModal.classList.add("hidden");
        appState.incomingFileOffer = null;
    }

    function acceptIncomingFileOffer(appState, elements, peerManager, helpers) {
        if (!appState.incomingFileOffer) {
            return Promise.resolve();
        }
        var offer = appState.incomingFileOffer;
        closeFileOfferModal(appState, elements);
        return chooseWritableForIncomingFile(offer).catch(function () {
            return null;
        }).then(function (writable) {
            try {
                peerManager.acceptIncomingFile(offer.transferId, { writable: writable });
                initTransferProgress(appState, elements, {
                    transferId: offer.transferId,
                    direction: "receive",
                    kind: offer.kind,
                    fileName: offer.fileName,
                    size: offer.size,
                    mimeType: offer.mimeType,
                    totalChunks: offer.totalChunks,
                    _peerManager: peerManager
                });
                if (writable) {
                    helpers.setStatus("已选择保存位置，正在写入本地文件...");
                } else {
                    helpers.setStatus("未选择保存位置，先缓存到内存。");
                }
            } catch (error) {
                helpers.setStatus("接收文件失败：" + toErrorMessage(error));
            }
        });
    }

    function rejectIncomingFileOffer(appState, elements, peerManager, helpers) {
        if (!appState.incomingFileOffer) {
            return;
        }
        var offer = appState.incomingFileOffer;
        closeFileOfferModal(appState, elements);
        peerManager.rejectIncomingFile(offer.transferId, "用户拒绝");
        helpers.setStatus("已取消本次文件接收，连接保持不变。");
    }

    function chooseWritableForIncomingFile(offer) {
        if (!window.showSaveFilePicker) {
            return Promise.resolve(null);
        }
        return window.showSaveFilePicker({
            suggestedName: offer.fileName || ("aircopy-" + Date.now()),
            types: [{
                description: "接收文件",
                accept: { [offer.mimeType || "application/octet-stream"]: ["." + guessExt(offer.fileName)] }
            }]
        }).then(function (handle) {
            if (!handle || typeof handle.createWritable !== "function") {
                return null;
            }
            return handle.createWritable();
        }).catch(function () {
            return null;
        });
    }

    function guessExt(fileName) {
        var name = String(fileName || "");
        var idx = name.lastIndexOf(".");
        if (idx <= 0 || idx === name.length - 1) {
            return "bin";
        }
        return name.slice(idx + 1).toLowerCase();
    }

    function saveBlobUrlToDisk(blobUrl, fileName, mimeType, helpers) {
        if (!window.showSaveFilePicker || !blobUrl) {
            return Promise.resolve();
        }
        return fetch(blobUrl).then(function (response) {
            return response.blob();
        }).then(function (blob) {
            return window.showSaveFilePicker({
                suggestedName: fileName || ("aircopy-" + Date.now()),
                types: [{
                    description: "保存文件",
                    accept: { [mimeType || blob.type || "application/octet-stream"]: ["." + guessExt(fileName)] }
                }]
            }).then(function (handle) {
                return handle.createWritable().then(function (writable) {
                    return writable.write(blob).then(function () {
                        return writable.close();
                    });
                });
            });
        });
    }

    // ── Voice recording ──

    function toggleVoiceRecording(appState, elements, peerManager, helpers) {
        if (!helpers.isCurrentConversationConnected()) {
            helpers.setStatus("当前会话未连接，当前无法发送语音。");
            return Promise.resolve();
        }
        if (appState.recordingVoice) {
            return stopVoiceRecording(appState, elements, true);
        }
        return startVoiceRecording(appState, elements, peerManager, helpers);
    }

    function startVoiceRecording(appState, elements, peerManager, helpers) {
        if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            helpers.setStatus("当前浏览器不支持语音录制。");
            return Promise.resolve();
        }
        return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
            var recorder = new MediaRecorder(stream);
            appState.voiceRecorder = recorder;
            appState.voiceStream = stream;
            appState.voiceChunks = [];
            appState.voiceSendAfterStop = true;
            appState.recordingVoice = true;
            updateVoiceButton(appState, elements);
            helpers.setStatus('录音中，再次点击"语音"结束并发送。');

            recorder.ondataavailable = function (event) {
                if (event.data && event.data.size > 0) {
                    appState.voiceChunks.push(event.data);
                }
            };

            recorder.onstop = function () {
                var sendAfterStop = appState.voiceSendAfterStop;
                var chunks = appState.voiceChunks.slice();
                appState.voiceChunks = [];
                appState.recordingVoice = false;
                appState.voiceRecorder = null;
                appState.voiceSendAfterStop = true;
                if (appState.voiceStream) {
                    appState.voiceStream.getTracks().forEach(function (track) { track.stop(); });
                    appState.voiceStream = null;
                }
                updateVoiceButton(appState, elements);
                if (!sendAfterStop || chunks.length === 0) {
                    return;
                }
                var mimeType = recorder.mimeType || "audio/webm";
                var blob = new Blob(chunks, { type: mimeType });
                var fileName = "voice-" + Date.now() + ".webm";
                var transferId = "";
                helpers.setStatus("等待对方确认接收语音...");
                Promise.resolve().then(function () {
                    return peerManager.sendFile(blob, { kind: "voice", fileName: fileName, mimeType: mimeType });
                }).then(function (transfer) {
                    transferId = transfer.transferId;
                    initTransferProgress(appState, elements, {
                        transferId: transfer.transferId,
                        direction: "send",
                        kind: "voice",
                        fileName: transfer.fileName,
                        size: transfer.size,
                        mimeType: transfer.mimeType,
                        totalChunks: Math.max(1, Math.ceil(blob.size / (60 * 1024)))
                    });
                    return appendAttachmentMessage("me", {
                        kind: "voice",
                        fileName: transfer.fileName,
                        mimeType: transfer.mimeType,
                        size: transfer.size,
                        blob: blob
                    }, appState, elements, helpers);
                }).then(function () {
                    clearTransferProgress(appState, transferId, "已发送");
                    helpers.setStatus("语音已发送。");
                }).catch(function (error) {
                    helpers.setStatus("语音发送失败：" + toErrorMessage(error));
                });
            };

            recorder.start(200);
        }).catch(function (error) {
            helpers.setStatus("启动录音失败：" + toErrorMessage(error));
            appState.recordingVoice = false;
            updateVoiceButton(appState, elements);
        });
    }

    function stopVoiceRecording(appState, elements, sendAfterStop) {
        if (!appState.voiceRecorder) {
            return Promise.resolve();
        }
        appState.voiceSendAfterStop = Boolean(sendAfterStop);
        try {
            appState.voiceRecorder.stop();
        } catch (_error) {
            appState.recordingVoice = false;
            updateVoiceButton(appState, elements);
        }
        return Promise.resolve();
    }

    function updateVoiceButton(appState, elements) {
        if (!elements.recordVoice) {
            return;
        }
        elements.recordVoice.textContent = appState.recordingVoice ? "停止录音" : "语音";
    }

    return {
        onFileInputChanged: onFileInputChanged,
        appendAttachmentMessage: appendAttachmentMessage,
        buildAttachmentText: buildAttachmentText,
        createObjectUrl: createObjectUrl,
        releaseObjectUrls: releaseObjectUrls,
        getAudioDurationSec: getAudioDurationSec,
        initTransferProgress: initTransferProgress,
        updateTransferProgress: updateTransferProgress,
        clearTransferProgress: clearTransferProgress,
        clearAllTransferProgress: clearAllTransferProgress,
        showFileOfferModal: showFileOfferModal,
        closeFileOfferModal: closeFileOfferModal,
        acceptIncomingFileOffer: acceptIncomingFileOffer,
        rejectIncomingFileOffer: rejectIncomingFileOffer,
        chooseWritableForIncomingFile: chooseWritableForIncomingFile,
        saveBlobUrlToDisk: saveBlobUrlToDisk,
        toggleVoiceRecording: toggleVoiceRecording,
        startVoiceRecording: startVoiceRecording,
        stopVoiceRecording: stopVoiceRecording,
        updateVoiceButton: updateVoiceButton
    };
})();
