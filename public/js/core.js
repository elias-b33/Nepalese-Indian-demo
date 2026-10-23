/*
 * Chulo core — business rules shared by the browser and the Node server.
 *
 * Everything here is pure: functions take the db/settings/menu they need and
 * return plain objects. server.js uses this to validate requests; api.js uses
 * the exact same code for the offline "local demo" mode, so both behave alike.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChuloCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- time helpers (local time, minutes since midnight) ---------- */

  const pad = (n) => String(n).padStart(2, '0');
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const fromMin = (m) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  const dateKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
  const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();
  const isDateKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && dateKey(parseKey(k)) === k;
  const isTime = (t) => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t);
  const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);

  function servicesOn(settings, key) {
    if ((settings.closedDates || []).includes(key)) return [];
    return settings.hours[parseKey(key).getDay()] || [];
  }

  /** Is the kitchen open right now, and if not, when does it next open? */
  function openState(settings, now) {
    const key = dateKey(now);
    const m = minutesOf(now);
    const today = servicesOn(settings, key);
    const current = today.find((s) => m >= toMin(s.open) && m < toMin(s.close));
    if (current) return { open: true, service: current.name, until: current.close, closingSoon: toMin(current.close) - m <= 30 };
    for (let i = 0; i <= 14; i++) {
      const k = i === 0 ? key : dateKey(addDays(now, i));
      const next = servicesOn(settings, k).find((s) => i > 0 || toMin(s.open) > m);
      if (next) return { open: false, next: { date: k, time: next.open, inDays: i } };
    }
    return { open: false, next: null };
  }

  /* ---------- small utilities ---------- */

  const REF_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function makeRef(prefix, taken) {
    for (;;) {
      let s = '';
      for (let i = 0; i < 4; i++) s += REF_CHARS[Math.floor(Math.random() * REF_CHARS.length)];
      const ref = prefix + '-' + s;
      if (!taken || !taken(ref)) return ref;
    }
  }
  function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      try { return crypto.randomUUID(); } catch (e) { /* insecure context */ }
    }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 200);
  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const isPhone = (v) => String(v).replace(/[^\d]/g, '').length >= 7;

  function fail(code, message, field, status) {
    return { ok: false, status: status || 400, error: { code, message, field: field || null } };
  }

  /* ---------- menu ---------- */

  /** Seed menu with admin overrides (availability, price) applied. */
  function applyOverrides(menu, overrides) {
    const o = overrides || {};
    return {
      settings: menu.settings,
      categories: menu.categories,
      items: menu.items.map((it) => Object.assign({}, it, { available: true }, o[it.id] || {}))
    };
  }

  function defaultOptions(item) {
    const out = {};
    for (const g of item.options || []) out[g.id] = g.defaultChoice || g.choices[0].id;
    return out;
  }

  function priceLine(menu, line) {
    const item = menu.items.find((i) => i.id === (line && line.itemId));
    if (!item) return fail('unknown_item', 'One of the dishes in your order is no longer on the menu.');
    if (item.available === false) return fail('sold_out', item.name + ' has just sold out. Please remove it to continue.');
    const qty = Math.floor(Number(line.qty));
    if (!(qty >= 1 && qty <= 30)) return fail('bad_quantity', 'Please choose a quantity between 1 and 30.');
    let unit = item.price;
    const options = [];
    for (const g of item.options || []) {
      const chosen = (line.options || {})[g.id] || g.defaultChoice || g.choices[0].id;
      const c = g.choices.find((x) => x.id === chosen);
      if (!c) return fail('bad_option', 'Please choose a valid ' + g.name.toLowerCase() + ' for ' + item.name + '.');
      unit += c.price || 0;
      options.push({ groupId: g.id, group: g.name, choiceId: c.id, choice: c.label, price: c.price || 0 });
    }
    return {
      ok: true,
      line: { itemId: item.id, name: item.name, qty, unit, total: unit * qty, options, note: clean(line.note, 140) }
    };
  }

  function computeTotals(menu, lines, type) {
    const o = menu.settings.ordering;
    const priced = [];
    for (const l of lines || []) {
      const r = priceLine(menu, l);
      if (!r.ok) return r;
      priced.push(r.line);
    }
    const subtotal = priced.reduce((s, l) => s + l.total, 0);
    const delivery = type === 'delivery';
    const deliveryFee = delivery && subtotal < o.freeDeliveryOver ? o.deliveryFee : 0;
    return {
      ok: true,
      lines: priced,
      count: priced.reduce((s, l) => s + l.qty, 0),
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      minimum: delivery ? o.minimumDelivery : 0,
      minimumMet: !delivery || subtotal >= o.minimumDelivery,
      freeDeliveryGap: delivery && subtotal < o.freeDeliveryOver ? o.freeDeliveryOver - subtotal : 0
    };
  }

  /* ---------- ordering times ---------- */

  const prepFor = (settings, type) => type === 'delivery' ? settings.ordering.deliveryMinutes : settings.ordering.collectionMinutes;

  function orderSlots(settings, key, type, now) {
    const step = settings.ordering.slotInterval;
    const prep = prepFor(settings, type);
    const earliest = key === dateKey(now) ? minutesOf(now) + prep : -1;
    const out = [];
    for (const s of servicesOn(settings, key)) {
      const start = Math.ceil((toMin(s.open) + prep) / step) * step;
      for (let m = start; m <= toMin(s.close); m += step) if (m >= earliest) out.push(fromMin(m));
    }
    return out;
  }

  function canOrderAsap(settings, type, now) {
    const st = openState(settings, now);
    return st.open && minutesOf(now) + prepFor(settings, type) <= toMin(st.until);
  }

  /** Days (today onwards) that still have at least one order time. */
  function orderDays(settings, type, now) {
    const out = [];
    for (let i = 0; i < 14 && out.length < settings.ordering.daysAhead; i++) {
      const key = dateKey(addDays(now, i));
      if (orderSlots(settings, key, type, now).length) out.push(key);
    }
    return out;
  }

  /* ---------- reservations ---------- */

  const ACTIVE_RES = ['confirmed', 'seated'];
  const RES_STATUSES = ['confirmed', 'seated', 'completed', 'cancelled', 'no_show'];

  function durationFor(settings, party) {
    const d = settings.booking.durations;
    return (d.find((x) => party <= x.upTo) || d[d.length - 1]).minutes;
  }

  function bookingSlots(settings, key) {
    const step = settings.booking.interval;
    const out = [];
    for (const s of servicesOn(settings, key)) {
      const last = toMin(s.lastSeating || fromMin(toMin(s.close) - 60));
      for (let m = toMin(s.open); m <= last; m += step) out.push({ time: fromMin(m), service: s.name });
    }
    return out;
  }

  /** Smallest free table that seats the party for the whole sitting, or null. */
  function findTable(settings, reservations, key, time, party, ignoreRef) {
    const start = toMin(time);
    const dur = durationFor(settings, party);
    const busy = new Set();
    for (const r of reservations) {
      if (r.date !== key || !ACTIVE_RES.includes(r.status) || r.ref === ignoreRef || !r.table) continue;
      const rs = toMin(r.time);
      if (start < rs + r.duration && rs < start + dur) busy.add(r.table);
    }
    const free = settings.booking.tables
      .filter((t) => t.seats >= party && !busy.has(t.id))
      .sort((a, b) => a.seats - b.seats);
    return free[0] || null;
  }

  function bookingWindow(settings, now) {
    const first = dateKey(now);
    const last = dateKey(addDays(now, settings.booking.maxDaysAhead));
    return { first, last };
  }

  function availability(settings, reservations, key, party, now) {
    const win = bookingWindow(settings, now);
    const outside = key < win.first || key > win.last;
    const cutoff = key === win.first ? minutesOf(now) + settings.booking.leadMinutes : -1;
    return bookingSlots(settings, key).map((slot) => {
      let reason = null;
      if (outside || toMin(slot.time) < cutoff) reason = 'past';
      else if (!findTable(settings, reservations, key, slot.time, party)) reason = 'full';
      return { time: slot.time, service: slot.service, available: !reason, reason };
    });
  }

  function createReservation(db, settings, input, now) {
    const b = settings.booking;
    const party = Math.floor(Number(input.party));
    const date = input.date;
    const time = input.time;
    if (!(party >= 1 && party <= b.maxParty)) return fail('bad_party', 'Online booking is for 1 to ' + b.maxParty + ' guests. For larger groups please call us.', 'party');
    if (!isDateKey(date)) return fail('bad_date', 'Please choose a date.', 'date');
    if (!isTime(time)) return fail('bad_time', 'Please choose a time.', 'time');
    const slot = availability(settings, db.reservations, date, party, now).find((s) => s.time === time);
    if (!slot) return fail('bad_time', 'We are not seating at that time. Please pick another.', 'time');
    if (!slot.available) {
      return slot.reason === 'full'
        ? fail('slot_taken', 'Sorry, that time has just been booked. Please choose another.', 'time', 409)
        : fail('slot_past', 'That time can no longer be booked online.', 'time');
    }
    const name = clean(input.name, 80);
    const email = clean(input.email, 120).toLowerCase();
    const phone = clean(input.phone, 30);
    if (name.length < 2) return fail('bad_name', 'Please tell us your name.', 'name');
    if (!isEmail(email)) return fail('bad_email', 'Please enter a valid email address.', 'email');
    if (!isPhone(phone)) return fail('bad_phone', 'Please enter a phone number we can reach you on.', 'phone');
    const occasion = b.occasions.includes(input.occasion) ? input.occasion : null;
    const seating = b.seating.includes(input.seating) ? input.seating : 'No preference';

    const table = findTable(settings, db.reservations, date, time, party);
    const reservation = {
      id: uid(),
      ref: makeRef('TB', (r) => db.reservations.some((x) => x.ref === r)),
      status: 'confirmed',
      date, time, party,
      duration: durationFor(settings, party),
      table: table.id,
      name, email, phone, occasion, seating,
      notes: clean(input.notes, 500),
      source: input.source === 'phone' ? 'phone' : 'web',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    db.reservations.push(reservation);
    return { ok: true, status: 201, data: reservation };
  }

  function findReservation(db, ref, email) {
    const r = db.reservations.find((x) => x.ref === String(ref || '').toUpperCase().trim());
    if (!r || (email !== undefined && r.email !== String(email || '').toLowerCase().trim())) {
      return fail('not_found', 'We could not find a booking with those details.', null, 404);
    }
    return { ok: true, data: r };
  }

  function updateReservation(db, settings, ref, patch, now) {
    const found = findReservation(db, ref);
    if (!found.ok) return found;
    const r = found.data;
    if (patch.status !== undefined) {
      if (!RES_STATUSES.includes(patch.status)) return fail('bad_status', 'Unknown status.', 'status');
      r.status = patch.status;
    }
    if (patch.table !== undefined) {
      if (!settings.booking.tables.some((t) => t.id === patch.table)) return fail('bad_table', 'Unknown table.', 'table');
      r.table = patch.table;
    }
    if (patch.notes !== undefined) r.notes = clean(patch.notes, 500);
    r.updatedAt = now.toISOString();
    return { ok: true, data: r };
  }

  /* ---------- orders ---------- */

  const ORDER_FLOW = {
    collection: ['received', 'preparing', 'ready', 'completed'],
    delivery: ['received', 'preparing', 'out_for_delivery', 'completed']
  };

  function createOrder(db, menu, input, now) {
    const settings = menu.settings;
    const type = input.type === 'delivery' ? 'delivery' : 'collection';
    if (!Array.isArray(input.items) || !input.items.length) return fail('empty', 'Your order is empty.');
    const totals = computeTotals(menu, input.items, type);
    if (!totals.ok) return totals;
    if (!totals.minimumMet) return fail('minimum', 'Delivery orders need a minimum of ' + (settings.ordering.minimumDelivery / 100).toFixed(2) + ' before delivery.');

    // When: ASAP or a scheduled slot.
    const when = input.when || {};
    let due;
    if (when.asap) {
      if (!canOrderAsap(settings, type, now)) return fail('closed', 'We are not taking ASAP orders right now. Please schedule a time.', 'when');
      const ready = new Date(now.getTime() + prepFor(settings, type) * 60000);
      due = { date: dateKey(ready), time: fromMin(minutesOf(ready)), asap: true };
    } else {
      if (!isDateKey(when.date) || !orderSlots(settings, when.date, type, now).includes(when.time)) {
        return fail('bad_time', 'That time is no longer available. Please choose another.', 'when');
      }
      due = { date: when.date, time: when.time, asap: false };
    }

    const c = input.customer || {};
    const customer = { name: clean(c.name, 80), phone: clean(c.phone, 30), email: clean(c.email, 120).toLowerCase() };
    if (customer.name.length < 2) return fail('bad_name', 'Please tell us your name.', 'name');
    if (!isPhone(customer.phone)) return fail('bad_phone', 'Please enter a phone number so we can reach you.', 'phone');
    if (!isEmail(customer.email)) return fail('bad_email', 'Please enter a valid email address.', 'email');

    let address = null;
    if (type === 'delivery') {
      const a = input.address || {};
      address = { line1: clean(a.line1, 120), line2: clean(a.line2, 120), postcode: clean(a.postcode, 12).toUpperCase(), instructions: clean(a.instructions, 240) };
      if (address.line1.length < 3) return fail('bad_address', 'Please enter your street address.', 'line1');
      if (!/^[A-Z0-9 ]{4,10}$/.test(address.postcode)) return fail('bad_postcode', 'Please enter a valid postcode.', 'postcode');
    }
    const method = settings.ordering.payment.some((p) => p.id === input.payment) ? input.payment : settings.ordering.payment[0].id;

    const order = {
      id: uid(),
      ref: makeRef('CH', (r) => db.orders.some((x) => x.ref === r)),
      status: 'received',
      type,
      due,
      items: totals.lines,
      subtotal: totals.subtotal,
      deliveryFee: totals.deliveryFee,
      total: totals.total,
      currency: settings.currency,
      customer,
      address,
      payment: { method, status: 'unpaid' },
      cutlery: !!input.cutlery,
      notes: clean(input.notes, 300),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      history: [{ status: 'received', at: now.toISOString() }]
    };
    db.orders.push(order);
    return { ok: true, status: 201, data: order };
  }

  /** What the customer-facing tracking page is allowed to see. */
  function publicOrder(o) {
    return {
      ref: o.ref, status: o.status, type: o.type, due: o.due, items: o.items,
      subtotal: o.subtotal, deliveryFee: o.deliveryFee, total: o.total, currency: o.currency,
      firstName: o.customer.name.split(' ')[0], payment: { method: o.payment.method },
      createdAt: o.createdAt, history: o.history
    };
  }

  function updateOrder(db, ref, patch, now) {
    const o = db.orders.find((x) => x.ref === String(ref || '').toUpperCase().trim());
    if (!o) return fail('not_found', 'Order not found.', null, 404);
    if (patch.status !== undefined && patch.status !== o.status) {
      const allowed = ORDER_FLOW[o.type].concat('cancelled');
      if (!allowed.includes(patch.status)) return fail('bad_status', 'Unknown status for a ' + o.type + ' order.', 'status');
      if (o.status === 'completed' || o.status === 'cancelled') return fail('closed', 'This order is already closed.', 'status', 409);
      o.status = patch.status;
      o.history.push({ status: patch.status, at: now.toISOString() });
    }
    if (patch.paymentStatus === 'paid' || patch.paymentStatus === 'unpaid') o.payment.status = patch.paymentStatus;
    o.updatedAt = now.toISOString();
    return { ok: true, data: o };
  }

  /* ---------- demo seed ---------- */

  /** A few phone bookings so the admin view isn't empty on first run. */
  function sampleReservations(settings, now) {
    const db = { reservations: [] };
    const guests = [
      ['Anjali Rai', 2, 'Anniversary'], ['Tom Whitfield', 4, null], ['Pemba Sherpa', 6, 'Birthday'],
      ['Grace Okafor', 2, 'Date night'], ['The Gurung family', 5, null], ['Dev Malhotra', 3, 'Business'],
      ['Sita Thapa', 2, null], ['Leo Marsh', 4, 'Birthday']
    ];
    let g = 0;
    for (let d = 0; d < 3 && g < guests.length; d++) {
      const key = dateKey(addDays(now, d));
      const slots = availability(settings, db.reservations, key, 2, now).filter((s) => s.available && s.service !== 'Lunch');
      for (let i = 0; i < slots.length && g < guests.length; i += 3) {
        const [name, party, occasion] = guests[g++];
        const first = name.split(' ')[0].toLowerCase();
        createReservation(db, settings, {
          party, date: key, time: slots[i].time, name, email: first + '@example.com', phone: '07700 900' + String(100 + g * 7).slice(-3),
          occasion, source: 'phone'
        }, new Date(now.getTime() - 86400000));
      }
    }
    return db.reservations;
  }

  return {
    pad, toMin, fromMin, dateKey, parseKey, addDays, minutesOf, isDateKey, daysBetween,
    servicesOn, openState, applyOverrides, defaultOptions, priceLine, computeTotals,
    orderSlots, orderDays, canOrderAsap, prepFor,
    durationFor, bookingSlots, findTable, bookingWindow, availability,
    createReservation, findReservation, updateReservation,
    createOrder, publicOrder, updateOrder, ORDER_FLOW, RES_STATUSES,
    sampleReservations
  };
});
