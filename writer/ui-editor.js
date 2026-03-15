/* ===== 小说编写区 UI ===== */

const EditorUI = (() => {
  let container = null;

  function init(containerEl) {
    container = containerEl;

    // 章节名编辑
    const titleInput = document.getElementById('chapter-title');
    if (titleInput) {
      titleInput.addEventListener('change', Utils.debounce(async () => {
        const chapterId = Store.get('currentChapterId');
        if (!chapterId) return;
        const chapter = await DB.getById(DB.STORES.CHAPTERS, chapterId);
        if (chapter) {
          chapter.title = titleInput.value;
          chapter.updatedAt = Utils.now();
          await DB.put(DB.STORES.CHAPTERS, chapter);
        }
      }, 500));
    }

    // 监听事件
    EventBus.on(Events.CHAPTER_CHANGED, () => refresh());
    EventBus.on(Events.PARAGRAPH_ADDED, () => refreshParagraphs());
    EventBus.on(Events.PARAGRAPH_UPDATED, () => refreshParagraphs());
    EventBus.on(Events.PARAGRAPH_DELETED, () => refreshParagraphs());
    EventBus.on(Events.DATA_IMPORTED, () => refresh());
  }

  async function refresh() {
    const chapterId = Store.get('currentChapterId');
    if (!chapterId) return;

    const chapter = await DB.getById(DB.STORES.CHAPTERS, chapterId);
    if (!chapter) return;

    const titleInput = document.getElementById('chapter-title');
    if (titleInput) titleInput.value = chapter.title || '';

    await refreshParagraphs();
  }

  async function refreshParagraphs() {
    const listEl = document.getElementById('paragraph-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const chapterId = Store.get('currentChapterId');
    if (!chapterId) return;

    const paragraphs = await DB.getByIndex(DB.STORES.PARAGRAPHS, 'idx_chapterId', chapterId);
    paragraphs.sort((a, b) => a.sortOrder - b.sortOrder);
    Store.set('paragraphs', paragraphs);

    if (paragraphs.length === 0) {
      listEl.appendChild(Utils.createElement('div', {
        className: 'hint-text',
        textContent: '暂无段落，点击下方"开始生成"添加内容',
      }));
    }

    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      listEl.appendChild(await renderParagraph(p, i + 1));
    }
  }

  async function renderParagraph(para, index) {
    const selectedId = Store.get('currentParagraphId');
    const item = Utils.createElement('div', {
      className: `paragraph-item${para.id === selectedId ? ' selected' : ''}`,
      dataset: { id: para.id },
    });

    // 段落内容
    const content = Utils.createElement('div', {
      className: 'paragraph-content',
    });
    content.textContent = para.content || `(段落 ${index} — 等待内容)`;

    // 双击编辑
    content.addEventListener('dblclick', () => {
      enterEditMode(content, para);
    });

    // 点击选中
    item.addEventListener('click', (e) => {
      if (content.getAttribute('contenteditable') === 'true') return;
      Store.selectParagraph(para.id);
      refreshParagraphs();
    });

    item.appendChild(content);

    // 绑定标签
    const bindings = await DB.getByIndex(DB.STORES.PARAGRAPH_BINDINGS, 'idx_paragraphId', para.id);
    if (bindings.length > 0) {
      const tags = Utils.createElement('div', { className: 'paragraph-tags' });
      for (const binding of bindings) {
        const cat = await DB.getById(DB.STORES.CATEGORIES, binding.categoryId);
        if (cat) {
          tags.appendChild(Utils.createElement('span', {
            className: 'paragraph-tag',
            textContent: `${getTypeIcon(cat.type)} ${cat.name}`,
          }));
        }
      }
      item.appendChild(tags);
    }

    return item;
  }

  function getTypeIcon(type) {
    const icons = { character: '👤', location: '📍', sect: '🏛', item: '⚔', event: '📅', custom: '📌' };
    return icons[type] || '📌';
  }

  function enterEditMode(contentEl, para) {
    contentEl.setAttribute('contenteditable', 'true');
    contentEl.textContent = para.content || '';
    contentEl.focus();

    // 选中全部文本
    const range = document.createRange();
    range.selectNodeContents(contentEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const save = async () => {
      contentEl.removeAttribute('contenteditable');
      const newContent = contentEl.textContent.trim();
      if (newContent !== para.content) {
        para.content = newContent;
        para.updatedAt = Utils.now();
        await DB.put(DB.STORES.PARAGRAPHS, para);
        EventBus.emit(Events.PARAGRAPH_UPDATED, { id: para.id });
      }
    };

    contentEl.addEventListener('blur', save, { once: true });
    contentEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        contentEl.textContent = para.content || '';
        contentEl.removeAttribute('contenteditable');
        contentEl.removeEventListener('blur', save);
      }
    });
  }

  /** 添加新段落 */
  async function addParagraph(content = '') {
    const chapterId = Store.get('currentChapterId');
    if (!chapterId) return null;

    const existing = await DB.getByIndex(DB.STORES.PARAGRAPHS, 'idx_chapterId', chapterId);
    const now = Utils.now();
    const para = {
      id: Utils.generateId(),
      chapterId,
      content,
      sortOrder: existing.length + 1,
      recapBrief: '',
      followUp: '',
      createdAt: now,
      updatedAt: now,
    };

    await DB.put(DB.STORES.PARAGRAPHS, para);
    EventBus.emit(Events.PARAGRAPH_ADDED, { id: para.id });
    return para;
  }

  return { init, refresh, refreshParagraphs, addParagraph };
})();
