/* ===== 提示词优化 — 左右栏布局 (P20 重构) ===== */
const PromptOptUI = {
  _active: false,
  _selectedLog: null,
  _advancedGenResult: '',
  _origGenResult: '',

  /** 默认优化提示词模板 */
  _defaultOptTemplate: `你是一个提示词工程专家。请根据以下信息优化提示词模板。

原始提示词 (带变量占位):
{{原始提示词_变量版}}

原始提示词 (变量展开后):
{{原始提示词_展开版}}

原始模型生成的内容:
{{原始输出}}

高级AI生成的内容:
{{高级AI输出}}

提示词规则:
- 使用 {{变量名}} 作为变量占位符
- 可用变量: 前文信息, 用户输入, 章节概述, 后续概要, 绑定设定, 当前段落, 章节内容, 章节位置
- 自定义变量: {{自定义:变量名}}
- 变量占位符在实际调用时会被替换为对应的值
- 在提示词中引用变量时，必须注明引用的变量是什么。例如："以下是章节的概述内容: {{章节概述}}"，而不是直接写 "{{章节概述}}"

用户意见:
{{用户意见}}

请返回以下 JSON 格式:
{
  "newPrompt": "优化后的提示词模板 (保留变量占位符，引用变量时注明变量含义)",
  "originalScore": 0,
  "advancedScore": 0
}

其中 originalScore 和 advancedScore 分别为 0-10 的整数，对原始模型输出和高级AI输出的内容质量评分 (10=优秀, 0=极差)。
只返回 JSON，不要包含其他内容。`,

  /** 构造元提示词 (保留给测试兼容) */
  _buildMetaPrompt(roleName, currentPrompt) {
    return `你是一个提示词工程专家。以下是一个用于「${roleName}」职能的提示词模板，请分析并给出改进建议和优化后的版本。

请按以下格式输出：
1. 改进点列表（每条一行）
2. 空一行后输出完整的优化后提示词

当前提示词模板：
${currentPrompt}`;
  },

  /** 构建模型选项列表 */
  async _buildModelOptions() {
    const allModels = await DB.getAll(DB.STORES.AI_MODELS);
    allModels.sort((a, b) => {
      const order = { high: 0, medium: 1, basic: 2 };
      return (order[a.intelligenceLevel] || 1) - (order[b.intelligenceLevel] || 1);
    });
    return allModels;
  },

  /** 创建模型选择器 */
  _createModelSelect(models, defaultValue) {
    const select = Utils.createElement('select', { className: 'form-select', style: 'margin-bottom:8px;' });
    select.appendChild(Utils.createElement('option', { value: '', textContent: '-- 请选择 --' }));
    for (const m of models) {
      const levelLabel = m.intelligenceLevel === 'high' ? ' ⭐' : '';
      const opt = Utils.createElement('option', {
        value: `${m.providerId}|${m.id}`,
        textContent: `${m.name}${levelLabel}`,
      });
      if (defaultValue && defaultValue === `${m.providerId}|${m.id}`) opt.selected = true;
      select.appendChild(opt);
    }
    return select;
  },

  /** 进入提示词优化界面 */
  async show() {
    this._active = true;
    this._selectedLog = null;
    this._advancedGenResult = '';
    this._origGenResult = '';

    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    this._savedChildren = Array.from(mainContent.children).map(c => ({
      el: c,
      display: c.style.display,
    }));

    for (const child of mainContent.children) {
      child.style.display = 'none';
    }

    const container = Utils.createElement('div', {
      id: 'prompt-opt-container',
      style: 'display:flex;flex:1;overflow:hidden;height:100%;',
    });

    // === 左侧面板: 职能选择 + 日志列表 ===
    const leftPanel = Utils.createElement('div', {
      style: 'width:280px;min-width:220px;border-right:1px solid var(--border);display:flex;flex-direction:column;background:var(--bg-card);flex-shrink:0;',
    });

    const leftTop = Utils.createElement('div', { style: 'padding:16px;border-bottom:1px solid var(--border);' });
    const roles = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    roles.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    leftTop.appendChild(this._label('选择职能:'));
    const roleSelect = Utils.createElement('select', { className: 'form-select', style: 'margin-bottom:0;' });
    roleSelect.appendChild(Utils.createElement('option', { value: '', textContent: '-- 请选择 --' }));
    for (const r of roles) {
      roleSelect.appendChild(Utils.createElement('option', { value: r.id, textContent: r.name }));
    }
    leftTop.appendChild(roleSelect);
    leftPanel.appendChild(leftTop);

    // 日志列表区域
    const logListContainer = Utils.createElement('div', {
      id: 'prompt-opt-log-list',
      style: 'flex:1;overflow-y:auto;padding:8px;',
    });
    logListContainer.appendChild(Utils.createElement('div', {
      textContent: '请选择职能',
      style: 'color:var(--text-muted);padding:20px 0;text-align:center;font-size:13px;',
    }));
    leftPanel.appendChild(logListContainer);

    // 返回按钮
    const leftBottom = Utils.createElement('div', { style: 'padding:12px 16px;border-top:1px solid var(--border);' });
    leftBottom.appendChild(Utils.createElement('button', {
      className: 'btn btn-secondary', textContent: '← 返回编辑器',
      style: 'width:100%;',
      onClick: () => this.hide(),
    }));
    leftPanel.appendChild(leftBottom);
    container.appendChild(leftPanel);

    // === 右侧主区域 ===
    const rightPanel = Utils.createElement('div', {
      style: 'flex:1;overflow-y:auto;padding:16px 20px;background:var(--bg-primary);',
    });
    const rightContent = Utils.createElement('div', { id: 'prompt-opt-right' });
    rightContent.appendChild(Utils.createElement('div', {
      textContent: '请在左侧选择职能并点击日志',
      style: 'color:var(--text-muted);padding:40px 0;text-align:center;font-size:14px;',
    }));
    rightPanel.appendChild(rightContent);
    container.appendChild(rightPanel);

    mainContent.appendChild(container);

    // 存储引用供后续使用
    this._rightContent = rightContent;
    this._allModels = await this._buildModelOptions();
    this._modelSelects = {};

    roleSelect.addEventListener('change', () => {
      this._selectedLog = null;
      this._advancedGenResult = '';
      this._origGenResult = '';
      this._loadLogList(roleSelect.value, logListContainer, rightContent);
    });
  },

  /** 退出提示词优化界面 */
  hide() {
    this._active = false;
    const container = document.getElementById('prompt-opt-container');
    if (container) container.remove();

    if (this._savedChildren) {
      for (const item of this._savedChildren) {
        item.el.style.display = item.display;
      }
      this._savedChildren = null;
    }
  },

  /** 加载日志列表到左侧 */
  async _loadLogList(roleId, logListContainer, rightContent) {
    logListContainer.innerHTML = '';
    rightContent.innerHTML = '';

    if (!roleId) {
      logListContainer.appendChild(Utils.createElement('div', {
        textContent: '请选择职能',
        style: 'color:var(--text-muted);padding:20px 0;text-align:center;font-size:13px;',
      }));
      rightContent.appendChild(Utils.createElement('div', {
        textContent: '请在左侧选择职能并点击日志',
        style: 'color:var(--text-muted);padding:40px 0;text-align:center;font-size:14px;',
      }));
      return;
    }

    const role = await DB.getById(DB.STORES.ROLE_CONFIGS, roleId);
    if (!role) return;

    const allLogs = await DB.getAll(DB.STORES.AI_LOGS);
    const logs = allLogs
      .filter(l => l.roleId === roleId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);

    if (logs.length === 0) {
      logListContainer.appendChild(Utils.createElement('div', {
        textContent: '暂无日志',
        style: 'color:var(--text-muted);padding:20px 0;text-align:center;font-size:13px;',
      }));
    } else {
      for (const log of logs) {
        logListContainer.appendChild(this._renderLogListItem(log, role, rightContent));
      }
    }

    rightContent.appendChild(Utils.createElement('div', {
      textContent: '← 点击左侧日志查看详情',
      style: 'color:var(--text-muted);padding:40px 0;text-align:center;font-size:14px;',
    }));
  },

  /** 渲染左侧日志列表中的单条 (紧凑) */
  _renderLogListItem(log, role, rightContent) {
    const icon = log.status === 'success' ? '✅' : '❌';
    const item = Utils.createElement('div', {
      style: 'padding:6px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:4px;cursor:pointer;font-size:12px;',
    });
    item.appendChild(Utils.createElement('div', {
      style: 'display:flex;gap:4px;align-items:center;',
    }));
    const row1 = item.firstChild;
    row1.appendChild(Utils.createElement('span', { textContent: icon }));
    row1.appendChild(Utils.createElement('span', {
      textContent: Utils.formatTime(log.createdAt),
      style: 'color:var(--text-muted);',
    }));
    row1.appendChild(Utils.createElement('span', {
      textContent: `${(log.duration / 1000).toFixed(1)}s`,
      style: 'color:var(--text-muted);',
    }));
    const preview = Utils.truncate ? Utils.truncate(log.response || log.error || '', 30) : (log.response || log.error || '').slice(0, 30);
    item.appendChild(Utils.createElement('div', {
      textContent: preview,
      style: 'color:var(--text-secondary);margin-top:2px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;',
    }));

    item.addEventListener('click', () => {
      this._selectedLog = log;
      // 高亮选中项
      const siblings = item.parentElement.querySelectorAll('div[style*="border"]');
      for (const s of siblings) s.style.background = '';
      item.style.background = 'var(--bg-secondary)';
      this._showLogDetail(log, role, rightContent);
    });

    return item;
  },

  /** 右侧显示选中日志的详情及操作区域 */
  async _showLogDetail(log, role, container) {
    container.innerHTML = '';

    // === 日志详情 ===
    container.appendChild(this._sectionTitle('日志详情'));
    container.appendChild(this._detailBlock('带变量名的提示词:', role.promptTemplate || ''));
    container.appendChild(this._detailBlock('变量展开后的提示词:', log.prompt || ''));

    const logVars = (log.variables && Array.isArray(log.variables) && log.variables.length > 0)
      ? log.variables
      : (role.promptTemplate ? this._extractVarValues(role.promptTemplate, log.prompt) : []);
    if (logVars.length > 0) {
      container.appendChild(Utils.createElement('div', {
        textContent: '变量值:',
        style: 'font-weight:600;margin-bottom:4px;margin-top:8px;font-size:12px;',
      }));
      const varTable = Utils.createElement('div', { style: 'background:var(--bg-secondary);padding:6px;border-radius:var(--radius-sm);margin-bottom:8px;font-size:12px;' });
      for (const { name, value } of logVars) {
        const display = typeof value === 'string' ? value : JSON.stringify(value);
        varTable.appendChild(Utils.createElement('div', {
          textContent: `${name} = "${display.slice(0, 100)}${display.length > 100 ? '...' : ''}"`,
          style: 'margin-bottom:2px;',
        }));
      }
      container.appendChild(varTable);
    }
    container.appendChild(this._detailBlock('原始输出:', log.status === 'success' ? (log.response || '') : `错误: ${log.error || ''}`));

    // === 内容生成 ===
    container.appendChild(this._sectionDivider('内容生成'));

    const genResultBox = Utils.createElement('div', {
      style: 'min-height:60px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;font-size:13px;white-space:pre-wrap;background:var(--bg-card);color:var(--text-muted);',
    });
    genResultBox.textContent = '(点击下方按钮生成内容)';

    // 模型选择器 1: 用原始模型生成
    const origModelRow = Utils.createElement('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:4px;' });
    origModelRow.appendChild(this._label('原始模型:'));
    const origModelDefault = (role.providerId && role.modelId) ? `${role.providerId}|${role.modelId}` : '';
    const origModelSelect = this._createModelSelect(this._allModels, origModelDefault);
    origModelSelect.style.flex = '1';
    origModelRow.appendChild(origModelSelect);
    container.appendChild(origModelRow);

    const genOrigBtn = Utils.createElement('button', {
      className: 'btn btn-secondary btn-sm', textContent: '用原始模型生成',
      style: 'margin-bottom:8px;',
    });
    container.appendChild(genOrigBtn);

    // 模型选择器 2: 用高级AI生成
    const advModelRow = Utils.createElement('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:4px;' });
    advModelRow.appendChild(this._label('高级模型:'));
    const advModelSelect = this._createModelSelect(this._allModels, '');
    advModelSelect.style.flex = '1';
    advModelRow.appendChild(advModelSelect);
    container.appendChild(advModelRow);

    const genAdvBtn = Utils.createElement('button', {
      className: 'btn btn-secondary btn-sm', textContent: '用高级AI生成',
      style: 'margin-bottom:12px;',
    });
    container.appendChild(genAdvBtn);

    container.appendChild(genResultBox);

    // 自动填充: 第一个选择自动填写下面空的
    origModelSelect.addEventListener('change', () => {
      if (origModelSelect.value && !advModelSelect.value) advModelSelect.value = origModelSelect.value;
      if (origModelSelect.value && !optModelSelect.value) optModelSelect.value = origModelSelect.value;
    });
    advModelSelect.addEventListener('change', () => {
      if (advModelSelect.value && !optModelSelect.value) optModelSelect.value = advModelSelect.value;
    });

    // 原始模型生成按钮事件
    genOrigBtn.addEventListener('click', async () => {
      const modelVal = origModelSelect.value;
      if (!modelVal) { Utils.showToast('请选择原始模型', 'warning'); return; }
      const [pId, mId] = modelVal.split('|');
      genOrigBtn.disabled = true;
      genOrigBtn.textContent = '生成中...';
      try {
        const latestPrompt = this._buildLatestPrompt(role, log);
        const res = await AIService.call(pId, mId, latestPrompt, { timeout: 60000 });
        this._origGenResult = res.text || '';
        genResultBox.textContent = `[原始模型输出]\n${this._origGenResult || '(空回复)'}`;
        genResultBox.style.color = 'var(--text-primary)';
      } catch (err) {
        genResultBox.textContent = '生成失败: ' + err.message;
        genResultBox.style.color = 'var(--danger)';
      } finally {
        genOrigBtn.disabled = false;
        genOrigBtn.textContent = '用原始模型生成';
      }
    });

    // 高级AI生成按钮事件
    genAdvBtn.addEventListener('click', async () => {
      const modelVal = advModelSelect.value;
      if (!modelVal) { Utils.showToast('请选择高级模型', 'warning'); return; }
      const [pId, mId] = modelVal.split('|');
      genAdvBtn.disabled = true;
      genAdvBtn.textContent = '生成中...';
      try {
        const latestPrompt = this._buildLatestPrompt(role, log);
        const res = await AIService.call(pId, mId, latestPrompt, { timeout: 60000 });
        this._advancedGenResult = res.text || '';
        genResultBox.textContent = `[高级AI输出]\n${this._advancedGenResult || '(空回复)'}`;
        genResultBox.style.color = 'var(--text-primary)';
      } catch (err) {
        genResultBox.textContent = '生成失败: ' + err.message;
        genResultBox.style.color = 'var(--danger)';
      } finally {
        genAdvBtn.disabled = false;
        genAdvBtn.textContent = '用高级AI生成';
      }
    });

    // === 优化职能提示词 ===
    container.appendChild(this._sectionDivider('优化职能提示词'));

    // 模型选择器 3: 优化用模型
    const optModelRow = Utils.createElement('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:4px;' });
    optModelRow.appendChild(this._label('优化模型:'));
    const optModelSelect = this._createModelSelect(this._allModels, '');
    optModelSelect.style.flex = '1';
    optModelRow.appendChild(optModelSelect);
    container.appendChild(optModelRow);

    this._label2(container, '用户意见:');
    const userOpinion = Utils.createElement('textarea', {
      className: 'form-textarea',
      placeholder: '输入对当前提示词的改进建议...',
      style: 'margin-bottom:12px;',
    });
    container.appendChild(userOpinion);

    // 高级设置 (可折叠)
    const advSection = Utils.createElement('div', { style: 'margin-bottom:12px;' });
    const advTitle = Utils.createElement('div', {
      textContent: '▶ 高级设置',
      style: 'cursor:pointer;font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;user-select:none;',
    });
    const advBody = Utils.createElement('div', { style: 'display:none;' });

    advBody.appendChild(this._label('优化提示词模板:'));
    const optTemplate = Utils.createElement('textarea', {
      className: 'form-textarea',
      style: 'min-height:200px;font-family:var(--font-mono);font-size:12px;margin-bottom:8px;',
    });
    optTemplate.value = this._defaultOptTemplate;
    advBody.appendChild(optTemplate);

    const previewBtn = Utils.createElement('button', {
      className: 'btn btn-sm btn-secondary', textContent: '预览完整提示词',
      style: 'margin-bottom:8px;',
    });
    const previewBox = Utils.createElement('pre', {
      style: 'display:none;max-height:200px;overflow-y:auto;padding:8px;background:var(--bg-secondary);border-radius:var(--radius-sm);font-size:12px;white-space:pre-wrap;margin-bottom:8px;',
    });
    advBody.appendChild(previewBtn);
    advBody.appendChild(previewBox);

    previewBtn.addEventListener('click', () => {
      const filled = this._fillOptTemplate(optTemplate.value, role, userOpinion.value);
      previewBox.textContent = filled;
      previewBox.style.display = previewBox.style.display === 'none' ? 'block' : 'none';
    });

    advTitle.addEventListener('click', () => {
      const visible = advBody.style.display !== 'none';
      advBody.style.display = visible ? 'none' : 'block';
      advTitle.textContent = (visible ? '▶' : '▼') + ' 高级设置';
    });

    advSection.appendChild(advTitle);
    advSection.appendChild(advBody);
    container.appendChild(advSection);

    // 优化按钮
    const optimizeBtn = Utils.createElement('button', {
      className: 'btn btn-primary', textContent: '优化职能提示词',
      style: 'margin-bottom:20px;',
    });
    container.appendChild(optimizeBtn);

    // 优化结果
    container.appendChild(this._sectionDivider('优化结果'));
    const resultBox = Utils.createElement('div', {
      style: 'padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-card);margin-bottom:12px;min-height:60px;',
    });
    resultBox.textContent = '(等待优化)';
    resultBox.style.color = 'var(--text-muted)';
    container.appendChild(resultBox);

    const applyBtn = Utils.createElement('button', {
      className: 'btn btn-primary', textContent: '应用新提示词',
      style: 'display:none;margin-bottom:20px;',
    });
    container.appendChild(applyBtn);

    let newPromptText = '';

    optimizeBtn.addEventListener('click', async () => {
      const modelVal = optModelSelect.value;
      if (!modelVal) { Utils.showToast('请选择优化模型', 'warning'); return; }
      const [pId, mId] = modelVal.split('|');
      const templateText = optTemplate.value || this._defaultOptTemplate;
      const filled = this._fillOptTemplate(templateText, role, userOpinion.value);

      optimizeBtn.disabled = true;
      optimizeBtn.textContent = '优化中...';
      try {
        const res = await AIService.call(pId, mId, filled, { timeout: 60000 });
        const text = (res.text || '').trim();

        let parsed;
        try {
          const match = text.match(/\{[\s\S]*\}/);
          parsed = match ? JSON.parse(match[0]) : JSON.parse(text);
        } catch {
          resultBox.innerHTML = '';
          resultBox.style.color = 'var(--text-primary)';
          const promptEditArea = Utils.createElement('textarea', {
            className: 'form-textarea',
            style: 'font-size:12px;font-family:var(--font-mono);min-height:120px;',
          });
          promptEditArea.value = text;
          newPromptText = text;
          promptEditArea.addEventListener('input', () => { newPromptText = promptEditArea.value; });
          resultBox.appendChild(promptEditArea);
          applyBtn.style.display = '';
          userOpinion.value = '';
          return;
        }

        newPromptText = parsed.newPrompt || text;
        const origScore = parsed.originalScore ?? '?';
        const advScore = parsed.advancedScore ?? '?';

        resultBox.innerHTML = '';
        resultBox.style.color = 'var(--text-primary)';

        resultBox.appendChild(Utils.createElement('div', {
          textContent: '新提示词 (可编辑):',
          style: 'font-weight:600;margin-bottom:4px;font-size:13px;',
        }));
        const promptEditArea = Utils.createElement('textarea', {
          className: 'form-textarea',
          style: 'font-size:12px;font-family:var(--font-mono);min-height:120px;margin-bottom:8px;',
        });
        promptEditArea.value = newPromptText;
        promptEditArea.addEventListener('input', () => { newPromptText = promptEditArea.value; });
        resultBox.appendChild(promptEditArea);

        // 双模型评分
        const scoreRow = Utils.createElement('div', { style: 'display:flex;gap:16px;margin-bottom:4px;' });
        scoreRow.appendChild(Utils.createElement('div', {
          textContent: `原始模型评分: ${origScore}/10`,
          style: 'font-size:13px;color:var(--text-secondary);',
        }));
        scoreRow.appendChild(Utils.createElement('div', {
          textContent: `高级AI评分: ${advScore}/10`,
          style: 'font-size:13px;color:var(--text-secondary);',
        }));
        resultBox.appendChild(scoreRow);

        if (origScore !== '?' && advScore !== '?' && advScore - origScore >= 3) {
          resultBox.appendChild(Utils.createElement('div', {
            textContent: '(高级AI明显优于原始模型，建议检查是否为模型能力差距)',
            style: 'font-size:12px;color:var(--text-muted);',
          }));
        } else if (origScore !== '?' && origScore <= 3) {
          resultBox.appendChild(Utils.createElement('div', {
            textContent: '(原始模型输出质量差，提示词仍有较大优化空间)',
            style: 'font-size:12px;color:var(--warning);',
          }));
        }

        applyBtn.style.display = '';
        userOpinion.value = '';
      } catch (err) {
        resultBox.textContent = '优化失败: ' + err.message;
        resultBox.style.color = 'var(--danger)';
      } finally {
        optimizeBtn.disabled = false;
        optimizeBtn.textContent = '优化职能提示词';
      }
    });

    applyBtn.addEventListener('click', async () => {
      if (!newPromptText) return;
      role.promptTemplate = newPromptText;
      role.updatedAt = Utils.now();
      await DB.put(DB.STORES.ROLE_CONFIGS, role);
      Utils.showToast('已应用新提示词');
      applyBtn.style.display = 'none';
    });
  },

  /** 为向后兼容保留的 _loadRoleLogs 方法 */
  async _loadRoleLogs(roleId, container, modelSelect) {
    // P20: 调用新的 _loadLogList
    const logListContainer = document.getElementById('prompt-opt-log-list');
    const rightContent = document.getElementById('prompt-opt-right');
    if (logListContainer && rightContent) {
      await this._loadLogList(roleId, logListContainer, rightContent);
    }
  },

  /** 渲染单条日志 (可展开) — 保留给测试兼容 */
  _renderLogItem(log, role) {
    return this._renderLogListItem(log, role, this._rightContent || document.createElement('div'));
  },

  /** 从模板和实际提示词中提取变量值 */
  _extractVarValues(template, actual) {
    const vars = [];
    const regex = /\{\{([^}]+)\}\}/g;
    let match;
    const varNames = [];
    while ((match = regex.exec(template)) !== null) {
      varNames.push(match[1]);
    }
    if (varNames.length === 0) return vars;
    const parts = template.split(/\{\{[^}]+\}\}/);
    let remaining = actual;
    for (let i = 0; i < varNames.length; i++) {
      const prefix = parts[i];
      const suffix = parts[i + 1] || '';
      if (prefix && remaining.startsWith(prefix)) {
        remaining = remaining.slice(prefix.length);
      }
      let value = '';
      if (suffix) {
        const idx = remaining.indexOf(suffix);
        if (idx >= 0) {
          value = remaining.slice(0, idx);
          remaining = remaining.slice(idx);
        } else {
          value = remaining;
          remaining = '';
        }
      } else {
        value = remaining;
        remaining = '';
      }
      vars.push({ name: varNames[i], value });
    }
    return vars;
  },

  /** 使用最新提示词模板 + 日志中的变量值构建提示词 */
  _buildLatestPrompt(role, log) {
    if (!log || !role.promptTemplate) return log ? log.prompt : '';
    if (log.variables && Array.isArray(log.variables) && log.variables.length > 0) {
      let prompt = role.promptTemplate;
      for (const v of log.variables) {
        prompt = prompt.replace(new RegExp(`\\{\\{${v.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g'), v.value);
      }
      return prompt;
    }
    const vars = this._extractVarValues(role.promptTemplate, log.prompt);
    if (vars.length === 0) return log.prompt;
    let prompt = role.promptTemplate;
    for (const v of vars) {
      prompt = prompt.replace(new RegExp(`\\{\\{${v.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g'), v.value);
    }
    return prompt;
  },

  /** 填充优化提示词模板 */
  _fillOptTemplate(template, role, userOpinion) {
    const log = this._selectedLog;
    return template
      .replace(/\{\{原始提示词_变量版\}\}/g, role.promptTemplate || '')
      .replace(/\{\{原始提示词_展开版\}\}/g, log ? (log.prompt || '') : '')
      .replace(/\{\{原始输出\}\}/g, this._origGenResult || (log ? (log.response || '') : ''))
      .replace(/\{\{高级AI输出\}\}/g, this._advancedGenResult || '')
      .replace(/\{\{用户意见\}\}/g, userOpinion || '')
      .replace(/\{\{提示词规则\}\}/g, '使用 {{变量名}} 作为变量占位符。可用变量: 前文信息, 用户输入, 章节概述, 后续概要, 绑定设定, 当前段落, 章节内容, 章节位置。自定义变量: {{自定义:变量名}}。引用变量时必须注明引用的变量含义。');
  },

  _label(text) {
    return Utils.createElement('label', {
      textContent: text,
      style: 'display:block;margin-bottom:4px;font-size:12px;font-weight:600;color:var(--text-secondary);',
    });
  },

  _label2(container, text) {
    container.appendChild(Utils.createElement('label', {
      textContent: text,
      style: 'display:block;margin-bottom:4px;font-size:13px;font-weight:600;color:var(--text-secondary);',
    }));
  },

  _sectionTitle(text) {
    return Utils.createElement('h3', {
      textContent: text,
      style: 'font-size:15px;font-weight:600;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--border);',
    });
  },

  _sectionDivider(text) {
    return Utils.createElement('div', {
      textContent: '── ' + text + ' ──',
      style: 'font-size:13px;font-weight:600;color:var(--text-secondary);margin:20px 0 12px;padding:0;',
    });
  },

  _detailBlock(title, content) {
    const wrap = Utils.createElement('div', { style: 'margin-bottom:8px;' });
    wrap.appendChild(Utils.createElement('div', { textContent: title, style: 'font-weight:600;margin-bottom:2px;font-size:12px;' }));
    wrap.appendChild(Utils.createElement('pre', {
      textContent: content,
      style: 'white-space:pre-wrap;word-break:break-all;background:var(--bg-secondary);padding:6px;border-radius:var(--radius-sm);max-height:150px;overflow-y:auto;font-size:12px;',
    }));
    return wrap;
  },
};
