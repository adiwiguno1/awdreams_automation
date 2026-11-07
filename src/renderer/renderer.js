document.addEventListener('DOMContentLoaded', () => {
  const btnStart = document.getElementById('btn-start');
  const btnPause = document.getElementById('btn-pause');
  const btnStop = document.getElementById('btn-stop');
  const logIndicator = document.getElementById('log-indicator');
  const webview = document.getElementById('siks-webview');

  function updateLog(msg) {
    if (logIndicator) {
      logIndicator.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    }
  }

  function renderStatus(status) {
    switch (status) {
      case 'starting':
      case 'running':
        btnStart.disabled = true;
        btnPause.disabled = false;
        btnStop.disabled = false;
        btnPause.textContent = 'Pause';
        break;
      case 'paused':
        btnStart.disabled = true;
        btnPause.disabled = false;
        btnStop.disabled = false;
        btnPause.textContent = 'Resume';
        break;
      case 'stopping':
        btnStart.disabled = true;
        btnPause.disabled = true;
        btnStop.disabled = true;
        break;
      case 'error':
      case 'idle':
      default:
        btnStart.disabled = false;
        btnPause.disabled = true;
        btnStop.disabled = true;
        btnPause.textContent = 'Pause';
        break;
    }
  }

  async function startScraper() {
    updateLog('Memulai scraper pada webview...');

    let guestId;
    try {
      guestId = webview.getWebContentsId();
    } catch (_) {
      // Webview guest not created yet (page still loading).
    }

    if (typeof guestId !== 'number') {
      updateLog('[ERROR] Webview SIKS-NG belum siap. Tunggu halaman selesai dimuat.');
      return;
    }

    try {
      const result = await window.api.startScraper({ guestId });
      if (!result || !result.ok) {
        updateLog(`[ERROR] Gagal memulai: ${(result && result.error) || 'tidak diketahui'}`);
      }
    } catch (err) {
      updateLog(`[ERROR] Gagal memulai: ${err.message}`);
    }
  }

  btnStart.addEventListener('click', startScraper);

  btnPause.addEventListener('click', async () => {
    try {
      const result = await window.api.pauseScraper();
      if (!result || !result.ok) {
        updateLog(`[ERROR] ${(result && result.error) || 'Gagal pause/resume'}`);
      }
    } catch (err) {
      updateLog(`[ERROR] ${err.message}`);
    }
  });

  btnStop.addEventListener('click', async () => {
    updateLog('Menghentikan scraper...');
    try {
      const result = await window.api.stopScraper();
      if (!result || !result.ok) {
        updateLog(`[ERROR] ${(result && result.error) || 'Gagal berhenti'}`);
      }
    } catch (err) {
      updateLog(`[ERROR] ${err.message}`);
    }
  });

  window.api.onLogMessage(updateLog);
  window.api.onScraperStatus(renderStatus);

  window.api.onMenuCommand((command) => {
    if (command && command.type === 'scrap' && command.mode === 'keluarga') {
      startScraper();
    }
  });

  window.api.onBrowserAction((action) => {
    if (!webview) return;
    if (action === 'reload') webview.reload();
    if (action === 'back' && webview.canGoBack()) webview.goBack();
    if (action === 'forward' && webview.canGoForward()) webview.goForward();
  });

  renderStatus('idle');
});
