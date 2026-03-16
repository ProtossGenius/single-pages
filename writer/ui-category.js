/* ===== 类目管理器 UI ===== */

const CategoryUI = (() => {
  let container = null;
  let treeContainer = null;
  let contextMenu = null;

  function init(containerEl) {
    container = containerEl;
    treeContainer = container.querySelector('#category-tree') || container.querySelector('.category-tree');

    // 添加顶级类目按钮
    const addBtn = container.querySelector('#btn-add-root-category');
    if (addBtn) {
      addBtn.addEventListener('click', () => addCategory(null));
    }

    // 监听类目变更事件以刷新
    EventBus.on(Events.CATEGORY_TREE_CHANGED, () => refresh());
    EventBus.on(Events.DATA_IMPORTED, () => refresh());
    EventBus.on(Events.BOOK_CHANGED, () => refresh());

    // 侧边栏添加类目按钮
    EventBus.on('sidebar:add-root-category', () => addCategory(null));

    // 全局点击关闭右键菜单
    document.addEventListener('click', () => hideContextMenu());

    refresh();
  }

  async function refresh() {
    const bookId = Store.get('currentBookId') || null;
    const allCategories = await DB.getAll(DB.STORES.CATEGORIES);
    const filtered = bookId ? allCategories.filter(c => c.bookId === bookId) : allCategories;
    const tree = buildTree(filtered);
    renderTree(tree);
  }

  function buildTree(items) {
    const map = {};
    const roots = [];
    items.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const item of items) {
      map[item.id] = { ...item, children: [] };
    }
    for (const item of items) {
      if (item.parentId && map[item.parentId]) {
        map[item.parentId].children.push(map[item.id]);
      } else {
        roots.push(map[item.id]);
      }
    }
    return roots;
  }

  function renderTree(roots) {
    treeContainer.innerHTML = '';
    if (roots.length === 0) {
      const hint = Utils.createElement('div', { className: 'hint-text', textContent: '暂无类目，点击 + 添加' });
      treeContainer.appendChild(hint);
      return;
    }
    for (const node of roots) {
      treeContainer.appendChild(renderNode(node, 0));
    }
  }

  function renderNode(node, depth) {
    const selectedId = Store.get('selectedCategoryId');
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = getExpanded(node.id);

    const wrapper = Utils.createElement('div', { className: 'tree-node', dataset: { id: node.id } });

    const row = Utils.createElement('div', {
      className: `tree-node-row${node.id === selectedId ? ' selected' : ''}`,
      style: { paddingLeft: (depth * 16 + 8) + 'px' },
    });

    const toggle = Utils.createElement('span', {
      className: `tree-node-toggle${hasChildren ? '' : ' empty'}`,
      textContent: hasChildren ? (isExpanded ? '▼' : '▶') : '',
    });
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasChildren) {
        setExpanded(node.id, !isExpanded);
        refresh();
      }
    });

    const icon = Utils.createElement('span', {
      className: 'tree-node-icon',
      textContent: getTypeIcon(node.type),
      style: { marginRight: '4px', fontSize: '12px' },
    });

    const name = Utils.createElement('span', { className: 'tree-node-name', textContent: node.name });

    const actions = Utils.createElement('div', { className: 'tree-node-actions' });
    const addChildBtn = Utils.createElement('button', {
      className: 'btn-icon', textContent: '+', title: '添加子项',
      style: { width: '22px', height: '22px', fontSize: '14px' },
    });
    addChildBtn.addEventListener('click', (e) => { e.stopPropagation(); addCategory(node.id); });

    const editBtn = Utils.createElement('button', {
      className: 'btn-icon', textContent: '✏', title: '编辑',
      style: { width: '22px', height: '22px', fontSize: '12px' },
    });
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); editCategory(node.id); });

    const delBtn = Utils.createElement('button', {
      className: 'btn-icon', textContent: '🗑', title: '删除',
      style: { width: '22px', height: '22px', fontSize: '12px' },
    });
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteCategory(node.id, node.name); });

    actions.appendChild(addChildBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    row.appendChild(toggle);
    row.appendChild(icon);
    row.appendChild(name);
    row.appendChild(actions);

    row.addEventListener('click', () => {
      Store.selectCategory(node.id);
      refresh();
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, node);
    });

    wrapper.appendChild(row);

    if (hasChildren) {
      const childrenContainer = Utils.createElement('div', {
        className: `tree-node-children${isExpanded ? '' : ' collapsed'}`,
      });
      for (const child of node.children) {
        childrenContainer.appendChild(renderNode(child, depth + 1));
      }
      wrapper.appendChild(childrenContainer);
    }

    return wrapper;
  }

  function getTypeIcon(type) {
    const icons = {
      character: '👤', location: '📍', sect: '🏛', item: '⚔',
      event: '📅', custom: '📌',
    };
    return icons[type] || '📌';
  }

  const expandedMap = {};
  function getExpanded(id) { return expandedMap[id] !== false; }
  function setExpanded(id, expanded) { expandedMap[id] = expanded; }

  function showContextMenu(x, y, node) {
    hideContextMenu();
    contextMenu = Utils.createElement('div', { className: 'context-menu', style: { left: x + 'px', top: y + 'px' } });
    const items = [
      { text: '添加子项', onClick: () => addCategory(node.id) },
      { text: '编辑', onClick: () => editCategory(node.id) },
      { divider: true },
      { text: '删除', onClick: () => deleteCategory(node.id, node.name) },
    ];
    for (const item of items) {
      if (item.divider) {
        contextMenu.appendChild(Utils.createElement('div', { className: 'context-menu-divider' }));
      } else {
        const menuItem = Utils.createElement('div', { className: 'context-menu-item', textContent: item.text });
        menuItem.addEventListener('click', (e) => { e.stopPropagation(); hideContextMenu(); item.onClick(); });
        contextMenu.appendChild(menuItem);
      }
    }
    document.body.appendChild(contextMenu);
  }

  function hideContextMenu() {
    if (contextMenu && contextMenu.parentNode) {
      contextMenu.parentNode.removeChild(contextMenu);
      contextMenu = null;
    }
  }

  async function addCategory(parentId) {
    const name = await Modal.prompt('添加类目', '名称');
    if (!name || !name.trim()) return;

    let type = 'custom';
    if (!parentId) {
      type = await selectCategoryType();
      if (!type) return;
    } else {
      const parent = await DB.getById(DB.STORES.CATEGORIES, parentId);
      if (parent) type = parent.type;
    }

    const siblings = parentId
      ? await DB.getByIndex(DB.STORES.CATEGORIES, 'idx_parentId', parentId)
      : (await DB.getAll(DB.STORES.CATEGORIES)).filter(c => !c.parentId);

    const now = Utils.now();
    const category = {
      id: Utils.generateId(),
      parentId: parentId || null,
      bookId: Store.get('currentBookId') || null,
      type,
      name: name.trim(),
      description: '',
      attributes: '{}',
      sortOrder: siblings.length + 1,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await DB.put(DB.STORES.CATEGORIES, category);
    if (parentId) setExpanded(parentId, true);
    EventBus.emit(Events.CATEGORY_TREE_CHANGED);
    Utils.showToast(`已添加: ${name.trim()}`);
  }

  function selectCategoryType() {
    return new Promise((resolve) => {
      const bodyEl = Utils.createElement('div', { className: 'form-group' });
      bodyEl.appendChild(Utils.createElement('label', { className: 'form-label', textContent: '选择类目类型' }));
      const select = Utils.createElement('select', { className: 'form-select' });
      for (const ct of CategoryTypeList) {
        select.appendChild(Utils.createElement('option', { value: ct.value, textContent: ct.label }));
      }
      bodyEl.appendChild(select);
      Modal.show({
        title: '类目类型',
        body: bodyEl,
        buttons: [
          { text: '取消', className: 'btn-secondary', onClick: (ov) => { Modal.close(ov); resolve(null); } },
          { text: '确认', className: 'btn-primary', onClick: (ov) => { Modal.close(ov); resolve(select.value); } },
        ],
        onClose: () => resolve(null),
      });
    });
  }

  async function editCategory(id) {
    Store.selectCategory(id);
    refresh();
  }

  async function deleteCategory(id, name) {
    const confirmed = await Modal.confirm('删除确认', `确定删除 "${name}" 及其所有子项？此操作不可撤销。`);
    if (!confirmed) return;

    const allIds = await collectDescendantIds(id);
    allIds.push(id);

    for (const catId of allIds) {
      const bindings = await DB.getByIndex(DB.STORES.PARAGRAPH_BINDINGS, 'idx_categoryId', catId);
      for (const b of bindings) {
        await DB.delete(DB.STORES.PARAGRAPH_BINDINGS, b.id);
      }
    }

    for (const catId of allIds) {
      await DB.delete(DB.STORES.CATEGORIES, catId);
    }

    if (allIds.includes(Store.get('selectedCategoryId'))) {
      Store.selectCategory(null);
    }

    EventBus.emit(Events.CATEGORY_TREE_CHANGED);
    EventBus.emit(Events.CATEGORY_DELETED, { ids: allIds });
    Utils.showToast(`已删除: ${name}`);
  }

  async function collectDescendantIds(parentId) {
    const children = await DB.getByIndex(DB.STORES.CATEGORIES, 'idx_parentId', parentId);
    const ids = [];
    for (const child of children) {
      ids.push(child.id);
      const subIds = await collectDescendantIds(child.id);
      ids.push(...subIds);
    }
    return ids;
  }

  return { init, refresh };
})();
