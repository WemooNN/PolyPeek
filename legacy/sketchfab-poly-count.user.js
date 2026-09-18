// ==UserScript==
// @name         Sketchfab Poly Count
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Show triangle counts on Sketchfab thumbnails
// @author       M A C
// @match        https://sketchfab.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=sketchfab.com
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const SHOW_IN_THOUSANDS = true;
    const REQUEST_INTERVAL = 300;
    const THRESHOLDS = { LOW: 50000, MID: 200000 };

    const requestQueue = [];
    let isProcessing = false;
    const activeRequests = new WeakMap();
    const trisCache = new Map();

    const style = document.createElement('style');
    style.innerHTML = `
        .sf-tris-badge {
            position: absolute;
            top: 8px; left: 8px;
            z-index: 20;
            padding: 4px 6px; border-radius: 4px;
            font-size: 11px; font-weight: 800; color: white;
            text-shadow: 0 1px 3px rgba(0,0,0,0.9);
            box-shadow: 0 2px 5px rgba(0,0,0,0.4);
            pointer-events: none;
            font-family: 'Open Sans', sans-serif;
            transition: opacity 0.2s, background 0.2s;
            opacity: 1;
        }
        .sf-tris-hidden { opacity: 0 !important; pointer-events: none !important; }
        .sf-tris-wait { background: rgba(60, 60, 60, 0.7); color: #bbb; transform: scale(0.9); }
        .sf-tris-loading { background: rgba(0, 0, 0, 0.8); color: #fff; }
        .sf-tris-low { background: linear-gradient(135deg, #2ecc71, #27ae60); }
        .sf-tris-mid { background: linear-gradient(135deg, #f39c12, #d35400); }
        .sf-tris-high { background: linear-gradient(135deg, #e74c3c, #c0392b); }
    `;
    document.head.appendChild(style);

    function formatNumber(num) {
        if (!SHOW_IN_THOUSANDS) return num.toLocaleString();
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return num;
    }

    function getModelUid(url) {
        if (!url) return null;
        const parts = url.split('-');
        return parts[parts.length - 1];
    }

    function updateBadge(cardElement, status, count = 0) {
        if (!cardElement.isConnected) return;

        let badge = cardElement.querySelector('.sf-tris-badge');

        if (status === 'error' || (cardElement.offsetWidth > 0 && cardElement.offsetWidth < 50)) {
            if (badge) badge.remove();
            return;
        }

        if (!badge) {
            if (cardElement.offsetWidth === 0) return;
            badge = document.createElement('div');
            const computedStyle = window.getComputedStyle(cardElement);
            if (computedStyle.position === 'static') cardElement.style.position = 'relative';
            cardElement.appendChild(badge);
        }

        badge.className = 'sf-tris-badge';

        if (status === 'queue') {
            badge.textContent = 'Wait';
            badge.classList.add('sf-tris-wait');
        } else if (status === 'loading') {
            badge.textContent = '...';
            badge.classList.add('sf-tris-loading');
        } else if (status === 'success') {
            badge.textContent = formatNumber(count) + ' ▲';
            if (count < THRESHOLDS.LOW) badge.classList.add('sf-tris-low');
            else if (count < THRESHOLDS.MID) badge.classList.add('sf-tris-mid');
            else badge.classList.add('sf-tris-high');
        }
    }

    async function processQueue() {
        if (isProcessing) return;
        if (requestQueue.length === 0) { isProcessing = false; return; }

        isProcessing = true;
        const job = requestQueue.shift();

        if (job.card.isConnected && !job.controller.signal.aborted) {
             await fetchInternalData(job.card, job.uid, job.controller);
        }

        setTimeout(() => {
            isProcessing = false;
            processQueue();
        }, REQUEST_INTERVAL);
    }

    async function fetchInternalData(cardElement, uid, controller) {
        updateBadge(cardElement, 'loading');
        try {
            const response = await fetch(`https://sketchfab.com/i/models/${uid}`, {
                method: 'GET',
                signal: controller.signal
            });

            if (!response.ok) throw new Error(response.status);

            const data = await response.json();
            const tris = data.faceCount;

            if (typeof tris === 'undefined') throw new Error();

            trisCache.set(uid, tris);
            if (cardElement.isConnected) updateBadge(cardElement, 'success', tris);

        } catch (error) {
            if (error.name !== 'AbortError') updateBadge(cardElement, 'error');
        }
    }

    function addToQueue(cardElement, uid) {
        if (trisCache.has(uid)) {
            updateBadge(cardElement, 'success', trisCache.get(uid));
            return;
        }
        if (requestQueue.find(job => job.card === cardElement)) return;

        const controller = new AbortController();
        activeRequests.set(cardElement, controller);

        updateBadge(cardElement, 'queue');
        requestQueue.push({ card: cardElement, uid: uid, controller: controller });

        processQueue();
    }

    function manageVisibility() {
        const badges = document.querySelectorAll('.sf-tris-badge');
        badges.forEach(badge => {
            const parent = badge.parentElement;
            if (!parent) return;

            if (parent.offsetWidth === 0 || parent.offsetHeight === 0 || parent.offsetParent === null) {
                badge.classList.add('sf-tris-hidden');
                return;
            }

            if (parent.offsetWidth > 0 && badge.classList.contains('sf-tris-hidden')) {
                badge.classList.remove('sf-tris-hidden');
            }
        });
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const card = entry.target;
            if (entry.isIntersecting) {
                const uid = getModelUid(card.getAttribute('href'));
                if (uid) addToQueue(card, uid);
            } else {
                if (activeRequests.has(card)) activeRequests.get(card).abort();

                const index = requestQueue.findIndex(job => job.card === card);
                if (index > -1) requestQueue.splice(index, 1);

                const b = card.querySelector('.sf-tris-badge');
                if (b && !b.classList.contains('sf-tris-low') && !b.classList.contains('sf-tris-mid') && !b.classList.contains('sf-tris-high')) {
                    b.remove();
                }
            }
        });
    }, { rootMargin: '50px', threshold: 0.01 });

    function scan() {
        manageVisibility();
        document.querySelectorAll('a[href*="/3d-models/"]:not([data-sf-scanned])').forEach(link => {
            const img = link.querySelector('img');
            if (img) {
                const rect = link.getBoundingClientRect();
                if (rect.width < 50 || rect.height < 50) return;

                link.setAttribute('data-sf-scanned', 'true');
                observer.observe(link);
            }
        });
    }

    setInterval(scan, 1000);

    const nuke = () => {
        requestQueue.length = 0;
        document.querySelectorAll('.sf-tris-badge').forEach(el => el.remove());
    };

    const originalPush = history.pushState;
    history.pushState = function() { originalPush.apply(this, arguments); nuke(); };
    window.addEventListener('popstate', nuke);

    scan();

})();
