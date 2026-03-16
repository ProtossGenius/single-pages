/* ===== 导出服务 ===== */
const ExportService = {
  /** 导出全部数据为 ZIP */
  async exportAll() {
    const progress = Modal.progress('导出数据');

    try {
      const tables = [
        'categories', 'chapters', 'paragraphs', 'paragraph_bindings',
        'ai_providers', 'ai_models', 'role_configs', 'flow_configs',
        'recap_data', 'app_settings', 'books', 'ai_logs',
      ];

      const data = {};
      const manifest = { version: '2.0', exportedAt: Utils.now(), appVersion: '2.0.0', tables: {} };

      // 读取数据 (0% - 70%)
      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        const records = await DB.getAll(table);
        data[table] = records;
        manifest.tables[table] = records.length;
        progress.update(Math.round((i + 1) / tables.length * 70), `读取 ${table}...`);
      }

      // 生成 manifest (70% - 75%)
      progress.update(75, '生成 manifest...');

      // 打包 (75% - 95%)
      progress.update(80, '压缩打包中...');
      const zip = new JSZip();
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));
      for (const table of tables) {
        zip.file(`${table}.json`, JSON.stringify(data[table], null, 2));
      }

      progress.update(90, '生成文件...');
      const blob = await zip.generateAsync({ type: 'blob' });

      // 下载 (95% - 100%)
      progress.update(95, '准备下载...');
      this._triggerDownload(blob, `writer-export-${this._formatDate()}.zip`);
      progress.update(100, '导出完成');

      setTimeout(() => progress.close(), 800);
      Utils.showToast('导出成功');
      EventBus.emit(Events.DATA_EXPORTED);
    } catch (err) {
      progress.close();
      Utils.showToast('导出失败: ' + err.message, 'error');
    }
  },

  /** 导出小说内容 */
  async exportNovel() {
    const progress = Modal.progress('导出小说');

    try {
      progress.update(10, '读取章节...');
      const chapters = await DB.getAll(DB.STORES.CHAPTERS);
      chapters.sort((a, b) => (a.sortOrder || a.id) - (b.sortOrder || b.id));

      if (chapters.length === 0) {
        progress.close();
        Utils.showToast('没有可导出的章节', 'warning');
        return;
      }

      const zip = new JSZip();
      const chaptersFolder = zip.folder('chapters');

      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        const num = String(i + 1).padStart(3, '0');
        const safeName = (ch.title || `第${i + 1}章`).replace(/[\/\\:*?"<>|]/g, '_');

        // 收集段落
        const paragraphs = await DB.getByIndex(DB.STORES.PARAGRAPHS, 'idx_chapterId', ch.id);
        paragraphs.sort((a, b) => a.sortOrder - b.sortOrder);
        const content = paragraphs.map(p => p.content).filter(Boolean).join('\n\n');

        chaptersFolder.file(`${num}_${safeName}.txt`, `${ch.title}\n\n${content}`);
        progress.update(10 + Math.round((i + 1) / chapters.length * 80), `处理 ${ch.title}...`);
      }

      const manifest = { version: '1.0', exportedAt: Utils.now(), type: 'novel', chapterCount: chapters.length };
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      progress.update(92, '生成文件...');
      const blob = await zip.generateAsync({ type: 'blob' });

      this._triggerDownload(blob, `novel-${this._formatDate()}.zip`);
      progress.update(100, '导出完成');
      setTimeout(() => progress.close(), 800);
      Utils.showToast('小说导出成功');
    } catch (err) {
      progress.close();
      Utils.showToast('导出失败: ' + err.message, 'error');
    }
  },

  _triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  _formatDate() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  },
};
