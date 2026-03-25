# 修复文件传输与视频通话"连接未建立"问题

## 问题描述

在 aircopy 中，有时文件传输和视频通话会提示"连接未建立"，但同时聊天消息可以正常发送。

## 根因分析

多连接重构后，`PeerManager` 的 `sendFile(peerId, file, options)` 和 `startVideoCall(peerId, options)` 方法要求第一个参数为 `peerId`，用于在 `connections` Map 中查找对应的 `PeerConnection` 实例。

但 UI 调用方未传入 `peerId`：

1. **文件发送** (`ui-file-offer.js` `onFileInputChanged`)：调用 `peerManager.sendFile(file, options)` —— 缺少 `peerId`
2. **语音发送** (`ui-file-offer.js` `stopVoiceRecording`)：调用 `peerManager.sendFile(blob, options)` —— 缺少 `peerId`
3. **视频通话** (`ui-video.js` `startVideoCall`)：调用 `peerManager.startVideoCall(options)` —— 缺少 `peerId`

而**聊天消息**正确传入了 `peerId`：
```js
// ui-chat.js sendCurrentMessage
var conv = appState.conversations[appState.currentConversationId];
var peerId = conv && conv.peerId ? conv.peerId : "";
appState.peerManager.sendText(peerId, text);
```

这导致 `_getConnectionOrThrow()` 接收到非法的 peerId（File 对象或 options 对象），在 `connections` Map 中查不到，抛出"连接未建立"错误。

## 修复方案

在 `ui-file-offer.js` 和 `ui-video.js` 中，调用 `peerManager.sendFile` / `peerManager.startVideoCall` 前，从 `appState` 获取当前会话的 `peerId`，作为第一个参数传入。

### 修复点

- [x] `ui-file-offer.js` `onFileInputChanged`：在 `peerManager.sendFile(...)` 前面获取 peerId 并传入
- [x] `ui-file-offer.js` voice recording `onstop`：在 `peerManager.sendFile(...)` 前面获取 peerId 并传入
- [x] `ui-video.js` `startVideoCall`：在 `peerManager.startVideoCall(...)` 前面获取 peerId 并传入

### 获取 peerId 的方式

与 `ui-chat.js` 保持一致：
```js
var conv = appState.conversations[appState.currentConversationId];
var peerId = conv && conv.peerId ? conv.peerId : "";
```
