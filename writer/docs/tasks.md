# AI 小说写作工具 — 工作任务文档

> 版本: 2.0  
> 最后更新: 2026-03-16  
> **本文档是项目开发的唯一进度追踪入口，恢复工作时从此文档开始。**

---

## 文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 需求文档 | [requirements.md](requirements.md) | 功能需求与非功能需求定义 |
| UI 设计文档 | [ui-design.md](ui-design.md) | 界面布局、组件设计、配色、交互说明 |
| 数据设计文档 | [data-design.md](data-design.md) | IndexedDB 表结构、枚举定义、导入导出格式 |
| 流程设计文档 | [flow-design.md](flow-design.md) | 生成段落/章节、前情提要、导入导出流程 |
| 架构设计文档 | [architecture.md](architecture.md) | 分层架构、模块划分、依赖关系、脚本加载 |

---

## 总体开发阶段

开发分为以下阶段，须严格按顺序执行：

| 阶段 | 说明 | 状态 |
|------|------|------|
| P0 | 设计文档 | ✅ 完成 |
| P1 | 基础设施层 | ✅ 完成 |
| P2 | 类目管理器 | ✅ 完成 |
| P3 | 小说编写界面 | ✅ 完成 |
| P4 | AI 配置系统 | ✅ 完成 |
| P5 | AI 执行引擎 | ✅ 完成 |
| P6 | 文件导入/导出 | ✅ 完成 |
| P7 | 集成与端到端测试 | ✅ 完成 |
| **P8** | **V2: 数据库与枚举升级** | ✅ |
| **P9** | **V2: 书籍管理与角色系统重构** | ✅ |
| **P10** | **V2: 左侧边栏重构与动态内容区** | ✅ |
| **P11** | **V2: AI 配置增强** | ✅ |
| **P12** | **V2: 聊天框重构与大纲导入** | ✅ |
| **P13** | **V2: 模板导入导出与自定义变量** | ✅ |
| **P14** | **V2: 日志管理系统** | ✅ |
| **P15** | **V2: AI 提示词自优化** | ✅ |
| **P16** | **V2: 导入导出更新与集成测试** | ✅ |
| **P17** | **V2: UI 修复与默认配置** | ✅ |
| **P18** | **V2: UI 增强与提示词优化重构** | ✅ |
| **P19** | **V2: Bug 修复与功能完善** | ✅ |

---

## P1: 基础设施层

> 参考文档: [architecture.md](architecture.md) 第2-4节, [data-design.md](data-design.md) 第2-3节

### 任务清单

- [x] **T1.1** 创建 `writer/index.html` 主页面骨架
- [x] **T1.2** 创建 `writer/style.css` 全局样式
  - ⚠️ **UI 确认点 UC-01**: 待 P2 完成后请用户确认整体布局
- [x] **T1.3** 创建 `writer/enums.js` 枚举定义
- [x] **T1.4** 创建 `writer/utils.js` 工具函数
- [x] **T1.5** 创建 `writer/events.js` 事件总线
- [x] **T1.6** 创建 `writer/db.js` IndexedDB 数据库层
- [x] **T1.7** 创建 `writer/store.js` 应用状态管理
- [x] **T1.8** 创建 `writer/ui-modal.js` 模态对话框组件
- [x] **T1.9** 创建 `writer/test.html` 和 `writer/test.js` 测试框架
- [x] **T1.10** 编写 P1 阶段测试用例并运行 — ✅ 55/55 通过
- [x] **T1.11** 下载 JSZip 到 `writer/vendor/jszip.min.js`
- [x] **T1.12** Git commit: "feat(writer): P1 基础设施层"

---

## P2: 类目管理器

> 参考文档: [ui-design.md](ui-design.md) 第2-3节, [data-design.md](data-design.md) 第3.1节, [flow-design.md](flow-design.md) 第8节

### 任务清单

- [x] **T2.1** 创建 `writer/ui-category.js` 类目管理器 UI
  - ⚠️ **UI 确认点 UC-02**: 待集成测试时请用户确认

- [x] **T2.2** 创建 `writer/ui-detail.js` 详情面板 UI
  - ⚠️ **UI 确认点 UC-03**: 待集成测试时请用户确认

- [x] **T2.3** 类目数据 CRUD 业务逻辑

- [x] **T2.4** 编写 P2 测试用例并运行 — ✅ 61/61 通过

- [x] **T2.5** Git commit: "feat(writer): P2 类目管理器"

---

## P3: 小说编写界面

> 参考文档: [ui-design.md](ui-design.md) 第5-6节, [data-design.md](data-design.md) 第3.2-3.4节

### 任务清单

- [x] **T3.1** 创建 `writer/ui-editor.js` 小说编写区 UI
  - 参考: [ui-design.md](ui-design.md) 第5.1节
  - 章节名编辑
  - 段落列表渲染
  - 段落选中/高亮
  - 段落编辑（双击进入编辑模式）
  - 段落绑定信息标签显示
  - ⚠️ **UI 确认点 UC-06**: 请用户确认段落展示和交互方式
    - 预期: 能看到章节名（可编辑），下方段落列表，点击段落高亮，双击可编辑，段落下方显示绑定标签

- [x] **T3.2** 创建 `writer/ui-chat.js` 聊天框 UI
  - 参考: [ui-design.md](ui-design.md) 第5.2节
  - 可折叠状态栏
  - Tab 切换（章节概述/后续概要/绑定设定）
  - 文本输入框
  - 绑定设定选择界面
  - "开始生成" 和 "生成章节" 按钮
  - 按钮置灰逻辑
  - ⚠️ **UI 确认点 UC-07**: 请用户确认聊天框布局
    - 预期: 切换 Tab 可看到不同输入界面，状态栏可折叠展开，按钮正常显示

- [x] **T3.3** 创建 `writer/ui-status.js` 当前状态面板 UI
  - 参考: [ui-design.md](ui-design.md) 第6节
  - 章节概要显示区
  - AI 评审意见显示区
  - 前情提要显示区
  - 后续概要显示区
  - ⚠️ **UI 确认点 UC-08**: 请用户确认状态面板内容和布局
    - 预期: 能看到各信息区域，内容正确显示

- [x] **T3.4** 章节和段落 CRUD 业务逻辑
  - 新建章节
  - 段落添加（自动设置 sortOrder）
  - 段落编辑（更新 updatedAt）
  - 段落绑定信息管理 (paragraph_bindings 的增删)
  - 参考: [data-design.md](data-design.md) 第3.2-3.4节

- [x] **T3.5** 编写 P3 测试用例并运行 — ✅ 71/71 通过
  - 测试章节 CRUD
  - 测试段落 CRUD 和排序
  - 测试段落绑定操作
  - 运行测试，确认全部通过

- [x] **T3.6** Git commit: "feat(writer): P3 小说编写界面"

---

## P4: AI 配置系统

> 参考文档: [ui-design.md](ui-design.md) 第4节, [data-design.md](data-design.md) 第3.5-3.8节, 第4节

### 任务清单

- [x] **T4.1** 创建 `writer/ui-menu.js` 菜单栏 UI
  - 参考: [ui-design.md](ui-design.md) 第3节
  - 菜单栏渲染
  - 下拉菜单
  - 菜单项点击事件
  - ⚠️ **UI 确认点 UC-04**: 请用户确认菜单栏结构和位置
    - 预期: 顶部菜单栏，点击"文件"展示下拉菜单（导入/导出/导出小说），点击"AI 配置"展示下拉菜单（供应商管理/职能配置/流程配置）

- [x] **T4.2** 创建 `writer/ui-ai-config.js` AI 供应商管理对话框
  - 参考: [ui-design.md](ui-design.md) 第4.1节 供应商管理
  - 左侧供应商列表
  - 右侧配置表单（名称、API 地址、API Key、重试次数）
  - 模型列表的增删
  - 新建/保存/删除供应商

- [x] **T4.3** 创建 `writer/ui-role-config.js` 职能配置对话框
  - 参考: [ui-design.md](ui-design.md) 第4.2节 职能配置
  - 左侧职能列表（固定枚举）
  - 右侧配置表单
  - 提示词模板编辑框
  - 变量标签点击插入
  - 供应商/模型选择
  - 输出变量选择

- [x] **T4.4** 创建 `writer/ui-flow-config.js` 流程配置对话框
  - 参考: [ui-design.md](ui-design.md) 第4.3节 流程配置
  - 左侧流程列表
  - 右侧配置（名称、触发方式、启用/禁用、阻塞）
  - 二维数组步骤编辑器
  - 每步骤内可添加/删除职能
  - 添加/删除步骤
  - ⚠️ **UI 确认点 UC-05**: 请用户确认 AI 配置三个子页面的布局
    - 预期: 打开每个配置页，能正确配置供应商/模型、职能提示词、流程步骤

- [x] **T4.5** 编写 P4 测试用例并运行 — ✅ 84/84 通过
  - 测试供应商 CRUD
  - 测试模型 CRUD
  - 测试职能配置 CRUD
  - 测试流程配置 CRUD（含二维数组序列化/反序列化）
  - 测试枚举值完整性和一致性
  - **用随机数据测试，验证数据正确保存和加载**
  - 运行测试，确认全部通过

- [x] **T4.6** Git commit: "feat(writer): P4 AI 配置系统"

---

## P5: AI 执行引擎

> 参考文档: [flow-design.md](flow-design.md) 第2-4、7节, [architecture.md](architecture.md) 第4.4-4.5节

### 任务清单

- [x] **T5.1** 创建 `writer/ai-service.js` AI 调用服务
  - 参考: [architecture.md](architecture.md) 第4.5节, [flow-design.md](flow-design.md) 第7.1节
  - OpenAI 兼容 API 调用封装
  - 重试逻辑（含失败原因记录）
  - 请求超时处理

- [x] **T5.2** 创建 `writer/flow-engine.js` 流程执行引擎
  - 参考: [architecture.md](architecture.md) 第4.4节, [flow-design.md](flow-design.md) 第2-3节
  - 流程查找（按 trigger 和 enabled）
  - 二维数组执行逻辑（外层串行，内层并行）
  - 变量上下文管理（替换模板变量、收集输出）
  - 状态更新（实时更新 AI 状态对象）
  - 阻塞逻辑（阻塞时禁用按钮）

- [x] **T5.3** 创建 `writer/recap-engine.js` 前情提要引擎
  - 参考: [flow-design.md](flow-design.md) 第4节
  - 阶梯形压缩算法实现
  - 增量更新逻辑
  - 配置参数读取（章节数、目标字数）

- [x] **T5.4** 聊天框状态栏集成
  - 参考: [ui-design.md](ui-design.md) 第5.2节 状态栏
  - 将 flow-engine 的状态更新反映到 UI
  - 主流程/次流程进度显示
  - 失败/重试显示
  - 失败原因复制到剪贴板

- [x] **T5.5** "开始生成" 按钮集成
  - 参考: [flow-design.md](flow-design.md) 第2节
  - 收集上下文 → 调用 flow-engine → 处理输出 → 创建段落

- [x] **T5.6** "生成章节" 按钮集成
  - 参考: [flow-design.md](flow-design.md) 第3节
  - 合并段落 → 调用 flow-engine → 保存章节 → 更新前情提要

- [x] **T5.7** 编写 P5 测试用例并运行 — ✅ 96/96 通过
  - Mock AIService，返回随机数据
  - 测试 FlowEngine 的串行/并行执行
  - 测试变量替换
  - 测试重试逻辑
  - 测试阻塞/非阻塞逻辑
  - 测试 RecapEngine 的压缩算法
  - 测试按钮禁用/恢复
  - 运行测试，确认全部通过

- [x] **T5.8** Git commit: "feat(writer): P5 AI 执行引擎"

---

## P6: 文件导入/导出

> 参考文档: [flow-design.md](flow-design.md) 第5-6节, [data-design.md](data-design.md) 第5节

### 任务清单

- [x] **T6.1** 创建 `writer/export-service.js` 导出服务
  - 参考: [flow-design.md](flow-design.md) 第5节, [data-design.md](data-design.md) 第5节
  - 逐表读取数据
  - 生成 manifest.json
  - 使用 JSZip 打包
  - 进度回调
  - 触发浏览器下载

- [x] **T6.2** 创建 `writer/import-service.js` 导入服务
  - 参考: [flow-design.md](flow-design.md) 第6节
  - 解压 ZIP
  - 验证 manifest.json
  - 清空并重写数据库（事务中）
  - 按依赖顺序导入

- [x] **T6.3** 导出小说功能
  - 参考: [data-design.md](data-design.md) 第5.3节
  - 只导出章节内容为文本文件
  - 章节文件按序号命名

- [x] **T6.4** 导入/导出对话框 UI 集成
  - 导入: 拖拽/选择文件 → 确认 → 执行
  - 导出: 显示进度 → 完成后下载
  - 参考: [ui-design.md](ui-design.md) 第3.2节

- [x] **T6.5** 编写 P6 测试用例并运行 — ✅ 107/107 通过
  - **核心测试: 配置数据 → 导出 → 导入 → 验证数据完全一致**
  - 测试各表数据的序列化/反序列化
  - 测试 manifest.json 格式正确性
  - 测试导入后 UI 正常显示加载的数据
  - 运行测试，确认全部通过

- [x] **T6.6** Git commit: "feat(writer): P6 文件导入导出"

---

## P7: 集成与端到端测试

### 任务清单

- [x] **T7.1** 端到端流程测试 — ✅ 120/120 通过
  - 测试1: 创建类目 → 配置 AI → 编写段落 → 生成章节 → 全流程走通
  - 测试2: 全量导出 → 清空数据 → 导入 → 验证所有数据恢复
  - 测试3: 多章节场景 → 前情提要正确生成

- [x] **T7.2** UI 整体检查
  - 检查所有面板的显示/隐藏
  - 检查所有按钮的启用/禁用逻辑
  - 检查所有模态对话框的打开/关闭

- [x] **T7.3** 整体样式微调
  - ⚠️ **UI 确认点 UC-09**: 请用户确认配色方案
  - 进行必要的样式修复

- [x] **T7.4** Git commit: "feat(writer): P7 集成测试与完善"

---

## P8: V2 数据库与枚举升级

> 参考文档: [data-design.md](data-design.md) 第2-4、6节, [architecture.md](architecture.md)

### 任务清单

- [x] **T8.1** 更新 `enums.js`
  - 移除固定的 RoleEnum (writer/reviewer/summarizer/recap_writer)
  - 新增 IntelligenceLevelEnum (high/medium/basic)
  - 保留 VariableEnum, TriggerEnum, CategoryTypeEnum, ChapterStatus, AITaskStatus

- [x] **T8.2** 升级 `db.js` — DB_VERSION 1 → 2
  - 新建 ObjectStore: `books` (keyPath: 'id')
  - 新建 ObjectStore: `ai_logs` (keyPath: 'id', 索引: idx_createdAt, idx_status)
  - 重建 `role_configs` (keyPath 从 'role' 改为 'id')
  - 为 `categories` 添加 `idx_bookId` 索引
  - 为 `chapters` 添加 `idx_bookId` 索引
  - 新增 STORES 常量: BOOKS, AI_LOGS
  - 处理 V1→V2 数据迁移逻辑

- [x] **T8.3** 更新 `store.js`
  - 新增 state: currentBookId, sidebarTab, outlineText, styleTags
  - 移除 chatTab
  - chapterOutline 语义不变（V2 改名为情节概述仅是 UI 层显示）

- [x] **T8.4** 更新 `events.js`
  - 新增事件: BOOK_CHANGED, BOOK_CREATED, BOOK_DELETED, SIDEBAR_TAB_CHANGED, LOG_RECORDED

- [x] **T8.5** 菜单重命名
  - "导入..." → "导入工作区..."
  - "导出..." → "导出工作区..."
  - 新增菜单项: "导出模板...", "导入模板...", "日志管理", "提示词优化"

- [x] **T8.6** 编写 P8 测试用例并运行
  - 测试新枚举 IntelligenceLevelEnum
  - 测试 DB v2 新表 (books, ai_logs) CRUD
  - 测试 role_configs 新主键 (UUID) CRUD
  - 测试新 Store 状态字段
  - 测试新事件
  - 运行测试，确认全部通过 (120/120)

- [x] **T8.7** Git commit: "feat(writer): P8 V2 数据库与枚举升级"

---

## P9: V2 书籍管理与角色系统重构

> 参考文档: [requirements.md](requirements.md) 第7.1、7.6节, [ui-design.md](ui-design.md) 第9.4节

### 任务清单

- [x] **T9.1** 创建 `ui-book.js` 书籍管理对话框
  - 书籍列表展示
  - 新建书籍（书名、简介）
  - 编辑书籍信息
  - 删除书籍
  - 切换当前编辑书籍
  - 参考: [ui-design.md](ui-design.md) 第9.4节

- [x] **T9.2** 重构 `ui-role-config.js` — 用户自建职能 (P8 已完成)

- [x] **T9.3** 更新 `ui-flow-config.js` — 步骤引用 UUID (P8 已完成)

- [x] **T9.4** 更新 `flow-engine.js` — 职能 UUID 查找 (P8 已完成)

- [x] **T9.5** 书籍数据关联
  - 创建章节时自动关联当前 bookId
  - 创建类目时自动关联当前 bookId
  - 章节列表按 bookId 过滤
  - 类目树按 bookId 过滤

- [x] **T9.6** 编写 P9 测试用例并运行
  - 测试书籍 CRUD
  - 测试用户自建职能 CRUD
  - 测试流程引用 UUID
  - 测试数据按 bookId 过滤
  - 运行测试，确认全部通过 (130/130)

- [x] **T9.7** Git commit: "feat(writer): P9 书籍管理与角色系统重构"

---

## P10: V2 左侧边栏重构与动态内容区

> 参考文档: [requirements.md](requirements.md) 第7.2节, [ui-design.md](ui-design.md) 第9.1-9.5节

### 任务清单

- [x] **T10.1** 创建 `ui-sidebar.js` — 图标导航栏
  - 左侧 48px 图标栏，含三个 Tab 按钮
  - Tab 1: 类目设定 (📋)
  - Tab 2: 章节目录 (📁)
  - Tab 3: 书籍信息 (📖)
  - Tab 切换事件
  - 参考: [ui-design.md](ui-design.md) 第9.1节

- [x] **T10.2** 实现章节目录面板
  - 显示当前书籍的章节列表
  - 已完成章节 ✅，当前编辑 📝
  - 点击切换章节
  - [+] 添加新章节
  - 参考: [ui-design.md](ui-design.md) 第9.2节

- [x] **T10.3** 实现书籍信息面板
  - 书名、简介编辑
  - 章节数、总字数统计
  - [保存] [切换书籍] 按钮
  - 参考: [ui-design.md](ui-design.md) 第9.3节

- [x] **T10.4** 重构 `index.html` 布局
  - 新增图标导航栏 DOM
  - 侧边面板区域
  - 动态内容区
  - 更新 CSS

- [x] **T10.5** 实现动态内容区
  - 类目设定 → 选中项显示详情编辑
  - 章节目录 → 选中章显示段落编辑器
  - 书籍信息 → 显示书籍元信息编辑
  - 参考: [ui-design.md](ui-design.md) 第9.5节

- [x] **T10.6** 编写 P10 测试用例并运行
  - 测试侧边栏 Tab 切换
  - 测试章节列表过滤
  - 测试动态内容区切换
  - 运行测试，确认全部通过 (135/135)

- [x] **T10.7** Git commit: "feat(writer): P10 左侧边栏重构与动态内容区"

---

## P11: V2 AI 配置增强

> 参考文档: [requirements.md](requirements.md) 第7.4-7.5节, [ui-design.md](ui-design.md) 第9.6节

### 任务清单

- [x] **T11.1** 更新 `ui-ai-config.js` — 模型智能等级
  - 模型添加时新增智能等级下拉选择 (高级/中级/基础)
  - 模型列表显示智能等级
  - 保存模型时保存 intelligenceLevel

- [x] **T11.2** 更新 `ui-ai-config.js` — API 测试按钮
  - 新增 [测试API] 按钮
  - 弹出测试面板: 模型选择、问题输入、发送、预览回复、错误显示(红色)
  - 参考: [ui-design.md](ui-design.md) 第9.6节

- [x] **T11.3** 更新 `ai-service.js` — Ollama 支持
  - 检测响应格式：标准 OpenAI (choices[0].message.content) vs Ollama (message.content)
  - 自动适配两种响应结构
  - 抽取 parseResponse() 方法便于测试

- [x] **T11.4** 编写 P11 测试用例并运行
  - 测试智能等级保存/加载
  - 测试 Ollama 响应解析
  - 测试 OpenAI 响应解析
  - 运行测试，确认全部通过 (143/143)

- [x] **T11.5** Git commit: "feat(writer): P11 AI 配置增强"

---

## P12: V2 聊天框重构与大纲导入

> 参考文档: [requirements.md](requirements.md) 第7.8-7.9节, [ui-design.md](ui-design.md) 第9.8节

### 任务清单

- [x] **T12.1** 重构 `ui-chat.js` — 移除 Tab，改为可折叠区块
- [x] **T12.2** 新增 "直接添加" 按钮
- [x] **T12.3** 新增风格标签区域
- [x] **T12.4** 新增大纲导入区块
- [x] **T12.5** 编写 P12 测试用例并运行 (148/148)
- [x] **T12.6** Git commit

---

## P13: V2 模板导入导出与自定义变量

> 参考文档: [requirements.md](requirements.md) 第7.7、7.10节, [data-design.md](data-design.md) 第5.4节

### 任务清单

- [x] **T13.1** 创建 `template-service.js` — 模板导入导出服务
  - 导出: 读取 role_configs + flow_configs，查询模型智能等级，生成 JSON
  - 导入: 解析 JSON，按智能等级匹配本地模型，生成新 UUID，写入数据
  - 参考: [flow-design.md](flow-design.md) 第9.7节

- [x] **T13.2** 创建 `ui-template.js` — 模板对话框
  - 导出模板对话框
  - 导入模板对话框（含模型匹配预览、手动选择）
  - 参考: [ui-design.md](ui-design.md) 第9.11节

- [x] **T13.3** 自定义变量定义 UI
  - 在 ui-role-config.js 中新增自定义变量区域
  - 变量名 + isOutput 开关
  - 添加/删除自定义变量
  - 提示词中可用 {{自定义:变量名}} 引用

- [x] **T13.4** 自定义变量流程引擎支持
  - flow-engine.js 识别 {{自定义:变量名}} 格式
  - 流程执行时维护自定义变量上下文
  - 执行前进行依赖检查
  - 参考: [flow-design.md](flow-design.md) 第9.2节

- [x] **T13.5** 编写 P13 测试用例并运行 (156/156)
  - 测试模板导出 JSON 格式
  - 测试模板导入匹配逻辑
  - 测试自定义变量定义 CRUD
  - 测试自定义变量依赖检查
  - 测试自定义变量在流程中的传递
  - 运行测试，确认全部通过

- [x] **T13.6** Git commit: "feat(writer): P13 模板导入导出与自定义变量"

---

## P14: V2 日志管理系统

> 参考文档: [requirements.md](requirements.md) 第7.11节, [ui-design.md](ui-design.md) 第9.9节

### 任务清单

- [x] **T14.1** 创建 `log-service.js` — 日志管理服务
  - 记录日志: 写入 ai_logs 表
  - 查询日志: 按时间倒序、按状态筛选
  - 自动清理: 按天数和条数限制
  - 导出日志: 生成 JSON 文件

- [x] **T14.2** 更新 `ai-service.js` — 自动日志记录
  - 每次 AI 调用完成后记录日志
  - 记录: 供应商名、模型名、提示词、回复、耗时、状态、错误

- [x] **T14.3** 创建 `ui-log.js` — 日志管理对话框
  - 日志列表（时间倒序）
  - 筛选: 全部/成功/失败
  - 日期筛选
  - 日志详情展开（查看完整提示词和回复）
  - [导出] [清理] 按钮
  - 自动清理设置
  - 参考: [ui-design.md](ui-design.md) 第9.9节

- [x] **T14.4** 编写 P14 测试用例并运行 (163/163)
  - 测试日志记录
  - 测试日志查询和筛选
  - 测试自动清理逻辑
  - 运行测试，确认全部通过

- [x] **T14.5** Git commit: "feat(writer): P14 日志管理系统"

---

## P15: V2 AI 提示词自优化

> 参考文档: [requirements.md](requirements.md) 第7.12节, [ui-design.md](ui-design.md) 第9.10节

### 任务清单

- [x] **T15.1** 创建 `ui-prompt-opt.js` — 提示词优化对话框
  - 职能选择下拉
  - 优化模型选择（建议高级模型）
  - 当前提示词展示
  - [开始优化] 按钮
  - 优化建议展示
  - [对比查看] 原始 vs 优化
  - [应用优化] / [取消] 按钮
  - 参考: [ui-design.md](ui-design.md) 第9.10节

- [x] **T15.2** 实现优化逻辑
  - 构造元提示词（提示词工程专家角色）
  - 调用高级模型生成优化建议
  - 应用优化时更新 role_configs.promptTemplate
  - 参考: [flow-design.md](flow-design.md) 第9.6节

- [x] **T15.3** 编写 P15 测试用例并运行 (167/167)
  - 测试优化对话框打开/关闭
  - 测试 Mock AI 返回优化建议
  - 测试应用优化更新提示词
  - 运行测试，确认全部通过

- [x] **T15.4** Git commit: "feat(writer): P15 AI 提示词自优化"

---

## P16: V2 导入导出更新与集成测试

> 参考文档: [data-design.md](data-design.md) 第5节, [flow-design.md](flow-design.md) 第5-6节

### 任务清单

- [x] **T16.1** 更新 `export-service.js`
  - 导出 V2 新表: books, ai_logs (可选)
  - manifest.json version 改为 "2.0"

- [x] **T16.2** 更新 `import-service.js`
  - 导入 V2 新表: books, ai_logs
  - 兼容 V1 格式导入（无 books 表时创建默认书籍）
  - manifest version 检查

- [x] **T16.3** 更新现有测试适配 V2 变更
  - 修改依赖 RoleEnum 的测试
  - 修改 role_configs 主键相关测试
  - 确保旧测试在 V2 架构下仍然通过

- [x] **T16.4** V2 端到端测试 (172/172)
  - 测试: 创建书籍 → 创建类目 → 配置职能 → 配置流程 → 编写段落 → 生成章节
  - 测试: V2 全量导出 → 清空 → 导入 → 验证恢复
  - 测试: 模板导出 → 导入 → 验证职能和流程配置匹配
  - 运行全部测试，确认通过

- [x] **T16.5** Git commit: "feat(writer): P16 V2 导入导出与集成测试"

---

## P17: V2 UI 修复与默认配置

> Bug 修复和用户体验优化

### 任务清单

- [x] **T17.1** 修复书籍信息面板重复显示 (ui-sidebar.js + style.css)
  - 书籍信息 tab 激活时隐藏状态面板 (因为显示章节状态无意义)
  - 书籍信息 tab 切走后恢复状态面板
  - 在 updateContentArea() 中控制 status-panel 的显隐

- [x] **T17.2** 状态面板始终靠右对齐 (style.css)
  - 为 .panel-status 添加 margin-left: auto
  - 确保无论中间区域隐藏/显示，状态面板始终紧贴右侧

- [x] **T17.3** AI 配置测试按钮移至模型行 (ui-ai-config.js)
  - 移除供应商级别的 [测试 API] 按钮和 _showTestPanel 方法
  - 在每个模型行的右侧添加 [测试] 按钮 (在删除按钮左侧)
  - 点击后在该模型行下方展示测试区域:
    - 输入框 (测试问题)
    - [发送] 按钮
    - 结果区域:
      - 成功且有内容 → 绿色显示回答
      - 请求报错或回答为空 → 红色边框预览框显示完整返回值
  - 再次点击 [测试] 按钮收起测试区域

- [x] **T17.4** 添加默认职能与流程配置 (app.js)
  - 首次启动时检测 role_configs 表是否为空
  - 若为空，创建 3 个默认职能:
    - 「写手」: 输入=用户输入+前文信息+章节概述+绑定设定, 输出=生成段落
    - 「评审」: 输入=生成段落+章节概述, 输出=AI评审意见
    - 「概要」: 输入=章节内容, 输出=生成概要
  - 若 flow_configs 表为空，创建 2 个默认流程:
    - 「段落生成」: trigger=generate_paragraph, blocking=true, steps=[[写手],[评审]]
    - 「章节概要」: trigger=generate_chapter, blocking=false, steps=[[概要]]

- [x] **T17.5** 编写 P17 测试用例并运行 (183/183)
  - 测试状态面板在 bookInfo tab 时隐藏
  - 测试默认职能创建逻辑
  - 测试默认流程创建逻辑
  - 运行全部测试确认通过

- [x] **T17.6** Git commit: "fix(writer): P17 UI 修复与默认配置"

---

## P18: V2 UI 增强与提示词优化重构

> 参考文档: [ui-design.md](ui-design.md) 第 9.12–9.17 节

### 任务清单

- [x] **T18.1** AI 配置默认测试问题 + 模型状态指示器 (ui-ai-config.js, style.css)
  - 测试区域输入框默认值为 "天空为什么是蓝色的"
  - 模型行最前方增加状态图标: ✅ 绿色(上次成功) / ❓ 黄色(未运行) / ❗ 红色(从未成功)
  - 点击图标显示详细提示信息 (时间/错误信息)
  - 测试完成后更新模型的 lastTestStatus/lastTestTime/lastTestError 字段
  - 编写测试: 模型状态字段读写验证

- [x] **T18.2** 输入框宽度修复 (style.css)
  - 情节概述、后续概要、大纲导入等聊天框内的 textarea 使用 width:100%; box-sizing:border-box
  - 确保填满可用区域，不会过窄

- [x] **T18.3** 类目详情面板全宽 (ui-sidebar.js, style.css)
  - 类目设定 Tab 选中某类目时，详情面板使用 flex:1 占据正文区域
  - 隐藏编辑器区域，详情面板代替正文区域显示

- [x] **T18.4** 风格标签内联输入 (ui-chat.js, style.css)
  - 移除 prompt() 弹窗
  - 改为内联文本框 + ⊕ 按钮
  - 输入框宽度随文本长度自动增长 (min-width:80px, max-width:200px)
  - 回车键支持添加标签
  - 编写测试

- [x] **T18.5** 底部“更新设定”按钮 (ui-chat.js, ui-setting-update.js 新文件)
  - 聊天框底部按钮栏增加 [更新设定] 按钮
  - 下载 jsdiff 库到 vendor/
  - 收集当前章节内容/情节描述/后续情节，调用 AI 分析设定变更
  - 设定更新预览弹窗:
    - 列出需要变更的设定项 (标红)
    - 点击展开显示 diff (红色底色+删除线=删除, 绿色底色=新增)
    - 确认后更新并清除 diff 标记
    - [全部撤销] 恢复
  - 后续情节仅作参考 (提示词中明确告知 AI)
  - 编写测试: diff 显示逻辑

- [x] **T18.6** 提示词优化重构为左右栏布局 (ui-prompt-opt.js)
  - 从弹窗改为侧边栏+正文区域的两栏布局
  - 左侧: 职能选择、模型选择(高级)、[返回编辑器] 按钮
  - 右侧:
    - 该职能的日志列表 (按时间倒序, 可展开)
    - 展开显示: 带变量名提示词, 展开后提示词, 变量键值对, 原始输出
    - [用高级AI生成内容] 按钮 + 展示框
    - 用户意见输入框
    - 可折叠高级设置 (定制优化提示词模板, 预览)
    - [优化职能提示词] 按钮
    - 优化结果: 新提示词 + 模型差距评分(0-10)
    - [应用新提示词] 按钮
  - 在 ai_logs 表上查询职能日志 (需扩展 log 记录 roleId 字段)
  - 编写测试

- [x] **T18.7** 编写 P18 测试用例并运行 (198/198 通过)

- [x] **T18.8** Git commit: "feat(writer): P18 UI 增强与提示词优化重构"

---

## P19: V2 Bug 修复与功能完善

> 参考文档: [ui-design.md](ui-design.md) 第 9.18–9.23 节

### 任务清单

- [x] **T19.1** 修复类目设定侧边栏加号按钮无响应 (ui-category.js)
  - sidebar 的 `+` 按钮触发 `sidebar:add-root-category` 事件无人监听
  - 在 CategoryUI.init 中添加事件监听

- [x] **T19.2** 更新设定支持树结构+新增设定 (ui-setting-update.js)
  - 提示词中仅提供设定树结构（名称、层级），不含具体内容
  - AI 返回结果支持新增设定（包含 parentId/parentName）
  - 处理逻辑区分「更新」和「新增」两种操作

- [x] **T19.3** 修复生成后内容不更新 + 增加控制台日志 (ui-chat.js, flow-engine.js)
  - handleGenerate 完成后取 context.generated_paragraph 创建新段落
  - FlowEngine 中增加 console.log 打印当前步骤和下一步骤
  - 更新右侧状态面板（概要、评审意见等）

- [x] **T19.4** 移除章节目录侧边栏加号按钮 (ui-sidebar.js)
  - 删除 showChapterPanel 中的 `+` 按钮，避免重复渲染

- [x] **T19.5** 日志记录流程变量名和变量值 (flow-engine.js, log-service.js)
  - _executeRole 中提取模板变量及其在 context 中的值
  - 通过 options 传入 AIService.call，记录到日志中
  - LogService.record 新增 variables 字段

- [x] **T19.6** 提示词优化功能完善 (ui-prompt-opt.js)
  - 新提示词结果改为可编辑的 textarea
  - 生成新提示词后清空用户意见
  - 增加 [用原始模型生成] 按钮：使用职能配置的模型 + 最新提示词
  - [用高级AI生成] 也使用最新提示词（来自 role.promptTemplate）

- [x] **T19.7** 编写 P19 测试用例并运行 (207/207 通过)

- [x] **T19.8** Git commit

---

## 工作恢复指南

> 当你需要恢复工作时，按以下步骤操作：

### 第一步：确认当前进度
1. 查看本文档中各阶段的状态标记（✅/⬜）
2. 找到最新未完成的阶段
3. 在该阶段中找到第一个未勾选的任务 `- [ ]`

### 第二步：了解上下文
1. 阅读未完成任务的"参考文档"链接，获取相关设计细节
2. 查看该阶段已完成任务的代码实现
3. 查看 `writer/test.js` 了解已有测试

### 第三步：继续执行
1. 每完成一个子任务：
   - 如果是基础单元，在 test.js 中添加测试
   - 在浏览器中打开 test.html 确认测试通过
   - 将本文档中对应的 `- [ ]` 改为 `- [x]`
2. 如果遇到 ⚠️ UI 确认点，需要请用户确认
3. 到达 Git commit 任务时执行 commit

### 注意事项
- 测试命令来自需求（在浏览器中打开 test.html 查看结果，因为这是纯前端项目）
- AI 相关测试不使用真实 AI，使用 Mock 数据
- 每次编码实现前，先阅读对应的设计文档中的相关章节
- UI 确认点是必须执行的步骤，不可跳过
