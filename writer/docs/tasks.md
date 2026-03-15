# AI 小说写作工具 — 工作任务文档

> 版本: 1.0  
> 最后更新: 2026-03-15  
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
| P4 | AI 配置系统 | ⬜ 未开始 |
| P5 | AI 执行引擎 | ⬜ 未开始 |
| P6 | 文件导入/导出 | ⬜ 未开始 |
| P7 | 集成与端到端测试 | ⬜ 未开始 |

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

- [ ] **T4.1** 创建 `writer/ui-menu.js` 菜单栏 UI
  - 参考: [ui-design.md](ui-design.md) 第3节
  - 菜单栏渲染
  - 下拉菜单
  - 菜单项点击事件
  - ⚠️ **UI 确认点 UC-04**: 请用户确认菜单栏结构和位置
    - 预期: 顶部菜单栏，点击"文件"展示下拉菜单（导入/导出/导出小说），点击"AI 配置"展示下拉菜单（供应商管理/职能配置/流程配置）

- [ ] **T4.2** 创建 `writer/ui-ai-config.js` AI 供应商管理对话框
  - 参考: [ui-design.md](ui-design.md) 第4.1节 供应商管理
  - 左侧供应商列表
  - 右侧配置表单（名称、API 地址、API Key、重试次数）
  - 模型列表的增删
  - 新建/保存/删除供应商

- [ ] **T4.3** 创建 `writer/ui-role-config.js` 职能配置对话框
  - 参考: [ui-design.md](ui-design.md) 第4.2节 职能配置
  - 左侧职能列表（固定枚举）
  - 右侧配置表单
  - 提示词模板编辑框
  - 变量标签点击插入
  - 供应商/模型选择
  - 输出变量选择

- [ ] **T4.4** 创建 `writer/ui-flow-config.js` 流程配置对话框
  - 参考: [ui-design.md](ui-design.md) 第4.3节 流程配置
  - 左侧流程列表
  - 右侧配置（名称、触发方式、启用/禁用、阻塞）
  - 二维数组步骤编辑器
  - 每步骤内可添加/删除职能
  - 添加/删除步骤
  - ⚠️ **UI 确认点 UC-05**: 请用户确认 AI 配置三个子页面的布局
    - 预期: 打开每个配置页，能正确配置供应商/模型、职能提示词、流程步骤

- [ ] **T4.5** 编写 P4 测试用例并运行 (使用随机数据, 不调用真实 AI)
  - 测试供应商 CRUD
  - 测试模型 CRUD
  - 测试职能配置 CRUD
  - 测试流程配置 CRUD（含二维数组序列化/反序列化）
  - 测试枚举值完整性和一致性
  - **用随机数据测试，验证数据正确保存和加载**
  - 运行测试，确认全部通过

- [ ] **T4.6** Git commit: "feat(writer): P4 AI 配置系统"

---

## P5: AI 执行引擎

> 参考文档: [flow-design.md](flow-design.md) 第2-4、7节, [architecture.md](architecture.md) 第4.4-4.5节

### 任务清单

- [ ] **T5.1** 创建 `writer/ai-service.js` AI 调用服务
  - 参考: [architecture.md](architecture.md) 第4.5节, [flow-design.md](flow-design.md) 第7.1节
  - OpenAI 兼容 API 调用封装
  - 重试逻辑（含失败原因记录）
  - 请求超时处理

- [ ] **T5.2** 创建 `writer/flow-engine.js` 流程执行引擎
  - 参考: [architecture.md](architecture.md) 第4.4节, [flow-design.md](flow-design.md) 第2-3节
  - 流程查找（按 trigger 和 enabled）
  - 二维数组执行逻辑（外层串行，内层并行）
  - 变量上下文管理（替换模板变量、收集输出）
  - 状态更新（实时更新 AI 状态对象）
  - 阻塞逻辑（阻塞时禁用按钮）

- [ ] **T5.3** 创建 `writer/recap-engine.js` 前情提要引擎
  - 参考: [flow-design.md](flow-design.md) 第4节
  - 阶梯形压缩算法实现
  - 增量更新逻辑
  - 配置参数读取（章节数、目标字数）

- [ ] **T5.4** 聊天框状态栏集成
  - 参考: [ui-design.md](ui-design.md) 第5.2节 状态栏
  - 将 flow-engine 的状态更新反映到 UI
  - 主流程/次流程进度显示
  - 失败/重试显示
  - 失败原因复制到剪贴板

- [ ] **T5.5** "开始生成" 按钮集成
  - 参考: [flow-design.md](flow-design.md) 第2节
  - 收集上下文 → 调用 flow-engine → 处理输出 → 创建段落

- [ ] **T5.6** "生成章节" 按钮集成
  - 参考: [flow-design.md](flow-design.md) 第3节
  - 合并段落 → 调用 flow-engine → 保存章节 → 更新前情提要

- [ ] **T5.7** 编写 P5 测试用例并运行 (使用 Mock AI)
  - Mock AIService，返回随机数据
  - 测试 FlowEngine 的串行/并行执行
  - 测试变量替换
  - 测试重试逻辑
  - 测试阻塞/非阻塞逻辑
  - 测试 RecapEngine 的压缩算法
  - 测试按钮禁用/恢复
  - 运行测试，确认全部通过

- [ ] **T5.8** Git commit: "feat(writer): P5 AI 执行引擎"

---

## P6: 文件导入/导出

> 参考文档: [flow-design.md](flow-design.md) 第5-6节, [data-design.md](data-design.md) 第5节

### 任务清单

- [ ] **T6.1** 创建 `writer/export-service.js` 导出服务
  - 参考: [flow-design.md](flow-design.md) 第5节, [data-design.md](data-design.md) 第5节
  - 逐表读取数据
  - 生成 manifest.json
  - 使用 JSZip 打包
  - 进度回调
  - 触发浏览器下载

- [ ] **T6.2** 创建 `writer/import-service.js` 导入服务
  - 参考: [flow-design.md](flow-design.md) 第6节
  - 解压 ZIP
  - 验证 manifest.json
  - 清空并重写数据库（事务中）
  - 按依赖顺序导入

- [ ] **T6.3** 导出小说功能
  - 参考: [data-design.md](data-design.md) 第5.3节
  - 只导出章节内容为文本文件
  - 章节文件按序号命名

- [ ] **T6.4** 导入/导出对话框 UI 集成
  - 导入: 拖拽/选择文件 → 确认 → 执行
  - 导出: 显示进度 → 完成后下载
  - 参考: [ui-design.md](ui-design.md) 第3.2节

- [ ] **T6.5** 编写 P6 测试用例并运行
  - **核心测试: 配置数据 → 导出 → 导入 → 验证数据完全一致**
  - 测试各表数据的序列化/反序列化
  - 测试 manifest.json 格式正确性
  - 测试导入后 UI 正常显示加载的数据
  - 运行测试，确认全部通过

- [ ] **T6.6** Git commit: "feat(writer): P6 文件导入导出"

---

## P7: 集成与端到端测试

### 任务清单

- [ ] **T7.1** 端到端流程测试
  - 测试1: 创建类目 → 配置 AI → 编写段落 → 生成章节 → 全流程走通
  - 测试2: 全量导出 → 清空数据 → 导入 → 验证所有数据恢复
  - 测试3: 多章节场景 → 前情提要正确生成

- [ ] **T7.2** UI 整体检查
  - 检查所有面板的显示/隐藏
  - 检查所有按钮的启用/禁用逻辑
  - 检查所有模态对话框的打开/关闭

- [ ] **T7.3** 整体样式微调
  - ⚠️ **UI 确认点 UC-09**: 请用户确认配色方案
  - 进行必要的样式修复

- [ ] **T7.4** Git commit: "feat(writer): P7 集成测试与完善"

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
