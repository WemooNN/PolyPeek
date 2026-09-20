// Arama sayfasına ekler:
//  - "Sort by" menüsüne üçgen sayısına göre sıralama seçenekleri
//  - "Others" filtre grubuna "Hide AI" kutusu
(() => {
  'use strict';

  const OPTIONS = [
    { sort: 'faceCount', label: 'Tris: Low → High' },
    { sort: '-faceCount', label: 'Tris: High → Low' },
  ];
  const HIDE_AI_KEY = 'sfTri_hideAI';
  const HIDE_GUESS_KEY = 'sfTri_hideAIGuess';

  const style = document.createElement('style');
  style.textContent = `.c-dropdown-select__option.sf-tri-sort-option { cursor: pointer; }`;
  document.head.appendChild(style);

  const isSearchPage = () => location.pathname.startsWith('/search');
  const currentSort = () => new URLSearchParams(location.search).get('sort_by');
  const getHideAI = () => { try { return localStorage.getItem(HIDE_AI_KEY) === '1'; } catch (e) { return false; } };
  const getHideGuess = () => { try { return localStorage.getItem(HIDE_GUESS_KEY) === '1'; } catch (e) { return false; } };

  function findSortDropdown() {
    return [...document.querySelectorAll('.c-dropdown')].find((d) => {
      const title = d.querySelector('.c-dropdown__label-title');
      return title && /sort by/i.test(title.textContent);
    });
  }

  function applySort(sort) {
    const u = new URL(location.href);
    u.searchParams.set('sort_by', sort);
    u.searchParams.delete('cursor');
    location.assign(u.toString());
  }

  function updateSort() {
    const dd = findSortDropdown();
    if (!dd) return;

    // Menü açıksa seçenekleri ekle
    const list = dd.querySelector('.c-dropdown-select');
    if (list && !list.querySelector('.sf-tri-sort-option')) {
      for (const opt of OPTIONS) {
        const li = document.createElement('li');
        li.className = 'c-dropdown-select__option sf-tri-sort-option';
        li.textContent = opt.label;
        li.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          applySort(opt.sort);
        });
        list.appendChild(li);
      }
    }

    // Etiketi aktif sıralamaya göre güncelle
    const active = OPTIONS.find((o) => o.sort === currentSort());
    const labelText = dd.querySelector('.c-dropdown__label-value__text');
    if (active && labelText && labelText.textContent !== active.label) {
      labelText.textContent = active.label;
      labelText.closest('.c-dropdown__label-value')?.classList.remove('--placeholder');
    }
  }

  function makeCheckbox(id, label, title, key, checked) {
    const box = document.createElement('div');
    box.className = 'c-checkbox';
    box.title = title;
    box.innerHTML =
      `<input id="${id}" class="c-checkbox__input" type="checkbox" name="${id}">` +
      '<div class="c-checkbox__actor"></div>' +
      `<label tabindex="0" class="c-checkbox__label" for="${id}">${label}</label>`;
    const input = box.querySelector('input');
    input.checked = checked;
    box.classList.toggle('--active', input.checked);
    input.addEventListener('change', () => {
      box.classList.toggle('--active', input.checked);
      try { localStorage.setItem(key, input.checked ? '1' : '0'); } catch (e) { /* yoksay */ }
      // Sonuçlar sunucudan yeniden gelsin diye sayfayı yenile
      location.reload();
    });
    box.querySelector('.c-checkbox__actor').addEventListener('click', () => input.click());
    return box;
  }

  function updateAiCheckbox() {
    const group = [...document.querySelectorAll('.c-filter-group')].find((g) =>
      g.querySelector('#staffpicked, #downloadable'));
    const content = group && group.querySelector('.c-filter-group__content');
    if (!content || content.querySelector('#sf-hide-ai')) return;

    const before = content.querySelector('.c-filters__filter.--button'); // "Reset" bağlantısı
    content.insertBefore(makeCheckbox(
      'sf-hide-ai', 'Hide AI',
      'Yükleyenin "AI generated" olarak işaretlediği modelleri gizle',
      HIDE_AI_KEY, getHideAI()), before);
    content.insertBefore(makeCheckbox(
      'sf-hide-ai-guess', 'Hide AI?',
      'Teknik verisine bakarak AI olduğunu tahmin ettiğimiz modelleri de gizle (işaretlenmemiş olanlar)',
      HIDE_GUESS_KEY, getHideGuess()), before);
  }

  // AI gizlenince bir sayfada çok az kart kalabiliyor; ekran dolana kadar "load more"a otomatik bas.
  const MIN_CARDS = 12;
  const MAX_AUTO_LOADS = 8;
  const COOLDOWN = 2000; // yeni sayfa gelmesini bekle
  let autoLoads = 0;
  let lastClick = 0;
  let lastUrl = location.href;
  function autoLoadMore() {
    if (location.href !== lastUrl) { lastUrl = location.href; autoLoads = 0; }
    if (!(getHideAI() || getHideGuess()) || autoLoads >= MAX_AUTO_LOADS) return;
    if (document.querySelectorAll('.card-model[data-uid]').length >= MIN_CARDS) return;
    if (Date.now() - lastClick < COOLDOWN) return; // bekleyen zamanlayıcı tekrar çağıracak
    const btn = document.querySelector('.c-grid__button.--next button');
    if (!btn || btn.disabled) return;
    lastClick = Date.now();
    autoLoads++;
    btn.click();
    // Yeni sayfadaki kartların hepsi AI ise DOM değişmeyebilir; yine de tekrar kontrol et
    setTimeout(autoLoadMore, COOLDOWN + 50);
  }

  function update() {
    if (!isSearchPage()) return;
    updateSort();
    updateAiCheckbox();
    autoLoadMore();
  }

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; update(); });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  update();
})();
