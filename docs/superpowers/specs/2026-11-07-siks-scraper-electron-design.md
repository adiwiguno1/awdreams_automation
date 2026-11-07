# Design Document: SIKS-NG Desktop Scraper & Management App

> **Goal:** Build an Electron desktop application with persistent login state, SQLite database (`keluarga`, `anggota_keluarga`, `bansos`), robust Playwright background scraping with retry mechanisms, menu bar controls, and UI log indicators for portal siks.kemensos.go.id.

## Intent and Why
Local management and automated scraping of social assistance data (DTKS/BNBA) from `siks.kemensos.go.id` requires a stable desktop environment where users can log in once (retaining cookies/session state across restarts), view data, and execute reliable automated scraping loops with clear progress and error recovery (retry logic).

## Goals, Non-Goals, and Anti-Goals
- **Goals:**
  - Electron.js desktop app with custom menu bar (File, Browser, Scrap, Automation) and control panel (Start, Pause, Stop, Log viewer).
  - Built-in `<webview>` for manual navigation and login at `https://siks.kemensos.go.id`.
  - Persistent browser context / session storage so login state is remembered across application restarts.
  - SQLite database using `sqlite3` with tables: `keluarga`, `anggota_keluarga`, `bansos`.
  - Playwright background scraping automation with unmasking actions (hover/click for NOKK and NIK), modal detail extraction, pagination/row iteration, and automatic retry with notifications on failure.
- **Non-Goals:**
  - Cloud deployment or web-accessible server interface.
  - Automated CAPTCHA solving (users log in manually via the embedded webview).

## Constraints
- Platform target: desktop only — Windows, macOS, dan Linux (bukan mobile). Dipaketkan via electron-builder.
- Database: SQLite3.
- DOM selectors & XPaths as specified in user requirements.
- Retry otomatis 3x per baris dengan notifikasi log yang jelas.
- Sesi login persisten: cookie disalin dari webview ke Playwright + profil Chromium persisten di `user_data/`.

## Approaches Considered
1. **Puppeteer + Native BrowserWindow:** Lighter weight, but Playwright offers superior locator handling, auto-waiting, and robust browser context management for complex React/MUI tables.
2. **Electron + Playwright (Connected via CDP or Standalone Context with Persistent User Data Directory):** Selected because it allows sharing session state (cookies/storage) between the Electron UI `<webview>` and the Playwright scraper runner using a persistent user data dir.

## Architecture
- `main.js`: Electron main process, IPC handlers for scraper control, database connection (`sqlite3`), menu bar setup.
- `preload.js`: Secure bridge between renderer and main process (`contextBridge`).
- `renderer/index.html` & `renderer/renderer.js`: UI layout with Control Panel, Logs, and `<webview>` for portal access.
- `scraper/`: Playwright automation scripts handling login session persistence, table row iteration, modal extraction, unmasking hover/clicks, data storage, and retry logic.
- `database/`: SQLite schema initialization and query helpers.

## Amandemen 2026-11-07: automation di dalam `<webview>` (Opsi A)

Keputusan pemilik produk: automation berjalan **di dalam `<webview>` aplikasi**, bukan di Chromium Playwright terpisah.

- Engine: `src/scraper/webviewScraper.js` mengendalikan guest `webContents` milik `<webview>` lewat `webContents.fromId(guestId)`.
- Ekstraksi & klik: `executeJavaScript` di halaman guest (`src/scraper/webviewScripts.js`).
- Unmasking NOKK/NIK: dispatch `mouseover`/`mouseenter`/`mousemove`/`pointer*` + `click()`. Jika teks masih bertanda `*`, fallback ke input asli `webContents.sendInputEvent` (mouseMove/mouseDown/mouseUp) di koordinat elemen.
- **Playwright dicabut** dari dependensi. Jembatan cookie/localStorage dihapus karena sesi webview sudah sama dengan sesi automation.
- Yang dipertahankan dari implementasi sebelumnya: state machine Start/Pause/Stop, retry 3x dengan backoff eksponensial + notifikasi log, validasi NOKK/NIK 16 digit, transaksi per keluarga, anti-overwrite, paginasi, dan status IPC ke UI.

Konsekuensi: jika pengguna berpindah halaman di webview saat scraping berjalan, elemen hilang dan baris tersebut di-skip setelah retry (tercatat di log).
