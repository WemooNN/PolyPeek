(() => {
  'use strict';

  // Önbellek ham sinyalleri saklar; AI tahmini her gösterimde yeniden hesaplanır.
  // Böylece tahmin kuralları değişince önbelleği sıfırlamak gerekmez.
  const CACHE_KEY = 'sfTriCache_v4';
  const HIDE_AI_KEY = 'sfTri_hideAI';
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 gün
  const MAX_CONCURRENT = 6;

  // ---- Önbellek (localStorage) ----
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { cache = {}; }
  try {
    for (const k of ['sfTriCache_v1', 'sfTriCache_v2', 'sfTriCache_v3', 'sfTri_hideAIGuess']) localStorage.removeItem(k);
  } catch (e) { /* eski sürüm */ }
  const hideAI = () => { try { return localStorage.getItem(HIDE_AI_KEY) === '1'; } catch (e) { return false; } };
  let saveTimer = null;
  function saveCache() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* dolu olabilir */ }
    }, 1000);
  }

  // ---- Stil ----
  // Performans: backdrop-filter / filter: drop-shadow kullanılmıyor. Onlarca rozetle
  // birlikte her kaydırma karesinde yeniden çizim yaptırıp sayfayı kasıyorlardı.
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

    /* AI rozeti */
    .sf-ai {
      border: 1px solid transparent;
      background:
        linear-gradient(rgba(24, 14, 40, .9), rgba(24, 14, 40, .9)) padding-box,
        linear-gradient(135deg, #8b5cf6, #ec4899, #f59e0b) border-box;
    }
    .sf-ai .sf-ico { width: 12px; height: 12px; flex: none; color: #f0abfc; }
    .sf-ai .sf-ai-text { color: #fbe7ff; font-weight: 700; }

    /* Tahmini AI: kesik çizgili */
    .sf-ai-guess {
      background: rgba(24, 14, 40, .9);
      border: 1px dashed rgba(196, 181, 253, .8);
    }
    .sf-ai-guess .sf-ico { color: #c4b5fd; }
    .sf-ai-guess .sf-ai-text { color: #ddd6fe; }

    /* Hide AI: kartı ızgaradan çıkar (React'in düğümünü silmeden) */
    .sf-hidden { display: none !important; }
  `;
  document.head.appendChild(style);

  const TRI_SVG = '<svg class="sf-ico" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11.2 10.5H.8Z" fill="currentColor"/></svg>';
  const AI_SVG = '<svg class="sf-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l2.2 6.3L20.5 10.5 14.2 12.7 12 19l-2.2-6.3L3.5 10.5l6.3-2.2zM19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z"/></svg>';

  // ---- AI tahmini ----
  // Yükleyenlerin çoğu "AI generated" kutusunu işaretlemiyor. AI araçlarının
  // (Meshy, Tripo, Hunyuan…) çıktısında ortak bir iz var: tek malzeme, genel doku
  // isimleri, su geçirmez mesh (üçgen/vertex ≈ 2.00) ve kullanıcının seçtiği hedef
  // üçgen sayısının hemen altında bir değer (ör. 1.500.000, 499.972, 48.999).
  const GENERIC_TEX = /^(texture|image|material)[ _-]?\d*(@|\.)/i;
  const PBR_V_TEX = /texture_pbr_v\d+/i;
  const EMBEDDED_TEX = /gltf_embedded_\d+/i;
  const AI_WORDS = /\b(meshy|tripo|tripo3d|hunyuan|trellis|rodin|kaedim|sloyd|csm\.ai|text[- ]to[- ]3d|image[- ]to[- ]3d|ai[- ]?generated|ai[- ]?made|aigc|midjourney)\b/;
  const SCAN_WORDS = /\b(photogrammetry|photoscan|scan(ned|ning)?|lidar|agisoft|metashape|realitycapture|polycam|drone)\b/;
  const TARGET_COUNTS = [10e3, 20e3, 25e3, 30e3, 40e3, 50e3, 60e3, 75e3, 80e3, 100e3, 150e3, 200e3, 250e3,
    300e3, 400e3, 500e3, 600e3, 750e3, 800e3, 1e6, 1.2e6, 1.5e6, 2e6, 2.5e6, 3e6];
  const AI_SCORE_MIN = 6;

  // /i/models yanıtından sadece tahmin için gereken sinyaller
  function signals(j) {
    const md = j.metadata || {};
    const tex = md.textureFiles || [];
    const text = [j.name, j.description, (j.tags || []).map((t) => t.name || t).join(' ')].join(' ').toLowerCase();
    return {
      mat: md.materialCount, quad: md.quad, poly: md.polygon, tc: md.textureCount,
      tn: tex.slice(0, 4).map((t) => (t.filepath || '').split('/').pop()),
      tw: tex.reduce((m, t) => Math.max(m, t.width || 0), 0),
      kw: AI_WORDS.test(text), scan: SCAN_WORDS.test(text),
    };
  }

  function nearTargetCount(f) {
    if (f < 10e3) return false;
    if (TARGET_COUNTS.some((c) => f <= c && f >= c * 0.9975)) return true; // hedefin %0,25 altı
    const r = f % 1000;
    return r === 0 || r >= 990;                                          // 48.999, 30.000 gibi
  }

  function aiGuess(d) {
    const s = d.sig;
    if (!s) return { guess: false, reasons: [] };
    const reasons = [];
    let score = 0;
    const ratio = d.verts ? d.faces / d.verts : 0;

    if (s.tn.length && s.tn.every((n) => GENERIC_TEX.test(n) || PBR_V_TEX.test(n))) {
      score += 3; reasons.push(`generic texture name (${s.tn[0]})`);
    } else if (s.tn.some((n) => EMBEDDED_TEX.test(n))) {
      score += 1; reasons.push('embedded glTF textures');
    }
    if (s.mat === 1) { score += 2; reasons.push('single material'); }
    if (ratio > 1.995 && ratio < 2.005) { score += 2; reasons.push('watertight 2.00 tri/vertex ratio'); }
    if (s.quad === 0 && s.poly === 0 && d.faces > 5000) { score += 1; reasons.push('triangles only'); }
    if (nearTargetCount(d.faces)) { score += 2; reasons.push(`generator-style target count (${d.faces.toLocaleString('en-US')})`); }
    if (s.kw) { score += 3; reasons.push('AI tool mentioned'); }

    if (s.scan) score -= 3;             // fotogrametri taraması
    if (s.mat >= 3) score -= 3;
    if (s.tc >= 5) score -= 2;
    if (s.tw >= 4096) score -= 1;       // tarama/AAA doku

    return { guess: score >= AI_SCORE_MIN, reasons };
  }

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

  function render(card, wrap, data) {
    const tri = wrap.querySelector('.sf-tri');
    tri.classList.remove('loading');
    if (!data || data.faces == null) {
      tri.innerHTML = TRI_SVG + '<span>?</span>';
      tri.title = 'Üçgen sayısı alınamadı';
      return;
    }

    const g = data.ai ? { guess: false, reasons: [] } : aiGuess(data);
    if ((data.ai || g.guess) && hideAI()) {
      (card.closest('.c-grid__item') || card).classList.add('sf-hidden');
      document.dispatchEvent(new CustomEvent('sf-card-hidden'));
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

    if ((data.ai || g.guess) && !wrap.querySelector('.sf-ai')) {
      const ai = document.createElement('span');
      ai.className = 'sf-chip sf-ai' + (data.ai ? '' : ' sf-ai-guess');
      ai.title = data.ai
        ? 'Marked as AI-generated by the uploader'
        : 'Likely AI-generated (not declared by the uploader)\n· ' + g.reasons.join('\n· ');
      ai.innerHTML = AI_SVG + `<span class="sf-ai-text">AI${data.ai ? '' : '?'}</span>`;
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
    if (c && c.sig && Date.now() - c.t < CACHE_TTL) return Promise.resolve(c);
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
          const data = { faces: j.faceCount, verts: j.vertexCount, ai: !!j.isAiGenerated, sig: signals(j), t: Date.now() };
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
      const card = e.target;
      const wrap = card.querySelector('.sf-chips');
      fetchInfo(card.dataset.uid).then((d) => render(card, wrap, d));
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
