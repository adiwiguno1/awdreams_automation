// Electron smoke test: boots a real BrowserWindow with the app's preload and
// renderer, then exits. Run with:
//   node_modules\electron\dist\electron.exe tests\smoke.electron.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  const fail = (msg) => {
    console.error('SMOKE_FAIL:', msg);
    app.exit(1);
  };

  win.webContents.on('render-process-gone', (_e, details) => fail(`renderer gone: ${details.reason}`));
  win.webContents.on('preload-error', (_e, p, err) => fail(`preload error: ${err.message}`));
  win.webContents.once('did-finish-load', async () => {
    try {
      const hasApi = await win.webContents.executeJavaScript('typeof window.api === "object" && typeof window.api.startScraper === "function"');
      const hasButtons = await win.webContents.executeJavaScript(
        '["btn-start","btn-pause","btn-stop","log-indicator","siks-webview"].every(id => !!document.getElementById(id))'
      );
      if (!hasApi) return fail('window.api not exposed');
      if (!hasButtons) return fail('UI elements missing');
      console.log('SMOKE_OK');
      setTimeout(() => app.exit(0), 500);
    } catch (err) {
      fail(err.message);
    }
  });

  win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
});
