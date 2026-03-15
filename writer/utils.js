/* ===== 工具函数 ===== */

const Utils = {
  /** 生成 UUID */
  generateId() {
    return crypto.randomUUID();
  },

  /** 当前时间戳(毫秒) */
  now() {
    return Date.now();
  },

  /** 格式化时间戳为可读字符串 */
  formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  },

  /** 截断文本 */
  truncate(text, maxLen = 50) {
    if (!text || text.length <= maxLen) return text || '';
    return text.slice(0, maxLen) + '...';
  },

  /** 创建 DOM 元素 */
  createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs)) {
      if (key === 'className') {
        el.className = val;
      } else if (key === 'textContent') {
        el.textContent = val;
      } else if (key === 'innerHTML') {
        // 安全: 仅用于已知安全的静态 HTML
        el.innerHTML = val;
      } else if (key === 'style' && typeof val === 'object') {
        Object.assign(el.style, val);
      } else if (key.startsWith('on') && typeof val === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (key === 'dataset' && typeof val === 'object') {
        for (const [dk, dv] of Object.entries(val)) {
          el.dataset[dk] = dv;
        }
      } else {
        el.setAttribute(key, val);
      }
    }
    for (const child of children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    }
    return el;
  },

  /** 深拷贝 (JSON 安全的数据) */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  /** 防抖 */
  debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  /** 节流 */
  throttle(fn, interval = 200) {
    let last = 0;
    return function (...args) {
      const now = Date.now();
      if (now - last >= interval) {
        last = now;
        return fn.apply(this, args);
      }
    };
  },

  /** 复制文本到剪贴板 */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 回退方案
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        return true;
      } catch {
        return false;
      } finally {
        document.body.removeChild(ta);
      }
    }
  },

  /** 显示 Toast 通知 */
  showToast(message, type = 'success', duration = 3000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /** 安全地设置元素文本内容（防 XSS） */
  setText(el, text) {
    el.textContent = text;
  },
};
