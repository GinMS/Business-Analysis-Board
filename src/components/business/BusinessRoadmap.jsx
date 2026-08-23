import { useMemo } from 'react';
import Section from '../Section';
import { useLocalStorage } from '../../utils/useLocalStorage';

const DEFAULT_DEFS = [
  { pillar: 'Acquisition', goal: 'Bring new users in', primaryMetric: 'Conversion Rate', features: 'Referral program, onboarding, SEO / landing pages' },
  { pillar: 'Optimization', goal: 'Improve the core experience', primaryMetric: 'Task Completion Time', features: 'A/B testing, personalization, performance' },
  { pillar: 'Monetization', goal: 'Convert usage to revenue', primaryMetric: 'ARPU', features: 'Tiered pricing, in-app purchases, upsell triggers' },
  { pillar: 'Retention', goal: 'Keep users engaged', primaryMetric: 'Churn Rate', features: 'Notifications, gamification / streaks, support' },
  { pillar: 'Sustainability', goal: 'Scale reliably', primaryMetric: 'System Uptime / ROI', features: 'Scalable infra, data privacy, admin tools' },
];

export default function BusinessRoadmap() {
  const [launches, setLaunches] = useLocalStorage('ba-biz-launches', []);
  const [defs, setDefs] = useLocalStorage('ba-biz-definitions', DEFAULT_DEFS);

  // ── Product Launches CRUD ──────────────────────────────────────────────────
  const addLaunch = () => {
    const nextId = (launches.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1);
    setLaunches(prev => [...prev, {
      id: String(nextId), year: String(new Date().getFullYear()), pod: '', objective: '',
      initiative: '', pilot: '', goLive: '', launch: '', remarks: '',
    }]);
  };
  const updateLaunch = (id, key, val) =>
    setLaunches(prev => prev.map(r => (r.id === id ? { ...r, [key]: String(val) } : r)));
  const removeLaunch = (id) => setLaunches(prev => prev.filter(r => r.id !== id));

  const sorted = useMemo(
    () => [...launches].sort((a, b) => (a.year || '').localeCompare(b.year || '') || (Number(a.id) - Number(b.id))),
    [launches],
  );

  const objectiveSummary = useMemo(() => {
    const counts = {};
    launches.forEach(r => {
      const key = (r.objective || '').trim();
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · ');
  }, [launches]);

  // ── Product Definitions CRUD ───────────────────────────────────────────────
  const addDef = () =>
    setDefs(prev => [...prev, { pillar: '', goal: '', primaryMetric: '', features: '' }]);
  const updateDef = (idx, key, val) =>
    setDefs(prev => prev.map((r, i) => (i === idx ? { ...r, [key]: String(val) } : r)));
  const removeDef = (idx) => setDefs(prev => prev.filter((_, i) => i !== idx));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Product Launches */}
      <Section title="Product Launches" flush right={(
        <button className="btn-sm btn-primary" onClick={addLaunch}>+ Add Launch</button>
      )}>
        <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
          {launches.length
            ? <>{launches.length} launch{launches.length === 1 ? '' : 'es'}{objectiveSummary && <> · {objectiveSummary}</>}</>
            : 'No launches yet — add one to start building the roadmap.'}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', minWidth: 70 }}>Year</th>
                <th style={{ textAlign: 'left', minWidth: 100 }}>Pod</th>
                <th style={{ textAlign: 'left', minWidth: 130 }}>Objective</th>
                <th style={{ textAlign: 'left', minWidth: 160 }}>Initiative</th>
                <th style={{ textAlign: 'left', minWidth: 100 }}>Pilot</th>
                <th style={{ textAlign: 'left', minWidth: 100 }}>Go-Live</th>
                <th style={{ textAlign: 'left', minWidth: 100 }}>Launch</th>
                <th style={{ textAlign: 'left', minWidth: 180 }}>Remarks</th>
                <th style={{ minWidth: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>—</td></tr>
              )}
              {sorted.map(r => (
                <tr key={r.id}>
                  <td style={{ padding: '4px 6px' }}><input className="cell-input" style={{ textAlign: 'left' }} value={r.year} placeholder="2025" onChange={e => updateLaunch(r.id, 'year', e.target.value)} /></td>
                  <td style={{ padding: '4px 6px' }}><input className="cell-input" style={{ textAlign: 'left' }} value={r.pod} onChange={e => updateLaunch(r.id, 'pod', e.target.value)} /></td>
                  <td style={{ padding: '4px 6px' }}><input className="cell-input" style={{ textAlign: 'left' }} value={r.objective} onChange={e => updateLaunch(r.id, 'objective', e.target.value)} /></td>
                  <td style={{ padding: '4px 6px' }}><input className="cell-input" style={{ textAlign: 'left' }} value={r.initiative} onChange={e => updateLaunch(r.id, 'initiative', e.target.value)} /></td>
                  <td style={{ padding: '4px 6px' }}><input className="cell-input" style={{ textAlign: 'left' }} value={r.pilot} onChange={e => updateLaunch(r.id, 'pilot', e.target.value)} /></td>
                  <td style={{ padding: '4px 6px' }}><input className="cell-input" style={{ textAlign: 'left' }} value={r.goLive} onChange={e => updateLaunch(r.id, 'goLive', e.target.value)} /></td>
                  <td style={{ padding: '4px 6px' }}><input className="cell-input" style={{ textAlign: 'left' }} value={r.launch} onChange={e => updateLaunch(r.id, 'launch', e.target.value)} /></td>
                  <td style={{ padding: '4px 6px' }}><input className="cell-input" style={{ textAlign: 'left' }} value={r.remarks} onChange={e => updateLaunch(r.id, 'remarks', e.target.value)} /></td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn-sm btn-export" title="Remove" onClick={() => removeLaunch(r.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Product Definitions */}
      <Section title="Product Definitions" flush right={(
        <button className="btn-sm btn-primary" onClick={addDef}>+ Add Pillar</button>
      )}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', minWidth: 140 }}>Pillar</th>
                <th style={{ textAlign: 'left', minWidth: 200 }}>Goal</th>
                <th style={{ textAlign: 'left', minWidth: 160 }}>Primary Metric</th>
                <th style={{ textAlign: 'left', minWidth: 260 }}>Features</th>
                <th style={{ minWidth: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {defs.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>—</td></tr>
              )}
              {defs.map((r, idx) => (
                <tr key={idx}>
                  <td style={{ padding: '4px 6px' }}><input className="cell-input" style={{ textAlign: 'left' }} value={r.pillar} onChange={e => updateDef(idx, 'pillar', e.target.value)} /></td>
                  <td style={{ padding: '4px 6px' }}><input className="cell-input" style={{ textAlign: 'left' }} value={r.goal} onChange={e => updateDef(idx, 'goal', e.target.value)} /></td>
                  <td style={{ padding: '4px 6px' }}><input className="cell-input" style={{ textAlign: 'left' }} value={r.primaryMetric} onChange={e => updateDef(idx, 'primaryMetric', e.target.value)} /></td>
                  <td style={{ padding: '4px 6px' }}><input className="cell-input" style={{ textAlign: 'left' }} value={r.features} onChange={e => updateDef(idx, 'features', e.target.value)} /></td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn-sm btn-export" title="Remove" onClick={() => removeDef(idx)}>✕</button>
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
