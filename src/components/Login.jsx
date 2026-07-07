const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

export default function Login({ onLogin, error, firebaseReady }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 24,
    }}>
      <div className="card" style={{ maxWidth: 380, width: '100%', textAlign: 'center', padding: 32 }}>
        <div className="logo-mark" style={{ margin: '0 auto 16px' }}>BA</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Analysis Board</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
          Sign in with your Google account to access the dashboard.
        </p>

        {!firebaseReady && (
          <div style={{
            fontSize: 12, color: 'var(--amber)', background: 'rgba(217,119,6,0.08)',
            border: '1px solid rgba(217,119,6,0.25)', borderRadius: 8, padding: 12, marginBottom: 16, textAlign: 'left',
          }}>
            Firebase isn’t configured yet. Add your project settings to <strong>.env</strong> (see <strong>.env.example</strong>) and rebuild.
          </div>
        )}

        <button
          onClick={onLogin}
          disabled={!firebaseReady}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '11px 16px', fontSize: 14, fontWeight: 600, color: 'var(--text)',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            cursor: firebaseReady ? 'pointer' : 'not-allowed', opacity: firebaseReady ? 1 : 0.6,
          }}
        >
          <GoogleIcon /> Sign in with Google
        </button>

        {error && (
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--red)' }}>{error}</div>
        )}
      </div>
    </div>
  );
}
