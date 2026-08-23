import { useMemo, useRef } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { exportCSV, exportExcel } from '../../utils/exportData';
import { useLocalStorage } from '../../utils/useLocalStorage';
import { parseAdeWorkbook, monthLabel, yearsIn, DEFAULT_STREAMS } from '../../utils/adeImport';
import { seedFromPerformanceWorkbook } from '../../utils/perfImport';
import Section from '../Section';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtRM = (n) =>
  Math.abs(n) >= 1e6 ? `RM ${(n / 1e6).toFixed(2)}M`
  : Math.abs(n) >= 1e3 ? `RM ${(n / 1e3).toFixed(0)}K`
  : `RM ${Math.round(n || 0)}`;
const fmtNum = (n) => (Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n || 0)}`);
const fmtRatio = (n) => `${((n || 0) * 100).toFixed(2)}%`;
const fmtPct = (n) => `${(n || 0).toFixed(0)}%`;
const fmtVal = (kind, n) => kind === 'money' ? fmtRM(n) : kind === 'ratio' ? fmtRatio(n) : fmtNum(n);

const KPIS = [
  { key: 'nr',       label: 'Net Revenue (YTD)', kind: 'money' },
  { key: 'mtu',      label: 'MTU',               kind: 'num' },
  { key: 'ebUsers',  label: 'EB Users',          kind: 'num' },
  { key: 'loanBook', label: 'Loan Book',         kind: 'money', manual: true },
  { key: 'cost',     label: 'Cost Ratio',        kind: 'ratio', manual: true, lowerBetter: true },
];

const emptyActuals = { importedAt: null, sourceName: '', months: [], streams: {}, kpis: {} };

export default function BusinessPerformance() {
  const [actuals, setActuals] = useLocalStorage('ba-biz-actuals', emptyActuals);
  const [manual, setManual] = useLocalStorage('ba-biz-manual', {});          // manual stream actuals
  const [targets, setTargets] = useLocalStorage('ba-biz-targets', { streams: {}, annual: {} });
  const [kpiManual, setKpiManual] = useLocalStorage('ba-biz-kpi', {});       // manual KPI actuals (loanBook, cost)
  const [streams] = useLocalStorage('ba-biz-streams', DEFAULT_STREAMS);
  const [view, setView] = useLocalStorage('ba-biz-view', 'actual');         // actual | target | achievement
  const years = yearsIn(actuals);
  const [year, setYear] = useLocalStorage('ba-biz-year', String(new Date().getFullYear()));
  const activeYear = years.includes(year) ? year : (years[years.length - 1] || year);
  const adeRef = useRef();
  const perfRef = useRef();
  const jsonRef = useRef();

  const monthsOfYear = MONTHS.map((_, i) => `${activeYear}-${String(i + 1).padStart(2, '0')}`);

  const streamActual = (s, ym) => (s.source === 'manual' ? manual[s.key]?.[ym] : actuals.streams?.[s.key]?.[ym]) || 0;
  const streamTarget = (key, ym) => targets.streams?.[key]?.[ym] || 0;

  const setManualCell = (key, ym, val) =>
    setManual(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [ym]: Number(val) || 0 } }));
  const setTargetCell = (key, ym, val) =>
    setTargets(prev => ({ ...prev, streams: { ...prev.streams, [key]: { ...(prev.streams?.[key] || {}), [ym]: Number(val) || 0 } } }));
  const setAnnualTarget = (key, val) =>
    setTargets(prev => ({ ...prev, annual: { ...prev.annual, [key]: Number(val) || 0 } }));
  const setKpiActual = (key, val) => setKpiManual(prev => ({ ...prev, [key]: Number(val) || 0 }));

  // Per-month + FY totals across the configured streams.
  const grid = useMemo(() => {
    const perStreamFY = {};
    const monthTotals = monthsOfYear.map(() => ({ actual: 0, target: 0 }));
    streams.forEach(s => {
      let fyA = 0, fyT = 0;
      monthsOfYear.forEach((ym, i) => {
        const a = streamActual(s, ym), t = streamTarget(s.key, ym);
        fyA += a; fyT += t; monthTotals[i].actual += a; monthTotals[i].target += t;
      });
      perStreamFY[s.key] = { actual: fyA, target: fyT };
    });
    return { perStreamFY, monthTotals };
  }, [streams, actuals, manual, targets, activeYear]);

  const nrYtd = grid.monthTotals.reduce((s, m) => s + m.actual, 0);
  const nrTargetYtd = grid.monthTotals.reduce((s, m) => s + m.target, 0);

  const latestKpi = (metric) => {
    const series = actuals.kpis?.[metric] || {};
    const inYear = monthsOfYear.filter(ym => series[ym] != null);
    if (inYear.length) return series[inYear[inYear.length - 1]];
    return 0;
  };
  const kpiActual = (k) => {
    if (k.key === 'nr') return nrYtd;
    if (k.manual) return kpiManual[k.key] || 0;
    return latestKpi(k.key);
  };

  const chartData = useMemo(() => monthsOfYear.map((ym, i) => {
    const row = { label: MONTHS[i], Target: grid.monthTotals[i].target };
    streams.forEach(s => { row[s.label] = streamActual(s, ym); });
    return row;
  }), [monthsOfYear, streams, grid]);

  // ── Data source: import / export ───────────────────────────────────────────
  const importAde = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseAdeWorkbook(ev.target.result, file.name);
        if (!parsed.months.length) { alert('No recognizable monthly data found in that ADE file.'); return; }
        setActuals(parsed);
        const ys = [...new Set(parsed.months.map(m => m.slice(0, 4)))];
        if (ys.length) setYear(ys[ys.length - 1]);
      } catch { alert('Could not read that ADE workbook.'); }
      finally { e.target.value = ''; }
    };
    reader.readAsArrayBuffer(file);
  };

  const seedPerf = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const counts = seedFromPerformanceWorkbook(ev.target.result);
        alert(`Seeded from workbook:\n${Object.entries(counts).map(([k, v]) => `• ${v} ${k}`).join('\n')}\n\nReloading…`);
        window.location.reload();
      } catch { alert('Could not read that Performance workbook.'); }
      finally { e.target.value = ''; }
    };
    reader.readAsArrayBuffer(file);
  };

  const BIZ_KEYS = ['ba-biz-actuals', 'ba-biz-manual', 'ba-biz-targets', 'ba-biz-kpi', 'ba-biz-streams', 'ba-biz-year', 'ba-biz-plans', 'ba-biz-launches', 'ba-biz-definitions', 'ba-biz-feedback', 'ba-biz-partners'];
  const exportJson = () => {
    const data = {};
    BIZ_KEYS.forEach(k => { try { const v = localStorage.getItem(k); if (v != null) data[k] = JSON.parse(v); } catch { /* ignore */ } });
    const blob = new Blob([JSON.stringify({ app: 'Business Analysis', version: 1, exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `business-analysis-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const importJson = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const data = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed;
        const keys = Object.keys(data).filter(k => k.startsWith('ba-biz-'));
        if (!keys.length) { alert('No Business Analysis data in that file.'); return; }
        if (!window.confirm(`Load ${keys.length} section(s) from "${file.name}"? Replaces current Business Analysis data.`)) return;
        keys.forEach(k => localStorage.setItem(k, JSON.stringify(data[k])));
        window.location.reload();
      } catch { alert('That file is not a valid Business Analysis JSON.'); }
      finally { e.target.value = ''; }
    };
    reader.readAsText(file);
  };

  const exportGrid = (type) => {
    const headers = ['Stream', ...MONTHS.map(m => `${m} (A)`), ...MONTHS.map(m => `${m} (T)`), 'FY Actual', 'FY Target', 'Achievement %'];
    const rows = streams.map(s => [
      s.label,
      ...monthsOfYear.map(ym => Math.round(streamActual(s, ym))),
      ...monthsOfYear.map(ym => Math.round(streamTarget(s.key, ym))),
      Math.round(grid.perStreamFY[s.key].actual),
      Math.round(grid.perStreamFY[s.key].target),
      grid.perStreamFY[s.key].target ? Math.round(100 * grid.perStreamFY[s.key].actual / grid.perStreamFY[s.key].target) : 0,
    ]);
    (type === 'csv' ? exportCSV : exportExcel)(`business-nr-${activeYear}`, headers, rows);
  };

  const cell = (s, ym) => {
    const a = streamActual(s, ym), t = streamTarget(s.key, ym);
    if (view === 'target') {
      return <input className="cell-input" type="number" value={t || ''} placeholder="0" onChange={e => setTargetCell(s.key, ym, e.target.value)} />;
    }
    if (view === 'achievement') {
      const pct = t ? (a / t) * 100 : 0;
      return <span style={{ color: pct >= 100 ? 'var(--green)' : pct >= 80 ? 'var(--amber)' : 'var(--red)', fontWeight: 600 }}>{t ? `${pct.toFixed(0)}%` : '—'}</span>;
    }
    // actual view
    if (s.source === 'manual') {
      return <input className="cell-input" type="number" value={manual[s.key]?.[ym] || ''} placeholder="0" onChange={e => setManualCell(s.key, ym, e.target.value)} />;
    }
    return <span>{a ? fmtRM(a) : '—'}</span>;
  };

  const elapsed = grid.monthTotals.filter(m => m.actual > 0).length || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI scorecard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {KPIS.map(k => {
          const a = kpiActual(k), t = targets.annual?.[k.key] || 0;
          const pct = t ? (a / t) * 100 : 0;
          const good = k.lowerBetter ? (t && a <= t) : pct >= 100;
          const barColor = good ? 'var(--green)' : pct >= 80 ? 'var(--amber)' : 'var(--red)';
          return (
            <div key={k.key} className="card">
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>{k.label}</div>
              <div style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700 }}>
                {k.manual
                  ? <input className="cell-input" style={{ fontSize: 20, fontWeight: 700, width: 140, textAlign: 'left' }} type="number" value={kpiManual[k.key] || ''} placeholder="0" onChange={e => setKpiActual(k.key, e.target.value)} />
                  : fmtVal(k.kind, a)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
                <span>Target</span>
                <input className="cell-input" style={{ width: 90, textAlign: 'left' }} type="number" value={targets.annual?.[k.key] || ''} placeholder="0" onChange={e => setAnnualTarget(k.key, e.target.value)} />
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--surface2)', marginTop: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`, background: barColor }} />
              </div>
              <div style={{ fontSize: 11, color: barColor, marginTop: 4, fontWeight: 600 }}>{t ? `${fmtPct(pct)} of target` : 'Set a target'}</div>
            </div>
          );
        })}
      </div>

      {/* Data source */}
      <Section title="Data Source" right={(
        <>
          <button className="btn-sm btn-primary" onClick={() => adeRef.current?.click()}>↑ Import ADE .xlsx</button>
          <button className="btn-sm btn-export" onClick={exportJson}>↓ Export JSON</button>
          <button className="btn-sm btn-export" onClick={() => jsonRef.current?.click()}>↑ Import JSON</button>
          <button className="btn-sm btn-export" onClick={() => perfRef.current?.click()}>Seed from Workbook</button>
          <input ref={adeRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={importAde} />
          <input ref={perfRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={seedPerf} />
          <input ref={jsonRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={importJson} />
        </>
      )}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', fontSize: 13 }}>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Last imported</div>
            <div style={{ fontWeight: 600 }}>{actuals.importedAt ? new Date(actuals.importedAt).toLocaleString() : '— not yet imported —'}</div>
            {actuals.sourceName && <div style={{ color: 'var(--muted)', fontSize: 11 }}>{actuals.sourceName}</div>}
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Months detected</div>
            <div style={{ fontWeight: 600 }}>{actuals.months.length ? `${monthLabel(actuals.months[0])} – ${monthLabel(actuals.months[actuals.months.length - 1])}` : '—'}</div>
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Fiscal year</div>
            <select className="input" style={{ width: 120 }} value={activeYear} onChange={e => setYear(e.target.value)}>
              {(years.length ? years : [activeYear]).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
          Import converts the ADE raw export into this app's local JSON. Actuals for streams not in the raw file (Loyalty, Payflex, Government) are typed in below. Targets are set here and never overwritten by import.
        </div>
      </Section>

      {/* NR performance grid */}
      <Section title={`Net Revenue Performance — ${activeYear}`} flush right={(
        <>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {['actual', 'target', 'achievement'].map(v => (
              <button key={v} className={`tab-btn${view === v ? ' active' : ''}`} style={{ padding: '5px 12px', fontSize: 12, textTransform: 'capitalize' }} onClick={() => setView(v)}>{v}</button>
            ))}
          </div>
          <button className="btn-sm btn-export" onClick={() => exportGrid('csv')}>CSV</button>
          <button className="btn-sm btn-export" onClick={() => exportGrid('excel')}>Excel</button>
        </>
      )}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', minWidth: 150 }}>Stream</th>
                {MONTHS.map(m => <th key={m} style={{ minWidth: 84 }}>{m}</th>)}
                <th style={{ color: 'var(--accent)', fontWeight: 700 }}>FY</th>
              </tr>
            </thead>
            <tbody>
              {streams.map(s => {
                const fy = grid.perStreamFY[s.key];
                const fyVal = view === 'target' ? fy.target : view === 'achievement' ? (fy.target ? `${Math.round(100 * fy.actual / fy.target)}%` : '—') : fy.actual;
                return (
                  <tr key={s.key}>
                    <td style={{ textAlign: 'left', fontWeight: 600, color: s.color }}>
                      {s.label}{s.source === 'manual' && <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 11 }}> · manual</span>}
                    </td>
                    {monthsOfYear.map(ym => <td key={ym} style={{ padding: '4px 6px' }}>{cell(s, ym)}</td>)}
                    <td style={{ color: s.color, fontWeight: 700 }}>{typeof fyVal === 'number' ? fmtRM(fyVal) : fyVal}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ fontWeight: 700 }}>Total</td>
                {grid.monthTotals.map((m, i) => (
                  <td key={i} style={{ fontWeight: 700 }}>
                    {view === 'achievement' ? (m.target ? `${Math.round(100 * m.actual / m.target)}%` : '—') : fmtRM(view === 'target' ? m.target : m.actual)}
                  </td>
                ))}
                <td style={{ color: 'var(--accent)', fontWeight: 700 }}>
                  {view === 'achievement' ? (nrTargetYtd ? `${Math.round(100 * nrYtd / nrTargetYtd)}%` : '—') : fmtRM(view === 'target' ? nrTargetYtd : nrYtd)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ padding: 20 }}>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => fmtRM(v)} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={v => fmtRM(v)} />
              <Legend />
              {streams.map(s => <Bar key={s.key} dataKey={s.label} stackId="nr" fill={s.color} />)}
              <Line type="monotone" dataKey="Target" stroke="var(--text)" strokeWidth={2.5} strokeDasharray="5 3" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* Progress to target */}
      <Section title="Progress to Target">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {KPIS.map(k => {
            const a = kpiActual(k), t = targets.annual?.[k.key] || 0;
            const pct = t ? (a / t) * 100 : 0;
            const projected = k.key === 'nr' && elapsed ? (a / elapsed) * 12 : null;
            const gap = t - a;
            const barColor = (k.lowerBetter ? (t && a <= t) : pct >= 100) ? 'var(--green)' : pct >= 80 ? 'var(--amber)' : 'var(--red)';
            return (
              <div key={k.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{k.label}</span>
                  <span style={{ color: 'var(--muted)' }}>
                    {fmtVal(k.kind, a)} / {t ? fmtVal(k.kind, t) : '—'}
                    {t && !k.lowerBetter && <span style={{ color: barColor, fontWeight: 600 }}> · {gap > 0 ? `${fmtVal(k.kind, gap)} to go` : 'target met'}</span>}
                    {projected != null && <span style={{ color: 'var(--muted)' }}> · proj. {fmtVal(k.kind, projected)}</span>}
                  </span>
                </div>
                <div style={{ height: 10, borderRadius: 5, background: 'var(--surface2)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`, background: barColor }} />
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
