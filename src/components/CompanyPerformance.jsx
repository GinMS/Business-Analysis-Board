import { useState, useMemo, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, LineChart, Line, Legend
} from 'recharts';
import * as XLSX from 'xlsx';
import { exportCSV, exportExcel } from '../utils/exportData';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const METRICS = [
  { key: 'netRevenue',      label: 'Net Revenue',       color: '#3b7ff5' },
  { key: 'opex',            label: 'Opex',              color: '#dc2626' },
  { key: 'ebitda',          label: 'EBITDA',            color: '#16a34a' },
  { key: 'da',              label: 'D&A',               color: '#d97706' },
  { key: 'interestExpense', label: 'Interest Expense',  color: '#8b5cf6' },
  { key: 'pat',             label: 'PAT',               color: '#6c4de6' },
];

const fmt = (n) =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M`
  : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}K`
  : `${Number(n).toFixed(0)}`;

const fmtFull = (n) => Number(n).toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function makeEmptyRows(months, startMonth, startYear) {
  return Array.from({ length: months }, (_, i) => {
    const mIdx = (startMonth + i) % 12;
    const yr   = startYear + Math.floor((startMonth + i) / 12);
    return {
      label: `${MONTHS[mIdx]} ${yr}`,
      netRevenue: 0,
      opex: 0,
      ebitda: 0,
      da: 0,
      interestExpense: 0,
      pat: 0,
    };
  });
}

export default function CompanyPerformance() {
  const [startMonth, setStartMonth] = useState(0);
  const [startYear,  setStartYear]  = useState(new Date().getFullYear());
  const [numMonths,  setNumMonths]  = useState(12);
  const [rows, setRows] = useState(() => makeEmptyRows(12, 0, new Date().getFullYear()));
  const [waterfallMonth, setWaterfallMonth] = useState('total');
  const fileRef = useRef();

  // Sync rows when period config changes
  const handlePeriodChange = (sm, sy, nm) => {
    const newRows = makeEmptyRows(nm, sm, sy);
    // carry over values for overlapping months
    newRows.forEach((nr) => {
      const existing = rows.find(r => r.label === nr.label);
      if (existing) Object.assign(nr, existing);
    });
    setRows(newRows);
  };

  const setCell = (rowIdx, key, value) => {
    setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, [key]: Number(value) || 0 } : r));
  };

  // ── Totals ───────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const sum = (key) => rows.reduce((s, r) => s + (r[key] || 0), 0);
    return { netRevenue: sum('netRevenue'), opex: sum('opex'), ebitda: sum('ebitda'), da: sum('da'), interestExpense: sum('interestExpense'), pat: sum('pat') };
  }, [rows]);

  // ── Waterfall data ───────────────────────────────────────────────────────
  const waterfallData = useMemo(() => {
    const src = waterfallMonth === 'total'
      ? totals
      : rows.find(r => r.label === waterfallMonth) ?? totals;

    const { netRevenue, opex, ebitda, da, interestExpense, pat } = src;
    // Each entry: { name, invisible (offset), value (bar height), type }
    return [
      { name: 'Net Revenue',      invisible: 0,                                 value: netRevenue,      type: 'positive' },
      { name: 'Opex',             invisible: Math.min(netRevenue, ebitda),       value: Math.abs(netRevenue - ebitda), type: 'negative' },
      { name: 'EBITDA',           invisible: 0,                                 value: ebitda,          type: 'total' },
      { name: 'D&A',              invisible: Math.min(ebitda, ebitda - da),      value: da,              type: 'negative' },
      { name: 'Interest Exp.',    invisible: Math.min(ebitda - da, pat),         value: interestExpense, type: 'negative' },
      { name: 'PAT',              invisible: 0,                                 value: pat,             type: pat >= 0 ? 'positive' : 'negative' },
    ];
  }, [waterfallMonth, rows, totals]);

  // ── Excel import ─────────────────────────────────────────────────────────
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
        ebitda:          ['EBITDA','Ebitda','ebitda'],
        da:              ['D&A','DA','da','Depreciation','D_A'],
        interestExpense: ['Interest Expense','Interest','interest_expense','InterestExpense'],
        pat:             ['PAT','Pat','pat','Profit After Tax'],
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
          ebitda:          findCol(row, colMap.ebitda),
          da:              findCol(row, colMap.da),
          interestExpense: findCol(row, colMap.interestExpense),
          pat:             findCol(row, colMap.pat),
        };
      });

      setRows(imported);
      setNumMonths(imported.length);
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadTemplate = () => {
    const headers = ['Month', 'Net Revenue', 'Opex', 'EBITDA', 'D&A', 'Interest Expense', 'PAT'];
    const templateRows = makeEmptyRows(numMonths, startMonth, startYear).map(r => [r.label, 0, 0, 0, 0, 0, 0]);
    exportExcel('pl-template', headers, templateRows);
  };

  const exportWaterfall = (type) => {
    const headers = ['Item', 'Value'];
    const expRows = waterfallData.map(d => [d.name, d.value]);
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
          { label: 'Net Revenue',     value: fmt(totals.netRevenue),    color: '#3b7ff5' },
          { label: 'Opex',            value: fmt(totals.opex),          color: '#dc2626' },
          { label: 'EBITDA',          value: fmt(totals.ebitda),        color: '#16a34a' },
          { label: 'EBITDA Margin',   value: `${ebitdaMargin.toFixed(1)}%`, color: '#16a34a' },
          { label: 'D&A',             value: fmt(totals.da),            color: '#d97706' },
          { label: 'Interest Exp.',   value: fmt(totals.interestExpense), color: '#8b5cf6' },
          { label: 'PAT',             value: fmt(totals.pat),           color: totals.pat >= 0 ? '#6c4de6' : '#dc2626' },
          { label: 'PAT Margin',      value: `${marginPct.toFixed(1)}%`, color: marginPct >= 0 ? '#6c4de6' : '#dc2626' },
        ].map(card => (
          <div key={card.label} className="card">
            <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 6 }}>{card.label}</div>
            <div style={{ color: card.color, fontSize: 20, fontWeight: 700 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Period Config + Import */}
      <div className="card">
        <div className="section-title">Period & Import</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>Start Month</label>
            <select className="input" style={{ width: 130 }} value={startMonth} onChange={e => {
              const v = Number(e.target.value);
              setStartMonth(v);
              handlePeriodChange(v, startYear, numMonths);
            }}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>Start Year</label>
            <input className="input" type="number" style={{ width: 110 }} value={startYear} onChange={e => {
              const v = Number(e.target.value);
              setStartYear(v);
              handlePeriodChange(startMonth, v, numMonths);
            }} />
          </div>
          <div>
            <label style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>Months</label>
            <input className="input" type="number" style={{ width: 90 }} value={numMonths} min={1} max={60} onChange={e => {
              const v = Math.max(1, Number(e.target.value));
              setNumMonths(v);
              handlePeriodChange(startMonth, startYear, v);
            }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-sm btn-primary" onClick={() => fileRef.current?.click()}>
              ↑ Import Excel
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImport} />
            <button className="btn-sm btn-export" onClick={downloadTemplate}>↓ Template</button>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
          Excel template columns: <strong>Month | Net Revenue | Opex | EBITDA | D&A | Interest Expense | PAT</strong>
        </div>
      </div>

      {/* Editable P&L Grid */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Monthly P&L Input</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-sm btn-export" onClick={() => {
              const headers = ['Metric', ...rows.map(r => r.label)];
              const expRows = METRICS.map(m => [m.label, ...rows.map(r => r[m.key])]);
              exportCSV('company-pl', headers, expRows);
            }}>CSV</button>
            <button className="btn-sm btn-export" onClick={() => {
              const headers = ['Metric', ...rows.map(r => r.label)];
              const expRows = METRICS.map(m => [m.label, ...rows.map(r => r[m.key])]);
              exportExcel('company-pl', headers, expRows);
            }}>Excel</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', minWidth: 140 }}>Metric</th>
                {rows.map((r, i) => <th key={i} style={{ minWidth: 110 }}>{r.label}</th>)}
                <th style={{ color: 'var(--accent)', fontWeight: 700 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map(metric => (
                <tr key={metric.key}>
                  <td style={{ color: metric.color, fontWeight: 600 }}>{metric.label}</td>
                  {rows.map((row, ri) => (
                    <td key={ri} style={{ padding: '6px 8px' }}>
                      <input
                        className="cell-input"
                        type="number"
                        value={row[metric.key] || ''}
                        placeholder="0"
                        onChange={e => setCell(ri, metric.key, e.target.value)}
                      />
                    </td>
                  ))}
                  <td style={{ color: metric.color, fontWeight: 700 }}>{fmt(totals[metric.key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Waterfall Chart */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>P&L Waterfall</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <select
                className="input"
                style={{ width: 160, padding: '5px 10px', fontSize: 12 }}
                value={waterfallMonth}
                onChange={e => setWaterfallMonth(e.target.value)}
              >
                <option value="total">Full Period Total</option>
                {rows.map(r => <option key={r.label} value={r.label}>{r.label}</option>)}
              </select>
            </div>
            <button className="btn-sm btn-export" onClick={() => exportWaterfall('csv')}>CSV</button>
            <button className="btn-sm btn-export" onClick={() => exportWaterfall('excel')}>Excel</button>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={waterfallData} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => fmt(v)} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                formatter={(v, name, props) => {
                  if (name === 'offset') return null;
                  return [fmtFull(props.payload.value), props.payload.name];
                }}
                labelFormatter={() => ''}
              />
              <ReferenceLine y={0} stroke="var(--border)" strokeWidth={2} />
              {/* invisible offset bar */}
              <Bar dataKey="invisible" stackId="wf" fill="transparent" legendType="none" />
              {/* visible value bar */}
              <Bar dataKey="value" stackId="wf" radius={[4, 4, 0, 0]} legendType="none">
                {waterfallData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.type === 'total'    ? '#3b7ff5' :
                      entry.type === 'positive' ? '#16a34a' : '#dc2626'
                    }
                    fillOpacity={entry.type === 'total' ? 0.85 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 8 }}>
            {[['#16a34a','Revenue / Profit'],['#dc2626','Deductions'],['#3b7ff5','Subtotals']].map(([color, label]) => (
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
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={Math.floor(rows.length / 6)} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => fmt(v)} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                formatter={v => fmtFull(v)}
              />
              <Legend />
              <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
              {METRICS.map(m => (
                <Line key={m.key} type="monotone" dataKey={m.key} name={m.label}
                  stroke={m.color} strokeWidth={2} dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
