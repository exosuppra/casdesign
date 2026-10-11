/* Cas'Design — motion & interactions */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  // Without GSAP the page stays a plain, fully readable document.
  if (!window.gsap || !window.ScrollTrigger || !window.CD_META) { root.className = 'no-js'; return; }
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  // The page opens on the drawing board: always start from the top.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  scrollTo(0, 0);

  const META = window.CD_META;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const SET = matchMedia('(max-width: 900px)').matches ? 'm' : 'd';   // image set: light frames on small screens
  const clamp = gsap.utils.clamp;
  const lerp = (a, b, t) => a + (b - a) * t;
  const norm = (v, a, b) => clamp(0, 1, (v - a) / (b - a));
  const smooth = t => t * t * (3 - 2 * t);
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const CLEAR = 'transform,opacity,visibility';

  /* ------------------------------------------------------------------ */
  /* Text splitting (words / chars wrapped in overflow masks)            */
  /* ------------------------------------------------------------------ */
  function split(el, mode = 'words') {
    if (mode === 'chars' && !el.hasAttribute('aria-hidden')) el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/([ \n\t]+)/).forEach(part => {
            if (!part) return;
            if (/^[ \n\t]+$/.test(part)) { frag.append(' '); return; }
            const w = document.createElement('span'); w.className = 'w';
            const wi = document.createElement('span'); wi.className = 'wi';
            if (mode === 'chars') {
              [...part].forEach(ch => { const c = document.createElement('span'); c.className = 'c'; c.textContent = ch; wi.append(c); });
            } else wi.textContent = part;
            w.append(wi); frag.append(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && !n.matches('svg, img, br, .nosplit')) walk(n);
      });
    };
    walk(el);
    return $$(mode === 'chars' ? '.c' : '.wi', el);
  }

  /* ------------------------------------------------------------------ */
  /* Smooth scroll                                                       */
  /* ------------------------------------------------------------------ */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }
  const go = target => {
    if (lenis) lenis.scrollTo(target, { duration: 1.5 });
    else if (typeof target === 'number') scrollTo({ top: target });
    else target.scrollIntoView();
  };

  /* ------------------------------------------------------------------ */
  /* Image sequences                                                     */
  /* Frames are plain <img>; a small window of decoded bitmaps follows   */
  /* the playhead so scrubbing never waits on a decode. `onready(i)`     */
  /* fires when frame i arrives or is decoded, so the frame on screen    */
  /* can be redrawn if it was missing or approximated a moment earlier.  */
  /* ------------------------------------------------------------------ */
  class Seq {
    constructor(dir, from, to) {
      this.dir = dir; this.from = from; this.n = to - from;
      this.img = new Array(this.n); this.bmp = new Array(this.n); this.ok = new Uint8Array(this.n); this.busy = new Uint8Array(this.n);
      this.onready = null;
    }
    load(i) {
      const k = i - this.from;
      if (k < 0 || k >= this.n) return Promise.resolve();
      if (!this.img[k]) {
        const im = new Image(); im.decoding = 'async';
        im.p = new Promise(r => { im.onload = () => { this.ok[k] = 1; r(); this.onready && this.onready(i); }; im.onerror = r; });
        im.src = `assets/seq/${SET}/${this.dir}/${pad(i, 3)}.webp`;
        this.img[k] = im;
      }
      return this.img[k].p;
    }
    async loadAll() {
      const queue = Array.from({ length: this.n }, (_, k) => k + this.from);
      const worker = async () => { while (queue.length) await this.load(queue.shift()); };
      await Promise.all(Array.from({ length: 6 }, worker));
    }
    warm(i) {
      if (!window.createImageBitmap) return;
      const c = i - this.from;
      for (let k = 0; k < this.n; k++) {
        const d = k - c;
        if (d >= -5 && d <= 9) {
          if (this.ok[k] && !this.bmp[k] && !this.busy[k]) {
            this.busy[k] = 1;
            createImageBitmap(this.img[k]).then(b => { this.bmp[k] = b; this.busy[k] = 0; this.onready && this.onready(k + this.from); }, () => { this.busy[k] = 0; });
          }
        } else if (this.bmp[k] && Math.abs(d) > 16) { this.bmp[k].close(); this.bmp[k] = null; }
      }
    }
    get(i) {
      const k = clamp(0, this.n - 1, i - this.from);
      if (this.bmp[k]) return this.bmp[k];
      if (this.ok[k]) return this.img[k];
      for (let d = 1; d < this.n; d++) {
        if (this.ok[k - d]) return this.img[k - d];
        if (this.ok[k + d]) return this.img[k + d];
      }
      return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Hero — the plan tilts into a volume, then takes its materials       */
  /* ------------------------------------------------------------------ */
  const H = META.hero, N = H.n;
  const pin = $('.hero__pin'), film = $('[data-film="hero"]'), cv = $('canvas', film), ctx = cv.getContext('2d');
  const sandEl = $('.hero__sand'), scan = $('.hero__scan'), gridEl = $('.hero__grid'), needle = $('.hero__needle');
  const sLine = new Seq('hero/line', H.line[0], H.line[1]);
  const sClay = new Seq('hero/clay', H.clay[0], H.clay[1]);
  const sColor = new Seq('hero/color', H.color[0], H.color[1]);
  const W1 = [0.27, 0.43], W2 = [0.57, 0.73];   // scroll windows of the two wipes
  const LEAN = 0.16;                             // how much the wipe line leans, as a fraction of the viewport height
  const hero = { p: 0, dims: 0, fi: 0 };
  let view = { vw: 1, vh: 1, base: 1, mobile: false };

  const dims = $$('.dim', film).map(g => ({ g, a: H.anchors[g.dataset.a], b: H.anchors[g.dataset.b], off: +g.dataset.off, line: $('.dim__l', g), ticks: $('.dim__t', g), text: $('text', g) }));
  const tags = $$('.tag', film).map(el => ({ el, pts: H.anchors[el.dataset.anchor] }));
  const rail = $$('[data-rail]');

  function measureHero() {
    const vw = pin.clientWidth, vh = pin.clientHeight, mobile = vw < 900;
    view = { vw, vh, mobile, base: mobile ? vw * 1.5 : Math.min(vw * 1.04, vh * 1.92) };
    film.style.width = view.base + 'px';
  }
  // where the film sits for a given progress: beside the headline, then beside the first caption while it is
  // still a flat plan (a full rectangle), then centre stage once it has tilted into a diamond that frees the corners
  function filmRect(p) {
    const { vw, vh, base, mobile } = view;
    const enter = smooth(norm(p, 0, 0.13)), grow = smooth(norm(p, 0.17, 0.44)), push = smooth(norm(p, 0.74, 1));
    const k = mobile ? lerp(0.86, 1, enter) * lerp(1, 1.08, push) : lerp(lerp(0.7, 0.8, enter), 1, grow) * lerp(1, 1.06, push);
    const cx = mobile ? 0.5 : lerp(lerp(0.68, 0.585, enter), 0.515, grow);
    const cy = mobile ? lerp(0.25, 0.42, enter) : lerp(0.5, 0.475, grow);
    const w = base * k, h = w * 9 / 16;
    return { x: vw * cx - w / 2, y: vh * cy - h / 2, w, h, k };
  }

  function drawHero() {
    const p = hero.p, fi = hero.fi = Math.round(p * (N - 1)), { vw, vh } = view;
    const r = filmRect(p);
    film.style.transform = `translate3d(${r.x}px,${r.y}px,0) scale(${r.k})`;

    const w1 = norm(p, W1[0], W1[1]), w2 = norm(p, W2[0], W2[1]);
    let under, over = null, w = 0;
    if (w1 > 0 && w1 < 1) { under = sLine; over = sClay; w = w1; }
    else if (w2 > 0 && w2 < 1) { under = sClay; over = sColor; w = w2; }
    else under = w2 >= 1 ? sColor : w1 >= 1 ? sClay : sLine;
    under.warm(fi); over && over.warm(fi);
    if (w1 > 0.6 && w2 <= 0) sClay.warm(fi); else if (w2 > 0.6) sColor.warm(fi);

    const CW = cv.width, CH = cv.height;
    const X = lerp(-0.14, 1.14, w) * vw, top = X + LEAN * vh / 2, bot = X - LEAN * vh / 2;   // wipe line, viewport px
    ctx.clearRect(0, 0, CW, CH);
    const a = under.get(fi);
    if (a) ctx.drawImage(a, 0, 0, CW, CH);
    if (over) {
      const b = over.get(fi), sx = CW / r.w, sy = CH / r.h;
      const yt = (0 - r.y) * sy, yb = (vh - r.y) * sy, xt = (top - r.x) * sx, xb = (bot - r.x) * sx;
      ctx.save(); ctx.beginPath();
      ctx.moveTo(-1e5, yt); ctx.lineTo(xt, yt); ctx.lineTo(xb, yb); ctx.lineTo(-1e5, yb); ctx.closePath(); ctx.clip();
      ctx.clearRect(0, 0, CW, CH);
      if (b) ctx.drawImage(b, 0, 0, CW, CH);
      ctx.restore();
    }

    // light backdrop: revealed by the second wipe, then stays
    if (w2 <= 0) sandEl.style.visibility = 'hidden';
    else {
      sandEl.style.visibility = 'visible';
      sandEl.style.clipPath = w2 >= 1 ? 'none' : `polygon(0 0, ${top}px 0, ${bot}px 100%, 0 100%)`;
    }
    scan.style.opacity = over ? Math.min(1, w * 14, (1 - w) * 14) : 0;
    if (over) scan.style.transform = `translate3d(${X}px,0,0) rotate(${Math.atan(LEAN)}rad)`;
    pin.classList.toggle('is-light', w2 > 0.34);
    pin.classList.toggle('is-light-r', w2 > 0.9);
    gridEl.style.opacity = 1 - norm(p, 0.3, 0.6) * 0.75;

    const stage = p < (W1[0] + W1[1]) / 2 ? 0 : p < (W2[0] + W2[1]) / 2 ? 1 : 2;
    rail.forEach((el, i) => el.classList.toggle('is-on', i === stage));
    needle.style.transform = `rotate(${lerp(0, -50, smooth(norm(p, 0.1, 1)))}deg)`;   // same orbit as the camera

    // dimension lines follow the drawing while it is still a plan
    const dv = hero.dims * (1 - norm(p, 0.1, 0.19));
    dims.forEach(d => {
      d.g.style.opacity = dv;
      if (dv <= 0) return;
      const ax = d.a[fi][0] * 1920, ay = d.a[fi][1] * 1080, bx = d.b[fi][0] * 1920, by = d.b[fi][1] * 1080;
      const len = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / len * d.off, ny = (bx - ax) / len * d.off;
      const x1 = ax + nx, y1 = ay + ny, x2 = bx + nx, y2 = by + ny, tx = nx / Math.abs(d.off) * 9, ty = ny / Math.abs(d.off) * 9;
      d.line.setAttribute('d', `M${x1},${y1}L${x2},${y2}`);
      d.ticks.setAttribute('d', `M${ax + nx * .3},${ay + ny * .3}L${x1 + tx},${y1 + ty}M${bx + nx * .3},${by + ny * .3}L${x2 + tx},${y2 + ty}`);
      let ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      if (ang > 90 || ang < -90) ang += 180;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      d.text.setAttribute('transform', `translate(${mx},${my}) rotate(${ang})`);
    });
    // call-outs stick to the model once it has its materials
    tags.forEach((t, i) => {
      t.el.classList.toggle('is-on', p > 0.8 + i * 0.035);
      t.el.style.left = t.pts[fi][0] * 100 + '%'; t.el.style.top = t.pts[fi][1] * 100 + '%';
    });
  }

  [sLine, sClay, sColor].forEach(s => { s.onready = i => { if (i === hero.fi) drawHero(); }; });

  const heroWords = split($('.hero__title'));
  const stages = $$('.stage');
  measureHero();

  const heroTl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: '.hero', start: 'top top', end: () => '+=' + innerHeight * (view.mobile ? 3.6 : 4.4),
      pin, scrub: reduce ? true : 0.8, anticipatePin: 1, invalidateOnRefresh: true, refreshPriority: 3,
      onRefresh: () => { measureHero(); drawHero(); }
    }
  });
  heroTl
    .to(hero, { p: 1, duration: 1, onUpdate: drawHero }, 0)
    .to('.hero__intro', { autoAlpha: 0, yPercent: -7, duration: 0.07, ease: 'power1.in' }, 0.015)
    .to('.hero__scroll', { autoAlpha: 0, duration: 0.03 }, 0.01)
    .fromTo(stages[0], { autoAlpha: 0, y: 34 }, { autoAlpha: 1, y: 0, duration: 0.06, ease: 'power2.out' }, 0.11)
    .to(stages[0], { autoAlpha: 0, y: -24, duration: 0.05, ease: 'power1.in' }, 0.29)
    .fromTo(stages[1], { autoAlpha: 0, y: 34 }, { autoAlpha: 1, y: 0, duration: 0.06, ease: 'power2.out' }, 0.4)
    .to(stages[1], { autoAlpha: 0, y: -24, duration: 0.05, ease: 'power1.in' }, 0.585)
    .fromTo(stages[2], { autoAlpha: 0, y: 34 }, { autoAlpha: 1, y: 0, duration: 0.06, ease: 'power2.out' }, 0.72);

  function heroIntro() {
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.fromTo(film, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 2, ease: 'expo.inOut', clearProps: 'clipPath' }, 0)
      .from(heroWords, { yPercent: 150, rotate: 4, duration: 1.4, stagger: 0.07 }, 0.25)
      .from('.hero__eyebrow', { y: 20, autoAlpha: 0, duration: 1 }, 0.4)
      .from(['.hero__lead', '.hero__cta > *'], { y: 26, autoAlpha: 0, duration: 1.1, stagger: 0.08 }, 0.8)
      .to(hero, { dims: 1, duration: 1.2, ease: 'power2.out', onUpdate: drawHero }, 1.3)
      .from(['.hero__rail', '.hero__compass', '.hero__meta', '.hero__scroll'], { autoAlpha: 0, duration: 1, stagger: 0.1 }, 1.4)
      .from('.nav', { yPercent: -130, duration: 1.2, clearProps: 'all' }, 0.7)
      .add(() => lenis && lenis.start(), 1.2);
    return tl;
  }

  /* ------------------------------------------------------------------ */
  /* Loader — waits for the first drawings, then hands over to the hero  */
  /* ------------------------------------------------------------------ */
  (function loader() {
    const el = $('.loader'), pct = $('.loader__pct b'), status = $('.loader__status'), house = $('.loader__draw');
    const words = ['Relevé', 'Esquisse', 'Cotes', 'Volume', 'Lumière'];
    const o = { v: 0 };
    house.setAttribute('pathLength', 1);
    gsap.set(house, { strokeDasharray: 1, strokeDashoffset: 1 });
    gsap.set(el, { clipPath: 'inset(0% 0% 0% 0%)' });

    const first = sLine.load(H.line[0]).then(() => {
      const im = sLine.img[0];
      if (im.naturalWidth) { cv.width = im.naturalWidth; cv.height = im.naturalHeight; }
      drawHero();
    });
    const lead = Promise.all(Array.from({ length: 14 }, (_, i) => sLine.load(H.line[0] + i)));
    const ready = Promise.race([Promise.all([document.fonts ? document.fonts.ready : 0, first, lead]), new Promise(r => setTimeout(r, 6000))]);
    // everything else streams in behind, in the order the scroll will need it
    ready.then(() => sLine.loadAll()).then(() => sClay.loadAll()).then(() => sColor.loadAll()).then(() => sSun.loadAll());

    gsap.to(o, {
      v: 100, duration: reduce ? 0.5 : 2.4, ease: 'power2.inOut',
      onUpdate() {
        pct.textContent = Math.round(o.v);
        house.style.strokeDashoffset = 1 - o.v / 100;
        status.textContent = words[Math.min(words.length - 1, Math.floor(o.v / 100 * words.length))];
      },
      onComplete: () => ready.then(() => {
        ScrollTrigger.refresh();
        gsap.timeline()
          .to(['.loader__top', '.loader__mid', '.loader__bottom'], { y: -50, autoAlpha: 0, duration: 0.55, ease: 'power3.in', stagger: 0.06 }, 0.1)
          .to(el, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.1, ease: 'expo.inOut' }, 0.45)
          .add(heroIntro(), 0.7)
          .set(el, { display: 'none' }, 1.6);
      })
    });
  })();

  /* ------------------------------------------------------------------ */
  /* Generic reveals                                                     */
  /* ------------------------------------------------------------------ */
  $$('[data-reveal="words"]').forEach(el => {
    gsap.from(split(el), {
      yPercent: 150, duration: 1.15, ease: 'expo.out', stagger: 0.05,
      scrollTrigger: { trigger: el, start: 'top 88%', once: true }
    });
  });
  $$('[data-reveal="fade"]').forEach(el => {
    gsap.from(el, {
      y: 36, autoAlpha: 0, duration: 1.15, ease: 'power3.out', clearProps: CLEAR,
      scrollTrigger: { trigger: el, start: 'top 90%', once: true }
    });
  });
  $$('[data-reveal="img"]').forEach(el => {
    gsap.fromTo(el, { clipPath: 'inset(100% 0% 0% 0% round 26px)' }, { clipPath: 'inset(0% 0% 0% 0% round 26px)', duration: 1.5, ease: 'expo.out', clearProps: 'clipPath', scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
  });
  $$('.label').forEach(el => {
    gsap.from(el, { x: -24, autoAlpha: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true } });
  });

  /* ------------------------------------------------------------------ */
  /* Manifesto — words light up as you read                              */
  /* ------------------------------------------------------------------ */
  (function manifesto() {
    const el = $('[data-scrub-words]');
    split(el);
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 55%', scrub: 0.6 } });
    $$('.wi', el).forEach((it, i) => tl.fromTo(it, { opacity: 0.13 }, { opacity: 1, duration: 2.4, ease: 'none' }, i));
  })();

  /* ------------------------------------------------------------------ */
  /* Prestations — list with a drawing that follows the cursor           */
  /* ------------------------------------------------------------------ */
  (function services() {
    const list = $('.plist'), rows = $$('.prow'), box = $('.pfloat'), inner = $('.pfloat__in');
    gsap.from(rows, { y: 56, autoAlpha: 0, duration: 1.1, ease: 'power3.out', stagger: 0.07, clearProps: CLEAR, scrollTrigger: { trigger: list, start: 'top 86%', once: true } });
    if (!fine) return;

    let imgs = [];
    const load = () => { if (!imgs.length) imgs = rows.map(r => { const im = new Image(); im.alt = ''; im.dataset.bg = r.dataset.bg; im.src = r.dataset.img; inner.append(im); return im; }); };
    ScrollTrigger.create({ trigger: '.svcs', start: 'top bottom', once: true, onEnter: load });
    const fx = gsap.quickTo(box, 'x', { duration: 0.55, ease: 'power3' });
    const fy = gsap.quickTo(box, 'y', { duration: 0.55, ease: 'power3' });
    const rot = gsap.quickTo(box, 'rotation', { duration: 0.8, ease: 'power3' });
    let px = 0, calm;
    gsap.set(box, { scale: 0.6 });
    list.addEventListener('pointermove', e => { fx(e.clientX); fy(e.clientY); rot(clamp(-12, 12, (e.clientX - px) * 0.5)); px = e.clientX; clearTimeout(calm); calm = setTimeout(() => rot(0), 110); });
    list.addEventListener('pointerenter', e => { load(); px = e.clientX; gsap.set(box, { x: e.clientX, y: e.clientY }); gsap.to(box, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'power3.out' }); });
    list.addEventListener('pointerleave', () => { gsap.to(box, { autoAlpha: 0, scale: 0.6, duration: 0.4, ease: 'power3.in' }); rot(0); });
    rows.forEach((r, i) => r.addEventListener('pointerenter', () => imgs.forEach((im, j) => im.classList.toggle('is-on', i === j))));
  })();

  /* ------------------------------------------------------------------ */
  /* Planches — the dossier laid out on the table, read sideways         */
  /* ------------------------------------------------------------------ */
  (function sheets() {
    const sheetEls = $$('.sheet'), idx = $('.sheets__idx'), track = $('.sheets__track');
    gsap.from(sheetEls, { y: 120, autoAlpha: 0, rotation: 5, duration: 1.4, ease: 'expo.out', stagger: 0.09, scrollTrigger: { trigger: '.sheets', start: 'top 55%', once: true } });
    const mm = gsap.matchMedia();
    mm.add('(min-width: 901px)', () => {
      const dist = () => Math.max(0, track.scrollWidth - innerWidth);
      const tw = gsap.to(track, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: { trigger: '.sheets', start: 'top top', end: () => '+=' + dist(), pin: '.sheets__pin', scrub: reduce ? true : 0.6, anticipatePin: 1, invalidateOnRefresh: true, refreshPriority: 2 }
      });
      sheetEls.forEach((s, i) => {
        ScrollTrigger.create({ trigger: s, containerAnimation: tw, start: 'left 55%', end: 'right 55%', onToggle: st => { if (st.isActive) idx.textContent = pad(i + 1); } });
      });
    });
  })();

  /* ------------------------------------------------------------------ */
  /* Comparer — drag between the drawing and the render                  */
  /* ------------------------------------------------------------------ */
  (function compare() {
    const box = $('.cmp__box'), handle = $('.cmp__handle'), layer = $('.cmp__layer--b'), btns = $$('.cmp__switch button');
    const state = { x: 50 };
    const set = v => { state.x = clamp(2, 98, v); box.style.setProperty('--x', state.x + '%'); handle.setAttribute('aria-valuenow', Math.round(state.x)); };
    const fromEvent = e => { const r = box.getBoundingClientRect(); set((e.clientX - r.left) / r.width * 100); };
    let drag = false;
    box.addEventListener('pointerdown', e => { if (e.target.closest('.cmp__switch')) return; drag = true; box.setPointerCapture(e.pointerId); gsap.killTweensOf(state); fromEvent(e); });
    box.addEventListener('pointermove', e => { if (drag) fromEvent(e); });
    ['pointerup', 'pointercancel'].forEach(t => box.addEventListener(t, () => { drag = false; }));
    handle.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') set(state.x - 4); else if (e.key === 'ArrowRight') set(state.x + 4); else return;
      e.preventDefault();
    });
    btns.forEach(b => b.addEventListener('click', () => {
      btns.forEach(o => o.classList.toggle('is-on', o === b));
      layer.classList.toggle('is-color', b.dataset.mode === 'color');
    }));
    // a nudge on arrival shows the box can be dragged
    if (!reduce) gsap.timeline({ scrollTrigger: { trigger: box, start: 'top 60%', once: true } })
      .fromTo(state, { x: 96 }, { x: 34, duration: 1.5, ease: 'expo.inOut', onUpdate: () => set(state.x) })
      .to(state, { x: 50, duration: 1.1, ease: 'expo.out', onUpdate: () => set(state.x) });
  })();

  /* ------------------------------------------------------------------ */
  /* Lumière — a day of sun, scrubbed                                    */
  /* ------------------------------------------------------------------ */
  const S = META.sun, sSun = new Seq('sun', 0, S.n);
  const sunPin = $('.sun__pin'), sunFilm = $('[data-film="sun"]'), sunCv = $('canvas', sunFilm), sunCtx = sunCv.getContext('2d');
  const sky = $('.sun__sky'), hh = $('.sun__h'), mmEl = $('.sun__m'), phase = $('.sun__phase'), disc = $('.sun__disc'), arcOn = $('.sun__arc--on');
  const sun = { p: 0, fi: 0 };
  sSun.onready = i => { if (i === sun.fi) drawSun(); };
  // backdrop colours through the day (solar hour → top, bottom)
  const SKY = [
    [6.0, [241, 235, 225], [241, 235, 225]], [6.7, [214, 203, 214], [243, 208, 178]], [8.6, [236, 232, 226], [244, 236, 224]],
    [12.5, [246, 242, 234], [236, 228, 214]], [16.4, [243, 229, 205], [238, 210, 172]], [17.75, [224, 160, 126], [241, 188, 142]],
    [18.15, [106, 84, 110], [190, 124, 100]], [18.45, [44, 46, 66], [70, 62, 84]], [18.75, [27, 32, 44], [27, 32, 44]]
  ];
  const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`;
  arcOn.setAttribute('pathLength', 1); arcOn.style.strokeDasharray = 1;

  function measureSun() {
    const vw = sunPin.clientWidth, vh = sunPin.clientHeight, mobile = vw < 900;
    const w = mobile ? vw * 1.6 : Math.min(vw * 0.98, vh * 1.8), h = w * 9 / 16;
    sunFilm.style.width = w + 'px';
    sunFilm.style.transform = `translate3d(${vw * (mobile ? 0.5 : 0.47) - w / 2}px,${vh * (mobile ? 0.56 : 0.48) - h / 2}px,0)`;
  }
  function drawSun() {
    const fr = sun.p * (S.n - 1), i = sun.fi = Math.round(fr), g = S.frames[Math.min(S.n - 1, Math.floor(fr) + 1)], f0 = S.frames[Math.floor(fr)];
    const hour = lerp(f0.h, g.h, fr - Math.floor(fr));
    sSun.warm(i);
    const im = sSun.get(i);
    if (im) {
      if (sunCv.width !== (im.naturalWidth || im.width)) { sunCv.width = im.naturalWidth || im.width; sunCv.height = im.naturalHeight || im.height; }
      sunCtx.clearRect(0, 0, sunCv.width, sunCv.height); sunCtx.drawImage(im, 0, 0, sunCv.width, sunCv.height);
    }
    let k = SKY.findIndex(s => s[0] > hour); if (k < 0) k = SKY.length - 1; k = Math.max(1, k);
    const t = norm(hour, SKY[k - 1][0], SKY[k][0]);
    sky.style.background = `linear-gradient(${mix(SKY[k - 1][1], SKY[k][1], t)}, ${mix(SKY[k - 1][2], SKY[k][2], t)})`;
    sunPin.classList.toggle('is-night', hour > 18.1);
    sunPin.classList.toggle('is-warm', hour > 16.6 && hour <= 18.1);   // terracotta accents vanish on the sunset backdrop

    const civil = hour + 1.6, H2 = Math.floor(civil), M = Math.floor((civil - H2) * 60);   // solar → clock time (CEST, 5.9° E)
    hh.textContent = pad(H2); mmEl.textContent = pad(M);
    phase.textContent = hour < 9.9 ? 'Matin · ombres longues' : hour < 13.4 ? 'Midi · lumière haute' : hour < 17.15 ? 'Après-midi · lumière rasante' : hour < 18.05 ? 'Coucher du soleil' : 'Crépuscule · la maison s’allume';
    const d = (hour - 6) / 12, a = Math.PI * (1 - d);
    disc.setAttribute('cx', 120 + 106 * Math.cos(a)); disc.setAttribute('cy', 118 - 106 * Math.sin(a));
    disc.style.opacity = clamp(0, 1, 1 - (d - 1) * 30);
    arcOn.style.strokeDashoffset = 1 - clamp(0, 1, d);
  }
  measureSun();
  gsap.to(sun, {
    p: 1, ease: 'none', onUpdate: drawSun,
    scrollTrigger: {
      trigger: '.sun', start: 'top top', end: () => '+=' + innerHeight * 3.2, pin: sunPin, scrub: reduce ? true : 0.7,
      anticipatePin: 1, invalidateOnRefresh: true, refreshPriority: 1, onRefresh: () => { measureSun(); drawSun(); }
    }
  });
  // a visitor who scrolls fast gets here before the preload queue does: fetch the sequence as the section approaches
  ScrollTrigger.create({ trigger: '.cmp', start: 'top bottom', once: true, onEnter: () => sSun.loadAll() });
  drawSun();

  /* ------------------------------------------------------------------ */
  /* Démarche — a line drawn through the five steps, pencil in hand      */
  /* ------------------------------------------------------------------ */
  (function process() {
    const map = $('.proc__map'), svg = $('.proc__svg'), pen = $('.proc__pen');
    const paths = $$('path', svg), route = $('.proc__path'), reveal = $('.proc__reveal');
    const steps = $$('.step'), dots = $$('.step__dot');
    const state = { p: 0 };
    let len = 0, marks = [];

    function build() {
      const r0 = map.getBoundingClientRect(), W = r0.width, Ht = r0.height;
      svg.setAttribute('viewBox', `0 0 ${W} ${Ht}`);
      const pts = dots.map(d => { const r = d.getBoundingClientRect(); return [r.left - r0.left + r.width / 2, r.top - r0.top + r.height / 2]; });
      const sway = Math.min(120, W * 0.12);
      const all = [[pts[0][0], -6], ...pts, [pts[pts.length - 1][0], Ht + 6]];
      let d = `M${all[0][0]},${all[0][1]}`;
      for (let i = 1; i < all.length; i++) {
        const [x0, y0] = all[i - 1], [x1, y1] = all[i], my = (y0 + y1) / 2, s = (i % 2 ? 1 : -1) * (i === 1 || i === all.length - 1 ? 0 : sway);
        d += ` C${x0 + s},${my} ${x1 + s},${my} ${x1},${y1}`;
      }
      paths.forEach(p => p.setAttribute('d', d));
      len = route.getTotalLength();
      reveal.style.strokeDasharray = len;
      marks = pts.map(([, y]) => {
        let a = 0, b = len;
        for (let k = 0; k < 22; k++) { const m = (a + b) / 2; if (route.getPointAtLength(m).y < y) a = m; else b = m; }
        return a;
      });
      render();
    }
    function render() {
      if (!len) return;
      const l = len * state.p, pt = route.getPointAtLength(l);
      reveal.style.strokeDashoffset = len - l;
      pen.style.transform = `translate3d(${pt.x}px,${pt.y}px,0)`;
      pen.style.opacity = state.p > 0.004 && state.p < 0.996 ? 1 : 0;
      steps.forEach((s, i) => s.classList.toggle('is-on', l >= marks[i] - 6));
    }
    build();
    ScrollTrigger.addEventListener('refresh', build);
    gsap.to(state, { p: 1, ease: 'none', onUpdate: render, scrollTrigger: { trigger: map, start: 'top 62%', end: 'bottom 60%', scrub: 0.5 } });
  })();

  /* ------------------------------------------------------------------ */
  /* Marquee (speed and direction follow the scroll)                     */
  /* ------------------------------------------------------------------ */
  const marquees = $$('[data-marquee]').map(el => {
    const track = el.firstElementChild, group = track.firstElementChild;
    const m = { track, x: 0, half: 1, speed: +(el.dataset.speed || 60), visible: false };
    m.build = () => {
      $$('.marquee__group', track).slice(1).forEach(n => n.remove());
      m.half = group.offsetWidth || 1;
      const copies = Math.ceil(innerWidth * 1.3 / m.half) + 1;
      for (let i = 0; i < copies; i++) { const c = group.cloneNode(true); c.setAttribute('aria-hidden', 'true'); track.append(c); }
    };
    m.build();
    new IntersectionObserver(([e]) => { m.visible = e.isIntersecting; }, { rootMargin: '120px' }).observe(el);
    return m;
  });
  if (!reduce) {
    let boost = 1, way = 1;
    gsap.ticker.add((t, dt) => {
      const v = lenis ? lenis.velocity : 0;
      if (Math.abs(v) > 0.6) way = v < 0 ? -1 : 1;
      boost = lerp(boost, way * (1 + Math.min(Math.abs(v) * 0.11, 6)), 0.08);
      const step = Math.min(dt, 60) / 1000;
      marquees.forEach(m => {
        if (!m.visible) return;
        m.x -= m.speed * boost * step;
        if (m.x <= -m.half) m.x += m.half; else if (m.x > 0) m.x -= m.half;
        m.track.style.transform = `translate3d(${m.x}px,0,0)`;
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* FAQ, contact, footer                                                */
  /* ------------------------------------------------------------------ */
  $$('.qa').forEach(d => d.addEventListener('toggle', () => {
    if (d.open && !reduce) gsap.from($('p', d), { height: 0, autoAlpha: 0, duration: 0.6, ease: 'power3.out', clearProps: 'height,opacity,visibility' });
    ScrollTrigger.refresh();
  }));

  gsap.from(['.cta__hand', '.cta__actions > *', '.cta__info'], { y: 30, autoAlpha: 0, duration: 1.1, ease: 'power3.out', stagger: 0.1, scrollTrigger: { trigger: '.cta__in', start: 'top 62%', once: true } });
  gsap.from('.cta__card', { y: 120, rotation: 14, autoAlpha: 0, duration: 1.6, ease: 'expo.out', scrollTrigger: { trigger: '.cta__in', start: 'top 60%', once: true } });
  if (fine && !reduce) $$('[data-tilt]').forEach(el => {
    gsap.set(el, { transformPerspective: 1300 });
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.7, ease: 'power3' });
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.7, ease: 'power3' });
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * 12); rx(((e.clientY - r.top) / r.height - 0.5) * -10);
    });
    el.addEventListener('pointerleave', () => { rx(0); ry(0); });
  });

  const word = $('.foot__word'), foot = $('.foot');
  const wordChars = split(word, 'chars');
  const fitWord = () => {
    word.style.fontSize = '';
    const cs = getComputedStyle(foot), avail = foot.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    word.style.fontSize = parseFloat(getComputedStyle(word).fontSize) * avail / word.offsetWidth + 'px';
  };
  fitWord();
  gsap.from(wordChars, { yPercent: 130, duration: 1.3, ease: 'expo.out', stagger: 0.04, scrollTrigger: { trigger: word, start: 'top 96%', once: true } });
  gsap.from('.foot__top > *', { y: 30, autoAlpha: 0, duration: 1, ease: 'power3.out', stagger: 0.07, scrollTrigger: { trigger: foot, start: 'top 82%', once: true } });

  /* ------------------------------------------------------------------ */
  /* Chrome: progress, drafting HUD, nav, menu, crosshair, magnets       */
  /* ------------------------------------------------------------------ */
  const nav = $('.nav'), menu = $('.menu'), burger = $('.nav__burger');
  const bar = $('.progress__bar'), hud = $('.hud'), hudX = $('.hud__x'), hudY = $('.hud__y'), hudSec = $('.hud__sec');
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: s => {
      bar.style.transform = `scaleX(${s.progress})`;
      if (!menu.classList.contains('is-open')) nav.classList.toggle('is-hidden', s.direction === 1 && s.scroll() > innerHeight * 0.5);
    }
  });
  ScrollTrigger.create({ trigger: '.manifesto', start: 'top 70%', endTrigger: foot, end: 'top bottom', toggleClass: { targets: hud, className: 'is-on' } });
  $$('[data-sec]').forEach(sec => ScrollTrigger.create({ trigger: sec, start: 'top 55%', end: 'bottom 55%', onToggle: s => { if (s.isActive) hudSec.textContent = sec.dataset.sec; } }));
  $$('.nav__links a').forEach(a => {
    const target = $(a.getAttribute('href'));
    if (target) ScrollTrigger.create({ trigger: target, start: 'top 50%', end: 'bottom 50%', onToggle: s => a.classList.toggle('is-active', s.isActive) });
  });

  const setMenu = open => {
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    if (lenis) open ? lenis.stop() : lenis.start();
  };
  burger.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
  addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    const target = id === '#top' ? 0 : $(id);
    if (target === null) return;
    e.preventDefault();
    if (menu.classList.contains('is-open')) setMenu(false);
    go(target);
  });

  if (fine && !reduce) {
    const cur = $('.cursor'), lab = $('.cursor__label');
    const cx = gsap.quickTo(cur, 'x', { duration: 0.3, ease: 'power3' });
    const cy = gsap.quickTo(cur, 'y', { duration: 0.3, ease: 'power3' });
    addEventListener('pointermove', e => {
      cx(e.clientX); cy(e.clientY); cur.classList.add('is-active');
      hudX.textContent = pad(Math.round(e.clientX), 4); hudY.textContent = pad(Math.round(innerHeight - e.clientY), 4);
    }, { passive: true });
    document.addEventListener('pointerover', e => {
      const l = e.target.closest('[data-cursor]'), k = e.target.closest('a, button, summary');
      cur.classList.toggle('is-label', !!l && !k);
      cur.classList.toggle('is-link', !!k);
      if (l) lab.textContent = l.dataset.cursor;
    });
    root.addEventListener('pointerleave', () => cur.classList.remove('is-active'));

    $$('[data-magnetic]').forEach(el => {
      const x = gsap.quickTo(el, 'x', { duration: 0.9, ease: 'elastic.out(1, 0.45)' });
      const y = gsap.quickTo(el, 'y', { duration: 0.9, ease: 'elastic.out(1, 0.45)' });
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        x((e.clientX - r.left - r.width / 2) * 0.32); y((e.clientY - r.top - r.height / 2) * 0.32);
      });
      el.addEventListener('pointerleave', () => { x(0); y(0); });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Keep measurements honest                                            */
  /* ------------------------------------------------------------------ */
  const relayout = () => { marquees.forEach(m => m.build()); fitWord(); ScrollTrigger.refresh(); };
  if (document.fonts) document.fonts.ready.then(relayout);
  addEventListener('load', () => ScrollTrigger.refresh());
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { marquees.forEach(m => m.build()); fitWord(); }, 200); });
})();
