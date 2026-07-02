import { useState, useMemo, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, LineChart, Line, Legend
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
};

const fmt = (n) =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M`
  : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}K`
  : `${Number(n || 0).toFixed(0)}`;

const fmtFull = (n) => Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

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

  // Contribution of a project in a given month index
  const projAmt = (p, i) => (i >= p.startIdx ? p.amount : 0);
  const projFY = (p) => p.amount * Math.max(0, rows.length - p.startIdx);

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
      // Base PAT → + each project filler → Total Net Profit
      const bars = [];
      let running = totals.pat;
      bars.push({ name: 'Base PAT', invisible: Math.min(0, running), value: Math.abs(running), type: 'total' });
      projects.forEach((p, idx) => {
        const v = projFY(p);
        const start = running;
        const end = running + v;
        bars.push({
          name: p.name,
          invisible: Math.min(start, end),
          value: Math.abs(v),
          type: v >= 0 ? 'positive' : 'negative',
          projIdx: idx,
        });
        running = end;
      });
      bars.push({ name: 'Total Net Profit', invisible: Math.min(0, running), value: Math.abs(running), type: 'total' });
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
        name: r.label.replace(' ', "'").slice(0, 6),
        fullLabel: r.label,
        invisible: Math.min(start, end),
        value: Math.abs(v),
        raw: v,
        type: v >= 0 ? 'positive' : 'negative',
      });
      cumulative = end;
    });
    bars.push({ name: 'FY Total', fullLabel: 'FY Total', invisible: Math.min(0, cumulative), value: Math.abs(cumulative), raw: cumulative, type: 'total' });
    return bars;
  }, [waterfallMode, waterfallMetric, computed, projects, totals]);

  const metricLabel = {
    totalNetProfit: 'Total Net Profit', pat: 'PAT', netRevenue: 'Net Revenue', ebitda: 'EBITDA',
  }[waterfallMetric];

  // ── Excel import ───────────────────────────────────────────────────────────
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: 0 });
      if (!raw.length) return;

      const colMap = {
        netRevenue:      ['Net Revenue','net_revenue','NetRevenue','net revenue'],
        opex:            ['Opex','OPEX','opex','Operating Expense'],
        da:              ['D&A','DA','da','Depreciation','D_A'],
        interestExpense: ['Interest Expense','Interest','interest_expense','InterestExpense'],
      };
      const findCol = (row, aliases) => {
        for (const a of aliases) if (row[a] !== undefined) return Number(row[a]) || 0;
        return 0;
      };

      const imported = raw.map((row, i) => {
        const labelCol = row['Month'] ?? row['month'] ?? row['Period'] ?? '';
        const label = labelCol ? String(labelCol) : (rows[i]?.label ?? `Month ${i + 1}`);
        return {
          label,
          netRevenue:      findCol(row, colMap.netRevenue),
          opex:            findCol(row, colMap.opex),
          da:              findCol(row, colMap.da),
          interestExpense: findCol(row, colMap.interestExpense),
        };
      });

      setRows(imported);
      setNumMonths(imported.length);
      e.target.value = '';
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
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <button className="btn-sm btn-primary" onClick={generateForecast}>⚡ Generate Forecast</button>
          <button className="btn-sm btn-primary" onClick={() => fileRef.current?.click()}>↑ Import Excel</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImport} />
          <button className="btn-sm btn-export" onClick={downloadTemplate}>↓ Template</button>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
          <strong>Generate</strong> compounds Month-1 values by the growth rate across all months. EBITDA = Net Revenue − Opex; PAT = EBITDA − D&A − Interest. Edit any cell below to override.
        </div>
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
              <button className="btn-sm btn-export" style={{ marginBottom: 2 }} onClick={() => removeProject(p.id)}>Remove</button>
            </div>
          ))}
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

              {/* Fillers */}
              <PLCalcRow label="Net Profit (Fillers)" color="#0ea5e9" values={computed.map(r => r.filler)} total={totals.filler} />
              {projects.map((p, idx) => (
                <PLCalcRow
                  key={p.id}
                  label={p.name}
                  color={PROJECT_COLORS[idx % PROJECT_COLORS.length]}
                  indent
                  values={rows.map((_, i) => projAmt(p, i))}
                  total={projFY(p)}
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
            <button className="btn-sm btn-export" onClick={() => exportWaterfall('csv')}>CSV</button>
            <button className="btn-sm btn-export" onClick={() => exportWaterfall('excel')}>Excel</button>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={waterfallData} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={0} angle={waterfallData.length > 8 ? -35 : 0} textAnchor={waterfallData.length > 8 ? 'end' : 'middle'} height={waterfallData.length > 8 ? 60 : 30} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => fmt(v)} />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                formatter={(v, name, props) => {
                  if (name === 'invisible') return null;
                  const raw = props.payload.raw;
                  const shown = raw !== undefined ? raw : props.payload.value;
                  return [fmtFull(shown), props.payload.fullLabel || props.payload.name];
                }}
                labelFormatter={() => ''}
              />
              <ReferenceLine y={0} stroke="var(--border)" strokeWidth={2} />
              <Bar dataKey="invisible" stackId="wf" fill="transparent" legendType="none" />
              <Bar dataKey="value" stackId="wf" radius={[4, 4, 0, 0]} legendType="none">
                {waterfallData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.type === 'total'    ? '#3b7ff5' :
                      entry.type === 'positive' ? '#16a34a' : '#dc2626'
                    }
                    fillOpacity={entry.type === 'total' ? 0.9 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            {[['#16a34a','Increase'],['#dc2626','Decrease'],['#3b7ff5','Total / Subtotal']].map(([color, label]) => (
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
          <input
            className="cell-input"
            type="number"
            value={r[row.key] || ''}
            placeholder="0"
            onChange={e => setCell(ri, row.key, e.target.value)}
          />
        </td>
      ))}
      <td style={{ color: row.color, fontWeight: 700 }}>{fmt(total)}</td>
    </tr>
  );
}

function PLCalcRow({ label, color, values, total, bold, indent }) {
  return (
    <tr>
      <td style={{ color, fontWeight: bold ? 700 : 600, paddingLeft: indent ? 28 : undefined }}>{label}</td>
      {values.map((v, i) => (
        <td key={i} style={{ color: bold ? color : 'var(--text)', fontWeight: bold ? 600 : 400 }}>{fmt(v)}</td>
      ))}
      <td style={{ color, fontWeight: 700 }}>{fmt(total)}</td>
    </tr>
  );
}
