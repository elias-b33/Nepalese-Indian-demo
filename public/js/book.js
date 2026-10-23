/* Booking page: party → date → time → details → confirmation, plus manage/cancel. */
(function () {
  'use strict';
  const { S, esc, icon, fmtTime, fmtDate, relDay, setBusy } = window.Chulo;
  const core = window.ChuloCore;
  const Api = window.ChuloApi;
  const B = S.booking;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  const params = new URLSearchParams(location.search);
  const state = {
    party: Math.min(B.maxParty, Math.max(1, Number(params.get('party')) || 2)),
    date: null,
    time: null,
    occasion: null,
    seating: B.seating[0],
    slots: []
  };

  /* ---------------- steps ---------------- */

  function show(step) {
    $$('[data-step]').forEach((el) => { el.hidden = el.dataset.step !== String(step); });
    $('[data-manage]').hidden = step !== 'manage';
    $('[data-steps]').hidden = step === 'manage';
    $$('[data-steps] li').forEach((li) => {
      const s = Number(li.dataset.s);
      li.classList.toggle('is-current', s === step);
      li.classList.toggle('is-done', typeof step === 'number' && s < step);
    });
    const manage = step === 'manage';
    $('[data-head-eyebrow]').textContent = manage ? 'Your booking' : 'Reservations';
    $('[data-head-title]').textContent = manage ? 'Change or cancel' : step === 3 ? 'See you soon' : 'Book a table';
    $('[data-head-lede]').textContent = manage
      ? 'Enter the reference from your confirmation and the email you booked with.'
      : step === 3 ? 'Your table is booked. A confirmation is on its way to your inbox.'
        : 'Tables for one to eight. For nine or more, or the whole back room, give us a call and we\'ll sort it out together.';
    if (step !== 1) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- party ---------------- */

  function renderParty() {
    const chips = [];
    for (let n = 1; n <= B.maxParty; n++) chips.push('<button type="button" class="chip" data-n="' + n + '" aria-pressed="' + (state.party === n) + '">' + n + '</button>');
    chips.push('<button type="button" class="chip" data-n="large" aria-pressed="' + (state.party === 'large') + '">9+</button>');
    $('[data-party]').innerHTML = chips.join('');
  }
  $('[data-party]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-n]');
    if (!b) return;
    state.party = b.dataset.n === 'large' ? 'large' : Number(b.dataset.n);
    renderParty();
    const large = state.party === 'large';
    $('[data-large]').hidden = !large;
    $('[data-date-block]').hidden = large;
    $('[data-time-block]').hidden = large;
    if (!large) loadSlots();
    else { state.time = null; paintSummary(); }
  });

  /* ---------------- dates ---------------- */

  const strip = $('[data-dates]');
  function renderDates() {
    const now = new Date();
    const out = [];
    for (let i = 0; i <= B.maxDaysAhead; i++) {
      const d = core.addDays(now, i);
      const key = core.dateKey(d);
      const open = core.servicesOn(S, key).length > 0;
      const dow = i === 0 ? 'Today' : d.toLocaleDateString(S.locale, { weekday: 'short' });
      out.push('<button type="button" class="date-btn" data-date="' + key + '" aria-pressed="' + (state.date === key) + '"' + (open ? '' : ' disabled') +
        ' aria-label="' + esc(fmtDate(key, { weekday: 'long', day: 'numeric', month: 'long' })) + (open ? '' : ', closed') + '">' +
        '<span class="dow">' + dow + '</span><span class="dom">' + d.getDate() + '</span><span class="mon">' + (open ? d.toLocaleDateString(S.locale, { month: 'short' }) : 'Closed') + '</span></button>');
    }
    strip.innerHTML = out.join('');
    paintMonth();
  }
  function paintMonth() {
    const first = $$('.date-btn', strip).find((b) => b.offsetLeft + b.offsetWidth > strip.scrollLeft + 4);
    const key = state.date && !first ? state.date : (first ? first.dataset.date : state.date);
    if (key) $('[data-month]').textContent = core.parseKey(key).toLocaleDateString(S.locale, { month: 'long', year: 'numeric' });
  }
  strip.addEventListener('scroll', () => requestAnimationFrame(paintMonth), { passive: true });
  strip.addEventListener('click', (e) => {
    const b = e.target.closest('[data-date]');
    if (!b || b.disabled) return;
    selectDate(b.dataset.date);
  });
  $$('[data-scroll]').forEach((b) => b.addEventListener('click', () => {
    strip.scrollBy({ left: Number(b.dataset.scroll) * strip.clientWidth * 0.8, behavior: 'smooth' });
  }));
  function selectDate(key, scroll) {
    state.date = key;
    $$('.date-btn', strip).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.date === key)));
    if (scroll) {
      const btn = $('[data-date="' + key + '"]', strip);
      if (btn) strip.scrollLeft = Math.max(0, btn.offsetLeft - strip.offsetLeft - 8);
    }
    loadSlots();
  }

  /* ---------------- slots ---------------- */

  let req = 0;
  async function loadSlots(keepTime) {
    if (state.party === 'large' || !state.date) return;
    const my = ++req;
    if (!keepTime) state.time = null;
    paintSummary();
    $('[data-slots]').innerHTML = '<div class="time-grid" style="margin-top:0">' + '<div class="slot-skeleton"></div>'.repeat(10) + '</div>';
    $('[data-slot-note]').textContent = '';
    try {
      const res = await Api.availability(state.date, state.party);
      if (my !== req) return;
      state.slots = res.slots;
      if (state.time && !res.slots.some((s) => s.time === state.time && s.available)) state.time = null;
      renderSlots();
    } catch (e) {
      if (my !== req) return;
      $('[data-slots]').innerHTML = '<div class="form-alert">We couldn\'t load times just now. <button class="link" type="button" data-retry>Try again</button></div>';
    }
  }

  function renderSlots() {
    const slots = state.slots;
    const free = slots.filter((s) => s.available);
    $('[data-slot-note]').textContent = free.length ? free.length + ' times available' : '';
    if (!free.length) {
      const past = slots.length && slots.every((s) => s.reason === 'past');
      $('[data-slots]').innerHTML = '<div class="slot-empty">' +
        (past ? 'We\'re no longer taking online bookings for today. Walk-ins are welcome at the counter.' : 'We\'re fully booked for ' + state.party + ' on ' + esc(relDay(state.date)) + '.') +
        ' <span data-next-free>Looking for the next free day…</span></div>';
      findNextFree();
      paintSummary();
      return;
    }
    // Times that have already gone are noise; fully booked ones stay visible (struck through).
    const groups = {};
    slots.filter((s) => s.reason !== 'past').forEach((s) => { (groups[s.service] = groups[s.service] || []).push(s); });
    $('[data-slots]').innerHTML = Object.keys(groups).map((svc) =>
      '<div class="slot-group"><h3>' + esc(svc) + '</h3><div class="time-grid" style="margin-top:0">' +
      groups[svc].map((s) => '<button type="button" class="time-btn" data-time="' + s.time + '" aria-pressed="' + (state.time === s.time) + '"' +
        (s.available ? '' : ' disabled aria-label="' + fmtTime(s.time) + ', ' + (s.reason === 'full' ? 'fully booked' : 'unavailable') + '"') + '>' + fmtTime(s.time) + '</button>').join('') +
      '</div></div>').join('');
    paintSummary();
  }

  async function findNextFree() {
    const my = req;
    const now = new Date();
    for (let i = 1; i <= 21; i++) {
      const key = core.dateKey(core.addDays(core.parseKey(state.date), i));
      if (key > core.bookingWindow(S, now).last) break;
      if (!core.servicesOn(S, key).length) continue;
      try {
        const res = await Api.availability(key, state.party);
        if (my !== req) return;
        if (res.slots.some((s) => s.available)) {
          const el = $('[data-next-free]');
          if (el) el.innerHTML = 'The next day with space is <button type="button" class="link" data-jump="' + key + '">' + esc(relDay(key)) + '</button>.';
          return;
        }
      } catch (e) { return; }
    }
    const el = $('[data-next-free]');
    if (el) el.innerHTML = 'Please call us on ' + esc(S.phone) + ' and we\'ll see what we can do.';
  }

  $('[data-slots]').addEventListener('click', (e) => {
    const t = e.target.closest('[data-time]');
    const jump = e.target.closest('[data-jump]');
    if (e.target.closest('[data-retry]')) return loadSlots();
    if (jump) return selectDate(jump.dataset.jump, true);
    if (!t || t.disabled) return;
    state.time = t.dataset.time;
    $$('[data-time]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.time === state.time)));
    paintSummary();
  });

  function summaryText() {
    if (state.party === 'large' || !state.date) return '';
    return '<strong>' + state.party + ' ' + (state.party === 1 ? 'guest' : 'guests') + '</strong> · <strong>' + esc(relDay(state.date)) + '</strong>' +
      (state.time ? ' at <strong>' + fmtTime(state.time) + '</strong>' : '');
  }
  function paintSummary() {
    const ready = state.party !== 'large' && state.date && state.time;
    $('[data-summary1]').innerHTML = ready ? summaryText() : state.party === 'large' ? 'Large groups book by phone or email.' : 'Choose a time to continue.';
    $('[data-next]').disabled = !ready;
  }

  /* ---------------- step 1 → 2 ---------------- */

  $('[data-step="1"]').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.time) return;
    $('[data-summary2]').innerHTML = summaryText();
    $('[data-alert2]').hidden = true;
    show(2);
    setTimeout(() => { const f = $('#b-name'); if (!f.value) f.focus({ preventScroll: true }); }, 350);
  });
  $('[data-back]').addEventListener('click', () => show(1));

  function renderExtras() {
    $('[data-occasions]').innerHTML = B.occasions.map((o) => '<button type="button" class="chip" data-occasion="' + esc(o) + '" aria-pressed="false">' + esc(o) + '</button>').join('');
    $('[data-seating]').innerHTML = B.seating.map((o) => '<button type="button" class="chip" data-seat="' + esc(o) + '" aria-pressed="' + (o === state.seating) + '">' + esc(o) + '</button>').join('');
  }
  $('[data-occasions]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-occasion]');
    if (!b) return;
    state.occasion = state.occasion === b.dataset.occasion ? null : b.dataset.occasion;
    $$('[data-occasion]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.occasion === state.occasion)));
  });
  $('[data-seating]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-seat]');
    if (!b) return;
    state.seating = b.dataset.seat;
    $$('[data-seat]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.seat === state.seating)));
  });

  /* ---------------- step 2 → 3 ---------------- */

  const form2 = $('[data-step="2"]');
  function setError(name, msg) {
    const input = form2[name];
    const field = input.closest('.field');
    field.classList.toggle('has-error', !!msg);
    field.querySelector('.field-error').textContent = msg || '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  form2.addEventListener('input', (e) => { if (e.target.closest('.has-error')) setError(e.target.name, ''); });

  try {
    const saved = JSON.parse(localStorage.getItem('chulo.customer') || '{}');
    ['name', 'email', 'phone'].forEach((k) => { if (saved[k]) form2[k].value = saved[k]; });
  } catch (e) { /* ignore */ }

  form2.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (n) => form2[n].value.trim();
    const errs = {};
    if (v('name').length < 2) errs.name = 'Please tell us whose name the table is under.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email'))) errs.email = 'Please enter a valid email address.';
    if (v('phone').replace(/\D/g, '').length < 7) errs.phone = 'Please enter a number we can reach you on.';
    ['name', 'email', 'phone'].forEach((n) => setError(n, errs[n]));
    const first = Object.keys(errs)[0];
    if (first) { form2[first].focus(); return; }

    const btn = $('[data-confirm]');
    setBusy(btn, true, 'Booking your table…');
    try {
      const r = await Api.createReservation({
        party: state.party, date: state.date, time: state.time,
        name: v('name'), email: v('email'), phone: v('phone'),
        occasion: state.occasion, seating: state.seating, notes: v('notes')
      });
      try {
        const saved = JSON.parse(localStorage.getItem('chulo.customer') || '{}');
        localStorage.setItem('chulo.customer', JSON.stringify(Object.assign(saved, { name: v('name'), email: v('email'), phone: v('phone') })));
      } catch (err) { /* ignore */ }
      setBusy(btn, false);
      const step3 = $('[data-step="3"]');
      step3.innerHTML = ticketHtml(r, true);
      bindTicket(step3, r);
      show(3);
    } catch (err) {
      setBusy(btn, false);
      if (err.field && form2[err.field]) { setError(err.field, err.message); form2[err.field].focus(); return; }
      if (err.code === 'slot_taken' || err.field === 'time') {
        show(1);
        const a = $('[data-alert1]');
        a.textContent = err.message;
        a.hidden = false;
        loadSlots();
        return;
      }
      const a = $('[data-alert2]');
      a.textContent = err.message;
      a.hidden = false;
    }
  });

  /* ---------------- ticket ---------------- */

  function ticketHtml(r, fresh) {
    const cancelled = r.status === 'cancelled';
    const past = r.date < core.dateKey(new Date());
    return '<article class="ticket' + (cancelled ? ' is-cancelled' : '') + '" data-ticket="' + esc(r.ref) + '">' +
      '<div class="ticket-top">' +
      '<div class="ticket-ref">Reference<strong>' + esc(r.ref) + '</strong></div>' +
      '<p class="eyebrow">' + (cancelled ? 'Cancelled' : fresh ? 'Booking confirmed' : 'Booking ' + (r.status === 'confirmed' ? 'confirmed' : r.status.replace('_', ' '))) + '</p>' +
      '<h2 class="h2">' + (cancelled ? 'This booking is cancelled.' : 'Table for ' + r.party + ', ' + esc(r.name.split(' ')[0]) + '.') + '</h2>' +
      '</div><div class="ticket-perf"></div>' +
      '<div class="ticket-grid">' +
      '<div><span>Date</span><strong>' + esc(fmtDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })) + '</strong></div>' +
      '<div><span>Time</span><strong class="tabular">' + fmtTime(r.time) + '</strong></div>' +
      '<div><span>Guests</span><strong>' + r.party + '</strong></div>' +
      '</div>' +
      (cancelled || past ? '' :
        '<p class="ticket-note">' + (r.occasion ? 'We\'ve noted it\'s a ' + esc(r.occasion.toLowerCase()) + '. ' : '') + 'We\'ll hold the table for ' + B.holdMinutes + ' minutes. Running late? Call ' + esc(S.phone) + '.</p>' +
        '<div class="ticket-actions">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-ics>' + icon('calendar') + 'Add to calendar</button>' +
        (fresh ? '<a class="btn btn-ghost btn-sm" href="order.html">See the menu</a>' : '') +
        '<button class="btn btn-ghost btn-sm" type="button" data-cancel>Cancel booking</button>' +
        '</div>') +
      '</article>' +
      (fresh ? '<p style="margin-top:22px;font-size:.92rem">Need to change something later? Use your reference <strong>' + esc(r.ref) + '</strong> on the <a class="link" href="book.html?ref=' + encodeURIComponent(r.ref) + '#manage">manage booking</a> page.</p>' : '');
  }

  let current = null; // reservation shown in a ticket
  function bindTicket(container, r) {
    current = r;
    container.onclick = async (e) => {
      if (e.target.closest('[data-ics]')) return downloadIcs(current);
      const c = e.target.closest('[data-cancel]');
      if (!c) return;
      if (!c.dataset.armed) {
        c.dataset.armed = '1';
        c.textContent = 'Yes, cancel it';
        c.classList.remove('btn-ghost');
        c.classList.add('btn-primary');
        return;
      }
      setBusy(c, true, 'Cancelling…');
      try {
        current = await Api.cancelReservation(current.ref, current.email);
        container.innerHTML = ticketHtml(current, false) + '<p style="margin-top:22px"><a class="link" href="book.html">Make a new booking</a></p>';
      } catch (err) {
        setBusy(c, false);
        window.Chulo.toast(err.message);
      }
    };
  }
  function downloadIcs(r) {
    const start = r.date.replace(/-/g, '') + 'T' + r.time.replace(':', '') + '00';
    const endMin = core.toMin(r.time) + r.duration;
    const end = r.date.replace(/-/g, '') + 'T' + core.fromMin(Math.min(endMin, 23 * 60 + 59)).replace(':', '') + '00';
    const a = S.address;
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Chulo//Bookings//EN', 'BEGIN:VEVENT',
      'UID:' + r.ref + '@chulo.example', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
      'DTSTART:' + start, 'DTEND:' + end,
      'SUMMARY:Dinner at Chulo (' + r.party + ')',
      'LOCATION:' + [a.line1, a.line2, a.city, a.postcode].join('\\, '),
      'DESCRIPTION:Booking ' + r.ref + '. Call ' + S.phone + ' if you are running late.',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'chulo-' + r.ref + '.ics';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------------- manage ---------------- */

  const mForm = $('[data-manage-form]');
  mForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const alert = $('[data-alert-m]');
    alert.hidden = true;
    const ref = mForm.ref.value.trim().toUpperCase();
    const email = mForm.email.value.trim();
    if (!ref || !email) { alert.textContent = 'Please enter both your reference and email.'; alert.hidden = false; return; }
    const btn = mForm.querySelector('button[type="submit"]');
    setBusy(btn, true, 'Looking…');
    try {
      const r = await Api.getReservation(ref, email);
      const out = $('[data-manage-result]');
      out.innerHTML = ticketHtml(r, false);
      bindTicket(out, r);
    } catch (err) {
      alert.textContent = err.message;
      alert.hidden = false;
    }
    setBusy(btn, false);
  });
  $('[data-to-manage]').addEventListener('click', (e) => { e.preventDefault(); history.pushState(null, '', '#manage'); route(); });
  $('[data-new]').addEventListener('click', (e) => { e.preventDefault(); history.pushState(null, '', 'book.html'); route(); });

  function route() {
    if (location.hash === '#manage') {
      show('manage');
      if (params.get('ref') && !mForm.ref.value) mForm.ref.value = params.get('ref');
      try { const s = JSON.parse(localStorage.getItem('chulo.customer') || '{}'); if (s.email && !mForm.email.value) mForm.email.value = s.email; } catch (e) { /* ignore */ }
      setTimeout(() => (mForm.ref.value ? mForm.email : mForm.ref).focus({ preventScroll: true }), 300);
    } else {
      show(1);
    }
  }
  window.addEventListener('popstate', route);

  /* ---------------- boot ---------------- */

  renderParty();
  renderExtras();
  renderDates();
  const wanted = params.get('date');
  const firstOpen = $$('.date-btn:not(:disabled)', strip)[0];
  const startKey = wanted && core.isDateKey(wanted) && $('[data-date="' + wanted + '"]:not(:disabled)', strip) ? wanted : firstOpen && firstOpen.dataset.date;
  if (startKey) selectDate(startKey, true);
  route();
})();
