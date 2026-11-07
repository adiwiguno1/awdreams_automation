// Integration smoke for the "automation runs inside the <webview>" design:
// main process -> guest webContents -> executeJavaScript -> DOM click -> read.
// Run with: electron tests/smoke.webview.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { SCRIPTS, MAIN_TABLE } = require('../src/scraper/webviewScripts');

const fixture = path.join(__dirname, 'fixtures', 'webview-host.html');
let settled = false;

function finish(code, message) {
  if (settled) return;
  settled = true;
  if (message) console.log(message);
  app.exit(code);
}

setTimeout(() => finish(1, 'WEBVIEW_SMOKE_TIMEOUT'), 20000);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      webviewTag: true
    }
  });

  win.webContents.on('did-attach-webview', (_event, guest) => {
    guest.once('dom-ready', async () => {
      try {
        const rowCount = await guest.executeJavaScript(
          `(${SCRIPTS.rowCount.toString()})(${JSON.stringify(MAIN_TABLE)})`,
          true
        );
        if (rowCount !== 1) return finish(1, `WEBVIEW_SMOKE_FAIL rowCount=${rowCount}`);

        const clicked = await guest.executeJavaScript(
          `(${SCRIPTS.clickDetail.toString()})(${JSON.stringify({ table: MAIN_TABLE, index: 0 })})`,
          true
        );
        if (!clicked || !clicked.ok) return finish(1, `WEBVIEW_SMOKE_FAIL click=${JSON.stringify(clicked)}`);

        await new Promise((r) => setTimeout(r, 300));
        const out = await guest.executeJavaScript(
          `document.getElementById('out').textContent`,
          true
        );
        if (out !== 'CLICKED') return finish(1, `WEBVIEW_SMOKE_FAIL out=${out}`);

        finish(0, `WEBVIEW_SMOKE_OK rows=${rowCount} out=${out}`);
      } catch (err) {
        finish(1, `WEBVIEW_SMOKE_FAIL ${err.message}`);
      }
    });
  });

  await win.loadFile(fixture);
});
