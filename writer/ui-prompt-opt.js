/* ===== 提示词优化 — 左右栏布局 (P18) ===== */
const PromptOptUI = {
  _active: false,
  _selectedLog: null,
  _advancedGenResult: '',

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
- 可用变量: 前文信息, 用户输入, 章节概述, 后续概要, 绑定设定, 当前段落, 章节内容
- 自定义变量: {{自定义:变量名}}
- 变量占位符在实际调用时会被替换为对应的值

用户意见:
{{用户意见}}

请返回以下 JSON 格式:
{
  "newPrompt": "优化后的提示词模板 (保留变量占位符)",
  "modelGapScore": 0
}

其中 modelGapScore 为 0-10 的整数，表示内容质量差距有多大程度是由模型能力差距导致的 (10=完全是模型差距, 0=完全是提示词问题)。
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

  /** 进入提示词优化界面 */
  async show() {
    this._active = true;
    this._selectedLog = null;
    this._advancedGenResult = '';

    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    // 保存原始内容引用
    this._savedChildren = Array.from(mainContent.children).map(c => ({
      el: c,
      display: c.style.display,
    }));

    // 隐藏所有原有内容
    for (const child of mainContent.children) {
      child.style.display = 'none';
    }

    // 创建提示词优化布局
    const container = Utils.createElement('div', {
      id: 'prompt-opt-container',
      style: 'display:flex;flex:1;overflow:hidden;height:100%;',
    });

    // === 左侧面板 ===
    const leftPanel = Utils.createElement('div', {
      style: 'width:260px;min-width:200px;border-right:1px solid var(--border);display:flex;flex-direction:column;padding:16px;background:var(--bg-card);flex-shrink:0;',
    });

    // 职能选择
    const roles = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    roles.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    leftPanel.appendChild(this._label('选择职能:'));
    const roleSelect = Utils.createElement('select', { className: 'form-select', style: 'margin-bottom:12px;' });
    roleSelect.appendChild(Utils.createElement('option', { value: '', textContent: '-- 请选择 --' }));
    for (const r of roles) {
      roleSelect.appendChild(Utils.createElement('option', { value: r.id, textContent: r.name }));
    }
    leftPanel.appendChild(roleSelect);

    // 模型选择
    leftPanel.appendChild(this._label('高级模型:'));
    const modelSelect = Utils.createElement('select', { className: 'form-select', style: 'margin-bottom:16px;' });
    modelSelect.appendChild(Utils.createElement('option', { value: '', textContent: '-- 请选择 --' }));
    const allModels = await DB.getAll(DB.STORES.AI_MODELS);
    allModels.sort((a, b) => {
      const order = { high: 0, medium: 1, basic: 2 };
      return (order[a.intelligenceLevel] || 1) - (order[b.intelligenceLevel] || 1);
    });
    for (const m of allModels) {
      const levelLabel = m.intelligenceLevel === 'high' ? ' ⭐' : '';
      modelSelect.appendChild(Utils.createElement('option', {
        value: `${m.providerId}|${m.id}`,
        textContent: `${m.name}${levelLabel}`,
      }));
    }
    leftPanel.appendChild(modelSelect);

    // 返回按钮
    leftPanel.appendChild(Utils.createElement('div', { style: 'flex:1;' }));
    leftPanel.appendChild(Utils.createElement('button', {
      className: 'btn btn-secondary', textContent: '← 返回编辑器',
      style: 'width:100%;',
      onClick: () => this.hide(),
    }));

    container.appendChild(leftPanel);

    // === 右侧主区域 ===
    const rightPanel = Utils.createElement('div', {
      style: 'flex:1;overflow-y:auto;padding:16px 20px;background:var(--bg-primary);',
    });
    const rightContent = Utils.createElement('div', { id: 'prompt-opt-right' });
    rightContent.appendChild(Utils.createElement('div', {
      textContent: '请在左侧选择职能以查看日志',
      style: 'color:var(--text-muted);padding:40px 0;text-align:center;font-size:14px;',
    }));
    rightPanel.appendChild(rightContent);
    container.appendChild(rightPanel);

    mainContent.appendChild(container);

    // 事件
    roleSelect.addEventListener('change', () => {
      this._loadRoleLogs(roleSelect.value, rightContent, modelSelect);
    });
  },

  /** 退出提示词优化界面 */
  hide() {
    this._active = false;
    const container = document.getElementById('prompt-opt-container');
    if (container) container.remove();

    // 恢复原有内容
    if (this._savedChildren) {
      for (const item of this._savedChildren) {
        item.el.style.display = item.display;
      }
      this._savedChildren = null;
    }
  },

  /** 加载某职能的日志 */
  async _loadRoleLogs(roleId, container, modelSelect) {
    container.innerHTML = '';
    if (!roleId) {
      container.appendChild(Utils.createElement('div', {
        textContent: '请选择职能',
        style: 'color:var(--text-muted);padding:40px 0;text-align:center;',
      }));
      return;
    }

    const role = await DB.getById(DB.STORES.ROLE_CONFIGS, roleId);
    if (!role) return;

    // 查询该职能的日志
    const allLogs = await DB.getAll(DB.STORES.AI_LOGS);
    const logs = allLogs
      .filter(l => l.roleId === roleId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);

    // Section: 日志列表
    container.appendChild(this._sectionTitle('职能日志'));

    if (logs.length === 0) {
      container.appendChild(Utils.createElement('div', {
        textContent: '该职能暂无日志记录',
        style: 'color:var(--text-muted);padding:16px 0;font-size:13px;',
      }));
    } else {
      const logList = Utils.createElement('div', { style: 'margin-bottom:20px;' });
      for (const log of logs) {
        logList.appendChild(this._renderLogItem(log, role));
      }
      container.appendChild(logList);
    }

    // Section: 高级 AI 生成
    container.appendChild(this._sectionDivider('高级 AI 生成'));
    const genResultBox = Utils.createElement('div', {
      style: 'min-height:60px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;font-size:13px;white-space:pre-wrap;background:var(--bg-card);color:var(--text-muted);',
    });
    genResultBox.textContent = this._advancedGenResult || '(点击下方按钮使用高级AI生成内容)';
    container.appendChild(genResultBox);

    const genBtn = Utils.createElement('button', {
      className: 'btn btn-secondary', textContent: '用高级AI生成内容',
      style: 'margin-bottom:20px;',
    });
    genBtn.addEventListener('click', async () => {
      if (!this._selectedLog) {
        Utils.showToast('请先展开一条日志', 'warning');
        return;
      }
      const modelVal = modelSelect.value;
      if (!modelVal) {
        Utils.showToast('请选择高级模型', 'warning');
        return;
      }
      const [pId, mId] = modelVal.split('|');
      genBtn.disabled = true;
      genBtn.textContent = '生成中...';
      try {
        const res = await AIService.call(pId, mId, this._selectedLog.prompt, { timeout: 60000 });
        this._advancedGenResult = res.text || '';
        genResultBox.textContent = this._advancedGenResult || '(空回复)';
        genResultBox.style.color = 'var(--text-primary)';
      } catch (err) {
        genResultBox.textContent = '生成失败: ' + err.message;
        genResultBox.style.color = 'var(--danger)';
      } finally {
        genBtn.disabled = false;
        genBtn.textContent = '用高级AI生成内容';
      }
    });
    container.appendChild(genBtn);

    // Section: 优化职能提示词
    container.appendChild(this._sectionDivider('优化职能提示词'));

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
      const modelVal = modelSelect.value;
      if (!modelVal) {
        Utils.showToast('请选择高级模型', 'warning');
        return;
      }
      const [pId, mId] = modelVal.split('|');
      const templateText = optTemplate.value || this._defaultOptTemplate;
      const filled = this._fillOptTemplate(templateText, role, userOpinion.value);

      optimizeBtn.disabled = true;
      optimizeBtn.textContent = '优化中...';
      try {
        const res = await AIService.call(pId, mId, filled, { timeout: 60000 });
        const text = (res.text || '').trim();

        // 尝试解析 JSON
        let parsed;
        try {
          const match = text.match(/\{[\s\S]*\}/);
          parsed = match ? JSON.parse(match[0]) : JSON.parse(text);
        } catch {
          // 非 JSON 格式，直接显示
          resultBox.innerHTML = '';
          resultBox.style.color = 'var(--text-primary)';
          resultBox.textContent = text;
          newPromptText = text;
          applyBtn.style.display = '';
          return;
        }

        newPromptText = parsed.newPrompt || text;
        const score = parsed.modelGapScore ?? '?';

        resultBox.innerHTML = '';
        resultBox.style.color = 'var(--text-primary)';

        resultBox.appendChild(Utils.createElement('div', {
          textContent: '新提示词:',
          style: 'font-weight:600;margin-bottom:4px;font-size:13px;',
        }));
        resultBox.appendChild(Utils.createElement('pre', {
          textContent: newPromptText,
          style: 'white-space:pre-wrap;font-size:12px;background:var(--bg-secondary);padding:8px;border-radius:var(--radius-sm);margin-bottom:8px;max-height:200px;overflow-y:auto;',
        }));
        resultBox.appendChild(Utils.createElement('div', {
          textContent: `模型差距评分: ${score}/10`,
          style: 'font-size:13px;color:var(--text-secondary);',
        }));
        if (score !== '?' && score <= 3) {
          resultBox.appendChild(Utils.createElement('div', {
            textContent: '(内容劣质主要由提示词导致)',
            style: 'font-size:12px;color:var(--warning);',
          }));
        } else if (score !== '?' && score >= 7) {
          resultBox.appendChild(Utils.createElement('div', {
            textContent: '(内容劣质主要由模型能力差距导致)',
            style: 'font-size:12px;color:var(--text-muted);',
          }));
        }

        applyBtn.style.display = '';
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

  /** 渲染单条日志 (可展开) */
  _renderLogItem(log, role) {
    const item = Utils.createElement('div', {
      style: 'border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;overflow:hidden;',
    });

    const icon = log.status === 'success' ? '✅' : '❌';
    const header = Utils.createElement('div', {
      style: 'display:flex;gap:6px;align-items:center;padding:8px 12px;cursor:pointer;font-size:13px;',
    });
    header.appendChild(Utils.createElement('span', { textContent: icon }));
    header.appendChild(Utils.createElement('span', {
      textContent: Utils.formatTime(log.createdAt),
      style: 'color:var(--text-muted);font-size:12px;',
    }));
    header.appendChild(Utils.createElement('span', {
      textContent: `${(log.duration / 1000).toFixed(1)}s`,
      style: 'color:var(--text-muted);font-size:12px;',
    }));
    header.appendChild(Utils.createElement('span', {
      textContent: Utils.truncate ? Utils.truncate(log.response || log.error || '', 40) : (log.response || log.error || '').slice(0, 40),
      style: 'flex:1;color:var(--text-secondary);font-size:12px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;',
    }));
    item.appendChild(header);

    const detail = Utils.createElement('div', { style: 'display:none;padding:8px 12px;font-size:12px;border-top:1px solid var(--border-light);' });

    // 带变量名的提示词
    detail.appendChild(this._detailBlock('带变量名的提示词:', role.promptTemplate || ''));

    // 变量展开后的提示词
    detail.appendChild(this._detailBlock('变量展开后的提示词:', log.prompt || ''));

    // 变量值
    if (role.promptTemplate) {
      const vars = this._extractVarValues(role.promptTemplate, log.prompt);
      if (vars.length > 0) {
        detail.appendChild(Utils.createElement('div', {
          textContent: '变量值:',
          style: 'font-weight:600;margin-bottom:4px;margin-top:8px;',
        }));
        const varTable = Utils.createElement('div', { style: 'background:var(--bg-secondary);padding:6px;border-radius:var(--radius-sm);margin-bottom:8px;' });
        for (const { name, value } of vars) {
          varTable.appendChild(Utils.createElement('div', {
            textContent: `${name} = "${value.slice(0, 100)}${value.length > 100 ? '...' : ''}"`,
            style: 'margin-bottom:2px;',
          }));
        }
        detail.appendChild(varTable);
      }
    }

    // 原始输出
    detail.appendChild(this._detailBlock('原始输出:', log.status === 'success' ? (log.response || '') : `错误: ${log.error || ''}`));

    // 选中此日志按钮
    const useBtn = Utils.createElement('button', {
      className: 'btn btn-sm btn-secondary', textContent: '选用此日志',
      style: 'margin-top:4px;',
    });
    useBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._selectedLog = log;
      Utils.showToast('已选用此日志作为优化参考');
    });
    detail.appendChild(useBtn);

    item.appendChild(detail);

    header.addEventListener('click', () => {
      const visible = detail.style.display !== 'none';
      detail.style.display = visible ? 'none' : 'block';
      if (!visible) {
        this._selectedLog = log;
      }
    });

    return item;
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
    // Simple heuristic: split template by variable markers and match against actual
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

  /** 填充优化提示词模板 */
  _fillOptTemplate(template, role, userOpinion) {
    const log = this._selectedLog;
    return template
      .replace(/\{\{原始提示词_变量版\}\}/g, role.promptTemplate || '')
      .replace(/\{\{原始提示词_展开版\}\}/g, log ? (log.prompt || '') : '')
      .replace(/\{\{原始输出\}\}/g, log ? (log.response || '') : '')
      .replace(/\{\{高级AI输出\}\}/g, this._advancedGenResult || '')
      .replace(/\{\{用户意见\}\}/g, userOpinion || '')
      .replace(/\{\{提示词规则\}\}/g, '使用 {{变量名}} 作为变量占位符。可用变量: 前文信息, 用户输入, 章节概述, 后续概要, 绑定设定, 当前段落, 章节内容。自定义变量: {{自定义:变量名}}。');
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
    wrap.appendChild(Utils.createElement('div', { textContent: title, style: 'font-weight:600;margin-bottom:2px;' }));
    wrap.appendChild(Utils.createElement('pre', {
      textContent: content,
      style: 'white-space:pre-wrap;word-break:break-all;background:var(--bg-secondary);padding:6px;border-radius:var(--radius-sm);max-height:150px;overflow-y:auto;',
    }));
    return wrap;
  },
};
