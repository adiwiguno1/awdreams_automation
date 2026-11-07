const test = require('node:test');
const assert = require('node:assert');
const WebviewScraper = require('../src/scraper/webviewScraper');
const { SCRIPTS, KELUARGA_XPATHS } = require('../src/scraper/webviewScripts');

function makeWindow() {
  const logs = [];
  const statuses = [];
  return {
    logs,
    statuses,
    mainWindow: {
      webContents: {
        send: (channel, payload) => {
          if (channel === 'log-message') logs.push(payload);
          if (channel === 'scraper:status') statuses.push(payload);
        }
      }
    }
  };
}

test('isValidKey accepts 16-digit NOKK/NIK and rejects masks or empties', () => {
  assert.strictEqual(WebviewScraper.isValidKey('3201012345678901'), true);
  assert.strictEqual(WebviewScraper.isValidKey('****'), false);
  assert.strictEqual(WebviewScraper.isValidKey(''), false);
  assert.strictEqual(WebviewScraper.isValidKey('3201012345'), false);
  assert.strictEqual(WebviewScraper.isValidKey('320101234567890x'), false);
  assert.strictEqual(WebviewScraper.isValidKey(undefined), false);
});

test('looksMasked detects asterisks and empty values', () => {
  assert.strictEqual(WebviewScraper.looksMasked('****'), true);
  assert.strictEqual(WebviewScraper.looksMasked('**** **** **** 0001'), true);
  assert.strictEqual(WebviewScraper.looksMasked(''), true);
  assert.strictEqual(WebviewScraper.looksMasked('3201012345678901'), false);
});

test('backoffDelay grows exponentially from the base delay', () => {
  assert.strictEqual(WebviewScraper.backoffDelay(1, 2000), 2000);
  assert.strictEqual(WebviewScraper.backoffDelay(2, 2000), 4000);
  assert.strictEqual(WebviewScraper.backoffDelay(3, 2000), 8000);
});

test('every in-page script is a self-contained expression that parses', () => {
  for (const [name, fn] of Object.entries(SCRIPTS)) {
    assert.strictEqual(typeof fn, 'function', `${name} must be a function`);
    const source = `(${fn.toString()})`;
    assert.doesNotThrow(() => new Function(`return ${source}`), `${name} must parse`);
  }
});

test('keluarga xpaths cover every column required by the schema', () => {
  const required = [
    'nokk',
    'nama',
    'alamat',
    'rt',
    'rw',
    'provinsi',
    'kabupaten',
    'kecamatan',
    'kelurahan',
    'desil',
    'status_perlinsos'
  ];
  for (const key of required) {
    assert.ok(KELUARGA_XPATHS[key], `missing xpath for ${key}`);
    assert.match(KELUARGA_XPATHS[key], /^\/html\/body\//);
  }
});

test('evalScript refuses to run without an attached webview', async () => {
  const { mainWindow } = makeWindow();
  const scraper = new WebviewScraper(mainWindow);
  await assert.rejects(() => scraper.evalScript(SCRIPTS.rowCount, 'x'), /belum terhubung/i);
});

test('evalScript serializes arguments into the page call', async () => {
  const { mainWindow } = makeWindow();
  const scraper = new WebviewScraper(mainWindow);
  const calls = [];
  scraper.attach({
    executeJavaScript: async (code, userGesture) => {
      calls.push({ code, userGesture });
      return 7;
    }
  });

  const result = await scraper.evalScript(SCRIPTS.rowCount, '.table');
  assert.strictEqual(result, 7);
  assert.strictEqual(calls.length, 1);
  assert.ok(calls[0].code.startsWith('('), 'expression must be parenthesized');
  assert.ok(calls[0].code.endsWith('(".table")'), 'argument must be serialized');
  assert.strictEqual(calls[0].userGesture, true);
});

test('runScrapeLoop skips a failing row and continues with the rest', async () => {
  const { mainWindow, logs } = makeWindow();
  const scraper = new WebviewScraper(mainWindow, {
    transactionRunner: async (fn) => fn(),
    sleep: async () => {}
  });

  const processed = [];
  scraper.countRows = async () => 3;
  scraper.processFamilyRow = async (index) => {
    if (!processed.includes(index)) processed.push(index);
    if (index === 1) throw new Error('modal tidak terbuka');
  };

  await scraper.runScrapeLoop();

  assert.deepStrictEqual(processed, [0, 1, 2]);
  assert.ok(logs.some((l) => l.includes('Baris ke-2 dilewati')));
  assert.ok(logs.some((l) => l.includes('Selesai memproses')));
});

test('retryWithNotification retries, backs off, and reports clearly on failure', async () => {
  const { mainWindow, logs } = makeWindow();
  const delays = [];
  const scraper = new WebviewScraper(mainWindow, {
    sleep: async (ms) => delays.push(ms)
  });

  let attempts = 0;
  await assert.rejects(
    () =>
      scraper.retryWithNotification(
        async () => {
          attempts++;
          throw new Error('Simulated DOM Failure');
        },
        'Baris uji',
        2,
        50
      ),
    /Simulated DOM Failure/
  );

  assert.strictEqual(attempts, 2);
  assert.deepStrictEqual(delays, [50]);
  assert.ok(logs.some((l) => l.includes('Percobaan 1/2')));
  assert.ok(logs.some((l) => l.includes('Percobaan 2/2')));
  assert.ok(logs.some((l) => l.includes('Melewati Baris uji')));
});

test('status transitions are emitted to the renderer', async () => {
  const { mainWindow, statuses } = makeWindow();
  const scraper = new WebviewScraper(mainWindow);

  scraper.emitStatus('starting');
  scraper.emitStatus('running');
  scraper.emitStatus('idle');

  assert.deepStrictEqual(statuses, ['starting', 'running', 'idle']);
  assert.strictEqual(scraper.status, 'idle');
});
