import { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { exportCSV, exportExcel } from '../utils/exportData';
import { useLocalStorage } from '../utils/useLocalStorage';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const defaultInputs = {
  startMonth: 0,
  startYear: new Date().getFullYear(),
  months: 12,
  initialUsers: 50000,
  monthlyGrowthRate: 8,
  churnRate: 2,
  avgTransactionValue: 250,
  transactionsPerUserPerMonth: 3,
  revenueTakeRate: 1.5,
  costDeductionRate: 0.5,
  partnerSharePct: 30,
};

const fmt = (n, decimals = 0) =>
  Math.abs(n) >= 1e6
    ? `RM ${(n / 1e6).toFixed(decimals + 1)}M`
    : Math.abs(n) >= 1e3
    ? `RM ${(n / 1e3).toFixed(decimals)}K`
    : `RM ${n.toFixed(decimals)}`;

const fmtNum = (n) =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M`
  : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}K`
  : `${Math.round(n)}`;

export default function RevenueShare() {
  const [inputs, setInputs] = useLocalStorage('ba-revenue-share-inputs', defaultInputs);
  const [activeTab, setActiveTab] = useState('split');

  const set = (key, val) => setInputs(prev => ({ ...prev, [key]: Number(val) }));

  const mySharePct = 100 - inputs.partnerSharePct;

  const data = useMemo(() => {
    const rows = [];
    let users = inputs.initialUsers;

    for (let i = 0; i < inputs.months; i++) {
      const monthIdx = (inputs.startMonth + i) % 12;
      const year = inputs.startYear + Math.floor((inputs.startMonth + i) / 12);
      const label = `${MONTHS[monthIdx]} ${year}`;

      const newUsers = i === 0 ? 0 : Math.round(users * (inputs.monthlyGrowthRate / 100));
      const churnedUsers = Math.round(users * (inputs.churnRate / 100));
      const endUsers = users + newUsers - churnedUsers;
      const avgUsers = (users + endUsers) / 2;

      const gtv = avgUsers * inputs.transactionsPerUserPerMonth * inputs.avgTransactionValue;
      const revenue = gtv * (inputs.revenueTakeRate / 100);
      const nettRevenue = revenue * (1 - inputs.costDeductionRate / 100);
      const myShare = nettRevenue * (mySharePct / 100);
      const partnerShare = nettRevenue * (inputs.partnerSharePct / 100);

      rows.push({
        label,
        users: Math.round(endUsers),
        gtv,
        revenue,
        nettRevenue,
        myShare,
        partnerShare,
      });

      users = endUsers;
    }
    return rows;
  }, [inputs, mySharePct]);

  const totals = useMemo(() => ({
    gtv: data.reduce((s, r) => s + r.gtv, 0),
    revenue: data.reduce((s, r) => s + r.revenue, 0),
    nettRevenue: data.reduce((s, r) => s + r.nettRevenue, 0),
    myShare: data.reduce((s, r) => s + r.myShare, 0),
    partnerShare: data.reduce((s, r) => s + r.partnerShare, 0),
    endUsers: data[data.length - 1]?.users ?? 0,
  }), [data]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
        {[
          { label: 'Total GTV', value: fmt(totals.gtv), color: 'var(--accent2)' },
          { label: 'Total Revenue', value: fmt(totals.revenue), color: 'var(--accent)' },
          { label: 'Total Nett Revenue', value: fmt(totals.nettRevenue), color: 'var(--text)' },
          { label: `My Share (${mySharePct}%)`, value: fmt(totals.myShare), color: 'var(--green)' },
          { label: `Partner Share (${inputs.partnerSharePct}%)`, value: fmt(totals.partnerShare), color: 'var(--amber)' },
          { label: 'End Users', value: fmtNum(totals.endUsers), color: 'var(--muted)' },
        ].map(card => (
          <div key={card.label} className="card">
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>{card.label}</div>
            <div style={{ color: card.color, fontSize: 20, fontWeight: 700 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Inputs */}
      <div className="card">
        <div className="section-title">Model Inputs</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <InputField label="Forecast Months" value={inputs.months} onChange={v => set('months', v)} min={1} max={60} />
          <InputField label="Initial Users" value={inputs.initialUsers} onChange={v => set('initialUsers', v)} />
          <InputField label="Monthly Growth Rate (%)" value={inputs.monthlyGrowthRate} onChange={v => set('monthlyGrowthRate', v)} step={0.1} />
          <InputField label="Monthly Churn Rate (%)" value={inputs.churnRate} onChange={v => set('churnRate', v)} step={0.1} />
          <InputField label="Avg Transaction Value (RM)" value={inputs.avgTransactionValue} onChange={v => set('avgTransactionValue', v)} />
          <InputField label="Transactions / User / Month" value={inputs.transactionsPerUserPerMonth} onChange={v => set('transactionsPerUserPerMonth', v)} step={0.1} />
          <InputField label="Revenue Take Rate (%)" value={inputs.revenueTakeRate} onChange={v => set('revenueTakeRate', v)} step={0.1} />
          <InputField label="Cost Deduction Rate (%)" value={inputs.costDeductionRate} onChange={v => set('costDeductionRate', v)} step={0.1} />
          {/* Partner split with live derived label */}
          <div>
            <label style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>
              Partner Share (%) — My Share auto: {mySharePct.toFixed(1)}%
            </label>
            <input
              type="number"
              value={inputs.partnerSharePct}
              min={0}
              max={100}
              step={1}
              onChange={e => set('partnerSharePct', Math.min(100, Math.max(0, e.target.value)))}
              className="input"
            />
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 24px' }}>
          {[
            { key: 'split', label: 'Revenue Split' },
            { key: 'growth', label: 'User Growth' },
            { key: 'nett', label: 'Nett Revenue Trend' },
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
          {activeTab === 'split' && (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={Math.floor(data.length / 6)} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => fmt(v)} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}
                  formatter={v => fmt(v)}
                />
                <Legend />
                <Bar dataKey="myShare" stackId="split" fill="var(--green)" name={`My Share (${mySharePct}%)`} radius={[0,0,0,0]} />
                <Bar dataKey="partnerShare" stackId="split" fill="var(--amber)" name={`Partner Share (${inputs.partnerSharePct}%)`} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {activeTab === 'growth' && (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={Math.floor(data.length / 6)} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={fmtNum} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={fmtNum} />
                <Legend />
                <Bar dataKey="users" fill="var(--accent)" name="Users" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {activeTab === 'nett' && (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={Math.floor(data.length / 6)} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => fmt(v)} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={v => fmt(v)} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="var(--accent)" strokeWidth={2} dot={false} name="Revenue" />
                <Line type="monotone" dataKey="nettRevenue" stroke="var(--text)" strokeWidth={2} dot={false} name="Nett Revenue" />
                <Line type="monotone" dataKey="myShare" stroke="var(--green)" strokeWidth={2} dot={false} name={`My Share (${mySharePct}%)`} />
                <Line type="monotone" dataKey="partnerShare" stroke="var(--amber)" strokeWidth={2} dot={false} name={`Partner Share (${inputs.partnerSharePct}%)`} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Monthly Breakdown Table — transposed */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Monthly Breakdown</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-sm btn-export" onClick={() => {
              const headers = ['Metric', ...data.map(r => r.label)];
              const rows = [
                ['Users', ...data.map(r => r.users)],
                ['Revenue (RM)', ...data.map(r => r.revenue.toFixed(2))],
                ['GTV', ...data.map(r => r.gtv.toFixed(2))],
                ['Nett Revenue', ...data.map(r => r.nettRevenue.toFixed(2))],
                [`My Share (${mySharePct}%)`, ...data.map(r => r.myShare.toFixed(2))],
                [`Partner Share (${inputs.partnerSharePct}%)`, ...data.map(r => r.partnerShare.toFixed(2))],
              ];
              exportCSV('revenue-share', headers, rows);
            }}>CSV</button>
            <button className="btn-sm btn-export" onClick={() => {
              const headers = ['Metric', ...data.map(r => r.label)];
              const rows = [
                ['Users', ...data.map(r => r.users)],
                ['Revenue (RM)', ...data.map(r => r.revenue)],
                ['GTV', ...data.map(r => r.gtv)],
                ['Nett Revenue', ...data.map(r => r.nettRevenue)],
                [`My Share (${mySharePct}%)`, ...data.map(r => r.myShare)],
                [`Partner Share (${inputs.partnerSharePct}%)`, ...data.map(r => r.partnerShare)],
              ];
              exportExcel('revenue-share', headers, rows);
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
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>Revenue (RM)</td>
                {data.map((row, i) => <td key={i} style={{ color: 'var(--accent)' }}>{fmt(row.revenue)}</td>)}
              </tr>
              <tr>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>GTV</td>
                {data.map((row, i) => <td key={i} style={{ color: 'var(--accent2)' }}>{fmt(row.gtv)}</td>)}
              </tr>
              <tr>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>Nett Revenue</td>
                {data.map((row, i) => <td key={i}>{fmt(row.nettRevenue)}</td>)}
              </tr>
              <tr>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>My Share ({mySharePct}%)</td>
                {data.map((row, i) => <td key={i} style={{ color: 'var(--green)' }}>{fmt(row.myShare)}</td>)}
              </tr>
              <tr>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>Partner Share ({inputs.partnerSharePct}%)</td>
                {data.map((row, i) => <td key={i} style={{ color: 'var(--amber)' }}>{fmt(row.partnerShare)}</td>)}
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
