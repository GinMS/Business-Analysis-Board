import { useState, useRef, useEffect } from 'react';
import WalletForecast from './components/WalletForecast';
import LoanForecast from './components/LoanForecast';
import UnitCalculation from './components/UnitCalculation';
import RevenueShare from './components/RevenueShare';
import CompanyPerformance from './components/CompanyPerformance';
import CostAnalysis from './components/CostAnalysis';
import Invoices from './components/Invoices';
import BusinessPerformance from './components/business/BusinessPerformance';
import BusinessPlans from './components/business/BusinessPlans';
import BusinessRoadmap from './components/business/BusinessRoadmap';
import BusinessFeedback from './components/business/BusinessFeedback';
import BusinessPartners from './components/business/BusinessPartners';
import Login from './components/Login';
import { useAuth } from './utils/useAuth';
import './App.css';

const TABS = [
  { id: 'company',     label: 'Company Performance',    subtitle: 'Overall P&L',             icon: '📊', group: 'Forecasting and Gap Analysis' },
  { id: 'wallet',      label: 'Wallet Forecast',       subtitle: 'Business Case — Monthly', icon: '💳', group: 'Forecasting and Gap Analysis' },
  { id: 'loan',        label: 'Loan Forecast',          subtitle: 'Business Case — Monthly', icon: '🏦', group: 'Forecasting and Gap Analysis' },
  { id: 'unit',        label: 'Unit Calculation',       subtitle: 'Economics Per Unit',      icon: '📐', group: 'Forecasting and Gap Analysis' },
  { id: 'revenue-share', label: 'Revenue Share',        subtitle: 'Partner Split Analysis',  icon: '🤝', group: 'Forecasting and Gap Analysis' },
  { id: 'cost',        label: 'Cost Analysis',          subtitle: 'Monthly Recurring Costs', icon: '🧾', group: 'Billing Matters' },
  { id: 'invoices',    label: 'Invoices',               subtitle: 'Due & Paid Register',     icon: '📁', group: 'Billing Matters' },
  { id: 'biz-perf',    label: 'Performance',            subtitle: 'BoostLife Consumer',      icon: '📈', group: 'Business Analysis' },
  { id: 'biz-plans',   label: 'Plans',                  subtitle: 'Pipeline & Deals',        icon: '🧭', group: 'Business Analysis' },
  { id: 'biz-roadmap', label: 'Roadmap',                subtitle: 'Launches & Definitions',  icon: '🚀', group: 'Business Analysis' },
  { id: 'biz-feedback',label: 'Feedback',               subtitle: 'Customer Rating',         icon: '⭐', group: 'Business Analysis' },
  { id: 'biz-partners',label: 'Partners',               subtitle: 'BD Prospects',            icon: '🤝', group: 'Business Analysis' },
];

const NAV_GROUPS = ['Forecasting and Gap Analysis', 'Business Analysis', 'Billing Matters'];

export default function App() {
  const [activeTab, setActiveTab] = useState('company');
  const active = TABS.find(t => t.id === activeTab);
  const { user, loading, error, login, logout, firebaseReady } = useAuth();

  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('ba-theme', theme); } catch { /* ignore */ }
  }, [theme]);
  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  // Auth gate: when Firebase is configured, require a Google sign-in first.
  if (firebaseReady && loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
        Loading…
      </div>
    );
  }
  if (firebaseReady && !user) {
    return <Login onLogin={login} error={error} firebaseReady={firebaseReady} />;
  }

  const resetAllData = () => {
    if (!window.confirm('Erase all saved data and reset every tab to its defaults? This cannot be undone.')) return;
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('ba-'))
        .forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
    window.location.reload();
  };

  const backupFileRef = useRef();

  // Save every ba-* value into one portable JSON file.
  const saveBackup = () => {
    const data = {};
    Object.keys(localStorage).filter(k => k.startsWith('ba-')).forEach(k => {
      try { data[k] = JSON.parse(localStorage.getItem(k)); }
      catch { data[k] = localStorage.getItem(k); }
    });
    const payload = { app: 'Business Analysis Board', version: 1, exportedAt: new Date().toISOString(), data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `business-analysis-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Restore data from a backup JSON file (replaces current data).
  const loadBackup = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        const data = parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
        const keys = Object.keys(data).filter(k => k.startsWith('ba-'));
        if (!keys.length) { alert('No dashboard data found in that file.'); return; }
        if (!window.confirm(`Load ${keys.length} data section(s) from "${file.name}"? This replaces your current data.`)) return;
        keys.forEach(k => localStorage.setItem(k, JSON.stringify(data[k])));
        window.location.reload();
      } catch {
        alert('That file could not be read as a valid backup JSON.');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-mark">BA</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Analysis Board</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Business Intelligence</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map(group => (
            <div key={group}>
              <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase', margin: '4px 0 8px', paddingLeft: 12 }}>
                {group}
              </div>
              {TABS.filter(t => t.group === group).map(tab => (
                <button
                  key={tab.id}
                  className={`nav-item${activeTab === tab.id ? ' active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="nav-icon">{tab.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{tab.label}</div>
                    <div className="nav-subtitle">{tab.subtitle}</div>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {firebaseReady && user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              {user.photoURL
                ? <img src={user.photoURL} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} referrerPolicy="no-referrer" />
                : <div className="logo-mark" style={{ width: 28, height: 28, fontSize: 12 }}>{(user.displayName || user.email || '?').slice(0, 1).toUpperCase()}</div>}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.displayName || 'Signed in'}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
              </div>
              <button onClick={logout} title="Sign out" style={{ fontSize: 11, color: 'var(--muted)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>
                Sign out
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button
              onClick={saveBackup}
              title="Download all your data as a JSON backup file"
              style={{
                flex: 1, padding: '8px 6px', fontSize: 12, fontWeight: 600,
                color: 'var(--accent)', background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 8, cursor: 'pointer',
              }}
            >
              ↓ Save backup
            </button>
            <button
              onClick={() => backupFileRef.current?.click()}
              title="Restore data from a backup JSON file"
              style={{
                flex: 1, padding: '8px 6px', fontSize: 12, fontWeight: 600,
                color: 'var(--text)', background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 8, cursor: 'pointer',
              }}
            >
              ↑ Load backup
            </button>
            <input ref={backupFileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={loadBackup} />
          </div>
          <button
            onClick={resetAllData}
            title="Erase all saved data on every tab and reset to defaults"
            style={{
              width: '100%', padding: '8px 10px', marginBottom: 10, fontSize: 12, fontWeight: 600,
              color: 'var(--red)', background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 8, cursor: 'pointer',
            }}
          >
            ↺ Reset all data
          </button>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>All calculations live</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>and update in real time</div>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">{active?.label}</h1>
            <p className="page-subtitle">{active?.subtitle}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
              style={{
                width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, background: 'var(--surface)', color: 'var(--text)',
                border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer',
              }}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <div className="header-badge">
              {new Date().toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>

        <div className="page-body">
          {activeTab === 'wallet'        && <WalletForecast />}
          {activeTab === 'loan'          && <LoanForecast />}
          {activeTab === 'unit'          && <UnitCalculation />}
          {activeTab === 'revenue-share' && <RevenueShare />}
          {activeTab === 'company'       && <CompanyPerformance />}
          {activeTab === 'cost'          && <CostAnalysis />}
          {activeTab === 'invoices'      && <Invoices />}
          {activeTab === 'biz-perf'      && <BusinessPerformance />}
          {activeTab === 'biz-plans'     && <BusinessPlans />}
          {activeTab === 'biz-roadmap'   && <BusinessRoadmap />}
          {activeTab === 'biz-feedback'  && <BusinessFeedback />}
          {activeTab === 'biz-partners'  && <BusinessPartners />}
        </div>
      </main>
    </div>
  );
}
