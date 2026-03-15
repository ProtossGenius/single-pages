/* ===== 模态对话框通用组件 ===== */

const Modal = (() => {
  const container = () => document.getElementById('modal-container');

  /**
   * 显示模态对话框
   * @param {Object} options
   * @param {string} options.title - 标题
   * @param {string|HTMLElement} options.body - 内容（HTML字符串或DOM元素）
   * @param {Array} [options.buttons] - 按钮数组 [{text, className, onClick}]
   * @param {Function} [options.onClose] - 关闭回调
   * @param {string} [options.className] - 额外 CSS 类名
   * @returns {HTMLElement} overlay 元素
   */
  function show({ title, body, buttons = [], onClose, className = '' }) {
    const overlay = Utils.createElement('div', { className: 'modal-overlay' });

    const dialog = Utils.createElement('div', {
      className: `modal-dialog ${className}`.trim(),
    });

    // Header
    const header = Utils.createElement('div', { className: 'modal-header' }, [
      Utils.createElement('span', { className: 'modal-title', textContent: title }),
      Utils.createElement('button', {
        className: 'modal-close',
        textContent: '×',
        onClick: () => close(overlay, onClose),
      }),
    ]);

    // Body
    const bodyEl = Utils.createElement('div', { className: 'modal-body' });
    if (typeof body === 'string') {
      bodyEl.textContent = body;
    } else if (body instanceof HTMLElement) {
      bodyEl.appendChild(body);
    }

    dialog.appendChild(header);
    dialog.appendChild(bodyEl);

    // Footer (if buttons)
    if (buttons.length > 0) {
      const footer = Utils.createElement('div', { className: 'modal-footer' });
      for (const btn of buttons) {
        footer.appendChild(Utils.createElement('button', {
          className: `btn ${btn.className || 'btn-secondary'}`,
          textContent: btn.text,
          onClick: () => {
            if (btn.onClick) btn.onClick(overlay);
          },
        }));
      }
      dialog.appendChild(footer);
    }

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        close(overlay, onClose);
      }
    });

    overlay.appendChild(dialog);
    container().appendChild(overlay);
    return overlay;
  }

  /**
   * 关闭模态对话框
   */
  function close(overlay, onClose) {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    if (onClose) onClose();
  }

  /**
   * 确认对话框
   * @param {string} title
   * @param {string} message
   * @returns {Promise<boolean>}
   */
  function confirm(title, message) {
    return new Promise((resolve) => {
      show({
        title,
        body: message,
        buttons: [
          {
            text: '取消',
            className: 'btn-secondary',
            onClick: (overlay) => {
              close(overlay);
              resolve(false);
            },
          },
          {
            text: '确认',
            className: 'btn-primary',
            onClick: (overlay) => {
              close(overlay);
              resolve(true);
            },
          },
        ],
        onClose: () => resolve(false),
      });
    });
  }

  /**
   * 进度对话框
   * @param {string} title
   * @returns {Object} { update(percent, text), close() }
   */
  function progress(title) {
    const bodyEl = Utils.createElement('div', {});

    const progressText = Utils.createElement('div', {
      className: 'progress-text',
      textContent: '准备中...',
    });

    const barContainer = Utils.createElement('div', { className: 'progress-bar-container' });
    const barFill = Utils.createElement('div', {
      className: 'progress-bar-fill',
      style: { width: '0%' },
    });
    barContainer.appendChild(barFill);

    bodyEl.appendChild(progressText);
    bodyEl.appendChild(barContainer);

    const overlay = show({
      title,
      body: bodyEl,
      buttons: [],
    });

    // 阻止点击遮罩关闭
    overlay.onclick = null;

    return {
      update(percent, text) {
        barFill.style.width = percent + '%';
        if (text) progressText.textContent = text;
        else progressText.textContent = Math.round(percent) + '%';
      },
      close() {
        close(overlay);
      },
    };
  }

  /**
   * 输入对话框
   * @param {string} title
   * @param {string} label
   * @param {string} [defaultValue]
   * @returns {Promise<string|null>}
   */
  function prompt(title, label, defaultValue = '') {
    return new Promise((resolve) => {
      const bodyEl = Utils.createElement('div', { className: 'form-group' });
      bodyEl.appendChild(Utils.createElement('label', {
        className: 'form-label',
        textContent: label,
      }));
      const input = Utils.createElement('input', {
        className: 'form-input',
        type: 'text',
        value: defaultValue,
      });
      bodyEl.appendChild(input);

      const overlay = show({
        title,
        body: bodyEl,
        buttons: [
          {
            text: '取消',
            className: 'btn-secondary',
            onClick: (ov) => { close(ov); resolve(null); },
          },
          {
            text: '确认',
            className: 'btn-primary',
            onClick: (ov) => { close(ov); resolve(input.value); },
          },
        ],
        onClose: () => resolve(null),
      });

      // 自动聚焦
      setTimeout(() => input.focus(), 100);

      // 回车确认
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          close(overlay);
          resolve(input.value);
        }
      });
    });
  }

  return { show, close, confirm, progress, prompt };
})();
