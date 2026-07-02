import { useState } from 'react';
import WalletForecast from './components/WalletForecast';
import LoanForecast from './components/LoanForecast';
import UnitCalculation from './components/UnitCalculation';
import RevenueShare from './components/RevenueShare';
import CompanyPerformance from './components/CompanyPerformance';
import './App.css';

const TABS = [
  { id: 'wallet',      label: 'Wallet Forecast',       subtitle: 'Business Case — Monthly', icon: '💳' },
  { id: 'loan',        label: 'Loan Forecast',          subtitle: 'Business Case — Monthly', icon: '🏦' },
  { id: 'unit',        label: 'Unit Calculation',       subtitle: 'Economics Per Unit',      icon: '📐' },
  { id: 'revenue-share', label: 'Revenue Share',        subtitle: 'Partner Split Analysis',  icon: '🤝' },
  { id: 'company',     label: 'Company Performance',    subtitle: 'Overall P&L',             icon: '📊' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('wallet');
  const active = TABS.find(t => t.id === activeTab);

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
