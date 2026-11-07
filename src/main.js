const { app, BrowserWindow, Menu, ipcMain, webContents, dialog } = require('electron');
const path = require('path');
const { initDb, closeDb } = require('./database/db');
const WebviewScraper = require('./scraper/webviewScraper');

let mainWindow;
let scraper;
let dbReady = false;
let quitting = false;

function dataDir() {
  return path.join(app.getPath('userData'), 'data');
}

async function ensureDb() {
  if (dbReady) return;
  await initDb(path.join(dataDir(), 'siks_data.db'));
  dbReady = true;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (scraper) {
    scraper.mainWindow = mainWindow;
  }

  setupMenu();
}

function sendToRenderer(channel, payload) {
  if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function setupMenu() {
  const template = [
    {
      label: 'File',
      submenu: [{ label: 'Exit', role: 'quit' }]
    },
    {
      label: 'Browser',
      submenu: [
        { label: 'Reload', click: () => sendToRenderer('browser-action', 'reload') },
        { label: 'Back', click: () => sendToRenderer('browser-action', 'back') },
        { label: 'Forward', click: () => sendToRenderer('browser-action', 'forward') }
      ]
    },
    {
      label: 'Scrap',
      submenu: [
        { label: 'Keluarga', click: () => sendToRenderer('menu-command', { type: 'scrap', mode: 'keluarga' }) },
        { label: 'Verkom', click: () => notImplemented('Scrap > Verkom') },
        { label: 'CSV Fasdik', click: () => notImplemented('Scrap > CSV Fasdik') },
        { label: 'Final Closing', click: () => notImplemented('Scrap > Final Closing') }
      ]
    },
    {
      label: 'Automation',
      submenu: [
        { label: 'Verkom Fasdik', click: () => notImplemented('Automation > Verkom Fasdik') },
        { label: 'Verkom Faskes', click: () => notImplemented('Automation > Verkom Faskes') },
        { label: 'Verif KKS', click: () => notImplemented('Automation > Verif KKS') },
        { label: 'Verif Transaksi', click: () => notImplemented('Automation > Verif Transaksi') }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function notImplemented(name) {
  sendToRenderer('log-message', `[INFO] ${name} belum diimplementasikan pada versi ini.`);
}

app.whenReady().then(async () => {
  try {
    await ensureDb();
  } catch (err) {
    dialog.showErrorBox('Gagal membuka database', err.message);
    app.exit(1);
    return;
  }

  createWindow();
  scraper = new WebviewScraper(mainWindow);

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      try {
        await ensureDb();
      } catch (err) {
        dialog.showErrorBox('Gagal membuka database', err.message);
        return;
      }
      createWindow();
    }
  });
}).catch((err) => {
  dialog.showErrorBox('Gagal memulai aplikasi', err.message);
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;

  try {
    if (scraper) await scraper.stop();
  } catch (_) {
    // Already stopped.
  }
  try {
    await closeDb();
    dbReady = false;
  } catch (_) {
    // Already closed.
  }

  app.exit(0);
});

ipcMain.handle('scraper:start', async (_event, payload = {}) => {
  if (!scraper) return { ok: false, error: 'Scraper belum siap.' };

  const guestId = payload.guestId;
  if (typeof guestId !== 'number') {
    return { ok: false, error: 'Webview belum siap. Tunggu halaman SIKS-NG selesai dimuat.' };
  }

  const guest = webContents.fromId(guestId);
  if (!guest || guest.isDestroyed()) {
    return { ok: false, error: 'Webview tidak ditemukan. Muat ulang aplikasi.' };
  }

  try {
    scraper.attach(guest);
    // start() resolves only after the whole session finishes, so do not await
    // it here: progress and errors arrive through `scraper:status`/`log-message`.
    scraper.start().catch((err) => {
      sendToRenderer('log-message', `[ERROR] Scraper berhenti: ${err.message}`);
    });
    return { ok: true, status: scraper.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('scraper:pause', async () => {
  if (!scraper) return { ok: false, error: 'Scraper belum siap.' };
  try {
    await scraper.pause();
    return { ok: true, status: scraper.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('scraper:stop', async () => {
  if (!scraper) return { ok: false, error: 'Scraper belum siap.' };
  try {
    await scraper.stop();
    scraper.detach();
    return { ok: true, status: scraper.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
