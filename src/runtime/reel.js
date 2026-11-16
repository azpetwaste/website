/* The phone with our videos (home page, How it works). Markup: REEL in design/generator/parts.py.
   Speed rules, keep them:
   - Nothing from a video is fetched when the page loads. The first bytes come only when the phone is close to the screen.
   - One video element. Only the clip that is showing is ever fetched.
   - It plays with no sound once half of the phone shows, and stops when it leaves the screen, the tab is hidden or sign up opens.
   - No autoplay for a visitor who asked for less motion or less data, or who is on a slow link. They get the still and a play button.
   Each clip rolls into the next. The files have no sound track. */
(function () {
  'use strict';
  var END = Date.parse('2026-12-01T06:59:59Z'); // the Black Friday sale ends. Same moment as DEAL_END in build/build.mjs
  var doc = document, html = doc.documentElement;
  var calm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function less() {
    var c = navigator.connection;
    return !!((calm && calm.matches) || (c && (c.saveData || /(^|-)[23]g$/.test(c.effectiveType || ''))));
  }

  function start(el) {
    if (el.__reel) return;
    var scr = el.querySelector('.rl-scr'), v = el.querySelector('video'), po = el.querySelector('.rl-po');
    var btn = el.querySelector('.rl-pp'), bars = el.querySelector('.rl-bars');
    if (!scr || !v || !po || !btn || !bars) return;
    el.__reel = true;

    // After the sale the Black Friday clip goes away and the others use the cut with no free month captions.
    var over = Date.now() > END, clips = [];
    [].forEach.call(el.querySelectorAll('.rl-i'), function (a) {
      if (over && a.hasAttribute('data-deal-end')) { a.parentNode.removeChild(a); return; }
      clips.push({ a: a, src: (over && a.getAttribute('data-after')) || a.getAttribute('href'), po: a.getAttribute('data-po'), alt: a.getAttribute('data-alt') || '' });
    });
    if (!clips.length) return;

    var i = 0;          // the clip that is showing
    var want = true;    // false once the visitor taps pause
    var auto = !less(); // may we start on our own
    var seen = false;   // half of the phone is on screen
    var set = false;    // the showing clip has been handed to the video element
    var busy = false;   // sign up is open on top of the page
    var raf = 0;

    bars.innerHTML = clips.map(function () { return '<i><b></b></i>'; }).join('');
    var fills = bars.querySelectorAll('b');
    function paint(part) {
      for (var k = 0; k < fills.length; k++) fills[k].style.transform = 'scaleX(' + (k < i ? 1 : k > i ? 0 : part) + ')';
    }
    function tick() {
      raf = 0;
      if (v.duration) paint(Math.min(1, v.currentTime / v.duration));
      if (!v.paused && !v.ended) raf = requestAnimationFrame(tick);
    }
    function srcset(c) { return c.po + '-360.webp 360w, ' + c.po + '-540.webp 540w'; }
    function show(k) {
      i = (k + clips.length) % clips.length;
      set = false;
      v.pause();
      el.classList.remove('is-live');
      var c = clips[i];
      po.srcset = srcset(c);
      po.src = c.po + '.jpg';
      po.alt = c.alt;
      clips.forEach(function (x, n) { if (n === i) x.a.setAttribute('aria-current', 'true'); else x.a.removeAttribute('aria-current'); });
      paint(0);
    }
    function load() {
      if (set) return;
      set = true;
      v.preload = 'metadata';
      v.src = clips[i].src;
      v.load();
    }
    function sync() {
      var on = want && auto;
      el.classList.toggle('is-play', on);
      btn.setAttribute('aria-label', on ? 'Pause the video' : 'Play the video');
      if (on && seen && !doc.hidden && !busy) {
        load();
        if (v.paused) {
          var p = v.play();
          if (p && p.catch) p.catch(function (err) { if (err && err.name === 'NotAllowedError') { auto = false; sync(); } }); // the phone is saving power: wait for a tap
        }
      } else if (!v.paused) v.pause();
    }

    v.removeAttribute('controls');
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    el.classList.add('is-js');

    v.addEventListener('playing', function () {
      el.classList.add('is-live');
      if (!raf) raf = requestAnimationFrame(tick);
      var next = clips[(i + 1) % clips.length]; // get the next still ready so the change is clean
      if (next !== clips[i] && !next.im) { next.im = new Image(); next.im.sizes = po.sizes; next.im.srcset = srcset(next); }
    });
    v.addEventListener('timeupdate', function () { if (!raf && v.duration) paint(Math.min(1, v.currentTime / v.duration)); });
    v.addEventListener('ended', function () { show(i + 1); sync(); });
    // the file did not come through: back to the still and the play button, and a tap tries again
    v.addEventListener('error', function () {
      if (!set) return;
      set = false;
      want = false;
      el.classList.remove('is-live');
      sync();
    });

    // a tap on the phone: pause or play
    scr.addEventListener('click', function () {
      if (want && auto) want = false;
      else { want = true; auto = true; seen = true; }
      sync();
    });
    // a tap on a clip name: play that clip in the phone. With a modifier key the link opens the file as any link would.
    clips.forEach(function (c, k) {
      c.a.addEventListener('click', function (e) {
        if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        want = true; auto = true; seen = true;
        show(k);
        sync();
        var r = scr.getBoundingClientRect();
        if (r.top < 76 || r.bottom > window.innerHeight) scr.scrollIntoView({ block: 'nearest', behavior: calm && calm.matches ? 'auto' : 'smooth' });
      });
    });

    if ('IntersectionObserver' in window) {
      // close to the screen: fetch the start of the first clip so it plays the moment it shows
      var near = new IntersectionObserver(function (es) {
        if (!es.some(function (e) { return e.isIntersecting; })) return;
        near.disconnect();
        if (auto) load();
      }, { rootMargin: '300px 0px' });
      near.observe(scr);
      new IntersectionObserver(function (es) {
        var e = es[es.length - 1], h = Math.min(e.boundingClientRect.height, window.innerHeight || 9999) || 1;
        seen = e.isIntersecting && e.intersectionRect.height / h >= 0.5;
        sync();
      }, { threshold: [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1] }).observe(scr);
    } else auto = false;

    doc.addEventListener('visibilitychange', sync);
    if (window.MutationObserver) {
      new MutationObserver(function () {
        var b = html.classList.contains('book-open');
        if (b !== busy) { busy = b; sync(); }
      }).observe(html, { attributes: true, attributeFilter: ['class'] });
    }
    paint(0);
    sync();
  }

  function scan() { [].forEach.call(doc.querySelectorAll('[data-reel]'), start); }
  scan();
  doc.addEventListener('DOMContentLoaded', scan);
  window.addEventListener('load', scan);
})();
