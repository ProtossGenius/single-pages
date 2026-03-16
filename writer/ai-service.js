/* ===== AI 调用服务层 ===== */
const AIService = {
  /**
   * 调用 AI API
   * @param {string} providerId - 供应商 ID
   * @param {string} modelId - 模型 ID
   * @param {string} prompt - 提示词
   * @param {Object} [options] - 选项
   * @param {number} [options.timeout] - 超时毫秒数 (默认 60000)
   * @returns {Promise<string>} AI 返回文本
   */
  async call(providerId, modelId, prompt, options = {}) {
    const provider = await DB.getById(DB.STORES.AI_PROVIDERS, providerId);
    if (!provider) throw new Error(`供应商不存在: ${providerId}`);

    const model = await DB.getById(DB.STORES.AI_MODELS, modelId);
    if (!model) throw new Error(`模型不存在: ${modelId}`);

    const retryCount = provider.retryCount || 3;
    const start = Date.now();
    try {
      const result = await this._callWithRetry(provider, model.name, prompt, retryCount, options);
      // Auto-log success
      LogService.record({
        providerId, providerName: provider.name,
        modelId, modelName: model.name,
        prompt, response: result.text,
        duration: Date.now() - start,
        status: 'success',
      }).catch(() => {}); // fire-and-forget
      return result;
    } catch (err) {
      // Auto-log failure
      LogService.record({
        providerId, providerName: provider.name,
        modelId, modelName: model.name,
        prompt, response: '',
        duration: Date.now() - start,
        status: 'failed', error: err.message,
      }).catch(() => {}); // fire-and-forget
      throw err;
    }
  },

  /**
   * 带重试的 AI 调用
   * @returns {Promise<{text: string, failCount: number, errors: string[]}>}
   */
  async _callWithRetry(provider, modelName, prompt, retryCount, options = {}) {
    const timeout = options.timeout || 60000;
    const errors = [];

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const text = await this._sendRequest(provider, modelName, prompt, timeout);
        return { text, failCount: attempt, errors };
      } catch (err) {
        errors.push(err.message || String(err));
        if (attempt >= retryCount) {
          throw Object.assign(new Error(`AI 调用失败 (${retryCount + 1}次尝试): ${errors[errors.length - 1]}`), {
            failCount: attempt + 1,
            errors,
          });
        }
      }
    }
  },

  /**
   * 发送单次 AI 请求
   */
  async _sendRequest(provider, modelName, prompt, timeout) {
    const apiUrl = provider.apiUrl.replace(/\/+$/, '');
    const url = apiUrl.endsWith('/chat/completions')
      ? apiUrl
      : `${apiUrl}/chat/completions`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json();
      return this.parseResponse(data);
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`请求超时 (${timeout / 1000}s)`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },

  /**
   * 解析 AI 响应 — 支持 OpenAI 和 Ollama 格式
   */
  parseResponse(data) {
    // OpenAI format: choices[0].message.content
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content || '';
    }
    // Ollama format: message.content (no choices array)
    if (data.message && data.message.content !== undefined) {
      return data.message.content || '';
    }
    throw new Error('意外的 API 响应格式');
  },
};
