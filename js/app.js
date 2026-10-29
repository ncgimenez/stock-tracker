// --- REVOLUT STOCK TRACKER (HYBRID: LOCAL SERVER & GITHUB PAGES) ---

// Application State
let portfolio = null;
let currentDays = 7;
let currentSort = 'gain_desc';
let searchDebounceTimer = null;
let isGitHubPagesMode = false;

// Default initial positions for first-time launch on GitHub Pages
const DEFAULT_STORAGE = {
  settings: {
    currency: 'EUR',
    profitTargetPercent: 15,
    stopLossPercent: -10,
    consecutiveDownDaysAlert: 3,
    consecutiveUpDaysAlert: 3,
    dipBuyThresholdPercent: -3,
    defaultPeriodDays: 7
  },
  positions: [
    {
      id: 'pos_apple',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      buyDate: '2026-09-15',
      buyPrice: 225.50,
      shares: 2.5,
      investedAmount: 563.75,
      currency: 'USD',
      notes: 'Achat Revolut'
    },
    {
      id: 'pos_nvidia',
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      buyDate: '2026-10-01',
      buyPrice: 120.00,
      shares: 4,
      investedAmount: 480.00,
      currency: 'USD',
      notes: 'Tech IA'
    },
    {
      id: 'pos_lvmh',
      symbol: 'MC.PA',
      name: 'LVMH Moët Hennessy',
      buyDate: '2026-08-20',
      buyPrice: 640.00,
      shares: 0.5,
      investedAmount: 320.00,
      currency: 'EUR',
      notes: 'Luxe'
    }
  ]
};

// In-memory cache for client-side queries
const clientCache = {
  quotes: new Map(),
  rates: new Map()
};

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

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  setupEventListeners();

  // Detect mode: Check if local backend API exists
  try {
    const testRes = await fetch('/api/portfolio', { signal: AbortSignal.timeout(1500) });
    if (testRes.ok) {
      isGitHubPagesMode = false;
      console.log('Mode: Serveur local Node.js actif');
    } else {
      isGitHubPagesMode = true;
      console.log('Mode: Navigateur / GitHub Pages actif (Client-side)');
    }
  } catch (e) {
    isGitHubPagesMode = true;
    console.log('Mode: Navigateur / GitHub Pages actif (Client-side)');
  }

  loadPortfolio();
});

// Setup Events
function setupEventListeners() {
  document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);

  document.getElementById('refreshBtn').addEventListener('click', () => {
    clientCache.quotes.clear();
    clientCache.rates.clear();
    loadPortfolio(true);
  });

  document.getElementById('timeframePills').addEventListener('click', (e) => {
    const btn = e.target.closest('.pill-btn');
    if (!btn) return;
    document.querySelectorAll('#timeframePills .pill-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentDays = parseInt(btn.dataset.days, 10);
    renderPositions();
  });

  document.getElementById('sortSelect').addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderPositions();
  });

  document.getElementById('addPositionBtn').addEventListener('click', () => openPositionModal());
  document.getElementById('modalCloseBtn').addEventListener('click', () => closePositionModal());
  document.getElementById('modalCancelBtn').addEventListener('click', () => closePositionModal());

  document.getElementById('settingsBtn').addEventListener('click', () => openSettingsModal());
  document.getElementById('settingsCloseBtn').addEventListener('click', () => closeSettingsModal());
  document.getElementById('settingsSaveBtn').addEventListener('click', saveSettings);
  document.getElementById('settingsResetBtn').addEventListener('click', resetSettings);

  // Export / Import
  const exportBtn = document.getElementById('exportDataBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportData);
  const importBtn = document.getElementById('importDataBtn');
  if (importBtn) importBtn.addEventListener('click', importData);

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

  posSearchInput.addEventListener('input', handleSearchInput);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-input-wrapper')) {
      autocompleteDropdown.style.display = 'none';
    }
  });

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

  positionForm.addEventListener('submit', handleFormSubmit);
}

// --- DATA ACCESS LAYER (HYBRID) ---

function getLocalData() {
  const raw = localStorage.getItem('revolut_tracker_data');
  if (!raw) {
    localStorage.setItem('revolut_tracker_data', JSON.stringify(DEFAULT_STORAGE));
    return DEFAULT_STORAGE;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return DEFAULT_STORAGE;
  }
}

function saveLocalData(data) {
  localStorage.setItem('revolut_tracker_data', JSON.stringify(data));
}

// Client-side Yahoo Finance fetcher using CORS-enabled proxy
async function fetchClientChart(symbol) {
  if (clientCache.quotes.has(symbol)) {
    return clientCache.quotes.get(symbol);
  }

  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`;
  const proxyUrl = `https://proxy.cors.dev/${targetUrl}`;

  let res;
  try {
    res = await fetch(proxyUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  } catch (err) {
    res = await fetch(targetUrl);
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Données indisponibles pour ${symbol}`);

  const meta = result.meta || {};
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const closes = quote.close || [];

  const validDaily = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c !== null && c !== undefined && !isNaN(c)) {
      validDaily.push({
        timestamp: timestamps[i] * 1000,
        dateStr: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
        close: c
      });
    }
  }

  const currentPrice = meta.regularMarketPrice || (validDaily.length ? validDaily[validDaily.length - 1].close : 0);

  const payload = {
    symbol: meta.symbol || symbol,
    shortName: meta.shortName || meta.longName || symbol,
    currency: (meta.currency || 'USD').toUpperCase(),
    currentPrice,
    previousClose: meta.chartPreviousClose || (validDaily.length > 1 ? validDaily[validDaily.length - 2].close : currentPrice),
    history: validDaily,
  };

  clientCache.quotes.set(symbol, payload);
  return payload;
}

// Client-side Currency rate to EUR
async function getClientRateToEUR(fromCurrency) {
  const cur = (fromCurrency || 'EUR').toUpperCase();
  if (cur === 'EUR') return 1.0;

  if (clientCache.rates.has(cur)) {
    return clientCache.rates.get(cur);
  }

  try {
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/EUR${cur}=X?range=1d&interval=1d`;
    const proxyUrl = `https://proxy.cors.dev/${targetUrl}`;
    const res = await fetch(proxyUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const json = await res.json();
    const eurToCur = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (eurToCur && eurToCur > 0) {
      const curToEur = 1 / eurToCur;
      clientCache.rates.set(cur, curToEur);
      return curToEur;
    }
  } catch (e) {
    console.warn(`Taux live non disponible pour ${cur}, estimation standard.`);
  }

  const fallbacks = { USD: 0.92, GBP: 1.18, CHF: 1.05 };
  return fallbacks[cur] || 1.0;
}

// Suggestions engine
function evaluateSuggestionClient(totalGainPercent, todayChangePercent, consecutiveUp, consecutiveDown, settings) {
  const targetProfit = settings.profitTargetPercent ?? 15;
  const stopLoss = settings.stopLossPercent ?? -10;
  const downAlertDays = settings.consecutiveDownDaysAlert ?? 3;

  if (totalGainPercent <= stopLoss) {
    return {
      action: 'SELL_STOP_LOSS',
      label: 'Stop-Loss / Couper',
      badgeClass: 'badge-danger',
      reason: `Perte globale de ${totalGainPercent.toFixed(1)}% (seuil stop-loss: ${stopLoss}%). Envisagez de couper la position pour limiter les pertes.`
    };
  }

  if (totalGainPercent >= targetProfit) {
    if (consecutiveDown >= 1 || todayChangePercent < -1.0) {
      return {
        action: 'TAKE_PROFIT',
        label: 'Prendre des bénéfices',
        badgeClass: 'badge-warning',
        reason: `Objectif de gain atteint (+${totalGainPercent.toFixed(1)}% vs cible +${targetProfit}%) et repli récent. Excellent timing pour sécuriser tout ou partie des gains.`
      };
    } else {
      return {
        action: 'TARGET_REACHED',
        label: 'Objectif atteint',
        badgeClass: 'badge-gold',
        reason: `Superbe performance (+${totalGainPercent.toFixed(1)}%). Objectif (+${targetProfit}%) dépassé. Préparez-vous à sécuriser au premier essoufflement.`
      };
    }
  }

  if (consecutiveDown >= downAlertDays) {
    return {
      action: 'WATCH_DOWNTREND',
      label: `Alerte baisse (${consecutiveDown}j)`,
      badgeClass: 'badge-orange',
      reason: `${consecutiveDown} séances consécutives de baisse. Vos gains s'effritent de jour en jour : surveillez attentivement.`
    };
  }

  if (totalGainPercent > 3 && consecutiveDown >= 2 && todayChangePercent < -2.0) {
    return {
      action: 'BUY_DIP',
      label: 'Opportunité / Renforcer',
      badgeClass: 'badge-blue',
      reason: `Position globalement haussière (+${totalGainPercent.toFixed(1)}%) subissant un repli court terme. Opportunité potentielle de renfort à moindre coût.`
    };
  }

  if (consecutiveUp >= 2) {
    return {
      action: 'HOLD_BULLISH',
      label: `Garder (Hausse ${consecutiveUp}j)`,
      badgeClass: 'badge-success',
      reason: `Excellente dynamique : ${consecutiveUp} jours d'affilée dans le vert. Conservez la position.`
    };
  }

  return {
    action: 'HOLD',
    label: 'Garder',
    badgeClass: 'badge-neutral',
    reason: `Tendance neutre ou stable. Aucune alerte déclenchée, conservez la position.`
  };
}

// Client-side enriched portfolio builder
async function buildClientPortfolio() {
  const local = getLocalData();
  const settings = local.settings || {};
  const positions = local.positions || [];

  const enrichedPositions = [];
  let totalInvestedEur = 0;
  let totalCurrentValueEur = 0;
  let totalDayGainEur = 0;

  for (const pos of positions) {
    try {
      const chart = await fetchClientChart(pos.symbol);
      const toEurRate = await getClientRateToEUR(chart.currency);

      const shares = parseFloat(pos.shares) || 0;
      const buyPrice = parseFloat(pos.buyPrice) || 0;
      const investedEur = parseFloat(pos.investedAmount) || (shares * buyPrice * toEurRate);

      const currentPrice = chart.currentPrice;
      const currentPriceEur = currentPrice * toEurRate;
      const currentValueEur = shares * currentPriceEur;

      const totalGainEur = currentValueEur - investedEur;
      const totalGainPercent = investedEur > 0 ? (totalGainEur / investedEur) * 100 : 0;

      const fullHistory = chart.history || [];
      const daysCount = Math.min(fullHistory.length, 30);
      const recentHistory = fullHistory.slice(fullHistory.length - daysCount);

      const dailyBreakdown = [];
      for (let i = 0; i < recentHistory.length; i++) {
        const day = recentHistory[i];
        const prevDay = i > 0 ? recentHistory[i - 1] : null;

        const dayClose = day.close;
        const prevClose = prevDay ? prevDay.close : dayClose;
        const changeVal = dayClose - prevClose;
        const changePct = prevClose > 0 ? (changeVal / prevClose) * 100 : 0;

        let trend = 'flat';
        if (changeVal > 0.005) trend = 'up';
        else if (changeVal < -0.005) trend = 'down';

        const dayValueEur = shares * dayClose * toEurRate;
        const dayGainFromBuyEur = dayValueEur - investedEur;
        const dayGainFromBuyPct = investedEur > 0 ? (dayGainFromBuyEur / investedEur) * 100 : 0;

        dailyBreakdown.push({
          dateStr: day.dateStr,
          timestamp: day.timestamp,
          close: dayClose,
          closeEur: dayClose * toEurRate,
          changeVal,
          changePct,
          trend,
          dayValueEur,
          dayGainFromBuyEur,
          dayGainFromBuyPct
        });
      }

      let consecutiveUp = 0;
      let consecutiveDown = 0;
      for (let i = dailyBreakdown.length - 1; i >= 1; i--) {
        const trend = dailyBreakdown[i].trend;
        if (i === dailyBreakdown.length - 1) {
          if (trend === 'up') consecutiveUp++;
          else if (trend === 'down') consecutiveDown++;
          else break;
        } else {
          if (consecutiveUp > 0 && trend === 'up') consecutiveUp++;
          else if (consecutiveDown > 0 && trend === 'down') consecutiveDown++;
          else break;
        }
      }

      const lastDay = dailyBreakdown[dailyBreakdown.length - 1] || {};
      const todayChangePercent = lastDay.changePct || 0;
      const todayChangeEur = (lastDay.changeVal || 0) * shares * toEurRate;

      const suggestion = evaluateSuggestionClient(
        totalGainPercent,
        todayChangePercent,
        consecutiveUp,
        consecutiveDown,
        settings
      );

      totalInvestedEur += investedEur;
      totalCurrentValueEur += currentValueEur;
      totalDayGainEur += todayChangeEur;

      enrichedPositions.push({
        id: pos.id,
        symbol: pos.symbol,
        name: pos.name || chart.shortName,
        buyDate: pos.buyDate,
        buyPrice: buyPrice,
        shares: shares,
        investedEur: investedEur,
        currency: chart.currency,
        currentPrice: currentPrice,
        currentPriceEur: currentPriceEur,
        currentValueEur: currentValueEur,
        totalGainEur: totalGainEur,
        totalGainPercent: totalGainPercent,
        todayChangePercent: todayChangePercent,
        todayChangeEur: todayChangeEur,
        consecutiveUp,
        consecutiveDown,
        suggestion,
        dailyBreakdown,
        notes: pos.notes || ''
      });
    } catch (err) {
      console.warn(`Erreur calcul pour ${pos.symbol}:`, err.message);
      enrichedPositions.push({
        id: pos.id,
        symbol: pos.symbol,
        name: pos.name || pos.symbol,
        buyDate: pos.buyDate,
        buyPrice: pos.buyPrice,
        shares: pos.shares,
        investedEur: pos.investedAmount || 0,
        currency: pos.currency || 'EUR',
        currentPrice: pos.buyPrice,
        currentValueEur: pos.investedAmount || 0,
        totalGainEur: 0,
        totalGainPercent: 0,
        todayChangePercent: 0,
        todayChangeEur: 0,
        consecutiveUp: 0,
        consecutiveDown: 0,
        suggestion: {
          action: 'HOLD',
          label: 'Garder',
          badgeClass: 'badge-neutral',
          reason: 'Données en cours de synchronisation.'
        },
        dailyBreakdown: [],
        notes: pos.notes || ''
      });
    }
  }

  const totalGainEur = totalCurrentValueEur - totalInvestedEur;
  const totalGainPercent = totalInvestedEur > 0 ? (totalGainEur / totalInvestedEur) * 100 : 0;
  const totalDayGainPercent = totalCurrentValueEur > 0 && (totalCurrentValueEur - totalDayGainEur) > 0
    ? (totalDayGainEur / (totalCurrentValueEur - totalDayGainEur)) * 100
    : 0;

  return {
    summary: {
      totalInvestedEur,
      totalCurrentValueEur,
      totalGainEur,
      totalGainPercent,
      totalDayGainEur,
      totalDayGainPercent,
      positionsCount: enrichedPositions.length,
      lastSync: new Date().toISOString()
    },
    settings,
    positions: enrichedPositions
  };
}

// --- LOAD PORTFOLIO ---
async function loadPortfolio(forceRefresh = false) {
  positionsContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Synchronisation avec les cours des marchés...</p>
    </div>
  `;

  try {
    if (isGitHubPagesMode) {
      portfolio = await buildClientPortfolio();
    } else {
      const res = await fetch(`/api/portfolio${forceRefresh ? '?refresh=true' : ''}`);
      if (!res.ok) throw new Error('API locale inaccessible');
      portfolio = await res.json();
    }
    renderSummary();
    renderPositions();
  } catch (err) {
    if (!isGitHubPagesMode) {
      console.warn('Bascule automatique en mode Client / GitHub Pages');
      isGitHubPagesMode = true;
      loadPortfolio(forceRefresh);
      return;
    }
    positionsContainer.innerHTML = `
      <div class="empty-state">
        <p>Impossible de charger le portefeuille : ${err.message}</p>
        <button class="btn btn-secondary" onclick="loadPortfolio(true)" style="margin-top: 12px;">Réessayer</button>
      </div>
    `;
  }
}

// --- RENDER FUNCTIONS ---
function renderSummary() {
  if (!portfolio || !portfolio.summary) return;
  const s = portfolio.summary;

  totalCurrentValueEl.textContent = eurFormat.format(s.totalCurrentValueEur).replace('€', '').trim();
  totalInvestedTextEl.textContent = `Investi : ${eurFormat.format(s.totalInvestedEur)}`;

  const signTotal = s.totalGainEur >= 0 ? '+' : '';
  totalGainEurEl.textContent = `${signTotal}${eurFormat.format(s.totalGainEur)}`;
  totalGainPctBadgeEl.textContent = pctFormat(s.totalGainPercent);
  totalGainPctBadgeEl.className = `pill-badge ${s.totalGainEur >= 0 ? 'up' : 'down'}`;

  const signDay = s.totalDayGainEur >= 0 ? '+' : '';
  totalDayGainEurEl.textContent = `${signDay}${eurFormat.format(s.totalDayGainEur)}`;
  totalDayGainPctBadgeEl.textContent = pctFormat(s.totalDayGainPercent);
  totalDayGainPctBadgeEl.className = `pill-badge ${s.totalDayGainEur >= 0 ? 'up' : 'down'}`;

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

    const history = pos.dailyBreakdown || [];
    const slicedHistory = history.slice(Math.max(0, history.length - currentDays));
    const reversedHistory = [...slicedHistory].reverse();

    let streakHtml = '';
    if (pos.consecutiveUp >= 2) {
      streakHtml = `<span class="streak-tag streak-up">🔥 ${pos.consecutiveUp} jours de hausse d'affilée</span>`;
    } else if (pos.consecutiveDown >= 2) {
      streakHtml = `<span class="streak-tag streak-down">❄️ ${pos.consecutiveDown} jours de baisse consécutive</span>`;
    }

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

        <div class="suggestion-banner ${bannerClass}">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="suggestion-badge ${sug.badgeClass || 'badge-neutral'}">
              ${escapeHtml(sug.label || 'GARDER')}
            </span>
            <span class="suggestion-reason">${escapeHtml(sug.reason || '')}</span>
          </div>
        </div>

        <div class="day-strip-wrapper">
          <div class="strip-header">
            <span class="strip-title">Progression jour par jour (${currentDays} derniers jours)</span>
            ${streakHtml}
          </div>
          <div class="day-strip">
            ${daysHtml}
          </div>
        </div>

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

// --- AUTOCOMPLETE SEARCH ---
function handleSearchInput(e) {
  const query = e.target.value.trim();
  clearTimeout(searchDebounceTimer);

  if (query.length < 1) {
    autocompleteDropdown.style.display = 'none';
    return;
  }

  searchDebounceTimer = setTimeout(async () => {
    try {
      let results = [];
      if (isGitHubPagesMode) {
        const targetUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=6&newsCount=0`;
        const proxyUrl = `https://proxy.cors.dev/${targetUrl}`;
        const res = await fetch(proxyUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const data = await res.json();
        results = (data.quotes || []).map(item => ({
          symbol: item.symbol,
          name: item.shortname || item.longname || item.symbol,
          type: item.quoteType
        }));
      } else {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        results = await res.json();
      }

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

// --- MODALS ---
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

  const newPos = {
    id: 'pos_' + Date.now(),
    symbol: symbol.trim().toUpperCase(),
    name: name || symbol.trim().toUpperCase(),
    buyDate,
    currency,
    investedAmount,
    shares,
    buyPrice,
    notes
  };

  try {
    if (isGitHubPagesMode) {
      const local = getLocalData();
      local.positions = local.positions || [];
      local.positions.unshift(newPos);
      saveLocalData(local);
    } else {
      const res = await fetch('/api/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPos)
      });
      if (!res.ok) throw new Error('Erreur API');
    }
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
    if (isGitHubPagesMode) {
      const local = getLocalData();
      local.positions = (local.positions || []).filter(p => p.id !== id);
      saveLocalData(local);
    } else {
      const res = await fetch(`/api/positions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erreur de suppression');
    }
    loadPortfolio();
  } catch (err) {
    alert('Erreur: ' + err.message);
  }
};

// --- SETTINGS ---
async function openSettingsModal() {
  try {
    let settings = {};
    if (isGitHubPagesMode) {
      settings = getLocalData().settings || {};
    } else {
      const res = await fetch('/api/settings');
      settings = await res.json();
    }

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
    if (isGitHubPagesMode) {
      const local = getLocalData();
      local.settings = { ...local.settings, ...payload };
      saveLocalData(local);
    } else {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Erreur');
    }
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

// Export / Import
function exportData() {
  const data = isGitHubPagesMode ? getLocalData() : { positions: portfolio?.positions || [] };
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `revolut-portfolio-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData() {
  const input = prompt('Collez votre JSON de sauvegarde ici :');
  if (!input) return;
  try {
    const parsed = JSON.parse(input);
    if (parsed && (parsed.positions || Array.isArray(parsed))) {
      const formatted = {
        settings: parsed.settings || DEFAULT_STORAGE.settings,
        positions: Array.isArray(parsed) ? parsed : (parsed.positions || [])
      };
      saveLocalData(formatted);
      alert('Positions importées avec succès !');
      closeSettingsModal();
      loadPortfolio(true);
    } else {
      alert('Format JSON non reconnu.');
    }
  } catch (e) {
    alert('Erreur: JSON invalide.');
  }
}

// --- THEME ---
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

// Utility
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
