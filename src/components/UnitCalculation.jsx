import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';
import { exportCSV, exportExcel } from '../utils/exportData';
import { useLocalStorage } from '../utils/useLocalStorage';
import Section from './Section';

const fmt = (n, dec = 2) => `$${Number(n).toFixed(dec)}`;
const fmtPct = (n) => `${Number(n).toFixed(1)}%`;
const fmtMult = (n) => `${Number(n).toFixed(2)}x`;

const defaultRevenue = [
  { id: 1, name: 'Transaction Fee Revenue', amount: 2.5, enabled: true },
  { id: 2, name: 'Interest Income (per unit)', amount: 1.2, enabled: true },
  { id: 3, name: 'Subscription Revenue', amount: 0.8, enabled: true },
  { id: 4, name: 'Late Payment Fee', amount: 0.3, enabled: true },
  { id: 5, name: 'FX Spread Revenue', amount: 0.6, enabled: false },
];

const defaultCosts = [
  { id: 1, name: 'Payment Processing Cost', amount: 0.8, enabled: true },
  { id: 2, name: 'Cost of Funds (per unit)', amount: 0.6, enabled: true },
  { id: 3, name: 'Customer Support Cost', amount: 0.25, enabled: true },
  { id: 4, name: 'Compliance & Risk Cost', amount: 0.15, enabled: true },
  { id: 5, name: 'Tech Infrastructure Cost', amount: 0.3, enabled: true },
  { id: 6, name: 'Bad Debt Provision', amount: 0.4, enabled: true },
];

const defaultScenarios = [
  { id: 1, name: 'Conservative', revenueMultiplier: 0.8, costMultiplier: 1.1 },
  { id: 2, name: 'Base Case', revenueMultiplier: 1.0, costMultiplier: 1.0 },
  { id: 3, name: 'Optimistic', revenueMultiplier: 1.2, costMultiplier: 0.9 },
];

let nextId = 10;

export default function UnitCalculation() {
  const [revenues, setRevenues] = useLocalStorage('ba-unit-revenues', defaultRevenue);
  const [costs, setCosts] = useLocalStorage('ba-unit-costs', defaultCosts);
  const [unitLabel, setUnitLabel] = useLocalStorage('ba-unit-label', 'per Active User / Month');
  const [monthlyUnits, setMonthlyUnits] = useLocalStorage('ba-unit-monthly-units', 100000);
  const [activeView, setActiveView] = useState('waterfall');

  const addRevenue = () => setRevenues(prev => [...prev, { id: nextId++, name: 'New Revenue Item', amount: 0, enabled: true }]);
  const addCost = () => setCosts(prev => [...prev, { id: nextId++, name: 'New Cost Item', amount: 0, enabled: true }]);

  const updateRevenue = (id, field, value) =>
    setRevenues(prev => prev.map(r => r.id === id ? { ...r, [field]: field === 'amount' ? Number(value) : value } : r));
  const updateCost = (id, field, value) =>
    setCosts(prev => prev.map(c => c.id === id ? { ...c, [field]: field === 'amount' ? Number(value) : value } : c));

  const removeRevenue = (id) => setRevenues(prev => prev.filter(r => r.id !== id));
  const removeCost = (id) => setCosts(prev => prev.filter(c => c.id !== id));

  const metrics = useMemo(() => {
    const totalRevenue = revenues.filter(r => r.enabled).reduce((s, r) => s + r.amount, 0);
    const totalCost = costs.filter(c => c.enabled).reduce((s, c) => s + c.amount, 0);
    const unitEconomics = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? (unitEconomics / totalRevenue) * 100 : 0;
    const ltv12 = unitEconomics * 12;
    const ltv24 = unitEconomics * 24;
    const monthlyProfit = unitEconomics * monthlyUnits;
    const annualProfit = monthlyProfit * 12;

    return { totalRevenue, totalCost, unitEconomics, margin, ltv12, ltv24, monthlyProfit, annualProfit };
  }, [revenues, costs, monthlyUnits]);

  const waterfallData = useMemo(() => {
    const data = [];
    let running = 0;

    revenues.filter(r => r.enabled).forEach(r => {
      data.push({ name: r.name, value: r.amount, type: 'revenue', start: running });
      running += r.amount;
    });

    data.push({ name: 'Total Revenue', value: running, type: 'total-revenue', start: 0, isTotal: true });

    costs.filter(c => c.enabled).forEach(c => {
      data.push({ name: c.name, value: -c.amount, type: 'cost', start: running });
      running -= c.amount;
    });

    data.push({ name: 'Unit Economics', value: running, type: running >= 0 ? 'positive' : 'negative', start: 0, isTotal: true });

    return data;
  }, [revenues, costs]);

  const scenarioData = useMemo(() =>
    defaultScenarios.map(s => {
      const rev = revenues.filter(r => r.enabled).reduce((sum, r) => sum + r.amount * s.revenueMultiplier, 0);
      const cost = costs.filter(c => c.enabled).reduce((sum, c) => sum + c.amount * s.costMultiplier, 0);
      const profit = rev - cost;
      return { name: s.name, revenue: rev, cost, profit, margin: rev > 0 ? (profit / rev) * 100 : 0 };
    }),
  [revenues, costs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
        {[
          { label: 'Unit Revenue', value: fmt(metrics.totalRevenue), color: 'var(--accent)' },
          { label: 'Unit Cost', value: fmt(metrics.totalCost), color: 'var(--red)' },
          { label: 'Unit Economics', value: fmt(metrics.unitEconomics), color: metrics.unitEconomics >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Unit Margin', value: fmtPct(metrics.margin), color: metrics.margin >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: '12-Month LTV', value: fmt(metrics.ltv12), color: 'var(--accent2)' },
          { label: 'Monthly Portfolio Profit', value: fmtPretty(metrics.monthlyProfit), color: metrics.monthlyProfit >= 0 ? 'var(--green)' : 'var(--red)' },
        ].map(card => (
          <div key={card.label} className="card">
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>{card.label}</div>
            <div style={{ color: card.color, fontSize: 20, fontWeight: 700 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Unit Label + Scale */}
      <Section title="Configuration">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>Unit Definition</label>
            <input
              className="input"
              type="text"
              value={unitLabel}
              onChange={e => setUnitLabel(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>Monthly Units (for portfolio projection)</label>
            <input
              className="input"
              type="number"
              value={monthlyUnits}
              onChange={e => setMonthlyUnits(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </Section>

      {/* Revenue + Cost Builder */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Revenue */}
        <Section
          title={<>Revenue Items <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}>({unitLabel})</span></>}
          right={<button className="btn-sm btn-green" onClick={addRevenue}>+ Add</button>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {revenues.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={e => updateRevenue(r.id, 'enabled', e.target.checked)}
                  style={{ accentColor: 'var(--green)', cursor: 'pointer' }}
                />
                <input
                  className="input"
                  type="text"
                  value={r.name}
                  onChange={e => updateRevenue(r.id, 'name', e.target.value)}
                  style={{ flex: 1, opacity: r.enabled ? 1 : 0.4 }}
                />
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 12 }}>$</span>
                  <input
                    className="input"
                    type="number"
                    value={r.amount}
                    step={0.01}
                    onChange={e => updateRevenue(r.id, 'amount', e.target.value)}
                    style={{ width: 90, paddingLeft: 22, opacity: r.enabled ? 1 : 0.4 }}
                  />
                </div>
                <button className="btn-icon" onClick={() => removeRevenue(r.id)} title="Remove">×</button>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>Total Revenue</span>
              <span style={{ color: 'var(--green)', fontWeight: 700 }}>{fmt(metrics.totalRevenue)}</span>
            </div>
          </div>
        </Section>

        {/* Costs */}
        <Section
          title={<>Cost Items <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}>({unitLabel})</span></>}
          right={<button className="btn-sm btn-red" onClick={addCost}>+ Add</button>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {costs.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={c.enabled}
                  onChange={e => updateCost(c.id, 'enabled', e.target.checked)}
                  style={{ accentColor: 'var(--red)', cursor: 'pointer' }}
                />
                <input
                  className="input"
                  type="text"
                  value={c.name}
                  onChange={e => updateCost(c.id, 'name', e.target.value)}
                  style={{ flex: 1, opacity: c.enabled ? 1 : 0.4 }}
                />
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 12 }}>$</span>
                  <input
                    className="input"
                    type="number"
                    value={c.amount}
                    step={0.01}
                    onChange={e => updateCost(c.id, 'amount', e.target.value)}
                    style={{ width: 90, paddingLeft: 22, opacity: c.enabled ? 1 : 0.4 }}
                  />
                </div>
                <button className="btn-icon" onClick={() => removeCost(c.id)} title="Remove">×</button>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>Total Cost</span>
              <span style={{ color: 'var(--red)', fontWeight: 700 }}>{fmt(metrics.totalCost)}</span>
            </div>
          </div>
        </Section>
      </div>

      {/* Charts */}
      <Section title="Charts" flush>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 24px' }}>
          {[
            { key: 'waterfall', label: 'Waterfall' },
            { key: 'scenarios', label: 'Scenarios' },
            { key: 'ltv', label: 'LTV Analysis' },
          ].map(tab => (
            <button
              key={tab.key}
              className={`tab-btn${activeView === tab.key ? ' active' : ''}`}
              onClick={() => setActiveView(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div style={{ padding: 24 }}>
          {activeView === 'waterfall' && (
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={waterfallData} margin={{ top: 10, right: 20, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}`} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}
                  formatter={(v, name, props) => [`$${Math.abs(props.payload.value).toFixed(2)}`, props.payload.name]} />
                <ReferenceLine y={0} stroke="var(--muted)" />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {waterfallData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        entry.isTotal
                          ? entry.type === 'total-revenue' ? 'var(--accent)' : entry.value >= 0 ? 'var(--green)' : 'var(--red)'
                          : entry.type === 'revenue' ? '#4f8ef7aa' : '#ef444488'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          {activeView === 'scenarios' && (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={scenarioData} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}`} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}
                  formatter={(v) => `$${v.toFixed(2)}`} />
                <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="3 3" />
                <Bar dataKey="revenue" fill="var(--accent)" name="Revenue" radius={[4,4,0,0]} />
                <Bar dataKey="cost" fill="var(--red)" name="Cost" radius={[4,4,0,0]} />
                <Bar dataKey="profit" name="Profit" radius={[4,4,0,0]}>
                  {scenarioData.map((entry, i) => (
                    <Cell key={i} fill={entry.profit >= 0 ? 'var(--green)' : 'var(--red)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          {activeView === 'ltv' && (
            <div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={[
                  { period: '3 Months', ltv: metrics.unitEconomics * 3 },
                  { period: '6 Months', ltv: metrics.unitEconomics * 6 },
                  { period: '12 Months', ltv: metrics.unitEconomics * 12 },
                  { period: '18 Months', ltv: metrics.unitEconomics * 18 },
                  { period: '24 Months', ltv: metrics.unitEconomics * 24 },
                  { period: '36 Months', ltv: metrics.unitEconomics * 36 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="period" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => `$${v.toFixed(1)}`} />
                  <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}
                    formatter={(v) => [`$${v.toFixed(2)}`, 'Cumulative Unit LTV']} />
                  <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="3 3" />
                  <Bar dataKey="ltv" radius={[4,4,0,0]}>
                    {[3,6,12,18,24,36].map((_, i) => (
                      <Cell key={i} fill={metrics.unitEconomics >= 0 ? 'var(--accent2)' : 'var(--red)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 20 }}>
                {[3,6,12,18,24,36].map(m => (
                  <div key={m} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 4 }}>{m}-Month LTV</div>
                    <div style={{ color: metrics.unitEconomics >= 0 ? 'var(--accent2)' : 'var(--red)', fontWeight: 700, fontSize: 18 }}>
                      {fmt(metrics.unitEconomics * m)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Summary Box */}
      <Section title="Unit Economics Summary">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <SummaryRow label="Revenue per Unit" value={fmt(metrics.totalRevenue)} color="var(--accent)" />
          <SummaryRow label="Cost per Unit" value={fmt(metrics.totalCost)} color="var(--red)" />
          <SummaryRow label="Unit Contribution" value={fmt(metrics.unitEconomics)} color={metrics.unitEconomics >= 0 ? 'var(--green)' : 'var(--red)'} />
          <SummaryRow label="Contribution Margin" value={fmtPct(metrics.margin)} color={metrics.margin >= 0 ? 'var(--green)' : 'var(--red)'} />
          <SummaryRow label="Revenue / Cost Ratio" value={metrics.totalCost > 0 ? fmtMult(metrics.totalRevenue / metrics.totalCost) : '—'} color="var(--amber)" />
          <SummaryRow label="Monthly Portfolio Profit" value={fmtPretty(metrics.monthlyProfit)} color={metrics.monthlyProfit >= 0 ? 'var(--green)' : 'var(--red)'} />
          <SummaryRow label="Annual Portfolio Profit" value={fmtPretty(metrics.annualProfit)} color={metrics.annualProfit >= 0 ? 'var(--green)' : 'var(--red)'} />
        </div>
        {/* Scenario table */}
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
          <button className="btn-sm btn-export" onClick={() => {
            const headers = ['Metric', ...scenarioData.map(s => s.name)];
            const rows = [
              ['Revenue / Unit', ...scenarioData.map(s => s.revenue.toFixed(2))],
              ['Cost / Unit', ...scenarioData.map(s => s.cost.toFixed(2))],
              ['Profit / Unit', ...scenarioData.map(s => s.profit.toFixed(2))],
              ['Margin (%)', ...scenarioData.map(s => s.margin.toFixed(1))],
              [`Monthly Profit (${(monthlyUnits/1000).toFixed(0)}K units)`, ...scenarioData.map(s => (s.profit * monthlyUnits).toFixed(2))],
            ];
            exportCSV('unit-economics', headers, rows);
          }}>CSV</button>
          <button className="btn-sm btn-export" onClick={() => {
            const headers = ['Metric', ...scenarioData.map(s => s.name)];
            const rows = [
              ['Revenue / Unit', ...scenarioData.map(s => s.revenue)],
              ['Cost / Unit', ...scenarioData.map(s => s.cost)],
              ['Profit / Unit', ...scenarioData.map(s => s.profit)],
              ['Margin (%)', ...scenarioData.map(s => s.margin)],
              [`Monthly Profit (${(monthlyUnits/1000).toFixed(0)}K units)`, ...scenarioData.map(s => s.profit * monthlyUnits)],
            ];
            exportExcel('unit-economics', headers, rows);
          }}>Excel</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Metric</th>
                {scenarioData.map((s, i) => <th key={i}>{s.name}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>Revenue / Unit</td>
                {scenarioData.map((s, i) => <td key={i} style={{ color: 'var(--accent)' }}>{fmt(s.revenue)}</td>)}
              </tr>
              <tr>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>Cost / Unit</td>
                {scenarioData.map((s, i) => <td key={i} style={{ color: 'var(--red)' }}>{fmt(s.cost)}</td>)}
              </tr>
              <tr>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>Profit / Unit</td>
                {scenarioData.map((s, i) => <td key={i} style={{ color: s.profit >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(s.profit)}</td>)}
              </tr>
              <tr>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>Margin</td>
                {scenarioData.map((s, i) => <td key={i} style={{ color: s.margin >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtPct(s.margin)}</td>)}
              </tr>
              <tr>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>Monthly Profit ({(monthlyUnits/1000).toFixed(0)}K units)</td>
                {scenarioData.map((s, i) => <td key={i} style={{ color: s.profit * monthlyUnits >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtPretty(s.profit * monthlyUnits)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function SummaryRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function fmtPretty(n) {
  return Math.abs(n) >= 1e6
    ? `$${(n / 1e6).toFixed(2)}M`
    : Math.abs(n) >= 1e3
    ? `$${(n / 1e3).toFixed(1)}K`
    : `$${n.toFixed(2)}`;
}
