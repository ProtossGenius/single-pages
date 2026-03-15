# AI 小说写作工具 — 架构设计文档

> 版本: 1.0  
> 最后更新: 2026-03-15  
> 关联文档: [需求文档](requirements.md) | [数据设计](data-design.md) | [流程设计](flow-design.md)

---

## 1. 技术选型

| 层面 | 选型 | 说明 |
|------|------|------|
| UI 框架 | 无框架，原生 JS | 与父项目一致 |
| 样式 | 原生 CSS | CSS 变量 + 语义化类名 |
| 数据持久化 | IndexedDB | 浏览器本地存储 |
| 压缩/解压 | JSZip (vendor/) | 文件导入导出 |
| UUID 生成 | crypto.randomUUID() | 浏览器原生 API |
| AI 调用 | fetch API | OpenAI 兼容接口 |

---

## 2. 目录结构

```
writer/
├── index.html                  // 主页面
├── style.css                   // 全局样式
├── app.js                      // 应用入口, 初始化
├── test.html                   // 测试页面
├── test.js                     // 测试代码
│
├── db.js                       // IndexedDB 数据库层
├── store.js                    // 应用状态管理 (内存中的状态)
├── events.js                   // 全局事件总线
│
├── ui-menu.js                  // 菜单栏 UI
├── ui-category.js              // 类目管理器 UI (树形视图)
├── ui-detail.js                // 详情面板 UI
├── ui-editor.js                // 小说编写区 UI (章节名+段落)
├── ui-chat.js                  // 聊天框 UI (状态栏+输入+按钮)
├── ui-status.js                // 当前状态面板 UI
├── ui-modal.js                 // 模态对话框通用组件
├── ui-ai-config.js             // AI 配置对话框 (供应商管理)
├── ui-role-config.js           // 职能配置对话框
├── ui-flow-config.js           // 流程配置对话框
│
├── ai-service.js               // AI 调用服务层
├── flow-engine.js              // 流程执行引擎
├── recap-engine.js             // 前情提要生成引擎
├── export-service.js           // 导出服务
├── import-service.js           // 导入服务
│
├── enums.js                    // 枚举定义
├── utils.js                    // 工具函数
│
├── docs/                       // 设计文档
│   ├── requirements.md
│   ├── ui-design.md
│   ├── data-design.md
│   ├── flow-design.md
│   ├── architecture.md
│   └── tasks.md
│
└── vendor/                     // 第三方库
    └── jszip.min.js            // JSZip 压缩库
```

---

## 3. 分层架构

```
┌─────────────────────────────────────────────┐
│                  UI 层                      │
│  (ui-*.js: 渲染、交互)                      │
├─────────────────────────────────────────────┤
│              事件总线 (events.js)            │
├─────────────────────────────────────────────┤
│                服务层                        │
│  (ai-service, flow-engine, recap-engine,    │
│   export/import-service)                    │
├─────────────────────────────────────────────┤
│             状态层 (store.js)               │
├─────────────────────────────────────────────┤
│             数据层 (db.js)                  │
│           (IndexedDB 封装)                  │
└─────────────────────────────────────────────┘
```

### 3.1 各层职责

#### 数据层 (db.js)
- IndexedDB 连接管理（打开、升级、事务）
- 为每个 ObjectStore 提供 CRUD 方法
- 返回 Promise 接口
- 不包含业务逻辑

#### 状态层 (store.js)
- 管理应用运行时状态（当前选中项、当前章节、AI 运行状态等）
- 提供状态变更方法
- 状态变更时通过事件总线通知 UI 层

#### 事件总线 (events.js)
- 简单的发布/订阅模式
- 解耦 UI 层和服务层
- 支持命名空间事件

```javascript
// 事件总线 API
EventBus.on(event, handler)
EventBus.off(event, handler)
EventBus.emit(event, data)
```

#### 服务层
- 业务逻辑实现
- 调用数据层进行持久化
- 通过事件总线通知状态变化

#### UI 层 (ui-*.js)
- DOM 渲染和更新
- 用户交互处理
- 监听事件总线更新视图
- 每个 UI 模块管理自己的 DOM 区域

---

## 4. 核心模块设计

### 4.1 db.js — 数据库封装

```javascript
// 公开 API
const DB = {
  init()                          // 初始化数据库连接
  
  // 通用 CRUD
  getById(storeName, id)          // 按主键获取
  getAll(storeName)               // 获取全部
  getByIndex(storeName, indexName, value)  // 按索引查询
  put(storeName, data)            // 新增或更新
  delete(storeName, id)           // 删除
  clear(storeName)                // 清空表
  
  // 事务支持
  transaction(storeNames, mode, callback)  // 手动事务
}
```

### 4.2 store.js — 应用状态

```javascript
// 状态结构
const AppState = {
  // 类目相关
  selectedCategoryId: null,       // 当前选中的类目 ID
  categoryTree: [],               // 类目树形数据缓存
  
  // 编辑器相关
  currentChapterId: null,         // 当前编辑的章节 ID
  currentParagraphId: null,       // 当前选中的段落 ID
  paragraphs: [],                 // 当前章节的段落列表
  
  // 聊天框
  chatTab: 'outline',             // 'outline' | 'followUp' | 'bindings'
  chapterOutline: '',             // 章节概述输入
  followUpSummary: '',            // 后续概要输入
  boundSettings: [],              // 绑定的设定 ID 列表
  
  // AI 运行状态
  aiRunning: false,               // 是否有 AI 任务运行中
  aiBlocking: false,              // 是否阻塞按钮
  aiStatus: null,                 // AI 状态详情对象
  
  // 右侧面板
  chapterSummary: '',             // 章节概要
  aiReviewNotes: '',              // AI 评审意见
  recapText: '',                  // 前情提要
}
```

### 4.3 events.js — 事件定义

```javascript
// 事件名称常量
const Events = {
  // 类目事件
  CATEGORY_SELECTED:    'category:selected',
  CATEGORY_UPDATED:     'category:updated',
  CATEGORY_DELETED:     'category:deleted',
  CATEGORY_TREE_CHANGED:'category:treeChanged',
  
  // 编辑器事件
  CHAPTER_CHANGED:      'chapter:changed',
  PARAGRAPH_SELECTED:   'paragraph:selected',
  PARAGRAPH_ADDED:      'paragraph:added',
  PARAGRAPH_UPDATED:    'paragraph:updated',
  
  // AI 事件
  AI_TASK_STARTED:      'ai:taskStarted',
  AI_TASK_PROGRESS:     'ai:taskProgress',
  AI_TASK_COMPLETED:    'ai:taskCompleted',
  AI_TASK_FAILED:       'ai:taskFailed',
  
  // 状态面板
  STATUS_UPDATED:       'status:updated',
  
  // 文件操作
  DATA_IMPORTED:        'data:imported',
  DATA_EXPORTED:        'data:exported',
}
```

### 4.4 flow-engine.js — 流程引擎

```javascript
// 流程引擎 API
const FlowEngine = {
  // 执行流程
  async execute(trigger, context) {
    // 1. 查找匹配的流程配置
    // 2. 按二维数组执行
    // 3. 返回最终 context
  },
  
  // 执行单个步骤 (并行)
  async executeStep(roles, context) {
    // Promise.all 并行执行同一步骤中的所有职能
  },
  
  // 执行单个职能
  async executeRole(role, context) {
    // 1. 获取配置
    // 2. 替换变量
    // 3. 调用 AI
    // 4. 写入输出变量
  },
  
  // 获取当前状态
  getStatus() { /* 返回状态对象 */ },
  
  // 取消执行 (预留)
  cancel() { /* ... */ }
}
```

### 4.5 ai-service.js — AI 调用服务

```javascript
// AI 服务 API
const AIService = {
  // 调用 AI
  async call(providerId, modelId, prompt, options) {
    // 1. 获取供应商配置
    // 2. 构造 OpenAI 兼容请求
    // 3. 发送请求（含重试）
    // 4. 返回结果
  },
  
  // 重试逻辑
  async callWithRetry(provider, model, prompt, retryCount) {
    // 循环重试，记录每次失败原因
  }
}
```

---

## 5. UI 组件通信

```
     ┌──────────┐     emit      ┌──────────┐
     │ ui-      │──────────────→│ events   │
     │ category │               │ (bus)    │
     └──────────┘               └──────────┘
                                     │
                                     │ on
                                     ▼
                                ┌──────────┐
                                │ ui-      │
                                │ detail   │
                                └──────────┘

UI 组件之间通过 EventBus 解耦通信，不直接调用。
```

### 5.1 UI 模块挂载方式

每个 UI 模块导出一个 `init(containerElement)` 函数：

```javascript
// 示例: ui-category.js
const CategoryUI = {
  init(container) {
    this.container = container;
    this.render();
    this.bindEvents();
  },
  
  render() { /* 渲染 DOM */ },
  bindEvents() { /* 绑定事件监听 */ },
  refresh() { /* 刷新数据 */ }
}
```

### 5.2 app.js 启动流程

```javascript
// app.js
async function main() {
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
}

document.addEventListener('DOMContentLoaded', main);
```

---

## 6. 第三方依赖

| 库 | 版本 | 用途 | 下载方式 |
|----|------|------|----------|
| JSZip | 3.x | ZIP 压缩/解压 | 下载 min.js 到 vendor/ |

仅需一个第三方库 (JSZip)，用于文件导入导出功能。

---

## 7. 模块依赖关系

```
app.js
├── db.js
├── store.js (→ db.js, events.js)
├── events.js
├── enums.js
├── utils.js
│
├── ui-menu.js (→ events.js, ui-modal.js)
│   ├── ui-ai-config.js (→ db.js, events.js, ui-modal.js)
│   ├── ui-role-config.js (→ db.js, events.js, enums.js, ui-modal.js)
│   └── ui-flow-config.js (→ db.js, events.js, enums.js, ui-modal.js)
│
├── ui-category.js (→ db.js, events.js, store.js)
├── ui-detail.js (→ db.js, events.js, store.js)
├── ui-editor.js (→ db.js, events.js, store.js)
├── ui-chat.js (→ events.js, store.js, flow-engine.js)
├── ui-status.js (→ events.js, store.js)
│
├── ai-service.js (→ db.js)
├── flow-engine.js (→ ai-service.js, db.js, events.js, enums.js)
├── recap-engine.js (→ ai-service.js, db.js)
├── export-service.js (→ db.js, vendor/jszip)
└── import-service.js (→ db.js, vendor/jszip)
```

---

## 8. HTML 脚本加载顺序

```html
<!-- 第三方库 -->
<script src="vendor/jszip.min.js"></script>

<!-- 基础层 -->
<script src="enums.js"></script>
<script src="utils.js"></script>
<script src="events.js"></script>
<script src="db.js"></script>
<script src="store.js"></script>

<!-- 服务层 -->
<script src="ai-service.js"></script>
<script src="flow-engine.js"></script>
<script src="recap-engine.js"></script>
<script src="export-service.js"></script>
<script src="import-service.js"></script>

<!-- UI 层 -->
<script src="ui-modal.js"></script>
<script src="ui-menu.js"></script>
<script src="ui-category.js"></script>
<script src="ui-detail.js"></script>
<script src="ui-editor.js"></script>
<script src="ui-chat.js"></script>
<script src="ui-status.js"></script>
<script src="ui-ai-config.js"></script>
<script src="ui-role-config.js"></script>
<script src="ui-flow-config.js"></script>

<!-- 入口 -->
<script src="app.js"></script>
```

---

## 9. 错误处理策略

| 场景 | 处理方式 |
|------|----------|
| IndexedDB 操作失败 | 捕获异常，显示错误提示 |
| AI 调用失败 | 按配置重试，记录每次失败原因 |
| AI 调用全部失败 | 标记任务失败，恢复按钮状态，显示错误 |
| 导入文件格式错误 | 验证 manifest，显示具体错误信息 |
| 压缩/解压失败 | 捕获异常，显示错误提示 |

---

## 10. 安全考虑

| 风险 | 对策 |
|------|------|
| API Key 泄露 | 仅存在 IndexedDB 中，不暴露到 DOM |
| XSS 攻击 | 用户输入写入 DOM 时使用 textContent 而非 innerHTML |
| 导入恶意数据 | 导入时对 JSON 数据进行结构验证 |
| AI 返回恶意内容 | AI 返回内容也用 textContent 渲染 |
