import { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { exportCSV, exportExcel } from '../utils/exportData';
import { useLocalStorage } from '../utils/useLocalStorage';
import Section from './Section';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const PROJECT_COLORS = ['#0ea5e9', '#f59e0b', '#10b981', '#e11d48', '#8b5cf6', '#14b8a6'];

// Interest can be charged two ways:
//  • reducing — interest on the outstanding balance each month (a true APR)
//  • flat     — interest on the ORIGINAL principal for the whole tenure
// Malaysia's SKP standards require a reducing-balance basis for consumer credit
// and prohibit the Rule of 78, which this model never uses — interest always
// accrues on the monthly balance (actuarial basis).
const INTEREST_METHODS = {
  reducing: {
    label: 'Reducing Balance',
    hint: 'Interest is charged only on the outstanding principal remaining after prior repayments.',
  },
  flat: {
    label: 'Fixed (Flat) Rate',
    hint: 'Interest is charged on the original disbursed principal for the entire tenure.',
  },
};

// Monthly IRR of an equal-installment loan, solved by bisection: the rate that
// discounts the installments back to the amount actually received.
const monthlyIrr = (principal, installment, n) => {
  if (!(principal > 0) || !(installment > 0) || n < 1) return 0;
  if (installment * n <= principal) return 0;
  let lo = 0, hi = 1; // 0%..100% per month brackets any realistic loan
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const pv = mid === 0 ? installment * n : installment * (1 - Math.pow(1 + mid, -n)) / mid;
    if (pv > principal) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
};

// True cost of a loan, derived from its actual cash flows.
//   nominalApr — periodic IRR x 12 (simple annualisation, US-style APR)
//   eir        — periodic IRR compounded 12x (effective interest rate)
// An upfront origination fee reduces the net cash the borrower receives, which
// raises both figures (this is the IFRS 9 / MFRS 9 treatment of integral fees).
const loanCostRates = ({ rate, term, method, feePct = 0 }) => {
  const r = (rate || 0) / 100;
  const n = Math.max(1, Math.round(term || 1));
  const P = 1;
  const net = P * (1 - (feePct || 0) / 100); // cash actually received
  const installment = method === 'flat'
    ? (P + P * r * (n / 12)) / n                       // principal + flat interest, spread evenly
    : (r / 12) === 0 ? P / n : P * (r / 12) / (1 - Math.pow(1 + r / 12, -n)); // standard EMI
  const i = monthlyIrr(net, installment, n);
  return {
    monthly: i * 100,
    nominalApr: i * 12 * 100,
    eir: (Math.pow(1 + i, 12) - 1) * 100,
    installmentPerUnit: installment,          // installment per 1.00 of principal
    totalPayablePerUnit: installment * n,     // total repaid per 1.00 of principal
    financeChargePerUnit: installment * n - P + (P - net), // interest + upfront fee
  };
};

const defaultInputs = {
  startMonth: 0,
  startYear: new Date().getFullYear(),
  months: 12,
  initialDisbursements: 500,
  disbursementsGrowthRate: 10,
  avgLoanSize: 5000,
  avgLoanTermMonths: 12,
  annualInterestRate: 18,
  interestMethod: 'reducing',
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
  : `$${(n || 0).toFixed(dec)}`;

const fmtNum = (n) =>
  Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`;

const fmtPct = (n) => `${n.toFixed(1)}%`;

export default function LoanForecast() {
  const [inputs, setInputs] = useLocalStorage('ba-loan-inputs', defaultInputs);
  const [activeTab, setActiveTab] = useState('portfolio');
  // Loan Breakdown: editable per-month base values + projects that feed the totals
  const [loanBase, setLoanBase] = useLocalStorage('ba-loan-breakdown-base', []);
  const [loanProjects, setLoanProjects] = useLocalStorage('ba-loan-projects', []);

  const set = (key, val) => setInputs(prev => ({ ...prev, [key]: Number(val) }));

  const data = useMemo(() => {
    const rows = [];
    let disbursements = inputs.initialDisbursements;
    let portfolioBalance = 0; // outstanding loan book
    const term = Math.max(1, inputs.avgLoanTermMonths);
    const monthlyRate = inputs.annualInterestRate / 100 / 12;
    const isFlat = (inputs.interestMethod || 'reducing') === 'flat';
    // Disbursement cohorts: a flat-rate loan keeps charging interest on its
    // ORIGINAL principal until its term ends, so we track them individually.
    const cohorts = [];

    for (let i = 0; i < inputs.months; i++) {
      const monthIdx = (inputs.startMonth + i) % 12;
      const year = inputs.startYear + Math.floor((inputs.startMonth + i) / 12);
      const label = `${MONTHS[monthIdx]} ${year}`;

      if (i > 0) {
        disbursements = Math.round(disbursements * (1 + inputs.disbursementsGrowthRate / 100));
      }

      const newDisbursedAmount = disbursements * inputs.avgLoanSize;
      cohorts.push({ principal: newDisbursedAmount, age: 0 });

      // A cohort disbursed this month (age 0) accrues interest immediately and
      // pays its `term` equal principal installments over ages 1..term, so it
      // amortises to zero exactly at the end of its tenure.
      let monthlyRepayment = 0;
      let activePrincipal = 0;
      for (const c of cohorts) {
        if (c.age < term) activePrincipal += c.principal;
        if (c.age >= 1 && c.age <= term) monthlyRepayment += c.principal / term;
      }
      portfolioBalance = Math.max(0, portfolioBalance + newDisbursedAmount - monthlyRepayment);

      // Flat: original principal × rate. Reducing: outstanding balance × rate.
      const interestIncome = (isFlat ? activePrincipal : portfolioBalance) * monthlyRate;
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

      for (const c of cohorts) c.age++;

      rows.push({
        label, disbursements, newDisbursedAmount, portfolioBalance, interestIncome,
        activePrincipal, monthlyRepayment,
        originationFees, grossRevenue, netRevenue, nplProvision, netCreditLoss,
        costOfFunds, operatingCost, totalCost, profit, nim, roe,
      });
    }
    return rows;
  }, [inputs]);

  const totals = useMemo(() => ({
    revenue: data.reduce((s, r) => s + r.grossRevenue, 0),
    profit: data.reduce((s, r) => s + r.profit, 0),
    disbursed: data.reduce((s, r) => s + r.newDisbursedAmount, 0),
    nplTotal: data.reduce((s, r) => s + r.netCreditLoss, 0),
    peakPortfolio: data.length ? Math.max(...data.map(r => r.portfolioBalance)) : 0,
    avgNim: data.length ? data.reduce((s, r) => s + r.nim, 0) / data.length : 0,
  }), [data]);

  // ── Loan Breakdown ─────────────────────────────────────────────────────────
  const bkLabels = useMemo(() => Array.from({ length: inputs.months }, (_, i) => {
    const m = (inputs.startMonth + i) % 12;
    const y = inputs.startYear + Math.floor((inputs.startMonth + i) / 12);
    return `${MONTHS[m]} ${y}`;
  }), [inputs.months, inputs.startMonth, inputs.startYear]);

  const baseAt = (i, key) => (loanBase[i] ? Number(loanBase[i][key]) || 0 : 0);
  const setBaseCell = (i, key, val) => {
    setLoanBase(prev => {
      const next = Array.from({ length: inputs.months }, (_, j) => prev[j] || { loanBook: 0, interestIncome: 0 });
      next[i] = { ...next[i], [key]: Number(val) || 0 };
      return next;
    });
  };
  const projAt = (p, i, key) => (i >= p.startIdx ? Number(p[key]) || 0 : 0);
  const projFY = (p, key) => Number(p[key] || 0) * Math.max(0, inputs.months - p.startIdx);

  const breakdown = useMemo(() => bkLabels.map((label, i) => {
    const loanBookProjects = loanProjects.reduce((s, p) => s + projAt(p, i, 'loanBook'), 0);
    const interestProjects = loanProjects.reduce((s, p) => s + projAt(p, i, 'interestIncome'), 0);
    const loanBook = baseAt(i, 'loanBook') + loanBookProjects;
    const interestIncome = baseAt(i, 'interestIncome') + interestProjects;
    return { label, loanBook, interestIncome };
  }), [bkLabels, loanBase, loanProjects, inputs.months]);

  const bkTotals = useMemo(() => ({
    loanBook: breakdown.reduce((s, r) => s + r.loanBook, 0),
    interestIncome: breakdown.reduce((s, r) => s + r.interestIncome, 0),
  }), [breakdown]);

  // Loan projects CRUD
  const addLoanProject = () => {
    const id = (loanProjects.reduce((m, p) => Math.max(m, p.id), 0) || 0) + 1;
    setLoanProjects(prev => [...prev, { id, name: `Project ${prev.length + 1}`, loanBook: 0, interestIncome: 0, startIdx: 0 }]);
  };
  const updateLoanProject = (id, key, val) =>
    setLoanProjects(prev => prev.map(p => p.id === id ? { ...p, [key]: key === 'name' ? val : Number(val) || 0 } : p));
  const removeLoanProject = (id) => setLoanProjects(prev => prev.filter(p => p.id !== id));

  const exportBreakdown = (type) => {
    const headers = ['Metric', ...breakdown.map(r => r.label), 'Total'];
    const rows = [
      ['Loan Book', ...breakdown.map(r => r.loanBook), bkTotals.loanBook],
      ['Interest Income', ...breakdown.map(r => r.interestIncome), bkTotals.interestIncome],
    ];
    if (type === 'csv') exportCSV('loan-breakdown', headers, rows);
    else exportExcel('loan-breakdown', headers, rows);
  };

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
          {
            label: 'Disclosed EIR (p.a.)',
            value: fmtPct(loanCostRates({
              rate: inputs.annualInterestRate, term: inputs.avgLoanTermMonths,
              method: inputs.interestMethod || 'reducing', feePct: inputs.originationFeePct,
            }).eir),
            color: 'var(--accent)',
          },
        ].map(card => (
          <div key={card.label} className="card">
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>{card.label}</div>
            <div style={{ color: card.color, fontSize: 22, fontWeight: 700 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Inputs */}
      <Section title="Model Inputs">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <InputField label="Forecast Months" value={inputs.months} onChange={v => set('months', v)} min={1} max={60} />
          <InputField label="Initial Monthly Disbursements (#)" value={inputs.initialDisbursements} onChange={v => set('initialDisbursements', v)} />
          <InputField label="Disbursement Growth Rate (%)" value={inputs.disbursementsGrowthRate} onChange={v => set('disbursementsGrowthRate', v)} step={0.5} />
          <InputField label="Avg Loan Size ($)" value={inputs.avgLoanSize} onChange={v => set('avgLoanSize', v)} />
          <InputField label="Avg Loan Term (Months)" value={inputs.avgLoanTermMonths} onChange={v => set('avgLoanTermMonths', v)} min={1} />
          <div>
            <label style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>Interest Method</label>
            <select
              className="input"
              value={inputs.interestMethod || 'reducing'}
              onChange={e => setInputs(prev => ({ ...prev, interestMethod: e.target.value }))}
            >
              {Object.entries(INTEREST_METHODS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </div>
          <InputField label="Annual Interest Rate (%)" value={inputs.annualInterestRate} onChange={v => set('annualInterestRate', v)} step={0.5} />
          <InputField label="Origination Fee (%)" value={inputs.originationFeePct} onChange={v => set('originationFeePct', v)} step={0.1} />
          <InputField label="NPL Rate (% of portfolio/yr)" value={inputs.nplRate} onChange={v => set('nplRate', v)} step={0.1} />
          <InputField label="Recovery Rate (%)" value={inputs.recoveryRate} onChange={v => set('recoveryRate', v)} />
          <InputField label="Cost of Funds (% / yr)" value={inputs.costOfFundsPct} onChange={v => set('costOfFundsPct', v)} step={0.5} />
          <InputField label="Base Operating Cost ($)" value={inputs.operatingCostBase} onChange={v => set('operatingCostBase', v)} />
          <InputField label="Cost per Loan Disbursed ($)" value={inputs.operatingCostPerLoan} onChange={v => set('operatingCostPerLoan', v)} step={1} />
        </div>
        {(() => {
          const method = inputs.interestMethod || 'reducing';
          const args = { rate: inputs.annualInterestRate, term: inputs.avgLoanTermMonths, feePct: inputs.originationFeePct };
          const noFee = loanCostRates({ ...args, feePct: 0, method });
          const withFee = loanCostRates({ ...args, method });
          const red = loanCostRates({ ...args, method: 'reducing' });
          const flat = loanCostRates({ ...args, method: 'flat' });
          const P = inputs.avgLoanSize || 0;
          return (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Prominent EIR disclosure — SKP requires this regardless of nominal rate type */}
              <div style={{ padding: '14px 16px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                    Effective Interest Rate (EIR)
                  </span>
                  <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>{fmtPct(withFee.eir)}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    p.a. — actual annualised finance cost, including the {fmtPct(inputs.originationFeePct)} upfront fee
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, fontSize: 11, color: 'var(--muted)' }}>
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Nominal (quoted)</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{fmtPct(inputs.annualInterestRate)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>EIR — interest only</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--amber)' }}>{fmtPct(noFee.eir)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Monthly instalment</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{fmt(withFee.installmentPerUnit * P, 0)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total payable</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{fmt(withFee.totalPayablePerUnit * P, 0)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total finance charge</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>{fmt(withFee.financeChargePerUnit * P, 0)}</div>
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
                  EIR is the monthly IRR of the actual cash flows compounded 12× — <em>(1 + i)<sup>12</sup> − 1</em> — on a{' '}
                  {fmt(P, 0)} loan over {inputs.avgLoanTermMonths} months. Interest is accrued on the monthly balance
                  (actuarial basis); <strong>the Rule of 78 is not used</strong> anywhere in this model.
                  Simple-annualised APR (i × 12) would read {fmtPct(withFee.nominalApr)}.
                </div>
              </div>

              {/* Comparability: same nominal rate under both bases */}
              <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, fontSize: 11, color: 'var(--muted)' }}>
                <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                  Same {fmtPct(inputs.annualInterestRate)} nominal rate, {inputs.avgLoanTermMonths} months, {fmt(P, 0)} loan
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Basis</th>
                        <th>Disclosed EIR</th>
                        <th>Monthly instalment</th>
                        <th>Total finance charge</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ textAlign: 'left', color: 'var(--green)', fontWeight: 600 }}>Reducing balance</td>
                        <td style={{ fontWeight: 700 }}>{fmtPct(red.eir)}</td>
                        <td>{fmt(red.installmentPerUnit * P, 0)}</td>
                        <td>{fmt(red.financeChargePerUnit * P, 0)}</td>
                      </tr>
                      <tr>
                        <td style={{ textAlign: 'left', color: 'var(--red)', fontWeight: 600 }}>Flat rate</td>
                        <td style={{ fontWeight: 700, color: 'var(--red)' }}>{fmtPct(flat.eir)}</td>
                        <td>{fmt(flat.installmentPerUnit * P, 0)}</td>
                        <td style={{ color: 'var(--red)' }}>{fmt(flat.financeChargePerUnit * P, 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 6 }}>
                  On a flat basis the same headline rate costs the borrower{' '}
                  <strong style={{ color: 'var(--text)' }}>{fmt((flat.financeChargePerUnit - red.financeChargePerUnit) * P, 0)} more</strong>{' '}
                  — a disclosed EIR of {fmtPct(flat.eir)} vs {fmtPct(red.eir)}.
                </div>
              </div>
            </div>
          );
        })()}
      </Section>

      {/* Charts */}
      <Section title="Charts" flush>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 24px' }}>
          {[
            { key: 'portfolio', label: 'Loan Book' },
            { key: 'revenue', label: 'Revenue & Profit' },
            { key: 'credit', label: 'Credit Risk' },
            { key: 'nim', label: 'NIM & ROE' },
          ].map(tab => (
            <button key={tab.key} className={`tab-btn${activeTab === tab.key ? ' active' : ''}`} onClick={() => setActiveTab(tab.key)}>
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
      </Section>

      {/* Monthly Table */}
      <Section
        title="Monthly Breakdown"
        flush
        right={(
          <>
            <button className="btn-sm btn-export" onClick={() => {
              const headers = ['Metric', ...data.map(r => r.label)];
              const rows = [
                ['Disbursed #', ...data.map(r => r.disbursements)],
                ['Disbursed $', ...data.map(r => r.newDisbursedAmount.toFixed(2))],
                ['Loan Book', ...data.map(r => r.portfolioBalance.toFixed(2))],
                ['Interest Income', ...data.map(r => r.interestIncome.toFixed(2))],
                ['Orig. Fees', ...data.map(r => r.originationFees.toFixed(2))],
                ['Revenue', ...data.map(r => r.grossRevenue.toFixed(2))],
                ['Credit Loss', ...data.map(r => r.netCreditLoss.toFixed(2))],
                ['Op. Cost', ...data.map(r => r.operatingCost.toFixed(2))],
                ['Profit', ...data.map(r => r.profit.toFixed(2))],
                ['NIM (%)', ...data.map(r => r.nim.toFixed(2))],
              ];
              exportCSV('loan-forecast', headers, rows);
            }}>CSV</button>
            <button className="btn-sm btn-export" onClick={() => {
              const headers = ['Metric', ...data.map(r => r.label)];
              const rows = [
                ['Disbursed #', ...data.map(r => r.disbursements)],
                ['Disbursed $', ...data.map(r => r.newDisbursedAmount)],
                ['Loan Book', ...data.map(r => r.portfolioBalance)],
                ['Interest Income', ...data.map(r => r.interestIncome)],
                ['Orig. Fees', ...data.map(r => r.originationFees)],
                ['Revenue', ...data.map(r => r.grossRevenue)],
                ['Credit Loss', ...data.map(r => r.netCreditLoss)],
                ['Op. Cost', ...data.map(r => r.operatingCost)],
                ['Profit', ...data.map(r => r.profit)],
                ['NIM (%)', ...data.map(r => r.nim)],
              ];
              exportExcel('loan-forecast', headers, rows);
            }}>Excel</button>
          </>
        )}
      >
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Metric</th>
                {data.map((row, i) => <th key={i}>{row.label}</th>)}
              </tr>
            </thead>
            <tbody>
              <LoanTextRow label="Disbursed #" data={data} fn={r => fmtNum(r.disbursements)} />
              <LoanTextRow label="Disbursed $" data={data} fn={r => fmt(r.newDisbursedAmount)} />
              <LoanTextRow label="Loan Book" data={data} color="var(--accent)" fn={r => fmt(r.portfolioBalance)} />
              <LoanTextRow label="Interest Income" data={data} fn={r => fmt(r.interestIncome)} />
              <LoanTextRow label="Orig. Fees" data={data} fn={r => fmt(r.originationFees)} />
              <LoanTextRow label="Revenue" data={data} color="var(--accent)" fn={r => fmt(r.grossRevenue)} />
              <LoanTextRow label="Credit Loss" data={data} color="var(--red)" fn={r => fmt(r.netCreditLoss)} />
              <LoanTextRow label="Op. Cost" data={data} fn={r => fmt(r.operatingCost)} />
              <LoanTextRow label="Profit" data={data} fn={r => fmt(r.profit)} colorFn={r => r.profit >= 0 ? 'var(--green)' : 'var(--red)'} />
              <LoanTextRow label="NIM" data={data} color="var(--green)" fn={r => fmtPct(r.nim)} />
            </tbody>
          </table>
        </div>
      </Section>

      {/* Loan Breakdown (editable) */}
      <Section
        title="Loan Breakdown"
        flush
        right={(
          <>
            <button className="btn-sm btn-export" onClick={() => exportBreakdown('csv')}>CSV</button>
            <button className="btn-sm btn-export" onClick={() => exportBreakdown('excel')}>Excel</button>
          </>
        )}
      >
        <div style={{ padding: '10px 24px 0', fontSize: 11, color: 'var(--muted)' }}>
          Edit Loan Book and Interest Income per month. Totals include any projects added below.
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', minWidth: 160 }}>Metric</th>
                {bkLabels.map((l, i) => <th key={i} style={{ minWidth: 110 }}>{l}</th>)}
                <th style={{ color: 'var(--accent)', fontWeight: 700 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ color: 'var(--accent)', fontWeight: 600 }}>Loan Book (input)</td>
                {bkLabels.map((_, i) => (
                  <td key={i} style={{ padding: '6px 8px' }}>
                    <input className="cell-input" type="number" value={baseAt(i, 'loanBook') || ''} placeholder="0"
                      onChange={e => setBaseCell(i, 'loanBook', e.target.value)} />
                  </td>
                ))}
                <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmt(breakdown.reduce((s, r, i) => s + baseAt(i, 'loanBook'), 0))}</td>
              </tr>
              <tr>
                <td style={{ color: 'var(--accent2)', fontWeight: 600 }}>Interest Income (input)</td>
                {bkLabels.map((_, i) => (
                  <td key={i} style={{ padding: '6px 8px' }}>
                    <input className="cell-input" type="number" value={baseAt(i, 'interestIncome') || ''} placeholder="0"
                      onChange={e => setBaseCell(i, 'interestIncome', e.target.value)} />
                  </td>
                ))}
                <td style={{ color: 'var(--accent2)', fontWeight: 700 }}>{fmt(breakdown.reduce((s, r, i) => s + baseAt(i, 'interestIncome'), 0))}</td>
              </tr>
              {loanProjects.map((p, idx) => (
                <tr key={`lb-${p.id}`}>
                  <td style={{ color: PROJECT_COLORS[idx % PROJECT_COLORS.length], paddingLeft: 28 }}>{p.name} · Loan Book</td>
                  {bkLabels.map((_, i) => <td key={i}>{fmt(projAt(p, i, 'loanBook'))}</td>)}
                  <td style={{ color: PROJECT_COLORS[idx % PROJECT_COLORS.length], fontWeight: 700 }}>{fmt(projFY(p, 'loanBook'))}</td>
                </tr>
              ))}
              {loanProjects.map((p, idx) => (
                <tr key={`ii-${p.id}`}>
                  <td style={{ color: PROJECT_COLORS[idx % PROJECT_COLORS.length], paddingLeft: 28 }}>{p.name} · Interest Income</td>
                  {bkLabels.map((_, i) => <td key={i}>{fmt(projAt(p, i, 'interestIncome'))}</td>)}
                  <td style={{ color: PROJECT_COLORS[idx % PROJECT_COLORS.length], fontWeight: 700 }}>{fmt(projFY(p, 'interestIncome'))}</td>
                </tr>
              ))}
              <tr><td colSpan={bkLabels.length + 2} style={{ height: 8, background: 'var(--surface2)', padding: 0 }} /></tr>
              <tr>
                <td style={{ color: 'var(--accent)', fontWeight: 700 }}>Loan Book — Total</td>
                {breakdown.map((r, i) => <td key={i} style={{ color: 'var(--accent)', fontWeight: 600 }}>{fmt(r.loanBook)}</td>)}
                <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmt(bkTotals.loanBook)}</td>
              </tr>
              <tr>
                <td style={{ color: 'var(--accent2)', fontWeight: 700 }}>Interest Income — Total</td>
                {breakdown.map((r, i) => <td key={i} style={{ color: 'var(--accent2)', fontWeight: 600 }}>{fmt(r.interestIncome)}</td>)}
                <td style={{ color: 'var(--accent2)', fontWeight: 700 }}>{fmt(bkTotals.interestIncome)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* Loan Projects */}
      <Section
        title="Loan Breakdown Projects"
        right={<button className="btn-sm btn-primary" onClick={addLoanProject}>+ Add Project</button>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loanProjects.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              No projects yet. Add one to layer extra Loan Book and Interest Income into the breakdown above.
            </div>
          )}
          {loanProjects.map((p, idx) => (
            <div key={p.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: PROJECT_COLORS[idx % PROJECT_COLORS.length], marginBottom: 8 }} />
              <FieldBox label="Project Name">
                <input className="input" style={{ width: 150 }} value={p.name} onChange={e => updateLoanProject(p.id, 'name', e.target.value)} />
              </FieldBox>
              <FieldBox label="Loan Book / mo ($)">
                <input className="input" type="number" style={{ width: 130 }} value={p.loanBook} onChange={e => updateLoanProject(p.id, 'loanBook', e.target.value)} />
              </FieldBox>
              <FieldBox label="Interest Income / mo ($)">
                <input className="input" type="number" style={{ width: 150 }} value={p.interestIncome} onChange={e => updateLoanProject(p.id, 'interestIncome', e.target.value)} />
              </FieldBox>
              <FieldBox label="Starts">
                <select className="input" style={{ width: 130 }} value={p.startIdx} onChange={e => updateLoanProject(p.id, 'startIdx', e.target.value)}>
                  {bkLabels.map((l, i) => <option key={i} value={i}>{l}</option>)}
                </select>
              </FieldBox>
              <FieldBox label="FY Loan Book">
                <div style={{ fontSize: 13, fontWeight: 700, color: PROJECT_COLORS[idx % PROJECT_COLORS.length], padding: '8px 0' }}>{fmt(projFY(p, 'loanBook'))}</div>
              </FieldBox>
              <FieldBox label="FY Interest">
                <div style={{ fontSize: 13, fontWeight: 700, color: PROJECT_COLORS[idx % PROJECT_COLORS.length], padding: '8px 0' }}>{fmt(projFY(p, 'interestIncome'))}</div>
              </FieldBox>
              <button className="btn-sm btn-export" style={{ marginBottom: 2 }} onClick={() => removeLoanProject(p.id)}>Remove</button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function LoanTextRow({ label, data, fn, color, colorFn }) {
  return (
    <tr>
      <td style={{ color: 'var(--text)', fontWeight: 500 }}>{label}</td>
      {data.map((row, i) => <td key={i} style={{ color: colorFn ? colorFn(row) : (color || undefined) }}>{fn(row)}</td>)}
    </tr>
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
