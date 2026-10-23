/*
 * Chulo demo server — zero dependencies (Node 18+).
 *
 *   node server.js            → http://localhost:3000
 *
 * Serves /public and a small JSON REST API backed by data/db.json.
 * See README.md for the full API contract and how to plug in an admin app.
 *
 * Env:
 *   PORT          default 3000
 *   ADMIN_KEY     key admin endpoints expect in the x-admin-key header (default "chulo-demo")
 *   WEBHOOK_URL   optional; receives a POST for every order/reservation event
 *   CORS_ORIGIN   default "*"; set to your admin app's origin in production
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const core = require('./public/js/core.js');
const seedMenu = require('./public/js/menu-data.js');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'chulo-demo';
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

/* ---------- storage ---------- */

function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    const db = { orders: [], reservations: core.sampleReservations(seedMenu.settings, new Date()), menuOverrides: {} };
    saveDb(db);
    return db;
  }
}
function saveDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
const db = loadDb();
const menu = () => core.applyOverrides(seedMenu, db.menuOverrides);

/* ---------- webhooks ---------- */

function emit(event, data) {
  if (!WEBHOOK_URL) return;
  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event, data, at: new Date().toISOString() })
  }).catch((err) => console.warn('[webhook] ' + event + ' failed: ' + err.message));
}

/* ---------- http helpers ---------- */

function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN
  });
  res.end(JSON.stringify(body));
}
const ok = (res, data, status) => send(res, status || 200, { data });
const err = (res, r) => send(res, r.status || 400, { error: r.error });
const result = (res, r) => (r.ok ? ok(res, r.data, r.status) : err(res, r));

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 100 * 1024) { reject(new Error('too_large')); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}

const isAdmin = (req) => req.headers['x-admin-key'] === ADMIN_KEY;

/* ---------- routes ---------- */

const routes = [];
const route = (method, pattern, handler, opts) => routes.push({ method, pattern, handler, admin: !!(opts && opts.admin) });

route('GET', /^\/api\/health$/, (req, res) => ok(res, { ok: true, mode: 'server' }));

route('GET', /^\/api\/menu$/, (req, res) => ok(res, menu()));

route('GET', /^\/api\/availability$/, (req, res, m, q) => {
  const party = Number(q.get('party')) || 2;
  const date = q.get('date');
  if (!core.isDateKey(date)) return err(res, { status: 400, error: { code: 'bad_date', message: 'Invalid date.' } });
  ok(res, { date, party, slots: core.availability(seedMenu.settings, db.reservations, date, party, new Date()) });
});

route('POST', /^\/api\/reservations$/, async (req, res, m, q, body) => {
  const r = core.createReservation(db, seedMenu.settings, body, new Date());
  if (r.ok) { saveDb(db); emit('reservation.created', r.data); }
  result(res, r);
});

route('GET', /^\/api\/reservations\/([A-Z0-9-]+)$/i, (req, res, m, q) => {
  result(res, core.findReservation(db, m[1], q.get('email') || ''));
});

route('POST', /^\/api\/reservations\/([A-Z0-9-]+)\/cancel$/i, (req, res, m, q, body) => {
  const found = core.findReservation(db, m[1], body.email || '');
  if (!found.ok) return err(res, found);
  const r = core.updateReservation(db, seedMenu.settings, m[1], { status: 'cancelled' }, new Date());
  saveDb(db);
  emit('reservation.updated', r.data);
  result(res, r);
});

route('POST', /^\/api\/orders$/, (req, res, m, q, body) => {
  const r = core.createOrder(db, menu(), body, new Date());
  if (r.ok) { saveDb(db); emit('order.created', r.data); return ok(res, core.publicOrder(r.data), 201); }
  err(res, r);
});

route('GET', /^\/api\/orders\/([A-Z0-9-]+)$/i, (req, res, m) => {
  const o = db.orders.find((x) => x.ref === m[1].toUpperCase());
  if (!o) return err(res, { status: 404, error: { code: 'not_found', message: 'Order not found.' } });
  ok(res, core.publicOrder(o));
});

/* admin */

route('GET', /^\/api\/admin\/orders$/, (req, res, m, q) => {
  const date = q.get('date');
  const list = db.orders.filter((o) => !date || o.due.date === date);
  ok(res, list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}, { admin: true });

route('PATCH', /^\/api\/admin\/orders\/([A-Z0-9-]+)$/i, (req, res, m, q, body) => {
  const r = core.updateOrder(db, m[1], body, new Date());
  if (r.ok) { saveDb(db); emit('order.updated', r.data); }
  result(res, r);
}, { admin: true });

route('GET', /^\/api\/admin\/reservations$/, (req, res, m, q) => {
  const date = q.get('date');
  const list = db.reservations.filter((r) => !date || r.date === date);
  ok(res, list.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)));
}, { admin: true });

route('POST', /^\/api\/admin\/reservations$/, (req, res, m, q, body) => {
  const r = core.createReservation(db, seedMenu.settings, Object.assign({ source: 'phone' }, body), new Date());
  if (r.ok) { saveDb(db); emit('reservation.created', r.data); }
  result(res, r);
}, { admin: true });

route('PATCH', /^\/api\/admin\/reservations\/([A-Z0-9-]+)$/i, (req, res, m, q, body) => {
  const r = core.updateReservation(db, seedMenu.settings, m[1], body, new Date());
  if (r.ok) { saveDb(db); emit('reservation.updated', r.data); }
  result(res, r);
}, { admin: true });

route('PATCH', /^\/api\/admin\/menu\/([a-z0-9-]+)$/, (req, res, m, q, body) => {
  if (!seedMenu.items.some((i) => i.id === m[1])) return err(res, { status: 404, error: { code: 'not_found', message: 'Unknown item.' } });
  const o = db.menuOverrides[m[1]] || {};
  if (typeof body.available === 'boolean') o.available = body.available;
  if (Number.isInteger(body.price) && body.price >= 0) o.price = body.price;
  db.menuOverrides[m[1]] = o;
  saveDb(db);
  emit('menu.updated', { id: m[1], ...o });
  ok(res, menu().items.find((i) => i.id === m[1]));
}, { admin: true });

/* ---------- static files ---------- */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ics': 'text/calendar'
};

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (e, st) => {
    if (!e && st.isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (e2, buf) => {
      if (e2) {
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
        return res.end('<h1>Not found</h1><p><a href="/">Back to Chulo</a></p>');
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(buf);
    });
  });
}

/* ---------- server ---------- */

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': CORS_ORIGIN,
      'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
      'access-control-allow-headers': 'content-type, x-admin-key',
      'access-control-max-age': '86400'
    });
    return res.end();
  }

  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);

  const hit = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
  if (!hit) return err(res, { status: 404, error: { code: 'not_found', message: 'No such endpoint.' } });
  if (hit.admin && !isAdmin(req)) return err(res, { status: 401, error: { code: 'unauthorized', message: 'Missing or wrong x-admin-key.' } });

  try {
    const body = req.method === 'GET' ? {} : await readBody(req);
    await hit.handler(req, res, url.pathname.match(hit.pattern), url.searchParams, body);
  } catch (e) {
    const bad = e.message === 'bad_json' || e.message === 'too_large';
    err(res, { status: bad ? 400 : 500, error: { code: bad ? e.message : 'server_error', message: bad ? 'Invalid request body.' : 'Something went wrong on our side.' } });
    if (!bad) console.error(e);
  }
}).listen(PORT, () => {
  console.log('\n  Chulo is cooking at http://localhost:' + PORT);
  console.log('  Kitchen / admin view: http://localhost:' + PORT + '/admin/  (key: ' + (process.env.ADMIN_KEY ? '[from ADMIN_KEY]' : ADMIN_KEY) + ')\n');
});
