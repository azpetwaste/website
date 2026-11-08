/* Arizona Pet Waste site glue: starts the page, keeps the look in sync, runs sign in, the sign up sheet and Stripe. */
(function () {
  'use strict';
  var APW = window.APW = window.APW || {};
  var root = document.documentElement;
  var boards = APW.boards || (APW.boards = {});
  var DESK = '(min-width: 1100px)';

  APW.live = false;
  APW.cfg = Object.assign({ firstVisitFrom: '2026-11-20', leadDays: 2 }, APW.cfg || {});
  APW.comps = [];
  APW.track = APW.track || function () { };

  /* ---------- look ---------- */
  function storedTheme() {
    try { return localStorage.getItem('apw.theme') === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; }
  }
  APW.setTheme = function (dark) {
    try { localStorage.setItem('apw.theme', dark ? 'dark' : 'light'); } catch (e) { }
    root.classList.toggle('dark', !!dark);
    APW.comps.forEach(function (c) { c.setState({ dark: !!dark }); });
  };
  function wire(comp) {
    var orig = comp._themeVals;
    if (orig) {
      comp._themeVals = function () {
        var v = orig.call(comp);
        v.toggleTheme = function () { APW.setTheme(!comp.state.dark); };
        return v;
      };
    }
    APW.comps.push(comp);
  }

  /* ---------- server calls ---------- */
  function fail(status, message, code) {
    var e = new Error(message);
    e.status = status;
    e.code = code;
    return e;
  }
  APW.msg = function (e) {
    if (!e) return 'Something went wrong. Please try again.';
    if (e.name === 'TypeError') return 'We could not reach our server. Check your connection and try again.';
    return e.message || 'Something went wrong. Please try again.';
  };
  async function call(method, path, body, auth) {
    var headers = { 'content-type': 'application/json' };
    if (auth) {
      var t = await APW.auth.token();
      if (!t) throw fail(401, 'Please sign in again.');
      headers.authorization = 'Bearer ' + t;
    }
    var r = await fetch(path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined });
    var data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    if (!r.ok) throw fail(r.status, (data && data.error) || 'Something went wrong. Please try again.', data && data.code);
    return data || {};
  }
  APW.post = function (path, body, auth) { return call('POST', path, body, auth); };
  APW.get = function (path, auth) { return call('GET', path, null, auth); };

  /* ---------- sign in with an email code (Supabase Auth) ---------- */
  var KEY = 'apw.session';
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { } }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  async function gotrue(path, body, token) {
    var c = APW.cfg;
    var r = await fetch(c.supabaseUrl + '/auth/v1' + path, {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json', apikey: c.supabaseAnonKey },
        token ? { authorization: 'Bearer ' + token } : /^eyJ/.test(c.supabaseAnonKey || '') ? { authorization: 'Bearer ' + c.supabaseAnonKey } : {}),
      body: JSON.stringify(body || {})
    });
    var data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    if (!r.ok) {
      var raw = (data && (data.msg || data.error_description || data.message || data.error)) || '';
      var m = /after (\d+) seconds/.exec(raw);
      if (r.status === 429 || m) throw fail(429, m ? 'Please wait ' + m[1] + ' seconds, then try again.' : 'Too many tries. Please wait a minute and try again.');
      throw fail(r.status, 'That did not work. Please check your email address and try again.');
    }
    return data || {};
  }
  function keep(d) {
    var s = {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
      email: d.user && d.user.email,
      user_id: d.user && d.user.id
    };
    save(s);
    return s;
  }
  APW.auth = {
    session: function () { var s = load(); return s && s.refresh_token ? s : null; },
    sendCode: function (email) { return gotrue('/otp', { email: email, create_user: true }); },
    verifyCode: async function (email, code) { return keep(await gotrue('/verify', { type: 'email', email: email, token: code })); },
    token: async function () {
      var s = load();
      if (!s || !s.refresh_token) return null;
      if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
      try { return keep(await gotrue('/token?grant_type=refresh_token', { refresh_token: s.refresh_token })).access_token; }
      catch (e) { if (e.status === 400 || e.status === 401) APW.auth.signOut(); return null; }
    },
    signOut: function () {
      var s = load();
      try { localStorage.removeItem(KEY); } catch (e) { }
      if (s && s.access_token && APW.live) gotrue('/logout', {}, s.access_token).catch(function () { });
    }
  };

  /* ---------- Stripe (loaded only when checkout is live) ---------- */
  APW.stripe = function () {
    if (APW._stripe) return APW._stripe;
    APW._stripe = new Promise(function (resolve, reject) {
      function ready() { resolve(window.Stripe(APW.cfg.stripeKey)); }
      if (window.Stripe) return ready();
      var s = document.createElement('script');
      s.src = 'https://js.stripe.com/endive/stripe.js';
      s.async = true;
      s.onload = ready;
      s.onerror = function () { APW._stripe = null; reject(fail(0, 'The card form did not load. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
    return APW._stripe;
  };

  /* ---------- config from the server (missing on a static preview = demo mode) ---------- */
  function config() {
    var timeout = new Promise(function (resolve) { setTimeout(resolve, 3000, null); });
    var req = fetch('/api/config', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    return Promise.race([req, timeout]).then(function (c) {
      if (c && typeof c === 'object') {
        Object.keys(c).forEach(function (k) { if (c[k] !== null && c[k] !== undefined) APW.cfg[k] = c[k]; });
        APW.live = !!(c.live && c.supabaseUrl && c.supabaseAnonKey && c.stripeKey);
      }
      // On the real domain, never pretend: until the keys are in, sign up says to call or text.
      APW.closed = !APW.live && /(^|\.)arizonapetwaste\.com$/.test(location.hostname);
      root.classList.toggle('demo', !APW.live && !APW.closed);
      return APW.live;
    });
  }

  /* ---------- sign up sheet ---------- */
  function desk() { return window.matchMedia && window.matchMedia(DESK).matches; }
  function intent() {
    var p = APW.page && APW.page.state;
    var o = {};
    if (!p) return o;
    if (p.plan) o.plan = p.plan;
    if (p.dogs) o.dogs = p.dogs;
    if (p.zip && /^\d{5}$/.test(p.zip)) o.zip = p.zip;
    return o;
  }
  APW.openBook = function (o) {
    var b = APW.book;
    var dock = document.getElementById('book-dock');
    if (!b) { location.href = '/book/'; return; }
    b.open(o || {});
    if (!dock) return;
    if (APW.page && APW.page.state && APW.page.state.menu) APW.page.setState({ menu: false });
    if (desk()) {
      if (dock) {
        dock.classList.remove('pulse');
        void dock.offsetWidth;
        dock.classList.add('pulse');
      }
    } else if (!root.classList.contains('book-open')) {
      root.classList.add('book-open');
      try { history.pushState({ apwBook: 1 }, ''); APW._pushed = true; } catch (e) { APW._pushed = false; }
    }
    setTimeout(function () {
      var h = dock && dock.querySelector('.bh1');
      if (h) { try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
    }, 60);
  };
  APW.closeBook = function () {
    if (!root.classList.contains('book-open')) return;
    root.classList.remove('book-open');
    if (APW._pushed) { APW._pushed = false; history.back(); }
  };
  window.addEventListener('popstate', function () {
    if (root.classList.contains('book-open')) { root.classList.remove('book-open'); APW._pushed = false; }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && root.classList.contains('book-open')) APW.closeBook();
  });
  // same page links (#prices) scroll here, even when a <base> tag points somewhere else
  document.addEventListener('click', function (e) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    var el = id && document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ block: 'start' });
    if (el.tabIndex < 0 && !/^(A|BUTTON|INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
    try { el.focus({ preventScroll: true }); } catch (err) { }
    try { history.replaceState(history.state, '', '#' + id); } catch (err) { }
  });
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || !APW.book || !document.getElementById('book-dock') || a.closest('#book-dock')) return;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.origin === location.origin && /\/book\/(index\.html)?$/.test(u.pathname)) {
      e.preventDefault();
      APW.openBook(intent());
    }
  });

  /* ---------- start ---------- */
  function cls(name) {
    var def = boards[name];
    if (!def) return null;
    if (!def.Component) def.Component = def.C(window.DC.DCLogic);
    return def;
  }
  function mount(el, name, props, dock) {
    var def = cls(name);
    if (!def || !el) return null;
    var tpl = dock ? def.tpl.replace(/<(\/?)h1(?=[\s>])/g, '<$1h2') : def.tpl;
    return window.DC.mount(el, tpl, def.Component, props, wire);
  }
  function boot() {
    var theme = storedTheme();
    root.classList.toggle('dark', theme === 'dark');
    var app = document.getElementById('app');
    var name = app && app.getAttribute('data-board');
    var needsCfg = name === 'book' || name === 'account';
    var cfgReady = config();
    if (!needsCfg && name) APW.page = mount(app, name, { theme: theme, mode: 'page' });
    var dock = document.getElementById('book-dock');
    cfgReady.then(function (live) {
      if (needsCfg) {
        APW.page = mount(app, name, { theme: theme, mode: 'page' });
        if (name === 'book') APW.book = APW.page;
      }
      if (dock) APW.book = mount(dock, 'book', { theme: theme, mode: 'dock' }, true);
      if (live && (dock || name === 'book')) {
        var idle = window.requestIdleCallback || function (f) { setTimeout(f, 1500); };
        idle(function () { APW.stripe().catch(function () { }); });
      }
      if (location.hash === '#start' && dock) APW.openBook(intent());
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
