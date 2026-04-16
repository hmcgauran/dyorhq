/* DYOR HQ — main.js */

(function () {
  'use strict';

  const grid = document.getElementById('reports-grid');
  if (!grid) return; // Not on homepage

  const searchInput = document.getElementById('search');
  const filterBtns = document.querySelectorAll('.filter-btn[data-rec]');
  const universeTabs = document.querySelectorAll('.univ-tab[data-univ]');
  const countEl = document.getElementById('report-count');

  let allReports = [];
  let activeFilter = 'ALL';
  let activeUniverse = 'all';

  // ─── Favourites ─────────────────────────────────────
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

  // ─── Render ─────────────────────────────────────────
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

  function baseRecommendation(report) {
    return (report.rating || report.recommendation || 'HOLD').split('—')[0].trim().toUpperCase();
  }

  function reportUniverses(report) {
    if (Array.isArray(report.universes)) return report.universes;
    if (report.universe) return [report.universe];
    return [];
  }

  function renderCard(report) {
    const rec = report.recommendation || report.rating || 'HOLD';
    const cls = recClass(baseRecommendation(report));
    const color = convictionColor(report.conviction || 50);
    const dashOffset = CIRC * (1 - ((report.conviction || 50) / 100));
    const href = report.report_url || (report.file ? `reports/${report.file}` : '#');
    const starred = allFavs.includes((report.ticker || '').toUpperCase());
    const starSymbol = starred ? '★' : '☆';

    return `
      <a href="${href}" class="report-card rec-${cls}${starred ? ' starred' : ''}">
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

  function applyFilters() {
    const q = (searchInput ? searchInput.value.toLowerCase().trim() : '');
    let result = allReports;

    if (activeUniverse !== 'all') {
      result = result.filter(report => reportUniverses(report).includes(activeUniverse));
    }

    if (activeFilter === 'FAVOURITES') {
      result = result.filter(r => allFavs.includes((r.ticker || '').toUpperCase()));
    } else if (activeFilter !== 'ALL') {
      const filterUpper = activeFilter.toUpperCase();
      if (filterUpper === 'BUY') {
        result = result.filter(r => baseRecommendation(r) === 'BUY');
      } else if (filterUpper === 'AVOID') {
        result = result.filter(r => { const b = baseRecommendation(r); return b === 'AVOID' || b === 'SELL'; });
      } else {
        result = result.filter(r => baseRecommendation(r) === activeFilter.toUpperCase());
      }
    }

    if (q) {
      result = result.filter(r =>
        (r.company || '').toLowerCase().includes(q) ||
        (r.ticker || '').toLowerCase().includes(q) ||
        (r.summary || '').toLowerCase().includes(q)
      );
    }

    renderGrid(result);
  }

  universeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      universeTabs.forEach(button => {
        const isActive = button === tab;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', String(isActive));
      });
      activeUniverse = tab.dataset.univ || 'all';
      applyFilters();
    });
  });

  // Filter buttons
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.rec;
      applyFilters();
    });
  });

  // Search
  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }

  // Star click — event delegation on grid
  grid.addEventListener('click', function(e) {
    const btn = e.target.closest('.star-btn');
    if (!btn) return;
    const ticker = btn.dataset.ticker;
    const isFav = toggleFav(ticker);
    btn.textContent = isFav ? '★' : '☆';
    btn.classList.toggle('active', isFav);
    // Update card class
    const card = btn.closest('.report-card');
    if (card) card.classList.toggle('starred', isFav);
    // If favourites filter is active, re-render
    if (activeFilter === 'FAVOURITES') applyFilters();
  });

  // Add FAVOURITES button
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
      activeFilter = 'FAVOURITES';
      applyFilters();
    });
  }

  // Load reports
  fetch('reports-index.json')
    .then(r => { if (!r.ok) throw new Error('Failed to load reports index'); return r.json(); })
    .then(data => {
      allReports = data.sort((a, b) => new Date(b.date) - new Date(a.date));
      renderGrid(allReports);
    })
    .catch(err => {
      console.error(err);
      grid.innerHTML = '<div class="empty-state"><p>Could not load reports.</p></div>';
    });

  // ─── Methodology toggle
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
