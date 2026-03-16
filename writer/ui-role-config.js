/* ===== 职能配置对话框 (V2: 用户自建职能) ===== */
const RoleConfigUI = {
  _overlay: null,
  _selectedRoleId: null,

  async show() {
    const body = Utils.createElement('div', { className: 'modal-two-col' });

    // 左侧：动态职能列表
    const listCol = Utils.createElement('div', { className: 'modal-list-col' });
    const listItems = Utils.createElement('div', { className: 'modal-list-items' });

    // V2: 从数据库动态加载用户创建的职能
    const roles = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    roles.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    for (const role of roles) {
      const item = Utils.createElement('div', {
        className: 'modal-list-item' + (role.id === this._selectedRoleId ? ' selected' : ''),
        textContent: role.name || '未命名',
        dataset: { roleId: role.id },
        onClick: () => this._selectRole(role.id, listItems, formCol),
      });
      listItems.appendChild(item);
    }
    listCol.appendChild(listItems);

    // V2: 添加新职能按钮
    const addBtn = Utils.createElement('button', {
      className: 'btn btn-sm btn-secondary',
      textContent: '+ 添加',
      style: { margin: '8px', width: 'calc(100% - 16px)' },
      onClick: async () => {
        const newRole = {
          id: Utils.generateId(),
          name: '新职能',
          promptTemplate: '',
          providerId: '',
          modelId: '',
          outputVar: '',
          customVars: '[]',
          sortOrder: roles.length,
          createdAt: Utils.now(),
          updatedAt: Utils.now(),
        };
        await DB.put(DB.STORES.ROLE_CONFIGS, newRole);
        this._selectedRoleId = newRole.id;
        Modal.close(this._overlay);
        await this.show();
      },
    });
    listCol.appendChild(addBtn);

    // 右侧表单
    const formCol = Utils.createElement('div', { className: 'modal-form-col' });

    body.appendChild(listCol);
    body.appendChild(formCol);

    this._overlay = Modal.show({
      title: '职能配置',
      body,
      className: 'modal-wide',
    });

    // 默认选中第一个（如有）
    if (roles.length > 0) {
      const initialId = this._selectedRoleId || roles[0].id;
      this._selectedRoleId = initialId;
      await this._showForm(initialId, formCol, listItems);
    } else {
      formCol.innerHTML = '<div style="padding:24px;color:var(--text-muted)">暂无职能配置，请点击左侧「+ 添加」创建</div>';
    }
  },

  async _selectRole(roleId, listItems, formCol) {
    this._selectedRoleId = roleId;
    for (const item of listItems.children) {
      item.classList.toggle('selected', item.dataset.roleId === roleId);
    }
    await this._showForm(roleId, formCol, listItems);
  },

  async _showForm(roleId, formCol, listItems) {
    let config = await DB.getById(DB.STORES.ROLE_CONFIGS, roleId);
    if (!config) return;

    formCol.innerHTML = '';

    // V2: 可编辑职能名称
    formCol.appendChild(Utils.createElement('label', {
      textContent: '职能名称',
      style: { display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' },
    }));
    const nameInput = Utils.createElement('input', {
      type: 'text',
      value: config.name || '',
      style: { width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: '12px', boxSizing: 'border-box', fontSize: '13px' },
    });
    formCol.appendChild(nameInput);

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

    // V2: 保存 + 删除按钮行
    const btnRow = Utils.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } });
    btnRow.appendChild(Utils.createElement('button', {
      className: 'btn btn-danger',
      textContent: '删除职能',
      onClick: async () => {
        if (!confirm(`确定删除职能「${config.name || '未命名'}」？`)) return;
        await DB.delete(DB.STORES.ROLE_CONFIGS, roleId);
        this._selectedRoleId = null;
        Modal.close(this._overlay);
        await this.show();
      },
    }));
    btnRow.appendChild(Utils.createElement('button', {
      className: 'btn btn-primary',
      textContent: '保存',
      onClick: async () => {
        config.name = nameInput.value.trim() || '未命名';
        config.promptTemplate = textarea.value;
        config.providerId = providerSelect.value;
        config.modelId = modelSelect.value;
        config.outputVar = outputSelect.value;
        config.updatedAt = Utils.now();
        await DB.put(DB.STORES.ROLE_CONFIGS, config);
        // Update sidebar list item text
        for (const item of listItems.children) {
          if (item.dataset.roleId === roleId) {
            item.textContent = config.name;
          }
        }
        Utils.showToast('职能配置已保存');
      },
    }));
    formCol.appendChild(btnRow);
  },
};
