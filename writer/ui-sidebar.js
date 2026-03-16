/* ===== VSCode 风格左侧边栏 ===== */
const SidebarUI = (() => {
  let iconBar = null;
  let panelContainer = null;
  let contentArea = null;

  const TABS = [
    { id: 'categories', icon: '📋', label: '类目设定' },
    { id: 'chapters',   icon: '📁', label: '章节目录' },
    { id: 'bookInfo',   icon: '📖', label: '书籍信息' },
  ];

  function init(iconBarEl, panelEl, contentEl) {
    iconBar = iconBarEl;
    panelContainer = panelEl;
    contentArea = contentEl;

    // 渲染图标按钮
    for (const tab of TABS) {
      const btn = Utils.createElement('button', {
        className: 'sidebar-icon-btn',
        title: tab.label,
        textContent: tab.icon,
        dataset: { tab: tab.id },
        onClick: () => switchTab(tab.id),
      });
      iconBar.appendChild(btn);
    }

    // 监听事件
    EventBus.on(Events.BOOK_CHANGED, () => {
      refreshCurrentPanel();
      if (contentArea) updateContentArea();
    });
    EventBus.on(Events.CHAPTER_CHANGED, () => {
      if (Store.get('sidebarTab') === 'chapters') refreshCurrentPanel();
      if (contentArea) updateContentArea();
    });
    EventBus.on(Events.DATA_IMPORTED, () => {
      refreshCurrentPanel();
      if (contentArea) updateContentArea();
    });

    // 初始 tab
    switchTab(Store.get('sidebarTab') || 'categories');
  }

  function switchTab(tabId) {
    Store.setSidebarTab(tabId);

    // 更新图标高亮
    for (const btn of iconBar.querySelectorAll('.sidebar-icon-btn')) {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    }

    refreshCurrentPanel();
    if (contentArea) updateContentArea();
    EventBus.emit(Events.SIDEBAR_TAB_CHANGED, { tab: tabId });
  }

  function refreshCurrentPanel() {
    const tabId = Store.get('sidebarTab') || 'categories';

    if (tabId === 'categories') {
      showCategoryPanel();
    } else if (tabId === 'chapters') {
      showChapterPanel();
    } else if (tabId === 'bookInfo') {
      showBookInfoPanel();
    }
  }

  function showCategoryPanel() {
    panelContainer.innerHTML = '';
    const header = Utils.createElement('div', { className: 'panel-header' }, [
      Utils.createElement('span', { className: 'panel-title', textContent: '类目设定' }),
      Utils.createElement('button', {
        className: 'btn-icon', title: '添加大类', textContent: '+',
        onClick: () => EventBus.emit('sidebar:add-root-category'),
      }),
    ]);
    const treeEl = Utils.createElement('div', { className: 'category-tree', id: 'sidebar-category-tree' });
    panelContainer.appendChild(header);
    panelContainer.appendChild(treeEl);
    // CategoryUI will render into this when available
    if (typeof CategoryUI !== 'undefined' && CategoryUI.refreshInto) {
      CategoryUI.refreshInto(treeEl);
    }
  }

  async function showChapterPanel() {
    panelContainer.innerHTML = '';
    const header = Utils.createElement('div', { className: 'panel-header' }, [
      Utils.createElement('span', { className: 'panel-title', textContent: '章节目录' }),
    ]);
    panelContainer.appendChild(header);

    const bookId = Store.get('currentBookId') || null;
    const allChapters = await DB.getAll(DB.STORES.CHAPTERS);
    const chapters = bookId ? allChapters.filter(c => c.bookId === bookId) : allChapters;
    chapters.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    const currentId = Store.get('currentChapterId');
    const list = Utils.createElement('div', { className: 'chapter-list', style: 'flex:1;overflow-y:auto;padding:4px 0;' });

    for (const ch of chapters) {
      const isCurrent = ch.id === currentId;
      const icon = isCurrent ? '📝' : (ch.status === ChapterStatus.COMPLETED ? '✅' : '📄');
      const item = Utils.createElement('div', {
        className: 'chapter-list-item' + (isCurrent ? ' active' : ''),
        onClick: async () => {
          await Store.setCurrentChapter(ch.id);
          showChapterPanel();
        },
      }, [
        Utils.createElement('span', { className: 'chapter-icon', textContent: icon }),
        Utils.createElement('span', { className: 'chapter-name', textContent: ch.title || `章节 ${ch.id}` }),
      ]);
      list.appendChild(item);
    }

    if (chapters.length === 0) {
      list.appendChild(Utils.createElement('p', {
        className: 'hint-text', style: 'padding:12px;',
        textContent: '暂无章节，点击 + 创建',
      }));
    }

    panelContainer.appendChild(list);
  }

  async function showBookInfoPanel() {
    panelContainer.innerHTML = '';
    const header = Utils.createElement('div', { className: 'panel-header' }, [
      Utils.createElement('span', { className: 'panel-title', textContent: '书籍信息' }),
    ]);
    panelContainer.appendChild(header);

    const bookId = Store.get('currentBookId');
    if (!bookId) {
      panelContainer.appendChild(Utils.createElement('p', {
        className: 'hint-text', style: 'padding:12px;',
        textContent: '未选择书籍，请先在书籍管理中创建或选择。',
      }));
      const switchBtn = Utils.createElement('button', {
        className: 'btn btn-sm btn-primary', style: 'margin:0 12px;',
        textContent: '书籍管理',
        onClick: () => BookUI.show(),
      });
      panelContainer.appendChild(switchBtn);
      return;
    }

    const book = await DB.getById(DB.STORES.BOOKS, bookId);
    if (!book) return;

    const content = Utils.createElement('div', { style: 'padding:12px;flex:1;overflow-y:auto;' });

    const nameLabel = Utils.createElement('label', { className: 'detail-label', textContent: '书名' });
    const nameInput = Utils.createElement('input', {
      type: 'text', className: 'form-input', value: book.name,
    });

    const descLabel = Utils.createElement('label', { className: 'detail-label', textContent: '简介', style: 'margin-top:12px;display:block;' });
    const descInput = Utils.createElement('textarea', {
      className: 'form-textarea', rows: 4,
    });
    descInput.value = book.description || '';

    // Stats
    const allChapters = await DB.getAll(DB.STORES.CHAPTERS);
    const bookChapters = allChapters.filter(c => c.bookId === bookId);
    let totalWords = 0;
    for (const ch of bookChapters) {
      totalWords += (ch.content || '').length;
    }
    const stats = Utils.createElement('div', { className: 'detail-meta', style: 'margin-top:12px;' });
    stats.textContent = `章节数: ${bookChapters.length}  |  总字数: ${totalWords.toLocaleString()}`;

    const btnRow = Utils.createElement('div', { style: 'display:flex;gap:8px;margin-top:12px;' });
    const saveBtn = Utils.createElement('button', {
      className: 'btn btn-sm btn-primary', textContent: '保存',
      onClick: async () => {
        book.name = nameInput.value.trim();
        book.description = descInput.value.trim();
        book.updatedAt = Utils.now();
        await DB.put(DB.STORES.BOOKS, book);
        Utils.showToast('书籍信息已保存');
      },
    });
    const switchBtn = Utils.createElement('button', {
      className: 'btn btn-sm btn-secondary', textContent: '切换书籍',
      onClick: () => BookUI.show(),
    });
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(switchBtn);

    content.appendChild(nameLabel);
    content.appendChild(nameInput);
    content.appendChild(descLabel);
    content.appendChild(descInput);
    content.appendChild(stats);
    content.appendChild(btnRow);
    panelContainer.appendChild(content);
  }

  function updateContentArea() {
    if (!contentArea) return;
    const tabId = Store.get('sidebarTab') || 'categories';

    // Show/hide panels based on current tab
    const categoryPanel = document.getElementById('category-panel');
    const detailPanel = document.getElementById('detail-panel');
    const editorPanel = document.getElementById('editor-area');
    const statusPanel = document.getElementById('status-panel');

    if (tabId === 'categories') {
      if (categoryPanel) categoryPanel.style.display = 'none';
      if (detailPanel) {
        detailPanel.style.display = '';
        detailPanel.style.flex = '1';
        detailPanel.style.width = '';
        detailPanel.style.minWidth = '';
      }
      if (editorPanel) editorPanel.style.display = 'none';
      if (statusPanel) statusPanel.style.display = '';
    } else if (tabId === 'chapters') {
      if (categoryPanel) categoryPanel.style.display = 'none';
      if (detailPanel) { detailPanel.style.display = 'none'; detailPanel.style.flex = ''; }
      if (editorPanel) editorPanel.style.display = '';
      if (statusPanel) statusPanel.style.display = '';
    } else if (tabId === 'bookInfo') {
      // Book info is in sidebar panel; hide other content and status panel
      if (categoryPanel) categoryPanel.style.display = 'none';
      if (detailPanel) { detailPanel.style.display = 'none'; detailPanel.style.flex = ''; }
      if (editorPanel) editorPanel.style.display = 'none';
      if (statusPanel) statusPanel.style.display = 'none';
    }
  }

  return { init, switchTab, refreshCurrentPanel };
})();
