// In-page scripts executed inside the <webview> guest via executeJavaScript.
// Every function here must be self-contained: it is stringified and evaluated
// in the page, so it cannot reference anything from this Node module.

const MAIN_TABLE = '.MuiTable-root.MuiTable-stickyHeader.css-1g31k2i';

const KELUARGA_XPATHS = {
  nokk: '/html/body/div[2]/div[3]/div/div/div/div[1]/div/div/div/div/div[2]/div/div[2]/div[2]/div/p',
  nama: '/html/body/div[2]/div[3]/div/div/div/div[1]/div/div/div/div/div[2]/div/div[2]/div[1]/div/p',
  alamat: '/html/body/div[2]/div[3]/div/div/div/div[1]/div/div/div/div/div[2]/div/div[3]/div[2]/div[6]/p',
  rt: '/html/body/div[2]/div[3]/div/div/div/div[1]/div/div/div/div/div[2]/div/div[3]/div[2]/div[7]/p',
  rw: '/html/body/div[2]/div[3]/div/div/div/div[1]/div/div/div/div/div[2]/div/div[3]/div[2]/div[8]/p',
  provinsi: '/html/body/div[2]/div[3]/div/div/div/div[1]/div/div/div/div/div[2]/div/div[3]/div[2]/div[1]/p',
  kabupaten: '/html/body/div[2]/div[3]/div/div/div/div[1]/div/div/div/div/div[2]/div/div[3]/div[2]/div[2]/p',
  kecamatan: '/html/body/div[2]/div[3]/div/div/div/div[1]/div/div/div/div/div[2]/div/div[3]/div[2]/div[3]/p',
  kelurahan: '/html/body/div[2]/div[3]/div/div/div/div[1]/div/div/div/div/div[2]/div/div[3]/div[2]/div[4]/p',
  desil: '/html/body/div[2]/div[3]/div/div/div/div[2]/div/div[2]/div/div/div/div[1]/div[1]/div[2]/div/div[2]/h4',
  status_perlinsos: '/html/body/div[2]/div[3]/div/div/div/div[3]/div[2]/div[2]/div/div/div[2]/div[2]/div/button/div[1]/p'
};

const ANGGOTA_TABLE_XPATH = '//*[@id="full-width-tabpanel-0"]/div/div/div/div/table';
const BANSOS_TAB_XPATH =
  '/html/body/div[2]/div[3]/div/div/div/div[3]/div[1]/div[2]/div/div/p';

// ---- page functions -------------------------------------------------------

function rowCount(tableSelector) {
  return document.querySelectorAll(tableSelector + ' tbody tr').length;
}

function clickDetail(arg) {
  const rows = document.querySelectorAll(arg.table + ' tbody tr');
  const row = rows[arg.index];
  if (!row) return { ok: false, reason: 'row-not-found' };

  const btn =
    row.querySelector('.MuiBox-root.css-1xp8hvq') ||
    row.querySelector('.css-1xp8hvq') ||
    row.querySelector('[role="button"]');
  if (!btn) return { ok: false, reason: 'button-not-found' };

  btn.scrollIntoView({ block: 'center' });
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  btn.click();
  return { ok: true };
}

function textByXpath(arg) {
  const res = document.evaluate(arg.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  const el = res.singleNodeValue;
  if (!el) return '';
  return (el.textContent || '').trim();
}

async function readFamily(arg) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const byXpath = (xp) => {
    const res = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    return res.singleNodeValue;
  };

  const textOf = (xp) => {
    const el = byXpath(xp);
    return el ? (el.textContent || '').trim() : '';
  };

  const unmaskElement = (el) => {
    if (!el) return { text: '', rect: null };
    const events = ['mouseover', 'mouseenter', 'mousemove', 'pointerover', 'pointerenter'];
    for (const type of events) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
    try {
      el.click();
    } catch (_) {
      // Some nodes are not clickable; the mouse events above may be enough.
    }
    const rect = el.getBoundingClientRect();
    return {
      text: (el.textContent || '').trim(),
      rect: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    };
  };

  const nokkInfo = unmaskElement(byXpath(arg.xpaths.nokk));

  const keluarga = {
    nokk: nokkInfo.text,
    nama_kepala_keluarga: textOf(arg.xpaths.nama),
    alamat: textOf(arg.xpaths.alamat),
    rt: textOf(arg.xpaths.rt),
    rw: textOf(arg.xpaths.rw),
    provinsi: textOf(arg.xpaths.provinsi),
    kabupaten: textOf(arg.xpaths.kabupaten),
    kecamatan: textOf(arg.xpaths.kecamatan),
    kelurahan: textOf(arg.xpaths.kelurahan),
    desil: textOf(arg.xpaths.desil),
    status_perlinsos: textOf(arg.xpaths.status_perlinsos)
  };

  const anggota = [];
  const anggotaTable = byXpath(arg.anggotaTableXpath);
  if (anggotaTable) {
    const rows = anggotaTable.querySelectorAll('tbody tr');
    let index = 0;
    for (const tr of rows) {
      const ps = tr.querySelectorAll('p');
      if (ps.length < 4) {
        index++;
        continue;
      }
      const nikInfo = unmaskElement(ps[2]);
      anggota.push({
        index,
        nama: (ps[0].textContent || '').trim(),
        hubungan_keluarga: (ps[1].textContent || '').trim(),
        nik: nikInfo.text,
        nikRect: nikInfo.rect,
        pekerjaan: (ps[3].textContent || '').trim()
      });
      index++;
    }
  }

  const tab = byXpath(arg.bansosTabXpath);
  let panelId = 'full-width-tabpanel-0';
  if (tab) {
    const controls = tab.getAttribute('aria-controls');
    if (controls) panelId = controls;
    try {
      tab.click();
    } catch (_) {
      // Tab may already be active.
    }
    await sleep(800);
  }

  const bansos = [];
  let bansosTableFound = false;
  const panel = document.getElementById(panelId);
  const bansosTable = panel ? panel.querySelector('table') : null;
  if (bansosTable) {
    bansosTableFound = true;
    for (const tr of bansosTable.querySelectorAll('tbody tr')) {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 8) continue;
      const cells = [];
      for (let i = 0; i < 8; i++) cells.push((tds[i].textContent || '').trim());
      bansos.push({
        no_kks: cells[0],
        jenis_bansos: cells[1],
        periode: cells[2],
        bank_penyalur: cells[3],
        no_rekening: cells[4],
        nama_rekening: cells[5],
        nominal: cells[6],
        status_transaksi: cells[7]
      });
    }
  }

  return { keluarga, nokkRect: nokkInfo.rect, anggota, bansos, bansosTableFound, panelId };
}

function readAnggotaRow(arg) {
  const res = document.evaluate(arg.anggotaTableXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  const table = res.singleNodeValue;
  if (!table) return null;

  const tr = table.querySelectorAll('tbody tr')[arg.index];
  if (!tr) return null;

  const ps = tr.querySelectorAll('p');
  if (ps.length < 4) return null;

  const rect = ps[2].getBoundingClientRect();
  return {
    nik: (ps[2].textContent || '').trim(),
    nikRect: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  };
}

async function closeModals() {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const selectors = [
    '.MuiIconButton-root.MuiIconButton-sizeSmall.css-1vg8iux',
    '.MuiIconButton-root.MuiIconButton-sizeMedium.css-5iop4y'
  ];

  let closed = 0;
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (!el) continue;
    try {
      el.click();
      closed++;
    } catch (_) {
      // Ignore and try the next one.
    }
    await sleep(350);
  }
  return closed;
}

function pagination(arg) {
  const buttons = document.querySelectorAll('.MuiTablePagination-actions button');
  if (!buttons.length) return { exists: false, disabled: true };

  const next = buttons[buttons.length - 1];
  const disabled = next.disabled || next.getAttribute('aria-disabled') === 'true';
  return { exists: true, disabled };
}

function clickNextPage() {
  const buttons = document.querySelectorAll('.MuiTablePagination-actions button');
  if (!buttons.length) return false;

  const next = buttons[buttons.length - 1];
  if (next.disabled || next.getAttribute('aria-disabled') === 'true') return false;

  next.scrollIntoView({ block: 'center' });
  next.click();
  return true;
}

const SCRIPTS = {
  rowCount,
  clickDetail,
  textByXpath,
  readFamily,
  readAnggotaRow,
  closeModals,
  pagination,
  clickNextPage
};

module.exports = {
  MAIN_TABLE,
  KELUARGA_XPATHS,
  ANGGOTA_TABLE_XPATH,
  BANSOS_TAB_XPATH,
  SCRIPTS
};
