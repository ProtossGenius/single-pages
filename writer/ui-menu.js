/* ===== 菜单栏 UI ===== */
const MenuUI = {
  _activeMenu: null,

  init(container) {
    const menus = [
      {
        label: '📁 文件',
        items: [
          { label: '📥 导入...', action: () => ImportService.showDialog() },
          { label: '📤 导出...', action: () => ExportService.exportAll() },
          { type: 'divider' },
          { label: '📖 导出小说', action: () => ExportService.exportNovel() },
        ],
      },
      {
        label: '🤖 AI 配置',
        items: [
          { label: '🏢 供应商管理', action: () => AIConfigUI.show() },
          { label: '👤 职能配置', action: () => RoleConfigUI.show() },
          { label: '🔄 流程配置', action: () => FlowConfigUI.show() },
        ],
      },
    ];

    for (const menu of menus) {
      const menuItem = Utils.createElement('div', { className: 'menu-item' });
      menuItem.textContent = menu.label;

      const dropdown = Utils.createElement('div', { className: 'menu-dropdown' });
      for (const item of menu.items) {
        if (item.type === 'divider') {
          dropdown.appendChild(Utils.createElement('div', { className: 'menu-dropdown-divider' }));
        } else {
          const dropdownItem = Utils.createElement('div', {
            className: 'menu-dropdown-item',
            textContent: item.label,
            onClick: (e) => {
              e.stopPropagation();
              this._closeAll();
              item.action();
            },
          });
          dropdown.appendChild(dropdownItem);
        }
      }

      menuItem.appendChild(dropdown);
      menuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._activeMenu === menuItem) {
          this._closeAll();
        } else {
          this._closeAll();
          menuItem.classList.add('active');
          dropdown.classList.add('show');
          this._activeMenu = menuItem;
        }
      });

      container.appendChild(menuItem);
    }

    // 点击页面其他区域关闭菜单
    document.addEventListener('click', () => this._closeAll());
  },

  _closeAll() {
    if (this._activeMenu) {
      this._activeMenu.classList.remove('active');
      this._activeMenu.querySelector('.menu-dropdown').classList.remove('show');
      this._activeMenu = null;
    }
  },
};
