import { useState, useMemo, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, LineChart, Line, Legend, LabelList
} from 'recharts';
import * as XLSX from 'xlsx';
import { exportCSV, exportExcel } from '../utils/exportData';
import { useLocalStorage } from '../utils/useLocalStorage';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Editable P&L inputs (EBITDA & PAT are derived so the model always reconciles)
const INPUT_ROWS = [
  { key: 'netRevenue',      label: 'Net Revenue',      color: '#3b7ff5' },
  { key: 'opex',            label: 'Opex',             color: '#dc2626' },
  { key: 'interestExpense', label: 'Interest Expense', color: '#8b5cf6' },
  { key: 'da',              label: 'D&A',              color: '#d97706' },
];

const PROJECT_COLORS = ['#0ea5e9', '#f59e0b', '#10b981', '#e11d48', '#8b5cf6', '#14b8a6'];

const defaultAssumptions = {
  netRevenueStart: 1000000,
  netRevenueGrowth: 5,
  opexStart: 600000,
  opexGrowth: 3,
  daPerMonth: 20000,
  interestPerMonth: 10000,
  endYearTarget: 8000000,
};

const fmt = (n) =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M`
  : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}K`
  : `${Number(n || 0).toFixed(0)}`;

// Always express in millions (rounded) for the Monthly P&L
const fmtM = (n) => (n ? `${(n / 1e6).toFixed(2)}M` : '0');

const fmtFull = (n) => Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// "Jun 2026" -> "Jun'26"
const shortMonth = (label) => {
  const [m, y] = String(label).split(' ');
  return y ? `${m}'${y.slice(2)}` : label;
};

// ── Excel import parsing (tolerant of layout / naming) ───────────────────────
const METRIC_ALIASES = {
  netRevenue:      ['net revenue', 'netrevenue', 'net rev', 'net sales', 'revenue', 'total revenue', 'income'],
  opex:            ['opex', 'operating expense', 'operating expenses', 'operating cost', 'operating costs', 'total opex'],
  interestExpense: ['interest expense', 'interest exp', 'finance cost', 'finance costs', 'interest'],
  da:              ['d&a', 'd & a', 'da', 'depreciation', 'depreciation & amortisation', 'depreciation and amortization', 'amortisation', 'amortization'],
};
const METRIC_LABELS = { netRevenue: 'Net Revenue', opex: 'Opex', interestExpense: 'Interest Expense', da: 'D&A' };

const norm = (s) => String(s ?? '').trim().toLowerCase();
const matchMetric = (s) => {
  const n = norm(s);
  if (!n) return null;
  for (const [k, al] of Object.entries(METRIC_ALIASES)) if (al.some(a => n === a)) return k;
  for (const [k, al] of Object.entries(METRIC_ALIASES)) if (al.some(a => n.startsWith(a))) return k;
  // loose contains — skip aliases shorter than 4 chars to avoid accidents (e.g. "da")
  for (const [k, al] of Object.entries(METRIC_ALIASES)) if (al.some(a => a.length >= 4 && n.includes(a))) return k;
  return null;
};
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const isMonthCell = (v) => {
  if (v instanceof Date) return true;
  if (typeof v === 'number') return Number.isInteger(v) && v >= 1900 && v <= 2100; // a year header
  const n = norm(v);
  if (!n || /\b(fy|total|forecast|metric|budget|actual|variance)\b/.test(n)) return false;
  if (/^\d{5,}$/.test(n.replace(/[,.]/g, ''))) return false; // long number = a value, not a month
  return /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4}|\d{1,2}[-/.]\d{1,4}|'\d{2}/.test(n);
};
const monthLabel = (v) => {
  if (v instanceof Date) return `${MONTH_ABBR[v.getMonth()]} ${v.getFullYear()}`;
  return String(v ?? '');
};
// Read the raw cell value; numbers pass straight through (no locale/format parsing).
const toNum = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v instanceof Date) return 0;
  let s = String(v).trim();
  const neg = /^\(.*\)$/.test(s); // accounting negatives (1,234)
  s = s.replace(/[()]/g, '').replace(/[^0-9.\-]/g, '');
  const num = Number(s);
  if (isNaN(num)) return 0;
  return neg ? -num : num;
};

function detectTransposed(aoa) {
  let labelCol = 0, bestCount = 0;
  for (let c = 0; c < 4; c++) {
    const cnt = aoa.reduce((s, r) => s + (matchMetric(r && r[c]) ? 1 : 0), 0);
    if (cnt > bestCount) { bestCount = cnt; labelCol = c; }
  }
  if (bestCount === 0) return null;
  let headerRow = 0, bestMonths = 0;
  for (let r = 0; r < Math.min(5, aoa.length); r++) {
    const cnt = (aoa[r] || []).reduce((s, v, c) => s + (c !== labelCol && isMonthCell(v) ? 1 : 0), 0);
    if (cnt > bestMonths) { bestMonths = cnt; headerRow = r; }
  }
  const hdr = aoa[headerRow] || [];
  let colIdx = [];
  for (let c = 0; c < hdr.length; c++) if (c !== labelCol && isMonthCell(hdr[c])) colIdx.push(c);
  if (!colIdx.length) {
    for (let c = 0; c < hdr.length; c++) if (c !== labelCol && hdr[c] != null && !/fy|total/.test(norm(hdr[c]))) colIdx.push(c);
  }
  const months = colIdx.map(c => monthLabel(hdr[c]));
  const byMetric = {}; const matched = [];
  aoa.forEach((r, ri) => {
    if (ri === headerRow) return;
    const key = matchMetric(r && r[labelCol]);
    if (key && !byMetric[key]) { byMetric[key] = colIdx.map(c => toNum(r[c])); matched.push(key); }
  });
  return { months, byMetric, matchedKeys: matched, orientation: 'metrics as rows' };
}

function detectStandard(aoa) {
  let headerRow = 0, bestCount = 0;
  for (let r = 0; r < Math.min(5, aoa.length); r++) {
    const cnt = (aoa[r] || []).reduce((s, v) => s + (matchMetric(v) ? 1 : 0), 0);
    if (cnt > bestCount) { bestCount = cnt; headerRow = r; }
  }
  if (bestCount === 0) return null;
  const hdr = aoa[headerRow] || [];
  const metricCol = {}; const matched = [];
  let monthCol = -1;
  hdr.forEach((h, c) => {
    const key = matchMetric(h);
    if (key && metricCol[key] === undefined) { metricCol[key] = c; matched.push(key); }
    else if (monthCol < 0 && /month|period|date/.test(norm(h))) monthCol = c;
  });
  if (monthCol < 0) monthCol = 0;
  const dataRows = aoa.slice(headerRow + 1).filter(r => r && r.some(v => v != null && v !== ''));
  const months = dataRows.map((r, i) => {
    const l = r[monthCol];
    return (l != null && String(l).trim()) ? monthLabel(l) : `Month ${i + 1}`;
  });
  const byMetric = {};
  Object.entries(metricCol).forEach(([key, c]) => { byMetric[key] = dataRows.map(r => toNum(r[c])); });
  return { months, byMetric, matchedKeys: matched, orientation: 'metrics as columns' };
}

// Scan every sheet in both orientations; return the parse with the most matches.
function parseWorkbook(wb) {
  let best = null;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false, raw: true });
    if (!aoa.length) continue;
    for (const cand of [detectTransposed(aoa), detectStandard(aoa)]) {
      if (!cand || !cand.months.length || !cand.matchedKeys.length) continue;
      if (!best || cand.matchedKeys.length > best.matchedKeys.length) best = { ...cand, sheet: name };
    }
  }
  return best;
}

function makeEmptyRows(months, startMonth, startYear) {
  return Array.from({ length: months }, (_, i) => {
    const mIdx = (startMonth + i) % 12;
    const yr   = startYear + Math.floor((startMonth + i) / 12);
    return {
      label: `${MONTHS[mIdx]} ${yr}`,
      netRevenue: 0,
      opex: 0,
      da: 0,
      interestExpense: 0,
    };
  });
}

export default function CompanyPerformance() {
  const [startMonth, setStartMonth] = useLocalStorage('ba-company-start-month', 0);
  const [startYear,  setStartYear]  = useLocalStorage('ba-company-start-year', new Date().getFullYear());
  const [numMonths,  setNumMonths]  = useLocalStorage('ba-company-num-months', 12);
  const [rows, setRows] = useLocalStorage('ba-company-rows', makeEmptyRows(12, 0, new Date().getFullYear()));
  const [assumptions, setAssumptions] = useLocalStorage('ba-company-assumptions', defaultAssumptions);
  const [projects, setProjects] = useLocalStorage('ba-company-projects', [
    { id: 1, name: 'Project 1', amount: 50000, startIdx: 0 },
    { id: 2, name: 'Project 2', amount: 80000, startIdx: 3 },
    { id: 3, name: 'Project 3', amount: 30000, startIdx: 8 },
  ]);
  const [waterfallMode, setWaterfallMode] = useState('monthly'); // 'monthly' | 'profit'
  const [waterfallMetric, setWaterfallMetric] = useState('totalNetProfit');
  const [importStatus, setImportStatus] = useState(null); // { ok, text }
  const [showValues, setShowValues] = useState(true);
  const fileRef = useRef();

  const setAssume = (key, val) => setAssumptions(prev => ({ ...prev, [key]: Number(val) || 0 }));

  // ── Resize / carry-over rows when period config changes ────────────────────
  const handlePeriodChange = (sm, sy, nm) => {
    const newRows = makeEmptyRows(nm, sm, sy);
    newRows.forEach((nr) => {
      const existing = rows.find(r => r.label === nr.label);
      if (existing) Object.assign(nr, { netRevenue: existing.netRevenue, opex: existing.opex, da: existing.da, interestExpense: existing.interestExpense });
    });
    setRows(newRows);
  };

  const setCell = (rowIdx, key, value) => {
    setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, [key]: Number(value) || 0 } : r));
  };

  // ── Generate: compound the top assumptions across every month ──────────────
  const generateForecast = () => {
    const base = makeEmptyRows(numMonths, startMonth, startYear);
    const gR = 1 + assumptions.netRevenueGrowth / 100;
    const gO = 1 + assumptions.opexGrowth / 100;
    const forecast = base.map((r, i) => ({
      ...r,
      netRevenue:      Math.round(assumptions.netRevenueStart * Math.pow(gR, i)),
      opex:            Math.round(assumptions.opexStart * Math.pow(gO, i)),
      da:              assumptions.daPerMonth,
      interestExpense: assumptions.interestPerMonth,
    }));
    setRows(forecast);
  };

  // ── Projects (gap fillers) ─────────────────────────────────────────────────
  const addProject = () => {
    const nextId = (projects.reduce((m, p) => Math.max(m, p.id), 0) || 0) + 1;
    setProjects(prev => [...prev, { id: nextId, name: `Project ${prev.length + 1}`, amount: 0, startIdx: 0 }]);
  };
  const updateProject = (id, key, val) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, [key]: key === 'name' ? val : Number(val) || 0 } : p));
  };
  const removeProject = (id) => setProjects(prev => prev.filter(p => p.id !== id));
  const resetProjectOverrides = (id) => setProjects(prev => prev.map(p => p.id === id ? { ...p, overrides: {} } : p));

  // Contribution of a project in a given month index.
  // A per-month override (set by editing the grid) wins over the amount/start config.
  const projAmt = (p, i) => {
    if (p.overrides && Object.prototype.hasOwnProperty.call(p.overrides, i)) return Number(p.overrides[i]) || 0;
    return i >= p.startIdx ? p.amount : 0;
  };
  const projFY = (p) => rows.reduce((s, _r, i) => s + projAmt(p, i), 0);

  // Manually override a single project's month from the P&L grid.
  const setProjectCell = (id, monthIdx, value) => {
    setProjects(prev => prev.map(p => p.id === id
      ? { ...p, overrides: { ...(p.overrides || {}), [monthIdx]: Number(value) || 0 } }
      : p));
  };

  // ── Computed P&L (derived EBITDA / PAT + fillers) ──────────────────────────
  const computed = useMemo(() => rows.map((r, i) => {
    const ebitda = r.netRevenue - r.opex;
    const pat = ebitda - r.da - r.interestExpense;
    const filler = projects.reduce((s, p) => s + projAmt(p, i), 0);
    return { ...r, ebitda, pat, filler, totalNetProfit: pat + filler };
  }), [rows, projects]);

  const totals = useMemo(() => {
    const sum = (key) => computed.reduce((s, r) => s + (r[key] || 0), 0);
    return {
      netRevenue: sum('netRevenue'), opex: sum('opex'), ebitda: sum('ebitda'),
      da: sum('da'), interestExpense: sum('interestExpense'), pat: sum('pat'),
      filler: sum('filler'), totalNetProfit: sum('totalNetProfit'),
    };
  }, [computed]);

  // ── Waterfall data ─────────────────────────────────────────────────────────
  const waterfallData = useMemo(() => {
    if (waterfallMode === 'profit') {
      // Base PAT → each project floats up to bridge the gap → Total Net Profit.
      // The Total bar is stacked: Base PAT portion + filler increment (distinct colour).
      const bars = [];
      const base = totals.pat;
      let running = base;
      bars.push({ name: 'Base PAT', invisible: Math.min(0, base), value: Math.abs(base), increment: 0, raw: base, type: 'total' });
      projects.forEach((p) => {
        const v = projFY(p);
        const start = running;
        const end = running + v;
        bars.push({
          name: p.name,
          fullLabel: p.name,
          invisible: Math.min(start, end),
          value: Math.abs(v),
          increment: 0,
          raw: v,
          type: v >= 0 ? 'filler' : 'negative',
        });
        running = end;
      });
      // Total Net Profit = base PAT (bottom) + filler increment (top, different colour)
      bars.push({
        name: 'Total Net Profit',
        fullLabel: 'Total Net Profit',
        invisible: Math.min(0, base),
        value: Math.abs(base),
        increment: totals.filler,
        raw: running,
        type: 'total',
      });
      return bars;
    }
    // Monthly bridge: each month is a floating step building to the FY total
    const bars = [];
    let cumulative = 0;
    computed.forEach((r) => {
      const v = r[waterfallMetric] || 0;
      const start = cumulative;
      const end = cumulative + v;
      bars.push({
        name: shortMonth(r.label),
        fullLabel: r.label,
        invisible: Math.min(start, end),
        value: Math.abs(v),
        increment: 0,
        raw: v,
        type: v >= 0 ? 'positive' : 'negative',
      });
      cumulative = end;
    });
    bars.push({ name: 'FY Total', fullLabel: 'FY Total', invisible: Math.min(0, cumulative), value: Math.abs(cumulative), increment: 0, raw: cumulative, type: 'total' });
    return bars;
  }, [waterfallMode, waterfallMetric, computed, projects, totals]);

  const metricLabel = {
    totalNetProfit: 'Total Net Profit', pat: 'PAT', netRevenue: 'Net Revenue', ebitda: 'EBITDA',
  }[waterfallMetric];

  // ── Excel import (scans all sheets, auto-detects layout, reports what it found)
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array', cellDates: true });
        const best = parseWorkbook(wb);

        if (!best) {
          setImportStatus({
            ok: false,
            text: `Couldn't find any P&L figures in "${file.name}". The sheet needs rows or columns named Net Revenue, Opex, Interest Expense or D&A (with month labels). Click ↓ Template to see the exact layout.`,
          });
          return;
        }

        const n = best.months.length;
        const imported = Array.from({ length: n }, (_, i) => ({
          label:           best.months[i] || (rows[i]?.label ?? `Month ${i + 1}`),
          netRevenue:      best.byMetric.netRevenue?.[i]      ?? 0,
          opex:            best.byMetric.opex?.[i]            ?? 0,
          interestExpense: best.byMetric.interestExpense?.[i] ?? 0,
          da:              best.byMetric.da?.[i]              ?? 0,
        }));
        setRows(imported);
        setNumMonths(n);

        const missing = Object.keys(METRIC_LABELS).filter(k => !best.matchedKeys.includes(k));
        setImportStatus({
          ok: true,
          text: `Imported ${n} month${n === 1 ? '' : 's'} from sheet "${best.sheet}" (${best.orientation}). `
            + `Matched: ${best.matchedKeys.map(k => METRIC_LABELS[k]).join(', ')}.`
            + (missing.length ? ` Not found (set to 0): ${missing.map(k => METRIC_LABELS[k]).join(', ')}.` : ''),
        });
      } catch (err) {
        setImportStatus({ ok: false, text: `Sorry, "${file.name}" could not be read as an Excel workbook.` });
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadTemplate = () => {
    const headers = ['Month', 'Net Revenue', 'Opex', 'Interest Expense', 'D&A'];
    const templateRows = makeEmptyRows(numMonths, startMonth, startYear).map(r => [r.label, 0, 0, 0, 0]);
    exportExcel('pl-template', headers, templateRows);
  };

  const exportWaterfall = (type) => {
    const headers = ['Item', 'Value'];
    const expRows = waterfallData.map(d => [d.fullLabel || d.name, d.raw ?? (d.type === 'negative' ? -d.value : d.value)]);
    if (type === 'csv') exportCSV('waterfall', headers, expRows);
    else exportExcel('waterfall', headers, expRows);
  };

  const marginPct = totals.netRevenue !== 0 ? (totals.pat / totals.netRevenue) * 100 : 0;
  const ebitdaMargin = totals.netRevenue !== 0 ? (totals.ebitda / totals.netRevenue) * 100 : 0;
  const gapToTarget = assumptions.endYearTarget - totals.totalNetProfit;

  // Data labels for the waterfall bars (raw signed value, above the bar top)
  const renderValueLabel = (props) => {
    const { x, y, width, index } = props;
    const d = waterfallData[index];
    if (!d || d.increment > 0) return null; // total-with-increment is labelled by renderTotalLabel
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--text)">
        {fmt(d.raw)}
      </text>
    );
  };
  const renderTotalLabel = (props) => {
    const { x, y, width, index } = props;
    const d = waterfallData[index];
    if (!d || !(d.increment > 0)) return null;
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--text)">
        {fmt(d.raw)}
      </text>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
        {[
          { label: 'Net Revenue',       value: fmt(totals.netRevenue),    color: '#3b7ff5' },
          { label: 'EBITDA',            value: fmt(totals.ebitda),        color: '#16a34a' },
          { label: 'EBITDA Margin',     value: `${ebitdaMargin.toFixed(1)}%`, color: '#16a34a' },
          { label: 'PAT (Base)',        value: fmt(totals.pat),           color: totals.pat >= 0 ? '#6c4de6' : '#dc2626' },
          { label: 'PAT Margin',        value: `${marginPct.toFixed(1)}%`, color: marginPct >= 0 ? '#6c4de6' : '#dc2626' },
          { label: 'Fillers',           value: fmt(totals.filler),        color: '#0ea5e9' },
          { label: 'Total Net Profit',  value: fmt(totals.totalNetProfit), color: totals.totalNetProfit >= 0 ? '#16a34a' : '#dc2626' },
          { label: 'End-Year Target',   value: fmt(assumptions.endYearTarget), color: '#e11d48' },
          { label: gapToTarget > 0 ? 'Gap to Target' : 'Above Target', value: `${gapToTarget > 0 ? '' : '+'}${fmt(Math.abs(gapToTarget))}`, color: gapToTarget > 0 ? '#dc2626' : '#16a34a' },
        ].map(card => (
          <div key={card.label} className="card">
            <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 6 }}>{card.label}</div>
            <div style={{ color: card.color, fontSize: 20, fontWeight: 700 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Forecast Assumptions + Generate */}
      <div className="card">
        <div className="section-title">Forecast Assumptions</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
          <Field label="Start Month">
            <select className="input" style={{ width: 120 }} value={startMonth} onChange={e => {
              const v = Number(e.target.value); setStartMonth(v); handlePeriodChange(v, startYear, numMonths);
            }}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </Field>
          <Field label="Start Year">
            <input className="input" type="number" style={{ width: 100 }} value={startYear} onChange={e => {
              const v = Number(e.target.value); setStartYear(v); handlePeriodChange(startMonth, v, numMonths);
            }} />
          </Field>
          <Field label="Months">
            <input className="input" type="number" style={{ width: 80 }} value={numMonths} min={1} max={60} onChange={e => {
              const v = Math.max(1, Number(e.target.value)); setNumMonths(v); handlePeriodChange(startMonth, startYear, v);
            }} />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 18 }}>
          <Field label="Net Revenue — Month 1 (RM)">
            <input className="input" type="number" value={assumptions.netRevenueStart} onChange={e => setAssume('netRevenueStart', e.target.value)} />
          </Field>
          <Field label="Net Revenue Growth (%/mo)">
            <input className="input" type="number" step={0.1} value={assumptions.netRevenueGrowth} onChange={e => setAssume('netRevenueGrowth', e.target.value)} />
          </Field>
          <Field label="Opex — Month 1 (RM)">
            <input className="input" type="number" value={assumptions.opexStart} onChange={e => setAssume('opexStart', e.target.value)} />
          </Field>
          <Field label="Opex Growth (%/mo)">
            <input className="input" type="number" step={0.1} value={assumptions.opexGrowth} onChange={e => setAssume('opexGrowth', e.target.value)} />
          </Field>
          <Field label="D&A / month (RM)">
            <input className="input" type="number" value={assumptions.daPerMonth} onChange={e => setAssume('daPerMonth', e.target.value)} />
          </Field>
          <Field label="Interest Expense / month (RM)">
            <input className="input" type="number" value={assumptions.interestPerMonth} onChange={e => setAssume('interestPerMonth', e.target.value)} />
          </Field>
          <Field label="End-Year Target (RM)">
            <input className="input" type="number" value={assumptions.endYearTarget} onChange={e => setAssume('endYearTarget', e.target.value)} />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <button className="btn-sm btn-primary" onClick={generateForecast}>⚡ Generate Forecast</button>
          <button className="btn-sm btn-primary" onClick={() => fileRef.current?.click()}>↑ Import Excel</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImport} />
          <button className="btn-sm btn-export" onClick={downloadTemplate}>↓ Template</button>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
          <strong>Generate</strong> compounds Month-1 values by the growth rate across all months. EBITDA = Net Revenue − Opex; PAT = EBITDA − D&A − Interest. Edit any cell below to override. <strong>Import</strong> reads Net Revenue, Opex, Interest Expense and D&A in either layout — metrics as rows or as columns.
        </div>
        {importStatus && (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12,
            background: importStatus.ok ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
            color: importStatus.ok ? '#16a34a' : '#dc2626',
            border: `1px solid ${importStatus.ok ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}`,
          }}>
            {importStatus.ok ? '✓ ' : '⚠ '}{importStatus.text}
          </div>
        )}
      </div>

      {/* Gap Fillers by Project */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Gap Fillers by Project</div>
          <button className="btn-sm btn-primary" onClick={addProject}>+ Add Project</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {projects.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>No projects yet. Add one to model incremental profit that fills the gap.</div>
          )}
          {projects.map((p, idx) => (
            <div key={p.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: PROJECT_COLORS[idx % PROJECT_COLORS.length], display: 'inline-block', marginBottom: 8 }} />
              <Field label="Project Name">
                <input className="input" style={{ width: 160 }} value={p.name} onChange={e => updateProject(p.id, 'name', e.target.value)} />
              </Field>
              <Field label="Monthly Profit (RM)">
                <input className="input" type="number" style={{ width: 140 }} value={p.amount} onChange={e => updateProject(p.id, 'amount', e.target.value)} />
              </Field>
              <Field label="Starts">
                <select className="input" style={{ width: 130 }} value={p.startIdx} onChange={e => updateProject(p.id, 'startIdx', e.target.value)}>
                  {rows.map((r, i) => <option key={i} value={i}>{r.label}</option>)}
                </select>
              </Field>
              <Field label="FY Contribution">
                <div style={{ fontSize: 14, fontWeight: 700, color: PROJECT_COLORS[idx % PROJECT_COLORS.length], padding: '8px 0' }}>{fmt(projFY(p))}</div>
              </Field>
              {p.overrides && Object.keys(p.overrides).length > 0 && (
                <button className="btn-sm btn-export" style={{ marginBottom: 2 }} onClick={() => resetProjectOverrides(p.id)} title="Clear manual monthly edits and use the amount/start above">
                  ↺ Reset months
                </button>
              )}
              <button className="btn-sm btn-export" style={{ marginBottom: 2 }} onClick={() => removeProject(p.id)}>Remove</button>
            </div>
          ))}
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            Tip: set a monthly amount & start month here for a quick baseline, or type directly into a project's cells in the Monthly P&L below to override individual months.
          </div>
        </div>
      </div>

      {/* P&L Grid */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Monthly P&L</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-sm btn-export" onClick={() => exportPL('csv')}>CSV</button>
            <button className="btn-sm btn-export" onClick={() => exportPL('excel')}>Excel</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', minWidth: 150 }}>Metric</th>
                {computed.map((r, i) => <th key={i} style={{ minWidth: 100 }}>{r.label}</th>)}
                <th style={{ color: 'var(--accent)', fontWeight: 700 }}>FY Total</th>
              </tr>
            </thead>
            <tbody>
              {/* Editable inputs + derived EBITDA/PAT in the requested order */}
              <PLInputRow row={INPUT_ROWS[0]} rows={rows} setCell={setCell} total={totals.netRevenue} />
              <PLInputRow row={INPUT_ROWS[1]} rows={rows} setCell={setCell} total={totals.opex} />
              <PLInputRow row={INPUT_ROWS[2]} rows={rows} setCell={setCell} total={totals.interestExpense} />
              <PLCalcRow label="EBITDA" color="#16a34a" values={computed.map(r => r.ebitda)} total={totals.ebitda} />
              <PLInputRow row={INPUT_ROWS[3]} rows={rows} setCell={setCell} total={totals.da} />
              <PLCalcRow label="PAT" color="#6c4de6" values={computed.map(r => r.pat)} total={totals.pat} bold />

              {/* Spacer */}
              <tr><td colSpan={computed.length + 2} style={{ height: 8, background: 'var(--surface2)', padding: 0 }} /></tr>

              {/* Fillers — project rows are editable per month */}
              <PLCalcRow label="Net Profit (Fillers)" color="#0ea5e9" values={computed.map(r => r.filler)} total={totals.filler} />
              {projects.map((p, idx) => (
                <PLProjectRow
                  key={p.id}
                  project={p}
                  color={PROJECT_COLORS[idx % PROJECT_COLORS.length]}
                  rows={rows}
                  valueAt={i => projAmt(p, i)}
                  total={projFY(p)}
                  onCell={(i, v) => setProjectCell(p.id, i, v)}
                />
              ))}
              <PLCalcRow label="Total Net Profit" color="#16a34a" values={computed.map(r => r.totalNetProfit)} total={totals.totalNetProfit} bold />
            </tbody>
          </table>
        </div>
      </div>

      {/* Waterfall */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>
            {waterfallMode === 'monthly' ? `Revenue Bridge — Monthly (${metricLabel})` : 'Profit Bridge — Fillers'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <button className={`tab-btn${waterfallMode === 'monthly' ? ' active' : ''}`} style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setWaterfallMode('monthly')}>Monthly Bridge</button>
              <button className={`tab-btn${waterfallMode === 'profit' ? ' active' : ''}`} style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setWaterfallMode('profit')}>Profit Bridge</button>
            </div>
            {waterfallMode === 'monthly' && (
              <select className="input" style={{ width: 160, padding: '5px 10px', fontSize: 12 }} value={waterfallMetric} onChange={e => setWaterfallMetric(e.target.value)}>
                <option value="totalNetProfit">Total Net Profit</option>
                <option value="pat">PAT (Base)</option>
                <option value="ebitda">EBITDA</option>
                <option value="netRevenue">Net Revenue</option>
              </select>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
              <span style={{ display: 'inline-block', width: 10, height: 0, borderTop: '2px dashed #e11d48' }} />
              Target
              <input
                type="number"
                className="input"
                style={{ width: 120, padding: '5px 8px', fontSize: 12 }}
                value={assumptions.endYearTarget}
                onChange={e => setAssume('endYearTarget', e.target.value)}
                placeholder="0"
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showValues} onChange={e => setShowValues(e.target.checked)} />
              Show values
            </label>
            <button className="btn-sm btn-export" onClick={() => exportWaterfall('csv')}>CSV</button>
            <button className="btn-sm btn-export" onClick={() => exportWaterfall('excel')}>Excel</button>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={waterfallData} margin={{ top: 24, right: 20, left: 20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={0} angle={waterfallData.length > 8 ? -35 : 0} textAnchor={waterfallData.length > 8 ? 'end' : 'middle'} height={waterfallData.length > 8 ? 60 : 30} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => fmt(v)} />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                formatter={(v, name, props) => {
                  if (name !== 'value') return null;
                  const raw = props.payload.raw;
                  const shown = raw !== undefined ? raw : props.payload.value;
                  return [fmtFull(shown), props.payload.fullLabel || props.payload.name];
                }}
                labelFormatter={() => ''}
              />
              <ReferenceLine y={0} stroke="var(--border)" strokeWidth={2} />
              {assumptions.endYearTarget > 0 && (
                <ReferenceLine
                  y={assumptions.endYearTarget}
                  stroke="#e11d48"
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  label={{ value: `Target ${fmt(assumptions.endYearTarget)}`, position: 'insideTopLeft', fill: '#e11d48', fontSize: 11, fontWeight: 600 }}
                />
              )}
              <Bar dataKey="invisible" stackId="wf" fill="transparent" legendType="none" />
              <Bar dataKey="value" stackId="wf" radius={[0, 0, 0, 0]} legendType="none" isAnimationActive={false}>
                {waterfallData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.type === 'total'    ? '#3b7ff5' :
                      entry.type === 'positive' ? '#16a34a' :
                      entry.type === 'filler'   ? '#f59e0b' : '#dc2626'
                    }
                    fillOpacity={entry.type === 'total' ? 0.9 : 1}
                  />
                ))}
                {showValues && <LabelList dataKey="value" content={renderValueLabel} />}
              </Bar>
              {/* Filler increment stacked on top of the Total Net Profit bar */}
              <Bar dataKey="increment" stackId="wf" radius={[4, 4, 0, 0]} fill="#f59e0b" legendType="none" isAnimationActive={false}>
                {showValues && <LabelList dataKey="increment" content={renderTotalLabel} />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            {(waterfallMode === 'profit'
              ? [['#3b7ff5','Base PAT / Total'],['#f59e0b','Project Fillers'],['#dc2626','Decrease']]
              : [['#16a34a','Increase'],['#dc2626','Decrease'],['#3b7ff5','Total / Subtotal']]
            ).map(([color, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: 'inline-block' }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trend Chart */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
          <div className="section-title" style={{ marginBottom: 0 }}>P&L Trend</div>
        </div>
        <div style={{ padding: 24 }}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={computed}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={Math.floor(computed.length / 6)} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => fmt(v)} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={v => fmtFull(v)} />
              <Legend />
              <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="netRevenue" name="Net Revenue" stroke="#3b7ff5" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="ebitda" name="EBITDA" stroke="#16a34a" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="pat" name="PAT" stroke="#6c4de6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="totalNetProfit" name="Total Net Profit" stroke="#0ea5e9" strokeWidth={2} strokeDasharray="4 2" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

  // ── local helper needing component scope ──
  function exportPL(type) {
    const headers = ['Metric', ...computed.map(r => r.label), 'FY Total'];
    const line = (label, vals, total) => [label, ...vals, total];
    const expRows = [
      line('Net Revenue', computed.map(r => r.netRevenue), totals.netRevenue),
      line('Opex', computed.map(r => r.opex), totals.opex),
      line('Interest Expense', computed.map(r => r.interestExpense), totals.interestExpense),
      line('EBITDA', computed.map(r => r.ebitda), totals.ebitda),
      line('D&A', computed.map(r => r.da), totals.da),
      line('PAT', computed.map(r => r.pat), totals.pat),
      line('Net Profit (Fillers)', computed.map(r => r.filler), totals.filler),
      ...projects.map(p => line(p.name, rows.map((_, i) => projAmt(p, i)), projFY(p))),
      line('Total Net Profit', computed.map(r => r.totalNetProfit), totals.totalNetProfit),
    ];
    if (type === 'csv') exportCSV('company-pl', headers, expRows);
    else exportExcel('company-pl', headers, expRows);
  }
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function PLInputRow({ row, rows, setCell, total }) {
  return (
    <tr>
      <td style={{ color: row.color, fontWeight: 600 }}>{row.label}</td>
      {rows.map((r, ri) => (
        <td key={ri} style={{ padding: '6px 8px' }}>
          <MoneyCell value={r[row.key]} onChange={val => setCell(ri, row.key, val)} />
        </td>
      ))}
      <td style={{ color: row.color, fontWeight: 700 }}>{fmtM(total)}</td>
    </tr>
  );
}

// Editable cell: shows the value in millions (e.g. 1.05M); reveals the raw
// number for editing while focused so the underlying figure stays precise.
function MoneyCell({ value, onChange }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      className="cell-input"
      type={focused ? 'number' : 'text'}
      value={focused ? (value || '') : fmtM(value)}
      placeholder="0"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={e => onChange(e.target.value)}
    />
  );
}

function PLProjectRow({ project, color, rows, valueAt, total, onCell }) {
  return (
    <tr>
      <td style={{ color, fontWeight: 600, paddingLeft: 28 }}>{project.name}</td>
      {rows.map((_, i) => (
        <td key={i} style={{ padding: '6px 8px' }}>
          <MoneyCell value={valueAt(i)} onChange={v => onCell(i, v)} />
        </td>
      ))}
      <td style={{ color, fontWeight: 700 }}>{fmtM(total)}</td>
    </tr>
  );
}

function PLCalcRow({ label, color, values, total, bold, indent }) {
  return (
    <tr>
      <td style={{ color, fontWeight: bold ? 700 : 600, paddingLeft: indent ? 28 : undefined }}>{label}</td>
      {values.map((v, i) => (
        <td key={i} style={{ color: bold ? color : 'var(--text)', fontWeight: bold ? 600 : 400 }}>{fmtM(v)}</td>
      ))}
      <td style={{ color, fontWeight: 700 }}>{fmtM(total)}</td>
    </tr>
  );
}
