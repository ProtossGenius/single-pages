/* ===== 详情面板 UI ===== */

const DetailUI = (() => {
  let container = null;

  function init(containerEl) {
    container = containerEl;

    EventBus.on(Events.CATEGORY_SELECTED, async ({ id }) => {
      if (id) {
        await showDetail(id);
      } else {
        hide();
      }
    });

    EventBus.on(Events.CATEGORY_DELETED, () => {
      hide();
    });

    EventBus.on(Events.DATA_IMPORTED, () => {
      hide();
    });
  }

  async function showDetail(categoryId) {
    const category = await DB.getById(DB.STORES.CATEGORIES, categoryId);
    if (!category) { hide(); return; }

    container.style.display = 'flex';
    container.innerHTML = '';

    // 面包屑
    const breadcrumb = await buildBreadcrumb(category);
    container.appendChild(breadcrumb);

    // 内容区
    const content = Utils.createElement('div', { className: 'detail-content' });

    // 名称
    const nameGroup = Utils.createElement('div', { className: 'detail-field' });
    nameGroup.appendChild(Utils.createElement('label', { className: 'detail-label', textContent: '名称' }));
    const nameInput = Utils.createElement('input', {
      className: 'form-input',
      type: 'text',
      value: category.name,
    });
    nameGroup.appendChild(nameInput);
    content.appendChild(nameGroup);

    // 类型（只读）
    const typeGroup = Utils.createElement('div', { className: 'detail-field' });
    typeGroup.appendChild(Utils.createElement('label', { className: 'detail-label', textContent: '类型' }));
    const typeInfo = getCategoryTypeByValue(category.type);
    typeGroup.appendChild(Utils.createElement('div', {
      className: 'form-input',
      textContent: typeInfo ? typeInfo.label : category.type,
      style: { background: 'var(--bg-secondary)', cursor: 'default' },
    }));
    content.appendChild(typeGroup);

    // 描述
    const descGroup = Utils.createElement('div', { className: 'detail-field' });
    descGroup.appendChild(Utils.createElement('label', { className: 'detail-label', textContent: '描述' }));
    const descTextarea = Utils.createElement('textarea', {
      className: 'form-textarea',
      value: category.description || '',
    });
    descTextarea.value = category.description || '';
    descGroup.appendChild(descTextarea);
    content.appendChild(descGroup);

    // 属性
    const attrGroup = Utils.createElement('div', { className: 'detail-field' });
    attrGroup.appendChild(Utils.createElement('label', {
      className: 'detail-label',
      textContent: '属性 (每行 键: 值)',
    }));
    const attrTextarea = Utils.createElement('textarea', {
      className: 'form-textarea',
      style: { minHeight: '100px', fontFamily: 'var(--font-mono)' },
    });
    attrTextarea.value = formatAttributes(category.attributes);
    attrGroup.appendChild(attrTextarea);
    content.appendChild(attrGroup);

    // 元信息
    const meta = Utils.createElement('div', { className: 'detail-meta' });
    meta.appendChild(Utils.createElement('div', { textContent: `版本: v${category.version}` }));
    meta.appendChild(Utils.createElement('div', { textContent: `最后修改: ${Utils.formatTime(category.updatedAt)}` }));
    meta.appendChild(Utils.createElement('div', { textContent: `创建时间: ${Utils.formatTime(category.createdAt)}` }));
    content.appendChild(meta);

    // 保存按钮
    const btnGroup = Utils.createElement('div', { style: { marginTop: '16px', textAlign: 'right' } });
    const saveBtn = Utils.createElement('button', { className: 'btn btn-primary', textContent: '保存' });
    saveBtn.addEventListener('click', async () => {
      category.name = nameInput.value.trim() || category.name;
      category.description = descTextarea.value;
      category.attributes = parseAttributes(attrTextarea.value);
      category.version += 1;
      category.updatedAt = Utils.now();
      await DB.put(DB.STORES.CATEGORIES, category);
      EventBus.emit(Events.CATEGORY_UPDATED, { id: category.id });
      EventBus.emit(Events.CATEGORY_TREE_CHANGED);
      Utils.showToast('已保存');
      await showDetail(category.id); // 刷新详情
    });
    btnGroup.appendChild(saveBtn);
    content.appendChild(btnGroup);

    container.appendChild(content);
  }

  function hide() {
    container.style.display = 'none';
    container.innerHTML = '';
  }

  async function buildBreadcrumb(category) {
    const path = [];
    let current = category;
    while (current) {
      path.unshift(current);
      if (current.parentId) {
        current = await DB.getById(DB.STORES.CATEGORIES, current.parentId);
      } else {
        break;
      }
    }

    const breadcrumb = Utils.createElement('div', { className: 'detail-breadcrumb' });

    for (let i = 0; i < path.length; i++) {
      if (i > 0) {
        breadcrumb.appendChild(Utils.createElement('span', { textContent: ' > ', style: { color: 'var(--text-muted)' } }));
      }
      breadcrumb.appendChild(Utils.createElement('span', { textContent: path[i].name }));
    }

    const closeBtn = Utils.createElement('button', {
      className: 'btn-icon',
      textContent: '×',
      title: '关闭',
      style: { marginLeft: 'auto', fontSize: '18px' },
    });
    closeBtn.addEventListener('click', () => {
      Store.selectCategory(null);
      hide();
      CategoryUI.refresh();
    });
    breadcrumb.appendChild(closeBtn);

    return breadcrumb;
  }

  function formatAttributes(attrJson) {
    try {
      const obj = JSON.parse(attrJson || '{}');
      return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join('\n');
    } catch {
      return attrJson || '';
    }
  }

  function parseAttributes(text) {
    const obj = {};
    for (const line of (text || '').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const key = trimmed.slice(0, colonIdx).trim();
        const val = trimmed.slice(colonIdx + 1).trim();
        if (key) obj[key] = val;
      }
    }
    return JSON.stringify(obj);
  }

  return { init, show: showDetail, hide };
})();
