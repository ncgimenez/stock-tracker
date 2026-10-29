// State
let portfolio = null;
let currentDays = 7;
let currentSort = 'gain_desc';
let searchDebounceTimer = null;

// DOM Elements
const positionsContainer = document.getElementById('positionsContainer');
const totalCurrentValueEl = document.getElementById('totalCurrentValue');
const totalInvestedTextEl = document.getElementById('totalInvestedText');
const totalGainEurEl = document.getElementById('totalGainEur');
const totalGainPctBadgeEl = document.getElementById('totalGainPctBadge');
const totalDayGainEurEl = document.getElementById('totalDayGainEur');
const totalDayGainPctBadgeEl = document.getElementById('totalDayGainPctBadge');
const signalsSummaryEl = document.getElementById('signalsSummary');
const positionsCountTextEl = document.getElementById('positionsCountText');

// Modals
const positionModal = document.getElementById('positionModal');
const settingsModal = document.getElementById('settingsModal');
const positionForm = document.getElementById('positionForm');
const autocompleteDropdown = document.getElementById('autocompleteDropdown');
const posSearchInput = document.getElementById('posSearch');

// Formatters
const eurFormat = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const pctFormat = (val) => {
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
};

const formatDateFR = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatDayLabel = (dateStr, indexFromEnd) => {
  if (indexFromEnd === 0) return "Aujourd'hui";
  if (indexFromEnd === 1) return "Hier";
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
};

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupEventListeners();
  loadPortfolio();
});

// Setup Events
function setupEventListeners() {
  // Theme toggle
  document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);

  // Refresh
  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadPortfolio(true);
  });

  // Timeframe pills
  document.getElementById('timeframePills').addEventListener('click', (e) => {
    const btn = e.target.closest('.pill-btn');
    if (!btn) return;
    document.querySelectorAll('#timeframePills .pill-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentDays = parseInt(btn.dataset.days, 10);
    renderPositions();
  });

  // Sort
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderPositions();
  });

  // Add position modal
  document.getElementById('addPositionBtn').addEventListener('click', () => openPositionModal());
  document.getElementById('modalCloseBtn').addEventListener('click', () => closePositionModal());
  document.getElementById('modalCancelBtn').addEventListener('click', () => closePositionModal());

  // Settings modal
  document.getElementById('settingsBtn').addEventListener('click', () => openSettingsModal());
  document.getElementById('settingsCloseBtn').addEventListener('click', () => closeSettingsModal());
  document.getElementById('settingsSaveBtn').addEventListener('click', saveSettings);
  document.getElementById('settingsResetBtn').addEventListener('click', resetSettings);

  // Settings sliders input listeners
  const targetProfitRange = document.getElementById('targetProfitRange');
  const stopLossRange = document.getElementById('stopLossRange');
  const downDaysRange = document.getElementById('downDaysRange');

  targetProfitRange.addEventListener('input', (e) => {
    document.getElementById('targetProfitVal').textContent = `+${e.target.value}%`;
  });
  stopLossRange.addEventListener('input', (e) => {
    document.getElementById('stopLossVal').textContent = `${e.target.value}%`;
  });
  downDaysRange.addEventListener('input', (e) => {
    document.getElementById('downDaysVal').textContent = `${e.target.value} jours`;
  });

  // Autocomplete search input
  posSearchInput.addEventListener('input', handleSearchInput);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-input-wrapper')) {
      autocompleteDropdown.style.display = 'none';
    }
  });

  // Auto calculate unit price
  const investedInput = document.getElementById('posInvestedAmount');
  const sharesInput = document.getElementById('posShares');
  const unitPriceInput = document.getElementById('posBuyPrice');

  const updateUnitPrice = () => {
    const inv = parseFloat(investedInput.value);
    const sh = parseFloat(sharesInput.value);
    if (inv > 0 && sh > 0) {
      unitPriceInput.value = (inv / sh).toFixed(2);
    } else {
      unitPriceInput.value = '';
    }
  };
  investedInput.addEventListener('input', updateUnitPrice);
  sharesInput.addEventListener('input', updateUnitPrice);

  // Form submit
  positionForm.addEventListener('submit', handleFormSubmit);
}

// Fetch Portfolio
async function loadPortfolio(forceRefresh = false) {
  positionsContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Synchronisation avec les cours des marchés...</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/portfolio${forceRefresh ? '?refresh=true' : ''}`);
    if (!res.ok) throw new Error('Erreur de chargement');
    portfolio = await res.json();
    renderSummary();
    renderPositions();
  } catch (err) {
    positionsContainer.innerHTML = `
      <div class="empty-state">
        <p>Impossible de charger le portefeuille : ${err.message}</p>
        <button class="btn btn-secondary" onclick="loadPortfolio(true)" style="margin-top: 12px;">Réessayer</button>
      </div>
    `;
  }
}

// Render Header Summary
function renderSummary() {
  if (!portfolio || !portfolio.summary) return;
  const s = portfolio.summary;

  totalCurrentValueEl.textContent = eurFormat.format(s.totalCurrentValueEur).replace('€', '').trim();
  totalInvestedTextEl.textContent = `Investi : ${eurFormat.format(s.totalInvestedEur)}`;

  // Total Gain
  const signTotal = s.totalGainEur >= 0 ? '+' : '';
  totalGainEurEl.textContent = `${signTotal}${eurFormat.format(s.totalGainEur)}`;
  totalGainPctBadgeEl.textContent = pctFormat(s.totalGainPercent);
  totalGainPctBadgeEl.className = `pill-badge ${s.totalGainEur >= 0 ? 'up' : 'down'}`;

  // Today Gain
  const signDay = s.totalDayGainEur >= 0 ? '+' : '';
  totalDayGainEurEl.textContent = `${signDay}${eurFormat.format(s.totalDayGainEur)}`;
  totalDayGainPctBadgeEl.textContent = pctFormat(s.totalDayGainPercent);
  totalDayGainPctBadgeEl.className = `pill-badge ${s.totalDayGainEur >= 0 ? 'up' : 'down'}`;

  // Signals Count
  const counts = { hold: 0, profit: 0, alert: 0 };
  portfolio.positions.forEach(p => {
    const action = p.suggestion?.action;
    if (action === 'HOLD' || action === 'HOLD_BULLISH') counts.hold++;
    else if (action === 'TAKE_PROFIT' || action === 'TARGET_REACHED') counts.profit++;
    else counts.alert++;
  });

  signalsSummaryEl.innerHTML = `
    <span class="signal-item signal-hold">${counts.hold} Garder</span>
    <span class="signal-item signal-profit">${counts.profit} Sécuriser</span>
    <span class="signal-item signal-alert">${counts.alert} Attention/Couper</span>
  `;

  positionsCountTextEl.textContent = `${s.positionsCount} position${s.positionsCount > 1 ? 's' : ''} suivie${s.positionsCount > 1 ? 's' : ''}`;
}

// Render Position Cards
function renderPositions() {
  if (!portfolio || !portfolio.positions) return;

  if (portfolio.positions.length === 0) {
    positionsContainer.innerHTML = `
      <div class="empty-state">
        <h3 style="margin-bottom: 8px; color: var(--text-main);">Aucun investissement enregistré</h3>
        <p>Ajoutez votre première action ou crypto achetée sur Revolut pour démarrer le suivi.</p>
        <button class="btn btn-primary" onclick="openPositionModal()" style="margin-top: 16px;">+ Ajouter un achat</button>
      </div>
    `;
    return;
  }

  // Sort positions
  const sorted = [...portfolio.positions].sort((a, b) => {
    if (currentSort === 'gain_desc') return b.totalGainPercent - a.totalGainPercent;
    if (currentSort === 'gain_asc') return a.totalGainPercent - b.totalGainPercent;
    if (currentSort === 'today_desc') return b.todayChangePercent - a.todayChangePercent;
    if (currentSort === 'today_asc') return a.todayChangePercent - b.todayChangePercent;
    if (currentSort === 'name_asc') return a.name.localeCompare(b.name);
    return 0;
  });

  positionsContainer.innerHTML = sorted.map(pos => {
    const sug = pos.suggestion || {};
    const bannerClass = getBannerClass(sug.action);

    // Filter day history for selected timeframe
    const history = pos.dailyBreakdown || [];
    const slicedHistory = history.slice(Math.max(0, history.length - currentDays));

    // Reverse to show most recent days first (Today, Yesterday, Day-2...)
    const reversedHistory = [...slicedHistory].reverse();

    // Streak badge
    let streakHtml = '';
    if (pos.consecutiveUp >= 2) {
      streakHtml = `<span class="streak-tag streak-up">🔥 ${pos.consecutiveUp} jours de hausse d'affilée</span>`;
    } else if (pos.consecutiveDown >= 2) {
      streakHtml = `<span class="streak-tag streak-down">❄️ ${pos.consecutiveDown} jours de baisse consécutive</span>`;
    }

    // Daily breakdown cells
    const daysHtml = reversedHistory.map((day, idx) => {
      const isUp = day.changePct > 0.005;
      const isDown = day.changePct < -0.005;
      const trendClass = isUp ? 'trend-up' : (isDown ? 'trend-down' : 'trend-flat');
      const changeClass = isUp ? 'up' : (isDown ? 'down' : 'flat');
      const arrow = isUp ? '▲' : (isDown ? '▼' : '—');
      const dayLabel = formatDayLabel(day.dateStr, idx);

      return `
        <div class="day-cell ${trendClass}">
          <span class="day-cell-date">${dayLabel}</span>
          <span class="day-cell-close">${eurFormat.format(day.closeEur)}</span>
          <span class="day-cell-change ${changeClass}">
            ${arrow} ${pctFormat(day.changePct)}
          </span>
          <span class="day-cell-val">Portefeuille: ${eurFormat.format(day.dayValueEur)}</span>
        </div>
      `;
    }).join('');

    return `
      <article class="pos-card" data-id="${pos.id}">
        <!-- Top Row -->
        <div class="pos-top-row">
          <div class="pos-identity">
            <span class="pos-symbol-pill">${escapeHtml(pos.symbol)}</span>
            <div>
              <h3 class="pos-name">${escapeHtml(pos.name)}</h3>
              <p class="pos-meta">Acheté le ${formatDateFR(pos.buyDate)} • ${pos.shares} parts @ ${pos.buyPrice.toFixed(2)} ${pos.currency}</p>
            </div>
          </div>

          <div class="pos-metrics-group">
            <div class="pos-metric-box">
              <span class="metric-label">Investi</span>
              <span class="metric-value">${eurFormat.format(pos.investedEur)}</span>
            </div>
            <div class="pos-metric-box">
              <span class="metric-label">Valeur Actuelle</span>
              <span class="metric-value">${eurFormat.format(pos.currentValueEur)}</span>
            </div>
            <div class="pos-metric-box">
              <span class="metric-label">Gain Total</span>
              <span class="pill-badge ${pos.totalGainEur >= 0 ? 'up' : 'down'}">
                ${pos.totalGainEur >= 0 ? '+' : ''}${eurFormat.format(pos.totalGainEur)} (${pctFormat(pos.totalGainPercent)})
              </span>
            </div>
          </div>
        </div>

        <!-- Suggestion Banner -->
        <div class="suggestion-banner ${bannerClass}">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="suggestion-badge ${sug.badgeClass || 'badge-neutral'}">
              ${escapeHtml(sug.label || 'GARDER')}
            </span>
            <span class="suggestion-reason">${escapeHtml(sug.reason || '')}</span>
          </div>
        </div>

        <!-- Day-by-Day Strip (No charts) -->
        <div class="day-strip-wrapper">
          <div class="strip-header">
            <span class="strip-title">Progression jour par jour (${currentDays} derniers jours)</span>
            ${streakHtml}
          </div>
          <div class="day-strip">
            ${daysHtml}
          </div>
        </div>

        <!-- Card Footer -->
        <div class="pos-footer">
          <span>${pos.notes ? `📝 <em>${escapeHtml(pos.notes)}</em>` : 'Aucune note'}</span>
          <div class="pos-actions">
            <button class="btn-ghost-danger" onclick="deletePosition('${pos.id}', '${pos.symbol}')">Supprimer</button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function getBannerClass(action) {
  switch (action) {
    case 'HOLD':
    case 'HOLD_BULLISH':
      return 'banner-success';
    case 'TAKE_PROFIT':
      return 'banner-warning';
    case 'TARGET_REACHED':
      return 'banner-gold';
    case 'WATCH_DOWNTREND':
      return 'banner-orange';
    case 'SELL_STOP_LOSS':
      return 'banner-danger';
    case 'BUY_DIP':
      return 'banner-blue';
    default:
      return 'banner-neutral';
  }
}

// Autocomplete Search
function handleSearchInput(e) {
  const query = e.target.value.trim();
  clearTimeout(searchDebounceTimer);

  if (query.length < 1) {
    autocompleteDropdown.style.display = 'none';
    return;
  }

  searchDebounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const results = await res.json();

      if (!results || results.length === 0) {
        autocompleteDropdown.innerHTML = `<div class="autocomplete-item"><span class="item-name">Aucun résultat trouvé</span></div>`;
        autocompleteDropdown.style.display = 'block';
        return;
      }

      autocompleteDropdown.innerHTML = results.map(item => `
        <div class="autocomplete-item" onclick="selectStock('${item.symbol}', '${escapeJs(item.name)}')">
          <div>
            <span class="item-symbol">${item.symbol}</span>
            <span class="item-name">${item.name}</span>
          </div>
          <span class="item-type">${item.type || 'ACTION'}</span>
        </div>
      `).join('');
      autocompleteDropdown.style.display = 'block';
    } catch (err) {
      console.error('Search error:', err);
    }
  }, 250);
}

window.selectStock = function(symbol, name) {
  document.getElementById('posSymbol').value = symbol;
  document.getElementById('posName').value = name;
  document.getElementById('posSearch').value = `${name} (${symbol})`;
  autocompleteDropdown.style.display = 'none';
};

// Modal Open/Close
window.openPositionModal = function() {
  positionForm.reset();
  document.getElementById('posId').value = '';
  document.getElementById('modalTitle').textContent = 'Ajouter un achat Revolut';
  document.getElementById('posBuyDate').value = new Date().toISOString().split('T')[0];
  autocompleteDropdown.style.display = 'none';
  positionModal.classList.add('active');
};

function closePositionModal() {
  positionModal.classList.remove('active');
}

// Submit Position Form
async function handleFormSubmit(e) {
  e.preventDefault();

  const symbol = document.getElementById('posSymbol').value;
  const name = document.getElementById('posName').value;
  const buyDate = document.getElementById('posBuyDate').value;
  const currency = document.getElementById('posCurrency').value;
  const investedAmount = parseFloat(document.getElementById('posInvestedAmount').value);
  const shares = parseFloat(document.getElementById('posShares').value);
  const buyPrice = parseFloat(document.getElementById('posBuyPrice').value) || 0;
  const notes = document.getElementById('posNotes').value;

  if (!symbol || !buyDate || !investedAmount || !shares) {
    alert('Veuillez remplir les informations requises.');
    return;
  }

  const payload = {
    symbol,
    name,
    buyDate,
    currency,
    investedAmount,
    shares,
    buyPrice,
    notes
  };

  try {
    const res = await fetch('/api/positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Erreur lors de l\'enregistrement');
    closePositionModal();
    loadPortfolio(true);
  } catch (err) {
    alert('Erreur: ' + err.message);
  }
}

// Delete Position
window.deletePosition = async function(id, symbol) {
  if (!confirm(`Supprimer la position ${symbol} du portefeuille ?`)) return;

  try {
    const res = await fetch(`/api/positions/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erreur de suppression');
    loadPortfolio();
  } catch (err) {
    alert('Erreur: ' + err.message);
  }
};

// Settings Modal
async function openSettingsModal() {
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();

    const profit = settings.profitTargetPercent ?? 15;
    const stopLoss = settings.stopLossPercent ?? -10;
    const downDays = settings.consecutiveDownDaysAlert ?? 3;

    document.getElementById('targetProfitRange').value = profit;
    document.getElementById('targetProfitVal').textContent = `+${profit}%`;

    document.getElementById('stopLossRange').value = stopLoss;
    document.getElementById('stopLossVal').textContent = `${stopLoss}%`;

    document.getElementById('downDaysRange').value = downDays;
    document.getElementById('downDaysVal').textContent = `${downDays} jours`;

    settingsModal.classList.add('active');
  } catch (e) {
    console.error('Settings load error:', e);
  }
}

function closeSettingsModal() {
  settingsModal.classList.remove('active');
}

async function saveSettings() {
  const payload = {
    profitTargetPercent: parseFloat(document.getElementById('targetProfitRange').value),
    stopLossPercent: parseFloat(document.getElementById('stopLossRange').value),
    consecutiveDownDaysAlert: parseInt(document.getElementById('downDaysRange').value, 10)
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Erreur');
    closeSettingsModal();
    loadPortfolio(true);
  } catch (err) {
    alert('Erreur lors de l\'enregistrement des critères');
  }
}

function resetSettings() {
  document.getElementById('targetProfitRange').value = 15;
  document.getElementById('targetProfitVal').textContent = '+15%';

  document.getElementById('stopLossRange').value = -10;
  document.getElementById('stopLossVal').textContent = '-10%';

  document.getElementById('downDaysRange').value = 3;
  document.getElementById('downDaysVal').textContent = '3 jours';
}

// Theme Management
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const icon = document.querySelector('.theme-icon');
  if (icon) {
    icon.textContent = theme === 'dark' ? '🌙' : '☀️';
  }
}

// Utility: Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeJs(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'");
}
