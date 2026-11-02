// Local REST API server. Clean-room reimplementation of the original's :48900 /api/v1 server.
// Security: every endpoint requires Authorization: Bearer <key>. No CORS headers (by design,
// so a random website cannot drive generation and burn the user's quota).
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const stores = require('./stores.js');
const queue = require('./task-queue.js');

const PORT_DEFAULT = 48900;
let server = null;
let onCrmJob = () => {};

function settings() { return stores.readJson('settings.json', {}); }
function saveSettings(patch) { const s = settings(); const n = { ...s, ...patch }; stores.writeJson('settings.json', n); return n; }

function getApiKey(regenerate = false) {
  let s = settings();
  if (regenerate || !s.apiKey) { s = saveSettings({ apiKey: 'sk-muse-' + crypto.randomBytes(18).toString('hex') }); }
  return s.apiKey;
}
function port() { const s = settings(); return s.apiPort || PORT_DEFAULT; }
function endpoint() { return `http://127.0.0.1:${port()}`; }

function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

function handler(req, res) {
  const url = new URL(req.url, endpoint());
  const auth = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  const key = getApiKey(false);
  if (!auth || auth !== key) return send(res, 401, { error: 'unauthorized' });

  const parts = url.pathname.replace(/^\/api\/v1\//, '').split('/').filter(Boolean); // e.g. ['tasks','<id>','file']

  if (parts[0] === 'tasks' && parts.length === 1 && req.method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    return send(res, 200, { tasks: queue.list().tasks.slice(0, limit) });
  }
  if (parts[0] === 'tasks' && parts.length === 1 && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let j = {}; try { j = JSON.parse(body || '{}'); } catch { return send(res, 400, { error: 'bad json' }); }
      if (!j.prompt) return send(res, 400, { error: 'prompt required' });
      const t = queue.submit({ prompt: String(j.prompt), label: String(j.label || ''), kind: j.kind === 'video' ? 'video' : 'image', ratio: j.ratio || '16:9', source: 'api' });
      try { onCrmJob({ prompt: j.prompt, label: j.label, topicId: j.topicId, at: Date.now() }); } catch {}
      return send(res, 201, { id: t.id, status: t.status });
    });
    return;
  }
  if (parts[0] === 'tasks' && parts[1] && parts.length === 2 && req.method === 'GET') {
    const t = queue.list().tasks.find(x => x.id === parts[1]);
    if (!t) return send(res, 404, { error: 'not found' });
    return send(res, 200, t);
  }
  if (parts[0] === 'tasks' && parts[1] && parts[2] === 'file' && req.method === 'GET') {
    const t = queue.list().tasks.find(x => x.id === parts[1]);
    const file = t && t.files && t.files[0];
    if (!file || !fs.existsSync(file)) return send(res, 404, { error: 'no file' });
    const ext = file.toLowerCase().endsWith('.mp4') ? 'video/mp4' : 'image/png';
    res.writeHead(200, { 'Content-Type': ext });
    return fs.createReadStream(file).pipe(res);
  }
  return send(res, 404, { error: 'unknown endpoint' });
}

function start({ onCrmJob: cb } = {}) {
  if (cb) onCrmJob = cb;
  if (server) return { running: true, endpoint: endpoint() };
  getApiKey(false); // ensure a key exists
  server = http.createServer(handler);
  server.on('error', (e) => { server = null; console.error('[api-server]', e.message); });
  server.listen(port(), '127.0.0.1');
  return { running: true, endpoint: endpoint() };
}
function stop() { if (server) { server.close(); server = null; } return { running: false }; }
function status() { return { running: !!server, endpoint: endpoint(), port: port() }; }

// Self-probe (main calls its own server; renderer can't due to no CORS).
function probe() {
  return new Promise((resolve) => {
    const req = http.request(endpoint() + '/api/v1/tasks?limit=1', { headers: { Authorization: 'Bearer ' + getApiKey(false) } }, (res) => {
      let body = ''; res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode, body: body.slice(0, 300) }));
    });
    req.on('error', e => resolve({ status: 0, error: e.message }));
    req.end();
  });
}

module.exports = { start, stop, status, getApiKey, endpoint, port, probe };
