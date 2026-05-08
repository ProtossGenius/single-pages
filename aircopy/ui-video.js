/**
 * ui-video.js - Video modal, video call controls, playback helpers.
 *
 * Depends on: utils.js, peer-manager.js (via peerManager global)
 */

var UiVideo = (function () {
    function syncVideoPrefForCurrentPeer(appState, elements) {
        setVideoControlDefaults(elements);
        applyLocalMediaTrackToggles(elements);
    }

    function onVideoShowToggleChanged(elements) {
        applyLocalMediaTrackToggles(elements);
    }

    function onVideoMuteToggleChanged(elements) {
        applyLocalMediaTrackToggles(elements);
    }

    function setVideoControlDefaults(elements) {
        if (elements.videoSourceSelect) {
            elements.videoSourceSelect.value = "camera";
        }
        if (elements.videoShowToggle) {
            elements.videoShowToggle.checked = true;
        }
        if (elements.videoMuteToggle) {
            elements.videoMuteToggle.checked = false;
        }
    }

    function applyLocalMediaTrackToggles(elements) {
        var stream = elements.localVideo ? elements.localVideo.srcObject : null;
        if (!stream || typeof stream.getTracks !== "function") {
            return;
        }
        var showVideo = Boolean(elements.videoShowToggle && elements.videoShowToggle.checked);
        var muteAudio = Boolean(elements.videoMuteToggle && elements.videoMuteToggle.checked);
        var videoTracks = typeof stream.getVideoTracks === "function" ? stream.getVideoTracks() : [];
        for (var i = 0; i < videoTracks.length; i += 1) {
            videoTracks[i].enabled = showVideo;
        }
        var audioTracks = typeof stream.getAudioTracks === "function" ? stream.getAudioTracks() : [];
        for (var i = 0; i < audioTracks.length; i += 1) {
            audioTracks[i].enabled = !muteAudio;
        }
    }

    function shouldShowOwnVideo(elements) {
        return Boolean(elements.videoShowToggle && elements.videoShowToggle.checked);
    }

    function getSelectedSourceMode(elements) {
        if (!elements || !elements.videoSourceSelect) {
            return "camera";
        }
        var value = String(elements.videoSourceSelect.value || "").trim().toLowerCase();
        if (value === "screen" || value === "audio") {
            return value;
        }
        return "camera";
    }

    function buildCallOptions(elements) {
        var sourceMode = getSelectedSourceMode(elements);
        return {
            sourceMode: sourceMode,
            showVideo: sourceMode !== "audio" && shouldShowOwnVideo(elements),
            requireAudio: true
        };
    }

    function setScreenShareAvailability(elements, supported) {
        if (!elements || !elements.videoSourceSelect) {
            return;
        }
        var option = elements.videoSourceSelect.querySelector('option[value="screen"]');
        if (option) {
            option.hidden = !supported;
            option.disabled = !supported;
        }
        if (!supported && elements.videoSourceSelect.value === "screen") {
            elements.videoSourceSelect.value = "camera";
        }
    }

    function hasPendingTransfer(appState) {
        return Boolean(
            appState.incomingFileOffer
            || Object.keys(appState.transferViews).length > 0
        );
    }

    async function toggleVideoCall(appState, elements, peerManager, helpers) {
        if (!helpers.isCurrentConversationConnected()) {
            helpers.setStatus("当前会话未连接，当前无法发起视频通话。");
            return;
        }

        if (appState.videoState !== "idle") {
            if (!appState.videoModalOpen) {
                openVideoModal(appState, elements, { incoming: appState.videoState === "incoming" });
                return;
            }
            if (appState.videoState === "incoming") {
                return;
            }
            peerManager.hangupVideoCall();
            appState.videoState = "idle";
            updateVideoButton(appState, elements);
            helpers.setStatus("已挂断通话。");
            return;
        }
        await startVideoCall(appState, elements, peerManager, helpers);
    }

    async function startVideoCall(appState, elements, peerManager, helpers, options) {
        options = options || {};
        if (hasPendingTransfer(appState)) {
            helpers.setStatus("文件传输进行中，请稍后再发起视频通话。");
            return;
        }
        var conv = appState.conversations[appState.currentConversationId];
        var peerId = conv && conv.peerId ? conv.peerId : "";
        try {
            var callOptions = buildCallOptions(elements);
            appState.localMediaSourceMode = callOptions.sourceMode;
            await peerManager.startVideoCall(peerId, callOptions);
            appState.videoState = "calling";
            if (!options.silent) {
                openVideoModal(appState, elements, { incoming: false });
            } else {
                renderVideoModalActions(appState, elements, false);
                updateVideoButton(appState, elements);
            }
            setVideoStatus(elements, describeSourceMode(callOptions.sourceMode) + "连接中...");
            updateVideoButton(appState, elements);
        } catch (error) {
            helpers.setStatus("发起视频通话失败：" + toErrorMessage(error));
            appState.videoState = "idle";
            updateVideoButton(appState, elements);
        }
    }

    async function acceptIncomingVideoCall(appState, elements, peerManager, helpers) {
        if (appState.videoState !== "incoming") {
            return;
        }
        try {
            var acceptOptions = buildCallOptions(elements);
            appState.localMediaSourceMode = acceptOptions.sourceMode;
            await peerManager.acceptIncomingCall(acceptOptions);
            appState.videoState = "connecting";
            setVideoStatus(elements, describeSourceMode(acceptOptions.sourceMode) + "连接中...");
            renderVideoModalActions(appState, elements);
            updateVideoButton(appState, elements);
        } catch (error) {
            helpers.setStatus("接听失败：" + toErrorMessage(error));
            peerManager.hangupVideoCall();
            appState.videoState = "idle";
            updateVideoButton(appState, elements);
        }
    }

    function rejectIncomingVideoCall(appState, elements, peerManager) {
        peerManager.rejectIncomingCall();
        appState.videoState = "idle";
        appState.incomingCallInfo = null;
        setVideoStatus(elements, "已拒绝");
        closeVideoModal(appState, elements, { keepCall: false });
        updateVideoButton(appState, elements);
    }

    function ensureVideoPlayback(videoElement, appState, helpers, options) {
        options = options || {};
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
        var playPromise = videoElement.play();
        if (!playPromise || typeof playPromise.catch !== "function") {
            return;
        }
        playPromise.catch(function (error) {
            var errorName = error && error.name ? String(error.name) : "";
            if (errorName === "NotAllowedError" || errorName === "AbortError") {
                var now = Date.now();
                if (now - appState.lastVideoPlayHintAt > 2500) {
                    appState.lastVideoPlayHintAt = now;
                    helpers.setStatus("Safari 可能拦截了自动播放，请点一下视频画面继续播放。");
                }
                return;
            }
            console.warn("[AirCopy][VideoPlay] play failed", error);
        });
    }

    function setVideoStatus(elements, text) {
        if (elements.videoStatus) {
            elements.videoStatus.textContent = text || "未开始";
        }
    }

    function resetVideoUI(appState, elements, statusText) {
        setVideoStatus(elements, statusText || "未开始");
        setVideoControlDefaults(elements);
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
        updateVideoButton(appState, elements);
    }

    function openVideoModal(appState, elements, options) {
        options = options || {};
        appState.videoModalOpen = true;
        elements.videoModal.classList.remove("hidden");
        renderVideoModalActions(appState, elements, options.incoming);
    }

    function closeVideoModal(appState, elements, options) {
        options = options || {};
        appState.videoModalOpen = false;
        elements.videoModal.classList.add("hidden");
        if (options.keepCall === false && appState.videoState !== "idle") {
            if (typeof options.peerManager !== "undefined" && options.peerManager) {
                options.peerManager.hangupVideoCall();
            }
            appState.videoState = "idle";
        }
        renderVideoModalActions(appState, elements, false);
        updateVideoButton(appState, elements);
    }

    function renderVideoModalActions(appState, elements, forceIncoming) {
        var isIncoming = typeof forceIncoming === "boolean"
            ? forceIncoming
            : appState.videoState === "incoming";
        elements.incomingCallActions.classList.toggle("hidden", !isIncoming);
        elements.hangupVideo.classList.toggle("hidden", isIncoming);
    }

    function updateVideoButton(appState, elements) {
        if (!elements.videoCall) {
            return;
        }
        if (appState.videoState === "idle") {
            elements.videoCall.textContent = "通话";
            return;
        }
        if (!appState.videoModalOpen) {
            elements.videoCall.textContent = "显示通话窗口";
            return;
        }
        elements.videoCall.textContent = appState.videoState === "incoming" ? "显示通话窗口" : "挂断通话";
    }

    function describeSourceMode(sourceMode) {
        if (sourceMode === "screen") {
            return "屏幕共享";
        }
        if (sourceMode === "audio") {
            return "语音";
        }
        return "视频";
    }

    async function applySelectedSource(appState, elements, peerManager, helpers) {
        if (!helpers.isCurrentConversationConnected()) {
            helpers.setStatus("当前会话未连接，无法切换发送内容。");
            return;
        }
        var callOptions = buildCallOptions(elements);
        appState.localMediaSourceMode = callOptions.sourceMode;
        if (appState.videoState === "idle" || appState.videoState === "incoming") {
            setVideoStatus(elements, "已切换为" + describeSourceMode(callOptions.sourceMode) + "，发起/接听时生效");
            if (typeof UiBoard !== "undefined" && UiBoard && typeof UiBoard.updateBoardMediaUI === "function") {
                UiBoard.updateBoardMediaUI(appState, elements);
            }
            return;
        }
        var conv = appState.conversations[appState.currentConversationId];
        var peerId = conv && conv.peerId ? conv.peerId : "";
        try {
            peerManager.hangupVideoCall();
            appState.videoState = "idle";
            updateVideoButton(appState, elements);
            await peerManager.startVideoCall(peerId, callOptions);
            appState.videoState = "calling";
            setVideoStatus(elements, describeSourceMode(callOptions.sourceMode) + "重新连接中...");
            if (typeof UiBoard !== "undefined" && UiBoard && typeof UiBoard.updateBoardMediaUI === "function") {
                UiBoard.updateBoardMediaUI(appState, elements);
            }
        } catch (error) {
            helpers.setStatus("切换发送内容失败：" + toErrorMessage(error));
        }
    }

    return {
        syncVideoPrefForCurrentPeer: syncVideoPrefForCurrentPeer,
        onVideoShowToggleChanged: onVideoShowToggleChanged,
        onVideoMuteToggleChanged: onVideoMuteToggleChanged,
        applyLocalMediaTrackToggles: applyLocalMediaTrackToggles,
        shouldShowOwnVideo: shouldShowOwnVideo,
        getSelectedSourceMode: getSelectedSourceMode,
        buildCallOptions: buildCallOptions,
        setScreenShareAvailability: setScreenShareAvailability,
        hasPendingTransfer: hasPendingTransfer,
        toggleVideoCall: toggleVideoCall,
        startVideoCall: startVideoCall,
        acceptIncomingVideoCall: acceptIncomingVideoCall,
        rejectIncomingVideoCall: rejectIncomingVideoCall,
        applySelectedSource: applySelectedSource,
        ensureVideoPlayback: ensureVideoPlayback,
        setVideoStatus: setVideoStatus,
        resetVideoUI: resetVideoUI,
        openVideoModal: openVideoModal,
        closeVideoModal: closeVideoModal,
        renderVideoModalActions: renderVideoModalActions,
        updateVideoButton: updateVideoButton
    };
})();
