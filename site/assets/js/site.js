/* site.js — the page's interactive and scroll-linked behaviour.
   Each block cites the formula it reproduces. No dependencies. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp01 = function (v) { return Math.min(1, Math.max(0, v)); };
  // framer-motion useTransform(scrollY, [a,b], [c,d], {clamp:true})
  var map = function (v, a, b, c, d) { return c + (d - c) * clamp01((v - a) / (b - a)); };
  // CSS-module class lookup: "styles-module__abc__tab" -> "styles-module__abc__tabActive"
  var sibling = function (el, base, want) {
    var cn = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '';
    var m = cn.match(new RegExp('([\\w-]+-module__[\\w-]+?__)' + base + '(?![\\w-])'));
    return m ? m[1] + want : null;
  };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mobile = function () { return window.matchMedia('(max-width: 767px)').matches; };

  /* ---------- header: .scrolled once scrollY > 1 -------------------------- */
  var header = $('header.header-nav');
  function onHeader() { if (header) header.classList.toggle('scrolled', window.scrollY > 1); }

  /* ---------- nav dropdowns (click to open, hover flag, overlay) ---------- */
  var navGroup = $('.main-nav-container');
  var overlay = $('.main-nav-overlay');
  var navInner = header && header.querySelector('[class*="__navInner"]');
  var parents = $$('.nav--main-nav-parent');
  function setOpen(on) {
    var pairs = [[navInner, 'navInner'], [overlay, 'mainNavOverlay']];
    $$('.main-nav-dropdown-container').forEach(function (d) { pairs.push([d, 'dropdownContainer']); });
    pairs.forEach(function (p) { if (!p[0]) return; var c = sibling(p[0], p[1], 'navOpen'); if (c) p[0].classList.toggle(c, on); });
    if (overlay && !on) overlay.classList.remove('main-nav-fade-in');
  }
  function closeNav() {
    parents.forEach(function (p) { p.classList.remove('main-nav-add-animation', 'main-nav-visible', 'main-nav-stable', 'main-nav-open'); });
    setOpen(false);
  }
  parents.forEach(function (p) {
    var item = p.querySelector('[role="button"]');
    if (!item) return;
    p.addEventListener('mouseenter', function () { if (navGroup) navGroup.classList.add('main-nav-hovering'); });
    p.addEventListener('mouseleave', function () { if (navGroup) navGroup.classList.remove('main-nav-hovering'); });
    var open = function (e) {
      e.preventDefault(); e.stopPropagation();
      if (p.classList.contains('main-nav-open')) { closeNav(); return; }
      parents.forEach(function (o) { o.classList.remove('main-nav-open', 'main-nav-visible', 'main-nav-stable'); });
      setTimeout(function () { p.classList.add('main-nav-open'); setOpen(true); }, 0);
      setTimeout(function () { p.classList.add('main-nav-stable', 'main-nav-visible'); if (overlay) overlay.classList.add('main-nav-fade-in'); }, 100);
    };
    item.addEventListener('click', open);
    item.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') open(e); });
  });
  if (overlay) overlay.addEventListener('click', closeNav);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeNav(); });
  document.addEventListener('click', function (e) { if (header && !header.contains(e.target)) closeNav(); });

  /* ---------- hero: scroll mapping from the hero component ----------------
     q = content top (page y), M = max(0,q-200), F = y>120, J = y>260
     --hero-content-y = map(y,[M,q],[100,0])
     headline  opacity map(y,[400,600],[1,.3]), translateY z
     subtext   opacity spring(1-F)
     form      opacity spring(1-J), translateY spring(-104F)+z
     canvas    --hero-widget-y = W+O+z, opacity map(y,[400,600],[1,.3])
     grid      translateY spring(-104F)
     corners   x = ∓480·intro, y = eo / en (see below)                     */
  var hero = $('section[class*="__heroSection"]');
  var H = null;
  if (hero) {
    H = {
      // the content ref is the div whose module class is exactly "__content"
      content: $$('[class*="__content"]', hero).filter(function (e) { return /__content(\s|$)/.test(e.className); })[0],
      top: hero.querySelector('[class*="__contentTop"]'),
      form: hero.querySelector('[class*="__twoStepFormBlock"]'),
      canvas: hero.querySelector('[class*="__canvasWrapper"]'),
      grid: hero.querySelector('[class*="__widgetGridInner"]'),
      cL: hero.querySelector('[class*="__cornerLeft"]'),
      cR: hero.querySelector('[class*="__cornerRight"]'),
      headline: null, desc: null
    };
    var copy = H.top && H.top.querySelector('[class*="__heroCopy"]');
    if (copy) { H.headline = copy.children[0]; H.desc = copy.children[1]; }
  }
  function Spring(k, c, m, v0) { this.k = k; this.c = c; this.m = m; this.x = v0; this.v = 0; this.t = v0; }
  Spring.prototype.step = function (dt) {
    var n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
    for (var i = 0; i < n; i++) { var a = (-this.k * (this.x - this.t) - this.c * this.v) / this.m; this.v += a * h; this.x += this.v * h; }
    if (Math.abs(this.x - this.t) < 0.01 && Math.abs(this.v) < 0.01) { this.x = this.t; this.v = 0; }
    return this.x;
  };
  var sp = {
    H: new Spring(120, 26, 0.8, 0), K: new Spring(120, 26, 0.8, 1), U: new Spring(480, 52, 0.8, 1),
    X: new Spring(120, 26, 0.8, 0), es: new Spring(120, 26, 0.8, 0)
  };
  var heroQ = null, heroV = 0, heroK = 0, heroX = 0;
  function bezier(p1x, p1y, p2x, p2y) {
    return function (t) {
      var lo = 0, hi = 1, s, x;
      for (var i = 0; i < 30; i++) { s = (lo + hi) / 2; x = 3 * (1 - s) * (1 - s) * s * p1x + 3 * (1 - s) * s * s * p2x + s * s * s; if (x < t) lo = s; else hi = s; }
      s = (lo + hi) / 2; return 3 * (1 - s) * (1 - s) * s * p1y + 3 * (1 - s) * s * s * p2y + s * s * s;
    };
  }
  var ease = bezier(0.22, 0.61, 0.36, 1);
  var t0 = performance.now();
  function intro(dur) { if (reduced) return 0; var t = (performance.now() - t0) / 1000 - 0.15; return 1 - ease(clamp01(t / dur)); }
  function measureHero() {
    if (!H || !H.content) return;
    // measure with transforms neutral, before any scroll
    heroQ = H.content.getBoundingClientRect().top + window.scrollY;
    var hb = H.headline ? H.headline.getBoundingClientRect().bottom : 0;
    heroV = H.canvas ? Math.max(0, H.canvas.getBoundingClientRect().top - hb) : 0;
    var vh = window.innerHeight;
    if (vh >= 950) { heroK = 0; heroX = 0; } else { heroK = 520 * Math.min(1, Math.max(0, (950 - vh) / 200)); heroX = 30; }
  }
  function heroFrame(dt) {
    if (!H || !H.content || mobile()) return false;
    var y = window.scrollY, q = heroQ != null ? heroQ : 1e9, M = Math.max(0, q - 200);
    var B = map(y, M, q, 100, 0), W = B;
    var O = map(y, 100, 400, 0, -Math.max(0, heroV - 120));
    var F = y > 120 ? 1 : 0, J = y > 260 ? 1 : 0;
    var z = heroK <= 0 ? 0 : -Math.min(heroK, Math.max(0, y - 120));
    sp.H.t = -104 * F; sp.K.t = 1 - F; sp.U.t = 1 - J; sp.X.t = -104 * F; sp.es.t = F * heroX;
    var Hy = sp.H.step(dt), K = sp.K.step(dt), U = sp.U.step(dt), Xy = sp.X.step(dt), es = sp.es.step(dt);
    var et = intro(1.2), ea = intro(1.32);
    var op = map(y, 400, 600, 1, 0.3);
    if (H.top) H.top.style.setProperty('--hero-content-y', B + 'px');
    if (H.headline) { H.headline.style.opacity = op; H.headline.style.transform = z ? 'translateY(' + z + 'px)' : 'none'; }
    if (H.desc) H.desc.style.opacity = K;
    if (H.form) { H.form.style.opacity = U; var fy = Xy + z; H.form.style.transform = fy ? 'translateY(' + fy + 'px)' : 'none'; }
    if (H.canvas) { H.canvas.style.setProperty('--hero-widget-y', (W + O + z) + 'px'); H.canvas.style.opacity = op; }
    if (H.grid) H.grid.style.transform = Hy ? 'translateY(' + Hy + 'px)' : 'none';
    var eo = 50 - heroX + (W + O + Hy) * 1.3 + 160 * ea + es;
    var en = (W + O) * 1.3 + 160 * ea + map(y, 100, 400, 0, -100);
    var tx = function (x) { return x ? 'translateX(' + x + 'px) ' : ''; };
    if (H.cL) H.cL.style.transform = tx(-480 * et) + 'translateY(' + eo + 'px)';
    if (H.cR) H.cR.style.transform = tx(480 * et) + 'translateY(' + en + 'px)';
    if (et > 0 || ea > 0) return true;
    for (var k in sp) if (sp[k].x !== sp[k].t) return true;
    return false;
  }

  /* ---------- marquees: logos (Embla AutoScroll .5 ≈ 30px/s), footer text
     (Splide AutoScroll 1.5 ≈ 37px/s). Snapshot transforms are reset and the
     track is doubled so the loop is seamless.                              */
  function Marquee(track, pxps) {
    var self = this;
    this.track = track; this.pxps = pxps; this.x = 0; this.w = 0; this.on = true;
    var kids = Array.prototype.slice.call(track.children);
    kids.forEach(function (k) { var c = k.cloneNode(true); c.setAttribute('aria-hidden', 'true'); track.appendChild(c); });
    Array.prototype.forEach.call(track.children, function (k) { k.style.transform = ''; });
    track.style.transform = 'translate3d(0,0,0)';
    this.measure = function () { self.w = track.scrollWidth / 2; };
    this.measure();
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { self.on = e[0].isIntersecting; }).observe(track.parentElement || track);
  }
  Marquee.prototype.step = function (dt) {
    if (!this.on || reduced || !this.w) return;
    this.x -= this.pxps * dt; if (-this.x >= this.w) this.x += this.w;
    this.track.style.transform = 'translate3d(' + this.x.toFixed(2) + 'px,0,0)';
  };
  var marquees = [];
  var logoTrack = $('[class*="__logoMarquee"] [class*="__container"]');
  if (logoTrack) marquees.push(new Marquee(logoTrack, 30));
  var fList = $('footer .splide__list');
  if (fList && fList.children.length) {
    $$('.splide__slide--clone', fList).forEach(function (c) { c.remove(); });
    for (var i = 0; i < 2; i++) { var s = fList.children[0].cloneNode(true); s.setAttribute('aria-hidden', 'true'); fList.appendChild(s); }
    var fm = new Marquee(fList, 37);
    fm.x = -(fList.children[0].getBoundingClientRect().width + 24) * 0.35;
    marquees.push(fm);
  }

  /* ---------- feature sections: tag rows slide in -------------------------
     a = 500*(1-clamp((r-o)/(r-.8vh))), o = centre of layout, r = vh+h/2
     s += (a-s)*.12 per frame → --row-offset                                */
  var tagSecs = $$('[class*="__tagGrid"]').map(function (ul) {
    return { ul: ul, layout: ul.closest('[class*="__layout"]') || ul.parentElement, a: 500, s: 500 };
  });
  function tagTarget(t) {
    var b = t.layout.getBoundingClientRect(), vh = window.innerHeight, o = b.top + b.height / 2, r = vh + b.height / 2;
    t.a = 500 * (1 - Math.min(1, Math.max(0, (r - o) / (r - 0.8 * vh))));
  }
  tagSecs.forEach(function (t) { tagTarget(t); t.s = t.a; t.ul.style.setProperty('--row-offset', t.s + 'px'); });
  function tagFrame() {
    var busy = false;
    tagSecs.forEach(function (t) {
      tagTarget(t);
      if (Math.abs(t.a - t.s) < 0.1) t.s = t.a; else { t.s += (t.a - t.s) * 0.12; busy = true; }
      t.ul.style.setProperty('--row-offset', t.s + 'px');
    });
    return busy;
  }

  /* ---------- al-bert: layered parallax -----------------------------------
     i = (vh/2 - centre)/(vh/2 + h/2); target = 100·i·k (body ≥ 0)
     k = {body:-.4, s1:-.3, s2:-.6, s3:-.2}; lerp .08 per frame             */
  var bert = (function () {
    var body = document.getElementById('al-bert-body');
    if (!body || !body.ownerSVGElement) return null;
    var svg = body.ownerSVGElement;
    var g = { body: body, s1: document.getElementById('al-bert-sparkle-1'), s2: document.getElementById('al-bert-sparkle-2'), s3: document.getElementById('al-bert-sparkle-3') };
    var k = { body: -0.4, s1: -0.3, s2: -0.6, s3: -0.2 };
    var tgt = { body: 0, s1: 0, s2: 0, s3: 0 }, cur = { body: 0, s1: 0, s2: 0, s3: 0 };
    function target() {
      var b = svg.getBoundingClientRect(), vh = window.innerHeight || 1;
      var i = (vh / 2 - (b.top + b.height / 2)) / (vh / 2 + b.height / 2);
      tgt.body = Math.max(100 * i * k.body, 0); tgt.s1 = 100 * i * k.s1; tgt.s2 = 100 * i * k.s2; tgt.s3 = 100 * i * k.s3;
    }
    target();
    Object.keys(cur).forEach(function (n) { cur[n] = tgt[n]; if (g[n]) g[n].setAttribute('transform', 'translate(0 ' + cur[n].toFixed(2) + ')'); });
    return function () {
      target(); var busy = false;
      Object.keys(cur).forEach(function (n) {
        cur[n] += (tgt[n] - cur[n]) * 0.08;
        if (Math.abs(tgt[n] - cur[n]) > 0.01) busy = true; else cur[n] = tgt[n];
        if (g[n]) g[n].setAttribute('transform', 'translate(0 ' + cur[n].toFixed(2) + ')');
      });
      return busy;
    };
  })();

  /* ---------- use cases: active tab follows the stuck card ---------------- */
  var uc = $('[class*="__useCases"]'), ucSync = null;
  if (uc) {
    var ucRight = uc.querySelector('[class*="__right"]');
    var cards = ucRight ? $$('article', ucRight) : [];
    var tabs = $$('button[aria-label^="Go to use case"]', uc);
    var activeCls = tabs[0] && sibling(tabs[0], 'tab', 'tabActive');
    var rowH = function () { return (ucRight && parseFloat(getComputedStyle(ucRight).getPropertyValue('--title-row-height'))) || 102; };
    ucSync = function () {
      var e = rowH(), t = 0;
      cards.forEach(function (c, s) { if (c.getBoundingClientRect().top <= 90 + (e - 1) * s + 2) t = s; });
      if (activeCls) tabs.forEach(function (b, i) { b.classList.toggle(activeCls, i === t); });
    };
    tabs.forEach(function (b, idx) {
      b.addEventListener('click', function () {
        var r = cards[idx]; if (!r) return;
        if (window.matchMedia('(max-width: 1024px)').matches) { window.scrollTo({ top: r.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' }); return; }
        var s = rowH(), n = ucRight.getBoundingClientRect().top + window.scrollY, o = 0;
        for (var t = 0; t < idx; t++) o += cards[t].offsetHeight;
        window.scrollTo({ top: n + o - (90 + (s - 1) * idx) + 2, behavior: 'smooth' });
      });
    });
  }

  /* ---------- customer stories: logo cards + prev/next -------------------- */
  var storyAll = $$('button[aria-label^="Show "]').filter(function (b) { return / story$/.test(b.getAttribute('aria-label')); });
  var storyBtns = storyAll.filter(function (b) { return b.getAttribute('role') !== 'tab'; });   // desktop logo cards
  var storyDots = storyAll.filter(function (b) { return b.getAttribute('role') === 'tab'; });   // mobile dot tabs
  if (storyBtns.length) {
    var sroot = storyBtns[0].closest('section') || document;
    var slides = $$('article[aria-roledescription="slide"]', sroot);
    var cardOn = sibling(storyBtns[0], 'logoCard', 'logoCardActive');
    var slideOn = slides[0] && sibling(slides[0], 'slide', 'slideActive');
    var cur = 0;
    storyBtns.forEach(function (b, j) { if (cardOn) b.classList.toggle(cardOn, j === cur); });
    // The desktop prev/next group lives only inside the active
    // slide; the snapshot therefore holds a single copy. Move it on change.
    var navGrp = $('[class*="__navButtons"]', sroot);
    var navHostCls = navGrp && navGrp.parentElement && (navGrp.parentElement.className.match(/[\w-]+-module__[\w-]+?__\w+/) || [])[0];
    var navIdx = navGrp ? Array.prototype.indexOf.call(navGrp.parentElement.children, navGrp) : -1;
    var show = function (i) {
      cur = (i + slides.length) % slides.length;
      storyBtns.forEach(function (b, j) { if (cardOn) b.classList.toggle(cardOn, j === cur); });
      storyDots.forEach(function (b, j) { b.setAttribute('aria-selected', j === cur ? 'true' : 'false'); });
      slides.forEach(function (s, j) {
        if (slideOn) s.classList.toggle(slideOn, j === cur);
        s.setAttribute('aria-hidden', j === cur ? 'false' : 'true');
      });
      if (navGrp && navHostCls) {
        var host = slides[cur].querySelector('.' + navHostCls);
        if (host && host !== navGrp.parentElement) host.insertBefore(navGrp, host.children[navIdx] || null);
      }
    };
    storyBtns.forEach(function (b, i) { b.addEventListener('click', function () { show(i); }); });
    storyDots.forEach(function (b, i) { b.addEventListener('click', function () { show(i); }); });
    $$('button[aria-label="Previous"]', sroot).forEach(function (b) { b.addEventListener('click', function () { show(cur - 1); }); });
    $$('button[aria-label="Next"]', sroot).forEach(function (b) { b.addEventListener('click', function () { show(cur + 1); }); });
  }

  /* ---------- copy-to-clipboard terminal ---------------------------------- */
  $$('[class*="__terminalButton"]').forEach(function (btn) {
    var term = btn.parentElement;
    var label = btn.querySelector('[class*="__label"]') || btn.firstElementChild || btn;
    var orig = label.textContent;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var txt = (term.querySelector('[class*="__terminalText"]') || term).textContent;
      var done = function () { label.textContent = 'Copied!'; setTimeout(function () { label.textContent = orig; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { console.error('copy failed'); });
    });
  });

  /* ---------- video: poster → Wistia player (id from the page data) ------- */
  $$('button[aria-label^="Play "]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = btn.parentElement, f = document.createElement('iframe');
      f.src = 'https://fast.wistia.net/embed/iframe/gadywi8nbh?autoPlay=true';
      f.allow = 'autoplay; fullscreen'; f.allowFullscreen = true;
      f.title = btn.getAttribute('aria-label').replace(/^Play /, '');
      f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:inherit';
      if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
      btn.style.visibility = 'hidden'; card.appendChild(f);
    });
  });

  /* ---------- forms: validate, hand off, never post ---------------------- */
  $$('form').forEach(function (form) {
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    var btn = form.querySelector('button, .mktoButton');
    var input = form.querySelector('input[type="email"]');
    if (!btn || !input) return;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.value.trim());
      var err = form.querySelector('.form-error-msg');
      if (err) err.style.display = ok ? 'none' : 'block';
      if (ok) window.open('https://github.com/subheeksh5599/lantern', '_blank', 'noopener');
      else input.focus();
    });
  });

  /* ---------- frame loop -------------------------------------------------- */
  var running = false, lastT = performance.now();
  function frame(now) {
    var raw = Math.max(0, (now - lastT) / 1000), dt = Math.min(0.05, raw); lastT = now;
    var busy = heroFrame(dt);
    if (tagFrame()) busy = true;
    if (bert && bert()) busy = true;
    // marquees are time-based (px/s) so they keep speed even when frames drop
    marquees.forEach(function (m) { m.step(Math.min(0.5, raw)); });
    if (busy || marquees.length) requestAnimationFrame(frame); else running = false;
  }
  function kick() {
    onHeader(); if (ucSync) ucSync();
    if (!running) { running = true; lastT = performance.now(); requestAnimationFrame(frame); }
  }
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', function () { measureHero(); marquees.forEach(function (m) { m.measure(); }); kick(); }, { passive: true });
  window.addEventListener('load', function () { measureHero(); marquees.forEach(function (m) { m.measure(); }); kick(); });
  measureHero(); kick();
})();
