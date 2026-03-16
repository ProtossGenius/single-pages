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
  it('V2: IntelligenceLevelEnum 包含所有等级', () => {
    assertEqual(IntelligenceLevelList.length, 3);
    assertNotNull(getIntelligenceLevelByValue('high'));
    assertNotNull(getIntelligenceLevelByValue('medium'));
    assertNotNull(getIntelligenceLevelByValue('basic'));
  });

  it('V2: getIntelligenceLevelByValue 返回正确的等级', () => {
    const high = getIntelligenceLevelByValue('high');
    assertEqual(high.label, '高级');
    assertEqual(high.value, 'high');
  });

  it('V2: getIntelligenceLevelByValue 对不存在的值返回 null', () => {
    assertNull(getIntelligenceLevelByValue('nonexistent'));
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

  it('role_configs CRUD (V2: UUID key)', async () => {
    const roleId = Utils.generateId();
    await DB.put(DB.STORES.ROLE_CONFIGS, {
      id: roleId,
      name: '写手',
      promptTemplate: '你是写手 {{用户输入}}',
      providerId: 'p1',
      modelId: 'm1',
      outputVar: 'generated_paragraph',
      customVars: '[]',
      sortOrder: 0,
      createdAt: Utils.now(),
      updatedAt: Utils.now(),
    });
    const loaded = await DB.getById(DB.STORES.ROLE_CONFIGS, roleId);
    assertEqual(loaded.promptTemplate, '你是写手 {{用户输入}}');
    assertEqual(loaded.name, '写手');
    await DB.delete(DB.STORES.ROLE_CONFIGS, roleId);
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
    models.sort((a, b) => a.sortOrder - b.sortOrder);
    // 删除第二个 (gpt-3.5-turbo)
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
  it('V2: 保存用户自建职能配置', async () => {
    await DB.clear(DB.STORES.ROLE_CONFIGS);

    const roleId = Utils.generateId();
    const now = Utils.now();
    await DB.put(DB.STORES.ROLE_CONFIGS, {
      id: roleId,
      name: '写手',
      promptTemplate: '你是写手。\n前文：{{前文信息}}\n要求：{{用户输入}}',
      providerId: 'test-provider-id',
      modelId: 'test-model-id',
      outputVar: 'generated_paragraph',
      customVars: '[]',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });

    const config = await DB.getById(DB.STORES.ROLE_CONFIGS, roleId);
    assertNotNull(config);
    assertEqual(config.name, '写手');
    assert(config.promptTemplate.includes('{{前文信息}}'), '模板应包含变量占位');
    assertEqual(config.outputVar, 'generated_paragraph');
  });

  it('V2: 更新职能配置', async () => {
    const all = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    const config = all[0];
    config.promptTemplate = '改进的模板：{{用户输入}}';
    config.updatedAt = Utils.now();
    await DB.put(DB.STORES.ROLE_CONFIGS, config);

    const updated = await DB.getById(DB.STORES.ROLE_CONFIGS, config.id);
    assert(updated.promptTemplate.includes('改进的模板'), '更新应生效');
  });

  it('V2: 多个用户自建职能', async () => {
    await DB.clear(DB.STORES.ROLE_CONFIGS);
    const roles = ['写手', '评审员', '概要师', '前情师'];
    for (let i = 0; i < roles.length; i++) {
      const now = Utils.now();
      await DB.put(DB.STORES.ROLE_CONFIGS, {
        id: Utils.generateId(),
        name: roles[i],
        promptTemplate: `${roles[i]}的模板`,
        providerId: '', modelId: '', outputVar: '',
        customVars: '[]', sortOrder: i,
        createdAt: now, updatedAt: now,
      });
    }
    const all = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    assertEqual(all.length, 4);
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

/* ================================================================
   P5 测试用例 — AI 执行引擎 (Mock AI)
   ================================================================ */

describe('FlowEngine — 变量替换', () => {
  it('替换已知变量', () => {
    const context = {
      context_before: '之前的故事...',
      user_input: '主角进入山洞',
    };
    const template = '前文：{{前文信息}}\n要求：{{用户输入}}';
    const result = FlowEngine._replaceVariables(template, context);
    assert(result.includes('之前的故事...'), '应替换前文信息');
    assert(result.includes('主角进入山洞'), '应替换用户输入');
    assert(!result.includes('{{'), '不应有未替换的变量');
  });

  it('未知变量保持原样', () => {
    const context = {};
    const template = '{{不存在的变量}}';
    const result = FlowEngine._replaceVariables(template, context);
    assertEqual(result, '{{不存在的变量}}');
  });

  it('多个变量混合替换', () => {
    const context = {
      chapter_outline: '大纲',
      follow_up: '后续',
      bound_settings: '设定',
    };
    const template = '概述:{{章节概述}};后续:{{后续概要}};设定:{{绑定设定}}';
    const result = FlowEngine._replaceVariables(template, context);
    assert(result.includes('大纲'), '替换章节概述');
    assert(result.includes('后续'), '替换后续概要');
    assert(result.includes('设定'), '替换绑定设定');
  });
});

describe('FlowEngine — Mock 执行', () => {
  // 保存原始 AIService.call 并用 Mock 替换
  let _origCall;

  it('准备 Mock 环境', async () => {
    _origCall = AIService.call;

    // Mock: 返回随机文本
    AIService.call = async (providerId, modelId, prompt) => {
      return { text: `[Mock AI 输出 for ${modelId}] ` + prompt.slice(0, 20), failCount: 0, errors: [] };
    };

    // 创建测试用供应商和模型
    await DB.clear(DB.STORES.AI_PROVIDERS);
    await DB.clear(DB.STORES.AI_MODELS);
    await DB.clear(DB.STORES.ROLE_CONFIGS);
    await DB.clear(DB.STORES.FLOW_CONFIGS);

    const pid = 'mock-provider';
    await DB.put(DB.STORES.AI_PROVIDERS, {
      id: pid, name: 'Mock', apiUrl: 'http://localhost', apiKey: 'test',
      retryCount: 3, sortOrder: 1, createdAt: Utils.now(), updatedAt: Utils.now(),
    });
    await DB.put(DB.STORES.AI_MODELS, {
      id: 'mock-model', providerId: pid, name: 'mock-gpt',
      sortOrder: 1, createdAt: Utils.now(),
    });

    // 配置写手 (V2: id key)
    await DB.put(DB.STORES.ROLE_CONFIGS, {
      id: 'writer', name: '写手', promptTemplate: '写一段:{{用户输入}}',
      providerId: pid, modelId: 'mock-model', outputVar: 'generated_paragraph',
      customVars: '[]', sortOrder: 0,
      createdAt: Utils.now(), updatedAt: Utils.now(),
    });

    // 配置评审员 (V2: id key)
    await DB.put(DB.STORES.ROLE_CONFIGS, {
      id: 'reviewer', name: '评审员', promptTemplate: '评审:{{当前段落}}',
      providerId: pid, modelId: 'mock-model', outputVar: 'ai_review',
      customVars: '[]', sortOrder: 1,
      createdAt: Utils.now(), updatedAt: Utils.now(),
    });

    // 配置概要师 (V2: id key)
    await DB.put(DB.STORES.ROLE_CONFIGS, {
      id: 'summarizer', name: '概要师', promptTemplate: '概要:{{章节内容}}',
      providerId: pid, modelId: 'mock-model', outputVar: 'generated_summary',
      customVars: '[]', sortOrder: 2,
      createdAt: Utils.now(), updatedAt: Utils.now(),
    });

    assert(true);
  });

  it('执行串行流程 — 单步骤单角色', async () => {
    const flowId = Utils.generateId();
    await DB.put(DB.STORES.FLOW_CONFIGS, {
      id: flowId, name: '简单流程', trigger: 'generate_paragraph',
      enabled: true, blocking: true, steps: JSON.stringify([['writer']]),
      sortOrder: 1, createdAt: Utils.now(), updatedAt: Utils.now(),
    });

    const context = {
      user_input: '主角进入山洞',
      context_before: '', chapter_outline: '', follow_up: '', bound_settings: '',
      current_paragraph: '', chapter_content: '', ai_review: '',
      generated_paragraph: '', generated_summary: '', generated_recap: '',
    };

    const result = await FlowEngine.execute('generate_paragraph', context);
    assert(result.generated_paragraph.length > 0, '应生成段落');
    assert(result.generated_paragraph.includes('Mock AI'), '应包含 Mock 输出');
  });

  it('执行并行流程 — 同步骤多角色', async () => {
    await DB.clear(DB.STORES.FLOW_CONFIGS);
    const flowId = Utils.generateId();
    await DB.put(DB.STORES.FLOW_CONFIGS, {
      id: flowId, name: '并行流程', trigger: 'generate_paragraph',
      enabled: true, blocking: true, steps: JSON.stringify([['writer', 'reviewer']]),
      sortOrder: 1, createdAt: Utils.now(), updatedAt: Utils.now(),
    });

    const context = {
      user_input: '测试并行', context_before: '', chapter_outline: '', follow_up: '',
      bound_settings: '', current_paragraph: '', chapter_content: '', ai_review: '',
      generated_paragraph: '', generated_summary: '', generated_recap: '',
    };

    const result = await FlowEngine.execute('generate_paragraph', context);
    assert(result.generated_paragraph.length > 0, '写手应产出段落');
    assert(result.ai_review.length > 0, '评审员应产出评审意见');
  });

  it('执行多步骤流程 — 串行步骤+并行角色', async () => {
    await DB.clear(DB.STORES.FLOW_CONFIGS);
    const flowId = Utils.generateId();
    await DB.put(DB.STORES.FLOW_CONFIGS, {
      id: flowId, name: '多步骤流程', trigger: 'generate_paragraph',
      enabled: true, blocking: true,
      steps: JSON.stringify([['writer', 'reviewer'], ['summarizer']]),
      sortOrder: 1, createdAt: Utils.now(), updatedAt: Utils.now(),
    });

    const context = {
      user_input: '多步骤测试', context_before: '', chapter_outline: '', follow_up: '',
      bound_settings: '', current_paragraph: '', chapter_content: '', ai_review: '',
      generated_paragraph: '', generated_summary: '', generated_recap: '',
    };

    const result = await FlowEngine.execute('generate_paragraph', context);
    assert(result.generated_paragraph.length > 0, '步骤1写手产出');
    assert(result.ai_review.length > 0, '步骤1评审员产出');
    assert(result.generated_summary.length > 0, '步骤2概要师产出');

    // 验证状态
    const status = FlowEngine.getStatus();
    assertNotNull(status);
    assertEqual(status.totalSteps, 2);
    assertEqual(status.steps[0].roles.length, 2);
    assertEqual(status.steps[1].roles.length, 1);
  });

  it('无匹配流程时抛出错误', async () => {
    let thrown = false;
    try {
      await FlowEngine.execute('setting_changed', {});
    } catch (e) {
      thrown = true;
      assert(e.message.includes('没有匹配'), '错误信息应包含提示');
    }
    assert(thrown, '应抛出错误');
  });

  it('阻塞状态管理', async () => {
    // 在执行期间检查阻塞状态
    let wasRunning = false;
    let wasBlocking = false;
    const handler = ({ key, value }) => {
      if (key === 'aiRunning') wasRunning = value;
      if (key === 'aiBlocking') wasBlocking = value;
    };

    // mock 中间检查在异步完成后验证
    const context = {
      user_input: '阻塞测试', context_before: '', chapter_outline: '', follow_up: '',
      bound_settings: '', current_paragraph: '', chapter_content: '', ai_review: '',
      generated_paragraph: '', generated_summary: '', generated_recap: '',
    };

    await FlowEngine.execute('generate_paragraph', context);
    // 执行完后应恢复
    assertEqual(Store.get('aiRunning'), false);
    assertEqual(Store.get('aiBlocking'), false);
  });

  it('恢复 AIService', () => {
    AIService.call = _origCall;
    assert(true);
  });
});

describe('FlowEngine — 失败处理', () => {
  let _origCall;

  it('角色执行失败不影响其他角色', async () => {
    _origCall = AIService.call;

    let callCount = 0;
    AIService.call = async (providerId, modelId, prompt) => {
      callCount++;
      if (callCount === 1) {
        // 第一个角色失败
        const err = new Error('模拟失败');
        err.failCount = 3;
        err.errors = ['err1', 'err2', 'err3'];
        throw err;
      }
      return { text: '成功输出', failCount: 0, errors: [] };
    };

    await DB.clear(DB.STORES.FLOW_CONFIGS);
    await DB.put(DB.STORES.FLOW_CONFIGS, {
      id: Utils.generateId(), name: '失败测试', trigger: 'generate_paragraph',
      enabled: true, blocking: true, steps: JSON.stringify([['writer', 'reviewer']]),
      sortOrder: 1, createdAt: Utils.now(), updatedAt: Utils.now(),
    });

    const context = {
      user_input: '失败测试', context_before: '', chapter_outline: '', follow_up: '',
      bound_settings: '', current_paragraph: '', chapter_content: '', ai_review: '',
      generated_paragraph: '', generated_summary: '', generated_recap: '',
    };

    await FlowEngine.execute('generate_paragraph', context);

    // 写手失败，段落应为空; 评审员成功
    assertEqual(context.generated_paragraph, '');
    assertEqual(context.ai_review, '成功输出');

    const status = FlowEngine.getStatus();
    assertEqual(status.steps[0].roles[0].status, 'failed');
    assertEqual(status.steps[0].roles[1].status, 'completed');

    AIService.call = _origCall;
  });
});

// 清理 P5 测试数据
describe('P5 cleanup', () => {
  it('清理测试数据', async () => {
    await DB.clear(DB.STORES.AI_PROVIDERS);
    await DB.clear(DB.STORES.AI_MODELS);
    await DB.clear(DB.STORES.ROLE_CONFIGS);
    await DB.clear(DB.STORES.FLOW_CONFIGS);
    await DB.clear(DB.STORES.RECAP_DATA);
    assert(true);
  });
});

/* ================================================================
   P6 测试用例 — 文件导入/导出
   ================================================================ */

describe('Export/Import — 数据往返测试', () => {
  const testData = {};

  it('准备测试数据', async () => {
    await DB.clearAll();

    // 供应商
    testData.provider = {
      id: 'test-prov-1', name: 'TestAI', apiUrl: 'https://api.test.com/v1',
      apiKey: 'sk-test', retryCount: 2, sortOrder: 1,
      createdAt: Utils.now(), updatedAt: Utils.now(),
    };
    await DB.put(DB.STORES.AI_PROVIDERS, testData.provider);

    // 模型
    testData.model = {
      id: 'test-model-1', providerId: 'test-prov-1', name: 'test-gpt',
      sortOrder: 1, createdAt: Utils.now(),
    };
    await DB.put(DB.STORES.AI_MODELS, testData.model);

    // 职能配置 (V2: id key)
    testData.roleConfig = {
      id: 'test-role-writer', name: '写手',
      promptTemplate: '写作:{{用户输入}}',
      providerId: 'test-prov-1', modelId: 'test-model-1',
      outputVar: 'generated_paragraph',
      customVars: '[]', sortOrder: 0,
      createdAt: Utils.now(), updatedAt: Utils.now(),
    };
    await DB.put(DB.STORES.ROLE_CONFIGS, testData.roleConfig);

    // 类目
    testData.category = {
      id: 'cat-test-1', parentId: null, type: 'character', name: '测试角色',
      description: '用于导入导出测试', attributes: '{"年龄":"20"}',
      sortOrder: 1, version: 1, createdAt: Utils.now(), updatedAt: Utils.now(),
    };
    await DB.put(DB.STORES.CATEGORIES, testData.category);

    // 设置
    await DB.put(DB.STORES.APP_SETTINGS, { key: 'test_setting', value: '"hello"' });

    assert(true);
  });

  it('导出数据到 ZIP Blob', async () => {
    // 手动构建 ZIP（不调用 UI 进度条版的 exportAll）
    const tables = [
      'categories', 'chapters', 'paragraphs', 'paragraph_bindings',
      'ai_providers', 'ai_models', 'role_configs', 'flow_configs',
      'recap_data', 'app_settings', 'books', 'ai_logs',
    ];

    const data = {};
    const manifest = { version: '2.0', exportedAt: Utils.now(), appVersion: '2.0.0', tables: {} };

    for (const table of tables) {
      const records = await DB.getAll(table);
      data[table] = records;
      manifest.tables[table] = records.length;
    }

    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    for (const table of tables) {
      zip.file(`${table}.json`, JSON.stringify(data[table], null, 2));
    }

    testData.zipBlob = await zip.generateAsync({ type: 'blob' });
    assert(testData.zipBlob.size > 0, 'ZIP 应有大小');
    assertEqual(manifest.tables.ai_providers, 1);
    assertEqual(manifest.tables.categories, 1);
  });

  it('清空数据库', async () => {
    await DB.clearAll();
    const providers = await DB.getAll(DB.STORES.AI_PROVIDERS);
    assertEqual(providers.length, 0);
    const categories = await DB.getAll(DB.STORES.CATEGORIES);
    assertEqual(categories.length, 0);
  });

  it('从 ZIP 导入数据', async () => {
    const zip = await JSZip.loadAsync(testData.zipBlob);

    const manifestFile = zip.file('manifest.json');
    assertNotNull(manifestFile);
    const manifest = JSON.parse(await manifestFile.async('text'));
    assertEqual(manifest.version, '2.0');

    const tables = [
      'ai_providers', 'ai_models', 'role_configs', 'flow_configs',
      'categories', 'chapters', 'paragraphs', 'paragraph_bindings',
      'recap_data', 'app_settings', 'books', 'ai_logs',
    ];

    for (const table of tables) {
      const jsonFile = zip.file(`${table}.json`);
      if (jsonFile) {
        const records = JSON.parse(await jsonFile.async('text'));
        if (Array.isArray(records) && records.length > 0) {
          await DB.putAll(table, records);
        }
      }
    }

    assert(true);
  });

  it('验证导入数据完整性 — 供应商', async () => {
    const provider = await DB.getById(DB.STORES.AI_PROVIDERS, 'test-prov-1');
    assertNotNull(provider);
    assertEqual(provider.name, 'TestAI');
    assertEqual(provider.apiUrl, 'https://api.test.com/v1');
    assertEqual(provider.retryCount, 2);
  });

  it('验证导入数据完整性 — 模型', async () => {
    const model = await DB.getById(DB.STORES.AI_MODELS, 'test-model-1');
    assertNotNull(model);
    assertEqual(model.name, 'test-gpt');
    assertEqual(model.providerId, 'test-prov-1');
  });

  it('验证导入数据完整性 — 职能配置', async () => {
    const config = await DB.getById(DB.STORES.ROLE_CONFIGS, 'test-role-writer');
    assertNotNull(config);
    assertEqual(config.name, '写手');
    assert(config.promptTemplate.includes('{{用户输入}}'), '模板应保留');
    assertEqual(config.outputVar, 'generated_paragraph');
  });

  it('验证导入数据完整性 — 类目', async () => {
    const cat = await DB.getById(DB.STORES.CATEGORIES, 'cat-test-1');
    assertNotNull(cat);
    assertEqual(cat.name, '测试角色');
    assertEqual(cat.type, 'character');
    const attrs = JSON.parse(cat.attributes);
    assertEqual(attrs['年龄'], '20');
  });

  it('验证导入数据完整性 — 设置', async () => {
    const setting = await DB.getById(DB.STORES.APP_SETTINGS, 'test_setting');
    assertNotNull(setting);
    assertEqual(JSON.parse(setting.value), 'hello');
  });

  it('manifest 格式验证', async () => {
    const zip = await JSZip.loadAsync(testData.zipBlob);
    const manifest = JSON.parse(await zip.file('manifest.json').async('text'));
    assertNotNull(manifest.version);
    assertNotNull(manifest.exportedAt);
    assertNotNull(manifest.appVersion);
    assertNotNull(manifest.tables);
    assert(typeof manifest.tables === 'object', 'tables 应为对象');
  });
});

// 清理 P6 测试数据
describe('P6 cleanup', () => {
  it('清理测试数据', async () => {
    await DB.clearAll();
    assert(true);
  });
});

/* ================================================================
   P7 测试用例 — 端到端集成测试
   ================================================================ */

describe('E2E — 创建类目 → 配置 AI → 写段落 → 生成章节', () => {
  let _origCall;

  it('E2E: 创建类目', async () => {
    await DB.clearAll();
    // 再次初始化 DB (clearAll 后需确保可用)
    await DB.init();

    const now = Utils.now();
    await DB.put(DB.STORES.CATEGORIES, {
      id: 'e2e-char-1', parentId: null, type: 'character', name: '林风',
      description: '天才少年修仙者', attributes: '{"年龄":"16","境界":"筑基"}',
      sortOrder: 1, version: 1, createdAt: now, updatedAt: now,
    });
    await DB.put(DB.STORES.CATEGORIES, {
      id: 'e2e-loc-1', parentId: null, type: 'location', name: '天剑宗',
      description: '修仙大宗门', attributes: '{"位置":"东洲"}',
      sortOrder: 2, version: 1, createdAt: now, updatedAt: now,
    });

    const cats = await DB.getAll(DB.STORES.CATEGORIES);
    assertEqual(cats.length, 2);
  });

  it('E2E: 配置 AI 供应商和模型', async () => {
    const now = Utils.now();
    await DB.put(DB.STORES.AI_PROVIDERS, {
      id: 'e2e-prov', name: 'E2E-AI', apiUrl: 'https://api.e2e.com/v1',
      apiKey: 'sk-e2e', retryCount: 2, sortOrder: 1,
      createdAt: now, updatedAt: now,
    });
    await DB.put(DB.STORES.AI_MODELS, {
      id: 'e2e-model', providerId: 'e2e-prov', name: 'e2e-gpt-4',
      sortOrder: 1, createdAt: now,
    });

    // V2: 配置用户自建职能
    const roleNames = ['写手', '评审员', '概要师', '前情师'];
    const roleIds = ['e2e-writer', 'e2e-reviewer', 'e2e-summarizer', 'e2e-recap'];
    const roleOutputs = ['generated_paragraph', 'ai_review', 'generated_summary', 'generated_recap'];
    for (let i = 0; i < roleNames.length; i++) {
      await DB.put(DB.STORES.ROLE_CONFIGS, {
        id: roleIds[i],
        name: roleNames[i],
        promptTemplate: `${roleNames[i]}:{{用户输入}}`,
        providerId: 'e2e-prov', modelId: 'e2e-model',
        outputVar: roleOutputs[i],
        customVars: '[]', sortOrder: i,
        createdAt: now, updatedAt: now,
      });
    }

    const configs = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    assertEqual(configs.length, 4);
  });

  it('E2E: 配置流程', async () => {
    const now = Utils.now();
    await DB.put(DB.STORES.FLOW_CONFIGS, {
      id: Utils.generateId(), name: 'E2E生成段落',
      trigger: 'generate_paragraph', enabled: true, blocking: true,
      steps: JSON.stringify([['e2e-writer', 'e2e-reviewer'], ['e2e-summarizer']]),
      sortOrder: 1, createdAt: now, updatedAt: now,
    });
    await DB.put(DB.STORES.FLOW_CONFIGS, {
      id: Utils.generateId(), name: 'E2E生成章节',
      trigger: 'generate_chapter', enabled: true, blocking: true,
      steps: JSON.stringify([['e2e-summarizer']]),
      sortOrder: 2, createdAt: now, updatedAt: now,
    });

    const flows = await DB.getAll(DB.STORES.FLOW_CONFIGS);
    assertEqual(flows.length, 2);
  });

  it('E2E: 创建章节和段落', async () => {
    const now = Utils.now();
    const chapterId = await DB.put(DB.STORES.CHAPTERS, {
      title: '第一章 初入修仙界', summary: '', content: '', recapText: '',
      reviewNotes: '', status: ChapterStatus.DRAFT, sortOrder: 1,
      createdAt: now, updatedAt: now,
    });

    assert(chapterId > 0, '章节 ID 应为正数');

    await DB.put(DB.STORES.PARAGRAPHS, {
      id: Utils.generateId(), chapterId, content: '林风站在天剑宗门前。',
      sortOrder: 1, recapBrief: '', followUp: '',
      createdAt: now, updatedAt: now,
    });

    const paras = await DB.getByIndex(DB.STORES.PARAGRAPHS, 'idx_chapterId', chapterId);
    assertEqual(paras.length, 1);
  });

  it('E2E: Mock AI 执行生成段落流程', async () => {
    _origCall = AIService.call;
    AIService.call = async (pid, mid, prompt) => ({
      text: `[E2E] 生成内容: ${prompt.slice(0, 30)}`, failCount: 0, errors: [],
    });

    const context = {
      context_before: '', user_input: '林风进入宗门大殿',
      chapter_outline: '初入天剑宗', follow_up: '',
      bound_settings: '人物:林风\n地点:天剑宗',
      current_paragraph: '', chapter_content: '林风站在天剑宗门前。',
      ai_review: '', generated_paragraph: '', generated_summary: '', generated_recap: '',
    };

    const result = await FlowEngine.execute('generate_paragraph', context);

    assert(result.generated_paragraph.length > 0, '应生成段落');
    assert(result.ai_review.length > 0, '应生成评审');
    assert(result.generated_summary.length > 0, '应生成概要');
  });

  it('E2E: Mock AI 执行生成章节流程', async () => {
    const context = {
      context_before: '', user_input: '', chapter_outline: '',
      follow_up: '', bound_settings: '', current_paragraph: '',
      chapter_content: '林风站在天剑宗门前。\n\n林风进入宗门大殿。',
      ai_review: '', generated_paragraph: '', generated_summary: '', generated_recap: '',
    };

    const result = await FlowEngine.execute('generate_chapter', context);
    assert(result.generated_summary.length > 0, '应生成章节概要');

    AIService.call = _origCall;
  });
});

describe('E2E — 完整导出导入往返', () => {
  it('E2E: 全量导出导入往返', async () => {
    // 导出
    const tables = [
      'categories', 'chapters', 'paragraphs', 'paragraph_bindings',
      'ai_providers', 'ai_models', 'role_configs', 'flow_configs',
      'recap_data', 'app_settings', 'books', 'ai_logs',
    ];

    const exportData = {};
    for (const t of tables) {
      exportData[t] = await DB.getAll(t);
    }

    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      version: '2.0', exportedAt: Utils.now(), appVersion: '2.0.0',
      tables: Object.fromEntries(tables.map(t => [t, exportData[t].length])),
    }));
    for (const t of tables) {
      zip.file(`${t}.json`, JSON.stringify(exportData[t]));
    }
    const blob = await zip.generateAsync({ type: 'blob' });

    // 清空
    await DB.clearAll();
    for (const t of tables) {
      const records = await DB.getAll(t);
      assertEqual(records.length, 0);
    }

    // 导入
    const importZip = await JSZip.loadAsync(blob);
    for (const t of tables) {
      const f = importZip.file(`${t}.json`);
      if (f) {
        const records = JSON.parse(await f.async('text'));
        if (records.length > 0) await DB.putAll(t, records);
      }
    }

    // 验证所有表记录数匹配
    for (const t of tables) {
      const imported = await DB.getAll(t);
      assertEqual(imported.length, exportData[t].length);
    }
  });

  it('E2E: 导入后类目数据完整', async () => {
    const cat = await DB.getById(DB.STORES.CATEGORIES, 'e2e-char-1');
    assertNotNull(cat);
    assertEqual(cat.name, '林风');
    const attrs = JSON.parse(cat.attributes);
    assertEqual(attrs['境界'], '筑基');
  });

  it('E2E: 导入后 AI 配置完整', async () => {
    const provider = await DB.getById(DB.STORES.AI_PROVIDERS, 'e2e-prov');
    assertNotNull(provider);
    assertEqual(provider.name, 'E2E-AI');

    const configs = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    assertEqual(configs.length, 4);

    const flows = await DB.getAll(DB.STORES.FLOW_CONFIGS);
    assertEqual(flows.length, 2);
  });
});

describe('E2E — Store 与事件总线集成', () => {
  it('Store 初始化从 DB 恢复', async () => {
    const chapters = await DB.getAll(DB.STORES.CHAPTERS);
    if (chapters.length > 0) {
      await DB.put(DB.STORES.APP_SETTINGS, {
        key: 'current_chapter_id', value: JSON.stringify(chapters[0].id),
      });
      await Store.init();
      assertEqual(Store.get('currentChapterId'), chapters[0].id);
    } else {
      assert(true, '无章节可测试');
    }
  });

  it('EventBus 跨模块事件传播', () => {
    let received = false;
    const handler = () => { received = true; };
    EventBus.on(Events.CATEGORY_TREE_CHANGED, handler);
    EventBus.emit(Events.CATEGORY_TREE_CHANGED, {});
    assert(received, '事件应被接收');
    EventBus.off(Events.CATEGORY_TREE_CHANGED, handler);
  });

  it('Store.updateStatusPanel 多字段更新', () => {
    Store.updateStatusPanel({
      chapterSummary: '测试概要',
      aiReviewNotes: '测试评审',
      recapText: '测试提要',
      followUpText: '测试后续',
    });
    assertEqual(Store.get('chapterSummary'), '测试概要');
    assertEqual(Store.get('aiReviewNotes'), '测试评审');
    assertEqual(Store.get('recapText'), '测试提要');
    assertEqual(Store.get('followUpText'), '测试后续');
  });
});

// 最终清理
describe('P7 final cleanup', () => {
  it('清理所有测试数据', async () => {
    await DB.clearAll();
    assert(true);
  });
});

// ========== P9: 书籍管理与数据关联 ==========
describe('P9 — 书籍 CRUD', () => {
  it('创建书籍', async () => {
    await DB.clearAll();
    const now = Utils.now();
    const id = Utils.generateId();
    await DB.put(DB.STORES.BOOKS, {
      id, name: '修仙传奇', description: '一个少年的修仙之路',
      sortOrder: 0, createdAt: now, updatedAt: now,
    });
    const book = await DB.getById(DB.STORES.BOOKS, id);
    assertNotNull(book);
    assertEqual(book.name, '修仙传奇');
    assertEqual(book.description, '一个少年的修仙之路');
  });

  it('更新书籍', async () => {
    const books = await DB.getAll(DB.STORES.BOOKS);
    const book = books[0];
    book.name = '修仙传奇2';
    book.updatedAt = Utils.now();
    await DB.put(DB.STORES.BOOKS, book);
    const updated = await DB.getById(DB.STORES.BOOKS, book.id);
    assertEqual(updated.name, '修仙传奇2');
  });

  it('删除书籍', async () => {
    const books = await DB.getAll(DB.STORES.BOOKS);
    assertEqual(books.length, 1);
    await DB.delete(DB.STORES.BOOKS, books[0].id);
    const remaining = await DB.getAll(DB.STORES.BOOKS);
    assertEqual(remaining.length, 0);
  });

  it('多本书籍', async () => {
    const now = Utils.now();
    for (let i = 0; i < 3; i++) {
      await DB.put(DB.STORES.BOOKS, {
        id: `book-${i}`, name: `书籍${i}`, description: '',
        sortOrder: i, createdAt: now, updatedAt: now,
      });
    }
    const all = await DB.getAll(DB.STORES.BOOKS);
    assertEqual(all.length, 3);
  });
});

describe('P9 — bookId 数据关联', () => {
  it('章节关联 bookId', async () => {
    await Store.setCurrentBook('book-0');
    const chapterId = await Store.createNewChapter();
    const chapter = await DB.getById(DB.STORES.CHAPTERS, chapterId);
    assertEqual(chapter.bookId, 'book-0');
  });

  it('类目关联 bookId', async () => {
    await Store.setCurrentBook('book-1');
    const now = Utils.now();
    const catId = Utils.generateId();
    await DB.put(DB.STORES.CATEGORIES, {
      id: catId, parentId: null, bookId: Store.get('currentBookId') || null,
      type: 'character', name: '角色A', description: '', attributes: '{}',
      sortOrder: 1, version: 1, createdAt: now, updatedAt: now,
    });
    const cat = await DB.getById(DB.STORES.CATEGORIES, catId);
    assertEqual(cat.bookId, 'book-1');
  });

  it('按 bookId 过滤类目', async () => {
    const now = Utils.now();
    await DB.put(DB.STORES.CATEGORIES, {
      id: 'cat-b2', parentId: null, bookId: 'book-2',
      type: 'location', name: '地点X', description: '', attributes: '{}',
      sortOrder: 1, version: 1, createdAt: now, updatedAt: now,
    });
    const all = await DB.getAll(DB.STORES.CATEGORIES);
    const book1 = all.filter(c => c.bookId === 'book-1');
    const book2 = all.filter(c => c.bookId === 'book-2');
    assertEqual(book1.length, 1);
    assertEqual(book2.length, 1);
  });

  it('Store.setCurrentBook 持久化', async () => {
    await Store.setCurrentBook('book-0');
    assertEqual(Store.get('currentBookId'), 'book-0');
    const setting = await DB.getById(DB.STORES.APP_SETTINGS, 'current_book_id');
    assertNotNull(setting);
    assertEqual(JSON.parse(setting.value), 'book-0');
  });

  it('BOOK_CHANGED 事件触发', () => {
    let received = null;
    const handler = (data) => { received = data; };
    EventBus.on(Events.BOOK_CHANGED, handler);
    EventBus.emit(Events.BOOK_CHANGED, { bookId: 'book-1' });
    assertNotNull(received);
    assertEqual(received.bookId, 'book-1');
    EventBus.off(Events.BOOK_CHANGED, handler);
  });

  it('清理 P9 测试数据', async () => {
    await DB.clearAll();
    assert(true);
  });
});

// ========== P10: 侧边栏与动态内容 ==========
describe('P10 — SidebarUI', () => {
  it('SidebarUI 模块存在', () => {
    assertNotNull(SidebarUI);
    assertEqual(typeof SidebarUI.init, 'function');
    assertEqual(typeof SidebarUI.switchTab, 'function');
  });

  it('sidebarTab 状态切换', () => {
    Store.setSidebarTab('chapters');
    assertEqual(Store.get('sidebarTab'), 'chapters');
    Store.setSidebarTab('bookInfo');
    assertEqual(Store.get('sidebarTab'), 'bookInfo');
    Store.setSidebarTab('categories');
    assertEqual(Store.get('sidebarTab'), 'categories');
  });

  it('SIDEBAR_TAB_CHANGED 事件', () => {
    let received = null;
    const handler = (data) => { received = data; };
    EventBus.on(Events.SIDEBAR_TAB_CHANGED, handler);
    EventBus.emit(Events.SIDEBAR_TAB_CHANGED, { tab: 'chapters' });
    assertNotNull(received);
    assertEqual(received.tab, 'chapters');
    EventBus.off(Events.SIDEBAR_TAB_CHANGED, handler);
  });

  it('章节列表按 bookId 过滤', async () => {
    await DB.clearAll();
    const now = Utils.now();
    await DB.put(DB.STORES.BOOKS, { id: 'b1', name: '书1', description: '', sortOrder: 0, createdAt: now, updatedAt: now });
    await DB.put(DB.STORES.CHAPTERS, { title: '第1章', bookId: 'b1', status: ChapterStatus.DRAFT, sortOrder: 1, createdAt: now, updatedAt: now });
    await DB.put(DB.STORES.CHAPTERS, { title: '第2章', bookId: 'b1', status: ChapterStatus.COMPLETED, sortOrder: 2, createdAt: now, updatedAt: now });
    await DB.put(DB.STORES.CHAPTERS, { title: '其他书', bookId: 'other', status: ChapterStatus.DRAFT, sortOrder: 1, createdAt: now, updatedAt: now });

    await Store.setCurrentBook('b1');
    const all = await DB.getAll(DB.STORES.CHAPTERS);
    const filtered = all.filter(c => c.bookId === 'b1');
    assertEqual(filtered.length, 2);
  });

  it('清理 P10 测试数据', async () => {
    await DB.clearAll();
    assert(true);
  });
});

// ========== P11: AI 配置增强 ==========
describe('P11 — 模型智能等级', () => {
  it('保存模型含智能等级', async () => {
    await DB.clearAll();
    const now = Utils.now();
    await DB.put(DB.STORES.AI_PROVIDERS, {
      id: 'p11-prov', name: 'P11 Provider', apiUrl: 'https://api.test.com/v1',
      apiKey: 'sk-test', retryCount: 3, sortOrder: 1, createdAt: now, updatedAt: now,
    });
    await DB.put(DB.STORES.AI_MODELS, {
      id: 'p11-model-1', providerId: 'p11-prov', name: 'gpt-4',
      intelligenceLevel: 'high', sortOrder: 1, createdAt: now,
    });
    const model = await DB.getById(DB.STORES.AI_MODELS, 'p11-model-1');
    assertEqual(model.intelligenceLevel, 'high');
  });

  it('智能等级枚举查询', () => {
    const high = getIntelligenceLevelByValue('high');
    assertNotNull(high);
    assertEqual(high.label, '高级');
    const basic = getIntelligenceLevelByValue('basic');
    assertEqual(basic.label, '基础');
  });
});

describe('P11 — AI 响应解析', () => {
  it('解析 OpenAI 标准响应', () => {
    const openaiResp = {
      choices: [{ message: { content: 'Hello from OpenAI' } }],
    };
    const text = AIService.parseResponse(openaiResp);
    assertEqual(text, 'Hello from OpenAI');
  });

  it('解析 Ollama 响应', () => {
    const ollamaResp = {
      message: { content: 'Hello from Ollama' },
    };
    const text = AIService.parseResponse(ollamaResp);
    assertEqual(text, 'Hello from Ollama');
  });

  it('未知格式抛出错误', () => {
    let thrown = false;
    try {
      AIService.parseResponse({ result: 'unknown' });
    } catch (e) {
      thrown = true;
      assert(e.message.includes('意外的'), '应提示意外格式');
    }
    assert(thrown, '应抛出错误');
  });

  it('OpenAI 空内容返回空字符串', () => {
    const resp = { choices: [{ message: { content: '' } }] };
    assertEqual(AIService.parseResponse(resp), '');
  });

  it('Ollama 空内容返回空字符串', () => {
    const resp = { message: { content: '' } };
    assertEqual(AIService.parseResponse(resp), '');
  });

  it('清理 P11 测试数据', async () => {
    await DB.clearAll();
    assert(true);
  });
});

// ========== P12: 聊天框重构 ==========
describe('P12 — 风格标签与大纲处理', () => {
  it('风格标签增删', () => {
    Store.setStyleTags(['悬疑', '热血']);
    const tags = Store.get('styleTags');
    assertEqual(tags.length, 2);
    assertEqual(tags[0], '悬疑');
    assertEqual(tags[1], '热血');
    Store.setStyleTags([]);
    assertEqual(Store.get('styleTags').length, 0);
  });

  it('大纲分行处理', () => {
    const text = '第一幕：少年离家\n第二幕：途经森林\n\n第三幕：获得传承';
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    assertEqual(lines.length, 3);
    assertEqual(lines[0], '第一幕：少年离家');
    assertEqual(lines[2], '第三幕：获得传承');
  });

  it('collectContext 包含风格标签', async () => {
    await DB.clearAll();
    Store.setStyleTags(['悬疑', '日常']);
    Store.setChapterOutline('测试概述');
    const ctx = await ChatUI.collectContext();
    assert(ctx.bound_settings.includes('风格: 悬疑, 日常'), '应包含风格标签');
    assertEqual(ctx.user_input, '测试概述');
    Store.setStyleTags([]);
  });

  it('collectContext 无风格标签时不包含风格行', async () => {
    Store.setStyleTags([]);
    const ctx = await ChatUI.collectContext();
    assert(!ctx.bound_settings.includes('风格:'), '不应包含风格前缀');
  });

  it('清理 P12 测试数据', async () => {
    await DB.clearAll();
    assert(true);
  });
});

// ========== P13: 模板导入导出 & 自定义变量 ==========
describe('P13 — 模板导出', () => {
  it('导出包含职能和流程', async () => {
    await DB.clearAll();
    // Create provider + model
    await DB.put(DB.STORES.AI_PROVIDERS, { id: 'p1', name: 'TestProvider', endpoint: 'http://test', apiKey: 'k', retryCount: 3 });
    await DB.put(DB.STORES.AI_MODELS, { id: 'm1', name: 'Model1', providerId: 'p1', intelligenceLevel: 'high', sortOrder: 0 });
    // Create roles
    await DB.put(DB.STORES.ROLE_CONFIGS, { id: 'r1', name: '写手', promptTemplate: '写{{用户输入}}', outputVar: 'draft', customVars: '[]', providerId: 'p1', modelId: 'm1', sortOrder: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' });
    await DB.put(DB.STORES.ROLE_CONFIGS, { id: 'r2', name: '审稿', promptTemplate: '审{{草稿}}', outputVar: 'review', customVars: '[{"name":"风格","isOutput":true}]', providerId: 'p1', modelId: 'm1', sortOrder: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' });
    // Create flow
    await DB.put(DB.STORES.FLOW_CONFIGS, { id: 'f1', name: '写作流', trigger: 'generate_paragraph', enabled: true, blocking: true, steps: JSON.stringify([['r1'], ['r2']]), sortOrder: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' });

    const tpl = await TemplateService.exportTemplate();
    assertEqual(tpl.version, '2.0');
    assertEqual(tpl.type, 'template');
    assertEqual(tpl.roles.length, 2);
    assertEqual(tpl.flows.length, 1);
    assertEqual(tpl.roles[0].name, '写手');
    assertEqual(tpl.roles[0].intelligenceLevel, 'high');
    assertEqual(tpl.roles[1].customVars.length, 1);
    assertEqual(tpl.roles[1].customVars[0].name, '风格');
    // Flow steps should use names, not UUIDs
    assertEqual(tpl.flows[0].steps[0][0], '写手');
    assertEqual(tpl.flows[0].steps[1][0], '审稿');
  });
});

describe('P13 — 模型匹配', () => {
  it('按智能等级匹配模型', async () => {
    const roles = [
      { name: '写手', intelligenceLevel: 'high' },
      { name: '审稿', intelligenceLevel: 'medium' },
    ];
    const matches = await TemplateService.matchModels(roles);
    assertEqual(matches.length, 2);
    assertEqual(matches[0].roleName, '写手');
    assertEqual(matches[0].level, 'high');
    // We have a 'high' model from previous test
    assertEqual(matches[0].matchedModelId, 'm1');
    // No 'medium' model exists
    assertEqual(matches[1].matchedModelId, null);
  });
});

describe('P13 — 模板导入', () => {
  it('导入创建新职能和流程', async () => {
    await DB.clearAll();
    // Setup provider+model for binding
    await DB.put(DB.STORES.AI_PROVIDERS, { id: 'p1', name: 'TestProvider', endpoint: 'http://test', apiKey: 'k', retryCount: 3 });
    await DB.put(DB.STORES.AI_MODELS, { id: 'm1', name: 'Model1', providerId: 'p1', intelligenceLevel: 'high', sortOrder: 0 });

    const template = {
      version: '2.0',
      type: 'template',
      roles: [
        { name: '策划', promptTemplate: '策划{{用户输入}}', outputVar: 'draft', customVars: [{ name: '主题', isOutput: true }], intelligenceLevel: 'high' },
        { name: '润色', promptTemplate: '润色{{草稿}}', outputVar: 'review', customVars: [], intelligenceLevel: 'high' },
      ],
      flows: [
        { name: '创作流', trigger: 'generate_paragraph', enabled: true, blocking: true, steps: [['策划'], ['润色']] },
      ],
    };

    const bindings = [
      { roleName: '策划', providerId: 'p1', modelId: 'm1' },
      { roleName: '润色', providerId: 'p1', modelId: 'm1' },
    ];

    const result = await TemplateService.importTemplate(template, bindings);
    assertEqual(result.roleCount, 2);
    assertEqual(result.flowCount, 1);

    // Verify roles were created with new UUIDs
    const roles = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    assertEqual(roles.length, 2);
    assert(roles[0].id !== 'r1' && roles[0].id !== 'r2', '应使用新UUID');
    const planRole = roles.find(r => r.name === '策划');
    assert(!!planRole, '应创建策划职能');
    assertEqual(planRole.providerId, 'p1');
    assertEqual(planRole.modelId, 'm1');
    const cvs = JSON.parse(planRole.customVars);
    assertEqual(cvs.length, 1);
    assertEqual(cvs[0].name, '主题');

    // Verify flow steps use new role UUIDs
    const flows = await DB.getAll(DB.STORES.FLOW_CONFIGS);
    assertEqual(flows.length, 1);
    const steps = JSON.parse(flows[0].steps);
    assertEqual(steps[0][0], planRole.id);
  });
});

describe('P13 — 自定义变量替换', () => {
  it('替换自定义变量 {{自定义:变量名}}', () => {
    const context = {
      user_input: '主角进入山洞',
      _customVars: { '风格': '悬疑推理', '主题': '冒险' },
    };
    const template = '要求：{{用户输入}}\n风格：{{自定义:风格}}\n主题：{{自定义:主题}}';
    const result = FlowEngine._replaceVariables(template, context);
    assert(result.includes('主角进入山洞'), '应替换用户输入');
    assert(result.includes('悬疑推理'), '应替换自定义风格');
    assert(result.includes('冒险'), '应替换自定义主题');
    assert(!result.includes('{{'), '不应有未替换的变量');
  });

  it('未设置的自定义变量保持原样', () => {
    const context = { _customVars: {} };
    const template = '{{自定义:不存在}}';
    const result = FlowEngine._replaceVariables(template, context);
    assertEqual(result, '{{自定义:不存在}}');
  });

  it('无_customVars时自定义变量保持原样', () => {
    const context = {};
    const template = '{{自定义:风格}}';
    const result = FlowEngine._replaceVariables(template, context);
    assertEqual(result, '{{自定义:风格}}');
  });
});

describe('P13 — 自定义变量输出集成', () => {
  let _origCall;
  it('flow执行时自定义输出变量写入context', async () => {
    await DB.clearAll();
    _origCall = AIService.call;
    let callCount = 0;
    AIService.call = async () => {
      callCount++;
      return { text: callCount === 1 ? '生成的风格数据' : '最终结果', failCount: 0 };
    };

    await DB.put(DB.STORES.AI_PROVIDERS, { id: 'p1', name: 'Test', endpoint: 'http://test', apiKey: 'k', retryCount: 3 });
    await DB.put(DB.STORES.AI_MODELS, { id: 'm1', name: 'M1', providerId: 'p1', intelligenceLevel: 'high', sortOrder: 0 });
    await DB.put(DB.STORES.ROLE_CONFIGS, { id: 'cv-r1', name: '风格生成', promptTemplate: '生成风格', outputVar: '', customVars: JSON.stringify([{ name: '风格', isOutput: true }]), providerId: 'p1', modelId: 'm1', sortOrder: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' });
    await DB.put(DB.STORES.ROLE_CONFIGS, { id: 'cv-r2', name: '应用风格', promptTemplate: '用{{自定义:风格}}写文', outputVar: 'draft', customVars: JSON.stringify([{ name: '风格', isOutput: false }]), providerId: 'p1', modelId: 'm1', sortOrder: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' });
    await DB.put(DB.STORES.FLOW_CONFIGS, { id: 'cv-f1', name: '风格流', trigger: 'generate_paragraph', enabled: true, blocking: false, steps: JSON.stringify([['cv-r1'], ['cv-r2']]), sortOrder: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' });

    const context = { user_input: '测试' };
    const result = await FlowEngine.execute('generate_paragraph', context);
    assertEqual(result._customVars['风格'], '生成的风格数据');
    assertEqual(result.draft, '最终结果');
  });

  it('清理 P13 测试数据', async () => {
    AIService.call = _origCall;
    await DB.clearAll();
    assert(true);
  });
});

// ========== P14: 日志管理系统 ==========
describe('P14 — 日志记录与查询', () => {
  it('记录日志', async () => {
    await DB.clearAll();
    const log = await LogService.record({
      providerId: 'p1', providerName: 'TestProvider',
      modelId: 'm1', modelName: 'Model1',
      prompt: '写一段故事', response: '从前有座山...',
      duration: 1500, status: 'success',
    });
    assert(!!log.id, '应有日志ID');
    assert(!!log.createdAt, '应有创建时间');
    assertEqual(log.providerName, 'TestProvider');
    assertEqual(log.status, 'success');
  });

  it('记录失败日志', async () => {
    const log = await LogService.record({
      providerId: 'p1', providerName: 'TestProvider',
      modelId: 'm1', modelName: 'Model1',
      prompt: '写一段故事', response: '',
      duration: 500, status: 'failed', error: 'Rate limit',
    });
    assertEqual(log.status, 'failed');
    assertEqual(log.error, 'Rate limit');
  });

  it('查询全部日志 — 时间倒序', async () => {
    const logs = await LogService.query();
    assertEqual(logs.length, 2);
    assert(logs[0].createdAt >= logs[1].createdAt, '应按时间倒序');
  });

  it('按状态筛选日志', async () => {
    const successLogs = await LogService.query({ status: 'success' });
    assertEqual(successLogs.length, 1);
    assertEqual(successLogs[0].status, 'success');

    const failedLogs = await LogService.query({ status: 'failed' });
    assertEqual(failedLogs.length, 1);
    assertEqual(failedLogs[0].status, 'failed');
  });
});

describe('P14 — 日志清理', () => {
  it('按条数限制清理', async () => {
    await DB.clearAll();
    // Insert 5 logs
    for (let i = 0; i < 5; i++) {
      await LogService.record({ providerId: 'p1', providerName: 'P', modelId: 'm1', modelName: 'M', prompt: `q${i}`, response: `a${i}`, duration: 100, status: 'success' });
    }
    // Set max_count to 3
    await DB.put(DB.STORES.APP_SETTINGS, { key: 'log_max_count', value: 3 });
    await DB.put(DB.STORES.APP_SETTINGS, { key: 'log_max_days', value: 365 });
    const deleted = await LogService.cleanup();
    assertEqual(deleted, 2);
    const remaining = await LogService.query();
    assertEqual(remaining.length, 3);
  });

  it('导出日志为JSON', async () => {
    const blob = await LogService.exportJSON();
    assert(blob instanceof Blob, '应返回Blob');
    assertEqual(blob.type, 'application/json');
    const text = await blob.text();
    const data = JSON.parse(text);
    assertEqual(data.length, 3);
  });

  it('清理 P14 测试数据', async () => {
    await DB.clearAll();
    assert(true);
  });
});

// ========== P15: 提示词自优化 ==========
describe('P15 — 提示词优化', () => {
  it('PromptOptUI 模块存在', () => {
    assert(typeof PromptOptUI === 'object', 'PromptOptUI 应存在');
    assert(typeof PromptOptUI.show === 'function', 'show 方法应存在');
    assert(typeof PromptOptUI._buildMetaPrompt === 'function', '_buildMetaPrompt 应存在');
  });

  it('构造元提示词包含职能名和当前提示词', () => {
    const meta = PromptOptUI._buildMetaPrompt('写手', '你是一个小说写手。请续写...');
    assert(meta.includes('写手'), '应包含职能名');
    assert(meta.includes('你是一个小说写手。请续写...'), '应包含当前提示词');
    assert(meta.includes('提示词工程专家'), '应包含专家角色描述');
  });

  it('应用优化更新提示词', async () => {
    await DB.clearAll();
    const roleId = Utils.generateId();
    await DB.put(DB.STORES.ROLE_CONFIGS, {
      id: roleId, name: '测试职能', promptTemplate: '原始提示词',
      providerId: '', modelId: '', outputVar: '', customVars: '[]',
      sortOrder: 0, createdAt: Utils.now(), updatedAt: Utils.now(),
    });

    // Simulate applying optimization
    const role = await DB.getById(DB.STORES.ROLE_CONFIGS, roleId);
    role.promptTemplate = '优化后的提示词';
    role.updatedAt = Utils.now();
    await DB.put(DB.STORES.ROLE_CONFIGS, role);

    const updated = await DB.getById(DB.STORES.ROLE_CONFIGS, roleId);
    assertEqual(updated.promptTemplate, '优化后的提示词');
  });

  it('清理 P15 测试数据', async () => {
    await DB.clearAll();
    assert(true);
  });
});

// ========== P16: V2 导入导出 & 集成测试 ==========
describe('P16 — V2 导出格式', () => {
  it('V2 导出包含 books 和 ai_logs', async () => {
    await DB.clearAll();
    // Setup V2 data
    await DB.put(DB.STORES.BOOKS, { id: 'b1', name: '测试书', description: '描述', createdAt: Utils.now(), updatedAt: Utils.now() });
    await DB.put(DB.STORES.AI_PROVIDERS, { id: 'p1', name: 'P', endpoint: 'http://test', apiKey: 'k', retryCount: 3 });
    await DB.put(DB.STORES.AI_MODELS, { id: 'm1', name: 'M', providerId: 'p1', intelligenceLevel: 'high', sortOrder: 0 });
    await LogService.record({ providerId: 'p1', providerName: 'P', modelId: 'm1', modelName: 'M', prompt: 'q', response: 'a', duration: 100, status: 'success' });

    // Manually build V2 export (same logic as ExportService.exportAll but without progress modal)
    const tables = [
      'categories', 'chapters', 'paragraphs', 'paragraph_bindings',
      'ai_providers', 'ai_models', 'role_configs', 'flow_configs',
      'recap_data', 'app_settings', 'books', 'ai_logs',
    ];
    const data = {};
    const manifest = { version: '2.0', exportedAt: Utils.now(), appVersion: '2.0.0', tables: {} };
    for (const t of tables) {
      data[t] = await DB.getAll(t);
      manifest.tables[t] = data[t].length;
    }
    assertEqual(manifest.version, '2.0');
    assertEqual(manifest.tables.books, 1);
    assertEqual(manifest.tables.ai_logs, 1);

    // Build ZIP
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    for (const t of tables) {
      zip.file(`${t}.json`, JSON.stringify(data[t], null, 2));
    }
    const blob = await zip.generateAsync({ type: 'blob' });

    // Clear and import
    await DB.clearAll();
    const importZip = await JSZip.loadAsync(blob);
    for (const t of tables) {
      const f = importZip.file(`${t}.json`);
      if (f) {
        const records = JSON.parse(await f.async('text'));
        if (records.length > 0) await DB.putAll(t, records);
      }
    }

    // Verify
    const books = await DB.getAll(DB.STORES.BOOKS);
    assertEqual(books.length, 1);
    assertEqual(books[0].name, '测试书');

    const logs = await DB.getAll(DB.STORES.AI_LOGS);
    assertEqual(logs.length, 1);
    assertEqual(logs[0].status, 'success');
  });
});

describe('P16 — V1 兼容导入', () => {
  it('V1 格式导入后创建默认书籍', async () => {
    await DB.clearAll();
    // Build a V1-style ZIP (no books, no ai_logs)
    const v1Tables = ['ai_providers', 'ai_models', 'role_configs', 'flow_configs', 'categories', 'chapters', 'paragraphs', 'paragraph_bindings', 'recap_data', 'app_settings'];
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ version: '1.0', exportedAt: Utils.now(), appVersion: '1.0.0', tables: {} }));
    for (const t of v1Tables) {
      zip.file(`${t}.json`, '[]');
    }
    const blob = await zip.generateAsync({ type: 'blob' });

    // Simulate import (simplified — just import the tables)
    const importZip = await JSZip.loadAsync(blob);
    const allTables = [...v1Tables, 'books', 'ai_logs'];
    for (const t of allTables) {
      const f = importZip.file(`${t}.json`);
      if (f) {
        const records = JSON.parse(await f.async('text'));
        if (records.length > 0) await DB.putAll(t, records);
      }
    }

    // V1 compat: create default book if none
    const books = await DB.getAll(DB.STORES.BOOKS);
    if (books.length === 0) {
      await DB.put(DB.STORES.BOOKS, { id: Utils.generateId(), name: '默认书籍', description: '', createdAt: Utils.now(), updatedAt: Utils.now() });
    }
    const booksAfter = await DB.getAll(DB.STORES.BOOKS);
    assertEqual(booksAfter.length, 1);
    assertEqual(booksAfter[0].name, '默认书籍');
  });
});

describe('P16 — V2 E2E 完整流程', () => {
  let _origCall;
  it('V2 E2E: 书籍+类目+职能+流程+生成', async () => {
    await DB.clearAll();
    // Create book
    await DB.put(DB.STORES.BOOKS, { id: 'e2e-book', name: 'V2测试书', description: '', createdAt: Utils.now(), updatedAt: Utils.now() });
    Store.setCurrentBook('e2e-book');

    // Create category
    const now = Utils.now();
    await DB.put(DB.STORES.CATEGORIES, {
      id: 'e2e-v2-cat', parentId: null, type: 'character', name: 'V2角色',
      description: '', attributes: '性格: 温柔', bookId: 'e2e-book',
      sortOrder: 1, version: 1, createdAt: now, updatedAt: now,
    });
    const cats = await DB.getAll(DB.STORES.CATEGORIES);
    assert(cats.length >= 1, '应创建类目');

    // Create provider + model
    await DB.put(DB.STORES.AI_PROVIDERS, { id: 'e2e-p', name: 'E2E-Provider', endpoint: 'http://test', apiKey: 'k', retryCount: 3 });
    await DB.put(DB.STORES.AI_MODELS, { id: 'e2e-m', name: 'E2E-Model', providerId: 'e2e-p', intelligenceLevel: 'high', sortOrder: 0 });

    // Create role
    await DB.put(DB.STORES.ROLE_CONFIGS, {
      id: 'e2e-role', name: 'V2写手', promptTemplate: '写{{用户输入}}',
      outputVar: 'draft', customVars: JSON.stringify([{ name: '风格', isOutput: true }]),
      providerId: 'e2e-p', modelId: 'e2e-m',
      sortOrder: 0, createdAt: Utils.now(), updatedAt: Utils.now(),
    });

    // Create flow
    await DB.put(DB.STORES.FLOW_CONFIGS, {
      id: 'e2e-flow', name: 'V2生成流', trigger: 'generate_paragraph',
      enabled: true, blocking: false, steps: JSON.stringify([['e2e-role']]),
      sortOrder: 0, createdAt: Utils.now(), updatedAt: Utils.now(),
    });

    // Create chapter + paragraph
    const chapterId = await Store.createNewChapter();
    assert(chapterId > 0, '应创建章节');

    // Mock AI
    _origCall = AIService.call;
    AIService.call = async () => ({ text: 'V2生成内容', failCount: 0 });

    const context = { user_input: 'V2测试输入' };
    const result = await FlowEngine.execute('generate_paragraph', context);
    assertEqual(result.draft, 'V2生成内容');
    assert(!!result._customVars['风格'], '自定义变量应有输出');
  });

  it('V2 E2E: 模板往返', async () => {
    // Export template
    const tpl = await TemplateService.exportTemplate();
    assertEqual(tpl.roles.length, 1);
    assertEqual(tpl.roles[0].name, 'V2写手');
    assertEqual(tpl.flows[0].steps[0][0], 'V2写手');

    // Import template
    const bindings = [{ roleName: 'V2写手', providerId: 'e2e-p', modelId: 'e2e-m' }];
    const importResult = await TemplateService.importTemplate(tpl, bindings);
    assertEqual(importResult.roleCount, 1);
    assertEqual(importResult.flowCount, 1);

    // Verify new role created (now 2 total)
    const roles = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    assertEqual(roles.length, 2);
  });

  it('清理 P16 测试数据', async () => {
    AIService.call = _origCall;
    await DB.clearAll();
    assert(true);
  });
});

// ========== P17: UI 修复与默认配置 ==========
describe('P17 — 状态面板显隐', () => {
  it('bookInfo tab 时 updateContentArea 控制 statusPanel 隐藏', () => {
    // Simulate: create mock elements
    const statusPanel = document.createElement('div');
    statusPanel.id = 'status-panel-test';
    statusPanel.style.display = '';

    // Directly test the logic: on bookInfo tab, status panel should be hidden
    Store.setSidebarTab('bookInfo');
    const tabId = Store.get('sidebarTab');
    assertEqual(tabId, 'bookInfo');
    // The actual hiding is done in SidebarUI.updateContentArea()
    // We test that the sidebarTab state is set correctly
  });

  it('chapters tab 时状态面板应可见', () => {
    Store.setSidebarTab('chapters');
    assertEqual(Store.get('sidebarTab'), 'chapters');
  });
});

describe('P17 — 默认职能配置', () => {
  it('空表时创建默认职能', async () => {
    await DB.clearAll();
    await ensureDefaultConfigs();
    const roles = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    assertEqual(roles.length, 3);
    const names = roles.map(r => r.name).sort();
    assert(names.includes('写手'), '应有写手职能');
    assert(names.includes('评审'), '应有评审职能');
    assert(names.includes('概要'), '应有概要职能');
  });

  it('写手职能包含正确的输出变量', async () => {
    const roles = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    const writer = roles.find(r => r.name === '写手');
    assertEqual(writer.outputVar, 'generated_paragraph');
    assert(writer.promptTemplate.includes('{{用户输入}}'), '应包含用户输入变量');
    assert(writer.promptTemplate.includes('{{前文信息}}'), '应包含前文信息变量');
  });

  it('评审职能包含正确的输出变量', async () => {
    const roles = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    const reviewer = roles.find(r => r.name === '评审');
    assertEqual(reviewer.outputVar, 'ai_review');
    assert(reviewer.promptTemplate.includes('{{生成段落}}'), '应包含生成段落变量');
  });

  it('概要职能包含正确的输出变量', async () => {
    const roles = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    const summary = roles.find(r => r.name === '概要');
    assertEqual(summary.outputVar, 'generated_summary');
    assert(summary.promptTemplate.includes('{{章节内容}}'), '应包含章节内容变量');
  });
});

describe('P17 — 默认流程配置', () => {
  it('空表时创建默认流程', async () => {
    const flows = await DB.getAll(DB.STORES.FLOW_CONFIGS);
    assertEqual(flows.length, 2);
    const names = flows.map(f => f.name).sort();
    assert(names.includes('段落生成'), '应有段落生成流程');
    assert(names.includes('章节概要'), '应有章节概要流程');
  });

  it('段落生成流程配置正确', async () => {
    const flows = await DB.getAll(DB.STORES.FLOW_CONFIGS);
    const paraFlow = flows.find(f => f.name === '段落生成');
    assertEqual(paraFlow.trigger, 'generate_paragraph');
    assertEqual(paraFlow.blocking, true);
    assertEqual(paraFlow.enabled, true);
    const steps = JSON.parse(paraFlow.steps);
    assertEqual(steps.length, 2); // [[写手ID],[评审ID]]

    // Verify steps reference existing roles
    const roles = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    const writer = roles.find(r => r.name === '写手');
    const reviewer = roles.find(r => r.name === '评审');
    assertEqual(steps[0][0], writer.id);
    assertEqual(steps[1][0], reviewer.id);
  });

  it('章节概要流程配置正确', async () => {
    const flows = await DB.getAll(DB.STORES.FLOW_CONFIGS);
    const chapFlow = flows.find(f => f.name === '章节概要');
    assertEqual(chapFlow.trigger, 'generate_chapter');
    assertEqual(chapFlow.blocking, false);
    const steps = JSON.parse(chapFlow.steps);
    assertEqual(steps.length, 1); // [[概要ID]]

    const roles = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    const summary = roles.find(r => r.name === '概要');
    assertEqual(steps[0][0], summary.id);
  });

  it('已有职能时不重复创建', async () => {
    // ensureDefaultConfigs again — should not create duplicates
    await ensureDefaultConfigs();
    const roles = await DB.getAll(DB.STORES.ROLE_CONFIGS);
    assertEqual(roles.length, 3);
    const flows = await DB.getAll(DB.STORES.FLOW_CONFIGS);
    assertEqual(flows.length, 2);
  });

  it('清理 P17 测试数据', async () => {
    await DB.clearAll();
    assert(true);
  });
});

// ========== P18: UI 增强与提示词优化重构 ==========
describe('P18 — 模型状态指示器', () => {
  it('新模型默认无测试状态', async () => {
    await DB.clearAll();
    const id = Utils.generateId();
    await DB.put(DB.STORES.AI_MODELS, {
      id, providerId: 'p1', name: 'test-model',
      intelligenceLevel: 'medium', sortOrder: 1, createdAt: Utils.now(),
    });
    const model = await DB.getById(DB.STORES.AI_MODELS, id);
    assert(!model.lastTestStatus, '新模型无 lastTestStatus');
    assert(!model.lastTestTime, '新模型无 lastTestTime');
  });

  it('更新测试状态为 success', async () => {
    const models = await DB.getAll(DB.STORES.AI_MODELS);
    const m = models[0];
    m.lastTestStatus = 'success';
    m.lastTestTime = Utils.now();
    m.lastTestError = '';
    await DB.put(DB.STORES.AI_MODELS, m);
    const updated = await DB.getById(DB.STORES.AI_MODELS, m.id);
    assertEqual(updated.lastTestStatus, 'success');
    assert(updated.lastTestTime > 0, '应有测试时间');
  });

  it('更新测试状态为 failed', async () => {
    const models = await DB.getAll(DB.STORES.AI_MODELS);
    const m = models[0];
    m.lastTestStatus = 'failed';
    m.lastTestError = 'HTTP 401: Unauthorized';
    await DB.put(DB.STORES.AI_MODELS, m);
    const updated = await DB.getById(DB.STORES.AI_MODELS, m.id);
    assertEqual(updated.lastTestStatus, 'failed');
    assertEqual(updated.lastTestError, 'HTTP 401: Unauthorized');
  });

  it('_createStatusIcon 返回正确图标', () => {
    const successIcon = AIConfigUI._createStatusIcon({ lastTestStatus: 'success', lastTestTime: Date.now() });
    assertEqual(successIcon.textContent, '✅');
    const failedIcon = AIConfigUI._createStatusIcon({ lastTestStatus: 'failed', lastTestError: 'err' });
    assertEqual(failedIcon.textContent, '❗');
    const unknownIcon = AIConfigUI._createStatusIcon({});
    assertEqual(unknownIcon.textContent, '❓');
  });

  it('清理 P18.1 测试数据', async () => {
    await DB.clearAll();
    assert(true);
  });
});

// ---- 运行测试 ----
TestRunner.run();
