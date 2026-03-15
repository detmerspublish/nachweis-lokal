#!/usr/bin/env node
/**
 * Minimaler Test-Server fuer die Mobile UI.
 * Simuliert die API-Endpunkte mit Beispieldaten.
 *
 * Starten: node mobile/test-server.js
 * Oeffnen: http://localhost:8080/inspect/1?token=test
 *
 * Funktioniert auch vom Handy im gleichen WLAN:
 * http://<deine-lokale-ip>:8080/inspect/1?token=test
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { networkInterfaces } from 'node:os';

const PORT = 8080;
const MOBILE_DIR = new URL('.', import.meta.url).pathname;

// --- Mock data ---
const mockInspection = {
  id: 1,
  title: 'Brandschutz-Begehung',
  template_name: 'Brandschutz-Begehung',
  object_name: 'Gebäude Hauptstraße 12',
  inspector: 'Max Mustermann',
  inspection_date: new Date().toISOString().split('T')[0],
  status: 'offen',
};

const mockResults = [
  { id: 1, label: 'Flucht- und Rettungswege frei und gekennzeichnet?', hint: 'Breite mind. 1,20 m, keine Versperrungen', required: true, result: 'offen', remark: '' },
  { id: 2, label: 'Feuerlöscher vorhanden und geprüft?', hint: 'Prüfdatum < 2 Jahre, Plombierung intakt', required: true, result: 'offen', remark: '' },
  { id: 3, label: 'Brandmeldeanlage funktionsfähig?', hint: 'Letzte Wartung prüfen', required: true, result: 'offen', remark: '' },
  { id: 4, label: 'Brandschutztüren schließen selbsttätig?', hint: 'Keine Verkeimung, Dichtungen intakt', required: true, result: 'offen', remark: '' },
  { id: 5, label: 'Elektrische Anlagen augenscheinlich in Ordnung?', hint: 'Keine sichtbaren Schäden, lose Kabel', required: true, result: 'offen', remark: '' },
  { id: 6, label: 'Flucht- und Rettungsplan aktuell und ausgehängt?', hint: 'An jedem Stockwerk, aktuelles Datum', required: true, result: 'offen', remark: '' },
  { id: 7, label: 'Rauchmelder vorhanden und funktionsfähig?', hint: 'Testknopf drücken, Batterie prüfen', required: true, result: 'offen', remark: '' },
  { id: 8, label: 'Sammelplatz gekennzeichnet und bekannt?', hint: null, required: false, result: 'offen', remark: '' },
];

// --- MIME types ---
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

// --- Server ---
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  // CORS (fuer lokale Tests)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // API: Inspection laden
  if (path.match(/^\/api\/inspection\/\d+$/) && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ inspection: mockInspection, results: mockResults, photos: {} }));
    return;
  }

  // API: Ergebnis speichern
  if (path.match(/^\/api\/inspection\/\d+\/result\/\d+$/) && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const data = JSON.parse(body);
      const resultId = parseInt(path.split('/').pop());
      const r = mockResults.find(x => x.id === resultId);
      if (r) {
        r.result = data.result;
        r.remark = data.remark || '';
        console.log(`  Prüfpunkt ${resultId}: ${data.result}${data.remark ? ' — ' + data.remark : ''}`);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // API: Foto hochladen
  if (path.match(/^\/api\/inspection\/\d+\/photo\/\d+$/) && req.method === 'POST') {
    let size = 0;
    req.on('data', c => size += c.length);
    req.on('end', () => {
      console.log(`  Foto empfangen: ${(size / 1024).toFixed(0)} KB`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, url: '/mobile/placeholder.jpg' }));
    });
    return;
  }

  // API: Abschließen
  if (path.match(/^\/api\/inspection\/\d+\/complete$/) && req.method === 'POST') {
    console.log('  Prüfung abgeschlossen!');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Statische Dateien aus mobile/
  if (path.startsWith('/mobile/')) {
    const filePath = join(MOBILE_DIR, path.replace('/mobile/', ''));
    if (existsSync(filePath)) {
      const ext = extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(readFileSync(filePath));
      return;
    }
  }

  // /inspect/:id → index.html ausliefern
  if (path.startsWith('/inspect/')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(readFileSync(join(MOBILE_DIR, 'index.html')));
    return;
  }

  // Fallback
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('');
  console.log('  Mobile UI Test-Server gestartet');
  console.log('');
  console.log('  Lokal:    http://localhost:' + PORT + '/inspect/1?token=test');
  if (localIP) {
    console.log('  Handy:    http://' + localIP + ':' + PORT + '/inspect/1?token=test');
  }
  console.log('');
  console.log('  Strg+C zum Beenden');
  console.log('');
});

function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}
