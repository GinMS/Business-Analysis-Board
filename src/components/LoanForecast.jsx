import { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const defaultInputs = {
  startMonth: 0,
  startYear: new Date().getFullYear(),
  months: 12,
  initialDisbursements: 500,
  disbursementsGrowthRate: 10,
  avgLoanSize: 5000,
  avgLoanTermMonths: 12,
  annualInterestRate: 18,
  originationFeePct: 2,
  nplRate: 3,
  recoveryRate: 30,
  costOfFundsPct: 8,
  operatingCostBase: 30000,
  operatingCostPerLoan: 20,
};

const fmt = (n, dec = 0) =>
  Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(dec + 1)}M`
  : Math.abs(n) >= 1e3 ? `$${(n / 1e3).toFixed(dec)}K`
  : `$${n.toFixed(dec)}`;

const fmtNum = (n) =>
  Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`;

const fmtPct = (n) => `${n.toFixed(1)}%`;

export default function LoanForecast() {
  const [inputs, setInputs] = useState(defaultInputs);
  const [activeTab, setActiveTab] = useState('portfolio');

  const set = (key, val) => setInputs(prev => ({ ...prev, [key]: Number(val) }));

  const data = useMemo(() => {
    const rows = [];
    let disbursements = inputs.initialDisbursements;
    let portfolioBalance = 0; // outstanding loan book

    for (let i = 0; i < inputs.months; i++) {
      const monthIdx = (inputs.startMonth + i) % 12;
      const year = inputs.startYear + Math.floor((inputs.startMonth + i) / 12);
      const label = `${MONTHS[monthIdx]} ${year}`;

      if (i > 0) {
        disbursements = Math.round(disbursements * (1 + inputs.disbursementsGrowthRate / 100));
      }

      const newDisbursedAmount = disbursements * inputs.avgLoanSize;
      const monthlyRepayment = portfolioBalance / inputs.avgLoanTermMonths;
      portfolioBalance = Math.max(0, portfolioBalance + newDisbursedAmount - monthlyRepayment);

      const interestIncome = portfolioBalance * (inputs.annualInterestRate / 100 / 12);
      const originationFees = newDisbursedAmount * (inputs.originationFeePct / 100);
      const grossRevenue = interestIncome + originationFees;

      const nplProvision = portfolioBalance * (inputs.nplRate / 100 / 12);
      const recoveredAmount = nplProvision * (inputs.recoveryRate / 100);
      const netCreditLoss = nplProvision - recoveredAmount;

      const costOfFunds = portfolioBalance * (inputs.costOfFundsPct / 100 / 12);
      const operatingCost = inputs.operatingCostBase + disbursements * inputs.operatingCostPerLoan;
      const totalCost = costOfFunds + operatingCost + netCreditLoss;

      const netRevenue = grossRevenue - netCreditLoss;
      const profit = grossRevenue - totalCost;
      const nim = portfolioBalance > 0 ? ((interestIncome - costOfFunds) / portfolioBalance) * 100 : 0;
      const roe = grossRevenue > 0 ? (profit / grossRevenue) * 100 : 0;

      rows.push({
        label,
        disbursements,
        newDisbursedAmount,
        portfolioBalance,
        interestIncome,
        originationFees,
        grossRevenue,
        netRevenue,
        nplProvision,
        netCreditLoss,
        costOfFunds,
        operatingCost,
        totalCost,
        profit,
        nim,
        roe,
      });
    }
    return rows;
  }, [inputs]);

  const totals = useMemo(() => ({
    revenue: data.reduce((s, r) => s + r.grossRevenue, 0),
    profit: data.reduce((s, r) => s + r.profit, 0),
    disbursed: data.reduce((s, r) => s + r.newDisbursedAmount, 0),
    nplTotal: data.reduce((s, r) => s + r.netCreditLoss, 0),
    peakPortfolio: Math.max(...data.map(r => r.portfolioBalance)),
    avgNim: data.length ? data.reduce((s, r) => s + r.nim, 0) / data.length : 0,
  }), [data]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
        {[
          { label: 'Total Revenue', value: fmt(totals.revenue), color: 'var(--accent)' },
          { label: 'Total Profit', value: fmt(totals.profit), color: totals.profit >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Total Disbursed', value: fmt(totals.disbursed), color: 'var(--accent2)' },
          { label: 'Peak Loan Book', value: fmt(totals.peakPortfolio), color: 'var(--amber)' },
          { label: 'Avg NIM', value: fmtPct(totals.avgNim), color: 'var(--green)' },
          { label: 'Total Credit Loss', value: fmt(totals.nplTotal), color: 'var(--red)' },
        ].map(card => (
          <div key={card.label} className="card">
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>{card.label}</div>
            <div style={{ color: card.color, fontSize: 22, fontWeight: 700 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Inputs */}
      <div className="card">
        <div className="section-title">Model Inputs</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <InputField label="Forecast Months" value={inputs.months} onChange={v => set('months', v)} min={1} max={60} />
          <InputField label="Initial Monthly Disbursements (#)" value={inputs.initialDisbursements} onChange={v => set('initialDisbursements', v)} />
          <InputField label="Disbursement Growth Rate (%)" value={inputs.disbursementsGrowthRate} onChange={v => set('disbursementsGrowthRate', v)} step={0.5} />
          <InputField label="Avg Loan Size ($)" value={inputs.avgLoanSize} onChange={v => set('avgLoanSize', v)} />
          <InputField label="Avg Loan Term (Months)" value={inputs.avgLoanTermMonths} onChange={v => set('avgLoanTermMonths', v)} min={1} />
          <InputField label="Annual Interest Rate (%)" value={inputs.annualInterestRate} onChange={v => set('annualInterestRate', v)} step={0.5} />
          <InputField label="Origination Fee (%)" value={inputs.originationFeePct} onChange={v => set('originationFeePct', v)} step={0.1} />
          <InputField label="NPL Rate (% of portfolio/yr)" value={inputs.nplRate} onChange={v => set('nplRate', v)} step={0.1} />
          <InputField label="Recovery Rate (%)" value={inputs.recoveryRate} onChange={v => set('recoveryRate', v)} />
          <InputField label="Cost of Funds (% / yr)" value={inputs.costOfFundsPct} onChange={v => set('costOfFundsPct', v)} step={0.5} />
          <InputField label="Base Operating Cost ($)" value={inputs.operatingCostBase} onChange={v => set('operatingCostBase', v)} />
          <InputField label="Cost per Loan Disbursed ($)" value={inputs.operatingCostPerLoan} onChange={v => set('operatingCostPerLoan', v)} step={1} />
        </div>
      </div>

      {/* Charts */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 24px' }}>
          {[
            { key: 'portfolio', label: 'Loan Book' },
            { key: 'revenue', label: 'Revenue & Profit' },
            { key: 'credit', label: 'Credit Risk' },
            { key: 'nim', label: 'NIM & ROE' },
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
          {activeTab === 'portfolio' && (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={Math.floor(data.length / 6)} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => fmt(v)} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={v => fmt(v)} />
                <Legend />
                <Area type="monotone" dataKey="portfolioBalance" stroke="var(--accent)" fill="url(#portfolioGrad)" strokeWidth={2} name="Loan Book Balance" />
                <Line type="monotone" dataKey="newDisbursedAmount" stroke="var(--green)" strokeWidth={2} dot={false} name="Monthly Disbursements" />
              </AreaChart>
            </ResponsiveContainer>
          )}
          {activeTab === 'revenue' && (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={Math.floor(data.length / 6)} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => fmt(v)} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={v => fmt(v)} />
                <Legend />
                <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="grossRevenue" stroke="var(--accent)" strokeWidth={2} dot={false} name="Gross Revenue" />
                <Line type="monotone" dataKey="interestIncome" stroke="var(--accent2)" strokeWidth={2} dot={false} name="Interest Income" />
                <Line type="monotone" dataKey="profit" stroke="var(--green)" strokeWidth={2} dot={false} name="Net Profit" />
                <Line type="monotone" dataKey="totalCost" stroke="var(--red)" strokeWidth={2} dot={false} name="Total Cost" />
              </LineChart>
            </ResponsiveContainer>
          )}
          {activeTab === 'credit' && (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={Math.floor(data.length / 6)} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => fmt(v)} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={v => fmt(v)} />
                <Legend />
                <Bar dataKey="nplProvision" fill="var(--amber)" name="NPL Provision" />
                <Bar dataKey="netCreditLoss" fill="var(--red)" name="Net Credit Loss" />
              </BarChart>
            </ResponsiveContainer>
          )}
          {activeTab === 'nim' && (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} interval={Math.floor(data.length / 6)} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => `${v.toFixed(1)}%`} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={v => `${v.toFixed(2)}%`} />
                <Legend />
                <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="nim" stroke="var(--green)" strokeWidth={2} dot={false} name="Net Interest Margin (%)" />
                <Line type="monotone" dataKey="roe" stroke="var(--accent)" strokeWidth={2} dot={false} name="Return on Revenue (%)" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Monthly Table */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Monthly Breakdown</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                {['Month','Disbursed #','Disbursed $','Loan Book','Interest','Orig. Fees','Revenue','Credit Loss','Op. Cost','Profit','NIM'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--text)', fontWeight: 500 }}>{row.label}</td>
                  <td>{fmtNum(row.disbursements)}</td>
                  <td>{fmt(row.newDisbursedAmount)}</td>
                  <td style={{ color: 'var(--accent)' }}>{fmt(row.portfolioBalance)}</td>
                  <td>{fmt(row.interestIncome)}</td>
                  <td>{fmt(row.originationFees)}</td>
                  <td style={{ color: 'var(--accent)' }}>{fmt(row.grossRevenue)}</td>
                  <td style={{ color: 'var(--red)' }}>{fmt(row.netCreditLoss)}</td>
                  <td>{fmt(row.operatingCost)}</td>
                  <td style={{ color: row.profit >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(row.profit)}</td>
                  <td style={{ color: 'var(--green)' }}>{fmtPct(row.nim)}</td>
                </tr>
              ))}
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
