/**
 * file-transfer.js - File chunking, send/receive, ack, writable stream.
 *
 * Extracted from PeerManager. Handles file-start, file-chunk, file-end, file-ack
 * protocol messages over PeerConnection instances.
 *
 * Depends on: peer-connection.js, utils.js
 */

const FILE_CHUNK_SIZE = 60 * 1024;
const FILE_ACK_TIMEOUT_MS = 120000;
const FILE_SEND_DRAIN_TIMEOUT_MS = 20000;
const FILE_SEND_DRAIN_THRESHOLD_BYTES = 96 * 1024;

class FileTransferManager {
    constructor(handlers) {
        this.handlers = handlers || {};
        /** @type {Map<string, object>} incoming transfer state keyed by transferId */
        this.incomingTransfers = new Map();
        /** @type {Map<string, object>} outgoing ack waiters keyed by transferId */
        this.outgoingTransferAcks = new Map();
    }

    /**
     * Send a file to a specific peer connection.
     * @param {PeerConnection} pc
     * @param {Blob|File} file
     * @param {object} options
     */
    async sendFile(pc, file, options) {
        options = options || {};
        if (!pc || !pc.isOpen()) {
            throw new Error("连接未建立。");
        }
        const blob = file instanceof Blob ? file : null;
        if (!blob) {
            throw new Error("文件对象无效。");
        }

        const kind = options.kind === "voice" ? "voice" : "file";
        const transferId = this._createTransferId();
        const fileName = options.fileName || (file && file.name) || `${kind}-${Date.now()}`;
        const mimeType = options.mimeType || blob.type || "application/octet-stream";
        const chunkSize = Math.max(8 * 1024, Number(options.chunkSize) || FILE_CHUNK_SIZE);
        const totalChunks = Math.max(1, Math.ceil(blob.size / chunkSize));

        pc.send({
            t: "file-start",
            id: transferId,
            kind,
            name: fileName,
            mime: mimeType,
            size: blob.size,
            chunkSize,
            totalChunks,
            nameMeta: pc.localInfo.displayName || "匿名用户",
            pid: pc.localInfo.persistentId || ""
        });

        const ack = await this._waitTransferAck(transferId);
        if (!ack.accepted) {
            const reason = ack.reason ? `（${ack.reason}）` : "";
            throw new Error(`对方拒绝接收${reason}`);
        }

        for (let index = 0; index < totalChunks; index += 1) {
            const start = index * chunkSize;
            const end = Math.min(blob.size, start + chunkSize);
            const chunkBuffer = await blob.slice(start, end).arrayBuffer();
            pc.send({
                t: "file-chunk",
                id: transferId,
                seq: index,
                d: chunkBuffer
            });

            if (this.handlers.onTransferProgress) {
                this.handlers.onTransferProgress({
                    transferId,
                    direction: "send",
                    sentChunks: index + 1,
                    totalChunks,
                    kind,
                    fileName,
                    size: blob.size
                });
            }

            if (index % 8 === 7) {
                await this._pause(0);
            }
        }

        pc.send({
            t: "file-end",
            id: transferId,
            totalChunks
        });
        await this._waitForDataChannelDrain(pc, FILE_SEND_DRAIN_TIMEOUT_MS, FILE_SEND_DRAIN_THRESHOLD_BYTES);

        return {
            transferId,
            kind,
            fileName,
            mimeType,
            size: blob.size
        };
    }

    acceptIncomingFile(transferId, options) {
        options = options || {};
        const id = String(transferId || "").trim();
        if (!id) {
            throw new Error("transferId 为空。");
        }
        const transfer = this.incomingTransfers.get(id);
        if (!transfer) {
            throw new Error("未找到待确认文件。");
        }

        transfer.state = "accepted";
        if (options.writable) {
            transfer.writable = options.writable;
            this._flushCachedChunksToWritable(transfer);
        }

        if (transfer.pc && transfer.pc.isOpen()) {
            transfer.pc.sendIfConnected({ t: "file-ack", id, accepted: true });
        }
    }

    rejectIncomingFile(transferId, reason) {
        const id = String(transferId || "").trim();
        if (!id) {
            return;
        }
        const transfer = this.incomingTransfers.get(id);
        if (!transfer) {
            return;
        }
        transfer.state = "rejected";
        if (transfer.pc && transfer.pc.isOpen()) {
            transfer.pc.sendIfConnected({ t: "file-ack", id, accepted: false, reason: String(reason || "rejected") });
        }
        this._cleanupIncomingTransfer(transfer, { closeWritable: true });
    }

    setIncomingFileWritable(transferId, writable) {
        const id = String(transferId || "").trim();
        if (!id || !writable) {
            return;
        }
        const transfer = this.incomingTransfers.get(id);
        if (!transfer || transfer.state !== "accepted") {
            return;
        }
        transfer.writable = writable;
        this._flushCachedChunksToWritable(transfer);
    }

    /**
     * Called by PeerConnection when a file-related payload arrives.
     * @param {object} payload
     * @param {PeerConnection} pc
     */
    onTransferPayload(payload, pc) {
        const transferId = payload.id ? String(payload.id) : "";
        if (!transferId) {
            return;
        }

        if (payload.t === "file-start") {
            const transfer = {
                id: transferId,
                kind: payload.kind === "voice" ? "voice" : "file",
                name: payload.name ? String(payload.name) : "文件",
                mime: payload.mime ? String(payload.mime) : "application/octet-stream",
                size: Math.max(0, Number(payload.size) || 0),
                totalChunks: Math.max(1, Number(payload.totalChunks) || 1),
                chunks: [],
                receivedSeq: new Set(),
                receivedChunks: 0,
                writable: null,
                writeQueue: Promise.resolve(),
                state: "pending",
                pc: pc,
                peerId: pc ? pc.peerId : ""
            };
            this.incomingTransfers.set(transferId, transfer);

            if (this.handlers.onIncomingFileOffer) {
                this.handlers.onIncomingFileOffer({
                    transferId,
                    kind: transfer.kind,
                    fileName: transfer.name,
                    mimeType: transfer.mime,
                    size: transfer.size,
                    totalChunks: transfer.totalChunks,
                    peerId: transfer.peerId
                });
            } else {
                this.acceptIncomingFile(transferId);
            }
            return;
        }

        if (payload.t === "file-ack") {
            const pending = this.outgoingTransferAcks.get(transferId);
            if (!pending) {
                return;
            }
            clearTimeout(pending.timer);
            this.outgoingTransferAcks.delete(transferId);
            pending.resolve({
                accepted: Boolean(payload.accepted),
                reason: payload.reason ? String(payload.reason) : ""
            });
            return;
        }

        const transfer = this.incomingTransfers.get(transferId);
        if (!transfer || transfer.state === "rejected") {
            return;
        }

        if (payload.t === "file-chunk") {
            const chunkData = this._toArrayBuffer(payload.d);
            if (!chunkData) {
                return;
            }
            const seq = Math.max(0, Number(payload.seq) || 0);
            if (transfer.receivedSeq.has(seq)) {
                return;
            }
            transfer.receivedSeq.add(seq);
            transfer.receivedChunks = transfer.receivedSeq.size;

            if (transfer.writable) {
                transfer.writeQueue = transfer.writeQueue.then(() => transfer.writable.write(new Uint8Array(chunkData)));
            } else {
                transfer.chunks[seq] = chunkData;
            }

            if (this.handlers.onTransferProgress) {
                this.handlers.onTransferProgress({
                    transferId,
                    direction: "receive",
                    receivedChunks: transfer.receivedChunks,
                    totalChunks: transfer.totalChunks,
                    kind: transfer.kind,
                    fileName: transfer.name,
                    size: transfer.size
                });
            }
            return;
        }

        if (payload.t === "file-end") {
            transfer.writeQueue
                .then(async () => {
                    if (transfer.writable && typeof transfer.writable.close === "function") {
                        await transfer.writable.close();
                    }

                    if (!this.handlers.onFileReceived) {
                        return;
                    }

                    if (transfer.writable) {
                        this.handlers.onFileReceived({
                            transferId,
                            kind: transfer.kind,
                            fileName: transfer.name,
                            mimeType: transfer.mime,
                            size: transfer.size,
                            blob: null,
                            savedToDisk: true
                        });
                        return;
                    }

                    const ordered = [];
                    for (let i = 0; i < transfer.totalChunks; i += 1) {
                        const chunk = transfer.chunks[i];
                        if (chunk) {
                            ordered.push(chunk);
                        }
                    }
                    const blob = new Blob(ordered, { type: transfer.mime });
                    this.handlers.onFileReceived({
                        transferId,
                        kind: transfer.kind,
                        fileName: transfer.name,
                        mimeType: transfer.mime,
                        size: transfer.size,
                        blob,
                        savedToDisk: false
                    });
                })
                .catch((error) => {
                    if (this.handlers.onError) {
                        this.handlers.onError(error, {
                            source: "file",
                            code: "receive-error",
                            peerId: transfer.peerId
                        });
                    }
                })
                .finally(() => {
                    this.incomingTransfers.delete(transferId);
                });
        }
    }

    /**
     * Called when a peer disconnects - cleanup transfers for that peer.
     */
    onPeerDisconnected(peerId) {
        // Reset incoming transfers from this peer
        for (const [id, transfer] of this.incomingTransfers) {
            if (transfer.peerId === peerId) {
                this._cleanupIncomingTransfer(transfer, { closeWritable: true });
            }
        }
        // Reject outgoing acks (they share the connection)
        this._resetOutgoingTransferAcks("连接已断开");
    }

    resetAll() {
        this._resetIncomingTransfers();
        this._resetOutgoingTransferAcks("连接已断开");
    }

    // ── Private ──

    _waitTransferAck(transferId) {
        return new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => {
                this.outgoingTransferAcks.delete(transferId);
                reject(new Error("等待对方确认接收文件超时。"));
            }, FILE_ACK_TIMEOUT_MS);

            this.outgoingTransferAcks.set(transferId, {
                timer,
                resolve,
                reject
            });
        });
    }

    _flushCachedChunksToWritable(transfer) {
        if (!transfer || !transfer.writable) {
            return;
        }
        for (let i = 0; i < transfer.chunks.length; i += 1) {
            const chunk = transfer.chunks[i];
            if (!chunk) {
                continue;
            }
            transfer.writeQueue = transfer.writeQueue.then(() => transfer.writable.write(new Uint8Array(chunk)));
            transfer.chunks[i] = null;
        }
    }

    _resetIncomingTransfers() {
        const ids = Array.from(this.incomingTransfers.keys());
        for (let i = 0; i < ids.length; i += 1) {
            const transfer = this.incomingTransfers.get(ids[i]);
            this._cleanupIncomingTransfer(transfer, { closeWritable: true });
        }
    }

    _cleanupIncomingTransfer(transfer, options) {
        options = options || {};
        if (!transfer) {
            return;
        }
        this.incomingTransfers.delete(transfer.id);
        if (options.closeWritable && transfer.writable && typeof transfer.writable.close === "function") {
            try {
                transfer.writable.close();
            } catch (_error) {}
        }
    }

    _resetOutgoingTransferAcks(reasonText) {
        const ids = Array.from(this.outgoingTransferAcks.keys());
        for (let i = 0; i < ids.length; i += 1) {
            const id = ids[i];
            const pending = this.outgoingTransferAcks.get(id);
            if (!pending) {
                continue;
            }
            clearTimeout(pending.timer);
            pending.reject(new Error(reasonText || "文件发送失败"));
            this.outgoingTransferAcks.delete(id);
        }
    }

    _toArrayBuffer(value) {
        if (!value) {
            return null;
        }
        if (value instanceof ArrayBuffer) {
            return value;
        }
        if (ArrayBuffer.isView(value)) {
            return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
        }
        return null;
    }

    _createTransferId() {
        return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }

    _pause(ms) {
        return new Promise((resolve) => {
            window.setTimeout(resolve, ms);
        });
    }

    _waitForDataChannelDrain(pc, timeoutMs, thresholdBytes) {
        if (!pc || !pc.isOpen()) {
            return Promise.resolve();
        }
        const channel = pc.conn && pc.conn.dataChannel;
        if (!channel || typeof channel.bufferedAmount !== "number") {
            return this._pause(120);
        }

        const threshold = Math.max(0, Number(thresholdBytes) || 0);
        if (channel.bufferedAmount <= threshold) {
            return Promise.resolve();
        }

        const deadline = Date.now() + Math.max(300, Number(timeoutMs) || 0);
        return new Promise((resolve) => {
            const poll = () => {
                if (!pc.isOpen()) {
                    resolve();
                    return;
                }
                if (channel.bufferedAmount <= threshold) {
                    resolve();
                    return;
                }
                if (Date.now() >= deadline) {
                    resolve();
                    return;
                }
                window.setTimeout(poll, 60);
            };
            poll();
        });
    }
}
