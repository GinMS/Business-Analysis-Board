import { useState } from 'react';
import WalletForecast from './components/WalletForecast';
import LoanForecast from './components/LoanForecast';
import UnitCalculation from './components/UnitCalculation';
import RevenueShare from './components/RevenueShare';
import CompanyPerformance from './components/CompanyPerformance';
import Login from './components/Login';
import { useAuth } from './utils/useAuth';
import './App.css';

const TABS = [
  { id: 'company',     label: 'Company Performance',    subtitle: 'Overall P&L',             icon: '📊' },
  { id: 'wallet',      label: 'Wallet Forecast',       subtitle: 'Business Case — Monthly', icon: '💳' },
  { id: 'loan',        label: 'Loan Forecast',          subtitle: 'Business Case — Monthly', icon: '🏦' },
  { id: 'unit',        label: 'Unit Calculation',       subtitle: 'Economics Per Unit',      icon: '📐' },
  { id: 'revenue-share', label: 'Revenue Share',        subtitle: 'Partner Split Analysis',  icon: '🤝' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('company');
  const active = TABS.find(t => t.id === activeTab);
  const { user, loading, error, login, logout, firebaseReady } = useAuth();

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
          <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 12 }}>
            Modules
          </div>
          {TABS.map(tab => (
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
          <div className="header-badge">
            {new Date().toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })}
          </div>
        </div>

        <div className="page-body">
          {activeTab === 'wallet'        && <WalletForecast />}
          {activeTab === 'loan'          && <LoanForecast />}
          {activeTab === 'unit'          && <UnitCalculation />}
          {activeTab === 'revenue-share' && <RevenueShare />}
          {activeTab === 'company'       && <CompanyPerformance />}
        </div>
      </main>
    </div>
  );
}
