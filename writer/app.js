/* ===== 应用入口 ===== */

async function main() {
  try {
    // 1. 初始化数据库
    await DB.init();

    // 2. 加载应用状态
    await Store.init();

    // 2.5 创建默认职能和流程配置（首次启动时）
    await ensureDefaultConfigs();

    // 3. 初始化 UI 各模块
    MenuUI.init(document.getElementById('menu-bar'));
    CategoryUI.init(document.getElementById('category-panel'));
    DetailUI.init(document.getElementById('detail-panel'));
    EditorUI.init(document.getElementById('editor-panel'));
    ChatUI.init(document.getElementById('chat-panel'));
    StatusUI.init(document.getElementById('status-panel'));
    SidebarUI.init(
      document.getElementById('icon-sidebar'),
      document.getElementById('sidebar-panel'),
      document.getElementById('main-content')
    );

    // 4. 加载最后编辑的章节
    await Store.loadLastChapter();

    console.log('AI 小说写作工具初始化完成');
  } catch (err) {
    console.error('应用初始化失败:', err);
    Utils.showToast('应用初始化失败: ' + err.message, 'error', 5000);
  }
}

/**
 * 首次启动时创建默认职能和流程配置
 */
async function ensureDefaultConfigs() {
  const now = Utils.now();

  // 检查职能表是否为空
  const existingRoles = await DB.getAll(DB.STORES.ROLE_CONFIGS);
  if (existingRoles.length === 0) {
    const writerId = Utils.generateId();
    const reviewerId = Utils.generateId();
    const summaryId = Utils.generateId();

    await DB.put(DB.STORES.ROLE_CONFIGS, {
      id: writerId, name: '写手',
      promptTemplate: '你是一位优秀的小说写手。请根据以下信息续写一个段落。\n\n前文信息:\n{{前文信息}}\n\n章节概述:\n{{章节概述}}\n\n绑定设定:\n{{绑定设定}}\n\n用户要求:\n{{用户输入}}\n\n请直接输出续写的段落内容，不要包含任何解释。',
      outputVar: 'generated_paragraph',
      customVars: '[]', providerId: '', modelId: '',
      sortOrder: 0, createdAt: now, updatedAt: now,
    });
    await DB.put(DB.STORES.ROLE_CONFIGS, {
      id: reviewerId, name: '评审',
      promptTemplate: '你是一位资深的小说评审。请审阅以下段落，给出改进建议。\n\n章节概述:\n{{章节概述}}\n\n生成的段落:\n{{生成段落}}\n\n请给出简洁的评审意见，指出优点和需要改进的地方。',
      outputVar: 'ai_review',
      customVars: '[]', providerId: '', modelId: '',
      sortOrder: 1, createdAt: now, updatedAt: now,
    });
    await DB.put(DB.STORES.ROLE_CONFIGS, {
      id: summaryId, name: '概要',
      promptTemplate: '你是一位小说内容概要专家。请为以下章节内容生成一段简洁的概要。\n\n章节内容:\n{{章节内容}}\n\n请输出概要内容，控制在200字以内。',
      outputVar: 'generated_summary',
      customVars: '[]', providerId: '', modelId: '',
      sortOrder: 2, createdAt: now, updatedAt: now,
    });

    // 检查流程表是否也为空，创建默认流程
    const existingFlows = await DB.getAll(DB.STORES.FLOW_CONFIGS);
    if (existingFlows.length === 0) {
      await DB.put(DB.STORES.FLOW_CONFIGS, {
        id: Utils.generateId(), name: '段落生成',
        trigger: 'generate_paragraph', enabled: true, blocking: true,
        steps: JSON.stringify([[writerId], [reviewerId]]),
        sortOrder: 0, createdAt: now, updatedAt: now,
      });
      await DB.put(DB.STORES.FLOW_CONFIGS, {
        id: Utils.generateId(), name: '章节概要',
        trigger: 'generate_chapter', enabled: true, blocking: false,
        steps: JSON.stringify([[summaryId]]),
        sortOrder: 1, createdAt: now, updatedAt: now,
      });
    }
  }
}

// Only auto-init when not in test mode
if (typeof TestRunner === 'undefined') {
  document.addEventListener('DOMContentLoaded', main);
}
