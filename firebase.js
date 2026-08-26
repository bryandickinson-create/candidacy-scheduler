/* firebase.js — tiny Firebase Realtime Database client over REST + SSE.
   No SDK, no build step. Mirrors the pattern used by the lab inventory app. */
(function () {
  'use strict';

  function joinPath(base, path) {
    var p = String(path || '').replace(/^\/+|\/+$/g, '');
    return base + (p ? '/' + p : '') + '.json';
  }

  function FB(url) {
    this.base = String(url || '').replace(/\/+$/, '');
    this._streams = [];
  }

  FB.prototype.ok = function () { return /^https:\/\/[^/]+\.firebasedatabase\.app$|^https:\/\/[^/]+\.firebaseio\.com$/.test(this.base); };

  FB.prototype._req = function (method, path, body) {
    var opts = { method: method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(joinPath(this.base, path), opts).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error('Firebase ' + r.status + ': ' + (t || r.statusText));
        });
      }
      return r.status === 204 ? null : r.json();
    });
  };

  FB.prototype.get = function (path) { return this._req('GET', path); };
  FB.prototype.put = function (path, val) { return this._req('PUT', path, val); };
  FB.prototype.patch = function (path, obj) { return this._req('PATCH', path, obj); };
  FB.prototype.del = function (path) { return this._req('DELETE', path); };

  /* Live stream of a subtree.
     onEvent({type:'put'|'patch', path:'/a/b', data: any})
     onState('open'|'error') */
  FB.prototype.stream = function (path, onEvent, onState) {
    var self = this, url = joinPath(this.base, path), es = null, closed = false, backoff = 1000, timer = null;

    function open() {
      if (closed) return;
      try { es = new EventSource(url); } catch (e) { retry(); return; }

      es.addEventListener('open', function () { backoff = 1000; onState && onState('open'); });

      function handler(type) {
        return function (ev) {
          var msg;
          try { msg = JSON.parse(ev.data); } catch (e) { return; }
          if (!msg) return;
          onEvent({ type: type, path: msg.path, data: msg.data });
        };
      }
      es.addEventListener('put', handler('put'));
      es.addEventListener('patch', handler('patch'));
      es.addEventListener('keep-alive', function () {});
      es.addEventListener('cancel', function () { onState && onState('error'); });
      es.addEventListener('auth_revoked', function () { onState && onState('error'); });

      es.onerror = function () {
        onState && onState('error');
        try { es.close(); } catch (e) {}
        retry();
      };
    }

    function retry() {
      if (closed) return;
      clearTimeout(timer);
      timer = setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, 30000);
    }

    open();
    var handle = {
      close: function () {
        closed = true; clearTimeout(timer);
        if (es) { try { es.close(); } catch (e) {} }
      }
    };
    this._streams.push(handle);
    return handle;
  };

  FB.prototype.closeAll = function () {
    this._streams.forEach(function (s) { s.close(); });
    this._streams = [];
  };

  /* Apply an SSE event onto a plain object tree rooted at the streamed path. */
  FB.applyEvent = function (root, ev) {
    var parts = String(ev.path || '/').split('/').filter(Boolean);
    if (!parts.length) {
      if (ev.type === 'put') return ev.data === null ? {} : ev.data;
      // patch at root
      var r = root || {};
      Object.keys(ev.data || {}).forEach(function (k) {
        if (ev.data[k] === null) delete r[k]; else r[k] = ev.data[k];
      });
      return r;
    }
    var node = root || {};
    var cur = node;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] === null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    var last = parts[parts.length - 1];
    if (ev.type === 'put') {
      if (ev.data === null) delete cur[last];
      else cur[last] = ev.data;
    } else {
      if (typeof cur[last] !== 'object' || cur[last] === null) cur[last] = {};
      Object.keys(ev.data || {}).forEach(function (k) {
        if (ev.data[k] === null) delete cur[last][k]; else cur[last][k] = ev.data[k];
      });
    }
    return node;
  };

  window.FB = FB;
})();
