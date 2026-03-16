/* ===== 应用状态管理 ===== */

const Store = (() => {
  const state = {
    // V2: 书籍相关
    currentBookId: null,

    // V2: 侧边栏
    sidebarTab: 'categories',

    // 类目相关
    selectedCategoryId: null,
    categoryTree: [],

    // 编辑器相关
    currentChapterId: null,
    currentParagraphId: null,
    paragraphs: [],

    // 聊天框 (V2: 移除 chatTab，改为可折叠)
    chapterOutline: '',
    followUpSummary: '',
    boundSettings: [],
    outlineText: '',
    styleTags: [],

    // AI 运行状态
    aiRunning: false,
    aiBlocking: false,
    aiStatus: null,

    // 右侧面板
    chapterSummary: '',
    aiReviewNotes: '',
    recapText: '',
    followUpText: '',
  };

  return {
    /** 初始化状态（从数据库加载最后编辑的章节等） */
    async init() {
      const chapterSetting = await DB.getById(DB.STORES.APP_SETTINGS, 'current_chapter_id');
      if (chapterSetting && chapterSetting.value) {
        state.currentChapterId = JSON.parse(chapterSetting.value);
      }
      const bookSetting = await DB.getById(DB.STORES.APP_SETTINGS, 'current_book_id');
      if (bookSetting && bookSetting.value) {
        state.currentBookId = JSON.parse(bookSetting.value);
      }
    },

    /** 获取状态值 */
    get(key) {
      return state[key];
    },

    /** 设置状态值并触发事件 */
    set(key, value) {
      const oldValue = state[key];
      state[key] = value;
      EventBus.emit(Events.STORE_CHANGED, { key, value, oldValue });
    },

    /** 获取完整状态快照（用于调试/测试） */
    getSnapshot() {
      return Utils.deepClone(state);
    },

    /** 选中类目 */
    selectCategory(id) {
      state.selectedCategoryId = id;
      EventBus.emit(Events.CATEGORY_SELECTED, { id });
    },

    /** 设置当前章节 */
    async setCurrentChapter(chapterId) {
      state.currentChapterId = chapterId;
      await DB.put(DB.STORES.APP_SETTINGS, {
        key: 'current_chapter_id',
        value: JSON.stringify(chapterId),
      });
      EventBus.emit(Events.CHAPTER_CHANGED, { chapterId });
    },

    /** 选中段落 */
    selectParagraph(id) {
      state.currentParagraphId = id;
      EventBus.emit(Events.PARAGRAPH_SELECTED, { id });
    },

    /** 设置聊天框 tab — V2: 保留为兼容方法(no-op) */
    setChatTab(tab) {
      // V2: Tab 结构已移除，改为可折叠区块
    },

    /** V2: 设置当前书籍 */
    async setCurrentBook(bookId) {
      state.currentBookId = bookId;
      await DB.put(DB.STORES.APP_SETTINGS, {
        key: 'current_book_id',
        value: JSON.stringify(bookId),
      });
      EventBus.emit(Events.BOOK_CHANGED, { bookId });
    },

    /** V2: 设置侧边栏 Tab */
    setSidebarTab(tab) {
      state.sidebarTab = tab;
      EventBus.emit(Events.SIDEBAR_TAB_CHANGED, { tab });
    },

    /** V2: 设置大纲文本 */
    setOutlineText(text) {
      state.outlineText = text;
    },

    /** V2: 设置风格标签 */
    setStyleTags(tags) {
      state.styleTags = tags;
    },

    /** 设置章节概述 */
    setChapterOutline(text) {
      state.chapterOutline = text;
    },

    /** 设置后续概要 */
    setFollowUpSummary(text) {
      state.followUpSummary = text;
    },

    /** 添加绑定设定 */
    addBoundSetting(categoryId) {
      if (!state.boundSettings.includes(categoryId)) {
        state.boundSettings.push(categoryId);
        EventBus.emit(Events.BINDING_ADDED, { categoryId });
      }
    },

    /** 移除绑定设定 */
    removeBoundSetting(categoryId) {
      const idx = state.boundSettings.indexOf(categoryId);
      if (idx !== -1) {
        state.boundSettings.splice(idx, 1);
        EventBus.emit(Events.BINDING_REMOVED, { categoryId });
      }
    },

    /** 设置 AI 运行状态 */
    setAIRunning(running, blocking = false) {
      state.aiRunning = running;
      state.aiBlocking = blocking;
    },

    /** 更新 AI 状态详情 */
    setAIStatus(status) {
      state.aiStatus = status;
      EventBus.emit(Events.AI_TASK_PROGRESS, status);
    },

    /** 更新右侧面板信息 */
    updateStatusPanel(updates) {
      if (updates.chapterSummary !== undefined) state.chapterSummary = updates.chapterSummary;
      if (updates.aiReviewNotes !== undefined) state.aiReviewNotes = updates.aiReviewNotes;
      if (updates.recapText !== undefined) state.recapText = updates.recapText;
      if (updates.followUpText !== undefined) state.followUpText = updates.followUpText;
      EventBus.emit(Events.STATUS_UPDATED, updates);
    },

    /** 加载最后编辑的章节 */
    async loadLastChapter() {
      if (state.currentChapterId) {
        const chapter = await DB.getById(DB.STORES.CHAPTERS, state.currentChapterId);
        if (chapter) {
          const paragraphs = await DB.getByIndex(
            DB.STORES.PARAGRAPHS, 'idx_chapterId', chapter.id
          );
          paragraphs.sort((a, b) => a.sortOrder - b.sortOrder);
          state.paragraphs = paragraphs;
          state.chapterSummary = chapter.summary || '';
          state.aiReviewNotes = chapter.reviewNotes || '';
          state.recapText = chapter.recapText || '';
          EventBus.emit(Events.CHAPTER_CHANGED, { chapterId: chapter.id });
          return;
        }
      }
      // 无已有章节，创建第一章
      await this.createNewChapter();
    },

    /** 创建新章节 */
    async createNewChapter() {
      const bookId = state.currentBookId || null;
      const allChapters = await DB.getAll(DB.STORES.CHAPTERS);
      const bookChapters = bookId ? allChapters.filter(c => c.bookId === bookId) : allChapters;
      const sortOrder = bookChapters.length + 1;
      const now = Utils.now();
      const chapter = {
        title: `第${sortOrder}章`,
        summary: '',
        content: '',
        recapText: '',
        reviewNotes: '',
        status: ChapterStatus.DRAFT,
        bookId,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      };
      const id = await DB.put(DB.STORES.CHAPTERS, chapter);
      state.currentChapterId = id;
      state.paragraphs = [];
      state.chapterSummary = '';
      state.aiReviewNotes = '';
      await DB.put(DB.STORES.APP_SETTINGS, {
        key: 'current_chapter_id',
        value: JSON.stringify(id),
      });
      EventBus.emit(Events.CHAPTER_CHANGED, { chapterId: id });
      return id;
    },
  };
})();
