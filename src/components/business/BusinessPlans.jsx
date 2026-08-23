import { useMemo } from 'react';
import { exportCSV, exportExcel } from '../../utils/exportData';
import { useLocalStorage } from '../../utils/useLocalStorage';
import Section from '../Section';

const fmtRM = (n) =>
  Math.abs(n) >= 1e6 ? `RM ${(n / 1e6).toFixed(2)}M`
  : Math.abs(n) >= 1e3 ? `RM ${(n / 1e3).toFixed(0)}K`
  : `RM ${Math.round(n || 0)}`;

const CATEGORIES = ['Partnership', 'Growth', 'Loyalty', 'Gov'];
const STAGES = ['Pitch/Nego', 'Contract', 'Closed', 'KIV'];

export default function BusinessPlans() {
  const [plans, setPlans] = useLocalStorage('ba-biz-plans', []);

  const weighted = (p) => (Number(p.estRevenue) || 0) * (Number(p.winProb) || 0) / 100;

  const addPlan = () => setPlans(prev => {
    const nextId = prev.reduce((m, p) => Math.max(m, p.id || 0), 0) + 1;
    return [...prev, {
      id: nextId,
      category: 'Partnership',
      name: '',
      product: '',
      pic: '',
      estRevenue: 0,
      winProb: 50,
      stage: 'Pitch/Nego',
      closingDate: '',
      goLiveDate: '',
      notes: '',
    }];
  });

  const updatePlan = (id, key, val) => setPlans(prev => prev.map(p =>
    p.id === id
      ? { ...p, [key]: (key === 'estRevenue' || key === 'winProb') ? (Number(val) || 0) : val }
      : p
  ));

  const removePlan = (id) => setPlans(prev => prev.filter(p => p.id !== id));

  const sorted = useMemo(() =>
    [...plans].sort((a, b) =>
      (a.category || '').localeCompare(b.category || '') ||
      (a.name || '').localeCompare(b.name || '')
    ), [plans]);

  const totalPipeline = plans.reduce((s, p) => s + (Number(p.estRevenue) || 0), 0);
  const weightedPipeline = plans.reduce((s, p) => s + weighted(p), 0);
  const numDeals = plans.length;
  const numClosed = plans.filter(p => p.stage === 'Closed').length;

  const kpis = [
    { label: 'Total Pipeline', value: fmtRM(totalPipeline), sub: 'RM / month' },
    { label: 'Weighted Pipeline', value: fmtRM(weightedPipeline), sub: 'RM / month' },
    { label: '# Deals', value: String(numDeals), sub: 'in pipeline' },
    { label: '# Closed', value: String(numClosed), sub: 'stage = Closed' },
  ];

  const exportPlans = (type) => {
    const headers = ['Category', 'Deal Name', 'Product', 'PIC', 'Est. RM/mo', 'Win %', 'Weighted (RM/mo)', 'Stage', 'Closing', 'Go-Live', 'Notes'];
    const rows = sorted.map(p => [
      p.category || '',
      p.name || '',
      p.product || '',
      p.pic || '',
      Math.round(Number(p.estRevenue) || 0),
      Math.round(Number(p.winProb) || 0),
      Math.round(weighted(p)),
      p.stage || '',
      p.closingDate || '',
      p.goLiveDate || '',
      p.notes || '',
    ]);
    (type === 'csv' ? exportCSV : exportExcel)('business-plans-pipeline', headers, rows);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI scorecard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {kpis.map(k => (
          <div key={k.label} className="card">
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>{k.label}</div>
            <div style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Pipeline table */}
      <Section title="Pipeline" flush right={(
        <>
          <button className="btn-sm btn-primary" onClick={addPlan}>+ Add Deal</button>
          <button className="btn-sm btn-export" onClick={() => exportPlans('csv')}>CSV</button>
        </>
      )}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', minWidth: 120 }}>Category</th>
                <th style={{ textAlign: 'left', minWidth: 160 }}>Deal Name</th>
                <th style={{ textAlign: 'left', minWidth: 130 }}>Product</th>
                <th style={{ textAlign: 'left', minWidth: 110 }}>PIC</th>
                <th style={{ minWidth: 100 }}>Est. RM/mo</th>
                <th style={{ minWidth: 70 }}>Win %</th>
                <th style={{ minWidth: 100 }}>Weighted</th>
                <th style={{ minWidth: 120 }}>Stage</th>
                <th style={{ textAlign: 'left', minWidth: 110 }}>Closing</th>
                <th style={{ textAlign: 'left', minWidth: 110 }}>Go-Live</th>
                <th style={{ textAlign: 'left', minWidth: 160 }}>Notes</th>
                <th style={{ minWidth: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={12} style={{ color: 'var(--muted)', padding: 20 }}>No deals yet. Click “+ Add Deal” to start the pipeline.</td></tr>
              )}
              {sorted.map(p => (
                <tr key={p.id}>
                  <td style={{ padding: '4px 6px' }}>
                    <select className="input" value={p.category} onChange={e => updatePlan(p.id, 'category', e.target.value)}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input className="cell-input" style={{ textAlign: 'left' }} value={p.name || ''} placeholder="Deal name" onChange={e => updatePlan(p.id, 'name', e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input className="cell-input" style={{ textAlign: 'left' }} value={p.product || ''} placeholder="Product" onChange={e => updatePlan(p.id, 'product', e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input className="cell-input" style={{ textAlign: 'left' }} value={p.pic || ''} placeholder="PIC" onChange={e => updatePlan(p.id, 'pic', e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input className="cell-input" type="number" value={p.estRevenue || ''} placeholder="0" onChange={e => updatePlan(p.id, 'estRevenue', e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input className="cell-input" type="number" value={p.winProb ?? ''} placeholder="0" onChange={e => updatePlan(p.id, 'winProb', e.target.value)} />
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{fmtRM(weighted(p))}</td>
                  <td style={{ padding: '4px 6px' }}>
                    <select className="input" value={p.stage} onChange={e => updatePlan(p.id, 'stage', e.target.value)}>
                      {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input className="cell-input" style={{ textAlign: 'left' }} value={p.closingDate || ''} placeholder="—" onChange={e => updatePlan(p.id, 'closingDate', e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input className="cell-input" style={{ textAlign: 'left' }} value={p.goLiveDate || ''} placeholder="—" onChange={e => updatePlan(p.id, 'goLiveDate', e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input className="cell-input" style={{ textAlign: 'left' }} value={p.notes || ''} placeholder="—" onChange={e => updatePlan(p.id, 'notes', e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <button className="btn-sm btn-export" onClick={() => removePlan(p.id)}>✕</button>
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
