/* ===== 提示词优化对话框 ===== */
const PromptOptUI = {
  _overlay: null,

  /** 构造元提示词 */
  _buildMetaPrompt(roleName, currentPrompt) {
    return `你是一个提示词工程专家。以下是一个用于「${roleName}」职能的提示词模板，请分析并给出改进建议和优化后的版本。

请按以下格式输出：
1. 改进点列表（每条一行）
2. 空一行后输出完整的优化后提示词

当前提示词模板：
${currentPrompt}`;
  },

  async show() {
    const body = Utils.createElement('div', { style: 'min-width:500px;' });

    // 职能选择
    const roles = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    roles.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    body.appendChild(Utils.createElement('label', {
      textContent: '选择职能:',
      style: 'display:block;margin-bottom:4px;font-size:13px;font-weight:600;color:var(--text-secondary);',
    }));
    const roleSelect = Utils.createElement('select', {
      style: 'width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:12px;font-size:13px;',
    });
    roleSelect.appendChild(Utils.createElement('option', { value: '', textContent: '-- 请选择 --' }));
    for (const r of roles) {
      roleSelect.appendChild(Utils.createElement('option', { value: r.id, textContent: r.name }));
    }
    body.appendChild(roleSelect);

    // 优化模型选择 — 建议高级模型
    body.appendChild(Utils.createElement('label', {
      textContent: '优化模型: (建议使用高级模型)',
      style: 'display:block;margin-bottom:4px;font-size:13px;font-weight:600;color:var(--text-secondary);',
    }));
    const modelSelect = Utils.createElement('select', {
      style: 'width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:12px;font-size:13px;',
    });
    modelSelect.appendChild(Utils.createElement('option', { value: '', textContent: '-- 请选择 --' }));
    const allModels = await DB.getAll(DB.STORES.AI_MODELS);
    // Sort high-level models first
    allModels.sort((a, b) => {
      const order = { high: 0, medium: 1, basic: 2 };
      return (order[a.intelligenceLevel] || 1) - (order[b.intelligenceLevel] || 1);
    });
    for (const m of allModels) {
      const levelLabel = m.intelligenceLevel === 'high' ? '⭐' : '';
      modelSelect.appendChild(Utils.createElement('option', {
        value: `${m.providerId}|${m.id}`,
        textContent: `${m.name} ${levelLabel}`,
      }));
    }
    body.appendChild(modelSelect);

    // 当前提示词展示
    body.appendChild(Utils.createElement('label', {
      textContent: '当前提示词:',
      style: 'display:block;margin-bottom:4px;font-size:13px;font-weight:600;color:var(--text-secondary);',
    }));
    const currentPromptEl = Utils.createElement('textarea', {
      readOnly: true,
      style: 'width:100%;height:100px;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:12px;font-size:13px;box-sizing:border-box;resize:vertical;background:var(--bg-secondary);',
    });
    body.appendChild(currentPromptEl);

    roleSelect.addEventListener('change', async () => {
      const role = roles.find(r => r.id === roleSelect.value);
      currentPromptEl.value = role ? (role.promptTemplate || '') : '';
      resultEl.textContent = '';
      applyBtn.style.display = 'none';
      compareBtn.style.display = 'none';
    });

    // 开始优化按钮
    const startBtn = Utils.createElement('button', { className: 'btn btn-primary', textContent: '开始优化', style: 'margin-bottom:12px;' });
    body.appendChild(startBtn);

    // 优化建议展示
    body.appendChild(Utils.createElement('label', {
      textContent: '优化建议:',
      style: 'display:block;margin-bottom:4px;font-size:13px;font-weight:600;color:var(--text-secondary);',
    }));
    const resultEl = Utils.createElement('textarea', {
      readOnly: true,
      style: 'width:100%;height:140px;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:12px;font-size:13px;box-sizing:border-box;resize:vertical;background:var(--bg-secondary);',
    });
    body.appendChild(resultEl);

    // 按钮行
    const btnRow = Utils.createElement('div', { style: 'display:flex;gap:8px;justify-content:flex-end;' });
    const compareBtn = Utils.createElement('button', { className: 'btn btn-secondary', textContent: '对比查看', style: 'display:none;' });
    const applyBtn = Utils.createElement('button', { className: 'btn btn-primary', textContent: '应用优化', style: 'display:none;' });
    const cancelBtn = Utils.createElement('button', { className: 'btn btn-secondary', textContent: '关闭' });
    btnRow.appendChild(compareBtn);
    btnRow.appendChild(applyBtn);
    btnRow.appendChild(cancelBtn);
    body.appendChild(btnRow);

    this._overlay = Modal.show({ title: '提示词优化', body, className: 'modal-wide' });

    let optimizedText = '';

    startBtn.addEventListener('click', async () => {
      const roleId = roleSelect.value;
      const modelVal = modelSelect.value;
      if (!roleId || !modelVal) {
        Utils.showToast('请选择职能和优化模型', 'error');
        return;
      }
      const [providerId, modelId] = modelVal.split('|');
      const role = roles.find(r => r.id === roleId);
      const metaPrompt = this._buildMetaPrompt(role.name, role.promptTemplate || '');

      startBtn.disabled = true;
      startBtn.textContent = '优化中...';
      try {
        const result = await AIService.call(providerId, modelId, metaPrompt);
        optimizedText = result.text;
        resultEl.value = optimizedText;
        applyBtn.style.display = '';
        compareBtn.style.display = '';
      } catch (err) {
        Utils.showToast('优化失败: ' + err.message, 'error');
      } finally {
        startBtn.disabled = false;
        startBtn.textContent = '开始优化';
      }
    });

    compareBtn.addEventListener('click', () => {
      const compareBody = Utils.createElement('div', { style: 'display:flex;gap:12px;min-width:600px;' });
      const leftCol = Utils.createElement('div', { style: 'flex:1;' });
      leftCol.appendChild(Utils.createElement('div', { textContent: '原始提示词', style: 'font-weight:600;margin-bottom:4px;font-size:13px;' }));
      leftCol.appendChild(Utils.createElement('pre', { textContent: currentPromptEl.value, style: 'background:var(--bg-secondary);padding:8px;border-radius:var(--radius-sm);font-size:12px;white-space:pre-wrap;max-height:300px;overflow-y:auto;' }));
      compareBody.appendChild(leftCol);

      const rightCol = Utils.createElement('div', { style: 'flex:1;' });
      rightCol.appendChild(Utils.createElement('div', { textContent: '优化建议', style: 'font-weight:600;margin-bottom:4px;font-size:13px;' }));
      rightCol.appendChild(Utils.createElement('pre', { textContent: optimizedText, style: 'background:var(--bg-secondary);padding:8px;border-radius:var(--radius-sm);font-size:12px;white-space:pre-wrap;max-height:300px;overflow-y:auto;' }));
      compareBody.appendChild(rightCol);

      Modal.show({ title: '对比查看', body: compareBody, className: 'modal-wide' });
    });

    applyBtn.addEventListener('click', async () => {
      const roleId = roleSelect.value;
      const role = await DB.getById(DB.STORES.ROLE_CONFIGS, roleId);
      if (!role) return;
      role.promptTemplate = optimizedText;
      role.updatedAt = Utils.now();
      await DB.put(DB.STORES.ROLE_CONFIGS, role);
      currentPromptEl.value = optimizedText;
      Utils.showToast('已应用优化后的提示词');
      applyBtn.style.display = 'none';
      compareBtn.style.display = 'none';
    });

    cancelBtn.addEventListener('click', () => this._overlay.remove());
  },
};
