/* Arbah — motion engine
 * Global behaviours (smooth scroll, cursor, header, menu, reveals) run once.
 * Section behaviours are components keyed by [data-arbah="name"] so each
 * Elementor widget re-initialises itself when it is edited or re-rendered.
 */
(function () {
  'use strict';

  var A = (window.Arbah = window.Arbah || {});
  var html = document.documentElement;
  var isRTL = html.dir === 'rtl' || getComputedStyle(html).direction === 'rtl';
  var dirSign = isRTL ? 1 : -1; // direction content flows when "moving forward"
  var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var inEditor = function () {
    return document.body.classList.contains('elementor-editor-active') ||
      !!(window.elementorFrontend && elementorFrontend.isEditMode && elementorFrontend.isEditMode());
  };
  var C = { ink: '#0d0d19', violet: '#6b45f7', lime: '#cbf93f', cream: '#f3f0ea' };

  if (!window.gsap) return;
  gsap.registerPlugin(ScrollTrigger);
  html.classList.add('js');

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  /* ---------------------------------------------------------------- */
  /* Smooth scroll                                                    */
  /* ---------------------------------------------------------------- */
  var lenis = null;
  function smooth() {
    if (reduce || inEditor() || !window.Lenis) return;
    lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    A.lenis = lenis;
    $$('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        if (id.length < 2) return;
        var t = $(id);
        if (!t) return;
        e.preventDefault();
        closeMenu();
        lenis.scrollTo(t, { offset: -20, duration: 1.4 });
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Cursor: lime dot + violet ring + a fading "growth line" trail    */
  /* ---------------------------------------------------------------- */
  function cursor() {
    if (!fine || inEditor() || $('.a-cursor')) return;
    if (window.ArbahConfig && window.ArbahConfig.cursor === false) return;
    var el = document.createElement('div');
    el.className = 'a-cursor is-hidden';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<canvas class="a-cursor__trail"></canvas><div class="a-cursor__ring"><span class="a-cursor__label"></span></div><div class="a-cursor__dot"></div>';
    document.body.appendChild(el);
    document.body.classList.add('has-cursor');

    var dot = $('.a-cursor__dot', el), ring = $('.a-cursor__ring', el), label = $('.a-cursor__label', el);
    var cv = $('canvas', el), ctx = cv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var mx = -200, my = -200, rx = mx, ry = my, pts = [], onLime = false;

    function size() { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    size(); addEventListener('resize', size);

    addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      mx = e.clientX; my = e.clientY;
      el.classList.remove('is-hidden');
      var last = pts[pts.length - 1];
      // Sample sparsely so the trail reads as straight segments, like the brand line.
      if (!last || Math.hypot(mx - last.x, my - last.y) > 26) pts.push({ x: mx, y: my, t: performance.now() });
    }, { passive: true });
    document.addEventListener('mouseleave', function () { el.classList.add('is-hidden'); });
    addEventListener('pointerdown', function () { el.classList.add('is-down'); });
    addEventListener('pointerup', function () { el.classList.remove('is-down'); });

    document.addEventListener('pointerover', function (e) {
      var t = e.target;
      if (!(t instanceof Element)) return;
      var lab = t.closest('[data-cursor]');
      var hov = t.closest('a, button, [data-magnetic], input, textarea, select, label');
      el.classList.toggle('is-label', !!lab);
      el.classList.toggle('is-hover', !lab && !!hov);
      label.textContent = lab ? lab.getAttribute('data-cursor') : '';
      onLime = !!t.closest('.t-lime, .a-marquee__band--a, [data-cursor-dark]');
      el.classList.toggle('on-lime', onLime);
    });

    gsap.ticker.add(function () {
      rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16;
      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0)';

      var now = performance.now();
      while (pts.length && now - pts[0].t > 520) pts.shift();
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      if (pts.length < 1) return;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      var seq = pts.concat([{ x: mx, y: my, t: now }]);
      for (var i = 1; i < seq.length; i++) {
        var a = 1 - (now - seq[i].t) / 520;
        ctx.strokeStyle = onLime ? 'rgba(13,13,25,' + (a * 0.8) + ')' : 'rgba(107,69,247,' + a + ')';
        ctx.lineWidth = 1 + a * 3;
        ctx.beginPath(); ctx.moveTo(seq[i - 1].x, seq[i - 1].y); ctx.lineTo(seq[i].x, seq[i].y); ctx.stroke();
      }
    });
  }

  /* Magnetic pull ----------------------------------------------------- */
  function magnetic(scope) {
    if (!fine) return;
    $$('[data-magnetic]', scope).forEach(function (m) {
      if (m.__mag) return; m.__mag = 1;
      var k = parseFloat(m.getAttribute('data-magnetic')) || 0.35;
      var xTo = gsap.quickTo(m, 'x', { duration: 0.6, ease: 'power3' });
      var yTo = gsap.quickTo(m, 'y', { duration: 0.6, ease: 'power3' });
      m.addEventListener('pointermove', function (e) {
        var r = m.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * k);
        yTo((e.clientY - r.top - r.height / 2) * k);
      });
      m.addEventListener('pointerleave', function () {
        gsap.to(m, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.35)' });
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Header: hide on scroll down, adapt colour to section below       */
  /* ---------------------------------------------------------------- */
  function header() {
    var h = $('.a-header');
    if (!h) return;
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: function (self) {
        var y = self.scroll();
        h.classList.toggle('is-hidden', self.direction === 1 && y > 200 && !html.classList.contains('is-menu-open'));
      }
    });
    $$('.t-cream, .t-lime').forEach(function (s) {
      ScrollTrigger.create({
        trigger: s, start: 'top 50px', end: 'bottom 50px',
        onToggle: function (self) { h.classList.toggle('on-light', self.isActive); }
      });
    });

    var burger = $('.a-burger');
    if (burger) burger.addEventListener('click', function () {
      var open = !html.classList.contains('is-menu-open');
      html.classList.toggle('is-menu-open', open);
      burger.setAttribute('aria-expanded', open);
      if (lenis) open ? lenis.stop() : lenis.start();
    });
    $$('.a-menu a').forEach(function (a) { a.addEventListener('click', closeMenu); });
  }
  function closeMenu() {
    html.classList.remove('is-menu-open');
    var b = $('.a-burger'); if (b) b.setAttribute('aria-expanded', 'false');
    if (lenis) lenis.start();
  }

  /* ---------------------------------------------------------------- */
  /* Text split (by word — Arabic letters must stay joined)           */
  /* ---------------------------------------------------------------- */
  function splitWords(el) {
    if (el.__split) return $$('.w > span', el);
    el.__split = 1;
    el.classList.add('a-split');
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var w = document.createElement('span'); w.className = 'w';
            var i = document.createElement('span'); i.textContent = part;
            w.appendChild(i); frag.appendChild(w);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1 && !n.classList.contains('w')) {
          if (n.matches('.dot, .a-hero__rot, br, img, svg')) {
            if (n.tagName === 'BR') return;
            var w = document.createElement('span'); w.className = 'w';
            var i = document.createElement('span');
            n.parentNode.insertBefore(w, n); i.appendChild(n); w.appendChild(i);
          } else walk(n);
        }
      });
    })(el);
    return $$('.w > span', el);
  }
  A.splitWords = splitWords;

  function reveals(scope) {
    var edit = inEditor();
    $$('[data-split]', scope).forEach(function (el) {
      if (el.__rev) return; el.__rev = 1;
      var words = splitWords(el);
      if (edit || reduce) return;
      gsap.from(words, {
        yPercent: 115, rotate: isRTL ? -4 : 4, duration: 1.1, ease: 'expo.out', stagger: 0.06,
        scrollTrigger: { trigger: el, start: 'top 88%' }
      });
    });
    $$('[data-reveal]', scope).forEach(function (el) {
      if (el.__rev) return; el.__rev = 1;
      if (edit || reduce) { el.classList.remove('a-reveal'); return; }
      el.classList.add('a-reveal');
      gsap.to(el, {
        opacity: 1, y: 0, duration: 1.1, ease: 'expo.out',
        delay: parseFloat(el.getAttribute('data-reveal')) || 0,
        scrollTrigger: { trigger: el, start: 'top 90%' }
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Loader — the brand line draws itself, the dot lands, curtain up  */
  /* ---------------------------------------------------------------- */
  function loader() {
    var L = $('.a-loader');
    var done = function () {
      html.classList.add('is-loaded');
      document.dispatchEvent(new CustomEvent('arbah:ready'));
    };
    if (!L) { done(); return; }
    var seen = false;
    try { seen = sessionStorage.getItem('arbah-seen') === '1'; sessionStorage.setItem('arbah-seen', '1'); } catch (e) {}
    if (seen || reduce || inEditor()) { L.remove(); done(); return; }

    var line = $('polyline', L), dot = $('circle', L), num = $('.a-loader__count', L);
    var len = line.getTotalLength();
    gsap.set(line, { strokeDasharray: len, strokeDashoffset: len });
    gsap.set(dot, { scale: 0, transformOrigin: 'center' });
    var c = { v: 0 };
    gsap.timeline({ onComplete: function () { L.remove(); } })
      .to(line, { strokeDashoffset: 0, duration: 1.3, ease: 'power2.inOut' }, 0)
      .to(c, { v: 100, duration: 1.3, ease: 'power2.inOut', onUpdate: function () { num.textContent = Math.round(c.v); } }, 0)
      .to(dot, { scale: 1, duration: 0.6, ease: 'back.out(3)' }, 1.1)
      .to(dot, { scale: 60, duration: 0.9, ease: 'expo.in' }, 1.65)
      .add(done, 2.35)
      .to(L, { opacity: 0, duration: 0.5 }, 2.4);
  }

  /* ================================================================ */
  /* Components                                                       */
  /* ================================================================ */
  var Comp = {};

  /* Hero: interactive brand dot-grid + rising lime "growth walkers" */
  Comp.hero = function (root) {
    var cv = $('.a-hero__field', root);
    if (cv) heroField(root, cv);

    var title = $('.a-hero__title', root);
    var words = title ? splitWords(title) : [];
    var rot = $('.a-hero__rot', root);
    var card = $('.a-hero__card', root);
    var spark = card && $('polyline', card);
    var num = card && $('[data-count]', card);
    var bits = $$('[data-hero-in]', root);

    if (inEditor() || reduce) return;

    gsap.set(words, { yPercent: 115 });
    gsap.set(bits, { opacity: 0, y: 30 });
    if (spark) { var sl = spark.getTotalLength(); gsap.set(spark, { strokeDasharray: sl, strokeDashoffset: sl }); }

    function intro() {
      var tl = gsap.timeline();
      tl.to(words, { yPercent: 0, duration: 1.3, ease: 'expo.out', stagger: 0.08 })
        .to(bits, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.08 }, 0.35);
      if (spark) tl.to(spark, { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut' }, 0.6);
      if (num) {
        var to = parseFloat(num.getAttribute('data-count')) || 0, o = { v: 0 };
        tl.to(o, { v: to, duration: 1.6, ease: 'power2.out', onUpdate: function () { num.textContent = Math.round(o.v); } }, 0.6);
      }
      if (rot) rotator(rot);
    }
    if (html.classList.contains('is-loaded')) intro();
    else document.addEventListener('arbah:ready', intro, { once: true });

    // Leave the stage: title drifts, grid sinks back.
    gsap.to($('.a-hero__inner', root), {
      yPercent: -18, opacity: 0.2, ease: 'none',
      scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: true }
    });
  };

  function rotator(rot) {
    var items = $$(':scope > span', rot);
    if (items.length < 2) return;
    var i = 0;
    gsap.set(items, { yPercent: 110 }); gsap.set(items[0], { yPercent: 0 });
    setInterval(function () {
      var cur = items[i]; i = (i + 1) % items.length; var nx = items[i];
      gsap.to(cur, { yPercent: -110, duration: 0.8, ease: 'expo.inOut' });
      gsap.fromTo(nx, { yPercent: 110 }, { yPercent: 0, duration: 0.8, ease: 'expo.inOut' });
    }, 2200);
  }

  function heroField(root, cv) {
    var ctx = cv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W, H, gap, cols, rows, lit, mx = -999, my = -999, visible = true, walkers = [], lastSpawn = 0;

    function build() {
      W = cv.clientWidth; H = cv.clientHeight;
      gap = W < 700 ? 24 : 30;
      cols = Math.ceil(W / gap) + 1; rows = Math.ceil(H / gap) + 1;
      cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lit = new Float32Array(cols * rows);
    }
    build();
    addEventListener('resize', build);

    root.addEventListener('pointermove', function (e) {
      var r = cv.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top;
    });
    root.addEventListener('pointerleave', function () { mx = my = -999; });
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(root);

    // A walker climbs the grid like the brand chart: runs flat, bumps, then rises to the right.
    function spawn() {
      walkers.push({ c: Math.floor(Math.random() * cols * 0.5), r: rows - 1 - Math.floor(Math.random() * 3), t: 0 });
    }

    gsap.ticker.add(function (time, dt) {
      if (!visible) return;
      if (!reduce && time - lastSpawn > 0.9 && walkers.length < 5) { spawn(); lastSpawn = time; }
      walkers.forEach(function (w) {
        w.t += dt;
        if (w.t > 55) {
          w.t = 0;
          var roll = Math.random();
          w.c += 1;
          if (roll < 0.55) w.r -= 1; else if (roll < 0.68) w.r += 1;
          if (w.c >= 0 && w.c < cols && w.r >= 0 && w.r < rows) lit[w.r * cols + w.c] = 1;
        }
      });
      walkers = walkers.filter(function (w) { return w.c < cols && w.r >= 0; });

      ctx.clearRect(0, 0, W, H);
      var R = 150, base = gap < 28 ? 1.7 : 2.1;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var k = r * cols + c, x = c * gap + gap / 2, y = r * gap + gap / 2;
          var dx = x - mx, dy = y - my, d = Math.sqrt(dx * dx + dy * dy);
          var p = d < R ? 1 - d / R : 0;
          var l = lit[k];
          if (l > 0) lit[k] = Math.max(0, l - dt / 1800);
          var px = x, py = y;
          if (p > 0) { px += (dx / (d || 1)) * p * 12; py += (dy / (d || 1)) * p * 12; }
          var e = Math.max(p, l);
          ctx.beginPath();
          ctx.arc(px, py, base + e * 2.6, 0, 6.2832);
          ctx.fillStyle = e > 0.08 ? 'rgba(203,249,63,' + (0.35 + e * 0.65) + ')' : 'rgba(107,69,247,0.42)';
          ctx.fill();
        }
      }
    });
  }

  /* Marquee bands that react to scroll speed & direction ---------------- */
  Comp.marquee = function (root) {
    $$('.a-marquee__band', root).forEach(function (band, bi) {
      var track = $('.a-marquee__track', band);
      if (!track) return;
      var guard = 0;
      while (track.scrollWidth < band.clientWidth * 1.1 && guard++ < 12) track.innerHTML += track.innerHTML;
      var clone = track.cloneNode(true); clone.setAttribute('aria-hidden', 'true');
      band.appendChild(clone);
      // The clone sits on the "forward" side, so cycle within [0, 100%·dirSign]; odd bands run it backwards.
      var span = 100 * dirSign, rev = bi % 2 === 1;
      var tw = gsap.fromTo([track, clone], { xPercent: rev ? span : 0 }, { xPercent: rev ? 0 : span, duration: track.scrollWidth / 70, ease: 'none', repeat: -1 });
      tw.totalTime(tw.duration() * 50);
      if (reduce) { tw.pause(); return; }
      ScrollTrigger.create({
        trigger: root, start: 'top bottom', end: 'bottom top',
        onUpdate: function (self) {
          var v = self.getVelocity();
          gsap.to(tw, { timeScale: self.direction * (1 + Math.min(Math.abs(v) / 250, 5)), duration: 0.2, overwrite: true });
          gsap.to(tw, { timeScale: self.direction, duration: 1, delay: 0.2 });
        }
      });
    });
  };

  /* Services: accordion rows + cursor-following preview ----------------- */
  Comp.services = function (root) {
    var rows = $$('.a-svc', root);
    rows.forEach(function (row) {
      var btn = $('.a-svc__row', row);
      btn.addEventListener('click', function () {
        var open = !row.classList.contains('is-open');
        rows.forEach(function (r) { r.classList.remove('is-open'); $('.a-svc__row', r).setAttribute('aria-expanded', 'false'); });
        row.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', open);
        setTimeout(function () { ScrollTrigger.refresh(); }, 750);
      });
    });

    var pv = $('.a-svc-preview', root);
    if (!pv || !fine) return;
    document.body.appendChild(pv); // escape transformed ancestors so position:fixed is viewport-relative
    var arts = $$('.a-svc-preview__art', pv);
    var xTo = gsap.quickTo(pv, 'x', { duration: 0.7, ease: 'power3' });
    var yTo = gsap.quickTo(pv, 'y', { duration: 0.7, ease: 'power3' });
    var rTo = gsap.quickTo(pv, 'rotation', { duration: 0.9, ease: 'power3' });
    var lastX = 0;
    var list = $('.a-svc-list', root);
    list.addEventListener('pointermove', function (e) {
      xTo(e.clientX); yTo(e.clientY);
      rTo(clamp((e.clientX - lastX) * 0.6, -14, 14)); lastX = e.clientX;
    });
    list.addEventListener('pointerenter', function (e) {
      gsap.set(pv, { x: e.clientX, y: e.clientY });
      gsap.to(pv, { opacity: 1, scale: 1, duration: 0.6, ease: 'expo.out' });
    });
    list.addEventListener('pointerleave', function () { gsap.to(pv, { opacity: 0, scale: 0.6, duration: 0.5, ease: 'expo.out' }); });
    rows.forEach(function (row, i) {
      row.addEventListener('pointerenter', function () { arts.forEach(function (a, j) { a.classList.toggle('is-on', j === i); }); });
    });
  };

  /* Process: pinned growth line drawn by scroll, dot travels & bursts --- */
  Comp.process = function (root) {
    var pin = $('.a-process__pin', root), stage = $('.a-process__stage', root);
    var svg = stage && $('svg', stage), path = svg && $('.a-process__path', svg);
    if (!path) return;
    var track = $('.a-process__track', svg);
    var nodes = $$('.a-process__node', stage), now = $('.a-process__step-now', root);
    var trav = $('.a-process__burst', root);
    // Points live in a 1000×300 design space; rebuilt in pixels so stroke dashes stay exact.
    var P = svg.getAttribute('data-points').trim().split(/\s+/).map(function (p) { return p.split(',').map(Number); });
    var fr = nodes.map(function (n) { return parseFloat(n.getAttribute('data-at')) || 0; });
    var len = 1, W = 1, H = 1, last = 0;

    function place() {
      W = stage.clientWidth || 1; H = stage.clientHeight || 1;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      var d = P.map(function (p, i) {
        var x = p[0] / 1000 * W; if (isRTL) x = W - x;
        return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + (p[1] / 300 * H).toFixed(1);
      }).join(' ');
      path.setAttribute('d', d); if (track) track.setAttribute('d', d);
      len = path.getTotalLength();
      path.style.strokeDasharray = len;
      nodes.forEach(function (n, i) {
        var pt = path.getPointAtLength(len * fr[i]);
        n.style.left = pt.x + 'px';
        n.style.top = (pt.y - 20) + 'px';
      });
      setP(last);
    }

    function setP(p) {
      last = p;
      var draw = clamp(p / 0.86, 0, 1);
      path.style.strokeDashoffset = len * (1 - draw);
      var pt = path.getPointAtLength(len * draw);
      var burst = clamp((p - 0.88) / 0.12, 0, 1);
      var cover = Math.hypot(innerWidth, innerHeight) / 20;
      gsap.set(trav, { left: pt.x, top: pt.y, scale: 0.5 + burst * burst * cover });
      var step = 0;
      nodes.forEach(function (n, i) { var on = draw >= fr[i] - 0.001; n.classList.toggle('is-on', on); if (on) step = i + 1; });
      if (now) now.textContent = '0' + Math.max(step, 1);
    }

    var mm = gsap.matchMedia();
    mm.add('(min-width: 861px)', function () {
      place();
      if (inEditor() || reduce) { setP(0.86); return; }
      var st = ScrollTrigger.create({
        trigger: root, start: 'top top', end: '+=260%', pin: pin, scrub: 0.6,
        onUpdate: function (self) { setP(self.progress); },
        onRefresh: place
      });
      return function () { st.kill(); };
    });
  };

  /* Stats: count up + sparkline draw ------------------------------------ */
  Comp.stats = function (root) {
    $$('.a-stat', root).forEach(function (s, i) {
      var n = $('[data-count]', s), line = $('polyline', s);
      var to = parseFloat(n.getAttribute('data-count')) || 0;
      if (inEditor() || reduce) { n.textContent = to; return; }
      var o = { v: 0 }; n.textContent = '0';
      var tl = gsap.timeline({ scrollTrigger: { trigger: s, start: 'top 85%' }, delay: i * 0.1 });
      tl.to(o, { v: to, duration: 2, ease: 'power3.out', onUpdate: function () { n.textContent = Math.round(o.v); } });
      if (line) {
        var l = line.getTotalLength();
        gsap.set(line, { strokeDasharray: l, strokeDashoffset: l });
        tl.to(line, { strokeDashoffset: 0, duration: 1.8, ease: 'power2.inOut' }, 0.1);
      }
    });
  };

  /* Work: horizontal track pinned on desktop ---------------------------- */
  Comp.work = function (root) {
    var pin = $('.a-work__pin', root), track = $('.a-work__track', root);
    if (!track) return;
    $$('.a-card__frame path', root).forEach(function (p) { p.setAttribute('pathLength', '1'); });
    var mm = gsap.matchMedia();
    mm.add('(min-width: 861px)', function () {
      if (inEditor() || reduce) { track.style.overflowX = 'auto'; return function () { track.style.overflowX = ''; }; }
      var dist = function () { return Math.max(0, track.scrollWidth - innerWidth); };
      var cards = $$('.a-card', track);
      var tw = gsap.to(track, {
        x: function () { return isRTL ? dist() : -dist(); },
        ease: 'none',
        scrollTrigger: {
          trigger: root, start: 'top top', end: function () { return '+=' + dist(); },
          pin: pin, scrub: 0.8, invalidateOnRefresh: true,
          onUpdate: function (self) {
            var sk = clamp(self.getVelocity() / -400, -6, 6);
            gsap.to(cards, { rotate: sk * 0.5, duration: 0.5, overwrite: true });
          }
        }
      });
      return function () { tw.scrollTrigger && tw.scrollTrigger.kill(); tw.kill(); gsap.set(track, { x: 0 }); };
    });
  };

  /* Testimonials: arrows + autoplay ------------------------------------- */
  Comp.quotes = function (root) {
    var track = $('.a-quotes__track', root), items = $$('.a-quote', root);
    if (!track || !items.length) return;
    var i = 0, timer;
    function go(n) {
      var max = Math.max(0, items.length - Math.floor(track.parentNode.clientWidth / items[0].offsetWidth));
      i = (n + max + 1) % (max + 1);
      var step = items[0].offsetWidth + parseFloat(getComputedStyle(track).columnGap || 24);
      track.style.transform = 'translateX(' + (i * step * (isRTL ? 1 : -1)) + 'px)';
    }
    function auto() { clearInterval(timer); if (!inEditor()) timer = setInterval(function () { go(i + 1); }, 6000); }
    var prev = $('[data-prev]', root), next = $('[data-next]', root);
    if (prev) prev.addEventListener('click', function () { go(i - 1); auto(); });
    if (next) next.addEventListener('click', function () { go(i + 1); auto(); });
    auto();
  };

  /* CTA: background zigzag drifts with scroll --------------------------- */
  Comp.cta = function (root) {
    var bg = $('.a-cta__bg svg', root);
    if (bg && !reduce && !inEditor()) {
      gsap.fromTo(bg, { yPercent: -10 }, { yPercent: 10, ease: 'none', scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true } });
    }
  };

  /* Page header: reveals only (handled by initScope). */
  Comp.pagehead = function () {};

  /* Footer: giant logo — growth line draws, dot lands ------------------- */
  Comp.footer = function (root) {
    var mark = $('.a-footer__mark', root);
    if (!mark || inEditor() || reduce) return;
    var line = $('.logo-line', mark), dot = $('.logo-dot', mark);
    if (!line) return;
    var l = line.getTotalLength();
    gsap.set(line, { strokeDasharray: l, strokeDashoffset: l });
    gsap.set(dot, { scale: 0, transformOrigin: 'center', transformBox: 'fill-box' });
    gsap.timeline({ scrollTrigger: { trigger: mark, start: 'top 85%' } })
      .to(line, { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut' })
      .to(dot, { scale: 1, duration: 0.7, ease: 'back.out(3)' }, '-=0.25');
  };

  /* ================================================================ */
  /* Boot                                                             */
  /* ================================================================ */
  function initScope(scope) {
    scope = scope || document;
    var roots = $$('[data-arbah]', scope);
    if (scope.matches && scope.matches('[data-arbah]')) roots.unshift(scope);
    roots.forEach(function (el) {
      if (el.__arbah) return; el.__arbah = 1;
      var fn = Comp[el.getAttribute('data-arbah')];
      if (fn) { try { fn(el); } catch (e) { console.error('[arbah]', e); } }
    });
    reveals(scope);
    magnetic(scope);
  }
  A.init = initScope;
  A.components = Comp;

  function boot() {
    smooth();
    cursor();
    header();
    initScope(document);
    loader();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    addEventListener('load', function () { ScrollTrigger.refresh(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Elementor: re-run a widget's component whenever it renders in the editor or frontend.
  window.addEventListener('elementor/frontend/init', function () {
    Object.keys(Comp).forEach(function (k) {
      elementorFrontend.hooks.addAction('frontend/element_ready/arbah-' + k + '.default', function ($scope) {
        initScope($scope[0]);
      });
    });
  });
})();
