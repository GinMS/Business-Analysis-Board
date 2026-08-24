import { useMemo, useRef, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { exportCSV, exportExcel } from '../../utils/exportData';
import { useLocalStorage } from '../../utils/useLocalStorage';
import { seedFromPerformanceWorkbook } from '../../utils/perfImport';
import Section from '../Section';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Money is always expressed in millions so columns line up and compare at a glance.
const fmtRM = (n) => {
  const v = Number(n) || 0;
  if (v === 0) return 'RM 0.00M';
  const m = v / 1e6;
  return `RM ${m.toFixed(Math.abs(m) < 0.1 ? 3 : 2)}M`;
};
const fmtNum = (n) => (Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n || 0)}`);
const fmtRatio = (n) => `${((n || 0) * 100).toFixed(2)}%`;
const fmtPct = (n) => `${(n || 0).toFixed(0)}%`;
const fmtVal = (kind, n) => kind === 'money' ? fmtRM(n) : kind === 'ratio' ? fmtRatio(n) : fmtNum(n);

// "RM 1.20M" / "1,200,000" / "850K" -> number (null when blank/unparseable)
export const parseAmount = (raw) => {
  const s = String(raw ?? '').trim().replace(/^rm\s*/i, '').replace(/[, ]/g, '');
  if (s === '') return null;
  const m = s.match(/^(-?[\d.]+)\s*([mk])?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!isFinite(n)) return null;
  const suffix = (m[2] || '').toLowerCase();
  return suffix === 'm' ? n * 1e6 : suffix === 'k' ? n * 1e3 : n;
};

// Grid cell that reads in millions but edits the exact figure on focus.
// Typing accepts a plain number, or an explicit 1.2M / 850K suffix.
function MoneyCell({ value, onChange, style }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');
  const v = Number(value) || 0;
  return (
    <input
      className="cell-input"
      type="text"
      inputMode="decimal"
      placeholder="0.00"
      style={style}
      title={v ? `RM ${v.toLocaleString('en-MY')}` : 'Shown in millions — click to edit the exact figure'}
      value={focused ? draft : (v ? (v / 1e6).toFixed(2) : '')}
      onFocus={() => { setDraft(v ? String(v) : ''); setFocused(true); }}
      onChange={e => { setDraft(e.target.value); onChange(parseAmount(e.target.value) ?? 0); }}
      onBlur={() => setFocused(false)}
    />
  );
}

const KPIS = [
  { key: 'nr',       label: 'Net Revenue (YTD)', kind: 'money' },
  { key: 'mtu',      label: 'MTU',               kind: 'num',   manual: true },
  { key: 'ebUsers',  label: 'EB Users',          kind: 'num',   manual: true },
  { key: 'loanBook', label: 'Loan Book',         kind: 'money', manual: true },
  { key: 'cost',     label: 'Cost Ratio',        kind: 'ratio', manual: true, lowerBetter: true },
];

// Colour palette assigned to streams as they're added.
const STREAM_COLORS = ['#3b7ff5', '#16a34a', '#8b5cf6', '#d97706', '#e11d48', '#0891b2', '#14b8a6', '#6c4de6', '#0ea5e9', '#22c55e'];

const parseCsv = (text) => {
  // Minimal CSV parser that honours quoted fields.
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
};

// Per-month + FY totals for one board.
function computeTotals(streams, manual, streamTargets, monthsOfYear, monthlyNrTotal) {
  const perStreamFY = {};
  const monthTotals = monthsOfYear.map(() => ({ actual: 0, target: 0 }));
  streams.forEach(s => {
    let fyA = 0, fyT = 0;
    monthsOfYear.forEach((ym, i) => {
      const a = manual[s.key]?.[ym] || 0;
      const t = streamTargets[s.key]?.[ym] || 0;
      fyA += a; fyT += t; monthTotals[i].actual += a; monthTotals[i].target += t;
    });
    perStreamFY[s.key] = { actual: fyA, target: fyT };
  });
  // A board-level monthly target curve (from the workbook) overrides the per-stream sum.
  const targetAt = (ym, i) => monthlyNrTotal?.[ym] ?? monthTotals[i].target;
  const ytdActual = monthTotals.reduce((s, m) => s + m.actual, 0);
  const ytdTarget = monthsOfYear.reduce((s, ym, i) => s + targetAt(ym, i), 0);
  return { perStreamFY, monthTotals, targetAt, ytdActual, ytdTarget };
}

// One self-contained performance board (streams x months, chart, exports).
function PerformanceBoard({
  title, streams, setStreams, manual, setManual, streamTargets, setStreamTargets,
  monthlyNrTotal, activeYear, monthsOfYear, totals, storagePrefix,
}) {
  const [view, setView] = useLocalStorage(`${storagePrefix}-view`, 'actual'); // actual | target | achievement
  const [csvStatus, setCsvStatus] = useState(null);
  const csvRef = useRef();

  const addStream = () => {
    const key = `s${Date.now().toString(36)}`;
    setStreams(prev => [...prev, { key, label: `Stream ${prev.length + 1}`, color: STREAM_COLORS[prev.length % STREAM_COLORS.length] }]);
  };
  const renameStream = (key, label) => setStreams(prev => prev.map(s => s.key === key ? { ...s, label } : s));
  const recolorStream = (key, color) => setStreams(prev => prev.map(s => s.key === key ? { ...s, color } : s));
  const removeStream = (key) => {
    if (!window.confirm('Remove this stream and its figures?')) return;
    setStreams(prev => prev.filter(s => s.key !== key));
    setManual(prev => { const n = { ...prev }; delete n[key]; return n; });
    setStreamTargets(prev => { const n = { ...prev }; delete n[key]; return n; });
  };
  const setManualCell = (key, ym, val) =>
    setManual(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [ym]: Number(val) || 0 } }));
  const setTargetCell = (key, ym, val) =>
    setStreamTargets(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [ym]: Number(val) || 0 } }));

  // Size the Stream column to its longest name (swatch + padding + ~7.2px/char).
  const streamColWidth = useMemo(() => {
    const longest = streams.reduce((m, s) => Math.max(m, String(s.label || '').length), 6);
    return Math.min(420, Math.max(150, Math.round(longest * 7.2) + 74));
  }, [streams]);

  const chartData = useMemo(() => monthsOfYear.map((ym, i) => {
    const row = { label: MONTHS[i], Target: totals.targetAt(ym, i) };
    streams.forEach(s => { row[s.label] = manual[s.key]?.[ym] || 0; });
    return row;
  }), [monthsOfYear, streams, manual, totals]);

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const downloadCsvTemplate = () => {
    const headers = ['Stream', ...MONTHS];
    const rows = (streams.length ? streams.map(s => [s.label, ...MONTHS.map(() => 0)]) : [['Example Stream', ...MONTHS.map(() => 0)]]);
    exportCSV(`${slug}-${activeYear}-template`, headers, rows);
  };

  const importCsv = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseCsv(String(ev.target.result));
        if (rows.length < 2) { setCsvStatus({ kind: 'error', text: 'That CSV has no data rows.' }); return; }
        const header = rows[0].map(h => String(h).trim().toLowerCase());
        const monthCol = MONTHS.map((m, i) => header.findIndex(h =>
          h === m.toLowerCase() || h.startsWith(m.toLowerCase()) || h === `${activeYear}-${String(i + 1).padStart(2, '0')}`));
        if (monthCol.every(c => c < 0)) { setCsvStatus({ kind: 'error', text: 'No month columns found. Use the template: Stream, Jan, Feb, … Dec.' }); return; }

        const nextStreams = [...streams];
        const nextManual = { ...manual };
        let added = 0, updated = 0;
        for (let r = 1; r < rows.length; r++) {
          const label = String(rows[r][0] ?? '').trim();
          if (!label || /^total$/i.test(label)) continue;
          let s = nextStreams.find(x => x.label.trim().toLowerCase() === label.toLowerCase());
          if (!s) {
            s = { key: `s${Date.now().toString(36)}${r}`, label, color: STREAM_COLORS[nextStreams.length % STREAM_COLORS.length] };
            nextStreams.push(s); added++;
          } else updated++;
          const series = { ...(nextManual[s.key] || {}) };
          monthCol.forEach((ci, i) => {
            if (ci < 0) return;
            const v = parseAmount(rows[r][ci]);
            if (v != null) series[monthsOfYear[i]] = v;
          });
          nextManual[s.key] = series;
        }
        setStreams(nextStreams);
        setManual(nextManual);
        setCsvStatus({ kind: 'ok', text: `Imported ${file.name} — ${added} new stream(s), ${updated} updated for ${activeYear}.` });
      } catch { setCsvStatus({ kind: 'error', text: 'Could not read that CSV.' }); }
      finally { e.target.value = ''; }
    };
    reader.readAsText(file);
  };

  const exportGrid = (type) => {
    const headers = ['Stream', ...MONTHS.map(m => `${m} (A)`), ...MONTHS.map(m => `${m} (T)`), 'FY Actual', 'FY Target', 'Achievement %'];
    const rows = streams.map(s => [
      s.label,
      ...monthsOfYear.map(ym => Math.round(manual[s.key]?.[ym] || 0)),
      ...monthsOfYear.map(ym => Math.round(streamTargets[s.key]?.[ym] || 0)),
      Math.round(totals.perStreamFY[s.key].actual),
      Math.round(totals.perStreamFY[s.key].target),
      totals.perStreamFY[s.key].target ? Math.round(100 * totals.perStreamFY[s.key].actual / totals.perStreamFY[s.key].target) : 0,
    ]);
    (type === 'csv' ? exportCSV : exportExcel)(`${slug}-${activeYear}`, headers, rows);
  };

  const cell = (s, ym) => {
    const a = manual[s.key]?.[ym] || 0, t = streamTargets[s.key]?.[ym] || 0;
    if (view === 'target') return <MoneyCell value={t} onChange={v => setTargetCell(s.key, ym, v)} />;
    if (view === 'achievement') {
      const pct = t ? (a / t) * 100 : 0;
      return <span style={{ color: pct >= 100 ? 'var(--green)' : pct >= 80 ? 'var(--amber)' : 'var(--red)', fontWeight: 600 }}>{t ? `${pct.toFixed(0)}%` : '—'}</span>;
    }
    return <MoneyCell value={manual[s.key]?.[ym]} onChange={v => setManualCell(s.key, ym, v)} />;
  };

  return (
    <Section title={title} flush right={(
      <>
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {['actual', 'target', 'achievement'].map(v => (
            <button key={v} className={`tab-btn${view === v ? ' active' : ''}`} style={{ padding: '5px 12px', fontSize: 12, textTransform: 'capitalize' }} onClick={() => setView(v)}>{v}</button>
          ))}
        </div>
        <button className="btn-sm btn-primary" onClick={addStream}>+ Add Stream</button>
        <button className="btn-sm btn-primary" onClick={() => csvRef.current?.click()}>↑ Import CSV</button>
        <button className="btn-sm btn-export" onClick={downloadCsvTemplate}>↓ Template</button>
        <button className="btn-sm btn-export" onClick={() => exportGrid('csv')}>CSV</button>
        <button className="btn-sm btn-export" onClick={() => exportGrid('excel')}>Excel</button>
        <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={importCsv} />
      </>
    )}>
      {csvStatus && (
        <div style={{
          margin: '12px 20px 0', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          color: csvStatus.kind === 'ok' ? 'var(--green)' : 'var(--red)', background: 'var(--surface2)',
        }}>
          {csvStatus.kind === 'ok' ? '✓ ' : '⚠ '}{csvStatus.text}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left', width: streamColWidth, minWidth: streamColWidth, whiteSpace: 'nowrap' }}>
                Stream <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none' }}>(RM mil)</span>
              </th>
              {MONTHS.map(m => <th key={m} style={{ minWidth: 84 }}>{m}</th>)}
              <th style={{ color: 'var(--accent)', fontWeight: 700 }}>FY</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {streams.length === 0 && (
              <tr>
                <td colSpan={MONTHS.length + 3} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
                  No streams yet — click <strong>+ Add Stream</strong> to create one, or <strong>↑ Import CSV</strong>.
                </td>
              </tr>
            )}
            {streams.map(s => {
              const fy = totals.perStreamFY[s.key];
              const fyVal = view === 'target' ? fy.target : view === 'achievement' ? (fy.target ? `${Math.round(100 * fy.actual / fy.target)}%` : '—') : fy.actual;
              return (
                <tr key={s.key}>
                  <td style={{ padding: '4px 6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="color" value={s.color} onChange={e => recolorStream(s.key, e.target.value)}
                        title="Stream colour"
                        style={{ width: 16, height: 16, padding: 0, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0 }} />
                      <input className="cell-input" style={{ textAlign: 'left', fontWeight: 600, color: s.color, width: '100%', minWidth: 0 }}
                        value={s.label} onChange={e => renameStream(s.key, e.target.value)} />
                    </div>
                  </td>
                  {monthsOfYear.map(ym => <td key={ym} style={{ padding: '4px 6px' }}>{cell(s, ym)}</td>)}
                  <td style={{ color: s.color, fontWeight: 700 }}>{typeof fyVal === 'number' ? fmtRM(fyVal) : fyVal}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn-sm btn-export" title="Remove stream" onClick={() => removeStream(s.key)}>✕</button>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td style={{ fontWeight: 700 }}>Total</td>
              {totals.monthTotals.map((m, i) => {
                const t = totals.targetAt(monthsOfYear[i], i);
                return (
                  <td key={i} style={{ fontWeight: 700 }}>
                    {view === 'achievement' ? (t ? `${Math.round(100 * m.actual / t)}%` : '—') : fmtRM(view === 'target' ? t : m.actual)}
                  </td>
                );
              })}
              <td style={{ color: 'var(--accent)', fontWeight: 700 }}>
                {view === 'achievement'
                  ? (totals.ytdTarget ? `${Math.round(100 * totals.ytdActual / totals.ytdTarget)}%` : '—')
                  : fmtRM(view === 'target' ? totals.ytdTarget : totals.ytdActual)}
              </td>
              <td />
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
  );
}

export default function BusinessPerformance() {
  const [targets, setTargets] = useLocalStorage('ba-biz-targets', { streams: {}, annual: {} });
  const [kpiManual, setKpiManual] = useLocalStorage('ba-biz-kpi', {});
  const [plans] = useLocalStorage('ba-biz-plans', []);
  const [year, setYear] = useLocalStorage('ba-biz-year', String(new Date().getFullYear()));

  // Life board keeps the original keys so existing data carries over; its stream
  // targets migrate out of the shared targets object on first load.
  const [lifeStreams, setLifeStreams] = useLocalStorage('ba-biz-streams', []);
  const [lifeManual, setLifeManual] = useLocalStorage('ba-biz-manual', {});
  const [lifeTargets, setLifeTargets] = useLocalStorage('ba-biz-stargets', targets.streams || {});

  const [creditStreams, setCreditStreams] = useLocalStorage('ba-biz-credit-streams', []);
  const [creditManual, setCreditManual] = useLocalStorage('ba-biz-credit-manual', {});
  const [creditTargets, setCreditTargets] = useLocalStorage('ba-biz-credit-stargets', {});

  const perfRef = useRef();
  const jsonRef = useRef();

  const activeYear = year;
  const monthsOfYear = useMemo(
    () => MONTHS.map((_, i) => `${activeYear}-${String(i + 1).padStart(2, '0')}`),
    [activeYear]
  );

  // Offer every year that has data, plus the surrounding years.
  const years = useMemo(() => {
    const set = new Set();
    const collect = (obj) => Object.values(obj || {}).forEach(series =>
      Object.keys(series || {}).forEach(ym => { if (Number(series[ym])) set.add(ym.slice(0, 4)); }));
    collect(lifeManual); collect(creditManual);
    collect(lifeTargets); collect(creditTargets);
    Object.keys(targets.monthlyNrTotal || {}).forEach(ym => set.add(ym.slice(0, 4)));
    const now = new Date().getFullYear();
    [now - 1, now, now + 1].forEach(y => set.add(String(y)));
    set.add(String(year));
    return [...set].sort();
  }, [lifeManual, creditManual, lifeTargets, creditTargets, targets.monthlyNrTotal, year]);

  const lifeTotals = useMemo(
    () => computeTotals(lifeStreams, lifeManual, lifeTargets, monthsOfYear, targets.monthlyNrTotal),
    [lifeStreams, lifeManual, lifeTargets, monthsOfYear, targets.monthlyNrTotal]
  );
  const creditTotals = useMemo(
    () => computeTotals(creditStreams, creditManual, creditTargets, monthsOfYear, null),
    [creditStreams, creditManual, creditTargets, monthsOfYear]
  );

  // Scorecard NR is the two boards combined.
  const nrYtd = lifeTotals.ytdActual + creditTotals.ytdActual;
  const elapsed = monthsOfYear.filter((_, i) =>
    lifeTotals.monthTotals[i].actual > 0 || creditTotals.monthTotals[i].actual > 0).length;

  const setAnnualTarget = (key, val) =>
    setTargets(prev => ({ ...prev, annual: { ...prev.annual, [key]: Number(val) || 0 } }));
  const setKpiActual = (key, val) => setKpiManual(prev => ({ ...prev, [key]: Number(val) || 0 }));
  const kpiActual = (k) => (k.key === 'nr' ? nrYtd : (kpiManual[k.key] || 0));

  const weightedMonthly = plans.reduce((s, p) => s + (Number(p.estRevenue) || 0) * (Number(p.winProb) || 0) / 100, 0);
  const nrAnnualTarget = targets.annual?.nr || 0;
  const nrGap = Math.max(0, nrAnnualTarget - nrYtd);

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

  const BIZ_KEYS = [
    'ba-biz-targets', 'ba-biz-kpi', 'ba-biz-year',
    'ba-biz-streams', 'ba-biz-manual', 'ba-biz-stargets', 'ba-biz-view',
    'ba-biz-credit-streams', 'ba-biz-credit-manual', 'ba-biz-credit-stargets', 'ba-biz-credit-view',
    'ba-biz-plans', 'ba-biz-launches', 'ba-biz-definitions', 'ba-biz-feedback', 'ba-biz-partners',
  ];
  const exportJson = () => {
    const data = {};
    BIZ_KEYS.forEach(k => { try { const v = localStorage.getItem(k); if (v != null) data[k] = JSON.parse(v); } catch { /* ignore */ } });
    const blob = new Blob([JSON.stringify({ app: 'Business Analysis', version: 2, exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Year selector — governs every board on this page */}
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
        <div>
          <div style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Current year</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <select className="input" style={{ width: 130, fontSize: 18, fontWeight: 700, padding: '6px 10px' }}
              value={activeYear} onChange={e => setYear(e.target.value)}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {String(new Date().getFullYear()) === String(activeYear) && (
              <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>● current</span>
            )}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 200, fontSize: 11, color: 'var(--muted)' }}>
          All boards below show <strong>{activeYear}</strong>. Years with data are listed automatically — switch to view or edit another year.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-sm btn-export" onClick={exportJson}>↓ Export JSON</button>
          <button className="btn-sm btn-export" onClick={() => jsonRef.current?.click()}>↑ Import JSON</button>
          <button className="btn-sm btn-export" onClick={() => perfRef.current?.click()}>Seed from Workbook</button>
          <input ref={perfRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={seedPerf} />
          <input ref={jsonRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={importJson} />
        </div>
      </div>

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
                  ? (k.kind === 'money'
                      ? <MoneyCell value={kpiManual[k.key]} onChange={v => setKpiActual(k.key, v)} style={{ fontSize: 20, fontWeight: 700, width: 140, textAlign: 'left' }} />
                      : <input className="cell-input" style={{ fontSize: 20, fontWeight: 700, width: 140, textAlign: 'left' }} type="number" value={kpiManual[k.key] || ''} placeholder="0" onChange={e => setKpiActual(k.key, e.target.value)} />)
                  : fmtVal(k.kind, a)}
              </div>
              {k.key === 'nr' && (
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                  Life {fmtRM(lifeTotals.ytdActual)} + Credit {fmtRM(creditTotals.ytdActual)}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
                <span>Target{k.kind === 'money' ? ' (RM mil)' : ''}</span>
                {k.kind === 'money'
                  ? <MoneyCell value={targets.annual?.[k.key]} onChange={v => setAnnualTarget(k.key, v)} style={{ width: 90, textAlign: 'left' }} />
                  : <input className="cell-input" style={{ width: 90, textAlign: 'left' }} type="number" value={targets.annual?.[k.key] || ''} placeholder="0" onChange={e => setAnnualTarget(k.key, e.target.value)} />}
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--surface2)', marginTop: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`, background: barColor }} />
              </div>
              <div style={{ fontSize: 11, color: barColor, marginTop: 4, fontWeight: 600 }}>{t ? `${fmtPct(pct)} of target` : 'Set a target'}</div>
            </div>
          );
        })}
      </div>

      <PerformanceBoard
        title="Life Performance"
        storagePrefix="ba-biz"
        streams={lifeStreams} setStreams={setLifeStreams}
        manual={lifeManual} setManual={setLifeManual}
        streamTargets={lifeTargets} setStreamTargets={setLifeTargets}
        monthlyNrTotal={targets.monthlyNrTotal}
        activeYear={activeYear} monthsOfYear={monthsOfYear} totals={lifeTotals}
      />

      <PerformanceBoard
        title="Credit Performance"
        storagePrefix="ba-biz-credit"
        streams={creditStreams} setStreams={setCreditStreams}
        manual={creditManual} setManual={setCreditManual}
        streamTargets={creditTargets} setStreamTargets={setCreditTargets}
        monthlyNrTotal={null}
        activeYear={activeYear} monthsOfYear={monthsOfYear} totals={creditTotals}
      />

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

          {/* Weighted pipeline vs the NR gap */}
          <div style={{ marginTop: 4, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Pipeline uplift (weighted)</span>
              <span style={{ color: 'var(--muted)' }}>
                {fmtRM(weightedMonthly)}/mo · ~{fmtRM(weightedMonthly * 12)}/yr
                {nrGap > 0
                  ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}> · covers {Math.round(100 * (weightedMonthly * 12) / nrGap)}% of the {fmtRM(nrGap)} NR gap</span>
                  : (nrAnnualTarget ? <span style={{ color: 'var(--green)', fontWeight: 600 }}> · NR target met</span> : <span style={{ color: 'var(--muted)' }}> · set an NR target</span>)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Weighted = Σ (deal est. revenue × win probability) from the Plans page. Annualized against the remaining gap to the annual NR target.
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
