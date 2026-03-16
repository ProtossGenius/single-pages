# AI 小说写作工具 — 数据设计文档

> 版本: 2.0  
> 最后更新: 2026-03-16  
> 关联文档: [需求文档](requirements.md)

---

## 1. 存储方案

使用浏览器 IndexedDB 作为持久化存储。数据库名称: `WriterDB`，版本: 2（V2 升级）。

## 2. 数据库表设计 (Object Store)

### 2.1 ObjectStore 一览

| Store 名称 | 主键 | 说明 | V2 变更 |
|------------|------|------|---------|
| `categories` | `id` (UUID) | 类目数据（人物、地点、宗门等） | 新增 `bookId` 字段 |
| `chapters` | `id` (自增) | 章节表 | 新增 `bookId` 字段 |
| `paragraphs` | `id` (UUID) | 段落表 | — |
| `paragraph_bindings` | `id` (UUID) | 段落绑定信息 | — |
| `ai_providers` | `id` (UUID) | AI 供应商配置 | — |
| `ai_models` | `id` (UUID) | AI 模型配置 | 新增 `intelligenceLevel` 字段 |
| `role_configs` | `id` (UUID) | 职能配置 | **V2: 主键由 `role` 改为 `id` (UUID)** |
| `flow_configs` | `id` (UUID) | 流程配置 | — |
| `recap_data` | `id` (UUID) | 前情提要数据 | — |
| `app_settings` | `key` (字符串) | 应用全局设置 | — |
| `books` | `id` (UUID) | **V2 新增** 书籍管理 | — |
| `ai_logs` | `id` (UUID) | **V2 新增** AI 日志 | — |

---

## 3. 详细表结构

### 3.1 categories — 类目表

```javascript
{
  id:          String,    // UUID, 主键
  parentId:    String,    // 父节点 UUID, 顶层为 null
  bookId:      String,    // V2: 所属书籍 UUID
  type:        String,    // 大类标识 (如: 'character', 'location', 'sect', 'item')
  name:        String,    // 显示名称
  description: String,    // 描述文本
  attributes:  String,    // 属性 (JSON 字符串, 键值对格式)
  sortOrder:   Number,    // 排序序号
  version:     Number,    // 版本号, 新建时为 1, 每次修改递增
  createdAt:   Number,    // 创建时间 (时间戳, 毫秒)
  updatedAt:   Number     // 最后修改时间 (时间戳, 毫秒)
}
```

**索引:**
| 索引名 | 字段 | 唯一 | 说明 |
|--------|------|------|------|
| `idx_parentId` | `parentId` | 否 | 按父节点查询子节点 |
| `idx_type` | `type` | 否 | 按大类查询 |
| `idx_updatedAt` | `updatedAt` | 否 | 按更新时间排序 |
| `idx_bookId` | `bookId` | 否 | V2: 按书籍查询 |

### 3.2 chapters — 章节表

```javascript
{
  id:          Number,    // 自增主键
  bookId:      String,    // V2: 所属书籍 UUID
  title:       String,    // 章节标题
  summary:     String,    // 章节概要 (AI 生成)
  content:     String,    // 完整章节内容 (所有段落合并后的文本)
  recapText:   String,    // 该章的前情提要文本
  reviewNotes: String,    // AI 评审意见
  status:      String,    // 状态: 'draft' | 'completed'
  sortOrder:   Number,    // 章节排序
  createdAt:   Number,    // 创建时间 (时间戳, 毫秒)
  updatedAt:   Number     // 最后修改时间 (时间戳, 毫秒)
}
```

**索引:**
| 索引名 | 字段 | 唯一 | 说明 |
|--------|------|------|------|
| `idx_status` | `status` | 否 | 按状态查询 |
| `idx_sortOrder` | `sortOrder` | 否 | 按排序查询 |
| `idx_bookId` | `bookId` | 否 | V2: 按书籍查询 |

### 3.3 paragraphs — 段落表

```javascript
{
  id:          String,    // UUID, 主键
  chapterId:   Number,    // 所属章节 ID (关联 chapters.id)
  content:     String,    // 段落文本内容
  sortOrder:   Number,    // 段落在章节内的排序
  recapBrief:  String,    // 该段的前文提要 (无版本)
  followUp:    String,    // 该段的后续内容描述 (无版本)
  createdAt:   Number,    // 创建时间 (时间戳, 毫秒)
  updatedAt:   Number     // 最后更新时间 (精确到毫秒)
}
```

**索引:**
| 索引名 | 字段 | 唯一 | 说明 |
|--------|------|------|------|
| `idx_chapterId` | `chapterId` | 否 | 按章节查询段落 |
| `idx_sortOrder` | `[chapterId, sortOrder]` | 否 | 按章节和排序联合查询 |

### 3.4 paragraph_bindings — 段落绑定信息表

```javascript
{
  id:            String,    // UUID, 主键
  paragraphId:   String,    // 关联的段落 UUID
  categoryId:    String,    // 关联的类目 UUID
  categoryVersion: Number,  // 绑定时类目的版本号 (快照)
  bindingType:   String,    // 绑定类型: 'character' | 'location' | 'item' | 'sect' ...
  createdAt:     Number,    // 创建时间 (时间戳, 毫秒)
}
```

**索引:**
| 索引名 | 字段 | 唯一 | 说明 |
|--------|------|------|------|
| `idx_paragraphId` | `paragraphId` | 否 | 按段落查绑定 |
| `idx_categoryId` | `categoryId` | 否 | 按类目查绑定 |

### 3.5 ai_providers — AI 供应商表

```javascript
{
  id:          String,    // UUID, 主键
  name:        String,    // 供应商名称
  apiUrl:      String,    // API 地址
  apiKey:      String,    // API Key (存储在本地)
  retryCount:  Number,    // 重试次数
  sortOrder:   Number,    // 排序
  createdAt:   Number,    // 创建时间
  updatedAt:   Number     // 最后修改时间
}
```

### 3.6 ai_models — AI 模型表

```javascript
{
  id:                String,    // UUID, 主键
  providerId:        String,    // 关联的供应商 UUID
  name:              String,    // 模型名称 (如: gpt-4)
  intelligenceLevel: String,    // V2: 智能等级 ('high' | 'medium' | 'basic')
  sortOrder:         Number,    // 排序
  createdAt:         Number,    // 创建时间
}
```

**索引:**
| 索引名 | 字段 | 唯一 | 说明 |
|--------|------|------|------|
| `idx_providerId` | `providerId` | 否 | 按供应商查模型 |

### 3.7 role_configs — 职能配置表

> V2 变更：主键由固定枚举 `role` 改为 UUID `id`，职能不再是固定枚举，由用户自行创建。

```javascript
{
  id:              String,    // V2: UUID, 主键 (替代原来的 role 枚举值)
  name:            String,    // V2: 用户自定义的职能名称
  promptTemplate:  String,    // 提示词模板 (含 {{变量}} 占位)
  providerId:      String,    // 使用的供应商 UUID
  modelId:         String,    // 使用的模型 UUID
  outputVar:       String,    // 输出内容变量枚举值
  customVars:      String,    // V2: 自定义变量定义 JSON (见 3.13)
  sortOrder:       Number,    // V2: 排序
  createdAt:       Number,    // 创建时间
  updatedAt:       Number     // 最后修改时间
}
```

### 3.8 flow_configs — 流程配置表

```javascript
{
  id:           String,    // UUID, 主键
  name:         String,    // 流程名称
  trigger:      String,    // 触发方式 (枚举值)
  enabled:      Boolean,   // 是否启用
  blocking:     Boolean,   // 是否阻塞 (如果输出枚举为阻塞则强制为 true)
  steps:        String,    // 二维数组 JSON 字符串: [[role1, role2], [role3]]
  sortOrder:    Number,    // 排序
  createdAt:    Number,    // 创建时间
  updatedAt:    Number     // 最后修改时间
}
```

### 3.9 recap_data — 前情提要表

```javascript
{
  id:             String,    // UUID, 主键
  chapterId:      Number,    // 关联章节 (可为 null, 表示跨章节汇总)
  recapText:      String,    // 提要文本
  coverRange:     String,    // 覆盖的章节范围 JSON, 如 [1, 10]
  createdAt:      Number,    // 创建时间
  updatedAt:      Number     // 最后修改时间
}
```

**索引:**
| 索引名 | 字段 | 唯一 | 说明 |
|--------|------|------|------|
| `idx_chapterId` | `chapterId` | 否 | 按章节查提要 |

### 3.10 app_settings — 应用设置表

```javascript
{
  key:    String,    // 设置键名, 主键
  value:  String     // 设置值 (JSON 字符串)
}
```

**预设 key:**
| key | 说明 | 默认值 |
|-----|------|--------|
| `recap_chapter_batch` | 前情提要每次处理的章节数 | `10` |
| `recap_target_words` | 前情提要每次压缩的目标字数 | `500` |
| `current_chapter_id` | 当前编辑的章节 ID | `null` |
| `current_book_id` | V2: 当前编辑的书籍 ID | `null` |
| `log_max_days` | V2: 日志保留天数 | `30` |
| `log_max_count` | V2: 日志最大条数 | `1000` |

### 3.11 books — 书籍表 (V2 新增)

```javascript
{
  id:          String,    // UUID, 主键
  name:        String,    // 书名
  description: String,    // 简介
  sortOrder:   Number,    // 排序
  createdAt:   Number,    // 创建时间 (时间戳, 毫秒)
  updatedAt:   Number     // 最后修改时间 (时间戳, 毫秒)
}
```

### 3.12 ai_logs — AI 日志表 (V2 新增)

```javascript
{
  id:           String,    // UUID, 主键
  providerId:   String,    // 供应商 UUID
  providerName: String,    // 供应商名称 (快照, 防止删除后丢失)
  modelId:      String,    // 模型 UUID
  modelName:    String,    // 模型名称 (快照)
  prompt:       String,    // 发送的提示词
  response:     String,    // AI 回复内容
  duration:     Number,    // 耗时 (毫秒)
  status:       String,    // 'success' | 'failed'
  error:        String,    // 错误信息 (失败时)
  createdAt:    Number     // 请求时间 (时间戳, 毫秒)
}
```

**索引:**
| 索引名 | 字段 | 唯一 | 说明 |
|--------|------|------|------|
| `idx_createdAt` | `createdAt` | 否 | 按时间排序 |
| `idx_status` | `status` | 否 | 按状态筛选 |

### 3.13 自定义变量格式 (V2 新增)

> 存储在 role_configs.customVars 字段中，JSON 字符串格式。

```javascript
// customVars JSON 结构
[
  {
    name:      String,    // 变量名 (用于 {{自定义:变量名}} 引用)
    isOutput:  Boolean    // true = 此变量为该职能的输出; false = 需要从上下文获取
  }
]
```

- 自定义变量为 **流程级作用域**，仅在流程执行期间存在
- 流程引擎维护一个包含自定义变量的 context 对象
- 一个职能输出的自定义变量可被后续步骤的职能作为输入读取
- 不持久化到独立表中，仅在 role_configs.customVars 中定义

---

## 4. 枚举定义

### 4.1 职能枚举 (RoleEnum) — V2 已废弃

> V2 变更: 职能不再使用固定枚举。用户可自由创建/编辑/删除职能。
> 原有的 writer/reviewer/summarizer/recap_writer 枚举值已移除。
> 职能使用 UUID 标识，存储在 role_configs 表中。

### 4.2 变量枚举 (VariableEnum)

| 值 | 显示名 | 用作输入 | 用作输出 | 阻塞 | 说明 |
|----|--------|----------|----------|------|------|
| `context_before` | 前文信息 | ✅ | ❌ | - | 前情提要文本 |
| `user_input` | 用户输入 | ✅ | ❌ | - | 用户在聊天框的输入 |
| `chapter_outline` | 章节概述 | ✅ | ❌ | - | 用户输入的章节概述 |
| `follow_up` | 后续概要 | ✅ | ❌ | - | 用户输入的后续概要 |
| `bound_settings` | 绑定设定 | ✅ | ❌ | - | 绑定的类目设定信息 |
| `current_paragraph` | 当前段落 | ✅ | ❌ | - | 当前选中的段落 |
| `chapter_content` | 章节内容 | ✅ | ❌ | - | 当前章节全部内容 |
| `ai_review` | AI评审意见 | ✅ | ✅ | 否 | AI 评审意见 |
| `generated_paragraph` | 生成段落 | ❌ | ✅ | 是 | 生成的段落内容 |
| `generated_summary` | 生成概要 | ❌ | ✅ | 是 | 生成的章节概要 |
| `generated_recap` | 生成提要 | ❌ | ✅ | 否 | 生成的前情提要 |

### 4.3 触发方式枚举 (TriggerEnum)

| 值 | 显示名 | 说明 |
|----|--------|------|
| `generate_paragraph` | 生成段落 | 用户点击"开始生成"按钮时触发 |
| `generate_chapter` | 生成章节 | 用户点击"生成章节"按钮时触发 |
| `setting_changed` | 设定变更 | 类目信息被修改时触发 |

### 4.4 类目类型枚举 (CategoryTypeEnum)

| 值 | 显示名 | 说明 |
|----|--------|------|
| `character` | 人物 | 小说中的人物角色 |
| `location` | 地点 | 故事发生的地点 |
| `sect` | 宗门 | 修仙类宗门组织 |
| `item` | 物品 | 神兵、法宝等 |
| `event` | 事件 | 重要事件 |
| `custom` | 自定义 | 用户自定义类型 |

### 4.5 智能等级枚举 (IntelligenceLevelEnum) — V2 新增

| 值 | 显示名 | 说明 |
|----|--------|------|
| `high` | 高级 | 高级智能模型 (如 GPT-4, Claude Opus) |
| `medium` | 中级 | 中级智能模型 (如 GPT-4o-mini, Claude Sonnet) |
| `basic` | 基础 | 基础智能模型 (如 GPT-3.5, 小型本地模型) |

---

## 5. 数据导入/导出格式

### 5.1 导出 ZIP 结构

```
export.zip
├── manifest.json          // 元信息（导出时间、版本等）
├── books.json             // V2: 书籍数据
├── categories.json        // 类目数据数组
├── chapters.json          // 章节数据数组
├── paragraphs.json        // 段落数据数组
├── paragraph_bindings.json // 段落绑定数据
├── ai_providers.json      // AI 供应商配置
├── ai_models.json         // AI 模型配置
├── role_configs.json      // 职能配置
├── flow_configs.json      // 流程配置
├── recap_data.json        // 前情提要
├── ai_logs.json           // V2: AI 日志 (可选导出)
└── app_settings.json      // 应用设置
```

### 5.2 manifest.json 格式

```javascript
{
  version:     "2.0",           // V2: 数据格式版本
  exportedAt:  Number,           // 导出时间戳
  appVersion:  "2.0.0",         // V2: 应用版本
  tables: {                     // 各表数据条数
    categories: 25,
    chapters: 5,
    paragraphs: 48,
    // ...
  }
}
```

### 5.3 单独导出小说

```
novel_export.zip
├── manifest.json          // 元信息
└── chapters/
    ├── 001_第一章_初入修仙界.txt
    ├── 002_第二章_天赋觉醒.txt
    └── ...
```

### 5.4 模板导入/导出格式 (V2 新增)

> 用于导出/导入职能配置和流程配置模板，不含训练数据。

```javascript
// template.json
{
  version:      "2.0",
  exportedAt:   Number,
  type:         "template",
  roles: [
    {
      name:            String,    // 职能名称
      promptTemplate:  String,    // 提示词模板
      outputVar:       String,    // 输出变量
      customVars:      Array,     // 自定义变量定义
      intelligenceLevel: String   // 导出时记录所用模型的智能等级
    }
  ],
  flows: [
    {
      name:      String,    // 流程名称
      trigger:   String,    // 触发方式
      enabled:   Boolean,
      blocking:  Boolean,
      steps:     Array      // 二维数组，引用职能名称 (而非 UUID)
    }
  ]
}
```

**导入匹配规则:**
1. 按 `intelligenceLevel` 在本地模型中查找匹配的模型
2. 同等级有多个模型时，使用第一个
3. 无匹配模型时，提示用户手动选择

---

## 6. V2 数据库迁移说明

### 6.1 Version 1 → 2 迁移

在 IndexedDB `onupgradeneeded` 事件中处理迁移:

1. **新建 ObjectStore**: `books`, `ai_logs`
2. **修改 `role_configs`**: 删除旧 store (keyPath: 'role')，创建新 store (keyPath: 'id')
   - 迁移数据: 为旧记录生成 UUID，将 `role` 值移入 `name` 字段
3. **修改 `ai_models`**: 新增 `intelligenceLevel` 字段（默认值 'medium'）
4. **修改 `categories`**: 新增 `idx_bookId` 索引
5. **修改 `chapters`**: 新增 `idx_bookId` 索引
6. **旧数据处理**: 未关联 bookId 的数据分配到自动创建的默认书籍

---

## 6. 数据关系图

```
categories (类目)
  ├── parentId → categories.id (自引用, 树形)
  └── ← paragraph_bindings.categoryId

chapters (章节)
  ├── ← paragraphs.chapterId
  └── ← recap_data.chapterId

paragraphs (段落)
  ├── chapterId → chapters.id
  └── ← paragraph_bindings.paragraphId

paragraph_bindings (绑定)
  ├── paragraphId → paragraphs.id
  └── categoryId → categories.id

ai_providers (供应商)
  └── ← ai_models.providerId
      └── ← role_configs.modelId

role_configs (职能)
  └── role ← flow_configs.steps[][] (引用)
```
