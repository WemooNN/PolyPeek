(() => {
  'use strict';

  // v4 kayıtları (faces/verts/ai) aynen kullanılabilir -> güncellemede önbellek sıfırlanmaz
  const CACHE_KEY = 'sfTriCache_v4';
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 gün
  const CACHE_MAX = 3000;                    // localStorage yazımı küçük ve hızlı kalsın
  const MAX_CONCURRENT = 6;

  // ---- Önbellek (localStorage) ----
  // Sadece gereken alanlar tutulur; süresi dolanlar ve fazlası açılışta atılır.
  let cache = {};
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
    const now = Date.now();
    const fresh = Object.entries(raw)
      .filter(([, d]) => d && d.faces != null && now - d.t < CACHE_TTL)
      .sort((a, b) => b[1].t - a[1].t)
      .slice(0, CACHE_MAX);
    for (const [uid, d] of fresh) cache[uid] = { faces: d.faces, verts: d.verts, ai: !!d.ai, t: d.t };
  } catch (e) { cache = {}; }
  try {
    for (const k of ['sfTriCache_v1', 'sfTriCache_v2', 'sfTriCache_v3', 'sfTri_hideAIGuess']) localStorage.removeItem(k);
  } catch (e) { /* eski sürüm */ }

  let saveTimer = null;
  function saveCache() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const write = () => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* dolu olabilir */ } };
      // Kaydırma sırasında değil, tarayıcı boştayken yaz
      (window.requestIdleCallback || ((f) => setTimeout(f, 0)))(write, { timeout: 5000 });
    }, 3000);
  }

  // ---- Stil ----
  // Performans: backdrop-filter / filter: drop-shadow yok (her kaydırma karesinde
  // tüm rozetleri yeniden çizdiriyordu). Rozet arkası düz, yarı saydam koyu renk.
  const style = document.createElement('style');
  style.textContent = `
    .card-model__thumbnail.sf-rel { position: relative; }
    .sf-chips {
      position: absolute; top: 8px; left: 8px; z-index: 5;
      display: flex; gap: 6px; align-items: center;
      pointer-events: none;
    }
    /* Sol üstte "Staff Pick" vb. ikon varsa rozetleri yanına kaydır */
    .card-model__thumbnail:has(.card__main__corner.--top-left > *) .sf-chips { left: 40px; }
    .sf-chip {
      --c: #9aa4b2;
      position: relative; overflow: hidden;
      display: inline-flex; align-items: center; gap: 6px;
      height: 24px; padding: 0 9px 0 7px; border-radius: 999px;
      font: 600 12px/1 Inter, "Segoe UI", system-ui, sans-serif;
      font-variant-numeric: tabular-nums; letter-spacing: .1px;
      color: #f4f6fa;
      background: rgba(14, 16, 22, .82);
      border: 1px solid rgba(255, 255, 255, .14);
      box-shadow: 0 2px 8px rgba(0, 0, 0, .35);
      pointer-events: auto; cursor: default; white-space: nowrap;
      animation: sf-pop .22s ease-out both;
    }
    @keyframes sf-pop { from { opacity: 0; transform: translateY(-3px); } }

    /* Üçgen rozeti */
    .sf-tri .sf-ico { width: 11px; height: 11px; flex: none; color: var(--c); }
    .sf-tri .sf-more {
      max-width: 0; opacity: 0; overflow: hidden;
      color: rgba(244, 246, 250, .65); font-weight: 500;
      transition: max-width .3s ease, opacity .25s ease;
    }
    .card-model:hover .sf-tri .sf-more { max-width: 120px; opacity: 1; }
    .sf-tri .sf-meter {
      position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
      background: var(--c);
    }
    .sf-tri.low   { --c: #34d399; }
    .sf-tri.mid   { --c: #facc15; }
    .sf-tri.high  { --c: #fb923c; }
    .sf-tri.ultra { --c: #f43f5e; }

    /* Yükleniyor */
    .sf-tri.loading { width: 58px; opacity: .55; animation: none; }

    /* AI rozeti (yükleyenin işaretlediği modeller) */
    .sf-ai {
      border: 1px solid transparent;
      background:
        linear-gradient(rgba(24, 14, 40, .9), rgba(24, 14, 40, .9)) padding-box,
        linear-gradient(135deg, #8b5cf6, #ec4899, #f59e0b) border-box;
    }
    .sf-ai .sf-ico { width: 12px; height: 12px; flex: none; color: #f0abfc; }
    .sf-ai .sf-ai-text { color: #fbe7ff; font-weight: 700; }
  `;
  document.head.appendChild(style);

  const TRI_SVG = '<svg class="sf-ico" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11.2 10.5H.8Z" fill="currentColor"/></svg>';
  const AI_SVG = '<svg class="sf-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l2.2 6.3L20.5 10.5 14.2 12.7 12 19l-2.2-6.3L3.5 10.5l6.3-2.2zM19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z"/></svg>';

  // ---- Yardımcılar ----
  function formatCount(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return String(n);
  }
  function levelClass(n) {
    if (n < 100e3) return 'low';
    if (n < 500e3) return 'mid';
    if (n < 1e6) return 'high';
    return 'ultra';
  }

  function render(wrap, data) {
    const tri = wrap.querySelector('.sf-tri');
    tri.classList.remove('loading');
    if (!data || data.faces == null) {
      tri.innerHTML = TRI_SVG + '<span>?</span>';
      tri.title = 'Üçgen sayısı alınamadı';
      return;
    }
    tri.classList.add(levelClass(data.faces));
    tri.innerHTML =
      TRI_SVG +
      `<span>${formatCount(data.faces)}</span>` +
      `<span class="sf-more">· ${formatCount(data.verts ?? 0)} vtx</span>` +
      '<i class="sf-meter"></i>';
    tri.title =
      `Üçgen: ${data.faces.toLocaleString('tr-TR')}\n` +
      `Vertex: ${(data.verts ?? 0).toLocaleString('tr-TR')}`;

    if (data.ai && !wrap.querySelector('.sf-ai')) {
      const ai = document.createElement('span');
      ai.className = 'sf-chip sf-ai';
      ai.title = 'Marked as AI-generated by the uploader';
      ai.innerHTML = AI_SVG + '<span class="sf-ai-text">AI</span>';
      wrap.appendChild(ai);
    }
  }

  // ---- İstek kuyruğu ----
  // LIFO: en son ekrana giren kart önce yüklenir; hızlı kaydırınca geride
  // kalan kartlar ekrandakileri bekletmez.
  const queue = [];
  const pending = new Map(); // uid -> Promise
  let active = 0;

  function fetchInfo(uid) {
    const c = cache[uid];
    if (c) return Promise.resolve(c);
    if (pending.has(uid)) return pending.get(uid);
    const p = new Promise((resolve) => { queue.push({ uid, resolve, tries: 0 }); pump(); });
    pending.set(uid, p);
    p.finally(() => pending.delete(uid));
    return p;
  }

  function pump() {
    while (active < MAX_CONCURRENT && queue.length) {
      const job = queue.pop();
      active++;
      fetch(`/i/models/${job.uid}`, { credentials: 'include' })
        .then((r) => {
          if (r.status === 429) throw Object.assign(new Error('rate'), { retry: true });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then((j) => {
          const data = { faces: j.faceCount, verts: j.vertexCount, ai: !!j.isAiGenerated, t: Date.now() };
          cache[job.uid] = data;
          saveCache();
          job.resolve(data);
        })
        .catch((err) => {
          if (err.retry && job.tries < 3) {
            job.tries++;
            setTimeout(() => { queue.unshift(job); pump(); }, 2000 * job.tries);
          } else {
            job.resolve(null);
          }
        })
        .finally(() => { active--; pump(); });
    }
  }

  // ---- Kartları işleme ----
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const wrap = e.target.querySelector('.sf-chips');
      fetchInfo(e.target.dataset.uid).then((d) => render(wrap, d));
    }
  }, { rootMargin: '600px 0px' });

  function processCard(card) {
    const thumb = card.querySelector('.card-model__thumbnail');
    if (!card.dataset.uid || !thumb) return;
    card.dataset.sfTri = '1';
    thumb.classList.add('sf-rel'); // getComputedStyle yok -> zorunlu layout hesabı yok
    const wrap = document.createElement('div');
    wrap.className = 'sf-chips';
    wrap.innerHTML = '<span class="sf-chip sf-tri loading"></span>';
    thumb.appendChild(wrap);
    io.observe(card);
  }

  function scan() {
    document.querySelectorAll('.card-model[data-uid]:not([data-sf-tri])').forEach(processCard);
  }

  scan();
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; scan(); });
  }).observe(document.body, { childList: true, subtree: true });
})();
