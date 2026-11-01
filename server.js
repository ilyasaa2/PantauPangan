const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TELEMETRY_DB_PATH = path.join(DATA_DIR, 'telemetry_db.json');
const AUDIT_DB_PATH = path.join(DATA_DIR, 'audit_db.json');

// Pastikan direktori database lokal tersedia
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-Memory Database Cache (Menghilangkan Disk I/O Blocking)
let telemetryMemoryDB = [];
let auditMemoryDB = [];
let isTelemetryDirty = false;
let isAuditDirty = false;

try {
  if (fs.existsSync(TELEMETRY_DB_PATH)) {
    telemetryMemoryDB = JSON.parse(fs.readFileSync(TELEMETRY_DB_PATH, 'utf-8') || '[]');
  }
} catch (e) { telemetryMemoryDB = []; }

try {
  if (fs.existsSync(AUDIT_DB_PATH)) {
    auditMemoryDB = JSON.parse(fs.readFileSync(AUDIT_DB_PATH, 'utf-8') || '[]');
  }
} catch (e) { auditMemoryDB = []; }

// Background Flush Async: Menulis ke disk tiap 10 detik secara non-blocking
setInterval(() => {
  if (isTelemetryDirty) {
    isTelemetryDirty = false;
    fs.writeFile(TELEMETRY_DB_PATH, JSON.stringify(telemetryMemoryDB.slice(0, 500)), 'utf-8', (err) => {
      if (err) console.error('[FLUSH TELEMETRY ERROR]', err.message);
    });
  }
  if (isAuditDirty) {
    isAuditDirty = false;
    fs.writeFile(AUDIT_DB_PATH, JSON.stringify(auditMemoryDB.slice(0, 500)), 'utf-8', (err) => {
      if (err) console.error('[FLUSH AUDIT ERROR]', err.message);
    });
  }
}, 10000);

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Daftar subscriber Server-Sent Events (SSE)
let sseClients = [];

const server = http.createServer((req, res) => {
  // 1. Endpoint SSE: Streaming data real-time ke dashboard
  if (req.url === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('retry: 3000\n\n');
    sseClients.push(res);

    req.on('close', () => {
      sseClients = sseClients.filter(client => client !== res);
    });
    return;
  }

  // 2. Endpoint REST: Database Telemetri (In-Memory Fast Response)
  if (req.url === '/api/telemetry') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(telemetryMemoryDB));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      let isDestroyed = false;

      // Proteksi DoS: Batasi payload maksimum 50 KB
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 50 * 1024) {
          isDestroyed = true;
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ERROR', message: 'Payload Too Large' }));
          req.destroy();
        }
      });

      req.on('end', () => {
        if (isDestroyed) return;
        try {
          const payload = JSON.parse(body);

          // Simpan ke RAM memory cache (Instan 0.001 ms, tanpa disk blocking)
          telemetryMemoryDB.unshift({ ...payload, received_at: new Date().toISOString() });
          if (telemetryMemoryDB.length > 500) telemetryMemoryDB.pop();
          isTelemetryDirty = true;

          // Broadcast ke klien dashboard SSE
          if (sseClients.length > 0) {
            const dataStr = `data: ${JSON.stringify(payload)}\n\n`;
            for (let i = 0; i < sseClients.length; i++) {
              sseClients[i].write(dataStr);
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'SUCCESS' }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ERROR', message: 'Invalid JSON' }));
        }
      });
      return;
    }
  }

  // 3. Endpoint REST: Database Audit Trail
  if (req.url === '/api/audit') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(auditMemoryDB));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 50 * 1024) req.destroy();
      });

      req.on('end', () => {
        try {
          const auditEntry = JSON.parse(body);
          auditMemoryDB.unshift(auditEntry);
          if (auditMemoryDB.length > 500) auditMemoryDB.pop();
          isAuditDirty = true;

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'SAVED' }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ERROR' }));
        }
      });
      return;
    }
  }

  // 4. Endpoint REST: Reset Database Penuh (Kosongkan Semua Log)
  if (req.url === '/api/reset' && (req.method === 'POST' || req.method === 'DELETE')) {
    telemetryMemoryDB = [];
    auditMemoryDB = [];
    isTelemetryDirty = false;
    isAuditDirty = false;
    try {
      fs.writeFileSync(TELEMETRY_DB_PATH, '[]', 'utf-8');
      fs.writeFileSync(AUDIT_DB_PATH, '[]', 'utf-8');
    } catch (e) {}

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'CLEARED', message: 'Seluruh database telah dikosongkan.' }));
    return;
  }

  // 5. Static Files Serving (Protected Path Traversal)
  let reqPath = req.url.split('?')[0];
  const normalizedPath = path.normalize(reqPath === '/' ? '/index.html' : reqPath);
  const safeBase = path.resolve(__dirname);
  const filePath = path.resolve(safeBase, '.' + normalizedPath);

  if (!filePath.startsWith(safeBase)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`PantauPangan SCADA High-Performance server at http://localhost:${PORT}/`);
  console.log(`In-Memory Caching Active | Disk Auto-Flush every 10s`);
});
