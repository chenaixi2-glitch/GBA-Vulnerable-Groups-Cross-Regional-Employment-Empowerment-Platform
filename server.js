/**
 * Static file server with portal rewrites so /individual/ and /corporate/ map to the real HTML entry files.
 * Usage: node server.js  (default port 3000, override with PORT)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;

/** Must stay aligned with PORTALS in api.js (used for server-side rewrites) */
const PORTAL_ENTRIES = [
  ['/individual/', path.join(ROOT, 'individual', 'individual_index.html')],
  ['/individual', path.join(ROOT, 'individual', 'individual_index.html')],
  ['/individual/index.html', path.join(ROOT, 'individual', 'individual_index.html')],
  ['/corporate/', path.join(ROOT, 'corporate', 'corporate_index.html')],
  ['/corporate', path.join(ROOT, 'corporate', 'corporate_index.html')],
  ['/corporate/index.html', path.join(ROOT, 'corporate', 'corporate_index.html')]
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function safeResolve(urlPathname) {
  const decoded = decodeURIComponent(urlPathname.split('?')[0]);
  const joined = path.normalize(path.join(ROOT, decoded.replace(/^\//, '')));
  if (!joined.startsWith(ROOT)) return null;
  return joined;
}

function sendFile(res, filePath, statusCode = 200) {
  const ext = path.extname(filePath);
  const type = MIME[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    res.writeHead(statusCode, { 'Content-Type': type });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const pathname = req.url ? new URL(req.url, `http://${req.headers.host}`).pathname : '/';

  for (const [prefix, file] of PORTAL_ENTRIES) {
    if (pathname === prefix) {
      sendFile(res, file);
      return;
    }
  }

  if (pathname === '/api/portals') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        data: {
          welcome: '/',
          individual: '/individual/',
          corporate: '/corporate/'
        }
      })
    );
    return;
  }

  const resolved = pathname === '/' ? path.join(ROOT, 'index.html') : safeResolve(pathname);

  if (!resolved) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(resolved, (err, st) => {
    if (!err && st.isDirectory()) {
      const indexFile = path.join(resolved, 'index.html');
      fs.access(indexFile, fs.constants.F_OK, accErr => {
        if (!accErr) sendFile(res, indexFile);
        else {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not Found');
        }
      });
      return;
    }

    fs.access(resolved, fs.constants.F_OK, accErr => {
      if (accErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
      } else {
        sendFile(res, resolved);
      }
    });
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use (this project may already be running). Free the port or run: $env:PORT=3001; node server.js`
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`GBA platform: http://127.0.0.1:${PORT}`);
  console.log(`  Individual: http://127.0.0.1:${PORT}/individual/`);
  console.log(`  Corporate: http://127.0.0.1:${PORT}/corporate/`);
});
