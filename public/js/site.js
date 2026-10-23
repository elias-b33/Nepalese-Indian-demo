/*
 * Shared UI: header, footer, formatting, cart storage, small helpers.
 * Loaded synchronously in <head> after menu-data.js and core.js so the header
 * can be rendered in place without a flash.
 */
(function () {
  'use strict';
  const core = window.ChuloCore;
  const S = window.ChuloMenu.settings;

  /* ---------- formatting ---------- */

  const moneyFmt = new Intl.NumberFormat(S.locale, { style: 'currency', currency: S.currency });
  const money = (p) => moneyFmt.format(p / 100).replace(/\.00$/, '');
  const moneyExact = (p) => moneyFmt.format(p / 100);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const img = (id, w, h) => 'https://images.unsplash.com/photo-' + id + '?auto=format&fit=crop&w=' + w + (h ? '&h=' + h : '') + '&q=72';

  function fmtTime(t) {
    // 24h is the norm on UK restaurant sites; keep it but drop leading zero.
    return t.replace(/^0/, '');
  }
  function fmtDate(key, opts) {
    return core.parseKey(key).toLocaleDateString(S.locale, opts || { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function relDay(key) {
    const diff = core.daysBetween(core.dateKey(new Date()), key);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return fmtDate(key, { weekday: 'long', day: 'numeric', month: 'short' });
  }

  function statusText(now) {
    const st = core.openState(S, now || new Date());
    if (st.open) return { open: true, text: st.closingSoon ? 'Closing soon · until ' + fmtTime(st.until) : 'Open now · until ' + fmtTime(st.until) };
    if (!st.next) return { open: false, text: 'Closed' };
    const when = st.next.inDays === 0 ? 'today' : st.next.inDays === 1 ? 'tomorrow' : fmtDate(st.next.date, { weekday: 'long' });
    return { open: false, text: 'Closed · opens ' + when + ' ' + fmtTime(st.next.time) };
  }

  /* ---------- icons (hand-drawn set, 24px grid, 1.6 stroke) ---------- */

  const P = {
    bag: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    arrow: '<path d="M4 12h15"/><path d="m14 6 6 6-6 6"/>',
    back: '<path d="M20 12H5"/><path d="m10 6-6 6 6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
    phone: '<path d="M6.5 3.5h3l1.5 4-2 1.3a10 10 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="m4 7 8 6 8-6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    chevronL: '<path d="m14.5 6-6 6 6 6"/>',
    chevronR: '<path d="m9.5 6 6 6-6 6"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="1.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17 14.2a5.5 5.5 0 0 1 3.5 5.3"/>',
    bike: '<circle cx="6" cy="16.5" r="3.2"/><circle cx="18" cy="16.5" r="3.2"/><path d="M6 16.5 9.5 9h5l3.5 7.5M12 16.5 9.5 9M8 6h3"/>',
    store: '<path d="M4 9.5 5.5 4.5h13L20 9.5"/><path d="M5 9.5v10h14v-10"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M10 19.5v-5h4v5"/>',
    edit: '<path d="M14.5 5.5 18.5 9.5 9 19H5v-4l9.5-9.5Z"/>',
    flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.6 3-5.3 3.6-9.3 2.6 1.6 4 4 4.2 6.2.9-.6 1.6-1.8 1.8-3.1 2 1.7 3.4 3.9 3.4 6.2C18.5 18.4 15.9 21 12 21Z"/>'
  };
  const icon = (name, cls) => '<svg class="icon ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + P[name] + '</svg>';

  /* ---------- diyo (clay oil lamp) for open/closed, and the flag of Nepal ---------- */

  let svgUid = 0;
  function diyo(lit) {
    const id = 'dy' + (++svgUid);
    const clay = lit ? ['#d9773a', '#a84b1c', '#6e2b0c'] : ['#a99d92', '#857a70', '#5f564e'];
    const dots = lit ? '#f6cf8a' : '#c4bab0';
    return '<svg class="diyo' + (lit ? ' is-lit' : '') + '" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><defs>' +
      '<linearGradient id="' + id + 'c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + clay[0] + '"/><stop offset=".55" stop-color="' + clay[1] + '"/><stop offset="1" stop-color="' + clay[2] + '"/></linearGradient>' +
      '<linearGradient id="' + id + 'r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + clay[1] + '"/><stop offset=".5" stop-color="' + (lit ? '#f3a865' : '#bdb2a8') + '"/><stop offset="1" stop-color="' + clay[1] + '"/></linearGradient>' +
      (lit
        ? '<radialGradient id="' + id + 'g"><stop offset="0" stop-color="#ffd36b" stop-opacity=".75"/><stop offset=".45" stop-color="#ffb43a" stop-opacity=".28"/><stop offset="1" stop-color="#ff9a1f" stop-opacity="0"/></radialGradient>' +
          '<linearGradient id="' + id + 'f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e2470f"/><stop offset=".45" stop-color="#ff8a1c"/><stop offset="1" stop-color="#ffc93c"/></linearGradient>' +
          '<linearGradient id="' + id + 'i" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff6d8"/><stop offset=".6" stop-color="#ffe27a"/><stop offset="1" stop-color="#ffcf4a"/></linearGradient>'
        : '') +
      '</defs>' +
      (lit ? '<circle class="diyo-glow" cx="20" cy="15" r="15" fill="url(#' + id + 'g)"/>' : '') +
      // body, foot, painted dots, rim and oil
      '<ellipse cx="20" cy="35.4" rx="6.5" ry="1.4" fill="' + clay[2] + '"/>' +
      '<path d="M4.5 24.5C5.2 31.4 11.6 35.6 20 35.6s14.8-4.2 15.5-11.1z" fill="url(#' + id + 'c)"/>' +
      '<path d="M7.6 28.6c3.4 1.7 7.6 2.5 12.4 2.5s9-.8 12.4-2.5" fill="none" stroke="' + dots + '" stroke-width=".7" stroke-linecap="round" opacity=".8"/>' +
      [10.5, 15.2, 20, 24.8, 29.5].map((x, i) => '<circle cx="' + x + '" cy="' + (i === 0 || i === 4 ? 30.9 : i === 2 ? 32.3 : 31.9) + '" r=".95" fill="' + dots + '"/>').join('') +
      '<ellipse cx="20" cy="24.5" rx="15.5" ry="3.9" fill="url(#' + id + 'r)"/>' +
      '<ellipse cx="20" cy="24.6" rx="12.6" ry="2.6" fill="' + (lit ? '#5a2208' : '#4b433d') + '"/>' +
      '<ellipse cx="18" cy="24.1" rx="5" ry=".7" fill="' + (lit ? '#d98a3d' : '#7d746c') + '" opacity=".55"/>' +
      // wick
      '<path d="M20 24.4v-3.6" stroke="' + (lit ? '#3b1606' : '#2c2622') + '" stroke-width="1.4" stroke-linecap="round"/>' +
      (lit
        ? '<g class="diyo-flame">' +
          '<path d="M20 3.2c3.9 4.9 6.1 8.8 6.1 12.2 0 3.6-2.8 6-6.1 6s-6.1-2.4-6.1-6c0-3.4 2.2-7.3 6.1-12.2z" fill="url(#' + id + 'f)"/>' +
          '<path d="M20 9.4c2.1 2.8 3.3 5 3.3 6.9 0 2-1.5 3.4-3.3 3.4s-3.3-1.4-3.3-3.4c0-1.9 1.2-4.1 3.3-6.9z" fill="url(#' + id + 'i)"/>' +
          '<ellipse cx="20" cy="18.6" rx="1.2" ry="1.5" fill="#fff" opacity=".9"/></g>'
        : '<circle cx="20" cy="20.6" r="1" fill="#1f1a17"/>' +
          '<path class="diyo-smoke" d="M20 19c-2.6-2.3 2.6-4.6 0-6.9s2.6-4.6 0-6.8" fill="none" stroke="#9d9184" stroke-width="1.5" stroke-linecap="round" opacity=".75"/>' +
          '<path d="M22.6 15.2c-1.4-1.3 1.4-2.6 0-3.9" fill="none" stroke="#b6ab9f" stroke-width="1.1" stroke-linecap="round" opacity=".55"/>') +
      '</svg>';
  }

  function nepalFlag() {
    // Simplified but faithful: double pennant, blue border, crescent moon above, twelve-rayed sun below.
    const star = (cx, cy, r1, r2, n) => {
      const pts = [];
      for (let i = 0; i < n * 2; i++) {
        const a = (Math.PI / n) * i - Math.PI / 2;
        const r = i % 2 ? r1 : r2;
        pts.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
      }
      return '<polygon points="' + pts.join(' ') + '" fill="#fff"/>';
    };
    return '<svg class="flag-np" viewBox="-5 -6 103 133" role="img" aria-label="Flag of Nepal"><title>Nepal</title>' +
      '<path d="M0 0L92 58H34L92 120H0z" fill="#dc143c" stroke="#003893" stroke-width="7" stroke-linejoin="miter"/>' +
      '<circle cx="25" cy="35" r="11" fill="#fff"/><circle cx="25" cy="30.5" r="11" fill="#dc143c"/>' +
      star(25, 31.5, 3.4, 6.2, 8) +
      star(25, 92, 9, 14.5, 12) + '<circle cx="25" cy="92" r="8" fill="#fff"/>' +
      '</svg>';
  }

  /* ---------- cart (persisted per browser) ---------- */

  const CART_KEY = 'chulo.cart.v1';
  const listeners = new Set();
  const Cart = {
    read() {
      try {
        const c = JSON.parse(localStorage.getItem(CART_KEY));
        if (c && Array.isArray(c.lines)) return c;
      } catch (e) { /* ignore */ }
      return { type: 'collection', when: { asap: true }, lines: [] };
    },
    write(c) {
      try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch (e) { /* ignore */ }
      listeners.forEach((fn) => fn(c));
    },
    lineKey: (l) => l.itemId + '|' + JSON.stringify(l.options || {}) + '|' + (l.note || ''),
    add(line) {
      const c = Cart.read();
      const key = Cart.lineKey(line);
      const hit = c.lines.find((l) => Cart.lineKey(l) === key);
      if (hit) hit.qty = Math.min(30, hit.qty + line.qty);
      else c.lines.push({ uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), itemId: line.itemId, qty: line.qty, options: line.options || {}, note: line.note || '' });
      Cart.write(c);
    },
    count: () => Cart.read().lines.reduce((s, l) => s + l.qty, 0),
    clear() { const c = Cart.read(); c.lines = []; Cart.write(c); },
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }
  };
  window.addEventListener('storage', (e) => { if (e.key === CART_KEY) listeners.forEach((fn) => fn(Cart.read())); });

  /* ---------- header & footer ---------- */

  function renderHeader(active) {
    const link = (href, label, key) => '<a href="' + href + '"' + (active === key ? ' aria-current="page"' : '') + '>' + label + '</a>';
    const nav = [
      link('order.html', 'Menu &amp; order', 'order'),
      link('book.html', 'Reservations', 'book'),
      link('index.html#kitchen', 'Our kitchen', 'kitchen'),
      link('index.html#visit', 'Visit', 'visit')
    ].join('');
    const html =
      '<a class="skip-link" href="#main">Skip to content</a>' +
      '<header class="site-header' + (active === 'home' ? ' is-home' : '') + '" data-header>' +
      '<div class="wrap header-inner">' +
      '<a class="brand" href="index.html" aria-label="Chulo, home"><span class="brand-word">Chulo</span><span class="brand-deva" lang="ne" aria-hidden="true">चुलो</span>' + nepalFlag() + '</a>' +
      '<nav class="nav" aria-label="Main">' + nav + '</nav>' +
      '<div class="header-actions">' +
      '<span class="open-chip" data-open-status></span>' +
      '<a class="cart-link" href="order.html" data-cart-link aria-label="Your order">' + icon('bag') + '<span class="cart-count" data-cart-count hidden>0</span></a>' +
      '<a class="btn btn-primary btn-sm header-book" href="book.html">Book a table</a>' +
      '<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-nav" data-menu-toggle><span></span><span></span><span class="sr-only">Menu</span></button>' +
      '</div></div>' +
      '<div class="mobile-nav" id="mobile-nav" data-mobile-nav hidden><nav class="wrap" aria-label="Mobile">' + nav +
      '<a class="btn btn-primary" href="book.html">Book a table</a>' +
      '<p class="mobile-nav-meta"><span data-open-status></span><br>' + esc(S.address.line1) + ', ' + esc(S.address.postcode) + ' · <a href="tel:' + S.phone.replace(/\s/g, '') + '">' + esc(S.phone) + '</a></p>' +
      '</nav></div>' +
      '</header>';
    document.currentScript.insertAdjacentHTML('beforebegin', html);
  }

  function hoursRows() {
    const days = [1, 2, 3, 4, 5, 6, 0];
    const today = new Date().getDay();
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days.map((d) => {
      const svc = S.hours[d];
      const val = svc.length ? svc.map((s) => fmtTime(s.open) + '–' + fmtTime(s.close)).join(', ') : 'Closed';
      return '<tr' + (d === today ? ' class="is-today"' : '') + '><th scope="row">' + names[d] + (d === today ? ' <span class="today-tag">today</span>' : '') + '</th><td>' + val + '</td></tr>';
    }).join('');
  }

  function renderFooter() {
    const a = S.address;
    const html =
      '<footer class="site-footer">' +
      '<div class="dhaka-band" aria-hidden="true"></div>' +
      '<div class="wrap footer-grid">' +
      '<div class="footer-brand"><a class="brand brand-lg" href="index.html"><span class="brand-word">Chulo</span><span class="brand-deva" lang="ne" aria-hidden="true">चुलो</span>' + nepalFlag() + '</a>' +
      '<p>Nepali home cooking and North Indian classics from a family kitchen in Hackney. Momo folded every morning since 2016.</p></div>' +
      '<div><h2 class="footer-h">Find us</h2><p>' + esc(a.line1) + '<br>' + esc(a.line2) + ', ' + esc(a.city) + '<br>' + esc(a.postcode) + '</p>' +
      '<p><a href="tel:' + S.phone.replace(/\s/g, '') + '">' + esc(S.phone) + '</a><br><a href="mailto:' + S.email + '">' + esc(S.email) + '</a></p></div>' +
      '<div><h2 class="footer-h">Hours</h2><table class="hours-table hours-compact"><tbody>' + hoursRows() + '</tbody></table></div>' +
      '<div><h2 class="footer-h">Eat with us</h2><ul class="footer-links">' +
      '<li><a href="order.html">Order collection or delivery</a></li><li><a href="book.html">Book a table</a></li>' +
      '<li><a href="book.html#manage">Manage a booking</a></li><li><a href="index.html#private">Private dining</a></li></ul></div>' +
      '</div>' +
      '<div class="wrap footer-base"><span>© ' + new Date().getFullYear() + ' Chulo Kitchen Ltd · A demo restaurant</span>' +
      '<span>Allergies? Tell us when you order. Our kitchen handles nuts, gluten, dairy and sesame.</span>' +
      '<a href="admin/" class="footer-staff">Kitchen login</a></div>' +
      '</footer>';
    document.currentScript.insertAdjacentHTML('beforebegin', html);
  }

  /* ---------- behaviour ---------- */

  function initHeader() {
    const header = document.querySelector('[data-header]');
    if (!header) return;
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const toggle = header.querySelector('[data-menu-toggle]');
    const panel = header.querySelector('[data-mobile-nav]');
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
      document.documentElement.classList.toggle('nav-open', open);
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    panel.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { setOpen(false); toggle.focus(); } });

    const paintStatus = () => {
      const st = statusText();
      document.querySelectorAll('[data-open-status]').forEach((el) => {
        el.classList.toggle('is-open', st.open);
        if (!el.classList.contains('open-chip')) { el.textContent = st.text; return; }
        if (el.dataset.status === st.text) return; // avoid re-lighting the lamp every minute
        el.dataset.status = st.text;
        // Header pill: lit/unlit diyo, with the headline word ("Open now" / "Closed") emphasised.
        const [head, rest] = st.text.split(' · ');
        el.innerHTML = diyo(st.open) + '<span class="open-chip-text"><strong>' + esc(head) + '</strong>' + (rest ? ' · ' + esc(rest) : '') + '</span>';
        el.title = st.open ? 'The diyo is lit: our kitchen is open' : 'The diyo is out: our kitchen is closed';
      });
    };
    paintStatus();
    setInterval(paintStatus, 60000);

    const paintCart = () => {
      const n = Cart.count();
      document.querySelectorAll('[data-cart-count]').forEach((el) => { el.textContent = n; el.hidden = n === 0; });
      document.querySelectorAll('[data-cart-link]').forEach((el) => el.setAttribute('aria-label', n ? 'Your order, ' + n + ' item' + (n === 1 ? '' : 's') : 'Your order'));
    };
    paintCart();
    Cart.subscribe(paintCart);
  }

  function initReveal() {
    const els = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    els.forEach((el) => io.observe(el));
  }

  let toastTimer;
  function toast(message, action) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.innerHTML = '<span>' + esc(message) + '</span>' + (action ? '<a href="' + action.href + '">' + esc(action.label) + '</a>' : '');
    el.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-shown'), 3200);
  }

  function setBusy(btn, busy, label) {
    if (busy) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.classList.add('is-busy');
      btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>' + (label || 'Please wait');
    } else {
      btn.disabled = false;
      btn.classList.remove('is-busy');
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHeader();
    initReveal();
    document.querySelectorAll('[data-hours]').forEach((el) => { el.innerHTML = hoursRows(); });
  });

  window.Chulo = { S, money, moneyExact, esc, img, icon, diyo, nepalFlag, fmtTime, fmtDate, relDay, statusText, Cart, renderHeader, renderFooter, toast, setBusy, hoursRows };
})();
