/* ===== 日志管理服务 ===== */
const LogService = {
  /**
   * 记录 AI 调用日志
   */
  async record(entry) {
    const log = {
      id: Utils.generateId(),
      providerId: entry.providerId || '',
      providerName: entry.providerName || '',
      modelId: entry.modelId || '',
      modelName: entry.modelName || '',
      roleId: entry.roleId || '',
      roleName: entry.roleName || '',
      variables: entry.variables || [],
      prompt: entry.prompt || '',
      response: entry.response || '',
      duration: entry.duration || 0,
      status: entry.status || 'success',
      error: entry.error || '',
      createdAt: Date.now(),
    };
    await DB.put(DB.STORES.AI_LOGS, log);
    EventBus.emit(Events.LOG_RECORDED, log);
    return log;
  },

  /**
   * 查询日志 — 按时间倒序
   * @param {Object} [filter]
   * @param {string} [filter.status] - 'success' | 'failed'
   * @param {number} [filter.since] - 起始时间戳
   */
  async query(filter = {}) {
    let logs;
    if (filter.status) {
      logs = await DB.getByIndex(DB.STORES.AI_LOGS, 'idx_status', filter.status);
    } else {
      logs = await DB.getAll(DB.STORES.AI_LOGS);
    }
    if (filter.since) {
      logs = logs.filter(l => l.createdAt >= filter.since);
    }
    logs.sort((a, b) => b.createdAt - a.createdAt);
    return logs;
  },

  /**
   * 自动清理 — 按天数和条数限制
   * @param {Object} [options]
   * @param {number} [options.maxDays] - 保留天数
   * @param {number} [options.maxCount] - 最大条数
   */
  async cleanup(options = {}) {
    const maxDays = options.maxDays ?? (await DB.getById(DB.STORES.APP_SETTINGS, 'log_max_days'))?.value ?? 30;
    const maxCount = options.maxCount ?? (await DB.getById(DB.STORES.APP_SETTINGS, 'log_max_count'))?.value ?? 1000;

    const logs = await DB.getAll(DB.STORES.AI_LOGS);
    logs.sort((a, b) => b.createdAt - a.createdAt);

    const cutoff = Date.now() - maxDays * 86400000;
    const toDelete = [];

    for (let i = 0; i < logs.length; i++) {
      if (i >= maxCount || logs[i].createdAt < cutoff) {
        toDelete.push(logs[i].id);
      }
    }

    if (toDelete.length > 0) {
      await DB.transaction(DB.STORES.AI_LOGS, 'readwrite', (stores) => {
        const store = stores[DB.STORES.AI_LOGS];
        for (const id of toDelete) {
          store.delete(id);
        }
      });
    }
    return toDelete.length;
  },

  /**
   * 导出日志为 JSON Blob
   */
  async exportJSON() {
    const logs = await this.query();
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    return blob;
  },
};
