/* ===== 导入服务 ===== */
const ImportService = {
  /** 显示导入对话框 */
  showDialog() {
    const body = Utils.createElement('div', {});

    const dropZone = Utils.createElement('div', {
      style: {
        border: '2px dashed var(--border)', borderRadius: 'var(--radius)',
        padding: '40px 20px', textAlign: 'center', cursor: 'pointer',
        color: 'var(--text-secondary)', marginBottom: '12px',
      },
    });
    dropZone.textContent = '拖拽 .zip 文件到此处，或点击选择文件';

    const fileInput = Utils.createElement('input', {
      type: 'file',
      accept: '.zip',
      style: { display: 'none' },
    });

    let selectedFile = null;

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--accent)';
      dropZone.style.background = 'var(--accent-soft)';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'var(--border)';
      dropZone.style.background = '';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border)';
      dropZone.style.background = '';
      const files = e.dataTransfer.files;
      if (files.length > 0 && files[0].name.endsWith('.zip')) {
        selectedFile = files[0];
        dropZone.textContent = `已选择: ${selectedFile.name}`;
      }
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        selectedFile = fileInput.files[0];
        dropZone.textContent = `已选择: ${selectedFile.name}`;
      }
    });

    const warning = Utils.createElement('div', {
      textContent: '⚠️ 导入将覆盖当前所有数据',
      style: { fontSize: '13px', color: 'var(--warning)', marginBottom: '8px' },
    });

    body.appendChild(dropZone);
    body.appendChild(fileInput);
    body.appendChild(warning);

    Modal.show({
      title: '导入数据',
      body,
      buttons: [
        { text: '取消', className: 'btn-secondary', onClick: (overlay) => Modal.close(overlay) },
        {
          text: '确认导入', className: 'btn-primary',
          onClick: async (overlay) => {
            if (!selectedFile) {
              Utils.showToast('请先选择文件', 'warning');
              return;
            }
            Modal.close(overlay);
            await this.importFromZip(selectedFile);
          },
        },
      ],
    });
  },

  /** 从 ZIP 文件导入数据 */
  async importFromZip(file) {
    const progress = Modal.progress('导入数据');

    try {
      progress.update(5, '解压文件...');
      const zip = await JSZip.loadAsync(file);

      // 验证 manifest
      progress.update(10, '验证 manifest...');
      const manifestFile = zip.file('manifest.json');
      if (!manifestFile) throw new Error('无效的导出文件：缺少 manifest.json');
      const manifest = JSON.parse(await manifestFile.async('text'));
      if (!manifest.version) throw new Error('无效的 manifest 格式');

      const tables = [
        'ai_providers', 'ai_models', 'role_configs', 'flow_configs',
        'categories', 'chapters', 'paragraphs', 'paragraph_bindings',
        'recap_data', 'app_settings',
      ];

      // 清空现有数据
      progress.update(15, '清空现有数据...');
      await DB.clearAll();

      // 逐表导入
      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        const jsonFile = zip.file(`${table}.json`);
        if (jsonFile) {
          const records = JSON.parse(await jsonFile.async('text'));
          if (Array.isArray(records) && records.length > 0) {
            await DB.putAll(table, records);
          }
        }
        progress.update(15 + Math.round((i + 1) / tables.length * 80), `导入 ${table}...`);
      }

      progress.update(98, '刷新界面...');

      // 重新初始化 Store
      await Store.init();

      progress.update(100, '导入完成');
      setTimeout(() => progress.close(), 600);

      Utils.showToast('导入成功');
      EventBus.emit(Events.DATA_IMPORTED);

      // 刷新页面以重载所有 UI
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      progress.close();
      Utils.showToast('导入失败: ' + err.message, 'error');
    }
  },
};
