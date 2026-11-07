const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { initDb, insertKeluarga, insertAnggotaKeluarga, insertBansos, closeDb, getKeluarga, getBansosByNokk, withTransaction } = require('../src/database/db');

const testDbPath = path.join(__dirname, 'test_siks.db');

test.before(async () => {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  await initDb(testDbPath);
});

test.after(() => {
  closeDb();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

test('insertKeluarga should insert family record successfully', async () => {
  const dataKeluarga = {
    nokk: '3201012345678901',
    nama_kepala_keluarga: 'Budi Santoso',
    alamat: 'Jl. Merdeka No. 10',
    rt: '001',
    rw: '002',
    kelurahan: 'Cibinong',
    kecamatan: 'Cibinong',
    kabupaten: 'Bogor',
    provinsi: 'Jawa Barat',
    kode_pos: '16911',
    desil: '1',
    status_perlinsos: 'Aktif'
  };

  await insertKeluarga(dataKeluarga);
  assert.ok(true, 'Keluarga inserted');
});

test('insertAnggotaKeluarga should insert family member successfully', async () => {
  const dataAnggota = {
    nokk: '3201012345678901',
    nik: '3201019988770001',
    nama: 'Budi Santoso',
    hubungan_keluarga: 'Kepala Keluarga',
    pekerjaan: 'Wiraswasta'
  };

  await insertAnggotaKeluarga(dataAnggota);
  assert.ok(true, 'Anggota keluarga inserted');
});

test('insertBansos should insert social assistance record successfully', async () => {
  const dataBansos = {
    nokk: '3201012345678901',
    jenis_bansos: 'PKH',
    no_rekening: '1234567890',
    no_kks: '9876543210',
    nama_rekening: 'Budi Santoso',
    bank_penyalur: 'BRI',
    periode: 'Tahap 1 2026',
    nominal: '750000',
    status_transaksi: 'Berhasil'
  };

  await insertBansos(dataBansos);
  assert.ok(true, 'Bansos inserted');
});

test('insertKeluarga rejects an empty NOKK so a failed unmask cannot create a phantom row', async () => {
  await assert.rejects(
    () => insertKeluarga({ nokk: '', nama_kepala_keluarga: 'Tanpa Nokk' }),
    /NOKK tidak valid/
  );
});

test('insertKeluarga rejects a masked NOKK (****)', async () => {
  await assert.rejects(
    () => insertKeluarga({ nokk: '****', nama_kepala_keluarga: 'Tersensor' }),
    /NOKK tidak valid/
  );
});

test('insertAnggotaKeluarga rejects an empty NIK', async () => {
  await assert.rejects(
    () => insertAnggotaKeluarga({ nokk: '3201012345678901', nik: '', nama: 'Tanpa NIK' }),
    /NIK tidak valid/
  );
});

test('re-scraping with empty fields preserves previously stored values', async () => {
  await insertKeluarga({
    nokk: '3201010000000009',
    nama_kepala_keluarga: 'Ibu Siti',
    alamat: 'Jl. Kenanga 5',
    rt: '003',
    rw: '004',
    desil: '2'
  });

  // Simulate a re-scrape where the modal did not render: all text is empty.
  await insertKeluarga({ nokk: '3201010000000009', nama_kepala_keluarga: '', alamat: '', rt: '', rw: '', desil: '' });

  const row = await getKeluarga('3201010000000009');
  assert.strictEqual(row.nama_kepala_keluarga, 'Ibu Siti');
  assert.strictEqual(row.alamat, 'Jl. Kenanga 5');
  assert.strictEqual(row.rt, '003');
  assert.strictEqual(row.desil, '2');
});

test('re-inserting the same bansos rows does not create duplicates', async () => {
  const bansos = {
    nokk: '3201012345678901',
    jenis_bansos: 'BPNT',
    no_rekening: '111',
    no_kks: '222',
    nama_rekening: 'Budi',
    bank_penyalur: 'BRI',
    periode: 'Tahap 2 2026',
    nominal: '300000',
    status_transaksi: 'Berhasil'
  };

  await insertBansos(bansos);
  await insertBansos(bansos);

  const rows = await getBansosByNokk('3201012345678901');
  const matching = rows.filter((r) => r.no_kks === '222' && r.periode === 'Tahap 2 2026');
  assert.strictEqual(matching.length, 1);
});

test('withTransaction rolls back every write when the callback throws', async () => {
  const nokk = '3201017777770001';

  await assert.rejects(
    () => withTransaction(async () => {
      await insertKeluarga({ nokk, nama_kepala_keluarga: 'Akan Dibatalkan' });
      throw new Error('boom');
    }),
    /boom/
  );

  const row = await getKeluarga(nokk);
  assert.strictEqual(row, undefined);
});
