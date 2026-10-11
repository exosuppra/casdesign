/* CAS'DESIGN — page de présentation : esquisse ↔ rendu, apparitions, barre d'actions */
(() => {
  'use strict';

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---- sketch ↔ render: the divider can be dragged, or moved with the arrow keys ---- */
  const stage = document.querySelector('.view__stage');
  if (stage) {
    const handle = stage.querySelector('.view__handle');
    let x = 100, raf = 0, auto = null;
    const set = v => {
      x = clamp(v, 0, 100);
      stage.style.setProperty('--x', x + '%');
      handle.setAttribute('aria-valuenow', Math.round(100 - x));
    };
    const stopAuto = () => { cancelAnimationFrame(raf); auto = null; };
    // ease the divider to a position (used once, when the picture scrolls into view)
    const glide = (to, ms) => {
      const from = x, t0 = performance.now();
      auto = now => {
        const t = clamp((now - t0) / ms, 0, 1), e = 1 - Math.pow(1 - t, 4);
        set(from + (to - from) * e);
        if (t < 1 && auto) raf = requestAnimationFrame(auto);
      };
      raf = requestAnimationFrame(auto);
    };
    const fromEvent = e => { const r = stage.getBoundingClientRect(); set((e.clientX - r.left) / r.width * 100); };
    let drag = false;
    stage.addEventListener('pointerdown', e => { drag = true; stopAuto(); stage.setPointerCapture(e.pointerId); fromEvent(e); });
    stage.addEventListener('pointermove', e => { if (drag) fromEvent(e); });
    ['pointerup', 'pointercancel'].forEach(t => stage.addEventListener(t, () => { drag = false; }));
    handle.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') set(x - 5); else if (e.key === 'ArrowRight') set(x + 5); else return;
      stopAuto(); e.preventDefault();
    });

    if (reduce) set(50);
    else {
      set(100);
      new IntersectionObserver((entries, io) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        setTimeout(() => glide(42, 2200), 500);
      }, { threshold: 0.45 }).observe(stage);
    }
  }

  /* ---- reveal on scroll ---- */
  const items = [...document.querySelectorAll('.reveal')];
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        // siblings entering together arrive one after the other
        const group = [...en.target.parentElement.children].filter(c => c.classList.contains('reveal') && !c.classList.contains('is-in'));
        en.target.style.setProperty('--d', Math.min(group.indexOf(en.target), 5) * 0.07 + 's');
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    items.forEach(el => io.observe(el));
  } else items.forEach(el => el.classList.add('is-in'));

  /* ---- quick-action bar: shown once the first buttons have left the screen, hidden over the contact block ---- */
  const dock = document.querySelector('.dock'), firstActions = document.querySelector('.hero .actions'), contact = document.querySelector('.contact .actions');
  if (dock && firstActions && 'IntersectionObserver' in window) {
    const seen = new Map();
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => seen.set(en.target, en.isIntersecting));
      const past = firstActions.getBoundingClientRect().bottom < 0;
      dock.classList.toggle('is-on', past && !seen.get(contact));
    });
    io.observe(firstActions); io.observe(contact);
  }

  const year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();
})();
