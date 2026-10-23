/* Order page: menu browsing, item customisation, cart, time selection, checkout. */
(function () {
  'use strict';
  const { S, esc, money, moneyExact, img, icon, fmtTime, relDay, Cart, toast, setBusy } = window.Chulo;
  const core = window.ChuloCore;
  const Api = window.ChuloApi;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  let menu = null;
  const ui = { q: '', filters: new Set(), editing: null };

  const TAG_LABEL = { v: 'V', vg: 'VG', gf: 'GF', n: 'N', '18': '18+' };
  const HEAT_LABEL = ['Not spicy', 'Gentle heat', 'Medium heat', 'Hot'];
  const itemById = (id) => menu.items.find((i) => i.id === id);

  function tagsHtml(it) {
    const tags = (it.tags || []).map((t) => '<span class="tag tag-' + t + '" title="' + ({ v: 'Vegetarian', vg: 'Vegan', gf: 'Gluten-free', n: 'Contains nuts', '18': 'Over 18s only' }[t] || '') + '">' + TAG_LABEL[t] + '</span>').join('');
    const heat = it.heat ? '<span class="heat" title="' + HEAT_LABEL[it.heat] + '" aria-label="' + HEAT_LABEL[it.heat] + '">' + [1, 2, 3].map((n) => '<i' + (n <= it.heat ? ' class="on"' : '') + '></i>').join('') + '</span>' : '';
    return '<span class="tags">' + tags + heat + '</span>';
  }

  /* ---------------- cart model ---------------- */

  function cart() { return Cart.read(); }
  function saveCart(c) { Cart.write(c); }

  function totals(c) {
    const good = c.lines.filter((l) => { const it = itemById(l.itemId); return it && it.available !== false; });
    const r = core.computeTotals(menu, good, c.type);
    if (!r.ok) return Object.assign(core.computeTotals(menu, [], c.type), { lines: [] });
    return r;
  }

  /* ---------------- when (ASAP / scheduled) ---------------- */

  function normaliseWhen(c) {
    const now = new Date();
    if (c.when && c.when.asap) {
      if (core.canOrderAsap(S, c.type, now)) return c.when;
    } else if (c.when && c.when.date && core.orderSlots(S, c.when.date, c.type, now).includes(c.when.time)) {
      return c.when;
    }
    if (core.canOrderAsap(S, c.type, now)) return { asap: true };
    const days = core.orderDays(S, c.type, now);
    if (!days.length) return { asap: false, date: null, time: null };
    return { asap: false, date: days[0], time: core.orderSlots(S, days[0], c.type, now)[0] };
  }

  function whenText(c) {
    const w = c.when;
    const verb = c.type === 'delivery' ? 'Delivery' : 'Collection';
    if (w.asap) return { main: verb + ' ASAP', sub: 'Ready in about ' + core.prepFor(S, c.type) + ' minutes' };
    if (!w.date) return { main: 'No times available', sub: 'Please call us to order' };
    return { main: verb + ' ' + relDay(w.date).replace(/^(Today|Tomorrow)$/, (m) => m.toLowerCase()) + ' at ' + fmtTime(w.time), sub: 'Scheduled order' };
  }

  function paintWhen() {
    const c = cart();
    const t = whenText(c);
    $$('[data-when-label]').forEach((el) => { el.innerHTML = '<strong>' + esc(t.main) + '</strong> · <u>change</u>'; });
    const sum = $('[data-when-summary]'); if (sum) sum.textContent = t.main;
    const sub = $('[data-when-sub]'); if (sub) sub.textContent = t.sub;

    const note = $('[data-closed-note]');
    const st = core.openState(S, new Date());
    if (!core.canOrderAsap(S, c.type, new Date())) {
      const next = st.open ? 'We\'re about to close for this service.' : 'We\'re closed right now.';
      note.innerHTML = icon('clock') + '<span>' + next + ' You can still order ahead for a later time.</span>';
      note.hidden = false;
    } else note.hidden = true;
  }

  function setType(type) {
    const c = cart();
    c.type = type;
    c.when = normaliseWhen(c);
    saveCart(c);
    $$('[data-type]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === type)));
    $$('[data-only]').forEach((el) => { el.hidden = el.dataset.only !== type; });
    paintWhen();
    renderCart();
    renderSummary();
  }

  /* when dialog */
  const whenDlg = $('[data-when-dialog]');
  let whenDraft = null;
  function openWhen() {
    const c = cart();
    whenDraft = Object.assign({}, c.when);
    $('[data-when-title]').textContent = c.type === 'delivery' ? 'When should we deliver?' : 'When will you collect?';
    $('[data-when-desc]').textContent = c.type === 'delivery'
      ? 'Delivery takes about ' + S.ordering.deliveryMinutes + ' minutes. Times are when it should reach you.'
      : 'We need about ' + S.ordering.collectionMinutes + ' minutes. Times are when it will be ready at the counter.';
    paintWhenDialog();
    whenDlg.showModal();
  }
  function paintWhenDialog() {
    const c = cart();
    const now = new Date();
    const asap = core.canOrderAsap(S, c.type, now);
    const days = core.orderDays(S, c.type, now);
    if (!whenDraft.asap && !whenDraft.date && days.length) whenDraft = { asap: false, date: days[0], time: null };
    const activeDay = whenDraft.asap ? 'asap' : whenDraft.date;
    let chips = asap ? '<button type="button" class="chip" data-day="asap" aria-pressed="' + (activeDay === 'asap') + '">ASAP</button>' : '';
    chips += days.map((d) => '<button type="button" class="chip" data-day="' + d + '" aria-pressed="' + (activeDay === d) + '">' + esc(core.daysBetween(core.dateKey(now), d) < 2 ? relDay(d) : window.Chulo.fmtDate(d)) + '</button>').join('');
    $('[data-day-tabs]').innerHTML = chips;

    const grid = $('[data-time-grid]');
    if (whenDraft.asap) {
      grid.innerHTML = '<p class="slot-empty" style="grid-column:1/-1">We\'ll start cooking as soon as the order comes in. Ready in about ' + core.prepFor(S, c.type) + ' minutes.</p>';
    } else {
      const slots = core.orderSlots(S, whenDraft.date, c.type, now);
      grid.innerHTML = slots.length
        ? slots.map((t) => '<button type="button" class="time-btn" data-time="' + t + '" aria-pressed="' + (whenDraft.time === t) + '">' + fmtTime(t) + '</button>').join('')
        : '<p class="slot-empty" style="grid-column:1/-1">No times left on this day.</p>';
    }
    $('[data-when-save]').disabled = !whenDraft.asap && !whenDraft.time;
  }
  whenDlg.addEventListener('click', (e) => {
    const day = e.target.closest('[data-day]');
    const time = e.target.closest('[data-time]');
    if (day) { whenDraft = day.dataset.day === 'asap' ? { asap: true } : { asap: false, date: day.dataset.day, time: null }; paintWhenDialog(); }
    if (time) { whenDraft.time = time.dataset.time; paintWhenDialog(); }
    if (e.target.closest('[data-close]') || e.target === whenDlg) whenDlg.close();
  });
  $('[data-when-save]').addEventListener('click', () => {
    const c = cart();
    c.when = whenDraft;
    saveCart(c);
    paintWhen();
    const err = $('[data-when-error]'); if (err) err.style.display = 'none';
    whenDlg.close();
  });

  /* ---------------- menu rendering ---------------- */

  function matches(it) {
    if (ui.filters.has('v') && !(it.tags || []).some((t) => t === 'v' || t === 'vg')) return false;
    if (ui.filters.has('vg') && !(it.tags || []).includes('vg')) return false;
    if (ui.filters.has('gf') && !(it.tags || []).includes('gf')) return false;
    if (ui.filters.has('mild') && it.heat) return false;
    if (ui.q) {
      const hay = (it.name + ' ' + (it.local || '') + ' ' + it.desc).toLowerCase();
      return ui.q.split(/\s+/).every((w) => hay.includes(w));
    }
    return true;
  }

  function renderMenu() {
    const inCart = new Set(cart().lines.map((l) => l.itemId));
    const html = menu.categories.map((cat) => {
      const items = menu.items.filter((i) => i.cat === cat.id && matches(i));
      if (!items.length) return '';
      return '<section class="menu-cat" id="cat-' + cat.id + '" data-cat="' + cat.id + '" aria-labelledby="h-' + cat.id + '">' +
        '<div class="menu-cat-head"><h2 id="h-' + cat.id + '">' + esc(cat.name) + '</h2><span class="deva" lang="ne">' + esc(cat.local) + '</span></div>' +
        '<p class="menu-cat-blurb">' + esc(cat.blurb) + '</p>' +
        '<ul class="items">' + items.map((it) => itemHtml(it, inCart.has(it.id))).join('') + '</ul></section>';
    }).join('');
    $('[data-menu]').innerHTML = html || '<div class="empty-results"><p>Nothing matches that. Try another word, or <button class="link" type="button" data-clear>clear the filters</button>.</p></div>';
    renderCatNav();
  }

  function itemHtml(it, inCart) {
    const sold = it.available === false;
    return '<li class="item' + (sold ? ' is-soldout' : '') + '" data-item="' + it.id + '">' +
      (inCart ? '<span class="in-cart" title="In your order"></span>' : '') +
      '<button class="item-btn" type="button" data-open="' + it.id + '" aria-label="' + esc(it.name) + ', ' + money(it.price) + (sold ? ', sold out' : '') + '"></button>' +
      '<div><div class="item-top"><h3 class="item-name">' + esc(it.name) + '</h3>' + (it.local ? '<span class="item-local" lang="ne">' + esc(it.local) + '</span>' : '') + '</div>' +
      '<p class="item-desc">' + esc(it.desc) + '</p>' +
      '<div class="item-meta"><span class="item-price">' + money(it.price) + (it.options && it.options.some((g) => g.choices.some((c) => c.price > 0)) ? '<span class="muted" style="font-weight:400"> +</span>' : '') + '</span>' +
      (it.popular ? '<span class="tag tag-pop">Popular</span>' : '') + tagsHtml(it) + (sold ? '<span class="soldout">Sold out today</span>' : '') + '</div></div>' +
      '<div class="item-side">' +
      (it.img ? '<div class="item-thumb"><img src="' + img(it.img, 240, 240) + '" alt="" loading="lazy" width="116" height="116"></div>' : '') +
      '<button class="add-btn" type="button" data-quick="' + it.id + '" aria-label="Add ' + esc(it.name) + '">' + icon('plus') + '</button>' +
      '</div></li>';
  }

  function renderCatNav() {
    const present = $$('[data-cat]').map((s) => s.dataset.cat);
    const links = menu.categories.filter((c) => present.includes(c.id))
      .map((c) => '<a href="#cat-' + c.id + '" data-nav="' + c.id + '">' + esc(c.name) + '</a>');
    $('[data-cat-rail]').innerHTML = links.map((l) => '<li>' + l + '</li>').join('');
    $('[data-cat-tabs]').innerHTML = links.join('');
    observeCats();
  }

  // Scrollspy: the active section is the last one whose top has passed under the sticky tools.
  let spyFrame = null;
  let activeCat = null;
  function observeCats() {
    activeCat = null;
    spy();
  }
  function spy() {
    spyFrame = null;
    const sections = $$('[data-cat]');
    if (!sections.length) return;
    const line = (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h'), 10) || 72) + 140;
    let current = sections[0].dataset.cat;
    for (const s of sections) if (s.getBoundingClientRect().top <= line) current = s.dataset.cat;
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 300) {
      const last = sections[sections.length - 1];
      if (last.getBoundingClientRect().top < window.innerHeight * 0.6) current = last.dataset.cat;
    }
    if (current !== activeCat) setActiveCat(current);
  }
  window.addEventListener('scroll', () => { if (!spyFrame) spyFrame = requestAnimationFrame(spy); }, { passive: true });
  function setActiveCat(id) {
    activeCat = id;
    $$('[data-nav]').forEach((a) => a.classList.toggle('is-active', a.dataset.nav === id));
    const tab = $('[data-cat-tabs] [data-nav="' + id + '"]');
    const bar = $('[data-cat-tabs]');
    if (tab && bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: tab.offsetLeft - 24, behavior: 'smooth' });
  }

  /* ---------------- item dialog ---------------- */

  const itemDlg = $('[data-item-dialog]');
  const itemForm = $('[data-item-form]');

  function openItem(id, line) {
    const it = itemById(id);
    if (!it) return;
    ui.editing = line ? line.uid : null;
    const opts = line ? line.options : core.defaultOptions(it);
    const qty = line ? line.qty : 1;
    const sold = it.available === false;

    itemForm.innerHTML =
      (it.img ? '<div class="sheet-media"><img src="' + img(it.img, 1000, 560) + '" alt="' + esc(it.name) + '"></div>' : '') +
      '<button class="sheet-close" type="button" data-close aria-label="Close">' + icon('close') + '</button>' +
      '<div class="sheet-body">' +
      '<h2 class="h3" id="item-title">' + esc(it.name) + '</h2>' +
      '<div class="sheet-sub">' + (it.local ? '<span class="deva" lang="ne">' + esc(it.local) + '</span>' : '') + tagsHtml(it) + '</div>' +
      '<p class="sheet-desc">' + esc(it.desc) + '</p>' +
      (it.options || []).map((g) =>
        '<fieldset class="sheet-group"><legend>' + esc(g.name) + '<small>Choose 1</small></legend><div class="choice-list">' +
        g.choices.map((ch) =>
          '<label class="choice"><input type="radio" name="opt-' + g.id + '" value="' + ch.id + '"' + (opts[g.id] === ch.id ? ' checked' : '') + '>' +
          '<span class="choice-dot"></span><span class="choice-body"><strong>' + esc(ch.label) + '</strong></span>' +
          (ch.price ? '<span class="choice-price">' + (ch.price > 0 ? '+' : '−') + money(Math.abs(ch.price)) + '</span>' : '') +
          '</label>').join('') +
        '</div></fieldset>').join('') +
      '<div class="field" style="margin-top:22px"><label for="item-note">Note for the kitchen <small>(optional)</small></label>' +
      '<input class="input" id="item-note" name="note" maxlength="140" placeholder="e.g. no coriander" value="' + esc(line ? line.note : '') + '"></div>' +
      '</div>' +
      '<div class="sheet-foot">' +
      '<div class="stepper" data-stepper><button type="button" data-step="-1" aria-label="One less">' + icon('minus') + '</button><output data-qty aria-live="polite">' + qty + '</output><button type="button" data-step="1" aria-label="One more">' + icon('plus') + '</button></div>' +
      '<button class="btn btn-primary" type="submit" data-add' + (sold ? ' disabled' : '') + '><span>' + (sold ? 'Sold out today' : line ? 'Update order' : 'Add to order') + '</span><span data-line-total class="tabular"></span></button>' +
      '</div>';
    itemForm.dataset.item = id;
    paintItemTotal();
    itemDlg.showModal();
    itemForm.querySelector('.sheet-body').scrollTop = 0;
  }

  function readItemForm() {
    const it = itemById(itemForm.dataset.item);
    const options = {};
    (it.options || []).forEach((g) => {
      const r = itemForm.querySelector('input[name="opt-' + g.id + '"]:checked');
      options[g.id] = r ? r.value : g.choices[0].id;
    });
    return { itemId: it.id, qty: Number($('[data-qty]', itemForm).textContent), options, note: itemForm.note.value.trim() };
  }
  function paintItemTotal() {
    const line = readItemForm();
    const r = core.priceLine(menu, line);
    $('[data-line-total]', itemForm).textContent = r.ok ? moneyExact(r.line.total) : '';
    $('[data-step="-1"]', itemForm).disabled = line.qty <= 1;
  }

  itemForm.addEventListener('change', paintItemTotal);
  itemForm.addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    if (step) {
      const out = $('[data-qty]', itemForm);
      out.textContent = Math.max(1, Math.min(30, Number(out.textContent) + Number(step.dataset.step)));
      paintItemTotal();
    }
    if (e.target.closest('[data-close]')) itemDlg.close();
  });
  itemDlg.addEventListener('click', (e) => { if (e.target === itemDlg) itemDlg.close(); });
  itemForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const line = readItemForm();
    if (ui.editing) {
      const c = cart();
      const i = c.lines.findIndex((l) => l.uid === ui.editing);
      if (i > -1) c.lines[i] = Object.assign(c.lines[i], line);
      saveCart(c);
      toast('Order updated');
    } else {
      Cart.add(line);
      toast(line.qty + ' × ' + itemById(line.itemId).name + ' added', window.innerWidth < 861 ? { href: '#order', label: 'View order' } : null);
    }
    itemDlg.close();
  });

  /* ---------------- cart rendering ---------------- */

  function optionSummary(it, line) {
    const parts = [];
    (it.options || []).forEach((g) => {
      const ch = g.choices.find((c) => c.id === line.options[g.id]);
      if (ch) parts.push(ch.label.replace(/,.*$/, '').replace(/ \(.*\)$/, ''));
    });
    if (line.note) parts.push('“' + line.note + '”');
    return parts.join(' · ');
  }

  function renderCart() {
    if (!menu) return;
    const c = cart();
    const t = totals(c);
    const el = $('[data-cart]');
    const mode = c.type === 'delivery' ? 'Delivery' : 'Collection';
    let html = '<div class="cart-head"><div><h2>Your order</h2><span class="cart-mode">' + mode + ' · ' + esc(whenText(c).main.replace(/^(Collection|Delivery) /, '')) + '</span></div>' +
      '<button class="sheet-close" type="button" data-cart-close aria-label="Close order">' + icon('close') + '</button></div>';

    if (!c.lines.length) {
      html += '<div class="cart-empty">' + icon('bag') + '<p style="margin:0">Nothing here yet.<br>Tap <strong>+</strong> on a dish to start your order.</p></div>';
    } else {
      html += '<ul class="cart-lines">' + c.lines.map((l) => {
        const it = itemById(l.itemId);
        if (!it) return '';
        const r = core.priceLine(menu, l);
        const gone = it.available === false;
        return '<li class="cart-line" data-line="' + l.uid + '">' +
          '<span class="cart-line-name">' + esc(it.name) + '</span>' +
          '<span class="cart-line-price">' + (gone ? '' : moneyExact(r.ok ? r.line.total : 0)) + '</span>' +
          '<span class="cart-line-opts">' + esc(optionSummary(it, l)) + (gone ? '<br><span class="soldout">Sold out, please remove</span>' : '') + '</span>' +
          '<div class="cart-line-ctrl">' +
          '<div class="stepper stepper-sm"><button type="button" data-dec aria-label="One less ' + esc(it.name) + '">' + icon(l.qty === 1 ? 'close' : 'minus') + '</button><output>' + l.qty + '</output><button type="button" data-inc aria-label="One more ' + esc(it.name) + '"' + (gone ? ' disabled' : '') + '>' + icon('plus') + '</button></div>' +
          (gone ? '<button class="link" type="button" data-remove>Remove</button>' : '<button class="link" type="button" data-edit>Edit</button>') +
          '</div></li>';
      }).join('') + '</ul>';

      const o = S.ordering;
      html += '<div class="cart-foot">' +
        '<div class="sum-row"><span>Subtotal</span><span>' + moneyExact(t.subtotal) + '</span></div>' +
        (c.type === 'delivery' ? '<div class="sum-row"><span>Delivery</span><span>' + (t.deliveryFee ? moneyExact(t.deliveryFee) : 'Free') + '</span></div>' : '') +
        (c.type === 'delivery' && t.freeDeliveryGap > 0 && t.minimumMet
          ? '<div class="progress">Add ' + moneyExact(t.freeDeliveryGap) + ' for free delivery<div class="progress-bar"><span style="width:' + Math.min(100, (t.subtotal / o.freeDeliveryOver) * 100) + '%"></span></div></div>' : '') +
        '<div class="sum-row total"><span>Total</span><span>' + moneyExact(t.total) + '</span></div>' +
        (!t.minimumMet ? '<div class="form-alert">Delivery orders start at ' + money(o.minimumDelivery) + '. Add ' + moneyExact(o.minimumDelivery - t.subtotal) + ' more, or switch to collection.</div>' : '') +
        '<a class="btn btn-primary btn-block" href="#checkout" data-go-checkout' + (!t.minimumMet || !t.lines.length ? ' aria-disabled="true" tabindex="-1" style="opacity:.45;pointer-events:none"' : '') + '><span>Go to checkout</span><span>' + moneyExact(t.total) + '</span></a>' +
        '</div>';
    }
    el.innerHTML = html;

    // Mobile bar
    const bar = $('[data-cart-bar]');
    $('[data-bar-count]').textContent = t.count;
    $('[data-bar-total]').textContent = moneyExact(t.total);
    bar.classList.toggle('is-shown', c.lines.length > 0 && !document.body.classList.contains('is-checkout'));

    // In-cart markers
    const ids = new Set(c.lines.map((l) => l.itemId));
    $$('[data-item]').forEach((li) => {
      const has = ids.has(li.dataset.item);
      const mark = li.querySelector('.in-cart');
      if (has && !mark) li.insertAdjacentHTML('afterbegin', '<span class="in-cart" title="In your order"></span>');
      if (!has && mark) mark.remove();
    });
  }

  $('[data-cart]').addEventListener('click', (e) => {
    const li = e.target.closest('[data-line]');
    if (e.target.closest('[data-cart-close]')) return closeCartSheet();
    if (e.target.closest('[data-go-checkout]')) { closeCartSheet(); return; }
    if (!li) return;
    const c = cart();
    const line = c.lines.find((l) => l.uid === li.dataset.line);
    if (!line) return;
    if (e.target.closest('[data-inc]')) line.qty = Math.min(30, line.qty + 1);
    else if (e.target.closest('[data-dec]')) line.qty -= 1;
    else if (e.target.closest('[data-remove]')) line.qty = 0;
    else if (e.target.closest('[data-edit]')) { openItem(line.itemId, line); return; }
    else return;
    c.lines = c.lines.filter((l) => l.qty > 0);
    saveCart(c);
  });

  /* mobile cart sheet */
  const panel = $('[data-cart-panel]');
  const backdrop = $('[data-cart-backdrop]');
  let lastFocus = null;
  function openCartSheet() {
    lastFocus = document.activeElement;
    panel.classList.add('is-open');
    backdrop.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden';
    setTimeout(() => { const b = $('[data-cart-close]'); if (b) b.focus(); }, 50);
  }
  function closeCartSheet() {
    if (!panel.classList.contains('is-open')) return;
    panel.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }
  $('[data-cart-bar]').addEventListener('click', openCartSheet);
  backdrop.addEventListener('click', closeCartSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCartSheet(); });

  /* ---------------- checkout ---------------- */

  const form = $('[data-checkout-form]');
  const CUSTOMER_KEY = 'chulo.customer';

  function renderSummary() {
    if (!menu) return;
    const c = cart();
    const t = totals(c);
    $('[data-summary-meta]').textContent = (c.type === 'delivery' ? 'Delivery' : 'Collection') + ' · ' + t.count + ' item' + (t.count === 1 ? '' : 's');
    $('[data-summary-lines]').innerHTML = c.lines.map((l) => {
      const it = itemById(l.itemId);
      const r = core.priceLine(menu, l);
      if (!it || !r.ok) return '';
      return '<li><span class="qty">' + l.qty + '×</span><span>' + esc(it.name) + '<small>' + esc(optionSummary(it, l)) + '</small></span><span class="tabular">' + moneyExact(r.line.total) + '</span></li>';
    }).join('');
    $('[data-summary-totals]').innerHTML =
      '<div class="sum-row"><span>Subtotal</span><span>' + moneyExact(t.subtotal) + '</span></div>' +
      (c.type === 'delivery' ? '<div class="sum-row"><span>Delivery</span><span>' + (t.deliveryFee ? moneyExact(t.deliveryFee) : 'Free') + '</span></div>' : '') +
      '<div class="sum-row total"><span>Total</span><span>' + moneyExact(t.total) + '</span></div>';
    const placeTotal = $('[data-place-total]');
    if (placeTotal) placeTotal.textContent = moneyExact(t.total);
  }

  function renderPayment() {
    const saved = (loadCustomer().payment) || S.ordering.payment[0].id;
    $('[data-payment]').innerHTML = S.ordering.payment.map((p) =>
      '<label class="choice"><input type="radio" name="payment" value="' + p.id + '"' + (p.id === saved ? ' checked' : '') + '><span class="choice-dot"></span>' +
      '<span class="choice-body"><strong>' + esc(p.label) + '</strong><small>' + esc(p.note) + '</small></span></label>').join('');
  }

  function loadCustomer() { try { return JSON.parse(localStorage.getItem(CUSTOMER_KEY)) || {}; } catch (e) { return {}; } }
  function prefill() {
    const c = loadCustomer();
    ['name', 'phone', 'email', 'line1', 'line2', 'postcode', 'instructions'].forEach((k) => { if (c[k] && !form[k].value) form[k].value = c[k]; });
  }

  function setError(name, msg) {
    const input = form[name];
    if (!input) return;
    const field = input.closest('.field');
    field.classList.toggle('has-error', !!msg);
    field.querySelector('.field-error').textContent = msg || '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function validate() {
    const c = cart();
    const v = (n) => form[n].value.trim();
    const errs = {};
    if (v('name').length < 2) errs.name = 'Please tell us your name.';
    if (v('phone').replace(/\D/g, '').length < 7) errs.phone = 'We need a number to text when your food is ready.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email'))) errs.email = 'Please enter a valid email address.';
    if (c.type === 'delivery') {
      if (v('line1').length < 3) errs.line1 = 'Please enter your street address.';
      if (!/^[A-Za-z0-9 ]{4,10}$/.test(v('postcode'))) errs.postcode = 'Please enter a valid postcode.';
    }
    ['name', 'phone', 'email', 'line1', 'postcode'].forEach((n) => setError(n, errs[n]));
    return errs;
  }
  form.addEventListener('input', (e) => { if (e.target.closest('.has-error')) setError(e.target.name, ''); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertBox = $('[data-form-alert]');
    alertBox.hidden = true;
    const errs = validate();
    const first = Object.keys(errs)[0];
    if (first) { form[first].focus(); return; }

    const c = cart();
    c.when = normaliseWhen(c);
    if (!c.when.asap && !c.when.time) { $('[data-when-error]').textContent = 'Please choose a time.'; $('[data-when-error]').style.display = 'block'; return; }

    const data = Object.fromEntries(new FormData(form));
    const payload = {
      type: c.type,
      when: c.when.asap ? { asap: true } : { date: c.when.date, time: c.when.time },
      customer: { name: data.name, phone: data.phone, email: data.email },
      address: c.type === 'delivery' ? { line1: data.line1, line2: data.line2, postcode: data.postcode, instructions: data.instructions } : null,
      items: c.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, options: l.options, note: l.note })),
      payment: data.payment,
      notes: data.notes,
      cutlery: !!data.cutlery
    };
    const btn = $('[data-place]');
    setBusy(btn, true, 'Sending to the kitchen…');
    try {
      const order = await Api.createOrder(payload);
      try {
        localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ name: data.name, phone: data.phone, email: data.email, line1: data.line1, line2: data.line2, postcode: data.postcode, instructions: data.instructions, payment: data.payment }));
        const past = JSON.parse(localStorage.getItem('chulo.orders') || '[]');
        past.unshift({ ref: order.ref, at: order.createdAt });
        localStorage.setItem('chulo.orders', JSON.stringify(past.slice(0, 10)));
      } catch (err) { /* ignore */ }
      location.href = 'track.html?ref=' + encodeURIComponent(order.ref);
      Cart.clear();
      return;
    } catch (err) {
      setBusy(btn, false);
      if (err.field && form[err.field]) { setError(err.field, err.message); form[err.field].focus(); return; }
      if (err.field === 'when') { const w = $('[data-when-error]'); w.textContent = err.message; w.style.display = 'block'; }
      alertBox.textContent = err.message;
      alertBox.hidden = false;
      alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (err.code === 'sold_out' || err.code === 'unknown_item') refreshMenu();
    }
  });

  /* ---------------- views ---------------- */

  function route() {
    const checkout = location.hash === '#checkout';
    const c = cart();
    if (checkout && (!c.lines.length || !totals(c).minimumMet)) { history.replaceState(null, '', '#menu'); return route(); }
    $$('[data-view="menu"]').forEach((el) => { el.hidden = checkout; });
    $('[data-view="checkout"]').hidden = !checkout;
    document.body.classList.toggle('is-checkout', checkout);
    if (checkout) {
      closeCartSheet();
      $$('[data-only]').forEach((el) => { el.hidden = el.dataset.only !== c.type; });
      renderSummary();
      prefill();
      window.scrollTo(0, 0);
      document.title = 'Checkout · Chulo';
    } else {
      document.title = 'Menu & Order Online · Chulo';
    }
    if (location.hash === '#order') { history.replaceState(null, '', '#menu'); openCartSheet(); }
    renderCart();
  }
  window.addEventListener('hashchange', route);
  $('[data-back]').addEventListener('click', (e) => { e.preventDefault(); history.pushState(null, '', 'order.html'); route(); });

  /* ---------------- events ---------------- */

  $('[data-menu]').addEventListener('click', (e) => {
    const quick = e.target.closest('[data-quick]');
    const open = e.target.closest('[data-open]');
    if (e.target.closest('[data-clear]')) { clearFilters(); return; }
    if (quick) {
      const it = itemById(quick.dataset.quick);
      if (it.options && it.options.length) return openItem(it.id);
      Cart.add({ itemId: it.id, qty: 1, options: {}, note: '' });
      quick.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
      toast(it.name + ' added', window.innerWidth < 861 ? { href: '#order', label: 'View order' } : null);
      return;
    }
    if (open) openItem(open.dataset.open);
  });

  let searchTimer;
  $('[data-search]').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { ui.q = e.target.value.trim().toLowerCase(); renderMenu(); }, 120);
  });
  $$('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    const f = b.dataset.filter;
    ui.filters.has(f) ? ui.filters.delete(f) : ui.filters.add(f);
    b.setAttribute('aria-pressed', String(ui.filters.has(f)));
    renderMenu();
  }));
  function clearFilters() {
    ui.q = ''; ui.filters.clear();
    $('[data-search]').value = '';
    $$('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    renderMenu();
  }

  $$('[data-type]').forEach((b) => b.addEventListener('click', () => setType(b.dataset.type)));
  document.addEventListener('click', (e) => { if (e.target.closest('[data-when-open]')) openWhen(); });

  Cart.subscribe(() => { renderCart(); renderSummary(); });

  async function refreshMenu() {
    menu = await Api.menu();
    renderMenu();
    renderCart();
    renderSummary();
  }

  /* ---------------- boot ---------------- */

  (async function boot() {
    try {
      menu = await Api.menu();
    } catch (e) {
      $('[data-menu]').innerHTML = '<div class="form-alert">We couldn\'t load the menu. Please refresh, or call us on ' + esc(S.phone) + '.</div>';
      return;
    }
    renderPayment();
    const c = cart();
    // Drop lines for dishes that no longer exist.
    c.lines = c.lines.filter((l) => itemById(l.itemId));
    saveCart(c);
    setType(c.type || 'collection');
    renderMenu();
    route();

    const params = new URLSearchParams(location.search);
    const add = params.get('add');
    if (add && itemById(add)) {
      history.replaceState(null, '', 'order.html');
      openItem(add);
    } else if (location.hash.startsWith('#cat-')) {
      const target = document.querySelector(location.hash);
      if (target) setTimeout(() => target.scrollIntoView(), 50);
    }
    // Keep sold-out status fresh while someone browses.
    setInterval(async () => {
      try {
        const fresh = await Api.menu();
        const changed = JSON.stringify(fresh.items.map((i) => [i.id, i.available, i.price])) !== JSON.stringify(menu.items.map((i) => [i.id, i.available, i.price]));
        if (changed && !itemDlg.open) { menu = fresh; renderMenu(); renderCart(); renderSummary(); }
      } catch (e) { /* offline, try later */ }
    }, 30000);
  })();
})();
