/*
 * Kitchen / admin view — a reference client for the admin API.
 * Everything here goes through ChuloApi.admin.*, so a separate admin app
 * (React, Retool, a POS integration…) can do exactly the same over HTTP.
 */
(function () {
  'use strict';
  const { S, esc, moneyExact, fmtTime, fmtDate, relDay } = window.Chulo;
  const core = window.ChuloCore;
  const Api = window.ChuloApi;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  const state = { tab: 'orders', orders: [], seen: null, resDate: core.dateKey(new Date()), sound: true };
  try { state.sound = localStorage.getItem('chulo.admin-sound') !== 'off'; } catch (e) { /* ignore */ }

  /* ---------- shell ---------- */

  function setTab(tab) {
    state.tab = tab;
    $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
    history.replaceState(null, '', '#' + tab);
    refresh();
  }
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  const clock = () => { const d = new Date(); $('[data-clock]').textContent = core.pad(d.getHours()) + ':' + core.pad(d.getMinutes()); };
  clock(); setInterval(clock, 10000);

  const soundBtn = $('[data-sound]');
  const paintSound = () => { soundBtn.textContent = state.sound ? 'Chime on' : 'Chime off'; soundBtn.setAttribute('aria-pressed', String(state.sound)); };
  paintSound();
  soundBtn.addEventListener('click', () => {
    state.sound = !state.sound;
    try { localStorage.setItem('chulo.admin-sound', state.sound ? 'on' : 'off'); } catch (e) { /* ignore */ }
    paintSound();
    if (state.sound) chime();
  });

  let audio;
  function chime() {
    if (!state.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18].forEach((t, i) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.frequency.value = i ? 1046 : 784;
        g.gain.setValueAtTime(0.0001, audio.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.5);
        o.connect(g).connect(audio.destination);
        o.start(audio.currentTime + t);
        o.stop(audio.currentTime + t + 0.55);
      });
    } catch (e) { /* audio blocked until first interaction */ }
  }

  function handleError(err) {
    if (err.status === 401) { $('[data-keybar]').hidden = false; return true; }
    console.warn(err);
    return false;
  }
  $('[data-key-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    Api.setAdminKey(e.target.key.value.trim());
    $('[data-keybar]').hidden = true;
    refresh();
  });

  /* ---------- orders ---------- */

  const COLS = [
    { id: 'new', title: 'New', match: (o) => o.status === 'received' },
    { id: 'cooking', title: 'Cooking', match: (o) => o.status === 'preparing' },
    { id: 'ready', title: 'Ready / on the road', match: (o) => o.status === 'ready' || o.status === 'out_for_delivery' },
    { id: 'done', title: 'Done today', match: (o) => (o.status === 'completed' || o.status === 'cancelled') && o.updatedAt.slice(0, 10) === new Date().toISOString().slice(0, 10) }
  ];
  const NEXT = {
    collection: { received: ['preparing', 'Start cooking'], preparing: ['ready', 'Ready for pickup'], ready: ['completed', 'Collected'] },
    delivery: { received: ['preparing', 'Start cooking'], preparing: ['out_for_delivery', 'Out for delivery'], out_for_delivery: ['completed', 'Delivered'] }
  };

  function dueLabel(o) {
    const today = o.due.date === core.dateKey(new Date());
    return (today ? '' : fmtDate(o.due.date, { weekday: 'short', day: 'numeric' }) + ' ') + fmtTime(o.due.time);
  }
  function isLate(o) {
    if (o.status === 'completed' || o.status === 'cancelled') return false;
    const due = core.parseKey(o.due.date);
    due.setMinutes(core.toMin(o.due.time));
    return Date.now() > due.getTime();
  }

  function card(o, fresh) {
    const next = NEXT[o.type][o.status];
    const later = o.due.date !== core.dateKey(new Date());
    const pay = (S.ordering.payment.find((p) => p.id === o.payment.method) || {}).label || o.payment.method;
    return '<article class="ticket-card' + (fresh ? ' is-new' : '') + '" data-ref="' + o.ref + '">' +
      '<div class="tc-head"><span class="tc-ref">' + o.ref + '</span><span class="tc-due' + (isLate(o) ? ' late' : '') + '">' + (o.due.asap ? 'ASAP · ' : '') + esc(dueLabel(o)) + '</span></div>' +
      '<div class="tc-meta"><span class="pill ' + o.type + '">' + o.type + '</span>' + (later ? '<span class="pill later">Scheduled</span>' : '') +
      (o.status === 'cancelled' ? '<span class="pill cancelled">Cancelled</span>' : '') + (o.cutlery ? '<span>+ cutlery</span>' : '') + '</div>' +
      '<ul class="tc-items">' + o.items.map((l) => '<li><b>' + l.qty + '×</b><span>' + esc(l.name) +
        ((l.options.length || l.note) ? '<small>' + esc(l.options.map((x) => x.choice.replace(/,.*$/, '')).concat(l.note ? ['“' + l.note + '”'] : []).join(' · ')) + '</small>' : '') + '</span></li>').join('') + '</ul>' +
      (o.notes ? '<div class="tc-note">' + esc(o.notes) + '</div>' : '') +
      '<div class="tc-cust"><strong>' + esc(o.customer.name) + '</strong> · <a href="tel:' + esc(o.customer.phone.replace(/\s/g, '')) + '">' + esc(o.customer.phone) + '</a>' +
      (o.address ? '<br>' + esc([o.address.line1, o.address.line2, o.address.postcode].filter(Boolean).join(', ')) + (o.address.instructions ? '<br><em>' + esc(o.address.instructions) + '</em>' : '') : '') + '</div>' +
      '<div class="tc-actions">' +
      (next ? '<button class="btn btn-primary" type="button" data-advance="' + next[0] + '">' + next[1] + '</button>' : '') +
      (next ? '<button class="link" type="button" data-cancel-order>Cancel</button>' : '') +
      '<span class="tc-total" title="' + esc(pay) + '">' + moneyExact(o.total) + '</span>' +
      '</div></article>';
  }

  function renderOrders(fresh) {
    const active = state.orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled');
    const todays = state.orders.filter((o) => o.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10) && o.status !== 'cancelled');
    $('[data-order-stats]').innerHTML =
      stat('Open orders', active.length) +
      stat('Orders today', todays.length) +
      stat('Takings today', moneyExact(todays.reduce((s, o) => s + o.total, 0))) +
      stat('Late', active.filter(isLate).length);
    $('[data-board]').innerHTML = COLS.map((c) => {
      const list = state.orders.filter(c.match).sort((a, b) => (a.due.date + a.due.time).localeCompare(b.due.date + b.due.time));
      return '<div class="col" data-col="' + c.id + '"><div class="col-head"><span>' + c.title + '</span><span class="count">' + list.length + '</span></div>' +
        (list.length ? list.map((o) => card(o, fresh.has(o.ref))).join('') : '<p class="col-empty">' + (c.id === 'new' ? 'No new orders. They\'ll appear here with a chime.' : 'Nothing here.') + '</p>') + '</div>';
    }).join('');
    const n = state.orders.filter((o) => o.status === 'received').length;
    const badge = $('[data-badge-orders]');
    badge.textContent = n;
    badge.hidden = !n;
    document.title = (n ? '(' + n + ') ' : '') + 'Kitchen · Chulo';
  }
  const stat = (label, val) => '<div class="adm-stat"><span>' + label + '</span><strong>' + val + '</strong></div>';

  async function loadOrders() {
    const orders = await Api.admin.orders();
    const fresh = new Set();
    if (state.seen) orders.forEach((o) => { if (!state.seen.has(o.ref) && o.status === 'received') fresh.add(o.ref); });
    state.seen = new Set(orders.map((o) => o.ref));
    state.orders = orders;
    if (fresh.size) chime();
    if (state.tab === 'orders') renderOrders(fresh);
    else {
      const n = orders.filter((o) => o.status === 'received').length;
      $('[data-badge-orders]').textContent = n;
      $('[data-badge-orders]').hidden = !n;
    }
  }

  $('[data-board]').addEventListener('click', async (e) => {
    const cardEl = e.target.closest('[data-ref]');
    if (!cardEl) return;
    const adv = e.target.closest('[data-advance]');
    const cancel = e.target.closest('[data-cancel-order]');
    if (!adv && !cancel) return;
    if (cancel && !confirm('Cancel order ' + cardEl.dataset.ref + '? The customer will see it as cancelled.')) return;
    const btn = adv || cancel;
    btn.disabled = true;
    try {
      await Api.admin.updateOrder(cardEl.dataset.ref, { status: adv ? adv.dataset.advance : 'cancelled' });
      await loadOrders();
    } catch (err) {
      btn.disabled = false;
      if (!handleError(err)) alert(err.message);
    }
  });

  /* ---------- bookings ---------- */

  const dateInput = $('[data-res-date]');
  dateInput.value = state.resDate;
  dateInput.addEventListener('change', () => { if (core.isDateKey(dateInput.value)) { state.resDate = dateInput.value; loadBookings(); } });
  $$('[data-day]').forEach((b) => b.addEventListener('click', () => {
    const d = Number(b.dataset.day);
    state.resDate = d === 0 ? core.dateKey(new Date()) : core.dateKey(core.addDays(core.parseKey(state.resDate), d));
    dateInput.value = state.resDate;
    loadBookings();
  }));

  const RES_ACTIONS = {
    confirmed: [['seated', 'Seat', true], ['no_show', 'No-show'], ['cancelled', 'Cancel']],
    seated: [['completed', 'Finished', true]],
    completed: [], cancelled: [['confirmed', 'Restore']], no_show: [['confirmed', 'Restore']]
  };

  async function loadBookings() {
    const list = await Api.admin.reservations(state.resDate);
    const live = list.filter((r) => r.status !== 'cancelled' && r.status !== 'no_show');
    $('[data-res-stats]').innerHTML =
      stat(esc(relDay(state.resDate)), live.length + ' booking' + (live.length === 1 ? '' : 's')) +
      stat('Covers', live.reduce((s, r) => s + r.party, 0)) +
      stat('Seated now', list.filter((r) => r.status === 'seated').length);

    if (!list.length) {
      $('[data-res-list]').innerHTML = '<div class="res-empty">' + (core.servicesOn(S, state.resDate).length ? 'No bookings yet for this day.' : 'We\'re closed on this day.') + '</div>';
      return;
    }
    const svcOf = (r) => { const s = core.bookingSlots(S, r.date).find((x) => x.time === r.time); return s ? s.service : 'Other'; };
    const groups = {};
    list.forEach((r) => { (groups[svcOf(r)] = groups[svcOf(r)] || []).push(r); });
    $('[data-res-list]').innerHTML = Object.keys(groups).map((svc) =>
      '<section class="res-service"><h2>' + esc(svc) + ' · ' + groups[svc].filter((r) => r.status !== 'cancelled' && r.status !== 'no_show').reduce((s, r) => s + r.party, 0) + ' covers</h2>' +
      '<table class="res-table"><thead><tr><th>Time</th><th>Guest</th><th>Party</th><th>Table</th><th>Notes</th><th>Status</th><th></th></tr></thead><tbody>' +
      groups[svc].map((r) => {
        const off = r.status === 'cancelled' || r.status === 'no_show' || r.status === 'completed';
        const table = S.booking.tables.find((t) => t.id === r.table);
        return '<tr class="' + (off ? 'is-off' : '') + '" data-res="' + r.ref + '">' +
          '<td><span class="res-time">' + fmtTime(r.time) + '</span></td>' +
          '<td><span class="res-name">' + esc(r.name) + '</span><span class="res-sub">' + r.ref + ' · <a href="tel:' + esc(r.phone.replace(/\s/g, '')) + '">' + esc(r.phone) + '</a> · ' + r.source + '</span></td>' +
          '<td>' + r.party + '</td>' +
          '<td>' + esc(r.table) + (table ? '<span class="res-sub">' + table.area + ', ' + table.seats + ' seats</span>' : '') + '</td>' +
          '<td>' + (r.occasion ? '<span class="pill later">' + esc(r.occasion) + '</span> ' : '') + esc(r.notes || '') + (r.seating && r.seating !== 'No preference' ? '<span class="res-sub">Prefers ' + esc(r.seating.toLowerCase()) + '</span>' : '') + '</td>' +
          '<td><span class="pill ' + r.status + '">' + r.status.replace('_', '-') + '</span></td>' +
          '<td><div class="res-actions">' + (RES_ACTIONS[r.status] || []).map((a) => '<button type="button" data-set="' + a[0] + '"' + (a[2] ? ' class="primary"' : '') + '>' + a[1] + '</button>').join('') + '</div></td>' +
          '</tr>';
      }).join('') + '</tbody></table></section>').join('');
  }

  $('[data-res-list]').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-set]');
    if (!b) return;
    const ref = b.closest('[data-res]').dataset.res;
    b.disabled = true;
    try {
      await Api.admin.updateReservation(ref, { status: b.dataset.set });
      await loadBookings();
    } catch (err) {
      b.disabled = false;
      if (!handleError(err)) alert(err.message);
    }
  });

  /* ---------- menu ---------- */

  async function loadMenu() {
    const menu = await Api.menu();
    $('[data-menu-list]').innerHTML = '<div class="menu-admin">' + menu.categories.map((c) =>
      '<section><h2>' + esc(c.name) + '</h2>' + menu.items.filter((i) => i.cat === c.id).map((i) =>
        '<div class="menu-row' + (i.available === false ? ' is-off' : '') + '"><span><span class="menu-row-name">' + esc(i.name) + '</span><span class="menu-row-price">' + moneyExact(i.price) + '</span></span>' +
        '<label class="switch"><input type="checkbox" data-item="' + i.id + '"' + (i.available === false ? '' : ' checked') + ' aria-label="' + esc(i.name) + ' available"><span></span></label></div>').join('') +
      '</section>').join('') + '</div>';
  }
  $('[data-menu-list]').addEventListener('change', async (e) => {
    const box = e.target.closest('[data-item]');
    if (!box) return;
    box.disabled = true;
    try {
      await Api.admin.updateItem(box.dataset.item, { available: box.checked });
      box.closest('.menu-row').classList.toggle('is-off', !box.checked);
    } catch (err) {
      box.checked = !box.checked;
      if (!handleError(err)) alert(err.message);
    }
    box.disabled = false;
  });

  /* ---------- loop ---------- */

  async function refresh() {
    try {
      if (state.tab === 'orders') await loadOrders();
      if (state.tab === 'bookings') { await loadBookings(); loadOrders(); }
      if (state.tab === 'menu') { await loadMenu(); loadOrders(); }
    } catch (err) { handleError(err); }
  }

  (async function boot() {
    const mode = await Api.mode();
    const m = $('[data-mode]');
    m.textContent = mode === 'remote' ? 'Live server' : 'Browser demo';
    m.className = 'adm-mode ' + (mode === 'remote' ? 'live' : 'local');
    m.title = mode === 'remote' ? 'Connected to the API in server.js' : 'No API found: orders and bookings are stored in this browser only';
    const initial = location.hash.slice(1);
    setTab(['orders', 'bookings', 'menu'].includes(initial) ? initial : 'orders');
    setInterval(() => { if (!document.hidden && state.tab !== 'menu') refresh(); }, 4000);
  })();
})();
