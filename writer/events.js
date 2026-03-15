/* ===== 事件总线 ===== */

const EventBus = (() => {
  const listeners = {};

  return {
    /**
     * 监听事件
     * @param {string} event 事件名
     * @param {Function} handler 处理函数
     */
    on(event, handler) {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(handler);
    },

    /**
     * 移除监听
     * @param {string} event 事件名
     * @param {Function} handler 处理函数
     */
    off(event, handler) {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(h => h !== handler);
    },

    /**
     * 触发事件
     * @param {string} event 事件名
     * @param {*} data 事件数据
     */
    emit(event, data) {
      if (!listeners[event]) return;
      for (const handler of listeners[event]) {
        try {
          handler(data);
        } catch (err) {
          console.error(`EventBus error in handler for "${event}":`, err);
        }
      }
    },

    /** 移除某事件的所有监听 */
    offAll(event) {
      if (event) {
        delete listeners[event];
      } else {
        for (const key of Object.keys(listeners)) {
          delete listeners[key];
        }
      }
    },

    /** 获取某事件的监听器数量（用于测试） */
    listenerCount(event) {
      return (listeners[event] || []).length;
    },
  };
})();

/* 事件名称常量 */
const Events = Object.freeze({
  // 类目事件
  CATEGORY_SELECTED:     'category:selected',
  CATEGORY_UPDATED:      'category:updated',
  CATEGORY_DELETED:      'category:deleted',
  CATEGORY_TREE_CHANGED: 'category:treeChanged',

  // 编辑器事件
  CHAPTER_CHANGED:       'chapter:changed',
  CHAPTER_SAVED:         'chapter:saved',
  PARAGRAPH_SELECTED:    'paragraph:selected',
  PARAGRAPH_ADDED:       'paragraph:added',
  PARAGRAPH_UPDATED:     'paragraph:updated',
  PARAGRAPH_DELETED:     'paragraph:deleted',

  // AI 事件
  AI_TASK_STARTED:       'ai:taskStarted',
  AI_TASK_PROGRESS:      'ai:taskProgress',
  AI_TASK_COMPLETED:     'ai:taskCompleted',
  AI_TASK_FAILED:        'ai:taskFailed',

  // 状态面板
  STATUS_UPDATED:        'status:updated',

  // 文件操作
  DATA_IMPORTED:         'data:imported',
  DATA_EXPORTED:         'data:exported',

  // 绑定事件
  BINDING_ADD_REQUEST:   'binding:addRequest',
  BINDING_ADDED:         'binding:added',
  BINDING_REMOVED:       'binding:removed',

  // 通用
  STORE_CHANGED:         'store:changed',
});
