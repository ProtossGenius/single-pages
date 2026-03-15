/* ===== 应用入口 ===== */

async function main() {
  try {
    // 1. 初始化数据库
    await DB.init();

    // 2. 加载应用状态
    await Store.init();

    // 3. 初始化 UI 各模块
    MenuUI.init(document.getElementById('menu-bar'));
    CategoryUI.init(document.getElementById('category-panel'));
    DetailUI.init(document.getElementById('detail-panel'));
    EditorUI.init(document.getElementById('editor-panel'));
    ChatUI.init(document.getElementById('chat-panel'));
    StatusUI.init(document.getElementById('status-panel'));

    // 4. 加载最后编辑的章节
    await Store.loadLastChapter();

    console.log('AI 小说写作工具初始化完成');
  } catch (err) {
    console.error('应用初始化失败:', err);
    Utils.showToast('应用初始化失败: ' + err.message, 'error', 5000);
  }
}

document.addEventListener('DOMContentLoaded', main);
