import { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { exportCSV, exportExcel } from '../utils/exportData';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const defaultInputs = {
  startMonth: 0,
  startYear: new Date().getFullYear(),
  months: 12,
  initialUsers: 50000,
  monthlyGrowthRate: 8,
  avgTransactionValue: 250,
  transactionsPerUserPerMonth: 3,
  revenuePerTransactionPct: 1.5,
  churnRate: 2,
  acquisitionCostPerUser: 15,
  operatingCostBase: 20000,
  operatingCostPerUser: 0.5,
};

const fmt = (n, decimals = 0) =>
  n >= 1e6
    ? `$${(n / 1e6).toFixed(decimals + 1)}M`
    : n >= 1e3
    ? `$${(n / 1e3).toFixed(decimals)}K`
    : `$${n.toFixed(decimals)}`;

const fmtNum = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`;

export default function WalletForecast() {
  const [inputs, setInputs] = useState(defaultInputs);
  const [activeTab, setActiveTab] = useState('overview');

  const set = (key, val) => setInputs(prev => ({ ...prev, [key]: Number(val) }));

  const data = useMemo(() => {
    const rows = [];
    let users = inputs.initialUsers;
    let cumulativeRevenue = 0;
    let cumulativeNewUsers = 0;

    for (let i = 0; i < inputs.months; i++) {
      const monthIdx = (inputs.startMonth + i) % 12;
      const year = inputs.startYear + Math.floor((inputs.startMonth + i) / 12);
      const label = `${MONTHS[monthIdx]} ${year}`;

      const newUsers = i === 0 ? 0 : Math.round(users * (inputs.monthlyGrowthRate / 100));
      cumulativeNewUsers += newUsers;
      const churnedUsers = Math.round(users * (inputs.churnRate / 100));
      const endUsers = users + newUsers - churnedUsers;

      const avgUsers = (users + endUsers) / 2;
      const totalTransactions = avgUsers * inputs.transactionsPerUserPerMonth;
      const gmv = totalTransactions * inputs.avgTransactionValue;
      const revenue = gmv * (inputs.revenuePerTransactionPct / 100);
      const acquisitionCost = newUsers * inputs.acquisitionCostPerUser;
      const operatingCost = inputs.operatingCostBase + avgUsers * inputs.operatingCostPerUser;
      const totalCost = acquisitionCost + operatingCost;
      const profit = revenue - totalCost;
      cumulativeRevenue += revenue;

      rows.push({
        label,
        users: Math.round(endUsers),
        newUsers,
        churnedUsers,
        gmv,
        revenue,
        acquisitionCost,
        operatingCost,
        totalCost,
        profit,
        cumulativeRevenue,
        margin: revenue > 0 ? (profit / revenue) * 100 : 0,
      });

      users = endUsers;
    }
    return rows;
  }, [inputs]);

  const totals = useMemo(() => ({
    revenue: data.reduce((s, r) => s + r.revenue, 0),
    profit: data.reduce((s, r) => s + r.profit, 0),
    gmv: data.reduce((s, r) => s + r.gmv, 0),
    endUsers: data[data.length - 1]?.users ?? 0,
    avgMargin: data.length ? data.reduce((s, r) => s + r.margin, 0) / data.length : 0,
  }), [data]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
        {[
          { label: 'Total Revenue', value: fmt(totals.revenue), color: 'var(--accent)' },
          { label: 'Total Profit', value: fmt(totals.profit), color: totals.profit >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Total GMV', value: fmt(totals.gmv), color: 'var(--accent2)' },
          { label: 'End Users', value: fmtNum(totals.endUsers), color: 'var(--amber)' },
          { label: 'Avg Margin', value: `${totals.avgMargin.toFixed(1)}%`, color: totals.avgMargin >= 0 ? 'var(--green)' : 'var(--red)' },
        ].map(card => (
          <div key={card.label} className="card">
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>{card.label}</div>
            <div style={{ color: card.color, fontSize: 22, fontWeight: 700 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Inputs Panel */}
      <div className="card">
        <div className="section-title">Model Inputs</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <InputField label="Forecast Months" value={inputs.months} onChange={v => set('months', v)} min={1} max={60} />
          <InputField label="Initial Users" value={inputs.initialUsers} onChange={v => set('initialUsers', v)} />
          <InputField label="Monthly Growth Rate (%)" value={inputs.monthlyGrowthRate} onChange={v => set('monthlyGrowthRate', v)} step={0.1} />
          <InputField label="Monthly Churn Rate (%)" value={inputs.churnRate} onChange={v => set('churnRate', v)} step={0.1} />
          <InputField label="Avg Transaction Value ($)" value={inputs.avgTransactionValue} onChange={v => set('avgTransactionValue', v)} />
          <InputField label="Transactions / User / Month" value={inputs.transactionsPerUserPerMonth} onChange={v => set('transactionsPerUserPerMonth', v)} step={0.1} />
          <InputField label="Revenue per Transaction (%)" value={inputs.revenuePerTransactionPct} onChange={v => set('revenuePerTransactionPct', v)} step={0.1} />
          <InputField label="Acquisition Cost / User ($)" value={inputs.acquisitionCostPerUser} onChange={v => set('acquisitionCostPerUser', v)} step={0.5} />
          <InputField label="Base Operating Cost ($)" value={inputs.operatingCostBase} onChange={v => set('operatingCostBase', v)} />
          <InputField label="Operating Cost / User ($)" value={inputs.operatingCostPerUser} onChange={v => set('operatingCostPerUser', v)} step={0.1} />
        </div>
      </div>

      {/* Chart Tabs */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 24px' }}>
          {[
            { key: 'overview', label: 'Revenue & Profit' },
            { key: 'users', label: 'User Growth' },
            { key: 'gmv', label: 'GMV' },
            { key: 'costs', label: 'Cost Breakdown' },
          ].map(tab => (
            <button
              key={tab.key}
              className={`tab-btn${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div style={{ padding: 24 }}>
          {activeTab === 'overview' && (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={Math.floor(data.length / 6)} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => fmt(v)} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={(v) => fmt(v)} />
                <Legend />
                <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="revenue" stroke="var(--accent)" strokeWidth={2} dot={false} name="Revenue" />
                <Line type="monotone" dataKey="profit" stroke="var(--green)" strokeWidth={2} dot={false} name="Profit" />
                <Line type="monotone" dataKey="totalCost" stroke="var(--red)" strokeWidth={2} dot={false} name="Total Cost" />
              </LineChart>
            </ResponsiveContainer>
          )}
          {activeTab === 'users' && (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={Math.floor(data.length / 6)} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={fmtNum} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={fmtNum} />
                <Legend />
                <Bar dataKey="users" fill="var(--accent)" name="Total Users" />
                <Bar dataKey="newUsers" fill="var(--green)" name="New Users" />
                <Bar dataKey="churnedUsers" fill="var(--red)" name="Churned" />
              </BarChart>
            </ResponsiveContainer>
          )}
          {activeTab === 'gmv' && (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={Math.floor(data.length / 6)} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => fmt(v)} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={v => fmt(v)} />
                <Legend />
                <Bar dataKey="gmv" fill="var(--accent2)" name="GMV" />
                <Bar dataKey="revenue" fill="var(--accent)" name="Net Revenue" />
              </BarChart>
            </ResponsiveContainer>
          )}
          {activeTab === 'costs' && (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={Math.floor(data.length / 6)} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => fmt(v)} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={v => fmt(v)} />
                <Legend />
                <Bar dataKey="acquisitionCost" fill="var(--amber)" name="Acquisition Cost" stackId="cost" />
                <Bar dataKey="operatingCost" fill="var(--red)" name="Operating Cost" stackId="cost" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Monthly Table */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Monthly Breakdown</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-sm btn-export" onClick={() => {
              const headers = ['Metric', ...data.map(r => r.label)];
              const rows = [
                ['Users', ...data.map(r => r.users)],
                ['New Users', ...data.map(r => r.newUsers)],
                ['GMV', ...data.map(r => r.gmv.toFixed(2))],
                ['Revenue', ...data.map(r => r.revenue.toFixed(2))],
                ['Acq. Cost', ...data.map(r => r.acquisitionCost.toFixed(2))],
                ['Op. Cost', ...data.map(r => r.operatingCost.toFixed(2))],
                ['Profit', ...data.map(r => r.profit.toFixed(2))],
                ['Margin (%)', ...data.map(r => r.margin.toFixed(1))],
              ];
              exportCSV('wallet-forecast', headers, rows);
            }}>CSV</button>
            <button className="btn-sm btn-export" onClick={() => {
              const headers = ['Metric', ...data.map(r => r.label)];
              const rows = [
                ['Users', ...data.map(r => r.users)],
                ['New Users', ...data.map(r => r.newUsers)],
                ['GMV', ...data.map(r => r.gmv)],
                ['Revenue', ...data.map(r => r.revenue)],
                ['Acq. Cost', ...data.map(r => r.acquisitionCost)],
                ['Op. Cost', ...data.map(r => r.operatingCost)],
                ['Profit', ...data.map(r => r.profit)],
                ['Margin (%)', ...data.map(r => r.margin)],
              ];
              exportExcel('wallet-forecast', headers, rows);
            }}>Excel</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Metric</th>
                {data.map((row, i) => <th key={i}>{row.label}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>Users</td>
                {data.map((row, i) => <td key={i}>{fmtNum(row.users)}</td>)}
              </tr>
              <tr>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>New Users</td>
                {data.map((row, i) => <td key={i} style={{ color: 'var(--green)' }}>+{fmtNum(row.newUsers)}</td>)}
              </tr>
              <tr>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>GMV</td>
                {data.map((row, i) => <td key={i}>{fmt(row.gmv)}</td>)}
              </tr>
              <tr>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>Revenue</td>
                {data.map((row, i) => <td key={i} style={{ color: 'var(--accent)' }}>{fmt(row.revenue)}</td>)}
              </tr>
              <tr>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>Acq. Cost</td>
                {data.map((row, i) => <td key={i} style={{ color: 'var(--amber)' }}>{fmt(row.acquisitionCost)}</td>)}
              </tr>
              <tr>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>Op. Cost</td>
                {data.map((row, i) => <td key={i}>{fmt(row.operatingCost)}</td>)}
              </tr>
              <tr>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>Profit</td>
                {data.map((row, i) => <td key={i} style={{ color: row.profit >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(row.profit)}</td>)}
              </tr>
              <tr>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>Margin</td>
                {data.map((row, i) => <td key={i} style={{ color: row.margin >= 0 ? 'var(--green)' : 'var(--red)' }}>{row.margin.toFixed(1)}%</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, min, max, step = 1 }) {
  return (
    <div>
      <label style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => onChange(e.target.value)}
        className="input"
      />
    </div>
  );
}
