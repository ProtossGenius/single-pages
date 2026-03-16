/* ===== 模板导入导出对话框 ===== */
const TemplateUI = {
  async showExport() {
    const template = await TemplateService.exportTemplate();
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `writer-template-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Utils.showToast(`已导出模板 (${template.roles.length} 个职能, ${template.flows.length} 个流程)`);
  },

  async showImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const template = JSON.parse(text);
        if (template.type !== 'template' || !template.roles) {
          Utils.showToast('无效的模板文件', 'error');
          return;
        }
        await this._showMatchDialog(template);
      } catch (err) {
        Utils.showToast('解析模板失败: ' + err.message, 'error');
      }
    });
    input.click();
  },

  async _showMatchDialog(template) {
    const matches = await TemplateService.matchModels(template.roles);
    const allModels = await DB.getAll(DB.STORES.AI_MODELS);

    const body = Utils.createElement('div', { style: 'min-width:400px;' });
    body.appendChild(Utils.createElement('p', { textContent: '模型匹配:', style: 'margin-bottom:12px;font-weight:600;' }));

    const selects = [];
    for (const match of matches) {
      const row = Utils.createElement('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px;' });
      row.appendChild(Utils.createElement('span', {
        textContent: `${match.roleName} (${match.level})`,
        style: 'flex:1;font-size:13px;',
      }));
      row.appendChild(Utils.createElement('span', { textContent: '→', style: 'color:var(--text-muted);' }));

      const select = Utils.createElement('select', {
        style: 'padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;',
      });
      select.appendChild(Utils.createElement('option', { value: '', textContent: '未匹配 ⚠️' }));
      for (const m of allModels) {
        const opt = Utils.createElement('option', {
          value: `${m.providerId}|${m.id}`,
          textContent: m.name,
        });
        if (match.matchedModelId === m.id) opt.selected = true;
        select.appendChild(opt);
      }
      selects.push({ roleName: match.roleName, select });
      row.appendChild(select);
      body.appendChild(row);
    }

    body.appendChild(Utils.createElement('p', {
      textContent: '⚠️ 导入将新增职能和流程配置',
      style: 'margin-top:12px;font-size:12px;color:var(--warning);',
    }));

    const btnRow = Utils.createElement('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px;' });
    const cancelBtn = Utils.createElement('button', { className: 'btn btn-secondary', textContent: '取消' });
    const importBtn = Utils.createElement('button', { className: 'btn btn-primary', textContent: '确认导入' });
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(importBtn);
    body.appendChild(btnRow);

    const overlay = Modal.show({ title: '导入模板', body, className: 'modal-wide' });

    cancelBtn.addEventListener('click', () => overlay.remove());
    importBtn.addEventListener('click', async () => {
      const bindings = selects.map(s => {
        const val = s.select.value;
        const [providerId, modelId] = val ? val.split('|') : ['', ''];
        return { roleName: s.roleName, providerId, modelId };
      });
      const result = await TemplateService.importTemplate(template, bindings);
      overlay.remove();
      Utils.showToast(`已导入 ${result.roleCount} 个职能, ${result.flowCount} 个流程`);
    });
  },
};
