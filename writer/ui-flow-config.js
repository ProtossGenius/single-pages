/* ===== 流程配置对话框 ===== */
const FlowConfigUI = {
  _overlay: null,
  _selectedId: null,

  async show() {
    const body = Utils.createElement('div', { className: 'modal-two-col' });

    // 左侧：流程列表
    const listCol = Utils.createElement('div', { className: 'modal-list-col' });
    const listItems = Utils.createElement('div', { className: 'modal-list-items' });
    const addBtn = Utils.createElement('button', {
      className: 'btn btn-sm btn-secondary',
      textContent: '+ 添加流程',
      style: { margin: '8px' },
      onClick: () => this._addFlow(listItems, formCol),
    });
    listCol.appendChild(listItems);
    listCol.appendChild(addBtn);

    // 右侧表单
    const formCol = Utils.createElement('div', { className: 'modal-form-col' });
    formCol.textContent = '请选择或添加流程';

    body.appendChild(listCol);
    body.appendChild(formCol);

    this._overlay = Modal.show({
      title: '流程配置',
      body,
      className: 'modal-wide',
    });

    await this._loadList(listItems, formCol);
  },

  async _loadList(listItems, formCol) {
    const flows = await DB.getAll(DB.STORES.FLOW_CONFIGS);
    flows.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    listItems.innerHTML = '';
    for (const f of flows) {
      const item = Utils.createElement('div', {
        className: 'modal-list-item' + (f.id === this._selectedId ? ' selected' : ''),
        textContent: f.name,
        dataset: { id: f.id },
        onClick: () => this._selectFlow(f.id, listItems, formCol),
      });
      listItems.appendChild(item);
    }

    if (this._selectedId) {
      await this._showForm(this._selectedId, formCol, listItems);
    }
  },

  async _selectFlow(id, listItems, formCol) {
    this._selectedId = id;
    for (const item of listItems.children) {
      item.classList.toggle('selected', item.dataset.id === id);
    }
    await this._showForm(id, formCol, listItems);
  },

  async _showForm(id, formCol, listItems) {
    const flow = await DB.getById(DB.STORES.FLOW_CONFIGS, id);
    if (!flow) return;

    formCol.innerHTML = '';

    // 流程名称
    const nameLabel = Utils.createElement('label', {
      textContent: '流程名称',
      style: { display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' },
    });
    const nameInput = Utils.createElement('input', {
      type: 'text',
      value: flow.name,
      style: { width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: '12px', boxSizing: 'border-box', fontSize: '13px' },
    });
    formCol.appendChild(nameLabel);
    formCol.appendChild(nameInput);

    // 触发方式
    formCol.appendChild(Utils.createElement('label', {
      textContent: '触发方式',
      style: { display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' },
    }));
    const triggerSelect = Utils.createElement('select', {
      style: { width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: '12px', boxSizing: 'border-box', fontSize: '13px' },
    });
    for (const t of TriggerList) {
      const opt = Utils.createElement('option', { value: t.value, textContent: t.label });
      if (t.value === flow.trigger) opt.selected = true;
      triggerSelect.appendChild(opt);
    }
    formCol.appendChild(triggerSelect);

    // 启用 / 阻塞
    const checkRow = Utils.createElement('div', { style: { display: 'flex', gap: '20px', marginBottom: '12px' } });

    const enabledLabel = Utils.createElement('label', {
      style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' },
    });
    const enabledCheck = Utils.createElement('input', { type: 'checkbox' });
    enabledCheck.checked = flow.enabled !== false;
    enabledLabel.appendChild(enabledCheck);
    enabledLabel.appendChild(document.createTextNode('启用'));

    const blockingLabel = Utils.createElement('label', {
      style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' },
    });
    const blockingCheck = Utils.createElement('input', { type: 'checkbox' });
    blockingCheck.checked = flow.blocking === true;
    blockingLabel.appendChild(blockingCheck);
    blockingLabel.appendChild(document.createTextNode('阻塞'));

    checkRow.appendChild(enabledLabel);
    checkRow.appendChild(blockingLabel);
    formCol.appendChild(checkRow);

    // 执行步骤（二维数组编辑器）
    formCol.appendChild(Utils.createElement('label', {
      textContent: '执行步骤',
      style: { display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' },
    }));

    let steps;
    try {
      steps = JSON.parse(flow.steps || '[]');
    } catch { steps = []; }
    if (!Array.isArray(steps)) steps = [];

    // V2: Load all user-created roles for the dropdown
    const allRoles = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    allRoles.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    const stepsContainer = Utils.createElement('div', { style: { marginBottom: '8px' } });
    formCol.appendChild(stepsContainer);

    const renderSteps = () => {
      stepsContainer.innerHTML = '';
      steps.forEach((step, stepIdx) => {
        const stepEl = Utils.createElement('div', { className: 'step-editor' });

        // 步骤头
        const header = Utils.createElement('div', { className: 'step-header' }, [
          Utils.createElement('span', { textContent: `步骤 ${stepIdx + 1} (串行)` }),
          Utils.createElement('button', {
            className: 'btn-icon',
            textContent: '×',
            style: { fontSize: '16px', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--text-muted)' },
            onClick: () => {
              steps.splice(stepIdx, 1);
              renderSteps();
            },
          }),
        ]);
        stepEl.appendChild(header);

        // 角色标签区
        const rolesArea = Utils.createElement('div', { className: 'step-roles' });
        if (Array.isArray(step)) {
          step.forEach((roleId, roleIdx) => {
            const roleConfig = allRoles.find(r => r.id === roleId);
            const tag = Utils.createElement('span', { className: 'step-role-tag' }, [
              document.createTextNode(roleConfig ? roleConfig.name : roleId),
              Utils.createElement('span', {
                className: 'remove',
                textContent: '×',
                onClick: () => {
                  step.splice(roleIdx, 1);
                  renderSteps();
                },
              }),
            ]);
            rolesArea.appendChild(tag);
          });
        }

        // V2: 添加角色下拉（从用户创建的职能列表）
        const addRoleSelect = Utils.createElement('select', {
          style: { fontSize: '12px', padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' },
        });
        addRoleSelect.appendChild(Utils.createElement('option', { value: '', textContent: '+ 添加角色' }));
        for (const r of allRoles) {
          addRoleSelect.appendChild(Utils.createElement('option', { value: r.id, textContent: r.name || '未命名' }));
        }
        addRoleSelect.addEventListener('change', () => {
          if (addRoleSelect.value) {
            step.push(addRoleSelect.value);
            renderSteps();
          }
        });
        rolesArea.appendChild(addRoleSelect);
        stepEl.appendChild(rolesArea);

        stepsContainer.appendChild(stepEl);
      });
    };

    renderSteps();

    const addStepBtn = Utils.createElement('button', {
      className: 'btn btn-sm btn-secondary',
      textContent: '+ 添加步骤',
      style: { marginBottom: '16px' },
      onClick: () => {
        steps.push([]);
        renderSteps();
      },
    });
    formCol.appendChild(addStepBtn);

    // 按钮行
    const btnRow = Utils.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } });
    btnRow.appendChild(Utils.createElement('button', {
      className: 'btn btn-primary',
      textContent: '保存',
      onClick: async () => {
        flow.name = nameInput.value.trim();
        flow.trigger = triggerSelect.value;
        flow.enabled = enabledCheck.checked;
        flow.blocking = blockingCheck.checked;
        flow.steps = JSON.stringify(steps);
        flow.updatedAt = Utils.now();
        await DB.put(DB.STORES.FLOW_CONFIGS, flow);
        Utils.showToast('流程已保存');
        await this._loadList(listItems, formCol);
      },
    }));
    btnRow.appendChild(Utils.createElement('button', {
      className: 'btn btn-danger',
      textContent: '删除流程',
      onClick: async () => {
        const ok = await Modal.confirm('删除确认', `确定删除流程「${flow.name}」？`);
        if (!ok) return;
        await DB.delete(DB.STORES.FLOW_CONFIGS, id);
        this._selectedId = null;
        formCol.innerHTML = '';
        formCol.textContent = '请选择或添加流程';
        await this._loadList(listItems, formCol);
        Utils.showToast('流程已删除');
      },
    }));
    formCol.appendChild(btnRow);
  },

  async _addFlow(listItems, formCol) {
    const now = Utils.now();
    const flows = await DB.getAll(DB.STORES.FLOW_CONFIGS);
    const id = Utils.generateId();
    await DB.put(DB.STORES.FLOW_CONFIGS, {
      id,
      name: '新流程',
      trigger: TriggerEnum.GENERATE_PARAGRAPH.value,
      enabled: true,
      blocking: false,
      steps: '[]',
      sortOrder: flows.length + 1,
      createdAt: now,
      updatedAt: now,
    });
    this._selectedId = id;
    await this._loadList(listItems, formCol);
  },
};
