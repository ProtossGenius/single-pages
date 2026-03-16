/* ===== 枚举定义 ===== */

/* V2: RoleEnum 已移除。职能不再是固定枚举，由用户自行创建，存储在 role_configs 表中 (UUID 主键)。 */

const IntelligenceLevelEnum = Object.freeze({
  HIGH:   { value: 'high',   label: '高级' },
  MEDIUM: { value: 'medium', label: '中级' },
  BASIC:  { value: 'basic',  label: '基础' },
});

const IntelligenceLevelList = Object.values(IntelligenceLevelEnum);

function getIntelligenceLevelByValue(value) {
  return IntelligenceLevelList.find(l => l.value === value) || null;
}

const VariableEnum = Object.freeze({
  CONTEXT_BEFORE:      { value: 'context_before',      label: '前文信息',   isInput: true,  isOutput: false, blocking: false },
  USER_INPUT:          { value: 'user_input',           label: '用户输入',   isInput: true,  isOutput: false, blocking: false },
  CHAPTER_OUTLINE:     { value: 'chapter_outline',      label: '章节概述',   isInput: true,  isOutput: false, blocking: false },
  FOLLOW_UP:           { value: 'follow_up',            label: '后续概要',   isInput: true,  isOutput: false, blocking: false },
  BOUND_SETTINGS:      { value: 'bound_settings',       label: '绑定设定',   isInput: true,  isOutput: false, blocking: false },
  CURRENT_PARAGRAPH:   { value: 'current_paragraph',    label: '当前段落',   isInput: true,  isOutput: false, blocking: false },
  CHAPTER_CONTENT:     { value: 'chapter_content',      label: '章节内容',   isInput: true,  isOutput: false, blocking: false },
  AI_REVIEW:           { value: 'ai_review',            label: 'AI评审意见', isInput: true,  isOutput: true,  blocking: false },
  GENERATED_PARAGRAPH: { value: 'generated_paragraph',  label: '生成段落',   isInput: false, isOutput: true,  blocking: true  },
  GENERATED_SUMMARY:   { value: 'generated_summary',    label: '生成概要',   isInput: false, isOutput: true,  blocking: true  },
  GENERATED_RECAP:     { value: 'generated_recap',      label: '生成提要',   isInput: false, isOutput: true,  blocking: false },
});

const VariableList = Object.values(VariableEnum);
const InputVariables = VariableList.filter(v => v.isInput);
const OutputVariables = VariableList.filter(v => v.isOutput);

function getVariableByValue(value) {
  return VariableList.find(v => v.value === value) || null;
}

const TriggerEnum = Object.freeze({
  GENERATE_PARAGRAPH: { value: 'generate_paragraph', label: '生成段落' },
  GENERATE_CHAPTER:   { value: 'generate_chapter',   label: '生成章节' },
  SETTING_CHANGED:    { value: 'setting_changed',     label: '设定变更' },
});

const TriggerList = Object.values(TriggerEnum);

function getTriggerByValue(value) {
  return TriggerList.find(t => t.value === value) || null;
}

const CategoryTypeEnum = Object.freeze({
  CHARACTER: { value: 'character', label: '人物' },
  LOCATION:  { value: 'location',  label: '地点' },
  SECT:      { value: 'sect',      label: '宗门' },
  ITEM:      { value: 'item',      label: '物品' },
  EVENT:     { value: 'event',     label: '事件' },
  CUSTOM:    { value: 'custom',    label: '自定义' },
});

const CategoryTypeList = Object.values(CategoryTypeEnum);

function getCategoryTypeByValue(value) {
  return CategoryTypeList.find(c => c.value === value) || null;
}

const ChapterStatus = Object.freeze({
  DRAFT:     'draft',
  COMPLETED: 'completed',
});

const AITaskStatus = Object.freeze({
  PENDING:   'pending',
  RUNNING:   'running',
  COMPLETED: 'completed',
  FAILED:    'failed',
});
