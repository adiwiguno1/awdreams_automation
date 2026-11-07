# SIKS-NG Desktop Scraper & Management App

Aplikasi desktop lintas platform (Windows, macOS, Linux) untuk menelusuri, men-scrape, dan menyimpan data dari portal **siks.kemensos.go.id** ke database SQLite lokal.

Tech stack: **Electron.js + SQLite3** (automation di dalam `<webview>`).

---

## Fitur

- **Menu bar native**: File, Browser, Scrap, Automation.
- **Panel kontrol scraper**: Start / Pause / Resume / Stop.
- **Log progres real-time** di bilah atas.
- **`<webview>` SIKS-NG** untuk navigasi dan login manual.
- **Sesi login persistent**:
  - Cookie + `localStorage`/`sessionStorage` dari `webview` disimpan oleh browser webview sendiri, sehingga login tidak perlu diulang setiap aplikasi dibuka.
- **Retry otomatis** per baris (3 percobaan, backoff eksponensial 2s → 4s) dengan notifikasi jelas di log UI. Baris yang tetap gagal **dilewati**, bukan menghentikan seluruh proses.
- **Validasi kunci**: NOKK/NIK harus 16 digit; hasil mask (`****`) atau kosong tidak akan pernah masuk database.
- **Anti-overwrite**: re-scraping dengan field kosong tidak menghapus data lama (`COALESCE(NULLIF(...))`).
- **Transaksi per keluarga**: keluarga, anggota, dan bansos satu keluarga disimpan atomik.
- **Unmasking NOKK & NIK** via `hover` + `click` sebelum membaca teks.
- **Paginasi otomatis** pada tabel hasil pencarian.
- **Database SQLite** dengan tabel `keluarga`, `anggota_keluarga`, `bansos`.

---

## Struktur Proyek

```
siks-scraper-app/
├── src/
│   ├── main.js                  # Proses utama Electron + menu + IPC
│   ├── preload.js               # contextBridge (window.api)
│   ├── renderer/
│   │   ├── index.html           # UI panel kontrol + <webview>
│   │   └── renderer.js          # Interaksi tombol & log
│   ├── database/
│   │   └── db.js                # Koneksi SQLite, skema, helper insert
│   └── scraper/
│       └── scraperEngine.js     # login persisten, loop, retry
├── tests/
│   ├── database.test.js
│   ├── scraper.test.js
│   └── smoke.electron.js
├── data/                        # dibuat otomatis oleh skrip (mode dev)
└── package.json
```

---

## Instalasi

Prasyarat: **Node.js 20+** (dites di Node 26) dan **npm**.

> Aplikasi memakai **Electron 35** yang membundel Node 22. Automation berjalan di dalam `<webview>` aplikasi — **Playwright dihilangkan**. Install paket cukup `npm install`.

```bash
npm install
```

> Jika `npm start` menampilkan `Electron failed to install correctly`, jalankan ulang
> `node node_modules/electron/install.js`. Bila ekstraksi gagal (mis. `extract-zip`
> tidak kompatibel dengan Node baru), ekstrak manual dari cache npm:
> `tar -xf "<cache>/electron-v35.7.5-win32-x64.zip" -C node_modules/electron/dist`
> lalu buat `node_modules/electron/path.txt` berisi `electron.exe` (Windows) /
> `Electron.app/Contents/MacOS/Electron` (macOS) / `electron` (Linux).

---

## Menjalankan

```bash
npm start
```

1. Login manual di halaman SIKS-NG pada panel `<webview>`, lalu buka
   `https://siks.kemensos.go.id/data-bnba-dtsen` di webview.
2. Klik **Start**. Aplikasi akan:
   - menyalin cookie + `localStorage`/`sessionStorage` dari webview,
   - menunggu maksimal 5 menit sampai tabel data muncul.
3. Setelah tabel muncul, scraper mulai berjalan otomatis per baris.

> Sesi login tersimpan di `user_data/` dan di sesi Electron,
> jadi login tidak perlu diulang saat aplikasi dibuka kembali. Jika portal
> memakai token yang tidak bisa disalin (mis. IndexedDB), login sekali lagi
> di webview — sesa itu ikut tersimpan permanen.

---

## Alur Scraping

1. Deteksi tabel `.MuiTable-root.MuiTable-stickyHeader.css-1g31k2i`.
2. Untuk setiap baris:
   - Klik tombol detail `.MuiBox-root.css-1xp8hvq`.
   - **Keluarga**: ambil NOKK (hover+click untuk unmask), nama kepala keluarga, alamat,
     RT, RW, desil, provinsi, kabupaten, kecamatan, kelurahan, status perlinsos.
   - **Anggota keluarga**: loop baris tabel `//*[@id="full-width-tabpanel-0"]/div/div/div/div/table`,
     ambil nama, hubungan keluarga, NIK (hover+click unmask), pekerjaan.
   - **Bansos**: klik tab riwayat bansos, loop tabel, ambil 8 kolom
     (KKS, jenis, periode, bank, no rekening, nama rekening, nominal, status).
   - Tutup modal bansos (`css-1vg8iux`) dan modal keluarga (`css-5iop4y`).
3. Baris berikutnya. Jika satu baris gagal 3x, log menampilkan peringatan dan loop lanjut.

---

## Database

Lokasi: `<userData>/data/siks_data.db` (folder `userData` bawaan Electron —
mis. `%APPDATA%/siks-scraper-app` di Windows, `~/Library/Application Support/...`
di macOS, `~/.config/...` di Linux). Sesi browser webview disimpan di
`<userData>/webview-profile`.

| Tabel | Primary Key | Keterangan |
|-------|-------------|------------|
| `keluarga` | `nokk` | Data kepala keluarga & wilayah |
| `anggota_keluarga` | `nik` | Data anggota (FK `nokk`) |
| `bansos` | `id` (auto) | Riwayat bantuan (FK `nokk`) |

Insert memakai `INSERT ... ON CONFLICT DO UPDATE`, sehingga scraping ulang tidak
menggandakan data keluarga/anggota.

---

## Testing

```bash
npm test              # unit test database & webview scraper (20 test)
npm run smoke         # boot Electron, cek preload + elemen UI
npm run smoke:runtime # cek modul app di Node bawaan Electron
npm run smoke:webview  # boot Electron, uji main -> webview executeJavaScript
```

---

## Build Lintas Platform

```bash
npm run dist:win     # NSIS installer + portable .exe
npm run dist:mac     # DMG + ZIP (harus dijalankan di macOS)
npm run dist:linux   # AppImage + .deb (harus dijalankan di Linux)
```

Hasil build ada di folder `release/`.

> Catatan: Electron Builder tidak bisa membuat artefak macOS/Linux dari Windows.
> Gunakan masing-masing OS atau CI (GitHub Actions matrix) untuk build ketiga platform.

---

## Catatan Keamanan & Etika

- Gunakan aplikasi ini hanya untuk data yang Anda berhak akses.
- Kredensial login tidak pernah disimpan oleh aplikasi; hanya cookie sesi di profil
  Chromium lokal Anda (`user_data/`).
- Hormati ketentuan layanan portal dan batasi laju permintaan.
