# Desktop App (Electron)

Run the dashboard as a native desktop application — no browser or dev server
needed. It bundles the built app and serves it from a local loopback address
inside the window, so all your data (localStorage) persists between runs.

## Prerequisites

```bash
npm install
```

This downloads Electron on first install. (If you're behind a restrictive
network and Electron fails to download, set a mirror:
`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install`.)

## Run it locally (no packaging)

```bash
npm run app        # builds the web app, then opens it in a desktop window
```

Or, if `dist/` is already built:

```bash
npm run electron
```

## Build a distributable executable

Build for the platform you're currently on:

```bash
npm run app:dist          # current OS
npm run app:dist:mac      # macOS  -> .dmg + .zip
npm run app:dist:win      # Windows -> NSIS installer + portable .exe
npm run app:dist:linux    # Linux  -> AppImage
```

The installer / executable is written to the **`release/`** folder.

> Note: you can only build a macOS app on macOS, and a Windows app is best
> built on Windows. Build on the target OS (or use a CI runner per OS).

### macOS gatekeeper

The app is unsigned, so on first launch macOS may warn it's from an
unidentified developer. Right‑click the app → **Open**, or allow it under
**System Settings → Privacy & Security**. To ship it more widely you'd add an
Apple Developer signing identity to the `build.mac` config.

## How it works

- `electron/main.cjs` starts a tiny HTTP server on `127.0.0.1` that serves the
  files in `dist/`, then loads that URL in a `BrowserWindow`.
- Using an `http://` origin (instead of `file://`) keeps `localStorage` stable
  and persistent, so your inputs, projects, invoices, etc. survive restarts.
- External links (e.g. Google sign‑in) open in your default browser.

## Data & auth

- All data stays **on your machine** in the app's local storage.
- The Firebase Google sign‑in gate stays **off** in the desktop app unless you
  build with Firebase env vars set (`.env`). For local single‑user use you
  normally don't need it.
