/* DYOR HQ — main.js */

(function () {
  'use strict';

  // ─── Homepage: Load & render report cards ─────────────────────────────────

  const grid = document.getElementById('reports-grid');
  const searchInput = document.getElementById('search');
  const filterBtns = document.querySelectorAll('.filter-btn[data-rec]');
  const countEl = document.getElementById('report-count');

  if (!grid) return; // Not on homepage

  let allReports = [];
  let activeFilter = 'ALL';

  // Conviction ring circumference: r=22 → c = 2π×22 ≈ 138.23
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
    const cls = recClass(report.recommendation);
    const color = convictionColor(report.conviction);
    const dashOffset = CIRC * (1 - (report.conviction / 100));

    return `
      <a href="reports/${report.file}" class="report-card rec-${cls}">
        <div class="card-header">
          <div class="card-company">
            <div class="card-ticker">${report.ticker}</div>
            <div class="card-name">${report.company}</div>
          </div>
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
        </div>
        <div class="card-meta">
          <span class="rec-badge ${cls}">${report.recommendation}</span>
          <span class="card-date">${formatDate(report.date)}</span>
        </div>
        <p class="card-summary">${report.summary}</p>
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
      countEl.textContent = reports.length === allReports.length
        ? `${allReports.length} report${allReports.length !== 1 ? 's' : ''}`
        : `${reports.length} of ${allReports.length}`;
    }
  }

  function applyFilters() {
    const q = (searchInput ? searchInput.value.toLowerCase().trim() : '');
    let result = allReports;

    if (activeFilter !== 'ALL') {
      result = result.filter(r => r.recommendation.toUpperCase() === activeFilter);
    }

    if (q) {
      result = result.filter(r =>
        r.company.toLowerCase().includes(q) ||
        r.ticker.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q)
      );
    }

    renderGrid(result);
  }

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

  // Load reports from JSON
  fetch('reports/index.json')
    .then(r => {
      if (!r.ok) throw new Error('Failed to load reports index');
      return r.json();
    })
    .then(data => {
      // Sort newest first
      allReports = data.sort((a, b) => new Date(b.date) - new Date(a.date));
      renderGrid(allReports);
    })
    .catch(err => {
      console.error(err);
      grid.innerHTML = '<div class="empty-state"><p>Could not load reports. Check that reports/index.json exists.</p></div>';
    });

})();
