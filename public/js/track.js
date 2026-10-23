/* Order tracking: live status timeline, polled from the API. */
(function () {
  'use strict';
  const { S, esc, moneyExact, icon, fmtTime, relDay } = window.Chulo;
  const core = window.ChuloCore;
  const Api = window.ChuloApi;
  const root = document.querySelector('[data-track]');
  const ref = new URLSearchParams(location.search).get('ref');

  const STEPS = {
    received: { label: 'Order received', note: 'It\'s on the ticket rail. The kitchen will pick it up in a moment.' },
    preparing: { label: 'In the kitchen', note: 'Pans are hot and momo are being folded.' },
    ready: { label: 'Ready to collect', note: 'At the counter, 3 Tamarind Yard. Give your name or order number.' },
    out_for_delivery: { label: 'On its way', note: 'Our rider has left the kitchen with your food.' },
    completed: { label: 'Enjoy', note: '' }
  };
  const HEADLINE = {
    received: (n) => 'Thanks, ' + n + '. We\'ve got your order.',
    preparing: () => 'It\'s cooking.',
    ready: () => 'Ready at the counter.',
    out_for_delivery: () => 'On its way to you.',
    completed: (n, o) => o.type === 'delivery' ? 'Delivered. Enjoy your meal.' : 'Collected. Enjoy your meal.',
    cancelled: () => 'This order was cancelled.'
  };

  const timeOf = (iso) => { const d = new Date(iso); return core.pad(d.getHours()) + ':' + core.pad(d.getMinutes()); };

  function render(o) {
    const flow = core.ORDER_FLOW[o.type];
    const idx = flow.indexOf(o.status);
    const at = {};
    o.history.forEach((h) => { at[h.status] = h.at; });
    const delivery = o.type === 'delivery';
    const done = o.status === 'completed' || o.status === 'cancelled';
    const dueLabel = delivery ? 'Arriving around' : 'Ready by';
    const dueVal = (o.due.date === core.dateKey(new Date()) ? '' : relDay(o.due.date) + ', ') + fmtTime(o.due.time);
    const payment = (S.ordering.payment.find((p) => p.id === o.payment.method) || {}).label || '';

    const timeline = o.status === 'cancelled' ? '' : '<ol class="timeline" aria-label="Order progress">' + flow.map((s, i) => {
      const cls = i < idx || o.status === 'completed' ? 'is-done' : i === idx ? 'is-current' : 'is-pending';
      const step = s === 'completed' ? { label: delivery ? 'Delivered' : 'Collected', note: '' } : STEPS[s];
      return '<li class="' + cls + '"' + (i === idx ? ' aria-current="step"' : '') + '><span class="tl-dot">' + icon('check') + '</span>' +
        '<div class="tl-text"><strong>' + step.label + '</strong>' + (i === idx && step.note ? '<span>' + step.note + '</span>' : '') + '</div>' +
        '<span class="tl-time">' + (at[s] ? timeOf(at[s]) : '') + '</span></li>';
    }).join('') + '</ol>';

    root.innerHTML =
      '<div class="track-head">' +
      '<p class="eyebrow">Order ' + esc(o.ref) + '</p>' +
      '<h1 class="h1" aria-live="polite">' + esc(HEADLINE[o.status](o.firstName, o)) + '</h1>' +
      '</div>' +
      (o.status === 'cancelled'
        ? '<div class="form-alert track-cancelled">If this is a surprise, please call us on <a href="tel:' + S.phone.replace(/\s/g, '') + '">' + esc(S.phone) + '</a>. You haven\'t been charged.</div>'
        : '<div class="track-eta">' +
          '<div><span>' + dueLabel + '</span><strong class="tabular">' + esc(dueVal) + '</strong></div>' +
          '<div><span>' + (delivery ? 'Delivery' : 'Collect from') + '</span><strong>' + (delivery ? 'To your door' : 'Tamarind Yard') + '</strong></div>' +
          '<div><span>Total</span><strong class="tabular">' + moneyExact(o.total) + '</strong></div>' +
          '</div>') +
      timeline +
      '<section class="receipt" aria-labelledby="rc-h"><h2 id="rc-h">Receipt</h2>' +
      '<ul class="summary-lines">' + o.items.map((l) =>
        '<li><span class="qty">' + l.qty + '×</span><span>' + esc(l.name) + '<small>' + esc(l.options.map((x) => x.choice.replace(/,.*$/, '')).concat(l.note ? ['“' + l.note + '”'] : []).join(' · ')) + '</small></span><span class="tabular">' + moneyExact(l.total) + '</span></li>').join('') +
      '</ul>' +
      '<div class="sum-row"><span>Subtotal</span><span>' + moneyExact(o.subtotal) + '</span></div>' +
      (delivery ? '<div class="sum-row"><span>Delivery</span><span>' + (o.deliveryFee ? moneyExact(o.deliveryFee) : 'Free') + '</span></div>' : '') +
      '<div class="sum-row total"><span>Total</span><span>' + moneyExact(o.total) + '</span></div>' +
      '<p class="muted" style="font-size:.85rem;margin:12px 0 0">Paying by ' + esc(payment.toLowerCase()) + '. Placed ' + esc(relDay(core.dateKey(new Date(o.createdAt))).toLowerCase()) + ' at ' + timeOf(o.createdAt) + '.</p>' +
      '</section>' +
      '<div class="track-help">' +
      '<span>Need to change something? Call <a class="link" href="tel:' + S.phone.replace(/\s/g, '') + '">' + esc(S.phone) + '</a></span>' +
      '<a class="link" href="order.html">' + (done ? 'Order again' : 'Back to the menu') + '</a>' +
      '</div>';
    return done;
  }

  function lookupForm(message) {
    let recent = [];
    try { recent = JSON.parse(localStorage.getItem('chulo.orders') || '[]'); } catch (e) { /* ignore */ }
    root.innerHTML =
      '<p class="eyebrow">Track an order</p><h1 class="h1" style="margin-top:18px;font-size:clamp(2.4rem,5vw,4rem)">Where\'s my food?</h1>' +
      (message ? '<div class="form-alert" style="margin-top:24px">' + esc(message) + '</div>' : '') +
      '<form class="field" style="margin-top:28px;max-width:420px" action="track.html"><label for="t-ref">Order number</label>' +
      '<div style="display:flex;gap:8px"><input class="input" id="t-ref" name="ref" placeholder="CH-XXXX" style="text-transform:uppercase" required>' +
      '<button class="btn btn-primary" type="submit">Track</button></div></form>' +
      (recent.length ? '<div style="margin-top:36px"><h2 class="footer-h" style="color:var(--ink-3)">Your recent orders</h2><ul class="footer-links">' +
        recent.map((r) => '<li><a class="link" href="track.html?ref=' + encodeURIComponent(r.ref) + '">' + esc(r.ref) + '</a> <span class="muted">· ' + esc(relDay(core.dateKey(new Date(r.at)))) + '</span></li>').join('') + '</ul></div>' : '');
  }

  if (!ref) { lookupForm(); return; }

  let timer;
  async function poll() {
    try {
      const o = await Api.getOrder(ref);
      const done = render(o);
      document.title = (STEPS[o.status] ? STEPS[o.status].label : 'Order') + ' · ' + o.ref + ' · Chulo';
      if (!done) timer = setTimeout(poll, 5000);
    } catch (e) {
      if (e.status === 404 || e.code === 'not_found') lookupForm('We couldn\'t find order ' + ref.toUpperCase() + '. Check the number in your confirmation text.');
      else timer = setTimeout(poll, 8000);
    }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { clearTimeout(timer); poll(); } });
  poll();
})();
