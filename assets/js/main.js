/* DYOR HQ — main.js v2 */

(function () {
  'use strict';

  const grid = document.getElementById('reports-grid');
  if (!grid) return; // Not on homepage

  const searchInput = document.getElementById('search');
  const filterBtns = document.querySelectorAll('.filter-btn[data-rec]');
  const univTabs = document.querySelectorAll('.univ-tab[data-univ]');
  const countEl = document.getElementById('report-count');

  let allReports = [];
  let activeRec = 'ALL';
  let activeUniv = 'all';
  let activeExchange = '';
  let priceData = {}; // { ticker: price }

  // ─── URL State ───────────────────────────────────
  function getURLParam(key) {
    const params = new URLSearchParams(window.location.search);
    return params.get(key);
  }
  function setURLParam(key, value) {
    const params = new URLSearchParams(window.location.search);
    if (value && value !== 'all') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState({}, '', newUrl);
  }

  // ─── Favourites ──────────────────────────────────
  const FAV_KEY = 'dyorhq_favourites';
  let allFavs = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
  if (!Array.isArray(allFavs)) allFavs = [];

  function toggleFav(ticker) {
    const t = ticker.toUpperCase();
    if (allFavs.includes(t)) {
      allFavs = allFavs.filter(f => f !== t);
    } else {
      allFavs.push(t);
    }
    localStorage.setItem(FAV_KEY, JSON.stringify(allFavs));
    return allFavs.includes(t);
  }

  // ─── Freshness ───────────────────────────────────
  const FRESHNESS_THRESHOLD = 0.15; // 15% price drift
  const FRESHNESS_WINDOW_DAYS = 30;  // older than 30 days = needs review

  function isFresh(report) {
    const livePrice = priceData[report.ticker];
    if (!report.priceStored || livePrice === undefined) return true;
    const stored = report.priceStored;
    const drift = Math.abs(livePrice - stored) / stored;
    const daysOld = (Date.now() - new Date(report.lastRefreshed || report.datePublished || report.date).getTime()) / (1000 * 60 * 60 * 24);
    return drift <= FRESHNESS_THRESHOLD && daysOld <= FRESHNESS_WINDOW_DAYS;
  }

  function freshnessLabel(report) {
    const livePrice = priceData[report.ticker];
    if (!report.priceStored || livePrice === undefined) return null;
    const stored = report.priceStored;
    const drift = Math.abs(livePrice - stored) / stored;
    const daysOld = (Date.now() - new Date(report.lastRefreshed || report.datePublished || report.date).getTime()) / (1000 * 60 * 60 * 24);
    if (drift > FRESHNESS_THRESHOLD) return 'Price moved';
    if (daysOld > FRESHNESS_WINDOW_DAYS) return 'Needs review';
    return null;
  }

  // ─── Render ──────────────────────────────────────
  const CIRC = 2 * Math.PI * 22;

  function recClass(rec) {
    if (!rec) return 'hold';
    return rec.toLowerCase().replace(/\s+/g, '-');
  }

  function convictionColor(score) {
    if (score >= 75) return 'var(--rec-buy)';
    if (score >= 60) return 'var(--rec-hold)';
    if (score >= 45) return 'var(--rec-reduce)';
    return 'var(--rec-sell)';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function renderCard(report) {
    const rec = report.recommendation || report.rating || 'HOLD';
    const cls = recClass(rec);
    const color = convictionColor(report.conviction || 50);
    const dashOffset = CIRC * (1 - ((report.conviction || 50) / 100));
    const href = report.report_url || (report.file ? `reports/${report.file}` : '#');
    const starred = allFavs.includes((report.ticker || '').toUpperCase());
    const starSymbol = starred ? '★' : '☆';
    const freshLabel = freshnessLabel(report);
    const freshClass = freshLabel ? (freshLabel === 'Price moved' ? 'fresh-warn' : 'fresh-review') : '';

    return `
      <a href="${href}" class="report-card rec-${cls}${starred ? ' starred' : ''}${freshClass ? ' ' + freshClass : ''}">
        <div class="card-header">
          <div class="card-company">
            <div class="card-ticker">${report.ticker}</div>
            <div class="card-name">${report.company}</div>
          </div>
          <div class="card-right">
            <div class="conviction-ring" title="Conviction: ${report.conviction}/100">
              <svg viewBox="0 0 56 56">
                <circle class="ring-bg" cx="28" cy="28" r="22"/>
                <circle class="ring-fill" cx="28" cy="28" r="22"
                  stroke="${color}"
                  stroke-dasharray="${CIRC}"
                  stroke-dashoffset="${dashOffset}"/>
              </svg>
              <div class="conviction-label" style="color:${color}">
                ${report.conviction}
                <small>/ 100</small>
              </div>
            </div>
            <button class="star-btn${starred ? ' active' : ''}"
              data-ticker="${(report.ticker || '').toUpperCase()}"
              title="${starred ? 'Remove from favourites' : 'Add to favourites'}"
              onclick="event.preventDefault(); event.stopPropagation();">
              ${starSymbol}
            </button>
          </div>
        </div>
        <div class="card-meta">
          <span class="rec-badge ${cls}">${rec}</span>
          ${freshLabel ? `<span class="fresh-badge">${freshLabel}</span>` : ''}
          ${report.exchange ? `<span class="exchange-badge">${report.exchange}</span>` : ''}
          <span class="card-date">${formatDate(report.date)}</span>
        </div>
        <p class="card-summary">${report.summary || ''}</p>
      </a>
    `;
  }

  function renderGrid(reports) {
    if (reports.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>No reports match your filter.</p></div>';
    } else {
      grid.innerHTML = reports.map(renderCard).join('');
    }
    if (countEl) {
      countEl.textContent = `${reports.length} of ${allReports.length}`;
    }
  }

  // ─── Filtering ───────────────────────────────────
  function applyFilters() {
    const q = (searchInput ? searchInput.value.toLowerCase().trim() : '');
    let result = allReports;

    if (activeUniv !== 'all') {
      result = result.filter(r => {
        const unis = r.universes || [r.universe || 'watchlist'];
        return unis.includes(activeUniv);
      });
    }

    if (activeRec === 'FAVOURITES') {
      result = result.filter(r => allFavs.includes((r.ticker || '').toUpperCase()));
    } else if (activeRec !== 'ALL') {
      result = result.filter(r => (r.recommendation || r.rating || '').toUpperCase() === activeRec);
    }

    if (q) {
      result = result.filter(r =>
        (r.company || '').toLowerCase().includes(q) ||
        (r.ticker || '').toLowerCase().includes(q) ||
        (r.summary || '').toLowerCase().includes(q)
      );
    }

    if (activeExchange) {
      result = result.filter(r => (r.exchange || '') === activeExchange);
    }

    renderGrid(result);
  }

  // ─── Universe Tab Handling ─────────────────────────
  function setUniverse(univ) {
    activeUniv = univ;
    setURLParam('universe', univ);
    univTabs.forEach(tab => {
      const isActive = tab.dataset.univ === univ;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
    applyFilters();
  }

  univTabs.forEach(tab => {
    tab.addEventListener('click', () => setUniverse(tab.dataset.univ));
  });

  // ─── Recommendation Filter Buttons ────────────────
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeRec = btn.dataset.rec;
      applyFilters();
    });
  });

  // Search
  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }

  // Exchange filter
  const exchangeFilter = document.getElementById('exchange-filter');
  if (exchangeFilter) {
    exchangeFilter.addEventListener('change', () => {
      activeExchange = exchangeFilter.value;
      applyFilters();
    });
  }

  // ─── Star Click — Event Delegation ─────────────────
  grid.addEventListener('click', function(e) {
    const btn = e.target.closest('.star-btn');
    if (!btn) return;
    const ticker = btn.dataset.ticker;
    const isFav = toggleFav(ticker);
    btn.textContent = isFav ? '★' : '☆';
    btn.classList.toggle('active', isFav);
    const card = btn.closest('.report-card');
    if (card) card.classList.toggle('starred', isFav);
    if (activeRec === 'FAVOURITES') applyFilters();
  });

  // ─── FAVOURITES Button (added dynamically) ────────
  const filterGroup = document.querySelector('.filter-group');
  if (filterGroup) {
    const favBtn = document.createElement('button');
    favBtn.className = 'filter-btn';
    favBtn.dataset.rec = 'FAVOURITES';
    favBtn.textContent = '★ Favourites';
    filterGroup.appendChild(favBtn);
    favBtn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      favBtn.classList.add('active');
      activeRec = 'FAVOURITES';
      applyFilters();
    });
  }

  // ─── Load Data ────────────────────────────────────
  function loadReports() {
    return Promise.all([
      fetch('reports-index.json')
        .then(r => { if (!r.ok) throw new Error('Failed to load reports index'); return r.json(); }),
      fetch('prices.json')
        .then(r => { if (!r.ok) throw new Error('prices.json not found — run export-prices.js'); return r.json(); })
        .catch(() => ({ timestamp: null, prices: {} }))
    ])
      .then(([reports, priceInfo]) => {
        allReports = reports.sort((a, b) => new Date(b.date) - new Date(a.date));
        priceData = priceInfo.prices || {};

        // Restore URL state
        const urlUniv = getURLParam('universe');
        if (urlUniv) setUniverse(urlUniv);
        renderGrid(allReports);
      })
      .catch(err => {
        console.error(err);
        grid.innerHTML = '<div class="empty-state"><p>Could not load reports.</p></div>';
      });
  }

  loadReports();

  // ─── Methodology Toggle ─────────────────────────────
  const toggle = document.getElementById('methodology-toggle');
  const body = document.getElementById('methodology-body');
  if (toggle && body) {
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      body.hidden = expanded;
    });
  }

})();
