const { app, BrowserWindow, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Use one consistent storage folder whether running `npm run app` (dev) or the
// packaged .app, so data lives in the same place either way.
app.setName('Business Analysis Board');

// Serve the built SPA over a loopback HTTP server on a FIXED port. localStorage
// is keyed by origin *including the port*, so the port must be stable across
// launches for saved data to load again — a random port would orphan it.
const DIST = path.join(__dirname, '..', 'dist');
const FIXED_PORT = 34517;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        let filePath = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath);
        // Prevent path traversal outside dist
        if (!filePath.startsWith(DIST)) { res.statusCode = 403; return res.end('Forbidden'); }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(DIST, 'index.html'); // SPA fallback
        }
        const ext = path.extname(filePath).toLowerCase();
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        fs.createReadStream(filePath).pipe(res);
      } catch (e) {
        res.statusCode = 500;
        res.end('Server error');
      }
    });
    // If the fixed port is busy (e.g. a second window of this app), reuse the
    // same origin so localStorage stays consistent.
    server.on('error', () => resolve(FIXED_PORT));
    server.listen(FIXED_PORT, '127.0.0.1', () => resolve(FIXED_PORT));
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#f4f6fb',
    title: 'Business Analysis Board',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external links (e.g. Google sign-in) in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const port = await startServer();
    await win.loadURL(`http://127.0.0.1:${port}/`);
  }
}

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
