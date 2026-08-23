import { useMemo } from 'react';
import Section from '../Section';
import { useLocalStorage } from '../../utils/useLocalStorage';

const STAGES = ['Prospect', 'Pitch/Nego', 'Contract', 'Closed', 'KIV'];

export default function BusinessPartners() {
  const [partners, setPartners] = useLocalStorage('ba-biz-partners', []);

  const addPartner = () => {
    setPartners(prev => {
      const nextId = prev.reduce((m, p) => Math.max(m, p.id), 0) + 1;
      return [...prev, { id: nextId, category: 'General', name: '', product: '', pic: '', dealSize: '', stage: 'Prospect', notes: '' }];
    });
  };
  const updatePartner = (id, key, val) =>
    setPartners(prev => prev.map(p => (p.id === id ? { ...p, [key]: String(val) } : p)));
  const removePartner = (id) =>
    setPartners(prev => prev.filter(p => p.id !== id));

  const totalProspects = partners.length;
  const numCategories = useMemo(
    () => new Set(partners.map(p => (p.category || '').trim()).filter(Boolean)).size,
    [partners],
  );
  const inDiscussion = partners.filter(p => p.stage && p.stage !== 'Prospect').length;

  const sorted = useMemo(
    () => [...partners].sort((a, b) =>
      (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || '')),
    [partners],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI scorecard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div className="card">
          <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>Total Prospects</div>
          <div style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700 }}>{totalProspects}</div>
        </div>
        <div className="card">
          <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}># Categories</div>
          <div style={{ color: 'var(--accent)', fontSize: 22, fontWeight: 700 }}>{numCategories}</div>
        </div>
        <div className="card">
          <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}># In Discussion</div>
          <div style={{ color: 'var(--accent)', fontSize: 22, fontWeight: 700 }}>{inDiscussion}</div>
        </div>
      </div>

      {/* Partnership prospects */}
      <Section title="Partnership Prospects" flush right={<button className="btn-sm btn-primary" onClick={addPartner}>+ Add Partner</button>}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', minWidth: 120 }}>Category</th>
                <th style={{ textAlign: 'left', minWidth: 140 }}>Partner</th>
                <th style={{ textAlign: 'left', minWidth: 140 }}>Product</th>
                <th style={{ textAlign: 'left', minWidth: 110 }}>PIC</th>
                <th style={{ textAlign: 'left', minWidth: 100 }}>Deal Size</th>
                <th style={{ textAlign: 'left', minWidth: 120 }}>Stage</th>
                <th style={{ textAlign: 'left', minWidth: 180 }}>Notes</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => (
                <tr key={p.id}>
                  <td style={{ padding: '4px 6px' }}>
                    <input className="cell-input" style={{ textAlign: 'left' }} value={p.category} placeholder="General" onChange={e => updatePartner(p.id, 'category', e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input className="cell-input" style={{ textAlign: 'left' }} value={p.name} placeholder="Partner name" onChange={e => updatePartner(p.id, 'name', e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input className="cell-input" style={{ textAlign: 'left' }} value={p.product} placeholder="Product" onChange={e => updatePartner(p.id, 'product', e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input className="cell-input" style={{ textAlign: 'left' }} value={p.pic} placeholder="PIC" onChange={e => updatePartner(p.id, 'pic', e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input className="cell-input" style={{ textAlign: 'left' }} value={p.dealSize} placeholder="—" onChange={e => updatePartner(p.id, 'dealSize', e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <select className="input" value={p.stage} onChange={e => updatePartner(p.id, 'stage', e.target.value)}>
                      {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input className="cell-input" style={{ textAlign: 'left' }} value={p.notes} placeholder="Notes" onChange={e => updatePartner(p.id, 'notes', e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                    <button className="btn-sm" style={{ color: 'var(--red)' }} onClick={() => removePartner(p.id)} title="Remove">✕</button>
                  </td>
                </tr>
              ))}
              {!sorted.length && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
                    No partners yet — click “+ Add Partner” to start.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
