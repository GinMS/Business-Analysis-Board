import { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { exportCSV, exportExcel } from '../utils/exportData';
import { useLocalStorage } from '../utils/useLocalStorage';
import Section from './Section';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const COLORS = ['#3b7ff5', '#dc2626', '#16a34a', '#d97706', '#8b5cf6', '#0ea5e9', '#e11d48', '#14b8a6', '#f59e0b', '#6c4de6'];

const defaultConfig = { startMonth: 0, startYear: new Date().getFullYear(), numMonths: 12 };
const defaultItems = [
  { id: 1, name: 'Salaries & Wages', values: [] },
  { id: 2, name: 'Office Rent', values: [] },
  { id: 3, name: 'Software / SaaS', values: [] },
  { id: 4, name: 'Marketing', values: [] },
  { id: 5, name: 'Utilities & Internet', values: [] },
];

const fmtRM = (n) =>
  Math.abs(n) >= 1e6 ? `RM ${(n / 1e6).toFixed(2)}M`
  : Math.abs(n) >= 1e3 ? `RM ${(n / 1e3).toFixed(1)}K`
  : `RM ${Math.round(n || 0)}`;
const fmtFull = (n) => Number(n || 0).toLocaleString('en-MY', { maximumFractionDigits: 0 });

export default function CostAnalysis() {
  const [config, setConfig] = useLocalStorage('ba-cost-config', defaultConfig);
  const [items, setItems] = useLocalStorage('ba-cost-items', defaultItems);

  const setCfg = (key, val) => setConfig(prev => ({ ...prev, [key]: Number(val) }));

  const labels = useMemo(() => Array.from({ length: config.numMonths }, (_, i) => {
    const m = (config.startMonth + i) % 12;
    const y = config.startYear + Math.floor((config.startMonth + i) / 12);
    return `${MONTHS[m]} ${y}`;
  }), [config]);

  const valAt = (item, i) => (item.values && item.values[i] != null ? Number(item.values[i]) || 0 : 0);
  const setCell = (id, i, val) => {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const values = Array.from({ length: config.numMonths }, (_, j) => (it.values && it.values[j] != null ? it.values[j] : 0));
      values[i] = Number(val) || 0;
      return { ...it, values };
    }));
  };
  const addItem = () => {
    const id = (items.reduce((m, it) => Math.max(m, it.id), 0) || 0) + 1;
    setItems(prev => [...prev, { id, name: 'New Cost', values: [] }]);
  };
  const renameItem = (id, name) => setItems(prev => prev.map(it => it.id === id ? { ...it, name } : it));
  const removeItem = (id) => setItems(prev => prev.filter(it => it.id !== id));

  const monthTotals = useMemo(() => labels.map((_, i) => items.reduce((s, it) => s + valAt(it, i), 0)), [labels, items]);
  const itemFY = (it) => labels.reduce((s, _l, i) => s + valAt(it, i), 0);
  const grandTotal = monthTotals.reduce((s, v) => s + v, 0);
  const avgMonthly = labels.length ? grandTotal / labels.length : 0;
  const largest = items.reduce((best, it) => { const v = itemFY(it); return v > best.v ? { name: it.name, v } : best; }, { name: '—', v: 0 });

  const chartData = useMemo(() => labels.map((label, i) => {
    const row = { label, Total: monthTotals[i] };
    items.forEach(it => { row[it.name] = valAt(it, i); });
    return row;
  }), [labels, items, monthTotals]);

  const exportCosts = (type) => {
    const headers = ['Cost Item', ...labels, 'Total'];
    const rows = [
      ...items.map(it => [it.name, ...labels.map((_, i) => valAt(it, i)), itemFY(it)]),
      ['Total', ...monthTotals, grandTotal],
    ];
    if (type === 'csv') exportCSV('cost-analysis', headers, rows);
    else exportExcel('cost-analysis', headers, rows);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16 }}>
        {[
          { label: 'Avg Monthly Cost', value: fmtRM(avgMonthly), color: '#3b7ff5' },
          { label: 'Total (Period)', value: fmtRM(grandTotal), color: '#dc2626' },
          { label: 'Annual Run-Rate', value: fmtRM(avgMonthly * 12), color: '#d97706' },
          { label: 'Largest Category', value: largest.name, sub: fmtRM(largest.v), color: '#8b5cf6' },
          { label: 'Cost Items', value: String(items.length), color: '#16a34a' },
        ].map(card => (
          <div key={card.label} className="card">
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>{card.label}</div>
            <div style={{ color: card.color, fontSize: 20, fontWeight: 700 }}>{card.value}</div>
            {card.sub && <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>{card.sub}</div>}
          </div>
        ))}
      </div>

      {/* Period */}
      <Section title="Period">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
          <FieldBox label="Start Month">
            <select className="input" style={{ width: 130 }} value={config.startMonth} onChange={e => setCfg('startMonth', e.target.value)}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </FieldBox>
          <FieldBox label="Start Year">
            <input className="input" type="number" style={{ width: 110 }} value={config.startYear} onChange={e => setCfg('startYear', e.target.value)} />
          </FieldBox>
          <FieldBox label="Months">
            <input className="input" type="number" style={{ width: 90 }} min={1} max={60} value={config.numMonths} onChange={e => setCfg('numMonths', Math.max(1, Number(e.target.value)))} />
          </FieldBox>
        </div>
      </Section>

      {/* Editable monthly costs */}
      <Section
        title="Monthly Recurring Costs"
        flush
        right={(
          <>
            <button className="btn-sm btn-primary" onClick={addItem}>+ Add Cost</button>
            <button className="btn-sm btn-export" onClick={() => exportCosts('csv')}>CSV</button>
            <button className="btn-sm btn-export" onClick={() => exportCosts('excel')}>Excel</button>
          </>
        )}
      >
        <div style={{ padding: '10px 24px 0', fontSize: 11, color: 'var(--muted)' }}>
          Add cost lines and edit the amount for any month — every cell is editable.
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', minWidth: 180 }}>Cost Item</th>
                {labels.map((l, i) => <th key={i} style={{ minWidth: 100 }}>{l}</th>)}
                <th style={{ color: 'var(--accent)', fontWeight: 700 }}>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={it.id}>
                  <td style={{ padding: '6px 8px' }}>
                    <input className="cell-input" style={{ textAlign: 'left', fontWeight: 600, color: COLORS[idx % COLORS.length] }}
                      value={it.name} onChange={e => renameItem(it.id, e.target.value)} />
                  </td>
                  {labels.map((_, i) => (
                    <td key={i} style={{ padding: '6px 8px' }}>
                      <input className="cell-input" type="number" value={valAt(it, i) || ''} placeholder="0"
                        onChange={e => setCell(it.id, i, e.target.value)} />
                    </td>
                  ))}
                  <td style={{ color: COLORS[idx % COLORS.length], fontWeight: 700 }}>{fmtRM(itemFY(it))}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn-sm btn-export" onClick={() => removeItem(it.id)} title="Remove">✕</button>
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ color: 'var(--text)', fontWeight: 700 }}>Total</td>
                {monthTotals.map((v, i) => <td key={i} style={{ fontWeight: 700 }}>{fmtRM(v)}</td>)}
                <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmtRM(grandTotal)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* Trend */}
      <Section title="Monthly Cost Trend" flush>
        <div style={{ padding: 24 }}>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={Math.floor(labels.length / 8)} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => fmtRM(v)} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={v => fmtFull(v)} />
              <Legend />
              {items.map((it, idx) => (
                <Bar key={it.id} dataKey={it.name} stackId="cost" fill={COLORS[idx % COLORS.length]} />
              ))}
              <Line type="monotone" dataKey="Total" stroke="var(--text)" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Section>
    </div>
  );
}

function FieldBox({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}
