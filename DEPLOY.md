# Deploying to Firebase Hosting with Google Sign-In

This dashboard is a static Vite/React app. It deploys to **Firebase Hosting**
and gates access behind **Firebase Authentication (Google provider)**.

> When Firebase env vars are **not** set, the app runs open (no login) — handy
> for local development. Once you add them, the Google sign-in gate turns on.

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and **Add project**.
2. In the project, open **Build → Authentication → Get started**, then enable
   the **Google** sign-in provider and save.
3. Open **Project settings (gear) → General → Your apps → Web app (`</>`)**,
   register an app, and copy the `firebaseConfig` values.

## 2. Configure the app

Copy `.env.example` to `.env` and paste your values:

```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=1:...:web:...
```

**Optional — restrict who can sign in** (otherwise any Google account works):

```env
VITE_ALLOWED_EMAILS=you@example.com,teammate@example.com
VITE_ALLOWED_DOMAIN=yourcompany.com
```

Also set your project id in `.firebaserc` (replace `YOUR_FIREBASE_PROJECT_ID`).

## 3. Build & deploy

```bash
npm install
npm run build                       # outputs to dist/

npm install -g firebase-tools       # once
firebase login                      # opens a browser
firebase deploy --only hosting
```

Your app goes live at `https://<project-id>.web.app`.

## 4. Authorize the domain (only if sign-in is blocked)

Firebase auto-authorizes `*.web.app`, `*.firebaseapp.com`, and `localhost`.
If you use a **custom domain**, add it under
**Authentication → Settings → Authorized domains**.

## Local preview with auth

```bash
npm run build && npm run preview    # http://localhost:4173
```

`localhost` is authorized by default, so Google sign-in works locally too.

## Notes

- The Firebase web config values are **not secrets** — they're safe to ship in
  the client bundle. Access is controlled by Auth + authorized domains, not by
  hiding them.
- All dashboard data is still stored per-user in the browser's `localStorage`;
  authentication only controls who can open the app, it does not sync data
  across devices.
