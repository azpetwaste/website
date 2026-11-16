/* The header video (home page): one film of a real visit behind the H1. Markup: the hero in design/generator/main.tpl.html.
   Speed rules, keep them:
   - The page loads with a small still picture only. No video bytes until the page has finished loading and the browser is idle.
   - A phone held upright gets the small tall file. Everything else gets the wide file. One file is fetched, never both.
   - It stops when the header is off the screen, the tab is hidden or sign up opens.
   - No video at all for a visitor who asked for less motion or less data, or who is on a slow link. They keep the still.
   - The round button pauses it and plays it (people must be able to stop moving pictures).
   The file has no sound track. It also keeps html.hv-top, which makes the top bar see through while the page is at the very top. */
(function () {
  'use strict';
  var doc = document, html = doc.documentElement;
  var calm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function less() {
    var c = navigator.connection;
    return !!((calm && calm.matches) || (c && (c.saveData || /(^|-)[23]g$/.test(c.effectiveType || ''))));
  }

  // The top bar is see through only while it has not stuck to the top of the window yet.
  function bar() {
    var h = doc.querySelector('.apw .hdr');
    var top = !!doc.querySelector('[data-hv]') && (!h || h.getBoundingClientRect().top > 0.5 || (window.pageYOffset || 0) < 4);
    if (top !== html.classList.contains('hv-top')) html.classList.toggle('hv-top', top);
  }

  function start(el) {
    if (el.__hv) return;
    el.__hv = true;
    var hero = el.parentNode, btn = hero.querySelector('.hv-pp');
    var v = null, user = false, seen = true, busy = html.classList.contains('book-open');

    function paint() {
      if (!btn) return;
      var on = !!v && !v.paused;
      btn.classList.toggle('is-paused', !on);
      btn.setAttribute('aria-label', on ? 'Pause the video' : 'Play the video');
    }
    function sync() {
      if (!v) return;
      if (!user && seen && !doc.hidden && !busy) { var p = v.play(); if (p && p.catch) p.catch(function () { paint(); }); }
      else v.pause();
      paint();
    }
    function load() {
      if (v || less()) return;
      var tall = window.matchMedia && window.matchMedia('(max-width: 699px) and (orientation: portrait)').matches;
      var src = el.getAttribute(tall ? 'data-tall' : 'data-wide');
      if (!src) return;
      v = doc.createElement('video');
      v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('loop', '');
      v.setAttribute('disableremoteplayback', ''); v.setAttribute('aria-hidden', 'true'); v.setAttribute('tabindex', '-1');
      v.preload = 'auto';
      v.addEventListener('playing', function () { el.classList.add('is-live'); if (btn) btn.hidden = false; paint(); });
      v.addEventListener('pause', paint);
      v.addEventListener('error', function () {
        el.classList.remove('is-live');
        if (btn) btn.hidden = true;
        if (v && v.parentNode) v.parentNode.removeChild(v);
      });
      v.src = src;
      el.appendChild(v);
      sync();
    }

    if (btn) btn.addEventListener('click', function () { user = !!v && !v.paused; sync(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { seen = es[es.length - 1].isIntersecting; sync(); }, { threshold: 0.05 }).observe(hero);
    }
    doc.addEventListener('visibilitychange', sync);
    if (window.MutationObserver) {
      new MutationObserver(function () {
        var b = html.classList.contains('book-open');
        if (b !== busy) { busy = b; sync(); }
      }).observe(html, { attributes: true, attributeFilter: ['class'] });
    }
    // Wait for the page to finish, then for a quiet moment, so the film never competes with the first screen.
    function soon() { (window.requestIdleCallback || function (f) { setTimeout(f, 400); })(load, { timeout: 2500 }); }
    if (doc.readyState === 'complete') soon(); else window.addEventListener('load', soon);
  }

  function scan() { [].forEach.call(doc.querySelectorAll('[data-hv]'), start); bar(); }
  scan();
  doc.addEventListener('DOMContentLoaded', scan);
  window.addEventListener('load', scan);
  window.addEventListener('scroll', bar, { passive: true });
  window.addEventListener('resize', bar);
})();
