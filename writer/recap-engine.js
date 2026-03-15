/* ===== 前情提要引擎 ===== */
const RecapEngine = {
  /**
   * 生成前情提要
   * @param {number|null} currentChapterId - 当前章节 ID
   * @returns {Promise<string>} 前情提要文本
   */
  async generate(currentChapterId) {
    // 获取配置
    const batchSetting = await DB.getById(DB.STORES.APP_SETTINGS, 'recap_chapter_batch');
    const wordsSetting = await DB.getById(DB.STORES.APP_SETTINGS, 'recap_target_words');
    const N = batchSetting ? JSON.parse(batchSetting.value) : 10;
    const W = wordsSetting ? JSON.parse(wordsSetting.value) : 500;

    // 获取所有已完成章节
    const allChapters = await DB.getAll(DB.STORES.CHAPTERS);
    const completed = allChapters
      .filter(c => c.status === ChapterStatus.COMPLETED && c.id !== currentChapterId)
      .sort((a, b) => (a.sortOrder || a.id) - (b.sortOrder || b.id));

    if (completed.length === 0) return '';

    // 检查已有的 recap_data
    const existingRecaps = await DB.getAll(DB.STORES.RECAP_DATA);
    if (existingRecaps.length > 0) {
      // 用最新保存的提要
      existingRecaps.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return existingRecaps[0].recapText || '';
    }

    // 全量生成：阶梯形压缩
    return this._fullGenerate(completed, N, W);
  },

  /**
   * 增量更新前情提要（完成一章后调用）
   * @param {string} prevRecap - 之前的前情提要
   * @param {string} newSummary - 新完成章节的概要
   * @returns {Promise<string>} 新的前情提要
   */
  async incrementalUpdate(prevRecap, newSummary) {
    const wordsSetting = await DB.getById(DB.STORES.APP_SETTINGS, 'recap_target_words');
    const W = wordsSetting ? JSON.parse(wordsSetting.value) : 500;

    const prompt = `请将以下前情提要与新章概要融合为不超过${W}字的前情提要。\n\n前情提要：\n${prevRecap}\n\n新章概要：\n${newSummary}`;

    // 获取前情师配置
    const config = await DB.getById(DB.STORES.ROLE_CONFIGS, 'recap_writer');
    if (!config || !config.providerId || !config.modelId) {
      // 无配置时简单拼接
      return (prevRecap + '\n' + newSummary).slice(0, W * 2);
    }

    try {
      const result = await AIService.call(config.providerId, config.modelId, prompt);
      const recap = result.text || (prevRecap + '\n' + newSummary);

      // 保存到 recap_data
      await DB.put(DB.STORES.RECAP_DATA, {
        id: Utils.generateId(),
        chapterId: null,
        recapText: recap,
        coverRange: '[]',
        createdAt: Utils.now(),
        updatedAt: Utils.now(),
      });

      return recap;
    } catch {
      // AI 失败时返回简单拼接
      return (prevRecap + '\n' + newSummary).slice(0, W * 2);
    }
  },

  /**
   * 全量阶梯形压缩
   */
  async _fullGenerate(chapters, N, W) {
    let recap = '';

    for (let i = 0; i < chapters.length; i += N) {
      const batch = chapters.slice(i, i + N);
      const summaries = batch.map(c => c.summary || c.title).join('\n');

      const prompt = recap
        ? `请将以下前情提要与新章节概要融合为不超过${W}字的提要。\n\n前情提要：\n${recap}\n\n章节概要：\n${summaries}`
        : `请将以下章节概要压缩为不超过${W}字的前情提要。\n\n${summaries}`;

      const config = await DB.getById(DB.STORES.ROLE_CONFIGS, 'recap_writer');
      if (!config || !config.providerId || !config.modelId) {
        recap = (recap + '\n' + summaries).slice(0, W * 2);
        continue;
      }

      try {
        const result = await AIService.call(config.providerId, config.modelId, prompt);
        recap = result.text || recap + '\n' + summaries;
      } catch {
        recap = (recap + '\n' + summaries).slice(0, W * 2);
      }
    }

    // 保存
    if (recap) {
      await DB.put(DB.STORES.RECAP_DATA, {
        id: Utils.generateId(),
        chapterId: null,
        recapText: recap,
        coverRange: JSON.stringify([chapters[0].id, chapters[chapters.length - 1].id]),
        createdAt: Utils.now(),
        updatedAt: Utils.now(),
      });
    }

    return recap;
  },
};
