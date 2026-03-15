# AI 小说写作工具 — 数据设计文档

> 版本: 1.0  
> 最后更新: 2026-03-15  
> 关联文档: [需求文档](requirements.md)

---

## 1. 存储方案

使用浏览器 IndexedDB 作为持久化存储。数据库名称: `WriterDB`，版本: 1。

## 2. 数据库表设计 (Object Store)

### 2.1 ObjectStore 一览

| Store 名称 | 主键 | 说明 |
|------------|------|------|
| `categories` | `id` (UUID) | 类目数据（人物、地点、宗门等） |
| `chapters` | `id` (自增) | 章节表 |
| `paragraphs` | `id` (UUID) | 段落表 |
| `paragraph_bindings` | `id` (UUID) | 段落绑定信息 |
| `ai_providers` | `id` (UUID) | AI 供应商配置 |
| `ai_models` | `id` (UUID) | AI 模型配置 |
| `role_configs` | `role` (枚举值) | 职能配置 |
| `flow_configs` | `id` (UUID) | 流程配置 |
| `recap_data` | `id` (UUID) | 前情提要数据 |
| `app_settings` | `key` (字符串) | 应用全局设置 |

---

## 3. 详细表结构

### 3.1 categories — 类目表

```javascript
{
  id:          String,    // UUID, 主键
  parentId:    String,    // 父节点 UUID, 顶层为 null
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

### 3.2 chapters — 章节表

```javascript
{
  id:          Number,    // 自增主键
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
  id:          String,    // UUID, 主键
  providerId:  String,    // 关联的供应商 UUID
  name:        String,    // 模型名称 (如: gpt-4)
  sortOrder:   Number,    // 排序
  createdAt:   Number,    // 创建时间
}
```

**索引:**
| 索引名 | 字段 | 唯一 | 说明 |
|--------|------|------|------|
| `idx_providerId` | `providerId` | 否 | 按供应商查模型 |

### 3.7 role_configs — 职能配置表

```javascript
{
  role:          String,    // 职能枚举值, 主键
  promptTemplate:String,   // 提示词模板 (含 {{变量}} 占位)
  providerId:    String,   // 使用的供应商 UUID
  modelId:       String,   // 使用的模型 UUID
  outputVar:     String,   // 输出内容变量枚举值
  createdAt:     Number,   // 创建时间
  updatedAt:     Number    // 最后修改时间
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

---

## 4. 枚举定义

### 4.1 职能枚举 (RoleEnum)

| 值 | 显示名 | 说明 |
|----|--------|------|
| `writer` | 写手 | 负责生成小说段落 |
| `reviewer` | 评审员 | 负责评审段落质量 |
| `summarizer` | 概要师 | 负责生成章节概要 |
| `recap_writer` | 前情师 | 负责生成前情提要 |

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

---

## 5. 数据导入/导出格式

### 5.1 导出 ZIP 结构

```
export.zip
├── manifest.json          // 元信息（导出时间、版本等）
├── categories.json        // 类目数据数组
├── chapters.json          // 章节数据数组
├── paragraphs.json        // 段落数据数组
├── paragraph_bindings.json // 段落绑定数据
├── ai_providers.json      // AI 供应商配置
├── ai_models.json         // AI 模型配置
├── role_configs.json      // 职能配置
├── flow_configs.json      // 流程配置
├── recap_data.json        // 前情提要
└── app_settings.json      // 应用设置
```

### 5.2 manifest.json 格式

```javascript
{
  version:     "1.0",            // 数据格式版本
  exportedAt:  Number,           // 导出时间戳
  appVersion:  "1.0.0",         // 应用版本
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
