/* ===== 轻量测试框架 ===== */

const TestRunner = (() => {
  const groups = [];
  let currentGroup = null;

  function describe(name, fn) {
    currentGroup = { name, tests: [] };
    groups.push(currentGroup);
    fn();
    currentGroup = null;
  }

  function it(name, fn) {
    if (!currentGroup) throw new Error('it() must be inside describe()');
    currentGroup.tests.push({ name, fn });
  }

  function assert(condition, message = 'Assertion failed') {
    if (!condition) throw new Error(message);
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(
        (message ? message + ': ' : '') +
        `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
  }

  function assertDeepEqual(actual, expected, message) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) {
      throw new Error(
        (message ? message + ': ' : '') +
        `expected ${b}, got ${a}`
      );
    }
  }

  function assertThrows(fn, message = 'Expected function to throw') {
    try {
      fn();
      throw new Error(message);
    } catch (e) {
      if (e.message === message) throw e;
    }
  }

  function assertNotNull(value, message = 'Expected non-null value') {
    if (value === null || value === undefined) throw new Error(message);
  }

  function assertNull(value, message) {
    if (value !== null && value !== undefined) {
      throw new Error((message || 'Expected null') + `: got ${JSON.stringify(value)}`);
    }
  }

  function assertArrayLength(arr, len, message) {
    if (!Array.isArray(arr)) throw new Error((message || '') + ': not an array');
    if (arr.length !== len) {
      throw new Error(
        (message ? message + ': ' : '') +
        `expected length ${len}, got ${arr.length}`
      );
    }
  }

  async function run() {
    const logEl = document.getElementById('test-log');
    const summaryEl = document.getElementById('test-summary');
    logEl.innerHTML = '';

    let totalPass = 0;
    let totalFail = 0;

    for (const group of groups) {
      const groupEl = document.createElement('div');
      groupEl.className = 'test-group';

      const titleEl = document.createElement('div');
      titleEl.className = 'test-group-title';
      titleEl.textContent = group.name;
      groupEl.appendChild(titleEl);

      for (const test of group.tests) {
        const itemEl = document.createElement('div');
        try {
          await test.fn();
          itemEl.className = 'test-item pass';
          itemEl.innerHTML = `<span class="test-icon">✓</span><span class="test-name">${escapeHtml(test.name)}</span>`;
          totalPass++;
        } catch (err) {
          itemEl.className = 'test-item fail';
          itemEl.innerHTML = `<span class="test-icon">✗</span><span class="test-name">${escapeHtml(test.name)}</span>`;
          const errEl = document.createElement('div');
          errEl.className = 'test-error';
          errEl.textContent = err.message || String(err);
          groupEl.appendChild(itemEl);
          groupEl.appendChild(errEl);
          totalFail++;
          continue;
        }
        groupEl.appendChild(itemEl);
      }
      logEl.appendChild(groupEl);
    }

    const total = totalPass + totalFail;
    if (totalFail === 0) {
      summaryEl.className = 'test-summary all-pass';
      summaryEl.textContent = `全部通过 ✓ ${totalPass}/${total} 个测试`;
    } else {
      summaryEl.className = 'test-summary has-fail';
      summaryEl.textContent = `有失败 ✗ ${totalFail} 个失败, ${totalPass} 个通过, 共 ${total} 个测试`;
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return { describe, it, assert, assertEqual, assertDeepEqual, assertThrows, assertNotNull, assertNull, assertArrayLength, run };
})();

const { describe, it, assert, assertEqual, assertDeepEqual, assertThrows, assertNotNull, assertNull, assertArrayLength } = TestRunner;

/* ================================================================
   P1 测试用例
   ================================================================ */

// ---- Enums 测试 ----
describe('Enums', () => {
  it('RoleEnum 包含所有预定义角色', () => {
    assertEqual(RoleList.length, 4);
    assertNotNull(getRoleByValue('writer'));
    assertNotNull(getRoleByValue('reviewer'));
    assertNotNull(getRoleByValue('summarizer'));
    assertNotNull(getRoleByValue('recap_writer'));
  });

  it('getRoleByValue 返回正确的角色', () => {
    const writer = getRoleByValue('writer');
    assertEqual(writer.label, '写手');
    assertEqual(writer.value, 'writer');
  });

  it('getRoleByValue 对不存在的值返回 null', () => {
    assertNull(getRoleByValue('nonexistent'));
  });

  it('VariableEnum 包含所有变量', () => {
    assertEqual(VariableList.length, 11);
  });

  it('InputVariables 和 OutputVariables 筛选正确', () => {
    assert(InputVariables.length > 0, 'InputVariables 不应为空');
    assert(OutputVariables.length > 0, 'OutputVariables 不应为空');
    assert(InputVariables.every(v => v.isInput), '所有 InputVariables 的 isInput 应为 true');
    assert(OutputVariables.every(v => v.isOutput), '所有 OutputVariables 的 isOutput 应为 true');
  });

  it('阻塞变量标记正确', () => {
    const genParagraph = getVariableByValue('generated_paragraph');
    assertEqual(genParagraph.blocking, true, '生成段落应为阻塞');
    const aiReview = getVariableByValue('ai_review');
    assertEqual(aiReview.blocking, false, 'AI评审意见应为非阻塞');
  });

  it('TriggerEnum 包含所有触发方式', () => {
    assertEqual(TriggerList.length, 3);
    assertNotNull(getTriggerByValue('generate_paragraph'));
    assertNotNull(getTriggerByValue('generate_chapter'));
    assertNotNull(getTriggerByValue('setting_changed'));
  });

  it('CategoryTypeEnum 包含所有类型', () => {
    assertEqual(CategoryTypeList.length, 6);
    assertNotNull(getCategoryTypeByValue('character'));
    assertNotNull(getCategoryTypeByValue('location'));
    assertNotNull(getCategoryTypeByValue('custom'));
  });
});

// ---- Utils 测试 ----
describe('Utils', () => {
  it('generateId 生成有效 UUID', () => {
    const id = Utils.generateId();
    assertNotNull(id);
    assert(typeof id === 'string', 'UUID 应为字符串');
    assert(id.length > 0, 'UUID 不应为空');
    // UUID 格式验证
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id),
      'UUID 格式不正确: ' + id);
  });

  it('generateId 每次生成不同的 UUID', () => {
    const id1 = Utils.generateId();
    const id2 = Utils.generateId();
    assert(id1 !== id2, '两次生成的 UUID 不应相同');
  });

  it('now 返回时间戳', () => {
    const ts = Utils.now();
    assert(typeof ts === 'number', '应为数字');
    assert(ts > 0, '应大于0');
  });

  it('formatTime 格式化时间戳', () => {
    const ts = new Date(2026, 2, 15, 10, 30, 45).getTime();
    const formatted = Utils.formatTime(ts);
    assertEqual(formatted, '2026-03-15 10:30:45');
  });

  it('formatTime 处理空值', () => {
    assertEqual(Utils.formatTime(null), '');
    assertEqual(Utils.formatTime(undefined), '');
  });

  it('truncate 截断长文本', () => {
    const long = '这是一段很长的文本，需要被截断以适应显示空间';
    const result = Utils.truncate(long, 10);
    assert(result.endsWith('...'), '应以...结尾');
    assertEqual(result.length, 13); // 10 chars + '...'
  });

  it('truncate 不截断短文本', () => {
    assertEqual(Utils.truncate('短文本', 10), '短文本');
  });

  it('truncate 处理空值', () => {
    assertEqual(Utils.truncate(null), '');
    assertEqual(Utils.truncate(''), '');
  });

  it('createElement 创建基本元素', () => {
    const el = Utils.createElement('div', { className: 'test', textContent: 'hello' });
    assertEqual(el.tagName, 'DIV');
    assertEqual(el.className, 'test');
    assertEqual(el.textContent, 'hello');
  });

  it('createElement 处理 dataset', () => {
    const el = Utils.createElement('div', { dataset: { id: '123', name: 'test' } });
    assertEqual(el.dataset.id, '123');
    assertEqual(el.dataset.name, 'test');
  });

  it('createElement 支持子元素', () => {
    const el = Utils.createElement('div', {}, [
      Utils.createElement('span', { textContent: 'child1' }),
      'text node',
    ]);
    assertEqual(el.children.length, 1);
    assertEqual(el.childNodes.length, 2);
  });

  it('deepClone 深拷贝对象', () => {
    const obj = { a: 1, b: { c: [1, 2, 3] } };
    const clone = Utils.deepClone(obj);
    assertDeepEqual(clone, obj);
    clone.b.c.push(4);
    assertEqual(obj.b.c.length, 3, '修改副本不应影响原对象');
  });

  it('debounce 延迟执行', async () => {
    let count = 0;
    const fn = Utils.debounce(() => count++, 50);
    fn(); fn(); fn();
    assertEqual(count, 0, '应延迟执行');
    await new Promise(r => setTimeout(r, 100));
    assertEqual(count, 1, '只应执行一次');
  });

  it('throttle 节流执行', async () => {
    let count = 0;
    const fn = Utils.throttle(() => count++, 50);
    fn(); fn(); fn();
    assertEqual(count, 1, '短时间内只应执行一次');
    await new Promise(r => setTimeout(r, 60));
    fn();
    assertEqual(count, 2, '间隔后应再次执行');
  });
});

// ---- EventBus 测试 ----
describe('EventBus', () => {
  it('on + emit 触发事件', () => {
    let received = null;
    const handler = (data) => { received = data; };
    EventBus.on('test:event1', handler);
    EventBus.emit('test:event1', { hello: 'world' });
    assertDeepEqual(received, { hello: 'world' });
    EventBus.off('test:event1', handler);
  });

  it('off 移除监听', () => {
    let count = 0;
    const handler = () => count++;
    EventBus.on('test:event2', handler);
    EventBus.emit('test:event2');
    assertEqual(count, 1);
    EventBus.off('test:event2', handler);
    EventBus.emit('test:event2');
    assertEqual(count, 1, '移除后不应再触发');
  });

  it('多个监听器都应被触发', () => {
    let a = 0, b = 0;
    const h1 = () => a++;
    const h2 = () => b++;
    EventBus.on('test:event3', h1);
    EventBus.on('test:event3', h2);
    EventBus.emit('test:event3');
    assertEqual(a, 1);
    assertEqual(b, 1);
    EventBus.off('test:event3', h1);
    EventBus.off('test:event3', h2);
  });

  it('offAll 移除所有监听', () => {
    let count = 0;
    EventBus.on('test:event4', () => count++);
    EventBus.on('test:event4', () => count++);
    EventBus.offAll('test:event4');
    EventBus.emit('test:event4');
    assertEqual(count, 0, '所有监听应被移除');
  });

  it('listenerCount 返回正确数量', () => {
    const h = () => {};
    EventBus.on('test:event5', h);
    EventBus.on('test:event5', () => {});
    assertEqual(EventBus.listenerCount('test:event5'), 2);
    EventBus.offAll('test:event5');
    assertEqual(EventBus.listenerCount('test:event5'), 0);
  });

  it('handler 抛出异常不应影响其他 handler', () => {
    let reached = false;
    EventBus.on('test:event6', () => { throw new Error('oops'); });
    EventBus.on('test:event6', () => { reached = true; });
    EventBus.emit('test:event6');
    assert(reached, '第二个 handler 应正常执行');
    EventBus.offAll('test:event6');
  });

  it('emit 不存在的事件不报错', () => {
    EventBus.emit('test:nonexistent', { data: 1 });
    // 不应抛出异常
    assert(true);
  });
});

// ---- DB 测试 ----
describe('DB (IndexedDB)', () => {
  it('初始化数据库', async () => {
    // 先删除已有数据库避免冲突
    await DB.deleteDatabase();
    await DB.init();
    assertNotNull(DB.getDB(), '数据库应已打开');
  });

  it('categories CRUD', async () => {
    const id = Utils.generateId();
    const now = Utils.now();
    const cat = {
      id,
      parentId: null,
      type: 'character',
      name: '测试人物',
      description: '描述',
      attributes: '{}',
      sortOrder: 1,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    // 新增
    await DB.put(DB.STORES.CATEGORIES, cat);
    const loaded = await DB.getById(DB.STORES.CATEGORIES, id);
    assertEqual(loaded.name, '测试人物');
    assertEqual(loaded.type, 'character');

    // 更新
    loaded.name = '修改后人物';
    loaded.version = 2;
    await DB.put(DB.STORES.CATEGORIES, loaded);
    const updated = await DB.getById(DB.STORES.CATEGORIES, id);
    assertEqual(updated.name, '修改后人物');
    assertEqual(updated.version, 2);

    // 按索引查询
    const byType = await DB.getByIndex(DB.STORES.CATEGORIES, 'idx_type', 'character');
    assert(byType.length >= 1, '应至少有一条 character 记录');

    // 删除
    await DB.delete(DB.STORES.CATEGORIES, id);
    const deleted = await DB.getById(DB.STORES.CATEGORIES, id);
    assertNull(deleted, '删除后应为 undefined/null');
  });

  it('chapters 自增主键', async () => {
    const now = Utils.now();
    const id1 = await DB.put(DB.STORES.CHAPTERS, {
      title: '第一章',
      summary: '',
      content: '',
      recapText: '',
      reviewNotes: '',
      status: 'draft',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    });
    assert(typeof id1 === 'number' || id1 > 0, '应返回自增 ID');

    const chapter = await DB.getById(DB.STORES.CHAPTERS, id1);
    assertEqual(chapter.title, '第一章');

    // 清理
    await DB.delete(DB.STORES.CHAPTERS, id1);
  });

  it('paragraphs CRUD 和索引查询', async () => {
    // 先创建章节
    const now = Utils.now();
    const chapterId = await DB.put(DB.STORES.CHAPTERS, {
      title: '测试章',
      summary: '',
      content: '',
      recapText: '',
      reviewNotes: '',
      status: 'draft',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    });

    const pId1 = Utils.generateId();
    const pId2 = Utils.generateId();
    await DB.put(DB.STORES.PARAGRAPHS, {
      id: pId1, chapterId, content: '段落一', sortOrder: 1,
      recapBrief: '', followUp: '', createdAt: now, updatedAt: now,
    });
    await DB.put(DB.STORES.PARAGRAPHS, {
      id: pId2, chapterId, content: '段落二', sortOrder: 2,
      recapBrief: '', followUp: '', createdAt: now, updatedAt: now,
    });

    const ps = await DB.getByIndex(DB.STORES.PARAGRAPHS, 'idx_chapterId', chapterId);
    assertEqual(ps.length, 2, '应有两个段落');

    // 清理
    await DB.delete(DB.STORES.PARAGRAPHS, pId1);
    await DB.delete(DB.STORES.PARAGRAPHS, pId2);
    await DB.delete(DB.STORES.CHAPTERS, chapterId);
  });

  it('ai_providers CRUD', async () => {
    const id = Utils.generateId();
    await DB.put(DB.STORES.AI_PROVIDERS, {
      id, name: 'TestProvider', apiUrl: 'https://test.api.com',
      apiKey: 'sk-test', retryCount: 3, sortOrder: 1,
      createdAt: Utils.now(), updatedAt: Utils.now(),
    });
    const loaded = await DB.getById(DB.STORES.AI_PROVIDERS, id);
    assertEqual(loaded.name, 'TestProvider');
    await DB.delete(DB.STORES.AI_PROVIDERS, id);
  });

  it('ai_models CRUD 和索引', async () => {
    const providerId = Utils.generateId();
    const modelId = Utils.generateId();
    await DB.put(DB.STORES.AI_MODELS, {
      id: modelId, providerId, name: 'gpt-4', sortOrder: 1, createdAt: Utils.now(),
    });
    const byProvider = await DB.getByIndex(DB.STORES.AI_MODELS, 'idx_providerId', providerId);
    assertEqual(byProvider.length, 1);
    assertEqual(byProvider[0].name, 'gpt-4');
    await DB.delete(DB.STORES.AI_MODELS, modelId);
  });

  it('role_configs CRUD', async () => {
    await DB.put(DB.STORES.ROLE_CONFIGS, {
      role: 'writer',
      promptTemplate: '你是写手 {{用户输入}}',
      providerId: 'p1',
      modelId: 'm1',
      outputVar: 'generated_paragraph',
      createdAt: Utils.now(),
      updatedAt: Utils.now(),
    });
    const loaded = await DB.getById(DB.STORES.ROLE_CONFIGS, 'writer');
    assertEqual(loaded.promptTemplate, '你是写手 {{用户输入}}');
    await DB.delete(DB.STORES.ROLE_CONFIGS, 'writer');
  });

  it('flow_configs CRUD', async () => {
    const id = Utils.generateId();
    await DB.put(DB.STORES.FLOW_CONFIGS, {
      id, name: '生成段落流程', trigger: 'generate_paragraph',
      enabled: true, blocking: true,
      steps: JSON.stringify([['writer', 'reviewer'], ['summarizer']]),
      sortOrder: 1, createdAt: Utils.now(), updatedAt: Utils.now(),
    });
    const loaded = await DB.getById(DB.STORES.FLOW_CONFIGS, id);
    const steps = JSON.parse(loaded.steps);
    assertArrayLength(steps, 2, '应有两个步骤');
    assertArrayLength(steps[0], 2, '第一步应有两个角色');
    await DB.delete(DB.STORES.FLOW_CONFIGS, id);
  });

  it('app_settings CRUD', async () => {
    await DB.put(DB.STORES.APP_SETTINGS, {
      key: 'test_key',
      value: JSON.stringify({ hello: 'world' }),
    });
    const loaded = await DB.getById(DB.STORES.APP_SETTINGS, 'test_key');
    assertDeepEqual(JSON.parse(loaded.value), { hello: 'world' });
    await DB.delete(DB.STORES.APP_SETTINGS, 'test_key');
  });

  it('putAll 批量写入', async () => {
    const items = [
      { id: Utils.generateId(), parentId: null, type: 'character', name: '批量1', description: '', attributes: '{}', sortOrder: 1, version: 1, createdAt: Utils.now(), updatedAt: Utils.now() },
      { id: Utils.generateId(), parentId: null, type: 'character', name: '批量2', description: '', attributes: '{}', sortOrder: 2, version: 1, createdAt: Utils.now(), updatedAt: Utils.now() },
    ];
    await DB.putAll(DB.STORES.CATEGORIES, items);
    const all = await DB.getAll(DB.STORES.CATEGORIES);
    assert(all.length >= 2, '应至少有两条记录');
    // 清理
    for (const item of items) {
      await DB.delete(DB.STORES.CATEGORIES, item.id);
    }
  });

  it('clear 清空表', async () => {
    await DB.put(DB.STORES.APP_SETTINGS, { key: 'clear_test', value: '1' });
    await DB.clear(DB.STORES.APP_SETTINGS);
    const all = await DB.getAll(DB.STORES.APP_SETTINGS);
    assertEqual(all.length, 0, '清空后应无记录');
  });

  it('count 返回记录数', async () => {
    await DB.put(DB.STORES.APP_SETTINGS, { key: 'count_1', value: '1' });
    await DB.put(DB.STORES.APP_SETTINGS, { key: 'count_2', value: '2' });
    const c = await DB.count(DB.STORES.APP_SETTINGS);
    assertEqual(c, 2);
    await DB.clear(DB.STORES.APP_SETTINGS);
  });

  it('paragraph_bindings CRUD 和索引', async () => {
    const id = Utils.generateId();
    const paragraphId = Utils.generateId();
    const categoryId = Utils.generateId();
    await DB.put(DB.STORES.PARAGRAPH_BINDINGS, {
      id, paragraphId, categoryId,
      categoryVersion: 1, bindingType: 'character',
      createdAt: Utils.now(),
    });
    const byParagraph = await DB.getByIndex(DB.STORES.PARAGRAPH_BINDINGS, 'idx_paragraphId', paragraphId);
    assertEqual(byParagraph.length, 1);
    const byCategory = await DB.getByIndex(DB.STORES.PARAGRAPH_BINDINGS, 'idx_categoryId', categoryId);
    assertEqual(byCategory.length, 1);
    await DB.delete(DB.STORES.PARAGRAPH_BINDINGS, id);
  });

  it('recap_data CRUD', async () => {
    const id = Utils.generateId();
    await DB.put(DB.STORES.RECAP_DATA, {
      id, chapterId: null, recapText: '前情提要',
      coverRange: JSON.stringify([1, 10]),
      createdAt: Utils.now(), updatedAt: Utils.now(),
    });
    const loaded = await DB.getById(DB.STORES.RECAP_DATA, id);
    assertEqual(loaded.recapText, '前情提要');
    await DB.delete(DB.STORES.RECAP_DATA, id);
  });
});

// ---- Store 测试 ----
describe('Store', () => {
  it('init 不报错', async () => {
    // 清空设置
    await DB.clear(DB.STORES.APP_SETTINGS);
    await Store.init();
    assert(true);
  });

  it('set/get 状态', () => {
    Store.set('chapterOutline', '测试概述');
    assertEqual(Store.get('chapterOutline'), '测试概述');
  });

  it('set 触发 STORE_CHANGED 事件', () => {
    let received = null;
    const handler = (data) => { received = data; };
    EventBus.on(Events.STORE_CHANGED, handler);
    Store.set('chatTab', 'followUp');
    assertNotNull(received);
    assertEqual(received.key, 'chatTab');
    assertEqual(received.value, 'followUp');
    EventBus.off(Events.STORE_CHANGED, handler);
  });

  it('selectCategory 触发事件', () => {
    let received = null;
    const handler = (data) => { received = data; };
    EventBus.on(Events.CATEGORY_SELECTED, handler);
    Store.selectCategory('cat-123');
    assertEqual(received.id, 'cat-123');
    assertEqual(Store.get('selectedCategoryId'), 'cat-123');
    EventBus.off(Events.CATEGORY_SELECTED, handler);
  });

  it('selectParagraph 触发事件', () => {
    let received = null;
    const handler = (data) => { received = data; };
    EventBus.on(Events.PARAGRAPH_SELECTED, handler);
    Store.selectParagraph('p-456');
    assertEqual(received.id, 'p-456');
    EventBus.off(Events.PARAGRAPH_SELECTED, handler);
  });

  it('addBoundSetting / removeBoundSetting', () => {
    // 清空
    while (Store.get('boundSettings').length > 0) {
      Store.removeBoundSetting(Store.get('boundSettings')[0]);
    }

    let addReceived = null;
    const addHandler = (data) => { addReceived = data; };
    EventBus.on(Events.BINDING_ADDED, addHandler);

    Store.addBoundSetting('cat-1');
    Store.addBoundSetting('cat-2');
    Store.addBoundSetting('cat-1'); // 重复添加
    assertArrayLength(Store.get('boundSettings'), 2, '不应重复添加');
    assertEqual(addReceived.categoryId, 'cat-2');

    let removeReceived = null;
    const removeHandler = (data) => { removeReceived = data; };
    EventBus.on(Events.BINDING_REMOVED, removeHandler);

    Store.removeBoundSetting('cat-1');
    assertArrayLength(Store.get('boundSettings'), 1);
    assertEqual(removeReceived.categoryId, 'cat-1');

    EventBus.off(Events.BINDING_ADDED, addHandler);
    EventBus.off(Events.BINDING_REMOVED, removeHandler);

    // 清空
    Store.removeBoundSetting('cat-2');
  });

  it('setAIRunning', () => {
    Store.setAIRunning(true, true);
    assertEqual(Store.get('aiRunning'), true);
    assertEqual(Store.get('aiBlocking'), true);
    Store.setAIRunning(false);
    assertEqual(Store.get('aiRunning'), false);
  });

  it('updateStatusPanel 更新状态', () => {
    let received = null;
    const handler = (data) => { received = data; };
    EventBus.on(Events.STATUS_UPDATED, handler);

    Store.updateStatusPanel({
      chapterSummary: '概要数据',
      aiReviewNotes: '评审数据',
    });
    assertEqual(Store.get('chapterSummary'), '概要数据');
    assertEqual(Store.get('aiReviewNotes'), '评审数据');
    assertNotNull(received);

    EventBus.off(Events.STATUS_UPDATED, handler);
  });

  it('getSnapshot 返回深拷贝', () => {
    const snap = Store.getSnapshot();
    assertNotNull(snap);
    snap.chatTab = 'modified';
    assert(Store.get('chatTab') !== 'modified', '修改快照不应影响原状态');
  });
});

// ---- Modal 测试 ----
describe('Modal (ui-modal)', () => {
  it('show 创建模态框', () => {
    const overlay = Modal.show({
      title: '测试标题',
      body: '测试内容',
      buttons: [{ text: '关闭', className: 'btn-secondary' }],
    });
    assertNotNull(overlay);
    assert(document.querySelector('.modal-overlay') !== null, '应存在模态遮罩');
    assert(document.querySelector('.modal-title').textContent === '测试标题', '标题应正确');
    Modal.close(overlay);
    assert(document.querySelector('.modal-overlay') === null, '关闭后应不存在');
  });

  it('show 接受 DOM 元素作为 body', () => {
    const el = Utils.createElement('div', { textContent: 'DOM body' });
    const overlay = Modal.show({ title: 'DOM test', body: el });
    assert(document.querySelector('.modal-body').textContent === 'DOM body');
    Modal.close(overlay);
  });

  it('progress 创建进度对话框', () => {
    const prog = Modal.progress('导出中...');
    assertNotNull(prog);
    prog.update(50, '处理中...');
    const fill = document.querySelector('.progress-bar-fill');
    assertEqual(fill.style.width, '50%');
    prog.close();
  });
});

/* ================================================================
   P2 测试用例 — 类目管理器
   ================================================================ */

describe('Category CRUD (业务逻辑)', () => {
  it('创建顶级类目', async () => {
    // 清空
    await DB.clear(DB.STORES.CATEGORIES);

    const now = Utils.now();
    const cat = {
      id: Utils.generateId(),
      parentId: null,
      type: 'character',
      name: '人物',
      description: '所有人物',
      attributes: JSON.stringify({ 备注: '测试' }),
      sortOrder: 1,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await DB.put(DB.STORES.CATEGORIES, cat);
    const loaded = await DB.getById(DB.STORES.CATEGORIES, cat.id);
    assertEqual(loaded.name, '人物');
    assertEqual(loaded.parentId, null);
    assertEqual(loaded.version, 1);
  });

  it('创建子类目并验证层级', async () => {
    const allCats = await DB.getAll(DB.STORES.CATEGORIES);
    const parent = allCats.find(c => c.name === '人物');
    assertNotNull(parent, '应有人物类目');

    const childId = Utils.generateId();
    const now = Utils.now();
    await DB.put(DB.STORES.CATEGORIES, {
      id: childId,
      parentId: parent.id,
      type: parent.type,
      name: '主角',
      description: '',
      attributes: '{}',
      sortOrder: 1,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    const grandchildId = Utils.generateId();
    await DB.put(DB.STORES.CATEGORIES, {
      id: grandchildId,
      parentId: childId,
      type: parent.type,
      name: '张三',
      description: '主角',
      attributes: JSON.stringify({ 年龄: '18', 境界: '筑基期' }),
      sortOrder: 1,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    // 验证层级
    const children = await DB.getByIndex(DB.STORES.CATEGORIES, 'idx_parentId', parent.id);
    assertEqual(children.length, 1);
    assertEqual(children[0].name, '主角');

    const grandchildren = await DB.getByIndex(DB.STORES.CATEGORIES, 'idx_parentId', childId);
    assertEqual(grandchildren.length, 1);
    assertEqual(grandchildren[0].name, '张三');
  });

  it('编辑类目 — version 递增', async () => {
    const allCats = await DB.getAll(DB.STORES.CATEGORIES);
    const item = allCats.find(c => c.name === '张三');
    assertNotNull(item);

    const oldVersion = item.version;
    item.name = '张三丰';
    item.version += 1;
    item.updatedAt = Utils.now();
    await DB.put(DB.STORES.CATEGORIES, item);

    const updated = await DB.getById(DB.STORES.CATEGORIES, item.id);
    assertEqual(updated.name, '张三丰');
    assertEqual(updated.version, oldVersion + 1);
    assert(updated.updatedAt >= item.updatedAt, 'updatedAt 应更新');
  });

  it('级联删除子节点', async () => {
    // 获取顶级节点
    const allCats = await DB.getAll(DB.STORES.CATEGORIES);
    const parent = allCats.find(c => c.name === '人物');
    assertNotNull(parent);

    // 添加 paragraph_binding 用于测试级联删除
    const grandchild = allCats.find(c => c.name === '张三丰');
    const bindingId = Utils.generateId();
    await DB.put(DB.STORES.PARAGRAPH_BINDINGS, {
      id: bindingId,
      paragraphId: 'fake-para-id',
      categoryId: grandchild.id,
      categoryVersion: 1,
      bindingType: 'character',
      createdAt: Utils.now(),
    });

    // 递归收集所有子孙 ID
    async function collectIds(pid) {
      const children = await DB.getByIndex(DB.STORES.CATEGORIES, 'idx_parentId', pid);
      const ids = [];
      for (const c of children) {
        ids.push(c.id);
        const subIds = await collectIds(c.id);
        ids.push(...subIds);
      }
      return ids;
    }

    const descendantIds = await collectIds(parent.id);
    descendantIds.push(parent.id);
    assert(descendantIds.length === 3, '应有3个节点（人物 > 主角 > 张三丰）');

    // 执行删除
    for (const catId of descendantIds) {
      const bindings = await DB.getByIndex(DB.STORES.PARAGRAPH_BINDINGS, 'idx_categoryId', catId);
      for (const b of bindings) {
        await DB.delete(DB.STORES.PARAGRAPH_BINDINGS, b.id);
      }
      await DB.delete(DB.STORES.CATEGORIES, catId);
    }

    // 验证全部删除
    const remaining = await DB.getAll(DB.STORES.CATEGORIES);
    assertEqual(remaining.length, 0, '所有类目应被删除');

    // 验证 binding 也被删除
    const remainingBindings = await DB.getByIndex(
      DB.STORES.PARAGRAPH_BINDINGS, 'idx_categoryId', grandchild.id
    );
    assertEqual(remainingBindings.length, 0, '关联的 binding 应被删除');
  });

  it('属性解析 — 键值对格式', () => {
    // 测试属性的序列化和反序列化
    const attrs = { 年龄: '18', 境界: '筑基期', 性格: '坚韧不拔' };
    const json = JSON.stringify(attrs);
    const parsed = JSON.parse(json);
    assertDeepEqual(parsed, attrs);
  });

  it('多个顶级类目排序', async () => {
    await DB.clear(DB.STORES.CATEGORIES);
    const now = Utils.now();
    const types = ['character', 'location', 'sect', 'item'];
    const names = ['人物', '地点', '宗门', '物品'];

    for (let i = 0; i < types.length; i++) {
      await DB.put(DB.STORES.CATEGORIES, {
        id: Utils.generateId(),
        parentId: null,
        type: types[i],
        name: names[i],
        description: '',
        attributes: '{}',
        sortOrder: i + 1,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
    }

    const allCats = await DB.getAll(DB.STORES.CATEGORIES);
    assertEqual(allCats.length, 4, '应有4个顶级类目');
    allCats.sort((a, b) => a.sortOrder - b.sortOrder);
    assertEqual(allCats[0].name, '人物');
    assertEqual(allCats[3].name, '物品');

    // 清理
    await DB.clear(DB.STORES.CATEGORIES);
  });
});

/* ================================================================
   P3 测试用例 — 小说编写界面
   ================================================================ */

describe('Chapter CRUD', () => {
  it('创建新章节', async () => {
    await DB.clear(DB.STORES.CHAPTERS);
    await DB.clear(DB.STORES.APP_SETTINGS);

    const now = Utils.now();
    const id = await DB.put(DB.STORES.CHAPTERS, {
      title: '第一章 初入修仙界',
      summary: '',
      content: '',
      recapText: '',
      reviewNotes: '',
      status: ChapterStatus.DRAFT,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    });

    assert(id > 0, '应返回自增ID');
    const chapter = await DB.getById(DB.STORES.CHAPTERS, id);
    assertEqual(chapter.title, '第一章 初入修仙界');
    assertEqual(chapter.status, 'draft');
  });

  it('修改章节标题和状态', async () => {
    const chapters = await DB.getAll(DB.STORES.CHAPTERS);
    const chapter = chapters[0];
    chapter.title = '第一章 修仙传奇';
    chapter.status = ChapterStatus.COMPLETED;
    chapter.updatedAt = Utils.now();
    await DB.put(DB.STORES.CHAPTERS, chapter);

    const updated = await DB.getById(DB.STORES.CHAPTERS, chapter.id);
    assertEqual(updated.title, '第一章 修仙传奇');
    assertEqual(updated.status, 'completed');
  });
});

describe('Paragraph CRUD', () => {
  it('添加段落到章节', async () => {
    await DB.clear(DB.STORES.PARAGRAPHS);

    const chapters = await DB.getAll(DB.STORES.CHAPTERS);
    const chapterId = chapters[0].id;

    const now = Utils.now();
    const para1 = {
      id: Utils.generateId(),
      chapterId,
      content: '张三站在山门前，抬头望去，巍峨的山峰直插云霄。',
      sortOrder: 1,
      recapBrief: '',
      followUp: '',
      createdAt: now,
      updatedAt: now,
    };

    const para2 = {
      id: Utils.generateId(),
      chapterId,
      content: '一位白发老者从云雾中缓步走出，正是天剑宗掌门。',
      sortOrder: 2,
      recapBrief: '',
      followUp: '',
      createdAt: now,
      updatedAt: now,
    };

    await DB.put(DB.STORES.PARAGRAPHS, para1);
    await DB.put(DB.STORES.PARAGRAPHS, para2);

    const paras = await DB.getByIndex(DB.STORES.PARAGRAPHS, 'idx_chapterId', chapterId);
    assertEqual(paras.length, 2);
    paras.sort((a, b) => a.sortOrder - b.sortOrder);
    assertEqual(paras[0].content, '张三站在山门前，抬头望去，巍峨的山峰直插云霄。');
    assertEqual(paras[1].sortOrder, 2);
  });

  it('修改段落内容 — updatedAt 更新', async () => {
    const paras = await DB.getAll(DB.STORES.PARAGRAPHS);
    const para = paras[0];
    const oldTime = para.updatedAt;

    // 模拟等待 1ms
    await new Promise(r => setTimeout(r, 2));

    para.content = '张三站在天剑宗山门前，深吸一口气。';
    para.updatedAt = Utils.now();
    await DB.put(DB.STORES.PARAGRAPHS, para);

    const updated = await DB.getById(DB.STORES.PARAGRAPHS, para.id);
    assertEqual(updated.content, '张三站在天剑宗山门前，深吸一口气。');
    assert(updated.updatedAt > oldTime, 'updatedAt 应更新');
  });

  it('段落绑定类目信息', async () => {
    await DB.clear(DB.STORES.PARAGRAPH_BINDINGS);

    const paras = await DB.getAll(DB.STORES.PARAGRAPHS);
    const para = paras[0];

    // 创建类目
    const catId = Utils.generateId();
    await DB.put(DB.STORES.CATEGORIES, {
      id: catId, parentId: null, type: 'character', name: '张三',
      description: '', attributes: '{}', sortOrder: 1, version: 2,
      createdAt: Utils.now(), updatedAt: Utils.now(),
    });

    // 绑定
    const bindingId = Utils.generateId();
    await DB.put(DB.STORES.PARAGRAPH_BINDINGS, {
      id: bindingId,
      paragraphId: para.id,
      categoryId: catId,
      categoryVersion: 2,
      bindingType: 'character',
      createdAt: Utils.now(),
    });

    // 验证
    const bindings = await DB.getByIndex(DB.STORES.PARAGRAPH_BINDINGS, 'idx_paragraphId', para.id);
    assertEqual(bindings.length, 1);
    assertEqual(bindings[0].categoryVersion, 2);
    assertEqual(bindings[0].bindingType, 'character');

    // 清理
    await DB.delete(DB.STORES.PARAGRAPH_BINDINGS, bindingId);
    await DB.delete(DB.STORES.CATEGORIES, catId);
  });

  it('删除段落', async () => {
    const paras = await DB.getAll(DB.STORES.PARAGRAPHS);
    const paraToDelete = paras[1];
    await DB.delete(DB.STORES.PARAGRAPHS, paraToDelete.id);

    const remaining = await DB.getAll(DB.STORES.PARAGRAPHS);
    assertEqual(remaining.length, 1);
  });
});

describe('Store — 章节/段落状态管理', () => {
  it('setCurrentChapter 持久化当前章节', async () => {
    const chapters = await DB.getAll(DB.STORES.CHAPTERS);
    const chapterId = chapters[0].id;

    await Store.setCurrentChapter(chapterId);
    assertEqual(Store.get('currentChapterId'), chapterId);

    // 验证持久化
    const setting = await DB.getById(DB.STORES.APP_SETTINGS, 'current_chapter_id');
    assertNotNull(setting);
    assertEqual(JSON.parse(setting.value), chapterId);
  });

  it('selectParagraph 触发事件', () => {
    let received = null;
    const handler = (data) => { received = data; };
    EventBus.on(Events.PARAGRAPH_SELECTED, handler);
    Store.selectParagraph('test-para-id');
    assertEqual(received.id, 'test-para-id');
    EventBus.off(Events.PARAGRAPH_SELECTED, handler);
  });

  it('boundSettings 管理', () => {
    // 清空
    const current = Store.get('boundSettings');
    while (current.length > 0) Store.removeBoundSetting(current[0]);

    Store.addBoundSetting('cat-A');
    Store.addBoundSetting('cat-B');
    assertArrayLength(Store.get('boundSettings'), 2);

    Store.removeBoundSetting('cat-A');
    assertArrayLength(Store.get('boundSettings'), 1);
    assertEqual(Store.get('boundSettings')[0], 'cat-B');

    Store.removeBoundSetting('cat-B');
  });
});

// 清理 P3 测试数据
describe('P3 cleanup', () => {
  it('清理测试数据', async () => {
    await DB.clear(DB.STORES.CHAPTERS);
    await DB.clear(DB.STORES.PARAGRAPHS);
    await DB.clear(DB.STORES.PARAGRAPH_BINDINGS);
    await DB.clear(DB.STORES.CATEGORIES);
    await DB.clear(DB.STORES.APP_SETTINGS);
    assert(true);
  });
});

/* ================================================================
   P4 测试用例 — AI 配置系统
   ================================================================ */

describe('AI Provider CRUD', () => {
  it('创建供应商', async () => {
    await DB.clear(DB.STORES.AI_PROVIDERS);
    await DB.clear(DB.STORES.AI_MODELS);

    const id = Utils.generateId();
    const now = Utils.now();
    await DB.put(DB.STORES.AI_PROVIDERS, {
      id, name: 'OpenAI', apiUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test123', retryCount: 3, sortOrder: 1,
      createdAt: now, updatedAt: now,
    });

    const provider = await DB.getById(DB.STORES.AI_PROVIDERS, id);
    assertEqual(provider.name, 'OpenAI');
    assertEqual(provider.retryCount, 3);
  });

  it('更新供应商', async () => {
    const providers = await DB.getAll(DB.STORES.AI_PROVIDERS);
    const p = providers[0];
    p.name = 'OpenAI Updated';
    p.updatedAt = Utils.now();
    await DB.put(DB.STORES.AI_PROVIDERS, p);

    const updated = await DB.getById(DB.STORES.AI_PROVIDERS, p.id);
    assertEqual(updated.name, 'OpenAI Updated');
  });

  it('供应商添加模型', async () => {
    const providers = await DB.getAll(DB.STORES.AI_PROVIDERS);
    const pid = providers[0].id;

    for (const name of ['gpt-4', 'gpt-3.5-turbo']) {
      await DB.put(DB.STORES.AI_MODELS, {
        id: Utils.generateId(), providerId: pid, name,
        sortOrder: name === 'gpt-4' ? 1 : 2, createdAt: Utils.now(),
      });
    }

    const models = await DB.getByIndex(DB.STORES.AI_MODELS, 'idx_providerId', pid);
    assertEqual(models.length, 2);
    models.sort((a, b) => a.sortOrder - b.sortOrder);
    assertEqual(models[0].name, 'gpt-4');
    assertEqual(models[1].name, 'gpt-3.5-turbo');
  });

  it('删除模型', async () => {
    const models = await DB.getAll(DB.STORES.AI_MODELS);
    await DB.delete(DB.STORES.AI_MODELS, models[1].id);
    const remaining = await DB.getAll(DB.STORES.AI_MODELS);
    assertEqual(remaining.length, 1);
    assertEqual(remaining[0].name, 'gpt-4');
  });

  it('删除供应商级联删除模型', async () => {
    const providers = await DB.getAll(DB.STORES.AI_PROVIDERS);
    const pid = providers[0].id;

    // 先删除关联模型
    const models = await DB.getByIndex(DB.STORES.AI_MODELS, 'idx_providerId', pid);
    for (const m of models) await DB.delete(DB.STORES.AI_MODELS, m.id);
    await DB.delete(DB.STORES.AI_PROVIDERS, pid);

    const remainProviders = await DB.getAll(DB.STORES.AI_PROVIDERS);
    assertEqual(remainProviders.length, 0);
    const remainModels = await DB.getAll(DB.STORES.AI_MODELS);
    assertEqual(remainModels.length, 0);
  });
});

describe('Role Config CRUD', () => {
  it('保存职能配置', async () => {
    await DB.clear(DB.STORES.ROLE_CONFIGS);

    const now = Utils.now();
    await DB.put(DB.STORES.ROLE_CONFIGS, {
      role: 'writer',
      promptTemplate: '你是写手。\n前文：{{前文信息}}\n要求：{{用户输入}}',
      providerId: 'test-provider-id',
      modelId: 'test-model-id',
      outputVar: 'generated_paragraph',
      createdAt: now,
      updatedAt: now,
    });

    const config = await DB.getById(DB.STORES.ROLE_CONFIGS, 'writer');
    assertNotNull(config);
    assertEqual(config.role, 'writer');
    assert(config.promptTemplate.includes('{{前文信息}}'), '模板应包含变量占位');
    assertEqual(config.outputVar, 'generated_paragraph');
  });

  it('更新职能配置', async () => {
    const config = await DB.getById(DB.STORES.ROLE_CONFIGS, 'writer');
    config.promptTemplate = '改进的模板：{{用户输入}}';
    config.updatedAt = Utils.now();
    await DB.put(DB.STORES.ROLE_CONFIGS, config);

    const updated = await DB.getById(DB.STORES.ROLE_CONFIGS, 'writer');
    assert(updated.promptTemplate.includes('改进的模板'), '更新应生效');
  });

  it('所有职能枚举可作为 role_configs 主键', async () => {
    for (const role of RoleList) {
      const now = Utils.now();
      await DB.put(DB.STORES.ROLE_CONFIGS, {
        role: role.value,
        promptTemplate: `${role.label}的模板`,
        providerId: '', modelId: '', outputVar: '',
        createdAt: now, updatedAt: now,
      });
    }
    const all = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    assertEqual(all.length, RoleList.length);
  });
});

describe('Flow Config CRUD', () => {
  it('创建流程配置', async () => {
    await DB.clear(DB.STORES.FLOW_CONFIGS);

    const id = Utils.generateId();
    const now = Utils.now();
    const steps = [['writer', 'reviewer'], ['summarizer']];
    await DB.put(DB.STORES.FLOW_CONFIGS, {
      id, name: '生成段落流程',
      trigger: 'generate_paragraph', enabled: true, blocking: true,
      steps: JSON.stringify(steps), sortOrder: 1,
      createdAt: now, updatedAt: now,
    });

    const flow = await DB.getById(DB.STORES.FLOW_CONFIGS, id);
    assertEqual(flow.name, '生成段落流程');
    assertEqual(flow.trigger, 'generate_paragraph');

    const parsed = JSON.parse(flow.steps);
    assertEqual(parsed.length, 2);
    assertEqual(parsed[0].length, 2);
    assertEqual(parsed[0][0], 'writer');
    assertEqual(parsed[1][0], 'summarizer');
  });

  it('更新流程步骤', async () => {
    const flows = await DB.getAll(DB.STORES.FLOW_CONFIGS);
    const flow = flows[0];

    const newSteps = [['writer'], ['reviewer'], ['summarizer']];
    flow.steps = JSON.stringify(newSteps);
    flow.updatedAt = Utils.now();
    await DB.put(DB.STORES.FLOW_CONFIGS, flow);

    const updated = await DB.getById(DB.STORES.FLOW_CONFIGS, flow.id);
    const parsed = JSON.parse(updated.steps);
    assertEqual(parsed.length, 3);
  });

  it('触发方式枚举验证', () => {
    assertNotNull(getTriggerByValue('generate_paragraph'));
    assertNotNull(getTriggerByValue('generate_chapter'));
    assertNotNull(getTriggerByValue('setting_changed'));
    assertEqual(getTriggerByValue('nonexistent'), null);
  });

  it('输出变量阻塞标记验证', () => {
    const genPara = getVariableByValue('generated_paragraph');
    assert(genPara.blocking === true, 'generated_paragraph 应为阻塞');
    const review = getVariableByValue('ai_review');
    assert(review.blocking === false, 'ai_review 不应为阻塞');
  });
});

// 清理 P4 测试数据
describe('P4 cleanup', () => {
  it('清理测试数据', async () => {
    await DB.clear(DB.STORES.AI_PROVIDERS);
    await DB.clear(DB.STORES.AI_MODELS);
    await DB.clear(DB.STORES.ROLE_CONFIGS);
    await DB.clear(DB.STORES.FLOW_CONFIGS);
    assert(true);
  });
});

// ---- 运行测试 ----
TestRunner.run();
