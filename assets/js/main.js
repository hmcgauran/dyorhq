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

// ─── Report Page Loader (called by thin-shell report pages) ───
async function loadReport(ticker) {
  try {
    const response = await fetch(`../reports/data/${ticker}.json`);
    if (!response.ok) throw new Error('Report not found');
    const data = await response.json();
    renderReport(data);
    history.replaceState(null, '', `?t=${ticker}`);
  } catch (err) {
    const container = document.querySelector('main .container');
    if (container) {
      container.innerHTML = `<p style="color:#ff4444;padding:40px;text-align:center;">Report not available: ${ticker}</p>`;
    }
  }
}

function renderReport(data) {
  const meta = data.meta;
  const sections = data.sections;
  const scores = data.scores || {};

  // Conviction colour
  const color = convictionColor(meta.conviction || 50);
  const recCls = recClass(meta.recommendation);
  const date = formatDate(meta.datePublished || meta.date);


  let html = `
    <div class="report-hero">
      <div class="report-breadcrumb"><a href="../index.html">Reports</a><span>/</span><span>${meta.ticker}</span></div>
      <div class="report-title-row">
        <div class="report-title-block">
          <div class="ticker-label">${meta.ticker}</div>
          <h1>${meta.company}</h1>
          <div class="report-meta-bar">
            <span class="rec-badge rec-${recCls}">${meta.recommendation}</span>
            <span class="meta-item">${date}</span>
            <span class="meta-item">${meta.price || ''}</span>
          </div>
        </div>
        <div class="conviction-display" style="border-top: 3px solid ${color}">
          <div class="score" style="color: ${color}">${meta.conviction}</div>
          <div class="score-label">Conviction</div>
          <div class="score-sub">out of 100</div>
        </div>
      </div>
    </div>
    <div class="report-body">
      <div class="report-content">
  `;

  const sectionOrder = ['executiveSummary','businessModel','financialSnapshot','recentCatalysts','thesisEvaluation','keyRisks','whoShouldOwn','recommendation','entryExit'];
  const sectionTitles = {
    executiveSummary: 'Executive Summary',
    businessModel: 'Business Model',
    financialSnapshot: 'Financial Snapshot',
    recentCatalysts: 'Recent Catalysts',
    thesisEvaluation: 'Thesis Evaluation',
    keyRisks: 'Key Risks',
    whoShouldOwn: 'Who Should Own It / Avoid It',
    recommendation: 'Recommendation',
    entryExit: 'Entry / Exit Framework'
  };


  for (const key of sectionOrder) {
    const section = sections[key];
    if (!section) continue;

    html += `<div class="report-section"><h2>${sectionTitles[key]}</h2>`;

    if (key === 'keyRisks' && section.risks && section.risks.length > 0) {
      html += `<ul class="risk-list">`;
      for (const risk of section.risks) {
        const num = risk.rank || risk.number || '';
        const text = risk.risk || risk.text || '';
        html += `<li><span class="risk-num">${num}</span><span>${text}</span></li>`;
      }
      html += `</ul>`;
    } else if (key === 'financialSnapshot' && section.table) {
      html += `<table class="data-table">`;
      for (const row of section.table) {
        html += `<tr><td>${row.label}</td><td>${row.value}</td></tr>`;
      }
      html += `</table>`;
    } else if (section.text) {
      let text = section.text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
      html += `<p>${text}</p>`;
    }

    html += `</div>`;
  }

  // Sources
  if (sections.sources) {
    html += `<div class="report-section"><h2>Sources</h2>`;
    if (sections.sources.text) {
      html += `<p>${sections.sources.text}</p>`;
    }
    html += `</div>`;
  }

  html += `</div></div>`; // close report-content + report-body

  // Conviction history
  const history = scores.history || [];
  if (history.length > 1) {
    html += buildConvictionHistory(scores);
  }

  document.querySelector('main .container').innerHTML = html;
}

function buildConvictionHistory(scores) {
  const history = scores.history || [];
  let html = `<div style="margin-top:40px;"><h3 style="color:#f0b429;margin-bottom:16px;">Conviction History</h3>`;
  html += `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">`;
  html += `<thead><tr style="border-bottom:1px solid #333;">
    <th style="text-align:left;padding:8px;color:#888;font-size:12px;">Date</th>
    <th style="text-align:left;padding:8px;color:#888;font-size:12px;">Score</th>
    <th style="text-align:left;padding:8px;color:#888;font-size:12px;">Recommendation</th>
    <th style="text-align:left;padding:8px;color:#888;font-size:12px;">Change</th>
    <th style="text-align:left;padding:8px;color:#888;font-size:12px;">Reason</th>
  </tr></thead><tbody>`;
  for (const h of history) {
    const delta = h.delta || '0';
    const dcls = delta.startsWith('+') ? 'positive' : delta.startsWith('-') ? 'negative' : 'neutral';
    html += `<tr style="border-bottom:1px solid #222;">
      <td style="padding:8px;font-size:13px;">${h.date || ''}</td>
      <td style="padding:8px;font-family:monospace;font-size:13px;color:${convictionColor(h.score)};">${h.score}</td>
      <td style="padding:8px;font-size:13px;">${h.band || ''}</td>
      <td style="padding:8px;font-family:monospace;font-size:13px;" class="${dcls}">${delta}</td>
      <td style="padding:8px;font-size:12px;color:#888;">${h.reason || ''}</td>
    </tr>`;
  }
  html += `</tbody></table></div></div>`;
  return html;
}
());