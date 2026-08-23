import Section from '../Section';
import { useLocalStorage } from '../../utils/useLocalStorage';

const COLS = [
  { key: 'goal',        label: 'Goal' },
  { key: 'objective',   label: 'Objective' },
  { key: 'initiatives', label: 'Initiatives' },
  { key: 'pic',         label: 'PIC' },
  { key: 'launchDate',  label: 'Launch Date' },
  { key: 'notes',       label: 'Notes' },
];

export default function BusinessFeedback() {
  const [items, setItems] = useLocalStorage('ba-biz-feedback', []);

  const addItem = () => {
    const id = items.reduce((m, it) => Math.max(m, it.id), 0) + 1;
    setItems(prev => [...prev, { id, goal: '', objective: '', initiatives: '', pic: '', launchDate: '', notes: '' }]);
  };
  const updateItem = (id, key, val) =>
    setItems(prev => prev.map(it => (it.id === id ? { ...it, [key]: String(val) } : it)));
  const removeItem = (id) => setItems(prev => prev.filter(it => it.id !== id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Section title="Customer Rating" flush right={<button className="btn-sm btn-primary" onClick={addItem}>+ Add Initiative</button>}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                {COLS.map(c => <th key={c.key} style={{ textAlign: 'left', minWidth: 140 }}>{c.label}</th>)}
                <th style={{ width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={COLS.length + 1} style={{ color: 'var(--muted)', textAlign: 'left', padding: '12px 6px' }}>
                    No feedback initiatives yet.
                  </td>
                </tr>
              ) : items.map(it => (
                <tr key={it.id}>
                  {COLS.map(c => (
                    <td key={c.key} style={{ padding: '4px 6px' }}>
                      <input
                        className="cell-input"
                        style={{ textAlign: 'left' }}
                        value={it[c.key] || ''}
                        onChange={e => updateItem(it.id, c.key, e.target.value)}
                      />
                    </td>
                  ))}
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn-sm btn-export" onClick={() => removeItem(it.id)}>✕</button>
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
