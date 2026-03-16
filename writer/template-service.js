/* ===== 模板导入导出服务 ===== */
const TemplateService = {
  /**
   * 导出模板 — 生成 JSON 包含职能和流程配置
   */
  async exportTemplate() {
    const roles = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    const flows = await DB.getAll(DB.STORES.FLOW_CONFIGS);

    const templateRoles = [];
    for (const role of roles) {
      let intelligenceLevel = 'medium';
      if (role.modelId) {
        const model = await DB.getById(DB.STORES.AI_MODELS, role.modelId);
        if (model && model.intelligenceLevel) {
          intelligenceLevel = model.intelligenceLevel;
        }
      }
      templateRoles.push({
        name: role.name,
        promptTemplate: role.promptTemplate || '',
        outputVar: role.outputVar || '',
        customVars: role.customVars ? JSON.parse(role.customVars) : [],
        intelligenceLevel,
      });
    }

    // Build name → index map for flow steps
    const roleIdToName = {};
    for (const role of roles) {
      roleIdToName[role.id] = role.name;
    }

    const templateFlows = [];
    for (const flow of flows) {
      const steps = JSON.parse(flow.steps || '[]');
      // Replace UUIDs with role names
      const namedSteps = steps.map(step =>
        step.map(roleId => roleIdToName[roleId] || roleId)
      );
      templateFlows.push({
        name: flow.name,
        trigger: flow.trigger,
        enabled: flow.enabled,
        blocking: flow.blocking,
        steps: namedSteps,
      });
    }

    return {
      version: '2.0',
      exportedAt: Utils.now(),
      type: 'template',
      roles: templateRoles,
      flows: templateFlows,
    };
  },

  /**
   * 匹配本地模型 — 按智能等级
   */
  async matchModels(templateRoles) {
    const allModels = await DB.getAll(DB.STORES.AI_MODELS);
    const matches = [];
    for (const role of templateRoles) {
      const level = role.intelligenceLevel || 'medium';
      const match = allModels.find(m => m.intelligenceLevel === level);
      matches.push({
        roleName: role.name,
        level,
        matchedModel: match || null,
        matchedModelId: match ? match.id : null,
        matchedProviderId: match ? match.providerId : null,
      });
    }
    return matches;
  },

  /**
   * 导入模板 — 创建职能和流程配置
   * @param {Object} template - 解析后的模板 JSON
   * @param {Array} modelBindings - [{roleName, modelId, providerId}]
   */
  async importTemplate(template, modelBindings) {
    const now = Utils.now();
    const nameToNewId = {};

    // Create role configs
    for (let i = 0; i < template.roles.length; i++) {
      const role = template.roles[i];
      const binding = modelBindings.find(b => b.roleName === role.name) || {};
      const newId = Utils.generateId();
      nameToNewId[role.name] = newId;

      await DB.put(DB.STORES.ROLE_CONFIGS, {
        id: newId,
        name: role.name,
        promptTemplate: role.promptTemplate || '',
        outputVar: role.outputVar || '',
        customVars: JSON.stringify(role.customVars || []),
        providerId: binding.providerId || '',
        modelId: binding.modelId || '',
        sortOrder: i,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Create flow configs with name→UUID mapping
    for (let i = 0; i < template.flows.length; i++) {
      const flow = template.flows[i];
      const steps = flow.steps.map(step =>
        step.map(name => nameToNewId[name] || name)
      );

      await DB.put(DB.STORES.FLOW_CONFIGS, {
        id: Utils.generateId(),
        name: flow.name,
        trigger: flow.trigger,
        enabled: flow.enabled,
        blocking: flow.blocking,
        steps: JSON.stringify(steps),
        sortOrder: i,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { roleCount: template.roles.length, flowCount: template.flows.length };
  },
};
