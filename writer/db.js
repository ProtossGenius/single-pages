/* ===== IndexedDB 数据库层 ===== */

const DB = (() => {
  const DB_NAME = 'WriterDB';
  const DB_VERSION = 2;
  let db = null;

  const STORES = {
    CATEGORIES:         'categories',
    CHAPTERS:           'chapters',
    PARAGRAPHS:         'paragraphs',
    PARAGRAPH_BINDINGS: 'paragraph_bindings',
    AI_PROVIDERS:       'ai_providers',
    AI_MODELS:          'ai_models',
    ROLE_CONFIGS:       'role_configs',
    FLOW_CONFIGS:       'flow_configs',
    RECAP_DATA:         'recap_data',
    APP_SETTINGS:       'app_settings',
    BOOKS:              'books',
    AI_LOGS:            'ai_logs',
  };

  const ALL_STORE_NAMES = Object.values(STORES);

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        const oldVersion = event.oldVersion;

        // === V1 stores (created from scratch or already exist) ===

        // categories
        if (!database.objectStoreNames.contains(STORES.CATEGORIES)) {
          const store = database.createObjectStore(STORES.CATEGORIES, { keyPath: 'id' });
          store.createIndex('idx_parentId', 'parentId', { unique: false });
          store.createIndex('idx_type', 'type', { unique: false });
          store.createIndex('idx_updatedAt', 'updatedAt', { unique: false });
          store.createIndex('idx_bookId', 'bookId', { unique: false });
        }

        // chapters
        if (!database.objectStoreNames.contains(STORES.CHAPTERS)) {
          const store = database.createObjectStore(STORES.CHAPTERS, { keyPath: 'id', autoIncrement: true });
          store.createIndex('idx_status', 'status', { unique: false });
          store.createIndex('idx_sortOrder', 'sortOrder', { unique: false });
          store.createIndex('idx_bookId', 'bookId', { unique: false });
        }

        // paragraphs
        if (!database.objectStoreNames.contains(STORES.PARAGRAPHS)) {
          const store = database.createObjectStore(STORES.PARAGRAPHS, { keyPath: 'id' });
          store.createIndex('idx_chapterId', 'chapterId', { unique: false });
          store.createIndex('idx_sortOrder', ['chapterId', 'sortOrder'], { unique: false });
        }

        // paragraph_bindings
        if (!database.objectStoreNames.contains(STORES.PARAGRAPH_BINDINGS)) {
          const store = database.createObjectStore(STORES.PARAGRAPH_BINDINGS, { keyPath: 'id' });
          store.createIndex('idx_paragraphId', 'paragraphId', { unique: false });
          store.createIndex('idx_categoryId', 'categoryId', { unique: false });
        }

        // ai_providers
        if (!database.objectStoreNames.contains(STORES.AI_PROVIDERS)) {
          database.createObjectStore(STORES.AI_PROVIDERS, { keyPath: 'id' });
        }

        // ai_models
        if (!database.objectStoreNames.contains(STORES.AI_MODELS)) {
          const store = database.createObjectStore(STORES.AI_MODELS, { keyPath: 'id' });
          store.createIndex('idx_providerId', 'providerId', { unique: false });
        }

        // role_configs — V2: keyPath is 'id' (UUID), not 'role'
        if (oldVersion < 2 && database.objectStoreNames.contains(STORES.ROLE_CONFIGS)) {
          // V1→V2 migration: delete old store and recreate with new keyPath
          database.deleteObjectStore(STORES.ROLE_CONFIGS);
        }
        if (!database.objectStoreNames.contains(STORES.ROLE_CONFIGS)) {
          database.createObjectStore(STORES.ROLE_CONFIGS, { keyPath: 'id' });
        }

        // flow_configs
        if (!database.objectStoreNames.contains(STORES.FLOW_CONFIGS)) {
          database.createObjectStore(STORES.FLOW_CONFIGS, { keyPath: 'id' });
        }

        // recap_data
        if (!database.objectStoreNames.contains(STORES.RECAP_DATA)) {
          const store = database.createObjectStore(STORES.RECAP_DATA, { keyPath: 'id' });
          store.createIndex('idx_chapterId', 'chapterId', { unique: false });
        }

        // app_settings
        if (!database.objectStoreNames.contains(STORES.APP_SETTINGS)) {
          database.createObjectStore(STORES.APP_SETTINGS, { keyPath: 'key' });
        }

        // === V2 new stores ===

        // books
        if (!database.objectStoreNames.contains(STORES.BOOKS)) {
          database.createObjectStore(STORES.BOOKS, { keyPath: 'id' });
        }

        // ai_logs
        if (!database.objectStoreNames.contains(STORES.AI_LOGS)) {
          const store = database.createObjectStore(STORES.AI_LOGS, { keyPath: 'id' });
          store.createIndex('idx_createdAt', 'createdAt', { unique: false });
          store.createIndex('idx_status', 'status', { unique: false });
        }

        // === V1→V2 migration: add indexes to existing stores ===
        if (oldVersion >= 1 && oldVersion < 2) {
          const tx = event.target.transaction;
          // Add idx_bookId to categories if missing
          const catStore = tx.objectStore(STORES.CATEGORIES);
          if (!catStore.indexNames.contains('idx_bookId')) {
            catStore.createIndex('idx_bookId', 'bookId', { unique: false });
          }
          // Add idx_bookId to chapters if missing
          const chapStore = tx.objectStore(STORES.CHAPTERS);
          if (!chapStore.indexNames.contains('idx_bookId')) {
            chapStore.createIndex('idx_bookId', 'bookId', { unique: false });
          }
        }
      };

      request.onsuccess = (event) => {
        db = event.target.result;
        resolve(db);
      };

      request.onerror = (event) => {
        reject(new Error('IndexedDB open failed: ' + event.target.error));
      };
    });
  }

  function getStore(storeName, mode = 'readonly') {
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return {
    STORES,
    ALL_STORE_NAMES,

    /** 初始化数据库连接 */
    async init() {
      if (!db) {
        await openDB();
      }
      return db;
    },

    /** 获取原始数据库引用（供事务使用） */
    getDB() {
      return db;
    },

    /** 关闭数据库 */
    close() {
      if (db) {
        db.close();
        db = null;
      }
    },

    /** 按主键获取 */
    async getById(storeName, id) {
      const store = getStore(storeName);
      return requestToPromise(store.get(id));
    },

    /** 获取全部记录 */
    async getAll(storeName) {
      const store = getStore(storeName);
      return requestToPromise(store.getAll());
    },

    /** 按索引查询 */
    async getByIndex(storeName, indexName, value) {
      const store = getStore(storeName);
      const index = store.index(indexName);
      return requestToPromise(index.getAll(value));
    },

    /** 新增或更新 */
    async put(storeName, data) {
      const store = getStore(storeName, 'readwrite');
      return requestToPromise(store.put(data));
    },

    /** 批量新增或更新 */
    async putAll(storeName, dataArray) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        for (const item of dataArray) {
          store.put(item);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    /** 删除记录 */
    async delete(storeName, id) {
      const store = getStore(storeName, 'readwrite');
      return requestToPromise(store.delete(id));
    },

    /** 清空表 */
    async clear(storeName) {
      const store = getStore(storeName, 'readwrite');
      return requestToPromise(store.clear());
    },

    /** 清空所有表 */
    async clearAll() {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(ALL_STORE_NAMES, 'readwrite');
        for (const name of ALL_STORE_NAMES) {
          tx.objectStore(name).clear();
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    /** 获取表中记录数量 */
    async count(storeName) {
      const store = getStore(storeName);
      return requestToPromise(store.count());
    },

    /** 手动事务 */
    async transaction(storeNames, mode, callback) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeNames, mode);
        const stores = {};
        for (const name of (Array.isArray(storeNames) ? storeNames : [storeNames])) {
          stores[name] = tx.objectStore(name);
        }
        try {
          callback(stores, tx);
        } catch (err) {
          reject(err);
          return;
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    /** 删除整个数据库（用于测试） */
    async deleteDatabase() {
      if (db) {
        db.close();
        db = null;
      }
      return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
  };
})();
