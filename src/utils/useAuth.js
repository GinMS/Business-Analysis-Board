import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider, firebaseReady, isAllowed } from '../firebase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(firebaseReady);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!firebaseReady) { setLoading(false); return; }
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u && !isAllowed(u)) {
        // Signed in but not on the allowlist — reject and sign out.
        setError(`${u.email} is not authorized to access this dashboard.`);
        signOut(auth);
        setUser(null);
      } else {
        setError(null);
        setUser(u);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') {
        setError(e?.message || 'Sign-in failed.');
      }
    }
  };

  const logout = () => signOut(auth);

  return { user, loading, error, login, logout, firebaseReady };
}
