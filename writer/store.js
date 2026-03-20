/* ===== 应用状态管理 ===== */

const Store = (() => {
  const DEFAULT_SIDEBAR_TAB = 'chapters';

  const state = {
    // V2: 书籍相关
    currentBookId: null,

    // V2: 侧边栏
    sidebarTab: DEFAULT_SIDEBAR_TAB,

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

  async function persistSetting(key, value) {
    await DB.put(DB.STORES.APP_SETTINGS, {
      key,
      value: JSON.stringify(value),
    });
  }

  function resetBookScopedInputs() {
    state.selectedCategoryId = null;
    state.boundSettings = [];
    state.chapterOutline = '';
    state.followUpSummary = '';
    state.currentParagraphId = null;
  }

  function clearChapterState() {
    state.currentChapterId = null;
    state.currentParagraphId = null;
    state.paragraphs = [];
    state.chapterSummary = '';
    state.aiReviewNotes = '';
    state.recapText = '';
    state.followUpText = '';
  }

  async function loadChapterIntoState(chapterId, { persist = true } = {}) {
    if (!chapterId) {
      clearChapterState();
      if (persist) {
        await persistSetting('current_chapter_id', null);
      }
      EventBus.emit(Events.CHAPTER_CHANGED, { chapterId: null });
      EventBus.emit(Events.STATUS_UPDATED, {
        chapterSummary: '',
        aiReviewNotes: '',
        recapText: '',
        followUpText: '',
      });
      return null;
    }

    const chapter = await DB.getById(DB.STORES.CHAPTERS, chapterId);
    if (!chapter) {
      return loadChapterIntoState(null, { persist });
    }

    const paragraphs = await DB.getByIndex(DB.STORES.PARAGRAPHS, 'idx_chapterId', chapter.id);
    paragraphs.sort((a, b) => a.sortOrder - b.sortOrder);

    state.currentChapterId = chapter.id;
    state.currentParagraphId = null;
    state.paragraphs = paragraphs;
    state.chapterSummary = chapter.summary || '';
    state.aiReviewNotes = chapter.reviewNotes || '';
    state.recapText = chapter.recapText || '';
    state.followUpText = chapter.followUpText || '';

    if (persist) {
      await persistSetting('current_chapter_id', chapter.id);
    }

    EventBus.emit(Events.CHAPTER_CHANGED, { chapterId: chapter.id });
    EventBus.emit(Events.STATUS_UPDATED, {
      chapterSummary: state.chapterSummary,
      aiReviewNotes: state.aiReviewNotes,
      recapText: state.recapText,
      followUpText: state.followUpText,
    });
    return chapter.id;
  }

  async function getBookChapters(bookId) {
    const chapters = await DB.getAll(DB.STORES.CHAPTERS);
    return chapters
      .filter(chapter => (chapter.bookId || null) === (bookId || null))
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

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
      return loadChapterIntoState(chapterId, { persist: true });
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
    async setCurrentBook(bookId, options = {}) {
      state.currentBookId = bookId || null;
      resetBookScopedInputs();
      await persistSetting('current_book_id', state.currentBookId);

      if (options.syncChapter !== false) {
        await this.syncCurrentChapterForBook({
          createIfMissing: options.createChapterIfMissing !== false && state.currentBookId !== null,
        });
      }

      EventBus.emit(Events.BOOK_CHANGED, { bookId: state.currentBookId });
      return state.currentBookId;
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
      await this.syncCurrentChapterForBook({ createIfMissing: true });
    },

    /** 同步当前书籍对应的章节状态 */
    async syncCurrentChapterForBook(options = {}) {
      const bookId = state.currentBookId || null;

      if (state.currentChapterId) {
        const currentChapter = await DB.getById(DB.STORES.CHAPTERS, state.currentChapterId);
        if (currentChapter && (currentChapter.bookId || null) === bookId) {
          return loadChapterIntoState(currentChapter.id, { persist: true });
        }
      }

      const chapters = await getBookChapters(bookId);
      if (chapters.length > 0) {
        return loadChapterIntoState(chapters[0].id, { persist: true });
      }

      if (options.createIfMissing) {
        return this.createNewChapter();
      }

      return loadChapterIntoState(null, { persist: true });
    },

    /** 清空当前章节与正文状态 */
    async clearCurrentChapter() {
      return loadChapterIntoState(null, { persist: true });
    },

    /** 创建新章节 */
    async createNewChapter() {
      const bookId = state.currentBookId || null;
      const bookChapters = await getBookChapters(bookId);
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
      await loadChapterIntoState(id, { persist: true });
      return id;
    },

    /** 删除书籍并级联删除其章节、段落、绑定与回顾数据 */
    async deleteBook(bookId) {
      const books = await DB.getAll(DB.STORES.BOOKS);
      const targetBook = books.find(book => book.id === bookId);
      if (!targetBook) {
        return {
          deletedBooks: 0,
          deletedCategories: 0,
          deletedChapters: 0,
          deletedParagraphs: 0,
          deletedBindings: 0,
          deletedRecaps: 0,
        };
      }

      const categories = (await DB.getAll(DB.STORES.CATEGORIES))
        .filter(category => (category.bookId || null) === bookId);
      const chapters = (await DB.getAll(DB.STORES.CHAPTERS))
        .filter(chapter => (chapter.bookId || null) === bookId);
      const chapterIds = new Set(chapters.map(chapter => chapter.id));
      const paragraphs = (await DB.getAll(DB.STORES.PARAGRAPHS))
        .filter(paragraph => chapterIds.has(paragraph.chapterId));
      const paragraphIds = new Set(paragraphs.map(paragraph => paragraph.id));
      const bindings = (await DB.getAll(DB.STORES.PARAGRAPH_BINDINGS))
        .filter(binding => paragraphIds.has(binding.paragraphId));
      const recaps = (await DB.getAll(DB.STORES.RECAP_DATA))
        .filter(recap => chapterIds.has(recap.chapterId));

      await DB.transaction(
        [
          DB.STORES.BOOKS,
          DB.STORES.CATEGORIES,
          DB.STORES.CHAPTERS,
          DB.STORES.PARAGRAPHS,
          DB.STORES.PARAGRAPH_BINDINGS,
          DB.STORES.RECAP_DATA,
        ],
        'readwrite',
        (stores) => {
          stores[DB.STORES.BOOKS].delete(bookId);
          for (const category of categories) {
            stores[DB.STORES.CATEGORIES].delete(category.id);
          }
          for (const chapter of chapters) {
            stores[DB.STORES.CHAPTERS].delete(chapter.id);
          }
          for (const paragraph of paragraphs) {
            stores[DB.STORES.PARAGRAPHS].delete(paragraph.id);
          }
          for (const binding of bindings) {
            stores[DB.STORES.PARAGRAPH_BINDINGS].delete(binding.id);
          }
          for (const recap of recaps) {
            stores[DB.STORES.RECAP_DATA].delete(recap.id);
          }
        }
      );

      const remainingBooks = books
        .filter(book => book.id !== bookId)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

      if (state.currentBookId === bookId) {
        const nextBookId = remainingBooks[0]?.id || null;
        if (nextBookId) {
          await this.setCurrentBook(nextBookId, { createChapterIfMissing: true });
        } else {
          state.currentBookId = null;
          resetBookScopedInputs();
          await persistSetting('current_book_id', null);
          await loadChapterIntoState(null, { persist: true });
          EventBus.emit(Events.BOOK_CHANGED, { bookId: null });
        }
      } else {
        await this.syncCurrentChapterForBook({ createIfMissing: state.currentBookId !== null });
      }

      EventBus.emit(Events.BOOK_DELETED, {
        id: bookId,
        deletedBooks: 1,
        deletedCategories: categories.length,
        deletedChapters: chapters.length,
        deletedParagraphs: paragraphs.length,
        deletedBindings: bindings.length,
        deletedRecaps: recaps.length,
      });

      return {
        deletedBooks: 1,
        deletedCategories: categories.length,
        deletedChapters: chapters.length,
        deletedParagraphs: paragraphs.length,
        deletedBindings: bindings.length,
        deletedRecaps: recaps.length,
      };
    },
  };
})();
