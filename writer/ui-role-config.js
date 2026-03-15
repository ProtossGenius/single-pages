/* ===== 职能配置对话框 ===== */
const RoleConfigUI = {
  _overlay: null,
  _selectedRole: null,

  async show() {
    const body = Utils.createElement('div', { className: 'modal-two-col' });

    // 左侧：固定职能列表
    const listCol = Utils.createElement('div', { className: 'modal-list-col' });
    const listItems = Utils.createElement('div', { className: 'modal-list-items' });

    for (const role of RoleList) {
      const item = Utils.createElement('div', {
        className: 'modal-list-item' + (role.value === (this._selectedRole || RoleList[0].value) ? ' selected' : ''),
        textContent: role.label,
        dataset: { role: role.value },
        onClick: () => this._selectRole(role.value, listItems, formCol),
      });
      listItems.appendChild(item);
    }
    listCol.appendChild(listItems);

    // 右侧表单
    const formCol = Utils.createElement('div', { className: 'modal-form-col' });

    body.appendChild(listCol);
    body.appendChild(formCol);

    this._overlay = Modal.show({
      title: '职能配置',
      body,
      className: 'modal-wide',
    });

    // 默认选中第一个
    const initialRole = this._selectedRole || RoleList[0].value;
    this._selectedRole = initialRole;
    await this._showForm(initialRole, formCol, listItems);
  },

  async _selectRole(roleValue, listItems, formCol) {
    this._selectedRole = roleValue;
    for (const item of listItems.children) {
      item.classList.toggle('selected', item.dataset.role === roleValue);
    }
    await this._showForm(roleValue, formCol, listItems);
  },

  async _showForm(roleValue, formCol, listItems) {
    const roleMeta = getRoleByValue(roleValue);
    let config = await DB.getById(DB.STORES.ROLE_CONFIGS, roleValue);
    if (!config) {
      config = {
        role: roleValue,
        promptTemplate: '',
        providerId: '',
        modelId: '',
        outputVar: '',
        createdAt: Utils.now(),
        updatedAt: Utils.now(),
      };
    }

    formCol.innerHTML = '';

    // 职能标题
    formCol.appendChild(Utils.createElement('div', {
      textContent: `职能: ${roleMeta.label}`,
      style: { fontSize: '15px', fontWeight: '600', marginBottom: '4px' },
    }));
    formCol.appendChild(Utils.createElement('div', {
      textContent: roleMeta.description,
      style: { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' },
    }));

    // 供应商选择
    const providers = await DB.getAll(DB.STORES.AI_PROVIDERS);

    formCol.appendChild(Utils.createElement('label', {
      textContent: 'AI 供应商',
      style: { display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' },
    }));

    const providerSelect = Utils.createElement('select', {
      style: { width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: '12px', boxSizing: 'border-box', fontSize: '13px' },
    });
    providerSelect.appendChild(Utils.createElement('option', { value: '', textContent: '-- 请选择 --' }));
    for (const p of providers) {
      const opt = Utils.createElement('option', { value: p.id, textContent: p.name });
      if (p.id === config.providerId) opt.selected = true;
      providerSelect.appendChild(opt);
    }
    formCol.appendChild(providerSelect);

    // 模型选择
    formCol.appendChild(Utils.createElement('label', {
      textContent: '模型',
      style: { display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' },
    }));

    const modelSelect = Utils.createElement('select', {
      style: { width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: '12px', boxSizing: 'border-box', fontSize: '13px' },
    });
    formCol.appendChild(modelSelect);

    const loadModels = async (providerId) => {
      modelSelect.innerHTML = '';
      modelSelect.appendChild(Utils.createElement('option', { value: '', textContent: '-- 请选择 --' }));
      if (!providerId) return;
      const models = await DB.getByIndex(DB.STORES.AI_MODELS, 'idx_providerId', providerId);
      models.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      for (const m of models) {
        const opt = Utils.createElement('option', { value: m.id, textContent: m.name });
        if (m.id === config.modelId) opt.selected = true;
        modelSelect.appendChild(opt);
      }
    };

    await loadModels(config.providerId);
    providerSelect.addEventListener('change', () => loadModels(providerSelect.value));

    // 提示词模板
    formCol.appendChild(Utils.createElement('label', {
      textContent: '提示词模板',
      style: { display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' },
    }));

    const textarea = Utils.createElement('textarea', {
      style: { width: '100%', height: '140px', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: '8px', boxSizing: 'border-box', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' },
    });
    textarea.value = config.promptTemplate || '';
    formCol.appendChild(textarea);

    // 可用变量标签
    formCol.appendChild(Utils.createElement('label', {
      textContent: '可用变量 (点击插入)',
      style: { display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-muted)' },
    }));

    const varRow = Utils.createElement('div', { style: { marginBottom: '12px', lineHeight: '1.8' } });
    for (const v of InputVariables) {
      const tag = Utils.createElement('span', {
        className: 'var-tag',
        textContent: v.label,
        onClick: () => {
          const pos = textarea.selectionStart;
          const text = textarea.value;
          const insert = `{{${v.label}}}`;
          textarea.value = text.slice(0, pos) + insert + text.slice(pos);
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = pos + insert.length;
        },
      });
      varRow.appendChild(tag);
    }
    formCol.appendChild(varRow);

    // 输出变量选择
    formCol.appendChild(Utils.createElement('label', {
      textContent: '输出变量',
      style: { display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' },
    }));

    const outputSelect = Utils.createElement('select', {
      style: { width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: '16px', boxSizing: 'border-box', fontSize: '13px' },
    });
    outputSelect.appendChild(Utils.createElement('option', { value: '', textContent: '-- 请选择 --' }));
    for (const v of OutputVariables) {
      const opt = Utils.createElement('option', { value: v.value, textContent: v.label });
      if (v.value === config.outputVar) opt.selected = true;
      outputSelect.appendChild(opt);
    }
    formCol.appendChild(outputSelect);

    // 保存按钮
    const btnRow = Utils.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end' } });
    btnRow.appendChild(Utils.createElement('button', {
      className: 'btn btn-primary',
      textContent: '保存',
      onClick: async () => {
        config.promptTemplate = textarea.value;
        config.providerId = providerSelect.value;
        config.modelId = modelSelect.value;
        config.outputVar = outputSelect.value;
        config.updatedAt = Utils.now();
        await DB.put(DB.STORES.ROLE_CONFIGS, config);
        Utils.showToast('职能配置已保存');
      },
    }));
    formCol.appendChild(btnRow);
  },
};
