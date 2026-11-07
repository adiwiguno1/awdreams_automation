const {
  insertKeluarga,
  insertAnggotaKeluarga,
  insertBansos,
  withTransaction
} = require('../database/db');
const {
  MAIN_TABLE,
  KELUARGA_XPATHS,
  ANGGOTA_TABLE_XPATH,
  BANSOS_TAB_XPATH,
  SCRIPTS
} = require('./webviewScripts');

/**
 * Drives the app's own <webview> guest (Electron webContents) instead of a
 * separate Playwright browser. All DOM work happens inside the visible page,
 * so the user logs in once and watches the automation run.
 */
class WebviewScraper {
  static isValidKey(value) {
    return typeof value === 'string' && /^\d{16}$/.test(value.trim());
  }

  static looksMasked(value) {
    return typeof value !== 'string' || value.trim() === '' || value.includes('*');
  }

  static backoffDelay(attempt, baseMs = 2000) {
    return baseMs * Math.pow(2, attempt - 1);
  }

  constructor(mainWindow, options = {}) {
    this.mainWindow = mainWindow;
    this.guest = null;
    this.status = 'idle';
    this.isRunning = false;
    this.isPaused = false;
    this.isStopped = false;
    this.starting = null;
    this.sleep = options.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.transactionRunner = options.transactionRunner || withTransaction;
  }

  attach(guest) {
    this.guest = guest;
  }

  detach() {
    this.guest = null;
  }

  sendLog(message) {
    console.log(`[WebviewScraper] ${message}`);
    try {
      const contents = this.mainWindow && this.mainWindow.webContents;
      if (!contents) return;
      if (typeof contents.isDestroyed === 'function' && contents.isDestroyed()) return;
      if (typeof contents.send === 'function') contents.send('log-message', message);
    } catch (_) {
      // Logging must never break the scraper.
    }
  }

  emitStatus(status) {
    this.status = status;
    try {
      const contents = this.mainWindow && this.mainWindow.webContents;
      if (!contents) return;
      if (typeof contents.isDestroyed === 'function' && contents.isDestroyed()) return;
      if (typeof contents.send === 'function') contents.send('scraper:status', status);
    } catch (_) {
      // Ignore during shutdown.
    }
  }

  async evalScript(fn, arg) {
    if (!this.guest || (typeof this.guest.isDestroyed === 'function' && this.guest.isDestroyed())) {
      throw new Error('Webview belum terhubung.');
    }
    const payload = arg === undefined ? null : arg;
    const code = `(${fn.toString()})(${JSON.stringify(payload)})`;
    return this.guest.executeJavaScript(code, true);
  }

  async start() {
    if (this.isRunning && this.isPaused) {
      this.isPaused = false;
      this.emitStatus('running');
      this.sendLog('Scraper dilanjutkan.');
      return;
    }
    if (this.isRunning) return;
    if (this.starting) return this.starting;

    this.starting = this.runSession();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  async runSession() {
    this.isRunning = true;
    this.isPaused = false;
    this.isStopped = false;
    this.emitStatus('starting');

    try {
      this.sendLog('Menunggu tabel data BNBA muncul (maks. 5 menit)...');
      await this.waitForTable(MAIN_TABLE, 300000);
      this.emitStatus('running');
      this.sendLog('Tabel ditemukan! Memulai siklus scraping...');

      let pageNumber = 1;
      while (!this.isStopped) {
        this.sendLog(`--- Halaman ${pageNumber} ---`);
        await this.runScrapeLoop();

        if (this.isStopped) break;
        const moved = await this.goToNextPage();
        if (!moved) break;
        pageNumber++;
      }

      this.sendLog(this.isStopped ? 'Scraping dihentikan.' : 'Selesai memproses seluruh halaman!');
      this.emitStatus('idle');
    } catch (err) {
      if (this.isStopped) {
        this.sendLog('Scraping dihentikan.');
        this.emitStatus('idle');
      } else {
        this.sendLog(`[ERROR] Scraper berhenti: ${err.message}`);
        this.emitStatus('error');
      }
    } finally {
      this.isRunning = false;
    }
  }

  async pause() {
    if (!this.isRunning) return;
    this.isPaused = !this.isPaused;
    this.emitStatus(this.isPaused ? 'paused' : 'running');
    this.sendLog(this.isPaused ? 'Scraper di-pause.' : 'Scraper dilanjutkan.');
  }

  async stop() {
    this.isStopped = true;
    this.isPaused = false;
    this.emitStatus('stopping');
    this.sendLog('Sinyal Stop diterima. Menghentikan siklus...');

    if (this.starting) {
      try {
        await this.starting;
      } catch (_) {
        // runSession already reported the failure.
      }
    }

    this.isRunning = false;
    this.emitStatus('idle');
  }

  async countRows() {
    return await this.evalScript(SCRIPTS.rowCount, MAIN_TABLE);
  }

  async waitForTable(tableSelector, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.isStopped) throw new Error('Dihentikan oleh pengguna.');
      const count = await this.evalScript(SCRIPTS.rowCount, tableSelector);
      if (count > 0) return count;
      await this.sleep(1000);
    }
    throw new Error(
      'Tabel tidak ditemukan. Pastikan Anda sudah login dan berada di halaman Data BNBA/DTSEN dengan filter terisi.'
    );
  }

  async waitWhilePaused() {
    while (this.isPaused && !this.isStopped) {
      await this.sleep(1000);
    }
  }

  async runScrapeLoop() {
    const totalRows = await this.countRows();
    this.sendLog(`Ditemukan ${totalRows} baris data keluarga.`);

    for (let i = 0; i < totalRows; i++) {
      if (this.isStopped) break;
      await this.waitWhilePaused();
      if (this.isStopped) break;

      this.sendLog(`Memproses baris ke-${i + 1} dari ${totalRows}...`);

      try {
        await this.retryWithNotification(async () => {
          await this.transactionRunner(async () => this.processFamilyRow(i));
        }, `Scraping baris ke-${i + 1}`);
      } catch (err) {
        // One bad row must never abort the whole run.
        this.sendLog(`[ERROR] Baris ke-${i + 1} dilewati: ${err.message}`);
      }
    }

    this.sendLog('Selesai memproses seluruh baris di halaman ini.');
  }

  async goToNextPage() {
    const state = await this.evalScript(SCRIPTS.pagination);
    if (!state || !state.exists || state.disabled) return false;

    const clicked = await this.evalScript(SCRIPTS.clickNextPage);
    if (!clicked) return false;

    await this.sleep(1500);
    try {
      await this.waitForTable(MAIN_TABLE, 30000);
    } catch (_) {
      return false;
    }
    return true;
  }

  async processFamilyRow(index) {
    const opened = await this.evalScript(SCRIPTS.clickDetail, { table: MAIN_TABLE, index });
    if (!opened || !opened.ok) {
      throw new Error(`Detail keluarga tidak bisa dibuka (${(opened && opened.reason) || 'unknown'}).`);
    }
    await this.sleep(1000);

    try {
      const data = await this.evalScript(SCRIPTS.readFamily, {
        xpaths: KELUARGA_XPATHS,
        anggotaTableXpath: ANGGOTA_TABLE_XPATH,
        bansosTabXpath: BANSOS_TAB_XPATH
      });

      // Synthetic events usually unmask; if not, fall back to real OS-level
      // input at the element's coordinates.
      if (WebviewScraper.looksMasked(data.keluarga.nokk) && data.nokkRect) {
        await this.realHover(data.nokkRect);
        data.keluarga.nokk = await this.evalScript(SCRIPTS.textByXpath, { xpath: KELUARGA_XPATHS.nokk });
      }
      for (const anggota of data.anggota) {
        if (WebviewScraper.looksMasked(anggota.nik) && anggota.nikRect) {
          await this.realHover(anggota.nikRect);
          const fresh = await this.evalScript(SCRIPTS.readAnggotaRow, {
            anggotaTableXpath: ANGGOTA_TABLE_XPATH,
            index: anggota.index
          });
          if (fresh) anggota.nik = fresh.nik;
        }
      }

      const nokk = (data.keluarga.nokk || '').trim();
      if (!WebviewScraper.isValidKey(nokk)) {
        throw new Error(`NOKK tidak valid setelah unmask: "${data.keluarga.nokk}".`);
      }
      data.keluarga.nokk = nokk;

      this.sendLog(`Scraped NOKK: ${nokk} - ${data.keluarga.nama_kepala_keluarga}`);
      await insertKeluarga(data.keluarga);

      for (const anggota of data.anggota) {
        if (!WebviewScraper.isValidKey(anggota.nik)) {
          throw new Error(`NIK anggota "${anggota.nama}" tidak valid setelah unmask: "${anggota.nik}".`);
        }
        await insertAnggotaKeluarga({
          nokk,
          nik: anggota.nik.trim(),
          nama: anggota.nama,
          hubungan_keluarga: anggota.hubungan_keluarga,
          pekerjaan: anggota.pekerjaan
        });
      }

      if (!data.bansosTableFound) {
        throw new Error('Tabel riwayat bansos tidak ditemukan (selector berubah?).');
      }
      for (const bansos of data.bansos) {
        await insertBansos({ nokk, ...bansos });
      }
    } finally {
      // Always close, even on failure: a stuck modal blocks the retry and the
      // next row with a backdrop.
      try {
        await this.evalScript(SCRIPTS.closeModals);
      } catch (_) {
        // Page may have navigated away.
      }
    }
  }

  async realHover(rect) {
    if (!this.guest || typeof this.guest.sendInputEvent !== 'function') return;
    const x = Math.round(rect.x);
    const y = Math.round(rect.y);

    this.guest.sendInputEvent({ type: 'mouseMove', x, y });
    await this.sleep(150);
    this.guest.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    this.guest.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    await this.sleep(350);
  }

  async retryWithNotification(actionFn, contextName, maxRetries = 3, baseDelayMs = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await actionFn();
        return;
      } catch (err) {
        this.sendLog(
          `[PERINGATAN] Gagal pada ${contextName} (Percobaan ${attempt}/${maxRetries}): ${err.message}`
        );
        if (attempt === maxRetries) {
          this.sendLog(`[ERROR] Melewati ${contextName} setelah ${maxRetries} kali kegagalan.`);
          throw err;
        }
        const delay = WebviewScraper.backoffDelay(attempt, baseDelayMs);
        this.sendLog(`Menunggu ${delay} ms sebelum mencoba lagi...`);
        await this.sleep(delay);
      }
    }
  }
}

module.exports = WebviewScraper;
