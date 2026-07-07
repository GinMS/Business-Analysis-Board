import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Firebase web config. These values are NOT secret — they identify your
// project to Google and are safe to ship in a client bundle. Access is
// controlled by Firebase Auth + your authorized domains, not by hiding these.
// Fill them in .env (see .env.example) or paste directly below.
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

const app = firebaseReady ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const googleProvider = new GoogleAuthProvider();

// Optional: restrict access to specific emails or a domain.
// VITE_ALLOWED_EMAILS="a@x.com,b@x.com"  and/or  VITE_ALLOWED_DOMAIN="mycompany.com"
const allowedEmails = (import.meta.env.VITE_ALLOWED_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const allowedDomain = (import.meta.env.VITE_ALLOWED_DOMAIN || '').trim().toLowerCase();

export function isAllowed(user) {
  if (!user?.email) return false;
  const email = user.email.toLowerCase();
  if (allowedEmails.length === 0 && !allowedDomain) return true; // no restriction set
  if (allowedEmails.includes(email)) return true;
  if (allowedDomain && email.endsWith(`@${allowedDomain}`)) return true;
  return false;
}
