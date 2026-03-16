/* ===== 设定更新 UI (P18) ===== */
const SettingUpdateUI = {
  _overlay: null,
  _originalData: null, // { categoryId: { description, attributes } }

  /** 构造分析提示词 */
  _buildAnalysisPrompt(categories, chapterContent, plotOutline, followUp) {
    let catInfo = '';
    for (const cat of categories) {
      let attrs = '';
      try {
        const obj = JSON.parse(cat.attributes || '{}');
        for (const [k, v] of Object.entries(obj)) {
          attrs += `  ${k}: ${v}\n`;
        }
      } catch {}
      catInfo += `【${cat.name}】(类型:${cat.type})\n描述: ${cat.description || '无'}\n属性:\n${attrs || '  无\n'}\n`;
    }

    return `你是一位小说设定管理专家。请根据以下章节内容和情节信息，分析哪些设定需要更新。

当前设定信息:
${catInfo}

当前章节内容:
${chapterContent || '(无内容)'}

当前情节描述:
${plotOutline || '(无)'}

后续情节 (仅作参考，不能将未来事件标记为已发生):
${followUp || '(无)'}

重要规则:
1. 设定信息反映的是当前时间点的状态
2. 后续情节中的事件尚未发生，不能作为已发生来更新设定
3. 仅更新需要变化的设定项

请以 JSON 格式返回需要更新的设定列表，格式如下:
[
  {
    "categoryId": "设定ID",
    "categoryName": "设定名称",
    "changes": {
      "description": "新的描述 (如果需要更新，否则不包含此字段)",
      "attributes": { "键": "新值" }
    }
  }
]

如果没有需要更新的设定，返回空数组 []。
只返回 JSON，不要包含其他内容。`;
  },

  /** 开始更新设定流程 */
  async start() {
    const bookId = Store.get('currentBookId');
    const chapterId = Store.get('currentChapterId');
    if (!chapterId) {
      Utils.showToast('请先选择一个章节', 'warning');
      return;
    }

    // 收集上下文
    const paragraphs = Store.get('paragraphs') || [];
    const chapterContent = paragraphs.map(p => p.content).filter(Boolean).join('\n\n');
    const plotOutline = Store.get('chapterOutline') || '';
    const followUp = Store.get('followUpSummary') || '';

    // 获取当前书籍的所有类目
    const allCategories = await DB.getAll(DB.STORES.CATEGORIES);
    const categories = bookId
      ? allCategories.filter(c => c.bookId === bookId)
      : allCategories;

    if (categories.length === 0) {
      Utils.showToast('当前书籍没有设定项', 'warning');
      return;
    }

    // 查找可用的高级模型
    const allModels = await DB.getAll(DB.STORES.AI_MODELS);
    const highModels = allModels.filter(m => m.intelligenceLevel === 'high');
    const bestModel = highModels[0] || allModels[0];
    if (!bestModel) {
      Utils.showToast('请先配置 AI 模型', 'warning');
      return;
    }

    Utils.showToast('正在分析设定变更...');

    const prompt = this._buildAnalysisPrompt(categories, chapterContent, plotOutline, followUp);

    try {
      const res = await AIService.call(bestModel.providerId, bestModel.id, prompt, { timeout: 60000 });
      const text = (res.text || '').trim();

      // 解析 JSON
      let changes;
      try {
        // 尝试提取 JSON 数组
        const match = text.match(/\[[\s\S]*\]/);
        changes = match ? JSON.parse(match[0]) : JSON.parse(text);
      } catch {
        Utils.showToast('AI 返回格式异常，请重试', 'error');
        return;
      }

      if (!Array.isArray(changes) || changes.length === 0) {
        Utils.showToast('AI 分析后认为无需更新设定');
        return;
      }

      // 保存原始数据用于撤销
      this._originalData = {};
      for (const cat of categories) {
        this._originalData[cat.id] = {
          description: cat.description,
          attributes: cat.attributes,
        };
      }

      await this._showPreview(changes, categories);
    } catch (err) {
      Utils.showToast('分析失败: ' + err.message, 'error');
    }
  },

  /** 显示设定更新预览弹窗 */
  async _showPreview(changes, categories) {
    const body = Utils.createElement('div', { style: 'min-width:500px;max-height:60vh;overflow-y:auto;' });

    body.appendChild(Utils.createElement('div', {
      textContent: '以下设定将被更新 (点击展开查看 diff):',
      style: 'margin-bottom:12px;font-size:13px;color:var(--text-secondary);',
    }));

    const catMap = {};
    for (const c of categories) catMap[c.id] = c;

    for (const change of changes) {
      const cat = catMap[change.categoryId];
      if (!cat) continue;

      const item = Utils.createElement('div', {
        style: 'border:1px solid var(--danger);border-radius:var(--radius);margin-bottom:8px;overflow:hidden;',
      });

      // Header
      const header = Utils.createElement('div', {
        style: 'display:flex;align-items:center;gap:6px;padding:8px 12px;cursor:pointer;background:var(--danger-soft);',
      });
      header.appendChild(Utils.createElement('span', { textContent: '🔴', style: 'flex-shrink:0;' }));
      header.appendChild(Utils.createElement('span', { textContent: `${cat.name}`, style: 'flex:1;font-weight:600;font-size:13px;' }));
      const toggleSpan = Utils.createElement('span', { textContent: '展开', style: 'font-size:12px;color:var(--text-muted);' });
      header.appendChild(toggleSpan);
      item.appendChild(header);

      // Diff content (hidden initially)
      const diffContent = Utils.createElement('div', { style: 'display:none;padding:8px 12px;font-size:12px;' });

      // Description diff
      if (change.changes.description !== undefined) {
        diffContent.appendChild(Utils.createElement('div', { textContent: '描述:', style: 'font-weight:600;margin-bottom:4px;' }));
        const descDiff = this._renderDiff(cat.description || '', change.changes.description || '');
        diffContent.appendChild(descDiff);
      }

      // Attributes diff
      if (change.changes.attributes) {
        diffContent.appendChild(Utils.createElement('div', { textContent: '属性:', style: 'font-weight:600;margin-top:8px;margin-bottom:4px;' }));
        let oldAttrs = '';
        try {
          const obj = JSON.parse(cat.attributes || '{}');
          oldAttrs = Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join('\n');
        } catch {}
        const newObj = { ...(JSON.parse(cat.attributes || '{}') || {}), ...change.changes.attributes };
        const newAttrs = Object.entries(newObj).map(([k, v]) => `${k}: ${v}`).join('\n');
        const attrDiff = this._renderDiff(oldAttrs, newAttrs);
        diffContent.appendChild(attrDiff);
      }

      item.appendChild(diffContent);

      header.addEventListener('click', () => {
        const visible = diffContent.style.display !== 'none';
        diffContent.style.display = visible ? 'none' : 'block';
        toggleSpan.textContent = visible ? '展开' : '收起';
      });

      body.appendChild(item);
    }

    body.appendChild(Utils.createElement('div', {
      textContent: '注: 后续情节仅作参考，不会直接更新',
      style: 'margin-top:8px;font-size:12px;color:var(--text-muted);',
    }));

    const btnRow = Utils.createElement('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px;' });
    const undoBtn = Utils.createElement('button', {
      className: 'btn btn-secondary', textContent: '全部撤销',
    });
    const confirmBtn = Utils.createElement('button', {
      className: 'btn btn-primary', textContent: '确认更新',
    });
    const cancelBtn = Utils.createElement('button', {
      className: 'btn btn-secondary', textContent: '取消',
    });
    btnRow.appendChild(undoBtn);
    btnRow.appendChild(confirmBtn);
    btnRow.appendChild(cancelBtn);
    body.appendChild(btnRow);

    this._overlay = Modal.show({ title: '设定更新预览', body, className: 'modal-wide' });

    confirmBtn.addEventListener('click', async () => {
      for (const change of changes) {
        const cat = catMap[change.categoryId];
        if (!cat) continue;

        if (change.changes.description !== undefined) {
          cat.description = change.changes.description;
        }
        if (change.changes.attributes) {
          const existing = JSON.parse(cat.attributes || '{}');
          Object.assign(existing, change.changes.attributes);
          cat.attributes = JSON.stringify(existing);
        }
        cat.version += 1;
        cat.updatedAt = Utils.now();
        await DB.put(DB.STORES.CATEGORIES, cat);
      }
      EventBus.emit(Events.CATEGORY_TREE_CHANGED);
      Utils.showToast('设定已更新');
      this._overlay.remove();
    });

    undoBtn.addEventListener('click', async () => {
      if (!this._originalData) { Utils.showToast('无需撤销'); return; }
      for (const [catId, orig] of Object.entries(this._originalData)) {
        const cat = await DB.getById(DB.STORES.CATEGORIES, catId);
        if (!cat) continue;
        cat.description = orig.description;
        cat.attributes = orig.attributes;
        await DB.put(DB.STORES.CATEGORIES, cat);
      }
      EventBus.emit(Events.CATEGORY_TREE_CHANGED);
      Utils.showToast('已撤销所有变更');
      this._overlay.remove();
    });

    cancelBtn.addEventListener('click', () => this._overlay.remove());
  },

  /** 渲染 diff — 使用 jsdiff 库 */
  _renderDiff(oldText, newText) {
    const container = Utils.createElement('div', {
      style: 'font-family:var(--font-mono);white-space:pre-wrap;word-break:break-all;line-height:1.6;padding:6px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-card);',
    });

    if (typeof Diff !== 'undefined' && Diff.diffWords) {
      const parts = Diff.diffWords(oldText, newText);
      for (const part of parts) {
        const span = document.createElement('span');
        if (part.added) {
          span.style.backgroundColor = '#dcfce7';
          span.style.color = '#16a34a';
        } else if (part.removed) {
          span.style.backgroundColor = '#fee2e2';
          span.style.color = '#dc2626';
          span.style.textDecoration = 'line-through';
        }
        span.textContent = part.value;
        container.appendChild(span);
      }
    } else {
      // Fallback: 无 jsdiff 时简单显示
      container.appendChild(Utils.createElement('div', {
        textContent: '旧: ' + oldText,
        style: 'background:#fee2e2;padding:4px;margin-bottom:4px;text-decoration:line-through;',
      }));
      container.appendChild(Utils.createElement('div', {
        textContent: '新: ' + newText,
        style: 'background:#dcfce7;padding:4px;',
      }));
    }

    return container;
  },
};
