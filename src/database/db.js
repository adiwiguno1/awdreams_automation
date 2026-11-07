const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

let db;

const KEY_PATTERN = /^\d{16}$/;

function assertNokk(nokk) {
  if (typeof nokk !== 'string' || !KEY_PATTERN.test(nokk.trim())) {
    throw new Error(`NOKK tidak valid: "${nokk}". Unmask gagal atau modal tidak terbuka.`);
  }
}

function assertNik(nik) {
  if (typeof nik !== 'string' || !KEY_PATTERN.test(nik.trim())) {
    throw new Error(`NIK tidak valid: "${nik}". Unmask gagal atau baris anggota rusak.`);
  }
}

function getDbPath(baseDir) {
  const root = baseDir || path.join(process.cwd(), 'data');
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  return path.join(root, 'siks_data.db');
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function initDb(dbFilePath) {
  return new Promise((resolve, reject) => {
    const filePath = dbFilePath || getDbPath();

    // The caller may pass a path under a directory that does not exist yet
    // (e.g. Electron's <userData>/data on first run). Create it up front,
    // otherwise sqlite3 fails with SQLITE_CANTOPEN.
    const parentDir = path.dirname(filePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    db = new sqlite3.Database(filePath, (err) => {
      if (err) return reject(err);

      db.serialize(() => {
        db.run('PRAGMA foreign_keys = ON');
        db.run('PRAGMA busy_timeout = 5000');

        // Table keluarga
        db.run(`
          CREATE TABLE IF NOT EXISTS keluarga (
            nokk TEXT PRIMARY KEY,
            nama_kepala_keluarga TEXT,
            alamat TEXT,
            rt TEXT,
            rw TEXT,
            kelurahan TEXT,
            kecamatan TEXT,
            kabupaten TEXT,
            provinsi TEXT,
            kode_pos TEXT,
            desil TEXT,
            status_perlinsos TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Table anggota_keluarga
        db.run(`
          CREATE TABLE IF NOT EXISTS anggota_keluarga (
            nik TEXT PRIMARY KEY,
            nokk TEXT,
            nama TEXT,
            jenis_kelamin TEXT,
            tempat_lahir TEXT,
            tanggal_lahir TEXT,
            agama TEXT,
            pendidikan TEXT,
            pekerjaan TEXT,
            golongan_darah TEXT,
            status_perkawinan TEXT,
            tanggal_cerai TEXT,
            hubungan_keluarga TEXT,
            kewarganegaraan TEXT,
            no_paspor TEXT,
            no_kitap TEXT,
            nik_ayah TEXT,
            nik_ibu TEXT,
            nama_ayah TEXT,
            nama_ibu TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (nokk) REFERENCES keluarga (nokk)
          )
        `);

        // Table bansos
        db.run(`
          CREATE TABLE IF NOT EXISTS bansos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nokk TEXT,
            jenis_bansos TEXT,
            no_rekening TEXT,
            no_kks TEXT,
            nama_rekening TEXT,
            bank_penyalur TEXT,
            periode TEXT,
            nominal TEXT,
            status_transaksi TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (nokk) REFERENCES keluarga (nokk)
          )
        `);

        // Idempotency key for bansos so retries/re-runs do not duplicate rows.
        db.run(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_bansos_unique
          ON bansos (nokk, no_kks, jenis_bansos, periode)
        `, (err) => {
          if (err) return reject(err);
          resolve(db);
        });
      });
    });
  });
}

async function withTransaction(fn) {
  await run('BEGIN IMMEDIATE');
  try {
    const result = await fn();
    await run('COMMIT');
    return result;
  } catch (err) {
    try {
      await run('ROLLBACK');
    } catch (_) {
      // Connection may already be closed; surface the original error.
    }
    throw err;
  }
}

async function insertKeluarga(data) {
  assertNokk(data.nokk);

  const sql = `
    INSERT INTO keluarga (
      nokk, nama_kepala_keluarga, alamat, rt, rw, kelurahan, kecamatan, kabupaten, provinsi, kode_pos, desil, status_perlinsos
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(nokk) DO UPDATE SET
      nama_kepala_keluarga = COALESCE(NULLIF(excluded.nama_kepala_keluarga, ''), nama_kepala_keluarga),
      alamat = COALESCE(NULLIF(excluded.alamat, ''), alamat),
      rt = COALESCE(NULLIF(excluded.rt, ''), rt),
      rw = COALESCE(NULLIF(excluded.rw, ''), rw),
      kelurahan = COALESCE(NULLIF(excluded.kelurahan, ''), kelurahan),
      kecamatan = COALESCE(NULLIF(excluded.kecamatan, ''), kecamatan),
      kabupaten = COALESCE(NULLIF(excluded.kabupaten, ''), kabupaten),
      provinsi = COALESCE(NULLIF(excluded.provinsi, ''), provinsi),
      kode_pos = COALESCE(NULLIF(excluded.kode_pos, ''), kode_pos),
      desil = COALESCE(NULLIF(excluded.desil, ''), desil),
      status_perlinsos = COALESCE(NULLIF(excluded.status_perlinsos, ''), status_perlinsos)
  `;

  await run(sql, [
    data.nokk.trim(),
    data.nama_kepala_keluarga || '',
    data.alamat || '',
    data.rt || '',
    data.rw || '',
    data.kelurahan || '',
    data.kecamatan || '',
    data.kabupaten || '',
    data.provinsi || '',
    data.kode_pos || '',
    data.desil || '',
    data.status_perlinsos || ''
  ]);

  return data.nokk.trim();
}

async function insertAnggotaKeluarga(data) {
  assertNik(data.nik);

  const sql = `
    INSERT INTO anggota_keluarga (
      nik, nokk, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, agama, pendidikan, pekerjaan,
      golongan_darah, status_perkawinan, tanggal_cerai, hubungan_keluarga, kewarganegaraan,
      no_paspor, no_kitap, nik_ayah, nik_ibu, nama_ayah, nama_ibu
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(nik) DO UPDATE SET
      nokk = COALESCE(NULLIF(excluded.nokk, ''), nokk),
      nama = COALESCE(NULLIF(excluded.nama, ''), nama),
      jenis_kelamin = COALESCE(NULLIF(excluded.jenis_kelamin, ''), jenis_kelamin),
      tempat_lahir = COALESCE(NULLIF(excluded.tempat_lahir, ''), tempat_lahir),
      tanggal_lahir = COALESCE(NULLIF(excluded.tanggal_lahir, ''), tanggal_lahir),
      agama = COALESCE(NULLIF(excluded.agama, ''), agama),
      pendidikan = COALESCE(NULLIF(excluded.pendidikan, ''), pendidikan),
      pekerjaan = COALESCE(NULLIF(excluded.pekerjaan, ''), pekerjaan),
      golongan_darah = COALESCE(NULLIF(excluded.golongan_darah, ''), golongan_darah),
      status_perkawinan = COALESCE(NULLIF(excluded.status_perkawinan, ''), status_perkawinan),
      tanggal_cerai = COALESCE(NULLIF(excluded.tanggal_cerai, ''), tanggal_cerai),
      hubungan_keluarga = COALESCE(NULLIF(excluded.hubungan_keluarga, ''), hubungan_keluarga),
      kewarganegaraan = COALESCE(NULLIF(excluded.kewarganegaraan, ''), kewarganegaraan),
      no_paspor = COALESCE(NULLIF(excluded.no_paspor, ''), no_paspor),
      no_kitap = COALESCE(NULLIF(excluded.no_kitap, ''), no_kitap),
      nik_ayah = COALESCE(NULLIF(excluded.nik_ayah, ''), nik_ayah),
      nik_ibu = COALESCE(NULLIF(excluded.nik_ibu, ''), nik_ibu),
      nama_ayah = COALESCE(NULLIF(excluded.nama_ayah, ''), nama_ayah),
      nama_ibu = COALESCE(NULLIF(excluded.nama_ibu, ''), nama_ibu)
  `;

  await run(sql, [
    data.nik.trim(),
    data.nokk || '',
    data.nama || '',
    data.jenis_kelamin || '',
    data.tempat_lahir || '',
    data.tanggal_lahir || '',
    data.agama || '',
    data.pendidikan || '',
    data.pekerjaan || '',
    data.golongan_darah || '',
    data.status_perkawinan || '',
    data.tanggal_cerai || '',
    data.hubungan_keluarga || '',
    data.kewarganegaraan || '',
    data.no_paspor || '',
    data.no_kitap || '',
    data.nik_ayah || '',
    data.nik_ibu || '',
    data.nama_ayah || '',
    data.nama_ibu || ''
  ]);

  return data.nik.trim();
}

async function insertBansos(data) {
  if (!data.nokk || !KEY_PATTERN.test(String(data.nokk).trim())) {
    throw new Error(`NOKK tidak valid untuk bansos: "${data.nokk}".`);
  }

  const sql = `
    INSERT INTO bansos (
      nokk, jenis_bansos, no_rekening, no_kks, nama_rekening, bank_penyalur, periode, nominal, status_transaksi
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(nokk, no_kks, jenis_bansos, periode) DO UPDATE SET
      no_rekening = COALESCE(NULLIF(excluded.no_rekening, ''), no_rekening),
      nama_rekening = COALESCE(NULLIF(excluded.nama_rekening, ''), nama_rekening),
      bank_penyalur = COALESCE(NULLIF(excluded.bank_penyalur, ''), bank_penyalur),
      nominal = COALESCE(NULLIF(excluded.nominal, ''), nominal),
      status_transaksi = COALESCE(NULLIF(excluded.status_transaksi, ''), status_transaksi)
  `;

  const result = await run(sql, [
    data.nokk.trim(),
    data.jenis_bansos || '',
    data.no_rekening || '',
    data.no_kks || '',
    data.nama_rekening || '',
    data.bank_penyalur || '',
    data.periode || '',
    data.nominal || '',
    data.status_transaksi || ''
  ]);

  return result.lastID;
}

async function getKeluarga(nokk) {
  return get('SELECT * FROM keluarga WHERE nokk = ?', [nokk]);
}

async function getBansosByNokk(nokk) {
  return all('SELECT * FROM bansos WHERE nokk = ?', [nokk]);
}

function closeDb() {
  return new Promise((resolve) => {
    if (!db) return resolve();
    const instance = db;
    db = null;
    instance.close(() => resolve());
  });
}

module.exports = {
  initDb,
  withTransaction,
  insertKeluarga,
  insertAnggotaKeluarga,
  insertBansos,
  getKeluarga,
  getBansosByNokk,
  closeDb,
  KEY_PATTERN
};
