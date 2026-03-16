/* ===== 流程执行引擎 ===== */
const FlowEngine = (() => {
  let _status = null;
  let _cancelled = false;

  /**
   * 执行流程
   * @param {string} trigger - 触发方式 (TriggerEnum 的 value)
   * @param {Object} context - 变量上下文
   * @returns {Promise<Object>} 执行后的 context
   */
  async function execute(trigger, context) {
    // 查找匹配的流程
    const allFlows = await DB.getAll(DB.STORES.FLOW_CONFIGS);
    const flows = allFlows.filter(f => f.trigger === trigger && f.enabled !== false);

    if (flows.length === 0) {
      throw new Error(`没有匹配的流程 (trigger: ${trigger})`);
    }

    _cancelled = false;

    // Initialize custom vars context
    if (!context._customVars) context._customVars = {};

    // 检查是否有阻塞流程
    const hasBlocking = flows.some(f => f.blocking);
    Store.setAIRunning(true, hasBlocking);
    EventBus.emit(Events.AI_TASK_STARTED, { trigger });

    try {
      for (const flow of flows) {
        let steps;
        try {
          steps = JSON.parse(flow.steps || '[]');
        } catch { steps = []; }

        if (!Array.isArray(steps) || steps.length === 0) continue;

        // 初始化状态
        _status = {
          flowName: flow.name,
          totalSteps: steps.length,
          currentStep: 0,
          currentRoleName: '',
          steps: steps.map((step, i) => ({
            index: i,
            status: 'pending',
            duration: 0,
            roles: (Array.isArray(step) ? step : []).map(roleId => {
              return {
                roleId: roleId,
                displayName: roleId,  // will be updated when config is loaded
                status: 'pending',
                duration: 0,
                failCount: 0,
                maxRetry: 3,
                error: null,
              };
            }),
          })),
        };

        _emitProgress();

        for (let si = 0; si < steps.length; si++) {
          if (_cancelled) throw new Error('流程已取消');

          const step = steps[si];
          if (!Array.isArray(step) || step.length === 0) continue;

          _status.currentStep = si;
          _status.steps[si].status = 'running';
          const stepStart = Date.now();
          _emitProgress();

          // 并行执行同一步骤中的所有职能
          await Promise.all(step.map((roleId, ri) =>
            _executeRole(roleId, context, si, ri)
          ));

          _status.steps[si].duration = Date.now() - stepStart;

          // 判断步骤整体结果
          const allRolesCompleted = _status.steps[si].roles.every(r => r.status === 'completed');
          _status.steps[si].status = allRolesCompleted ? 'completed' : 'failed';
          _emitProgress();
        }
      }

      EventBus.emit(Events.AI_TASK_COMPLETED, { trigger, context });
      return context;
    } catch (err) {
      EventBus.emit(Events.AI_TASK_FAILED, { trigger, error: err.message });
      throw err;
    } finally {
      Store.setAIRunning(false, false);
    }
  }

  /**
   * 执行单个职能
   */
  async function _executeRole(roleId, context, stepIdx, roleIdx) {
    const statusRole = _status.steps[stepIdx].roles[roleIdx];
    statusRole.status = 'running';
    const roleStart = Date.now();

    try {
      // V2: 获取职能配置 by UUID
      const config = await DB.getById(DB.STORES.ROLE_CONFIGS, roleId);
      if (!config) throw new Error(`职能配置不存在: ${roleId}`);

      // Update display name from config
      statusRole.displayName = config.name || roleId;
      _status.currentRoleName = statusRole.displayName;
      _emitProgress();

      if (!config.providerId || !config.modelId) throw new Error(`职能 ${config.name || roleId} 未配置供应商/模型`);

      // 获取供应商信息以得到 retryCount
      const provider = await DB.getById(DB.STORES.AI_PROVIDERS, config.providerId);
      statusRole.maxRetry = provider ? (provider.retryCount || 3) : 3;

      // 替换变量占位符
      const prompt = _replaceVariables(config.promptTemplate || '', context);

      // 调用 AI
      const result = await AIService.call(config.providerId, config.modelId, prompt, {
        roleId: roleId,
        roleName: config.name || roleId,
      });

      statusRole.failCount = result.failCount || 0;
      statusRole.duration = Date.now() - roleStart;
      statusRole.status = 'completed';

      // 写入输出变量
      if (config.outputVar && result.text) {
        context[config.outputVar] = result.text;
      }

      // 写入自定义输出变量
      let customVars = [];
      try { customVars = JSON.parse(config.customVars || '[]'); } catch {}
      const outputCustomVars = customVars.filter(v => v.isOutput && v.name);
      if (outputCustomVars.length > 0 && result.text) {
        if (!context._customVars) context._customVars = {};
        for (const cv of outputCustomVars) {
          context._customVars[cv.name] = result.text;
        }
      }
    } catch (err) {
      statusRole.duration = Date.now() - roleStart;
      statusRole.status = 'failed';
      statusRole.error = err.message;
      statusRole.failCount = err.failCount || statusRole.failCount;
    }

    _emitProgress();
  }

  /**
   * 替换模板中的变量占位符 {{变量名}} 和自定义变量 {{自定义:变量名}}
   */
  function _replaceVariables(template, context) {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, label) => {
      // Check custom variable format: {{自定义:变量名}}
      if (label.startsWith('自定义:')) {
        const varName = label.slice(4);
        if (context._customVars && context._customVars[varName] !== undefined) {
          return context._customVars[varName];
        }
        return match;
      }
      // 根据 label 找到对应的 VariableEnum
      const variable = VariableList.find(v => v.label === label);
      if (variable && context[variable.value] !== undefined) {
        return context[variable.value];
      }
      return match; // 未匹配的保持原样
    });
  }

  function _emitProgress() {
    if (_status) {
      Store.setAIStatus(Utils.deepClone(_status));
    }
  }

  function getStatus() {
    return _status ? Utils.deepClone(_status) : null;
  }

  function cancel() {
    _cancelled = true;
  }

  return { execute, getStatus, cancel, _replaceVariables };
})();
