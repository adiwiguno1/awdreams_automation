// Regression guard for runtime compatibility inside Electron's bundled Node:
// - sqlite3 is N-API, so it must load without an electron-rebuild step.
// - The app's own modules must be requireable in the main process.
// Playwright is intentionally NOT used: automation runs in the app's <webview>.
const { app } = require('electron');

let code = 0;
const nodeVersion = process.versions.node;

function check(label, fn) {
  try {
    fn();
    console.log(`${label}_OK`);
  } catch (err) {
    console.error(`${label}_FAIL ${err.message}`);
    code = 1;
  }
}

check('SQLITE3_LOAD', () => require('sqlite3'));
check('DB_MODULE_LOAD', () => require('../src/database/db'));
check('SCRAPER_MODULE_LOAD', () => {
  const WebviewScraper = require('../src/scraper/webviewScraper');
  if (typeof WebviewScraper !== 'function') throw new Error('WebviewScraper export is not a class');
  if (!WebviewScraper.isValidKey('3201012345678901')) throw new Error('isValidKey broken under Electron');
});
check('SCRIPTS_MODULE_LOAD', () => {
  const { SCRIPTS } = require('../src/scraper/webviewScripts');
  for (const [name, fn] of Object.entries(SCRIPTS)) {
    new Function(`return (${fn.toString()})`);
    if (typeof fn !== 'function') throw new Error(`${name} is not a function`);
  }
});

console.log(`RUNTIME node=${nodeVersion} electron=${process.versions.electron}`);

// Success goes through app.quit() so Electron tears down native modules
// cleanly. A failure must surface a real non-zero exit code for CI, which
// only app.exit() provides (process.exitCode is ignored by app.quit()).
app.whenReady().then(() => (code === 0 ? app.quit() : app.exit(code)));
