/* ===== 聊天框 UI ===== */

const ChatUI = (() => {
  let container = null;

  function init(containerEl) {
    container = containerEl;

    // Tab 切换
    const tabs = container.querySelectorAll('.chat-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        switchTab(tab.dataset.tab);
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
    if (generateBtn) {
      generateBtn.addEventListener('click', handleGenerate);
    }

    const generateChapterBtn = document.getElementById('btn-generate-chapter');
    if (generateChapterBtn) {
      generateChapterBtn.addEventListener('click', handleGenerateChapter);
    }

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

    // 监听类目选中 → 在绑定设定 Tab 激活时可直接绑定
    EventBus.on(Events.CATEGORY_SELECTED, ({ id }) => {
      if (id && Store.get('chatTab') === 'bindings') {
        Store.addBoundSetting(id);
        refreshBindings();
      }
    });
  }

  function switchTab(tabName) {
    Store.setChatTab(tabName);

    // 更新 tab 按钮
    container.querySelectorAll('.chat-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });

    // 更新内容区
    container.querySelectorAll('.tab-content').forEach(tc => {
      const id = tc.id.replace('tab-', '');
      tc.classList.toggle('active', id === tabName);
    });
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
    if (genBtn) genBtn.disabled = disabled;
    if (genChapBtn) genChapBtn.disabled = disabled;
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
    // 由 FlowEngine 处理（P5 实现）
    try {
      const context = await collectContext();
      await FlowEngine.execute('generate_paragraph', context);
    } catch (err) {
      if (err.message.includes('not implemented')) {
        Utils.showToast('AI 引擎尚未实现，将在 P5 阶段完成', 'warning');
      } else {
        Utils.showToast('生成失败: ' + err.message, 'error');
      }
    }
  }

  async function handleGenerateChapter() {
    try {
      const context = await collectContext();
      await FlowEngine.execute('generate_chapter', context);
    } catch (err) {
      if (err.message.includes('not implemented')) {
        Utils.showToast('AI 引擎尚未实现，将在 P5 阶段完成', 'warning');
      } else {
        Utils.showToast('生成失败: ' + err.message, 'error');
      }
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

    return {
      context_before: Store.get('recapText') || '',
      user_input: Store.get('chapterOutline') || '',
      chapter_outline: Store.get('chapterOutline') || '',
      follow_up: Store.get('followUpSummary') || '',
      bound_settings: boundText,
      current_paragraph: '',
      chapter_content: chapterContent,
      ai_review: Store.get('aiReviewNotes') || '',
      generated_paragraph: '',
      generated_summary: '',
      generated_recap: '',
    };
  }

  return { init, refreshBindings, updateButtons, switchTab };
})();
