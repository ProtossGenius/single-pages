/* 浏览器测试运行器 — 使用 puppeteer-core + Chrome headless */
const puppeteer = require('/tmp/node_modules/puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text());
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:8765/test.html', { waitUntil: 'networkidle0', timeout: 15000 });

  // Wait for tests to complete
  await page.waitForFunction(() => {
    const el = document.getElementById('test-summary');
    return el && el.textContent.indexOf('运行中') === -1;
  }, { timeout: 15000 });

  const summary = await page.$eval('#test-summary', el => el.textContent);
  console.log('\n=== 测试结果 ===');
  console.log(summary);

  // Get individual results
  const results = await page.$$eval('.test-item', items =>
    items.map(item => ({
      status: item.classList.contains('pass') ? '✓' : '✗',
      text: item.querySelector('.test-name')?.textContent || ''
    }))
  );

  for (const r of results) {
    console.log(r.status + ' ' + r.text);
  }

  // Get any errors
  const errors = await page.$$eval('.test-error', items => items.map(i => i.textContent));
  if (errors.length > 0) {
    console.log('\n=== 失败详情 ===');
    for (const e of errors) console.log('  ' + e);
  }

  await browser.close();

  // Exit with error code if there are failures
  if (summary.indexOf('失败') !== -1) {
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(1); });
