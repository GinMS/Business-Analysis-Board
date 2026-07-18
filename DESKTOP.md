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

## Auto-updates (no reinstall)

Installed apps can update themselves — no manual reinstall. On launch the app
checks the GitHub Releases feed; if a newer version is published it downloads in
the background and, when ready, asks to **Restart now** to apply it.

### Shipping an update

1. Bump the version in `package.json` (e.g. `0.0.0` → `1.0.1`).
2. Tag and push:
   ```bash
   git commit -am "release v1.0.1"
   git tag v1.0.1 && git push origin v1.0.1
   ```
3. CI builds all platforms and **publishes** them to the matching GitHub
   Release, including the `latest*.yml` metadata the updater reads.

Users on an older version get the update automatically next time they open the
app. (Updater `provider` is set in `package.json` → `build.publish`; point
`owner`/`repo` at your GitHub repo.)

### ⚠️ macOS requires code signing

macOS will only **apply** an auto-update if the app is **signed with an Apple
Developer ID and notarized** — Squirrel.Mac refuses unsigned updates. So:

- **Windows & Linux:** auto-update works out of the box (even unsigned).
- **macOS, unsigned:** the app still *detects* a new version and shows a
  **Download** button that opens the Releases page — you then grab the new
  `.dmg` manually (a lighter "reinstall", but not fully automatic).
- **macOS, fully automatic:** add an Apple Developer ID. In CI set
  `CSC_LINK` (base64 of your `.p12`), `CSC_KEY_PASSWORD`, and the notarization
  secrets (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`), and
  remove `CSC_IDENTITY_AUTO_DISCOVERY: false` from the workflow. Then macOS
  auto-update works like Windows/Linux.

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
