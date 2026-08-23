import * as XLSX from 'xlsx';

// Convert an Excel date serial (e.g. 45992) to a 'YYYY-MM' month key.
export function serialToMonth(serial) {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// 'YYYY-MM' -> "Jan 2025"
export function monthLabel(ym) {
  const [y, m] = String(ym).split('-');
  return `${MONTHS[Number(m) - 1] || '?'} ${y}`;
}

// Which ADE sheets we understand, and how their columns map to our metrics.
// Stream sheets contribute Net Revenue actuals; KPI sheets contribute scorecard metrics.
const SHEET_MAP = {
  'BPT':                          { stream: { key: 'bpt',             label: 'BPT',                  color: '#8b5cf6' }, metric: 'NR' },
  'Payments (Online)':            { stream: { key: 'online',          label: 'Online Payments',      color: '#3b7ff5' }, metric: 'NR' },
  'Payments (OnlineByMerchants)': { stream: { key: 'onlineMerchants', label: 'Online (by Merchants)', color: '#0ea5e9' }, metric: 'NR' },
  'Payments (Offline)':           { stream: { key: 'offline',         label: 'Offline Payments',     color: '#16a34a' }, metric: 'NR' },
  'Payments (OfflineRetailKA)':   { stream: { key: 'offlineRetailKA', label: 'Offline Retail (KA)',  color: '#22c55e' }, metric: 'NR' },
  'Payments (Others)':            { stream: { key: 'others',          label: 'Other Payments',       color: '#d97706' }, metric: 'NR' },
  'Wallet & Embedded':            { kpis: { MTU: 'mtu', MAU: 'mau', GTV: 'gtv' } },
  'Wallet Only':                  { kpis: { NR: 'walletNr' } },
  'Embedded Bank':                { kpis: { MTU: 'ebUsers' } },
};

// Default streams shown on the performance grid. Imported streams come from the
// ADE file; manual streams (not in the raw file) are typed in by the user.
export const DEFAULT_STREAMS = [
  { key: 'online',  label: 'Online Payments',   source: 'import', color: '#3b7ff5' },
  { key: 'offline', label: 'Offline Payments',  source: 'import', color: '#16a34a' },
  { key: 'bpt',     label: 'BPT',               source: 'import', color: '#8b5cf6' },
  { key: 'others',  label: 'Other Payments',    source: 'import', color: '#d97706' },
  { key: 'loyalty', label: 'Loyalty',           source: 'manual', color: '#e11d48' },
  { key: 'payflex', label: 'Payflex',           source: 'manual', color: '#0891b2' },
  { key: 'gov',     label: 'Life — Government',  source: 'manual', color: '#14b8a6' },
];

const norm = (s) => String(s ?? '').trim().replace(/\*+$/, '').toLowerCase();

// Parse an ADE workbook ArrayBuffer into the normalized actuals shape.
export function parseAdeWorkbook(buf, sourceName) {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const streams = {};
  const kpis = {};
  const monthsSet = new Set();
  const matchedSheets = [];

  for (const sheetName of wb.SheetNames) {
    const mapKey = Object.keys(SHEET_MAP).find(k => k.toLowerCase() === sheetName.trim().toLowerCase());
    if (!mapKey) continue;
    const conf = SHEET_MAP[mapKey];
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null, blankrows: false });
    if (!aoa.length) continue;
    const header = (aoa[0] || []).map(norm);
    const dateCol = header.findIndex(h => h === 'date');
    if (dateCol < 0) continue;

    // Resolve the metric columns we want from this sheet.
    const cols = []; // { ci, out, kind }
    if (conf.stream) {
      const ci = header.findIndex(h => h === norm(conf.metric));
      if (ci >= 0) cols.push({ ci, out: conf.stream.key, kind: 'stream' });
    }
    if (conf.kpis) {
      for (const [m, out] of Object.entries(conf.kpis)) {
        const ci = header.findIndex(h => h === norm(m));
        if (ci >= 0) cols.push({ ci, out, kind: 'kpi' });
      }
    }
    if (!cols.length) continue;
    matchedSheets.push(mapKey);

    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row) continue;
      const dv = row[dateCol];
      if (dv == null || dv === '') continue;
      const ym = dv instanceof Date
        ? `${dv.getUTCFullYear()}-${String(dv.getUTCMonth() + 1).padStart(2, '0')}`
        : (typeof dv === 'number' ? serialToMonth(dv) : null);
      if (!ym) continue;
      monthsSet.add(ym);
      for (const { ci, out, kind } of cols) {
        const val = Number(row[ci]);
        if (!isFinite(val)) continue;
        const bucket = kind === 'stream' ? streams : kpis;
        (bucket[out] ||= {})[ym] = val;
      }
    }
  }

  return {
    importedAt: new Date().toISOString(),
    sourceName: sourceName || '',
    months: [...monthsSet].sort(),
    streams,
    kpis,
    matchedSheets,
  };
}

// Available calendar years present in an actuals object.
export function yearsIn(actuals) {
  const ys = new Set((actuals?.months || []).map(m => m.slice(0, 4)));
  return [...ys].sort();
}
