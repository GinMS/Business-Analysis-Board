import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { exportCSV, exportExcel } from '../utils/exportData';
import { useLocalStorage } from '../utils/useLocalStorage';
import Section from './Section';

const fmtRM = (n) =>
  Math.abs(n) >= 1e6 ? `RM ${(n / 1e6).toFixed(2)}M`
  : Math.abs(n) >= 1e3 ? `RM ${(n / 1e3).toFixed(1)}K`
  : `RM ${Math.round(n || 0)}`;
const fmtFull = (n) => Number(n || 0).toLocaleString('en-MY', { maximumFractionDigits: 2 });

const todayISO = () => new Date().toISOString().slice(0, 10);
const isOverdue = (inv) => inv.status === 'Due' && inv.dueDate && inv.dueDate < todayISO();

const defaultInvoices = [
  { id: 1, number: 'INV-0001', party: 'Acme Sdn Bhd', issueDate: todayISO(), dueDate: todayISO(), amount: 10000, status: 'Due' },
];

export default function Invoices() {
  const [invoices, setInvoices] = useLocalStorage('ba-invoices', defaultInvoices);
  const [filter, setFilter] = useState('All'); // All | Due | Paid | Overdue

  const update = (id, key, val) =>
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, [key]: key === 'amount' ? (Number(val) || 0) : val } : inv));
  const addInvoice = () => {
    const id = (invoices.reduce((m, i) => Math.max(m, i.id), 0) || 0) + 1;
    const seq = String(invoices.length + 1).padStart(4, '0');
    setInvoices(prev => [...prev, { id, number: `INV-${seq}`, party: '', issueDate: todayISO(), dueDate: todayISO(), amount: 0, status: 'Due' }]);
  };
  const removeInvoice = (id) => setInvoices(prev => prev.filter(i => i.id !== id));

  const totals = useMemo(() => {
    const t = { invoiced: 0, paid: 0, outstanding: 0, overdue: 0, count: invoices.length, paidCount: 0, dueCount: 0 };
    invoices.forEach(inv => {
      const amt = Number(inv.amount) || 0;
      t.invoiced += amt;
      if (inv.status === 'Paid') { t.paid += amt; t.paidCount++; }
      else { t.outstanding += amt; t.dueCount++; if (isOverdue(inv)) t.overdue += amt; }
    });
    return t;
  }, [invoices]);

  const pieData = [
    { name: 'Paid', value: totals.paid, color: '#16a34a' },
    { name: 'Outstanding', value: totals.outstanding - totals.overdue, color: '#d97706' },
    { name: 'Overdue', value: totals.overdue, color: '#dc2626' },
  ].filter(d => d.value > 0);

  const visible = useMemo(() => {
    if (filter === 'All') return invoices;
    if (filter === 'Overdue') return invoices.filter(isOverdue);
    return invoices.filter(i => i.status === filter);
  }, [invoices, filter]);

  const exportInvoices = (type) => {
    const headers = ['Invoice #', 'Party', 'Issue Date', 'Due Date', 'Amount', 'Status', 'Overdue'];
    const rows = invoices.map(i => [i.number, i.party, i.issueDate, i.dueDate, Number(i.amount) || 0, i.status, isOverdue(i) ? 'Yes' : 'No']);
    if (type === 'csv') exportCSV('invoices', headers, rows);
    else exportExcel('invoices', headers, rows);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
        {[
          { label: 'Total Invoiced', value: fmtRM(totals.invoiced), color: '#3b7ff5' },
          { label: 'Paid', value: fmtRM(totals.paid), sub: `${totals.paidCount} invoice(s)`, color: '#16a34a' },
          { label: 'Outstanding', value: fmtRM(totals.outstanding), sub: `${totals.dueCount} due`, color: '#d97706' },
          { label: 'Overdue', value: fmtRM(totals.overdue), color: '#dc2626' },
        ].map(card => (
          <div key={card.label} className="card">
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>{card.label}</div>
            <div style={{ color: card.color, fontSize: 22, fontWeight: 700 }}>{card.value}</div>
            {card.sub && <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>{card.sub}</div>}
          </div>
        ))}
      </div>

      {/* Status breakdown */}
      <Section title="Status Breakdown" flush>
        <div style={{ padding: 24 }}>
          {pieData.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>No invoice amounts yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={pieData.length > 1 ? 2 : 0} isAnimationActive={false}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={v => `RM ${fmtFull(v)}`} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </Section>

      {/* Invoice register */}
      <Section
        title="Invoice Register"
        flush
        right={(
          <>
            <select className="input" style={{ width: 120, padding: '5px 10px', fontSize: 12 }} value={filter} onChange={e => setFilter(e.target.value)}>
              {['All', 'Due', 'Paid', 'Overdue'].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <button className="btn-sm btn-primary" onClick={addInvoice}>+ Add Invoice</button>
            <button className="btn-sm btn-export" onClick={() => exportInvoices('csv')}>CSV</button>
            <button className="btn-sm btn-export" onClick={() => exportInvoices('excel')}>Excel</button>
          </>
        )}
      >
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', minWidth: 120 }}>Invoice #</th>
                <th style={{ textAlign: 'left', minWidth: 160 }}>Party</th>
                <th style={{ minWidth: 140 }}>Issue Date</th>
                <th style={{ minWidth: 140 }}>Due Date</th>
                <th style={{ minWidth: 120 }}>Amount (RM)</th>
                <th style={{ minWidth: 110 }}>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No invoices to show.</td></tr>
              )}
              {visible.map(inv => (
                <tr key={inv.id} style={isOverdue(inv) ? { background: 'rgba(220,38,38,0.05)' } : undefined}>
                  <td style={{ padding: '6px 8px' }}>
                    <input className="cell-input" style={{ textAlign: 'left' }} value={inv.number} onChange={e => update(inv.id, 'number', e.target.value)} />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <input className="cell-input" style={{ textAlign: 'left' }} value={inv.party} placeholder="Client / Vendor" onChange={e => update(inv.id, 'party', e.target.value)} />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <input className="cell-input" type="date" value={inv.issueDate || ''} onChange={e => update(inv.id, 'issueDate', e.target.value)} />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <input className="cell-input" type="date" value={inv.dueDate || ''} onChange={e => update(inv.id, 'dueDate', e.target.value)} />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <input className="cell-input" type="number" value={inv.amount || ''} placeholder="0" onChange={e => update(inv.id, 'amount', e.target.value)} />
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <select
                      className="input"
                      style={{ padding: '5px 8px', fontSize: 12, color: inv.status === 'Paid' ? 'var(--green)' : (isOverdue(inv) ? 'var(--red)' : 'var(--amber)'), fontWeight: 600 }}
                      value={inv.status}
                      onChange={e => update(inv.id, 'status', e.target.value)}
                    >
                      <option value="Due">Due</option>
                      <option value="Paid">Paid</option>
                    </select>
                    {isOverdue(inv) && <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }}>Overdue</div>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn-sm btn-export" onClick={() => removeInvoice(inv.id)} title="Remove">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
