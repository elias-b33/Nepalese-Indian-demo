/*
 * Chulo API client.
 *
 * Talks to the REST API in server.js. If no API is reachable (the site was
 * opened straight from disk, or deployed as static files), it falls back to a
 * "local demo" that runs the same business rules from core.js against
 * localStorage, so every flow still works end to end.
 *
 * To point the site at another backend, set before this script loads:
 *   <script>window.CHULO_API_BASE = 'https://api.your-restaurant.com'</script>
 */
(function () {
  'use strict';
  const core = window.ChuloCore;
  const seed = window.ChuloMenu;
  const BASE = String(window.CHULO_API_BASE || '').replace(/\/$/, '');
  const STORE = 'chulo.local-db.v1';

  class ApiError extends Error {
    constructor(e, status) {
      super((e && e.message) || 'Something went wrong. Please try again.');
      this.code = (e && e.code) || 'error';
      this.field = (e && e.field) || null;
      this.status = status || 0;
    }
  }

  let modePromise = null;
  function mode() {
    if (!modePromise) {
      modePromise = (async () => {
        if (location.protocol === 'file:' && !BASE) return 'local';
        try {
          const r = await fetch(BASE + '/api/health', { cache: 'no-store' });
          if (r.ok) return 'remote';
        } catch (e) { /* fall through */ }
        return 'local';
      })();
    }
    return modePromise;
  }

  /* ---------- remote ---------- */

  async function http(method, path, body, admin) {
    const headers = { 'content-type': 'application/json' };
    if (admin) headers['x-admin-key'] = adminKey();
    let r;
    try {
      r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    } catch (e) {
      throw new ApiError({ code: 'network', message: 'We could not reach the restaurant. Check your connection and try again.' });
    }
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new ApiError(json.error, r.status);
    return json.data;
  }

  const q = (o) => '?' + new URLSearchParams(o).toString();
  const remote = {
    menu: () => http('GET', '/api/menu'),
    availability: (date, party) => http('GET', '/api/availability' + q({ date, party })),
    createReservation: (input) => http('POST', '/api/reservations', input),
    getReservation: (ref, email) => http('GET', '/api/reservations/' + encodeURIComponent(ref) + q({ email })),
    cancelReservation: (ref, email) => http('POST', '/api/reservations/' + encodeURIComponent(ref) + '/cancel', { email }),
    createOrder: (input) => http('POST', '/api/orders', input),
    getOrder: (ref) => http('GET', '/api/orders/' + encodeURIComponent(ref)),
    admin: {
      orders: (date) => http('GET', '/api/admin/orders' + (date ? q({ date }) : ''), null, true),
      updateOrder: (ref, patch) => http('PATCH', '/api/admin/orders/' + ref, patch, true),
      reservations: (date) => http('GET', '/api/admin/reservations' + (date ? q({ date }) : ''), null, true),
      createReservation: (input) => http('POST', '/api/admin/reservations', input, true),
      updateReservation: (ref, patch) => http('PATCH', '/api/admin/reservations/' + ref, patch, true),
      updateItem: (id, patch) => http('PATCH', '/api/admin/menu/' + id, patch, true)
    }
  };

  /* ---------- local demo (localStorage) ---------- */

  function load() {
    try {
      const db = JSON.parse(localStorage.getItem(STORE));
      if (db && db.orders) return db;
    } catch (e) { /* ignore */ }
    const db = { orders: [], reservations: core.sampleReservations(seed.settings, new Date()), menuOverrides: {} };
    save(db);
    return db;
  }
  function save(db) {
    try { localStorage.setItem(STORE, JSON.stringify(db)); } catch (e) { /* storage full or blocked */ }
  }
  const latency = () => new Promise((r) => setTimeout(r, 250 + Math.random() * 250));
  async function run(fn, write) {
    await latency();
    const db = load();
    const r = fn(db);
    if (r && r.ok === false) throw new ApiError(r.error, r.status);
    if (write) save(db);
    return r && r.ok ? r.data : r;
  }
  const localMenu = (db) => core.applyOverrides(seed, db.menuOverrides);

  const local = {
    menu: () => run((db) => localMenu(db)),
    availability: (date, party) => run((db) => ({ date, party, slots: core.availability(seed.settings, db.reservations, date, Number(party), new Date()) })),
    createReservation: (input) => run((db) => core.createReservation(db, seed.settings, input, new Date()), true),
    getReservation: (ref, email) => run((db) => core.findReservation(db, ref, email || '')),
    cancelReservation: (ref, email) => run((db) => {
      const f = core.findReservation(db, ref, email || '');
      return f.ok ? core.updateReservation(db, seed.settings, ref, { status: 'cancelled' }, new Date()) : f;
    }, true),
    createOrder: (input) => run((db) => {
      const r = core.createOrder(db, localMenu(db), input, new Date());
      return r.ok ? { ok: true, data: core.publicOrder(r.data) } : r;
    }, true),
    getOrder: (ref) => run((db) => {
      const o = db.orders.find((x) => x.ref === String(ref).toUpperCase());
      return o ? { ok: true, data: core.publicOrder(o) } : { ok: false, status: 404, error: { code: 'not_found', message: 'Order not found.' } };
    }),
    admin: {
      orders: (date) => run((db) => db.orders.filter((o) => !date || o.due.date === date).sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
      updateOrder: (ref, patch) => run((db) => core.updateOrder(db, ref, patch, new Date()), true),
      reservations: (date) => run((db) => db.reservations.filter((r) => !date || r.date === date).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))),
      createReservation: (input) => run((db) => core.createReservation(db, seed.settings, Object.assign({ source: 'phone' }, input), new Date()), true),
      updateReservation: (ref, patch) => run((db) => core.updateReservation(db, seed.settings, ref, patch, new Date()), true),
      updateItem: (id, patch) => run((db) => {
        const o = db.menuOverrides[id] || {};
        if (typeof patch.available === 'boolean') o.available = patch.available;
        if (Number.isInteger(patch.price)) o.price = patch.price;
        db.menuOverrides[id] = o;
        return { ok: true, data: localMenu(db).items.find((i) => i.id === id) };
      }, true)
    }
  };

  /* ---------- public surface ---------- */

  function adminKey() {
    try { return localStorage.getItem('chulo.admin-key') || 'chulo-demo'; } catch (e) { return 'chulo-demo'; }
  }
  const pick = async () => ((await mode()) === 'remote' ? remote : local);
  const proxy = (name) => async (...a) => (await pick())[name](...a);
  const adminProxy = (name) => async (...a) => (await pick()).admin[name](...a);

  window.ChuloApi = {
    ApiError,
    mode,
    menu: proxy('menu'),
    availability: proxy('availability'),
    createReservation: proxy('createReservation'),
    getReservation: proxy('getReservation'),
    cancelReservation: proxy('cancelReservation'),
    createOrder: proxy('createOrder'),
    getOrder: proxy('getOrder'),
    admin: Object.fromEntries(Object.keys(local.admin).map((k) => [k, adminProxy(k)])),
    setAdminKey: (k) => { try { localStorage.setItem('chulo.admin-key', k); } catch (e) { /* ignore */ } },
    resetLocal: () => { try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ } }
  };
})();
