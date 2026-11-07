# SIKS-NG Desktop Scraper & Management App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete Electron desktop application with SQLite storage, persistent login session, Playwright scraper engine with retry mechanism and unmasking hover/clicks, menu bar, and control panel UI.

**Architecture:** Electron main process handles database operations and Playwright automation lifecycle via IPC. The renderer process hosts the UI controls, status logs, and a `<webview>` for manual login and navigation. Playwright shares persistent user data directory with the browser profile to maintain login state across restarts.

**Tech Stack:** Electron.js, Playwright, SQLite3, HTML/CSS/JavaScript (Vanilla or lightweight frontend).

**Spec:** `docs/superpowers/specs/2026-11-07-siks-scraper-electron-design.md`

## Global Constraints
- Platform: Windows (Node.js, Electron, Playwright, SQLite3).
- Persistent user session storage for Playwright and Electron webview.
- Robust retry mechanism with clear user notifications in the UI log.

## Review Focus
- **Session Persistence:** Ensuring cookies and auth tokens persist across app restarts so login is not lost.
- **DOM Stability & Unmasking:** Handling dynamic MUI modals and hover/click unmasking for NOKK and NIK.
- **Scraper State Machine:** Safe handling of Start, Pause, and Stop commands without memory leaks or hanging processes.

---

### Task 1: Project Scaffolding & Dependencies

**Files:**
- Create: `package.json`
- Create: `src/main.js`
- Create: `src/preload.js`
- Create: `src/renderer/index.html`
- Create: `src/renderer/renderer.js`

**Interfaces:**
- Consumes: None.
- Produces: Base Electron project structure and package configuration.

- [ ] **Step 1: Create `package.json` with dependencies (`electron`, `playwright`, `sqlite3`)**
- [ ] **Step 2: Create `src/main.js` with Electron window initialization, menu bar setup, and IPC setup**
- [ ] **Step 3: Create `src/preload.js` with contextBridge exposing scraper controls and status log listeners**
- [ ] **Step 4: Create `src/renderer/index.html` with Menu structure, Control Panel (Start, Pause, Stop), Progress/Log Box, and `<webview>`**
- [ ] **Step 5: Create `src/renderer/renderer.js` handling UI interactions and IPC events**

### Task 2: SQLite Database Integration & Schema

**Files:**
- Create: `src/database/db.js`
- Test: `tests/database.test.js`

**Interfaces:**
- Consumes: None.
- Produces: Database connection, table creation (`keluarga`, `anggota_keluarga`, `bansos`), and CRUD helper functions.

- [ ] **Step 1: Write database schema initialization in `src/database/db.js` for `keluarga`, `anggota_keluarga`, and `bansos`**
- [ ] **Step 2: Add insertion and query helper methods for each table**
- [ ] **Step 3: Test database creation and insertions**

### Task 3: Playwright Scraper Engine with Persistent Session & Retry Logic

**Files:**
- Create: `src/scraper/scraperEngine.js`
- Test: `tests/scraper.test.js`

**Interfaces:**
- Consumes: `src/database/db.js`
- Produces: Playwright automation script with persistent user context, retry logic with notifications, unmasking hover/clicks, modal extraction, and loop controls (Start/Pause/Stop).

- [ ] **Step 1: Implement persistent browser context setup pointing to a local user data directory**
- [ ] **Step 2: Implement table row iteration, unmasking hover/clicks for NOKK and NIK, and XPath extraction for `keluarga`, `anggota_keluarga`, and `bansos`**
- [ ] **Step 3: Implement retry wrapper function with exponential backoff and UI log notifications on failure**
- [ ] **Step 4: Implement Start, Pause, and Stop control handlers connected to IPC from main process**

### Task 4: Integration & Verification

**Files:**
- Modify: `src/main.js`
- Modify: `src/renderer/renderer.js`

**Interfaces:**
- Consumes: Tasks 1, 2, and 3.
- Produces: Fully integrated application ready to run.

- [ ] **Step 1: Wire up IPC events between `main.js`, `renderer.js`, and `scraperEngine.js`**
- [ ] **Step 2: Verify app startup, menu bar actions, and scraping workflow**
