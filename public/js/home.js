/* Home page: signature dish list, region lists, quick-book form. */
(function () {
  'use strict';
  const { esc, money, img, icon, fmtDate } = window.Chulo;
  const core = window.ChuloCore;
  const M = window.ChuloMenu;
  const byId = (id) => M.items.find((i) => i.id === id);

  /* Signature dishes */
  const SIGNATURE = ['jhol-momo', 'khasi-masu', 'lamb-sekuwa', 'dal-makhani', 'dal-bhat'];
  const list = document.querySelector('[data-dishes]');
  if (list) {
    list.innerHTML = SIGNATURE.map((id, i) => {
      const it = byId(id);
      return '<li class="dish" data-reveal data-img="' + it.img + '">' +
        '<span class="dish-no">No. ' + String(i + 1).padStart(2, '0') + '</span>' +
        '<div class="dish-thumb"><img src="' + img(it.img, 240, 240) + '" alt="" loading="lazy"></div>' +
        '<h3 class="dish-name">' + esc(it.name) + (it.local ? '<span class="deva" lang="ne">' + esc(it.local) + '</span>' : '') + '</h3>' +
        '<p class="dish-desc">' + esc(it.desc) + '</p>' +
        '<span class="dish-price">' + money(it.price) + '</span>' +
        '<a class="link dish-add" href="order.html?add=' + it.id + '">Add to order ' + icon('arrow') + '</a>' +
        '</li>';
    }).join('');

    // Cursor-following preview image (pointer devices only).
    const hover = document.querySelector('[data-dish-hover]');
    const hoverImg = hover.querySelector('img');
    if (matchMedia('(hover: hover) and (min-width: 901px)').matches) {
      let x = 0, y = 0, tx = 0, ty = 0, raf = null;
      const loop = () => {
        x += (tx - x) * 0.18; y += (ty - y) * 0.18;
        hover.style.transform = 'translate3d(' + (x - hover.offsetWidth / 2) + 'px,' + (y - hover.offsetHeight / 2) + 'px,0)';
        raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(loop) : null;
      };
      list.addEventListener('pointermove', (e) => {
        tx = e.clientX + 150; ty = e.clientY;
        if (!raf) raf = requestAnimationFrame(loop);
      });
      list.querySelectorAll('.dish').forEach((row) => {
        row.addEventListener('pointerenter', (e) => {
          hoverImg.src = img(row.dataset.img, 520, 650);
          if (!hover.classList.contains('is-on')) { x = tx = e.clientX + 150; y = ty = e.clientY; }
          hover.classList.add('is-on');
        });
        row.addEventListener('pointerleave', () => hover.classList.remove('is-on'));
      });
    }
  }

  /* Only spin the hero stamp while it's on screen. */
  const stamp = document.querySelector('.stamp');
  if (stamp && 'IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => stamp.classList.toggle('is-paused', !en.isIntersecting)).observe(stamp);
  }

  /* Region lists */
  document.querySelectorAll('[data-region]').forEach((ul) => {
    ul.innerHTML = ul.dataset.region.split(',').map((id) => {
      const it = byId(id);
      return '<li><span>' + esc(it.name) + '</span><span>' + money(it.price) + '</span></li>';
    }).join('');
  });

  /* Quick-book: next 14 open days */
  const sel = document.querySelector('[data-quick-dates]');
  if (sel) {
    const now = new Date();
    const opts = [];
    for (let i = 0; opts.length < 14 && i < 30; i++) {
      const key = core.dateKey(core.addDays(now, i));
      if (!core.servicesOn(M.settings, key).length) continue;
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : fmtDate(key, { weekday: 'short', day: 'numeric', month: 'short' });
      opts.push('<option value="' + key + '">' + label + '</option>');
    }
    sel.innerHTML = opts.join('');
  }
})();
