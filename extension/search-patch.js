// Sayfanın kendi bağlamında (MAIN world) çalışır ve sitenin liste/arama isteklerine müdahale eder:
//  1) Artan üçgen sıralamasında (sort_by=faceCount) 0 üçgenli bozuk modelleri elemek için min_face_count=1 ekler.
//  2) "Hide AI" açıksa yanıttaki yapay zekâ ile üretilmiş modelleri siteye ulaşmadan çıkarır.
(() => {
  'use strict';

  const HIDE_AI_KEY = 'sfTri_hideAI';
  const hideAI = () => { try { return localStorage.getItem(HIDE_AI_KEY) === '1'; } catch (e) { return false; } };

  function fixUrl(url) {
    try {
      const u = new URL(url, location.href);
      if (u.origin !== location.origin || u.pathname !== '/i/search') return url;
      if (u.searchParams.get('sort_by') !== 'faceCount' || u.searchParams.has('min_face_count')) return url;
      u.searchParams.set('min_face_count', '1');
      return u.toString();
    } catch (e) {
      return url;
    }
  }

  // Model listesi döndüren site içi uç noktalar (/i/search, /i/models?..., vb.)
  function isListUrl(url) {
    try {
      const u = new URL(url, location.href);
      return u.origin === location.origin && u.pathname.startsWith('/i/');
    } catch (e) {
      return false;
    }
  }

  function filterText(text) {
    if (!hideAI() || !text) return text;
    try {
      const j = JSON.parse(text);
      if (!j || !Array.isArray(j.results)) return text;
      const before = j.results.length;
      j.results = j.results.filter((m) => !(m && m.isAiGenerated === true));
      return j.results.length === before ? text : JSON.stringify(j);
    } catch (e) {
      return text;
    }
  }

  // ---- XHR ----
  const proto = XMLHttpRequest.prototype;
  const origOpen = proto.open;
  const textDesc = Object.getOwnPropertyDescriptor(proto, 'responseText');
  const respDesc = Object.getOwnPropertyDescriptor(proto, 'response');

  proto.open = function (method, url, ...rest) {
    if (typeof url === 'string') {
      url = fixUrl(url);
      if (isListUrl(url) && !this.__sfPatched) {
        this.__sfPatched = true;
        let cachedSrc = null, cachedOut = null;
        const transformed = (xhr) => {
          const src = textDesc.get.call(xhr);
          if (xhr.readyState !== 4) return src;
          if (src !== cachedSrc) { cachedSrc = src; cachedOut = filterText(src); }
          return cachedOut;
        };
        Object.defineProperty(this, 'responseText', { configurable: true, get() { return transformed(this); } });
        Object.defineProperty(this, 'response', {
          configurable: true,
          get() {
            const t = this.responseType;
            if (t === '' || t === 'text') return transformed(this);
            if (t === 'json' && this.readyState === 4) {
              const r = respDesc.get.call(this);
              return r ? JSON.parse(filterText(JSON.stringify(r))) : r;
            }
            return respDesc.get.call(this);
          },
        });
      }
    }
    return origOpen.call(this, method, url, ...rest);
  };

  // ---- fetch ----
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === 'string') input = fixUrl(input);
    const url = typeof input === 'string' ? input : input && input.url;
    const p = origFetch.call(this, input, init);
    if (!url || !isListUrl(url) || !hideAI()) return p;
    return p.then(async (res) => {
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.includes('json')) return res;
      const text = filterText(await res.clone().text());
      return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
    });
  };
})();
