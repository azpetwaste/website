/* Arizona Pet Waste page runtime.
   Reads the design board templates ({{ holes }}, <sc-if>, <sc-for>, onClick) and keeps the page in sync with state.
   The same code renders pages at build time (jsdom) and runs them in the browser. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HOLE = /\{\{\s*([^}]*?)\s*\}\}/g;
  var BOOL = { disabled: 1, checked: 1, hidden: 1, selected: 1, readonly: 1, required: 1, open: 1, multiple: 1, autofocus: 1, inert: 1, novalidate: 1 };
  var LIVE_INPUT = { text: 1, email: 1, tel: 1, search: 1, url: 1, password: 1, number: 1, range: 1, '': 1 };

  function exprOf(v) {
    HOLE.lastIndex = 0;
    var m = HOLE.exec(v || '');
    return m ? m[1] : '';
  }

  function piecesOf(v) {
    var out = [], last = 0, m;
    HOLE.lastIndex = 0;
    while ((m = HOLE.exec(v))) {
      if (m.index > last) out.push(v.slice(last, m.index));
      out.push({ e: m[1] });
      last = m.index + m[0].length;
    }
    if (last < v.length) out.push(v.slice(last));
    return out;
  }

  function get(scope, path) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    var ks = path.split('.'), v = scope[ks[0]];
    for (var i = 1; i < ks.length && v != null; i++) v = v[ks[i]];
    return v;
  }

  function text(v) { return v == null || v === false || v === true ? '' : String(v); }

  function pathOf(root, node) {
    var path = [];
    while (node !== root) {
      var i = 0, c = node;
      while ((c = c.previousSibling)) i++;
      path.unshift(i);
      node = node.parentNode;
    }
    return path;
  }

  function resolve(root, path) {
    var n = root;
    for (var i = 0; i < path.length; i++) n = n.childNodes[path[i]];
    return n;
  }

  /* Turn a template fragment into a reusable block: a clean prototype plus a list of the live parts. */
  function compile(frag) {
    var parts = [];
    walk(frag);
    for (var i = 0; i < parts.length; i++) { parts[i].path = pathOf(frag, parts[i].node); parts[i].node = null; }
    return { proto: frag, parts: parts };

    function walk(parent) {
      var n = parent.firstChild;
      while (n) {
        var next = n.nextSibling;
        if (n.nodeType === 1) {
          var tag = n.localName;
          if (tag === 'sc-if' || tag === 'sc-for') {
            var doc = n.ownerDocument;
            var marker = doc.createComment(tag === 'sc-if' ? 'if' : 'for');
            var inner = doc.createDocumentFragment();
            while (n.firstChild) inner.appendChild(n.firstChild);
            parts.push({
              type: tag === 'sc-if' ? 'if' : 'for',
              node: marker,
              expr: exprOf(n.getAttribute(tag === 'sc-if' ? 'value' : 'list')),
              as: n.getAttribute('as') || 'item',
              block: compile(inner)
            });
            parent.replaceChild(marker, n);
          } else {
            attrs(n);
            walk(n);
          }
        } else if (n.nodeType === 3 && n.data.indexOf('{{') >= 0) {
          split(n);
        }
        n = next;
      }
    }

    function attrs(el) {
      var list = Array.prototype.slice.call(el.attributes);
      for (var i = 0; i < list.length; i++) {
        var name = list[i].name, val = list[i].value;
        if (name.indexOf('hint-') === 0) { el.removeAttribute(name); continue; }
        if (val.indexOf('{{') < 0) continue;
        el.removeAttribute(name);
        if (name.length > 2 && name.slice(0, 2) === 'on') {
          var ev = name.slice(2).toLowerCase();
          var type = (el.getAttribute('type') || '').toLowerCase();
          if (ev === 'change' && ((el.localName === 'input' && LIVE_INPUT[type]) || el.localName === 'textarea')) ev = 'input';
          if (ev === 'doubleclick') ev = 'dblclick';
          parts.push({ type: 'ev', node: el, ev: ev, expr: exprOf(val) });
        } else {
          parts.push({ type: 'attr', node: el, name: name, pieces: piecesOf(val) });
        }
      }
    }

    function split(t) {
      var s = t.data, doc = t.ownerDocument, parent = t.parentNode, last = 0, m;
      HOLE.lastIndex = 0;
      while ((m = HOLE.exec(s))) {
        if (m.index > last) parent.insertBefore(doc.createTextNode(s.slice(last, m.index)), t);
        var h = doc.createTextNode('');
        parent.insertBefore(h, t);
        parts.push({ type: 'text', node: h, expr: m[1] });
        last = m.index + m[0].length;
      }
      if (last < s.length) parent.insertBefore(doc.createTextNode(s.slice(last)), t);
      parent.removeChild(t);
    }
  }

  function compileString(html, doc) {
    var t = doc.createElement('template');
    t.innerHTML = html;
    return compile(t.content);
  }

  function Instance(block, doc) {
    var frag = doc.importNode(block.proto, true);
    this.doc = doc;
    this.block = block;
    this.frag = frag;
    this.top = Array.prototype.slice.call(frag.childNodes);
    this.nodes = [];
    this.vals = [];
    this.subs = [];
    for (var i = 0; i < block.parts.length; i++) {
      var p = block.parts[i], node = resolve(frag, p.path);
      this.nodes.push(node);
      this.vals.push(undefined);
      this.subs.push(null);
      if (p.type === 'ev') listen(node, p.ev);
    }
  }

  function listen(node, ev) {
    if (!node.__dch) node.__dch = {};
    if (node.__dch.hasOwnProperty(ev)) return;
    node.__dch[ev] = null;
    node.addEventListener(ev, function (e) {
      var f = node.__dch[ev];
      if (typeof f === 'function') f(e);
    });
  }

  Instance.prototype.update = function (scope) {
    var parts = this.block.parts;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], node = this.nodes[i];
      if (p.type === 'text') {
        var t = text(get(scope, p.expr));
        if (t !== this.vals[i]) { node.data = t; this.vals[i] = t; }
      } else if (p.type === 'attr') {
        setAttr(this, i, p, node, scope);
      } else if (p.type === 'ev') {
        node.__dch[p.ev] = get(scope, p.expr);
      } else if (p.type === 'if') {
        var on = !!get(scope, p.expr), sub = this.subs[i];
        if (on) {
          if (sub) sub.update(scope);
          else {
            sub = this.subs[i] = new Instance(p.block, this.doc);
            sub.update(scope);
            node.parentNode.insertBefore(sub.frag, node);
          }
        } else if (sub) {
          sub.remove();
          this.subs[i] = null;
        }
      } else if (p.type === 'for') {
        var list = get(scope, p.expr) || [], items = this.subs[i] || (this.subs[i] = []);
        for (var j = 0; j < list.length; j++) {
          var s2 = Object.create(scope);
          s2[p.as] = list[j];
          if (items[j]) items[j].update(s2);
          else {
            var it = new Instance(p.block, this.doc);
            it.update(s2);
            node.parentNode.insertBefore(it.frag, node);
            items.push(it);
          }
        }
        while (items.length > list.length) items.pop().remove();
      }
    }
  };

  Instance.prototype.remove = function () {
    for (var i = 0; i < this.subs.length; i++) {
      var s = this.subs[i];
      if (!s) continue;
      if (Array.isArray(s)) s.forEach(function (x) { x.remove(); });
      else s.remove();
    }
    this.top.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
  };

  function setAttr(inst, i, p, el, scope) {
    var pieces = p.pieces, name = p.name;
    var single = pieces.length === 1 && typeof pieces[0] !== 'string';
    if (BOOL[name]) {
      var v0 = single ? get(scope, pieces[0].e) : true;
      var on = !!v0 && v0 !== 'false';
      if (on !== inst.vals[i]) {
        inst.vals[i] = on;
        if (on) el.setAttribute(name, ''); else el.removeAttribute(name);
        if (name === 'checked' || name === 'selected' || name === 'disabled' || name === 'open') { try { el[name] = on; } catch (e) { /* not a property here */ } }
      }
      return;
    }
    var out;
    if (single) {
      var v = get(scope, pieces[0].e);
      out = v == null ? null : String(v);
    } else {
      out = '';
      for (var k = 0; k < pieces.length; k++) {
        var pc = pieces[k];
        if (typeof pc === 'string') out += pc;
        else { var pv = get(scope, pc.e); out += pv == null ? '' : String(pv); }
      }
    }
    if (name === 'value' && (el.localName === 'input' || el.localName === 'textarea' || el.localName === 'select')) {
      var live = out == null ? '' : out;
      if (el.value !== live) el.value = live;
      if (live !== inst.vals[i]) { inst.vals[i] = live; el.setAttribute('value', live); }
      return;
    }
    if (out === inst.vals[i]) return;
    inst.vals[i] = out;
    if (out === null) el.removeAttribute(name);
    else el.setAttribute(name, out);
  }

  /* ---------- components ---------- */
  var queue = typeof Promise !== 'undefined' ? function (fn) { Promise.resolve().then(fn); } : function (fn) { setTimeout(fn, 0); };

  class DCLogic {
    constructor(props) {
      this.props = props || {};
      this.state = {};
    }
    setState(patch, cb) {
      if (typeof patch === 'function') patch = patch(this.state, this.props);
      if (patch == null) return;
      if (!this.__prev) this.__prev = this.state;
      this.state = Object.assign({}, this.state, patch);
      if (cb) (this.__cbs || (this.__cbs = [])).push(cb);
      if (this.__mounted && !this.__queued) {
        this.__queued = true;
        var self = this;
        queue(function () { self.__render(); });
      }
    }
    forceUpdate() { this.setState({}); }
    __render() {
      this.__queued = false;
      var prev = this.__prev;
      this.__prev = null;
      this.__inst.update(this.renderVals());
      if (prev && this.componentDidUpdate) this.componentDidUpdate(this.props, prev);
      var cbs = this.__cbs;
      this.__cbs = null;
      if (cbs) cbs.forEach(function (f) { f(); });
    }
  }

  function define(src) {
    /* src is the board's "class Component extends DCLogic { ... }" source */
    return new Function('DCLogic', src + '\nreturn Component;')(DCLogic);
  }

  function mount(el, tpl, Component, props, setup) {
    var doc = el.ownerDocument;
    var block = compileString(tpl, doc);
    var comp = new Component(props || {});
    if (setup) setup(comp);
    var inst = new Instance(block, doc);
    comp.__inst = inst;
    comp.__root = el;
    comp.__prev = null;
    inst.update(comp.renderVals());
    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(inst.frag);
    comp.__mounted = true;
    if (comp.componentDidMount) comp.componentDidMount();
    return comp;
  }

  function renderToString(doc, tpl, Component, props) {
    var block = compileString(tpl, doc);
    var comp = new Component(props || {});
    var inst = new Instance(block, doc);
    inst.update(comp.renderVals());
    var box = doc.createElement('div');
    box.appendChild(inst.frag);
    return box.innerHTML;
  }

  return { DCLogic: DCLogic, define: define, mount: mount, renderToString: renderToString, compileString: compileString, Instance: Instance };
});
