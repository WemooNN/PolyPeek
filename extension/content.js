(() => {
  'use strict';

  const CACHE_KEY = 'sfTriCache_v3';
  const HIDE_GUESS_KEY = 'sfTri_hideAIGuess';
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 gün
  const MAX_CONCURRENT = 4;

  // ---- Önbellek (localStorage) ----
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { cache = {}; }
  try { localStorage.removeItem('sfTriCache_v1'); localStorage.removeItem('sfTriCache_v2'); } catch (e) { /* eski sürüm */ }
  const hideGuessed = () => { try { return localStorage.getItem(HIDE_GUESS_KEY) === '1'; } catch (e) { return false; } };
  let saveTimer = null;
  function saveCache() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* dolu olabilir */ }
    }, 500);
  }

  // ---- Stil ----
  const style = document.createElement('style');
  style.textContent = `
    .sf-chips {
      position: absolute; top: 8px; left: 8px; z-index: 5;
      display: flex; gap: 6px; align-items: center;
      pointer-events: none;
    }
    .sf-chip {
      --c: #9aa4b2;
      position: relative; overflow: hidden;
      display: inline-flex; align-items: center; gap: 6px;
      height: 24px; padding: 0 9px 0 7px; border-radius: 999px;
      font: 600 12px/1 Inter, "Segoe UI", system-ui, sans-serif;
      font-variant-numeric: tabular-nums; letter-spacing: .1px;
      color: #f4f6fa;
      background: rgba(12, 14, 18, .55);
      -webkit-backdrop-filter: blur(10px) saturate(1.5);
      backdrop-filter: blur(10px) saturate(1.5);
      border: 1px solid rgba(255, 255, 255, .14);
      box-shadow: 0 4px 14px rgba(0, 0, 0, .28), inset 0 1px 0 rgba(255, 255, 255, .08);
      pointer-events: auto; cursor: default; white-space: nowrap;
      animation: sf-pop .28s cubic-bezier(.2, .9, .3, 1.3) both;
    }
    @keyframes sf-pop { from { opacity: 0; transform: translateY(-4px) scale(.92); } }

    /* Üçgen rozeti */
    .sf-tri .sf-ico { width: 11px; height: 11px; flex: none; color: var(--c);
      filter: drop-shadow(0 0 4px var(--c)); }
    .sf-tri .sf-more {
      max-width: 0; opacity: 0; overflow: hidden;
      color: rgba(244, 246, 250, .65); font-weight: 500;
      transition: max-width .3s ease, opacity .25s ease;
    }
    .card-model:hover .sf-tri .sf-more { max-width: 120px; opacity: 1; }
    .sf-tri .sf-meter {
      position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
      background: var(--c);
      box-shadow: 0 0 6px var(--c);
    }
    .sf-tri.low   { --c: #34d399; }
    .sf-tri.mid   { --c: #facc15; }
    .sf-tri.high  { --c: #fb923c; }
    .sf-tri.ultra { --c: #f43f5e; }

    /* Yükleniyor */
    .sf-tri.loading { width: 58px; }
    .sf-tri.loading::after {
      content: ""; position: absolute; inset: 0;
      background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,.18) 50%, transparent 80%);
      animation: sf-shimmer 1.1s linear infinite;
    }
    @keyframes sf-shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }

    /* AI rozeti */
    .sf-ai {
      padding: 0 9px 0 7px;
      border: 1px solid transparent;
      background:
        linear-gradient(rgba(20, 12, 34, .72), rgba(20, 12, 34, .72)) padding-box,
        linear-gradient(135deg, #8b5cf6, #ec4899, #f59e0b) border-box;
      box-shadow: 0 4px 14px rgba(139, 92, 246, .35);
    }
    .sf-ai .sf-ico { width: 12px; height: 12px; flex: none; color: #f0abfc;
      filter: drop-shadow(0 0 4px rgba(236, 72, 153, .8)); }
    .sf-ai .sf-ai-text { color: #fbe7ff; font-weight: 700;
      text-shadow: 0 0 8px rgba(192, 132, 252, .9); }

    /* Tahmini AI: daha sönük, kesik çizgili */
    .sf-ai-guess {
      background: rgba(20, 12, 34, .72);
      border: 1px dashed rgba(196, 181, 253, .75);
      box-shadow: 0 4px 12px rgba(0, 0, 0, .3);
    }
    .sf-ai-guess .sf-ico { color: #c4b5fd; filter: none; opacity: .85; }
    .sf-ai-guess .sf-ai-text { color: #ddd6fe; text-shadow: none; }
  `;
  document.head.appendChild(style);

  const TRI_SVG = '<svg class="sf-ico" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11.2 10.5H.8Z" fill="currentColor"/></svg>';
  const AI_SVG = '<svg class="sf-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l2.2 6.3L20.5 10.5 14.2 12.7 12 19l-2.2-6.3L3.5 10.5l6.3-2.2zM19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z"/></svg>';

  // ---- AI tahmini ----
  // Yükleyenlerin çoğu "AI generated" kutusunu işaretlemiyor. Bu yüzden modelin
  // teknik verisinden tahmin yürütüyoruz. AI araçlarının (Meshy, Tripo, Hunyuan…)
  // çıktısı tek malzemeli, genel doku isimli ve su geçirmez (üçgen/vertex ≈ 2.00) olur.
  const GENERIC_TEX = /^(texture|image|material)[ _-]?\d*(@|\.)/i;
  const PBR_V_TEX = /texture_pbr_v\d+/i;
  const EMBEDDED_TEX = /gltf_embedded_\d+/i;
  const AI_WORDS = /\b(meshy|tripo|tripo3d|hunyuan|trellis|rodin|kaedim|sloyd|csm\.ai|text[- ]to[- ]3d|image[- ]to[- ]3d|ai[- ]?generated|ai[- ]?made|aigc|midjourney)\b/;
  const SCAN_WORDS = /\b(photogrammetry|photoscan|scan(ned|ning)?|lidar|agisoft|metashape|realitycapture|polycam|drone)\b/;
  const AI_SCORE_MIN = 6;

  function aiGuess(j) {
    const md = j.metadata || {};
    const names = (md.textureFiles || []).map((t) => (t.filepath || '').split('/').pop());
    const text = [j.name, j.description, (j.tags || []).map((t) => t.name || t).join(' ')].join(' ').toLowerCase();
    const ratio = j.vertexCount ? j.faceCount / j.vertexCount : 0;
    const reasons = [];
    let score = 0;

    if (names.length && names.every((n) => GENERIC_TEX.test(n) || PBR_V_TEX.test(n))) {
      score += 3; reasons.push(`generic texture name (${names[0]})`);
    } else if (names.some((n) => EMBEDDED_TEX.test(n))) {
      score += 1; reasons.push('embedded glTF textures');
    }
    if (md.materialCount === 1) { score += 2; reasons.push('single material'); }
    if (ratio > 1.995 && ratio < 2.005) { score += 2; reasons.push('watertight 2.00 tri/vertex ratio'); }
    if (md.quad === 0 && md.polygon === 0 && j.faceCount > 5000) { score += 1; reasons.push('triangles only'); }
    if (AI_WORDS.test(text)) { score += 3; reasons.push('AI tool mentioned'); }

    if (SCAN_WORDS.test(text)) score -= 3;                       // fotogrametri taraması
    if (md.materialCount >= 3) score -= 3;
    if (md.textureCount >= 5) score -= 2;
    if ((md.textureFiles || []).some((t) => t.width >= 4096)) score -= 1; // tarama/AAA doku

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

    if ((data.ai || data.aiGuess) && !wrap.querySelector('.sf-ai')) {
      const ai = document.createElement('span');
      ai.className = 'sf-chip sf-ai' + (data.ai ? '' : ' sf-ai-guess');
      ai.title = data.ai
        ? 'Marked as AI-generated by the uploader'
        : 'Possibly AI-generated (not declared by the uploader)\n· ' + (data.why || []).join('\n· ');
      ai.innerHTML = AI_SVG + `<span class="sf-ai-text">AI${data.ai ? '' : '?'}</span>`;
      wrap.appendChild(ai);
    }
  }

  // ---- İstek kuyruğu ----
  const queue = [];
  const pending = new Map(); // uid -> Promise
  let active = 0;

  function fetchInfo(uid) {
    const c = cache[uid];
    if (c && Date.now() - c.t < CACHE_TTL) return Promise.resolve(c);
    if (pending.has(uid)) return pending.get(uid);
    const p = new Promise((resolve) => { queue.push({ uid, resolve, tries: 0 }); pump(); });
    pending.set(uid, p);
    p.finally(() => pending.delete(uid));
    return p;
  }

  function pump() {
    while (active < MAX_CONCURRENT && queue.length) {
      const job = queue.shift();
      active++;
      fetch(`/i/models/${job.uid}`, { credentials: 'include' })
        .then((r) => {
          if (r.status === 429) throw Object.assign(new Error('rate'), { retry: true });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then((j) => {
          const g = aiGuess(j);
          const data = {
            faces: j.faceCount, verts: j.vertexCount,
            ai: !!j.isAiGenerated, aiGuess: !j.isAiGenerated && g.guess, why: g.reasons,
            t: Date.now(),
          };
          cache[job.uid] = data;
          saveCache();
          job.resolve(data);
        })
        .catch((err) => {
          if (err.retry && job.tries < 3) {
            job.tries++;
            setTimeout(() => { queue.push(job); pump(); }, 2000 * job.tries);
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
      fetchInfo(card.dataset.uid).then((d) => {
        // "Hide AI (guessed)" açıksa tahmini AI kartını tamamen kaldır (ızgarada boşluk kalmasın)
        if (d && d.aiGuess && hideGuessed()) {
          (card.closest('.c-grid__item') || card).remove();
          return;
        }
        render(wrap, d);
      });
    }
  }, { rootMargin: '300px' });

  function processCard(card) {
    if (card.dataset.sfTri) return;
    const uid = card.dataset.uid;
    const thumb = card.querySelector('.card-model__thumbnail');
    if (!uid || !thumb) return;
    card.dataset.sfTri = '1';
    if (getComputedStyle(thumb).position === 'static') thumb.style.position = 'relative';

    const wrap = document.createElement('div');
    wrap.className = 'sf-chips';
    wrap.innerHTML = '<span class="sf-chip sf-tri loading"></span>';
    // Sol üstte "Staff Pick" vb. ikon varsa rozetleri yanına kaydır
    const corner = thumb.querySelector('.card__main__corner.--top-left');
    if (corner && corner.offsetWidth) wrap.style.left = (corner.offsetLeft + corner.offsetWidth + 6) + 'px';
    thumb.appendChild(wrap);
    io.observe(card);
  }

  function scan(root = document) {
    root.querySelectorAll('.card-model[data-uid]:not([data-sf-tri])').forEach(processCard);
  }

  scan();
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; scan(); });
  }).observe(document.body, { childList: true, subtree: true });
})();
