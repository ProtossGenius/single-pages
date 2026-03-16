/* ===== 日志管理对话框 ===== */
const LogUI = {
  _overlay: null,
  _filter: { status: '', since: 0 },

  async show() {
    const body = Utils.createElement('div', { style: 'min-width:600px;' });

    // 筛选栏
    const filterRow = Utils.createElement('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;' });

    const statusSelect = Utils.createElement('select', {
      style: 'padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;',
    });
    for (const [val, label] of [['', '全部'], ['success', '✅ 成功'], ['failed', '❌ 失败']]) {
      const opt = Utils.createElement('option', { value: val, textContent: label });
      if (val === this._filter.status) opt.selected = true;
      statusSelect.appendChild(opt);
    }

    const dateSelect = Utils.createElement('select', {
      style: 'padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;',
    });
    const now = Date.now();
    for (const [days, label] of [[0, '全部时间'], [1, '今天'], [7, '最近7天'], [30, '最近30天']]) {
      const opt = Utils.createElement('option', { value: String(days), textContent: label });
      dateSelect.appendChild(opt);
    }

    const exportBtn = Utils.createElement('button', { className: 'btn btn-sm btn-secondary', textContent: '导出' });
    const cleanBtn = Utils.createElement('button', { className: 'btn btn-sm btn-danger', textContent: '清理' });

    filterRow.appendChild(Utils.createElement('span', { textContent: '筛选:', style: 'font-size:13px;font-weight:600;' }));
    filterRow.appendChild(statusSelect);
    filterRow.appendChild(dateSelect);
    filterRow.appendChild(Utils.createElement('div', { style: 'flex:1;' }));
    filterRow.appendChild(exportBtn);
    filterRow.appendChild(cleanBtn);
    body.appendChild(filterRow);

    // 日志列表
    const listEl = Utils.createElement('div', { style: 'max-height:400px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);' });
    body.appendChild(listEl);

    // 自动清理设置
    const settingsRow = Utils.createElement('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:12px;font-size:12px;color:var(--text-muted);' });
    const maxDaysSetting = (await DB.getById(DB.STORES.APP_SETTINGS, 'log_max_days'))?.value || 30;
    const maxCountSetting = (await DB.getById(DB.STORES.APP_SETTINGS, 'log_max_count'))?.value || 1000;

    settingsRow.appendChild(Utils.createElement('span', { textContent: '自动清理: 保留' }));
    const daysInput = Utils.createElement('input', {
      type: 'number', value: String(maxDaysSetting), min: '1', max: '365',
      style: 'width:60px;padding:2px 6px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;text-align:center;',
    });
    settingsRow.appendChild(daysInput);
    settingsRow.appendChild(Utils.createElement('span', { textContent: '天 / 最多' }));
    const countInput = Utils.createElement('input', {
      type: 'number', value: String(maxCountSetting), min: '10', max: '10000',
      style: 'width:70px;padding:2px 6px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;text-align:center;',
    });
    settingsRow.appendChild(countInput);
    settingsRow.appendChild(Utils.createElement('span', { textContent: '条' }));
    const saveSettingsBtn = Utils.createElement('button', { className: 'btn btn-sm btn-secondary', textContent: '保存设置' });
    settingsRow.appendChild(saveSettingsBtn);
    body.appendChild(settingsRow);

    this._overlay = Modal.show({ title: 'AI 日志管理', body, className: 'modal-wide' });

    // Load initial list
    const loadList = async () => {
      const filter = {};
      if (statusSelect.value) filter.status = statusSelect.value;
      const days = parseInt(dateSelect.value);
      if (days > 0) filter.since = Date.now() - days * 86400000;
      const logs = await LogService.query(filter);
      this._renderList(listEl, logs);
    };

    statusSelect.addEventListener('change', loadList);
    dateSelect.addEventListener('change', loadList);

    exportBtn.addEventListener('click', async () => {
      const blob = await LogService.exportJSON();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `writer-logs-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      Utils.showToast('日志已导出');
    });

    cleanBtn.addEventListener('click', async () => {
      const count = await LogService.cleanup();
      Utils.showToast(`已清理 ${count} 条日志`);
      await loadList();
    });

    saveSettingsBtn.addEventListener('click', async () => {
      await DB.put(DB.STORES.APP_SETTINGS, { key: 'log_max_days', value: parseInt(daysInput.value) || 30 });
      await DB.put(DB.STORES.APP_SETTINGS, { key: 'log_max_count', value: parseInt(countInput.value) || 1000 });
      Utils.showToast('清理设置已保存');
    });

    await loadList();
  },

  _renderList(container, logs) {
    container.innerHTML = '';
    if (logs.length === 0) {
      container.appendChild(Utils.createElement('div', { textContent: '暂无日志', style: 'padding:24px;text-align:center;color:var(--text-muted);' }));
      return;
    }
    for (const log of logs) {
      const item = Utils.createElement('div', {
        style: 'padding:8px 12px;border-bottom:1px solid var(--border);cursor:pointer;font-size:13px;',
      });
      const header = Utils.createElement('div', { style: 'display:flex;gap:8px;align-items:center;' });
      header.appendChild(Utils.createElement('span', { textContent: Utils.formatTime(log.createdAt), style: 'color:var(--text-muted);font-size:12px;' }));
      header.appendChild(Utils.createElement('span', { textContent: `${log.providerName}/${log.modelName}`, style: 'font-weight:500;' }));
      header.appendChild(Utils.createElement('span', { textContent: log.status === 'success' ? '✅ 成功' : '❌ 失败' }));
      header.appendChild(Utils.createElement('span', { textContent: `${(log.duration / 1000).toFixed(1)}s`, style: 'color:var(--text-muted);' }));
      item.appendChild(header);

      const preview = Utils.createElement('div', {
        textContent: log.status === 'failed' ? `错误: ${log.error}` : Utils.truncate(log.response, 80),
        style: 'color:var(--text-muted);font-size:12px;margin-top:4px;',
      });
      item.appendChild(preview);

      // Expandable detail
      const detail = Utils.createElement('div', { style: 'display:none;margin-top:8px;font-size:12px;white-space:pre-wrap;word-break:break-all;' });
      detail.appendChild(Utils.createElement('div', { textContent: '提示词:', style: 'font-weight:600;margin-bottom:2px;' }));
      detail.appendChild(Utils.createElement('div', { textContent: log.prompt, style: 'background:var(--bg-secondary);padding:6px;border-radius:var(--radius-sm);margin-bottom:6px;max-height:150px;overflow-y:auto;' }));
      if (log.status === 'success') {
        detail.appendChild(Utils.createElement('div', { textContent: '回复:', style: 'font-weight:600;margin-bottom:2px;' }));
        detail.appendChild(Utils.createElement('div', { textContent: log.response, style: 'background:var(--bg-secondary);padding:6px;border-radius:var(--radius-sm);max-height:150px;overflow-y:auto;' }));
      }
      item.appendChild(detail);

      item.addEventListener('click', () => {
        detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
      });

      container.appendChild(item);
    }
  },
};
