/* ===== 聊天框 UI (V2: 可折叠区块) ===== */

const ChatUI = (() => {
  let container = null;

  function init(containerEl) {
    container = containerEl;

    // V2: 可折叠区块切换
    container.querySelectorAll('.chat-section-title').forEach(title => {
      title.addEventListener('click', () => {
        const section = title.parentElement;
        const body = section.querySelector('.chat-section-body');
        const expanded = section.classList.toggle('expanded');
        body.style.display = expanded ? '' : 'none';
        title.textContent = (expanded ? '▼ ' : '▶ ') + title.textContent.replace(/^[▼▶]\s*/, '');
      });
    });

    // 状态栏折叠切换
    const statusBar = container.querySelector('#ai-status-bar') ||
                      container.querySelector('.ai-status-bar');
    if (statusBar) {
      const summary = statusBar.querySelector('.ai-status-summary');
      if (summary) {
        summary.addEventListener('click', () => {
          statusBar.classList.toggle('collapsed');
        });
      }
    }

    // 输入框事件
    const outlineInput = document.getElementById('input-outline');
    if (outlineInput) {
      outlineInput.addEventListener('input', () => {
        Store.setChapterOutline(outlineInput.value);
      });
    }

    const followUpInput = document.getElementById('input-followUp');
    if (followUpInput) {
      followUpInput.addEventListener('input', () => {
        Store.setFollowUpSummary(followUpInput.value);
      });
    }

    // 按钮事件
    const generateBtn = document.getElementById('btn-generate');
    if (generateBtn) generateBtn.addEventListener('click', handleGenerate);

    const generateChapterBtn = document.getElementById('btn-generate-chapter');
    if (generateChapterBtn) generateChapterBtn.addEventListener('click', handleGenerateChapter);

    // V2: 直接添加按钮
    const directAddBtn = document.getElementById('btn-direct-add');
    if (directAddBtn) directAddBtn.addEventListener('click', handleDirectAdd);

    // V2: 批量生成按钮
    const batchBtn = document.getElementById('btn-batch-generate');
    if (batchBtn) batchBtn.addEventListener('click', handleBatchGenerate);

    // V2: 风格标签
    const addTagBtn = document.getElementById('btn-add-style-tag');
    if (addTagBtn) addTagBtn.addEventListener('click', addStyleTag);
    const tagInput = document.getElementById('style-tag-input');
    if (tagInput) {
      tagInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addStyleTag(); });
      tagInput.addEventListener('input', () => {
        // 自动调整宽度
        const len = tagInput.value.length;
        tagInput.style.width = Math.min(200, Math.max(80, len * 12 + 20)) + 'px';
      });
    }
    renderStyleTags();

    // 监听绑定设定添加
    EventBus.on(Events.BINDING_ADD_REQUEST, ({ categoryId }) => {
      Store.addBoundSetting(categoryId);
      refreshBindings();
    });
    EventBus.on(Events.BINDING_ADDED, () => refreshBindings());
    EventBus.on(Events.BINDING_REMOVED, () => refreshBindings());

    // 监听 AI 状态
    EventBus.on(Events.AI_TASK_STARTED, () => updateButtons());
    EventBus.on(Events.AI_TASK_COMPLETED, () => updateButtons());
    EventBus.on(Events.AI_TASK_FAILED, () => updateButtons());
    EventBus.on(Events.AI_TASK_PROGRESS, updateStatusBar);
  }

  // V2: 风格标签管理
  function renderStyleTags() {
    const container = document.getElementById('style-tags-container');
    if (!container) return;
    container.innerHTML = '';
    const tags = Store.get('styleTags') || [];
    for (const tag of tags) {
      const el = Utils.createElement('span', { className: 'style-tag' }, [
        document.createTextNode(tag),
        Utils.createElement('span', {
          className: 'style-tag-remove', textContent: '×',
          onClick: () => { removeStyleTag(tag); },
        }),
      ]);
      container.appendChild(el);
    }
  }

  function addStyleTag() {
    const input = document.getElementById('style-tag-input');
    const name = input ? input.value.trim() : '';
    if (!name) return;
    const tags = Store.get('styleTags') || [];
    if (!tags.includes(name)) {
      tags.push(name);
      Store.setStyleTags(tags);
    }
    if (input) { input.value = ''; input.style.width = '80px'; }
    renderStyleTags();
  }

  function removeStyleTag(tag) {
    const tags = (Store.get('styleTags') || []).filter(t => t !== tag);
    Store.setStyleTags(tags);
    renderStyleTags();
  }

  // V2: 直接添加 — 将情节概述文本作为新段落
  async function handleDirectAdd() {
    const outlineInput = document.getElementById('input-outline');
    const text = outlineInput ? outlineInput.value.trim() : '';
    if (!text) { Utils.showToast('请先输入情节概述', 'warning'); return; }

    const chapterId = Store.get('currentChapterId');
    if (!chapterId) { Utils.showToast('请先选择一个章节', 'warning'); return; }

    const paragraphs = Store.get('paragraphs') || [];
    await DB.put(DB.STORES.PARAGRAPHS, {
      id: Utils.generateId(),
      chapterId,
      content: text,
      sortOrder: paragraphs.length + 1,
      recapBrief: '',
      followUp: '',
      createdAt: Utils.now(),
      updatedAt: Utils.now(),
    });
    outlineInput.value = '';
    Store.setChapterOutline('');
    EventBus.emit(Events.PARAGRAPH_ADDED);
    Utils.showToast('段落已添加');
  }

  // V2: 批量生成 — 逐行处理大纲
  async function handleBatchGenerate() {
    const importInput = document.getElementById('input-outline-import');
    const text = importInput ? importInput.value.trim() : '';
    if (!text) { Utils.showToast('请先输入大纲', 'warning'); return; }

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    Utils.showToast(`开始批量生成 ${lines.length} 个段落...`);

    for (let i = 0; i < lines.length; i++) {
      try {
        Store.setChapterOutline(lines[i]);
        const context = await collectContext();
        await FlowEngine.execute('generate_paragraph', context);
      } catch (err) {
        Utils.showToast(`第 ${i + 1} 行失败: ${err.message}`, 'error');
        break;
      }
    }

    importInput.value = '';
    Utils.showToast('批量生成完成');
  }

  async function refreshBindings() {
    const listEl = document.getElementById('binding-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const boundIds = Store.get('boundSettings');
    if (!boundIds || boundIds.length === 0) {
      listEl.appendChild(Utils.createElement('p', {
        className: 'hint-text',
        textContent: '在左侧类目管理器中点击项目以添加绑定',
      }));
      return;
    }

    for (const catId of boundIds) {
      const cat = await DB.getById(DB.STORES.CATEGORIES, catId);
      if (!cat) continue;

      const path = await getCategoryPath(catId);
      const item = Utils.createElement('div', { className: 'binding-item' });
      item.appendChild(Utils.createElement('span', {
        className: 'binding-path',
        textContent: `🔹 ${path} (v${cat.version})`,
      }));
      const removeBtn = Utils.createElement('span', {
        className: 'binding-remove',
        textContent: '×',
        title: '移除',
      });
      removeBtn.addEventListener('click', () => {
        Store.removeBoundSetting(catId);
      });
      item.appendChild(removeBtn);
      listEl.appendChild(item);
    }
  }

  async function getCategoryPath(catId) {
    const parts = [];
    let current = await DB.getById(DB.STORES.CATEGORIES, catId);
    while (current) {
      parts.unshift(current.name);
      if (current.parentId) {
        current = await DB.getById(DB.STORES.CATEGORIES, current.parentId);
      } else {
        break;
      }
    }
    return parts.join(' > ');
  }

  function updateButtons() {
    const running = Store.get('aiRunning');
    const blocking = Store.get('aiBlocking');
    const disabled = running && blocking;

    const genBtn = document.getElementById('btn-generate');
    const genChapBtn = document.getElementById('btn-generate-chapter');
    const directBtn = document.getElementById('btn-direct-add');
    const batchBtn = document.getElementById('btn-batch-generate');
    if (genBtn) genBtn.disabled = disabled;
    if (genChapBtn) genChapBtn.disabled = disabled;
    if (directBtn) directBtn.disabled = disabled;
    if (batchBtn) batchBtn.disabled = disabled;
  }

  function updateStatusBar(status) {
    const textEl = container.querySelector('.ai-status-text');
    const detailEl = container.querySelector('.ai-status-detail');
    if (!status) {
      if (textEl) textEl.textContent = 'AI 空闲';
      if (detailEl) detailEl.innerHTML = '';
      return;
    }

    if (textEl) {
      textEl.textContent = `主流程 ${status.currentStep + 1}/${status.totalSteps}  ${status.currentRoleName || ''}`;
    }

    if (detailEl && status.steps) {
      detailEl.innerHTML = '';
      for (const step of status.steps) {
        const stepEl = Utils.createElement('div', { className: 'ai-step-item' });
        const icon = step.status === 'completed' ? '✅' :
                     step.status === 'running' ? '🔄' :
                     step.status === 'failed' ? '❌' : '⏳';
        stepEl.appendChild(Utils.createElement('div', {
          textContent: `步骤 ${step.index + 1}: ${icon} ${step.status} (${(step.duration / 1000).toFixed(1)}s)`,
        }));

        if (step.roles) {
          for (const role of step.roles) {
            const roleEl = Utils.createElement('div', { className: 'ai-role-item' });
            const rIcon = role.status === 'completed' ? '✅' :
                          role.status === 'running' ? '🔄' :
                          role.status === 'failed' ? '❌' : '⏳';
            roleEl.textContent = `${rIcon} ${role.displayName}: ${role.status} (${(role.duration / 1000).toFixed(1)}s) 失败 ${role.failCount}/${role.maxRetry}`;
            stepEl.appendChild(roleEl);

            if (role.error) {
              const errEl = Utils.createElement('div', {
                className: 'ai-error-msg',
                textContent: `❌ ${role.error}`,
                title: '点击复制',
              });
              errEl.addEventListener('click', () => {
                Utils.copyToClipboard(role.error);
                Utils.showToast('已复制到剪贴板');
              });
              stepEl.appendChild(errEl);
            }
          }
        }

        detailEl.appendChild(stepEl);
      }
    }
  }

  async function handleGenerate() {
    try {
      const context = await collectContext();
      await FlowEngine.execute('generate_paragraph', context);
    } catch (err) {
      Utils.showToast('生成失败: ' + err.message, 'error');
    }
  }

  async function handleGenerateChapter() {
    try {
      const context = await collectContext();
      await FlowEngine.execute('generate_chapter', context);
    } catch (err) {
      Utils.showToast('生成失败: ' + err.message, 'error');
    }
  }

  async function collectContext() {
    const boundIds = Store.get('boundSettings') || [];
    let boundText = '';
    for (const catId of boundIds) {
      const cat = await DB.getById(DB.STORES.CATEGORIES, catId);
      if (cat) {
        const path = await getCategoryPath(catId);
        boundText += `[${path}] ${cat.description || ''}\n`;
        try {
          const attrs = JSON.parse(cat.attributes || '{}');
          for (const [k, v] of Object.entries(attrs)) {
            boundText += `  ${k}: ${v}\n`;
          }
        } catch {}
      }
    }

    // 当前章节内容
    const paragraphs = Store.get('paragraphs') || [];
    const chapterContent = paragraphs.map(p => p.content).filter(Boolean).join('\n\n');

    // V2: 风格标签作为额外上下文
    const styleTags = Store.get('styleTags') || [];
    const styleContext = styleTags.length > 0 ? `风格: ${styleTags.join(', ')}` : '';

    return {
      context_before: Store.get('recapText') || '',
      user_input: Store.get('chapterOutline') || '',
      chapter_outline: Store.get('chapterOutline') || '',
      follow_up: Store.get('followUpSummary') || '',
      bound_settings: boundText + (styleContext ? '\n' + styleContext : ''),
      current_paragraph: '',
      chapter_content: chapterContent,
      ai_review: Store.get('aiReviewNotes') || '',
      generated_paragraph: '',
      generated_summary: '',
      generated_recap: '',
    };
  }

  // Keep switchTab as no-op for backward compatibility
  function switchTab() {}

  return { init, refreshBindings, updateButtons, switchTab, renderStyleTags, collectContext };
})();
