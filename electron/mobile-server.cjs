const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

let server = null;
let token = null;
let currentInspectionId = null;
let lastRequestTime = Date.now();
let shutdownTimer = null;
let serverPort = null;
let serverIp = null;
let getDbFn = null;
let onResultUpdateFn = null;
let mobileStaticPath = null;

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB
const DEFAULT_PORT = 18080;

/**
 * Generate a self-signed certificate for HTTPS on local network.
 * Uses Node.js built-in crypto (no openssl CLI needed).
 */
function generateSelfSignedCert(ip) {
  const { generateKeyPairSync, createSign, X509Certificate } = crypto;

  // Generate RSA key pair
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Try openssl for certificate generation (most reliable)
  try {
    const tmpDir = os.tmpdir();
    const keyFile = path.join(tmpDir, 'nachweis-mobile-key.pem');
    const certFile = path.join(tmpDir, 'nachweis-mobile-cert.pem');

    fs.writeFileSync(keyFile, privateKey);
    execSync(
      `openssl req -new -x509 -key "${keyFile}" -out "${certFile}" -days 365 -subj "/CN=Nachweis Lokal" -addext "subjectAltName=IP:${ip}" 2>/dev/null`,
      { timeout: 5000 }
    );
    const cert = fs.readFileSync(certFile, 'utf-8');
    // Cleanup
    try { fs.unlinkSync(keyFile); } catch (_) {}
    try { fs.unlinkSync(certFile); } catch (_) {}

    return { key: privateKey, cert };
  } catch (_) {
    // openssl not available — fall back to HTTP
    return null;
  }
}

function detectLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function resetIdleTimer() {
  lastRequestTime = Date.now();
  if (shutdownTimer) clearTimeout(shutdownTimer);
  shutdownTimer = setTimeout(() => {
    stopServer();
  }, IDLE_TIMEOUT_MS);
}

function validateToken(req) {
  const url = new URL(req.url, 'http://localhost');
  const queryToken = url.searchParams.get('token');
  if (queryToken === token) return true;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ') && authHeader.slice(7) === token) return true;
  return false;
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function send404(res) {
  sendJson(res, 404, { error: 'Not found' });
}

function send401(res) {
  sendJson(res, 401, { error: 'Unauthorized' });
}

function send400(res, message) {
  sendJson(res, 400, { error: message || 'Bad request' });
}

function send500(res, message) {
  sendJson(res, 500, { error: message || 'Internal server error' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_UPLOAD_SIZE) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseJsonBody(buffer) {
  try {
    return JSON.parse(buffer.toString('utf-8'));
  } catch (_) {
    return null;
  }
}

function serveStaticFile(res, filePath) {
  const extMap = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };
  const ext = path.extname(filePath).toLowerCase();
  const contentType = extMap[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      send404(res);
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
    });
    res.end(data);
  });
}

function parseMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from('--' + boundary);
  const parts = [];
  let start = 0;

  while (true) {
    const idx = buffer.indexOf(boundaryBuf, start);
    if (idx === -1) break;

    if (start > 0) {
      // Extract the part between previous boundary and this one
      // Skip the CRLF after the boundary marker
      const partData = buffer.subarray(start, idx - 2); // -2 for CRLF before boundary
      const headerEnd = partData.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        const headers = partData.subarray(0, headerEnd).toString('utf-8');
        const body = partData.subarray(headerEnd + 4);
        const filenameMatch = headers.match(/filename="([^"]+)"/);
        const nameMatch = headers.match(/name="([^"]+)"/);
        parts.push({
          name: nameMatch ? nameMatch[1] : null,
          filename: filenameMatch ? filenameMatch[1] : null,
          data: body,
        });
      }
    }

    start = idx + boundaryBuf.length + 2; // +2 for CRLF after boundary

    // Check if this is the closing boundary (--)
    if (buffer[start - 2] === 0x2d && buffer[start - 1] === 0x2d) break;
  }

  return parts;
}

function handleRequest(req, res) {
  resetIdleTimer();

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  // Service Worker and manifest must be served from root scope
  if (pathname === '/mobile/sw.js' || pathname === '/mobile/manifest.json') {
    const filePath = path.join(mobileStaticPath, pathname.slice('/mobile/'.length));
    serveStaticFile(res, filePath);
    return;
  }

  // Static file serving from /mobile/
  if (pathname.startsWith('/mobile/')) {
    const relativePath = pathname.slice('/mobile/'.length);
    // Prevent directory traversal
    const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(mobileStaticPath, safePath);
    serveStaticFile(res, filePath);
    return;
  }

  // Entry point: /inspect/:id — serves mobile/index.html
  const inspectMatch = pathname.match(/^\/inspect\/(\d+)$/);
  if (inspectMatch && req.method === 'GET') {
    if (!validateToken(req)) {
      send401(res);
      return;
    }
    const indexPath = path.join(mobileStaticPath, 'index.html');
    serveStaticFile(res, indexPath);
    return;
  }

  // All /api/ routes require valid token
  if (pathname.startsWith('/api/')) {
    if (!validateToken(req)) {
      send401(res);
      return;
    }

    try {
      // GET /api/status
      if (pathname === '/api/status' && req.method === 'GET') {
        sendJson(res, 200, { connected: true, inspectionId: currentInspectionId });
        return;
      }

      // GET /api/inspection/:id
      const getInspectionMatch = pathname.match(/^\/api\/inspection\/(\d+)$/);
      if (getInspectionMatch && req.method === 'GET') {
        const inspectionId = parseInt(getInspectionMatch[1], 10);
        const db = getDbFn();
        const inspection = db.prepare(`
          SELECT i.*, t.name as template_name, o.name as object_name
          FROM inspections i
          LEFT JOIN templates t ON i.template_id = t.id
          LEFT JOIN objects o ON i.object_id = o.id
          WHERE i.id = ?
        `).get(inspectionId);

        if (!inspection) {
          send404(res);
          return;
        }

        const results = db.prepare(`
          SELECT ir.*, ti.label, ti.hint, ti.required, ti.sort_order
          FROM inspection_results ir
          JOIN template_items ti ON ir.template_item_id = ti.id
          WHERE ir.inspection_id = ?
          ORDER BY ti.sort_order
        `).all(inspectionId);

        // Load existing photos grouped by result ID
        const attachments = db.prepare(
          'SELECT a.id, a.inspection_result_id, a.file_name FROM attachments a JOIN inspection_results ir ON a.inspection_result_id = ir.id WHERE ir.inspection_id = ?'
        ).all(inspectionId);
        const photos = {};
        for (const a of attachments) {
          if (!photos[a.inspection_result_id]) photos[a.inspection_result_id] = [];
          photos[a.inspection_result_id].push({ id: a.id, url: '/api/photo/' + a.id, name: a.file_name });
        }

        sendJson(res, 200, { inspection, results, photos });
        return;
      }

      // GET /api/photo/:id — serve attachment file
      const photoMatch2 = pathname.match(/^\/api\/photo\/(\d+)$/);
      if (photoMatch2 && req.method === 'GET') {
        const attachId = parseInt(photoMatch2[1], 10);
        const db = getDbFn();
        const att = db.prepare('SELECT file_path, file_name FROM attachments WHERE id = ?').get(attachId);
        if (!att || !fs.existsSync(att.file_path)) {
          send404(res);
          return;
        }
        serveStaticFile(res, att.file_path);
        return;
      }

      // POST /api/inspection/:id/result/:resultId
      const resultMatch = pathname.match(/^\/api\/inspection\/(\d+)\/result\/(\d+)$/);
      if (resultMatch && req.method === 'POST') {
        const inspectionId = parseInt(resultMatch[1], 10);
        const resultId = parseInt(resultMatch[2], 10);
        readBody(req).then((buffer) => {
          const body = parseJsonBody(buffer);
          if (!body || typeof body.result === 'undefined') {
            send400(res, 'Missing result field');
            return;
          }
          const db = getDbFn();
          db.prepare('UPDATE inspection_results SET result = ?, remark = ? WHERE id = ?')
            .run(body.result, body.remark || '', resultId);
          if (onResultUpdateFn) {
            onResultUpdateFn({ inspectionId, resultId, result: body.result, remark: body.remark || '' });
          }
          sendJson(res, 200, { ok: true });
        }).catch((err) => {
          send400(res, err.message);
        });
        return;
      }

      // POST /api/inspection/:id/complete
      const completeMatch = pathname.match(/^\/api\/inspection\/(\d+)\/complete$/);
      if (completeMatch && req.method === 'POST') {
        const inspectionId = parseInt(completeMatch[1], 10);
        readBody(req).then((buffer) => {
          const body = parseJsonBody(buffer) || {};
          const db = getDbFn();
          const hasDefects = db.prepare(
            "SELECT COUNT(*) as c FROM inspection_results WHERE inspection_id = ? AND result = 'maengel'"
          ).get(inspectionId).c > 0;
          const status = hasDefects ? 'bemaengelt' : 'bestanden';
          db.prepare("UPDATE inspections SET status = ?, updated_at = datetime('now') WHERE id = ?")
            .run(status, inspectionId);
          if (onResultUpdateFn) {
            onResultUpdateFn({ inspectionId, completed: true, status });
          }
          sendJson(res, 200, { ok: true, status });
        }).catch((err) => {
          send400(res, err.message);
        });
        return;
      }

      // POST /api/inspection/:id/photo/:resultId
      const photoMatch = pathname.match(/^\/api\/inspection\/(\d+)\/photo\/(\d+)$/);
      if (photoMatch && req.method === 'POST') {
        const inspectionId = parseInt(photoMatch[1], 10);
        const resultId = parseInt(photoMatch[2], 10);
        readBody(req).then((buffer) => {
          const contentType = req.headers['content-type'] || '';
          const boundaryMatch = contentType.match(/boundary=(.+?)(?:;|$)/);
          if (!boundaryMatch) {
            send400(res, 'Missing multipart boundary');
            return;
          }
          const parts = parseMultipart(buffer, boundaryMatch[1].trim());
          const filePart = parts.find((p) => p.filename);
          if (!filePart) {
            send400(res, 'No file found in upload');
            return;
          }

          if (filePart.data.length > MAX_UPLOAD_SIZE) {
            send400(res, 'File exceeds 10 MB limit');
            return;
          }

          // Save to userData/attachments/<resultId>/<timestamp>_<filename>
          const { app } = require('electron');
          const attachDir = path.join(app.getPath('userData'), 'attachments', String(resultId));
          fs.mkdirSync(attachDir, { recursive: true });
          const safeFilename = filePart.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
          const timestamp = Date.now();
          const fileName = `${timestamp}_${safeFilename}`;
          const filePath = path.join(attachDir, fileName);
          fs.writeFileSync(filePath, filePart.data);

          // Detect mime type from extension
          const ext = path.extname(safeFilename).toLowerCase();
          const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
          const mimeType = mimeTypes[ext] || 'image/jpeg';

          // Insert into attachments table
          const db = getDbFn();
          const info = db.prepare(
            'INSERT INTO attachments (inspection_result_id, file_path, file_name, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?)'
          ).run(resultId, filePath, safeFilename, mimeType, filePart.data.length);

          if (onResultUpdateFn) {
            onResultUpdateFn({ inspectionId, resultId, photoAdded: true, attachmentId: info.lastInsertRowid });
          }

          sendJson(res, 200, { ok: true, attachmentId: Number(info.lastInsertRowid) });
        }).catch((err) => {
          send500(res, err.message);
        });
        return;
      }

      send404(res);
    } catch (err) {
      send500(res, err.message);
    }
    return;
  }

  send404(res);
}

function startServer({ getDb, mobilePath, onResultUpdate }) {
  if (server) {
    return getStatus();
  }

  getDbFn = getDb;
  mobileStaticPath = mobilePath;
  onResultUpdateFn = onResultUpdate || null;
  token = crypto.randomBytes(16).toString('hex');
  serverIp = detectLocalIp();

  // HTTP — kein HTTPS, da selbstsignierte Zertifikate Sicherheitswarnungen
  // auf dem Handy verursachen die Endanwender verunsichern.
  // Fotos funktionieren über <input type="file" accept="image/*"> auch ohne HTTPS.
  server = http.createServer(handleRequest);
  const protocol = 'http';

  // Try default port, fall back to random
  return new Promise((resolve, reject) => {
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        server.listen(0, '0.0.0.0', () => {
          serverPort = server.address().port;
          resetIdleTimer();
          const url = `${protocol}://${serverIp}:${serverPort}`;
          resolve({ url, port: serverPort, ip: serverIp, token, protocol });
        });
      } else {
        reject(err);
      }
    });

    server.listen(DEFAULT_PORT, '0.0.0.0', () => {
      serverPort = DEFAULT_PORT;
      resetIdleTimer();
      const url = `${protocol}://${serverIp}:${serverPort}`;
      resolve({ url, port: serverPort, ip: serverIp, token, protocol });
    });
  });
}

function stopServer() {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }
  if (server) {
    server.close();
    server = null;
  }
  token = null;
  currentInspectionId = null;
  serverPort = null;
  serverIp = null;
  getDbFn = null;
  onResultUpdateFn = null;
}

function getStatus() {
  return {
    active: server !== null,
    inspectionId: currentInspectionId,
    token,
    url: server ? `${server instanceof https.Server ? 'https' : 'http'}://${serverIp}:${serverPort}` : null,
  };
}

function setInspection(inspectionId) {
  currentInspectionId = inspectionId;
}

module.exports = { startServer, stopServer, getStatus, setInspection };
