import * as XLSX from 'xlsx';

// Best-effort seeding of the qualitative tables (plans, launches, partners,
// feedback) from the BoostLife Performance workbook. Targets are never touched.

const norm = (s) => String(s ?? '').trim().toLowerCase();
const serialToDate = (n) => {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
const cellStr = (v) => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 40000 && v < 60000) return serialToDate(v);
  return String(v).trim();
};

const sheetAoa = (wb, name) => {
  const key = wb.SheetNames.find(n => n.trim().toLowerCase() === name.toLowerCase());
  if (!key) return null;
  return XLSX.utils.sheet_to_json(wb.Sheets[key], { header: 1, defval: null, blankrows: false });
};

// Find a header row and resolve column indices for the given field aliases.
function resolveTable(aoa, spec, required) {
  if (!aoa) return null;
  for (let r = 0; r < aoa.length; r++) {
    const row = (aoa[r] || []).map(norm);
    const cols = {};
    for (const [field, aliases] of Object.entries(spec)) {
      cols[field] = row.findIndex(h => aliases.some(a => h === a || h.includes(a)));
    }
    if (required.every(f => cols[f] >= 0)) return { headerRow: r, cols };
  }
  return null;
}

function extractPlans(wb, sheetName, category, idBase) {
  const aoa = sheetAoa(wb, sheetName);
  const t = resolveTable(aoa, {
    name: ['deal name', 'campaign'], product: ['product', 'campaign type'], pic: ['boost pic', 'pic'],
    estRevenue: ['revenue', 'monthly reven'], winProb: ['win prob', 'probability'],
    stage: ['deal stage', 'stage'], closingDate: ['closing date'], goLiveDate: ['go-live', 'go live'], notes: ['notes'],
  }, ['name']);
  if (!t) return [];
  const out = [];
  for (let r = t.headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const name = cellStr(row[t.cols.name]);
    if (!name || /deal name|campaign/i.test(name)) continue; // skip repeats / dividers
    out.push({
      id: idBase + out.length, category,
      name,
      product: t.cols.product >= 0 ? cellStr(row[t.cols.product]) : '',
      pic: t.cols.pic >= 0 ? cellStr(row[t.cols.pic]) : '',
      estRevenue: 0, estRevenueText: t.cols.estRevenue >= 0 ? cellStr(row[t.cols.estRevenue]) : '',
      winProb: 50,
      stage: t.cols.stage >= 0 ? cellStr(row[t.cols.stage]) : '',
      closingDate: t.cols.closingDate >= 0 ? cellStr(row[t.cols.closingDate]) : '',
      goLiveDate: t.cols.goLiveDate >= 0 ? cellStr(row[t.cols.goLiveDate]) : '',
      notes: t.cols.notes >= 0 ? cellStr(row[t.cols.notes]) : '',
    });
  }
  return out;
}

function extractLaunches(wb) {
  const aoa = sheetAoa(wb, 'Product Launches');
  const t = resolveTable(aoa, {
    pod: ['pod'], objective: ['objectives', 'objective'], initiative: ['key initiatives', 'initiative'],
    pilot: ['pilot'], goLive: ['go-live', 'go live'], launch: ['launch'], remarks: ['remarks'],
  }, ['objective', 'launch']);
  if (!t) return [];
  const out = []; let year = '';
  for (let r = t.headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const first = cellStr(row[0]);
    if (/^20\d{2}$/.test(first)) { year = first; continue; }
    const initiative = t.cols.initiative >= 0 ? cellStr(row[t.cols.initiative]) : '';
    if (!initiative) continue;
    out.push({
      id: out.length + 1, year,
      pod: t.cols.pod >= 0 ? cellStr(row[t.cols.pod]) : '',
      objective: t.cols.objective >= 0 ? cellStr(row[t.cols.objective]) : '',
      initiative,
      pilot: t.cols.pilot >= 0 ? cellStr(row[t.cols.pilot]) : '',
      goLive: t.cols.goLive >= 0 ? cellStr(row[t.cols.goLive]) : '',
      launch: t.cols.launch >= 0 ? cellStr(row[t.cols.launch]) : '',
      remarks: t.cols.remarks >= 0 ? cellStr(row[t.cols.remarks]) : '',
    });
  }
  return out;
}

const PARTNER_CATEGORIES = ['electricals', 'automotive', 'leisure', 'healthcare', 'furniture', 'grocery', 'lifestyle'];
function extractPartners(wb) {
  const aoa = sheetAoa(wb, 'BD Partnership >>') || sheetAoa(wb, 'BD Partnership');
  if (!aoa) return [];
  const out = []; let category = 'General';
  for (const row of aoa) {
    const name = cellStr((row || [])[0]);
    if (!name) continue;
    if (PARTNER_CATEGORIES.includes(norm(name))) { category = name; continue; }
    if (/proposed|to ch|>>/.test(norm(name))) continue;
    out.push({ id: out.length + 1, category, name, product: '', pic: '', dealSize: '', stage: 'Prospect', notes: '' });
  }
  return out;
}

function extractFeedback(wb) {
  const aoa = sheetAoa(wb, 'Customer Rating');
  const t = resolveTable(aoa, {
    goal: ['goal'], objective: ['objective'], initiatives: ['initiatives'], pic: ['boost pic', 'pic'],
    launchDate: ['launch date'], notes: ['notes'],
  }, ['goal', 'objective']);
  if (!t) return [];
  const out = [];
  for (let r = t.headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const goal = cellStr(row[t.cols.goal]);
    const objective = t.cols.objective >= 0 ? cellStr(row[t.cols.objective]) : '';
    if (!goal && !objective) continue;
    out.push({
      id: out.length + 1, goal, objective,
      initiatives: t.cols.initiatives >= 0 ? cellStr(row[t.cols.initiatives]) : '',
      pic: t.cols.pic >= 0 ? cellStr(row[t.cols.pic]) : '',
      launchDate: t.cols.launchDate >= 0 ? cellStr(row[t.cols.launchDate]) : '',
      notes: t.cols.notes >= 0 ? cellStr(row[t.cols.notes]) : '',
    });
  }
  return out;
}

export function seedFromPerformanceWorkbook(buf) {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const plans = [
    ...extractPlans(wb, 'Partnership Plans', 'Partnership', 1000),
    ...extractPlans(wb, 'Growth Plans', 'Growth', 2000),
    ...extractPlans(wb, 'Loyalty Plans', 'Loyalty', 3000),
  ];
  const launches = extractLaunches(wb);
  const partners = extractPartners(wb);
  const feedback = extractFeedback(wb);

  if (plans.length) localStorage.setItem('ba-biz-plans', JSON.stringify(plans));
  if (launches.length) localStorage.setItem('ba-biz-launches', JSON.stringify(launches));
  if (partners.length) localStorage.setItem('ba-biz-partners', JSON.stringify(partners));
  if (feedback.length) localStorage.setItem('ba-biz-feedback', JSON.stringify(feedback));

  return { plans: plans.length, launches: launches.length, partners: partners.length, feedback: feedback.length };
}
