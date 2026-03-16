/* ===== AI 供应商配置对话框 ===== */
const AIConfigUI = {
  _overlay: null,
  _selectedId: null,

  async show() {
    const body = Utils.createElement('div', { className: 'modal-two-col' });

    // 左侧列表
    const listCol = Utils.createElement('div', { className: 'modal-list-col' });
    const listItems = Utils.createElement('div', { className: 'modal-list-items' });
    const addBtn = Utils.createElement('button', {
      className: 'btn btn-sm btn-secondary',
      textContent: '+ 添加',
      style: { margin: '8px' },
      onClick: () => this._addProvider(listItems, formCol),
    });
    listCol.appendChild(listItems);
    listCol.appendChild(addBtn);

    // 右侧表单
    const formCol = Utils.createElement('div', { className: 'modal-form-col' });
    formCol.textContent = '请选择或添加供应商';

    body.appendChild(listCol);
    body.appendChild(formCol);

    this._overlay = Modal.show({
      title: 'AI 供应商管理',
      body,
      className: 'modal-wide',
    });

    await this._loadList(listItems, formCol);
  },

  async _loadList(listItems, formCol) {
    const providers = await DB.getAll(DB.STORES.AI_PROVIDERS);
    providers.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    listItems.innerHTML = '';
    for (const p of providers) {
      const item = Utils.createElement('div', {
        className: 'modal-list-item' + (p.id === this._selectedId ? ' selected' : ''),
        textContent: p.name,
        dataset: { id: p.id },
        onClick: () => this._selectProvider(p.id, listItems, formCol),
      });
      listItems.appendChild(item);
    }

    if (this._selectedId) {
      await this._showForm(this._selectedId, formCol, listItems);
    }
  },

  async _selectProvider(id, listItems, formCol) {
    this._selectedId = id;
    // 更新列表高亮
    for (const item of listItems.children) {
      item.classList.toggle('selected', item.dataset.id === id);
    }
    await this._showForm(id, formCol, listItems);
  },

  async _showForm(id, formCol, listItems) {
    const provider = await DB.getById(DB.STORES.AI_PROVIDERS, id);
    if (!provider) return;

    formCol.innerHTML = '';

    const fields = [
      { label: '供应商名称', key: 'name', type: 'text' },
      { label: 'API 地址', key: 'apiUrl', type: 'text', placeholder: 'https://api.openai.com/v1' },
      { label: 'API Key', key: 'apiKey', type: 'password' },
      { label: '重试次数', key: 'retryCount', type: 'number' },
    ];

    const inputs = {};
    for (const f of fields) {
      const label = Utils.createElement('label', {
        textContent: f.label,
        style: { display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' },
      });
      const input = Utils.createElement('input', {
        type: f.type,
        value: provider[f.key] ?? '',
        placeholder: f.placeholder || '',
        style: { width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: '12px', boxSizing: 'border-box', fontSize: '13px' },
      });
      inputs[f.key] = input;
      formCol.appendChild(label);
      formCol.appendChild(input);
    }

    // 模型列表
    const modelLabel = Utils.createElement('label', {
      textContent: '模型列表',
      style: { display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' },
    });
    formCol.appendChild(modelLabel);

    const modelList = Utils.createElement('div', {
      style: { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', maxHeight: '120px', overflowY: 'auto', marginBottom: '8px' },
    });
    formCol.appendChild(modelList);

    await this._renderModels(id, modelList);

    // 添加模型行
    const addModelRow = Utils.createElement('div', { style: { display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' } });
    const modelInput = Utils.createElement('input', {
      type: 'text',
      placeholder: '模型名称',
      style: { flex: '1', minWidth: '120px', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '13px' },
    });
    const levelSelect = Utils.createElement('select', {
      style: { padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '13px' },
    });
    for (const lv of IntelligenceLevelList) {
      levelSelect.appendChild(Utils.createElement('option', { value: lv.value, textContent: lv.label }));
    }
    const addModelBtn = Utils.createElement('button', {
      className: 'btn btn-sm btn-secondary',
      textContent: '添加',
      onClick: async () => {
        const name = modelInput.value.trim();
        if (!name) return;
        const models = await DB.getByIndex(DB.STORES.AI_MODELS, 'idx_providerId', id);
        await DB.put(DB.STORES.AI_MODELS, {
          id: Utils.generateId(),
          providerId: id,
          name,
          intelligenceLevel: levelSelect.value,
          sortOrder: models.length + 1,
          createdAt: Utils.now(),
        });
        modelInput.value = '';
        await this._renderModels(id, modelList);
      },
    });
    addModelRow.appendChild(modelInput);
    addModelRow.appendChild(levelSelect);
    addModelRow.appendChild(addModelBtn);
    formCol.appendChild(addModelRow);

    // API 测试按钮
    const testBtn = Utils.createElement('button', {
      className: 'btn btn-sm btn-secondary',
      textContent: '测试 API',
      style: { marginBottom: '12px' },
      onClick: () => this._showTestPanel(provider, formCol),
    });
    formCol.appendChild(testBtn);

    // 按钮行
    const btnRow = Utils.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } });
    btnRow.appendChild(Utils.createElement('button', {
      className: 'btn btn-primary',
      textContent: '保存',
      onClick: async () => {
        provider.name = inputs.name.value.trim();
        provider.apiUrl = inputs.apiUrl.value.trim();
        provider.apiKey = inputs.apiKey.value;
        provider.retryCount = parseInt(inputs.retryCount.value, 10) || 3;
        provider.updatedAt = Utils.now();
        await DB.put(DB.STORES.AI_PROVIDERS, provider);
        Utils.showToast('供应商已保存');
        await this._loadList(listItems, formCol);
      },
    }));
    btnRow.appendChild(Utils.createElement('button', {
      className: 'btn btn-danger',
      textContent: '删除供应商',
      onClick: async () => {
        const ok = await Modal.confirm('删除确认', `确定删除供应商「${provider.name}」及其所有模型？`);
        if (!ok) return;
        // 删除关联模型
        const models = await DB.getByIndex(DB.STORES.AI_MODELS, 'idx_providerId', id);
        for (const m of models) await DB.delete(DB.STORES.AI_MODELS, m.id);
        await DB.delete(DB.STORES.AI_PROVIDERS, id);
        this._selectedId = null;
        formCol.innerHTML = '';
        formCol.textContent = '请选择或添加供应商';
        await this._loadList(listItems, formCol);
        Utils.showToast('供应商已删除');
      },
    }));
    formCol.appendChild(btnRow);
  },

  async _renderModels(providerId, container) {
    const models = await DB.getByIndex(DB.STORES.AI_MODELS, 'idx_providerId', providerId);
    models.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    container.innerHTML = '';
    for (const m of models) {
      const levelInfo = getIntelligenceLevelByValue(m.intelligenceLevel);
      const levelText = levelInfo ? levelInfo.label : '';
      const row = Utils.createElement('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid var(--border-light)' },
      }, [
        Utils.createElement('span', { textContent: m.name, style: { fontSize: '13px', flex: '1' } }),
        Utils.createElement('span', { textContent: levelText, style: { fontSize: '11px', color: 'var(--text-muted)', marginRight: '8px' } }),
        Utils.createElement('button', {
          className: 'btn-icon',
          textContent: '删除',
          style: { color: 'var(--danger)', fontSize: '12px', cursor: 'pointer', background: 'none', border: 'none' },
          onClick: async () => {
            await DB.delete(DB.STORES.AI_MODELS, m.id);
            await this._renderModels(providerId, container);
          },
        }),
      ]);
      container.appendChild(row);
    }
    if (models.length === 0) {
      container.appendChild(Utils.createElement('div', {
        textContent: '暂无模型',
        style: { padding: '10px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' },
      }));
    }
  },

  async _addProvider(listItems, formCol) {
    const now = Utils.now();
    const providers = await DB.getAll(DB.STORES.AI_PROVIDERS);
    const id = Utils.generateId();
    await DB.put(DB.STORES.AI_PROVIDERS, {
      id,
      name: '新供应商',
      apiUrl: '',
      apiKey: '',
      retryCount: 3,
      sortOrder: providers.length + 1,
      createdAt: now,
      updatedAt: now,
    });
    this._selectedId = id;
    await this._loadList(listItems, formCol);
  },

  async _showTestPanel(provider, formCol) {
    // Remove existing test panel if any
    const existing = formCol.querySelector('.api-test-panel');
    if (existing) { existing.remove(); return; }

    const panel = Utils.createElement('div', { className: 'api-test-panel', style: 'border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:12px;' });

    // Model selector
    const models = await DB.getByIndex(DB.STORES.AI_MODELS, 'idx_providerId', provider.id);
    const modelSelect = Utils.createElement('select', { style: 'width:100%;padding:6px;margin-bottom:8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;' });
    for (const m of models) {
      modelSelect.appendChild(Utils.createElement('option', { value: m.id, textContent: m.name }));
    }

    const questionInput = Utils.createElement('textarea', {
      rows: 2, placeholder: '输入测试问题...',
      style: 'width:100%;padding:6px;margin-bottom:8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;',
    });

    const resultDiv = Utils.createElement('div', { style: 'max-height:150px;overflow-y:auto;font-size:13px;margin-bottom:8px;white-space:pre-wrap;' });

    const sendBtn = Utils.createElement('button', {
      className: 'btn btn-sm btn-primary', textContent: '发送',
      onClick: async () => {
        const mid = modelSelect.value;
        const question = questionInput.value.trim();
        if (!mid || !question) return;
        resultDiv.textContent = '请求中...';
        resultDiv.style.color = 'var(--text-secondary)';
        try {
          const res = await AIService.call(provider.id, mid, question, { timeout: 30000 });
          resultDiv.textContent = res.text || '(空回复)';
          resultDiv.style.color = 'var(--success)';
        } catch (err) {
          resultDiv.textContent = err.message;
          resultDiv.style.color = 'var(--danger)';
        }
      },
    });

    panel.appendChild(Utils.createElement('div', { textContent: 'API 测试', style: 'font-weight:600;margin-bottom:8px;font-size:13px;' }));
    panel.appendChild(modelSelect);
    panel.appendChild(questionInput);
    panel.appendChild(sendBtn);
    panel.appendChild(resultDiv);

    // Insert before the button row
    const btnRow = formCol.querySelector('div:last-child');
    formCol.insertBefore(panel, btnRow);
  },
};
