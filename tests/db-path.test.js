const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { initDb, insertKeluarga, getKeluarga, closeDb } = require('../src/database/db');

const tmpRoot = path.join(__dirname, 'tmp_nested_path');

test.after(async () => {
  await closeDb();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test('initDb creates missing parent directories for the database file', async () => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });

  const dbFile = path.join(tmpRoot, 'deep', 'nested', 'siks.db');
  await initDb(dbFile);

  assert.ok(fs.existsSync(dbFile), 'database file should exist after initDb');

  await insertKeluarga({ nokk: '3201012345678999', nama_kepala_keluarga: 'Uji Path' });
  const row = await getKeluarga('3201012345678999');
  assert.strictEqual(row.nama_kepala_keluarga, 'Uji Path');
});
