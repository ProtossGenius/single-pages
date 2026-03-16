/* ===== 书籍管理对话框 ===== */
const BookUI = {
  _overlay: null,
  _selectedId: null,

  async show() {
    const body = Utils.createElement('div', { style: 'min-width:400px;' });

    const listContainer = Utils.createElement('div', { className: 'book-list', style: 'max-height:300px;overflow-y:auto;margin-bottom:12px;' });
    const addBtn = Utils.createElement('button', {
      className: 'btn btn-sm btn-primary',
      textContent: '+ 新建书籍',
      onClick: () => this._showCreateForm(body, listContainer),
    });
    const openBtn = Utils.createElement('button', {
      className: 'btn btn-sm btn-secondary',
      textContent: '打开此书籍',
      style: 'margin-left:8px;',
      onClick: () => this._openSelected(),
    });

    const btnRow = Utils.createElement('div', { style: 'display:flex;gap:8px;margin-top:8px;' });
    btnRow.appendChild(addBtn);
    btnRow.appendChild(openBtn);

    body.appendChild(listContainer);
    body.appendChild(btnRow);

    this._overlay = Modal.show({ title: '书籍管理', body, className: 'modal-wide' });
    await this._loadList(listContainer, body);
  },

  async _loadList(listContainer, body) {
    const books = await DB.getAll(DB.STORES.BOOKS);
    books.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    listContainer.innerHTML = '';
    const currentBookId = Store.get('currentBookId');

    for (const book of books) {
      const isCurrent = book.id === currentBookId;
      const item = Utils.createElement('div', {
        className: 'modal-list-item' + (book.id === this._selectedId ? ' selected' : ''),
        style: 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px;cursor:pointer;' + (isCurrent ? 'border-left:3px solid #3b82f6;' : ''),
        dataset: { id: book.id },
        onClick: () => {
          this._selectedId = book.id;
          this._loadList(listContainer, body);
        },
      });

      const nameSpan = Utils.createElement('span', {
        textContent: '📖 ' + book.name + (isCurrent ? ' (当前)' : ''),
      });

      const editBtn = Utils.createElement('button', {
        className: 'btn btn-sm btn-secondary',
        textContent: '编辑',
        onClick: (e) => { e.stopPropagation(); this._showEditForm(book, body, listContainer); },
      });

      item.appendChild(nameSpan);
      item.appendChild(editBtn);
      listContainer.appendChild(item);
    }

    if (books.length === 0) {
      listContainer.textContent = '暂无书籍，请点击"新建书籍"创建。';
    }
  },

  _showCreateForm(body, listContainer) {
    const form = Utils.createElement('div', { style: 'margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0;' });

    const nameLabel = Utils.createElement('label', { textContent: '书名' });
    const nameInput = Utils.createElement('input', { type: 'text', style: 'width:100%;padding:6px;margin:4px 0 8px;' });
    const descLabel = Utils.createElement('label', { textContent: '简介' });
    const descInput = Utils.createElement('textarea', { rows: 3, style: 'width:100%;padding:6px;margin:4px 0 8px;' });

    const saveBtn = Utils.createElement('button', { className: 'btn btn-sm btn-primary', textContent: '创建' });
    const cancelBtn = Utils.createElement('button', { className: 'btn btn-sm btn-secondary', textContent: '取消' });
    const btnRow = Utils.createElement('div', { style: 'display:flex;gap:8px;' });
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);

    form.appendChild(nameLabel);
    form.appendChild(nameInput);
    form.appendChild(descLabel);
    form.appendChild(descInput);
    form.appendChild(btnRow);
    body.appendChild(form);

    saveBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      const desc = descInput.value.trim();
      const now = Utils.now();
      const books = await DB.getAll(DB.STORES.BOOKS);
      const id = Utils.generateId();
      await DB.put(DB.STORES.BOOKS, {
        id, name, description: desc,
        sortOrder: books.length, createdAt: now, updatedAt: now,
      });
      EventBus.emit(Events.BOOK_CREATED, { id, name });
      form.remove();
      await this._loadList(listContainer, body);
    });
    cancelBtn.addEventListener('click', () => form.remove());
  },

  _showEditForm(book, body, listContainer) {
    const existing = body.querySelector('.book-edit-form');
    if (existing) existing.remove();

    const form = Utils.createElement('div', { className: 'book-edit-form', style: 'margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0;' });

    const nameLabel = Utils.createElement('label', { textContent: '书名' });
    const nameInput = Utils.createElement('input', { type: 'text', value: book.name, style: 'width:100%;padding:6px;margin:4px 0 8px;' });
    const descLabel = Utils.createElement('label', { textContent: '简介' });
    const descInput = Utils.createElement('textarea', { rows: 3, style: 'width:100%;padding:6px;margin:4px 0 8px;' });
    descInput.value = book.description || '';

    const saveBtn = Utils.createElement('button', { className: 'btn btn-sm btn-primary', textContent: '保存' });
    const cancelBtn = Utils.createElement('button', { className: 'btn btn-sm btn-secondary', textContent: '取消' });
    const deleteBtn = Utils.createElement('button', { className: 'btn btn-sm', textContent: '删除', style: 'color:#dc2626;margin-left:auto;' });
    const btnRow = Utils.createElement('div', { style: 'display:flex;gap:8px;' });
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(deleteBtn);

    form.appendChild(nameLabel);
    form.appendChild(nameInput);
    form.appendChild(descLabel);
    form.appendChild(descInput);
    form.appendChild(btnRow);
    body.appendChild(form);

    saveBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      book.name = name;
      book.description = descInput.value.trim();
      book.updatedAt = Utils.now();
      await DB.put(DB.STORES.BOOKS, book);
      form.remove();
      await this._loadList(listContainer, body);
    });

    cancelBtn.addEventListener('click', () => form.remove());

    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`确定删除书籍"${book.name}"？相关数据不会被删除。`)) return;
      await DB.delete(DB.STORES.BOOKS, book.id);
      if (Store.get('currentBookId') === book.id) {
        await Store.setCurrentBook(null);
      }
      EventBus.emit(Events.BOOK_DELETED, { id: book.id });
      this._selectedId = null;
      form.remove();
      await this._loadList(listContainer, body);
    });
  },

  async _openSelected() {
    if (!this._selectedId) return;
    await Store.setCurrentBook(this._selectedId);
    EventBus.emit(Events.BOOK_CHANGED, { bookId: this._selectedId });
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
  },
};
