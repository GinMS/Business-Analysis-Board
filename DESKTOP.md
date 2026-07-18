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

## App icon

The app icon lives at `build/icon.png` (1024×1024). electron-builder converts
it to the platform formats (`.icns` / `.ico`) automatically at package time.
Replace that file to rebrand — keep it square and at least 512×512.

## Automated builds (GitHub Actions)

`.github/workflows/desktop-build.yml` builds all three platforms in CI:

- **Manually**: Actions tab → “Build desktop apps” → *Run workflow*. The
  installers are uploaded as downloadable artifacts.
- **On release**: push a version tag and the built installers are attached to
  the matching GitHub Release automatically:
  ```bash
  git tag v1.0.0 && git push origin v1.0.0
  ```

Each OS is built on its own runner (macOS → dmg/zip, Windows → exe, Linux →
AppImage), so you get all platforms without needing each machine yourself.

## Backup & moving data between machines

Data lives in the app's local storage (per machine — it does not sync
automatically). To safeguard it or move it to another desktop:

1. In the sidebar footer, click **↓ Save backup** — this downloads a single
   `business-analysis-backup-YYYY-MM-DD.json` file containing everything you've
   entered/imported/changed across all tabs.
2. Keep that file somewhere safe (or copy it to another computer).
3. On any install, click **↑ Load backup** and pick the file to restore it
   (this replaces the current data, after a confirmation).

The backup is a plain, human-readable JSON file, so it's easy to store,
version, or share.

## Data & auth

- All data stays **on your machine** in the app's local storage.
- The Firebase Google sign‑in gate stays **off** in the desktop app unless you
  build with Firebase env vars set (`.env`). For local single‑user use you
  normally don't need it.
