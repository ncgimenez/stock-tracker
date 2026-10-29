// --- REVOLUT STOCK TRACKER (ANONYMOUS CLOUD SYNC & PIN SECURITY) ---

// Supabase Configuration
const SUPABASE_URL = 'https://qzpwnuaehqfwunenbjxh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_haY4tLUZ1FeZEwMtpStsjA_zU5bFikW';
let supabaseClient = null;

// Application State
let portfolio = null;
let currentDays = 7;
let currentSort = 'gain_desc';
let searchDebounceTimer = null;
let isRecoveryRevealed = false;

// Default initial positions for first launch
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

// In-memory cache for market queries
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
const securityModal = document.getElementById('securityModal');
const lockModal = document.getElementById('lockModal');
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

// --- HASH HELPER (SHA-256) ---
async function sha256(str) {
  const buf = new TextEncoder().encode(str + "_salt_st_2026");
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- ACCOUNT & IDENTITY MANAGEMENT ---

function getOrCreateAccountId() {
  const urlParams = new URLSearchParams(window.location.search);
  const syncParam = urlParams.get('sync') || urlParams.get('link');
  if (syncParam && syncParam.trim()) {
    const cleanSync = syncParam.trim();
    localStorage.setItem('st_account_id', cleanSync);
    // Clean URL without reload
    window.history.replaceState({}, document.title, window.location.pathname);
    return cleanSync;
  }

  let id = localStorage.getItem('st_account_id');
  if (!id) {
    const rnd = Math.random().toString(36).substring(2, 9);
    const ts = Date.now().toString(36).substring(2, 6);
    id = `st_${rnd}_${ts}`;
    localStorage.setItem('st_account_id', id);
  }
  return id;
}

function getOrCreateRecoveryKey() {
  let key = localStorage.getItem('st_recovery_key');
  if (!key) {
    const part = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    key = `REC-${part()}-${part()}-${part()}`;
    localStorage.setItem('st_recovery_key', key);
  }
  return key;
}

let CURRENT_ACCOUNT_ID = getOrCreateAccountId();
let CURRENT_RECOVERY_KEY = getOrCreateRecoveryKey();

function getAbortSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => {
    try { controller.abort(); } catch (e) {}
  }, ms);
  return controller.signal;
}

// --- INITIALIZATION ---
function startApp() {
  try {
    initTheme();
  } catch (e) {
    console.error('initTheme error:', e);
  }

  try {
    setupEventListeners();
  } catch (e) {
    console.error('setupEventListeners error:', e);
  }

  // Initialize Supabase client
  if (window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (e) {
      console.warn('Supabase non initialisé:', e);
    }
  }

  // Check PIN Lock
  const pinHash = localStorage.getItem('st_pin_hash');
  const isUnlocked = sessionStorage.getItem('st_session_unlocked') === 'true';

  if (pinHash && !isUnlocked) {
    showLockScreen();
  } else {
    initApp();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}

async function initApp() {
  updateSecurityUI();
  // Render immediately from local storage so user NEVER waits
  loadPortfolio();
  // Then sync with cloud in the background
  pullFromCloud().then(() => {
    loadPortfolio();
  }).catch(e => console.warn('Sync cloud non critique:', e));
}

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

  // Modals
  document.getElementById('addPositionBtn').addEventListener('click', () => openPositionModal());
  document.getElementById('modalCloseBtn').addEventListener('click', () => closePositionModal());
  document.getElementById('modalCancelBtn').addEventListener('click', () => closePositionModal());

  document.getElementById('settingsBtn').addEventListener('click', () => openSettingsModal());
  document.getElementById('settingsCloseBtn').addEventListener('click', () => closeSettingsModal());
  document.getElementById('settingsSaveBtn').addEventListener('click', saveSettings);
  document.getElementById('settingsResetBtn').addEventListener('click', resetSettings);

  // Security Modal
  document.getElementById('securityModalBtn').addEventListener('click', openSecurityModal);
  document.getElementById('securityCloseBtn').addEventListener('click', closeSecurityModal);

  // Security Tabs
  document.getElementById('tabMyAccountBtn').addEventListener('click', () => switchSecurityTab('myAccount'));
  document.getElementById('tabPairDeviceBtn').addEventListener('click', () => switchSecurityTab('pairDevice'));
  document.getElementById('tabPinBtn').addEventListener('click', () => switchSecurityTab('pinSetup'));
  document.getElementById('openPinSetupBtn').addEventListener('click', () => switchSecurityTab('pinSetup'));

  // Security Actions
  document.getElementById('copyAccountIdBtn').addEventListener('click', copyAccountId);
  document.getElementById('revealRecoveryBtn').addEventListener('click', toggleRevealRecovery);
  document.getElementById('copyRecoveryBtn').addEventListener('click', copyRecoveryKey);
  document.getElementById('copyDirectLinkBtn').addEventListener('click', copyDirectLink);
  document.getElementById('btnApplyExistingId').addEventListener('click', applyExistingId);

  // PIN Setup
  document.getElementById('btnSaveNewPin').addEventListener('click', saveNewPin);
  document.getElementById('btnRemovePin').addEventListener('click', removePin);
  setupPinAutoAdvance(['newPin1', 'newPin2', 'newPin3', 'newPin4']);

  // PIN Unlock Screen
  setupPinAutoAdvance(['unlockPin1', 'unlockPin2', 'unlockPin3', 'unlockPin4'], checkUnlockPin);
  document.getElementById('btnUseRecoveryKey').addEventListener('click', unlockWithRecoveryKey);

  // Export / Import
  const exportBtn = document.getElementById('exportDataBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportData);
  const importBtn = document.getElementById('importDataBtn');
  if (importBtn) importBtn.addEventListener('click', importData);

  // Sliders
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

  // Autocomplete and auto-sync symbol/name
  posSearchInput.addEventListener('input', (e) => {
    handleSearchInput(e);
    const symInput = document.getElementById('posSymbol');
    const nameInput = document.getElementById('posName');
    const val = e.target.value.trim();
    if (!symInput.value || symInput.dataset.auto === 'true') {
      symInput.value = val.toUpperCase();
      symInput.dataset.auto = 'true';
    }
    if (!nameInput.value || nameInput.dataset.auto === 'true') {
      nameInput.value = val;
      nameInput.dataset.auto = 'true';
    }
  });

  document.getElementById('posSymbol').addEventListener('input', () => {
    document.getElementById('posSymbol').dataset.auto = 'false';
  });
  document.getElementById('posName').addEventListener('input', () => {
    document.getElementById('posName').dataset.auto = 'false';
  });
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

// --- PIN AUTO-ADVANCE HELPER ---
function setupPinAutoAdvance(ids, onComplete) {
  ids.forEach((id, idx) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      if (el.value.length === 1 && idx < ids.length - 1) {
        document.getElementById(ids[idx + 1]).focus();
      }
      if (idx === ids.length - 1 && onComplete) {
        onComplete();
      }
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !el.value && idx > 0) {
        document.getElementById(ids[idx - 1]).focus();
      }
    });
  });
}

// --- LOCK SCREEN & PIN VALIDATION ---

function showLockScreen() {
  lockModal.classList.add('active');
  document.getElementById('unlockError').style.display = 'none';
  ['unlockPin1', 'unlockPin2', 'unlockPin3', 'unlockPin4'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  setTimeout(() => {
    const first = document.getElementById('unlockPin1');
    if (first) first.focus();
  }, 100);
}

async function checkUnlockPin() {
  const pin = ['unlockPin1', 'unlockPin2', 'unlockPin3', 'unlockPin4']
    .map(id => document.getElementById(id).value)
    .join('');

  if (pin.length !== 4) return;

  const enteredHash = await sha256(pin);
  const storedHash = localStorage.getItem('st_pin_hash');

  if (enteredHash === storedHash) {
    sessionStorage.setItem('st_session_unlocked', 'true');
    lockModal.classList.remove('active');
    initApp();
  } else {
    document.getElementById('unlockError').style.display = 'block';
    ['unlockPin1', 'unlockPin2', 'unlockPin3', 'unlockPin4'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('unlockPin1').focus();
  }
}

function unlockWithRecoveryKey() {
  const key = prompt("Entrez votre clé de secours (ex: REC-XXXX-XXXX-XXXX) :");
  if (!key) return;

  const cleanKey = key.trim().toUpperCase();
  if (cleanKey === CURRENT_RECOVERY_KEY.toUpperCase()) {
    alert("Clé de secours validée ! Le code PIN a été réinitialisé.");
    localStorage.removeItem('st_pin_hash');
    sessionStorage.setItem('st_session_unlocked', 'true');
    lockModal.classList.remove('active');
    pushToCloud();
    initApp();
  } else {
    alert("Clé de secours incorrecte.");
  }
}

// --- SECURITY MODAL & PAIRING UI ---

function updateSecurityUI() {
  document.getElementById('displayAccountId').textContent = CURRENT_ACCOUNT_ID;

  const pinHash = localStorage.getItem('st_pin_hash');
  const badge = document.getElementById('pinStatusBadge');
  const desc = document.getElementById('pinStatusDesc');
  const statusIcon = document.getElementById('securityStatusIcon');

  if (pinHash) {
    badge.textContent = "Actif (4 chiffres)";
    badge.className = "setting-value";
    desc.textContent = "Votre portefeuille est protégé par un code PIN à 4 chiffres.";
    if (statusIcon) statusIcon.textContent = "🔒";
  } else {
    badge.textContent = "Désactivé";
    badge.className = "setting-value text-orange";
    desc.textContent = "Aucun code PIN défini. Accès ouvert sur cet appareil.";
    if (statusIcon) statusIcon.textContent = "🔓";
  }

  // Update QR Code & Link
  const pairUrl = `${window.location.origin}${window.location.pathname}?sync=${encodeURIComponent(CURRENT_ACCOUNT_ID)}`;
  const qrImg = document.getElementById('qrCodeImage');
  if (qrImg) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(pairUrl)}`;
  }
}

function openSecurityModal() {
  updateSecurityUI();
  switchSecurityTab('myAccount');
  securityModal.classList.add('active');
}

function closeSecurityModal() {
  securityModal.classList.remove('active');
}

function switchSecurityTab(tab) {
  document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('viewMyAccount').style.display = 'none';
  document.getElementById('viewPairDevice').style.display = 'none';
  document.getElementById('viewPinSetup').style.display = 'none';

  if (tab === 'myAccount') {
    document.getElementById('tabMyAccountBtn').classList.add('active');
    document.getElementById('viewMyAccount').style.display = 'block';
  } else if (tab === 'pairDevice') {
    document.getElementById('tabPairDeviceBtn').classList.add('active');
    document.getElementById('viewPairDevice').style.display = 'block';
  } else if (tab === 'pinSetup') {
    document.getElementById('tabPinBtn').classList.add('active');
    document.getElementById('viewPinSetup').style.display = 'block';
    setTimeout(() => {
      const f = document.getElementById('newPin1');
      if (f) f.focus();
    }, 100);
  }
}

function copyAccountId() {
  navigator.clipboard.writeText(CURRENT_ACCOUNT_ID).then(() => {
    alert("Identifiant de compte copié !");
  });
}

function toggleRevealRecovery() {
  const el = document.getElementById('displayRecoveryKey');
  const btn = document.getElementById('revealRecoveryBtn');
  if (!isRecoveryRevealed) {
    el.textContent = CURRENT_RECOVERY_KEY;
    btn.textContent = "Masquer";
    isRecoveryRevealed = true;
  } else {
    el.textContent = "••••-••••-••••-••••";
    btn.textContent = "Afficher";
    isRecoveryRevealed = false;
  }
}

function copyRecoveryKey() {
  navigator.clipboard.writeText(CURRENT_RECOVERY_KEY).then(() => {
    alert("Clé de secours copiée ! Conservez-la dans vos notes sécurisées.");
  });
}

function copyDirectLink() {
  const pairUrl = `${window.location.origin}${window.location.pathname}?sync=${encodeURIComponent(CURRENT_ACCOUNT_ID)}`;
  navigator.clipboard.writeText(pairUrl).then(() => {
    alert("Lien direct de jumelage copié ! Ouvrez-le sur votre iPhone pour lier l'appareil.");
  });
}

async function applyExistingId() {
  const input = document.getElementById('inputExistingId');
  const val = input.value.trim();
  if (!val) return;

  if (val.startsWith('REC-')) {
    // Restore using recovery key
    CURRENT_RECOVERY_KEY = val;
    localStorage.setItem('st_recovery_key', val);
    alert("Clé de secours enregistrée !");
  } else {
    CURRENT_ACCOUNT_ID = val;
    localStorage.setItem('st_account_id', val);
  }

  closeSecurityModal();
  sessionStorage.removeItem('st_session_unlocked');
  await pullFromCloud();
  loadPortfolio(true);
}

// PIN Setup Actions
async function saveNewPin() {
  const pin = ['newPin1', 'newPin2', 'newPin3', 'newPin4']
    .map(id => document.getElementById(id).value)
    .join('');

  if (pin.length !== 4) {
    alert("Veuillez saisir un code PIN à 4 chiffres.");
    return;
  }

  const hash = await sha256(pin);
  localStorage.setItem('st_pin_hash', hash);
  sessionStorage.setItem('st_session_unlocked', 'true');

  ['newPin1', 'newPin2', 'newPin3', 'newPin4'].forEach(id => {
    document.getElementById(id).value = '';
  });

  alert("Code PIN activé avec succès ! Votre portefeuille est maintenant protégé.");
  updateSecurityUI();
  switchSecurityTab('myAccount');
  pushToCloud();
}

function removePin() {
  if (!confirm("Voulez-vous vraiment désactiver la protection par code PIN ?")) return;
  localStorage.removeItem('st_pin_hash');
  updateSecurityUI();
  switchSecurityTab('myAccount');
  pushToCloud();
}

// --- SUPABASE CLOUD SYNC ENGINE ---

async function pullFromCloud() {
  if (!supabaseClient) return;

  try {
    const { data, error } = await supabaseClient
      .from('portfolio_sync')
      .select('data')
      .eq('id', CURRENT_ACCOUNT_ID)
      .maybeSingle();

    if (error) {
      console.warn('Erreur pull cloud Supabase:', error);
      return;
    }

    if (data && data.data) {
      const cloudData = data.data;
      const local = getLocalData();

      // Merge positions if cloud has positions
      if (Array.isArray(cloudData.positions)) {
        local.positions = cloudData.positions;
      }
      if (cloudData.settings) {
        local.settings = cloudData.settings;
      }
      if (cloudData.pin_hash && !localStorage.getItem('st_pin_hash')) {
        localStorage.setItem('st_pin_hash', cloudData.pin_hash);
      }
      saveLocalData(local);
    } else {
      // First time initialization in cloud
      await pushToCloud();
    }
  } catch (err) {
    console.warn('Pull cloud exception:', err);
  }
}

async function pushToCloud() {
  if (!supabaseClient) return;

  try {
    const local = getLocalData();
    const payload = {
      positions: local.positions || [],
      settings: local.settings || DEFAULT_STORAGE.settings,
      pin_hash: localStorage.getItem('st_pin_hash') || null,
      recovery_hash: await sha256(CURRENT_RECOVERY_KEY),
      updated_at: new Date().toISOString()
    };

    const { error } = await supabaseClient
      .from('portfolio_sync')
      .upsert({
        id: CURRENT_ACCOUNT_ID,
        data: payload,
        updated_at: new Date()
      });

    if (error) console.warn('Erreur push cloud Supabase:', error);
  } catch (err) {
    console.warn('Push cloud exception:', err);
  }
}

// --- LOCAL DATA ACCESS ---

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

// --- MARKET DATA FETCHERS (WITH TIMEOUT & SAFE FALLBACK) ---

async function fetchClientChart(symbol, defaultPrice = 100) {
  if (clientCache.quotes.has(symbol)) {
    return clientCache.quotes.get(symbol);
  }

  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`;
  const proxyUrl = `https://proxy.cors.dev/${targetUrl}`;

  try {
    const res = await fetch(proxyUrl, {
      signal: getAbortSignal(3500)
    });

    if (res.ok) {
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (result) {
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

        const currentPrice = meta.regularMarketPrice || (validDaily.length ? validDaily[validDaily.length - 1].close : defaultPrice);

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
    }
  } catch (err) {
    console.warn(`Fetch live pour ${symbol} :`, err.message);
  }

  // Safe fallback so it NEVER hangs
  const basePrice = defaultPrice > 0 ? defaultPrice : 100;
  const history = [];
  const now = Date.now();
  for (let d = 30; d >= 0; d--) {
    const t = now - (d * 86400000);
    history.push({
      timestamp: t,
      dateStr: new Date(t).toISOString().split('T')[0],
      close: basePrice
    });
  }

  const fallbackPayload = {
    symbol,
    shortName: symbol,
    currency: 'USD',
    currentPrice: basePrice,
    previousClose: basePrice,
    history
  };
  clientCache.quotes.set(symbol, fallbackPayload);
  return fallbackPayload;
}

async function getClientRateToEUR(fromCurrency) {
  const cur = (fromCurrency || 'EUR').toUpperCase();
  if (cur === 'EUR') return 1.0;

  if (clientCache.rates.has(cur)) {
    return clientCache.rates.get(cur);
  }

  try {
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/EUR${cur}=X?range=1d&interval=1d`;
    const proxyUrl = `https://proxy.cors.dev/${targetUrl}`;
    const res = await fetch(proxyUrl, {
      signal: getAbortSignal(3000)
    });
    if (res.ok) {
      const json = await res.json();
      const eurToCur = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (eurToCur && eurToCur > 0) {
        const curToEur = 1 / eurToCur;
        clientCache.rates.set(cur, curToEur);
        return curToEur;
      }
    }
  } catch (e) {
    console.warn(`Taux EUR pour ${cur} estimé.`);
  }

  const fallbacks = { USD: 0.92, GBP: 1.18, CHF: 1.05 };
  return fallbacks[cur] || 1.0;
}

// Decision Suggestions
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

// Portfolio Builder (Concurrent with safe fallbacks)
async function buildPortfolioData() {
  const local = getLocalData();
  const settings = local.settings || {};
  const positions = local.positions || [];

  let totalInvestedEur = 0;
  let totalCurrentValueEur = 0;
  let totalDayGainEur = 0;

  const enrichedPositions = await Promise.all(positions.map(async (pos) => {
    try {
      const shares = parseFloat(pos.shares) || 0;
      const buyPrice = parseFloat(pos.buyPrice) || 0;
      const chart = await fetchClientChart(pos.symbol, buyPrice);
      const toEurRate = await getClientRateToEUR(chart.currency);
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

      return {
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
      };
    } catch (err) {
      console.warn(`Erreur calcul pour ${pos.symbol}:`, err.message);
      return {
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
          action: 'WARNING',
          label: '⚠️ Données en attente',
          badgeClass: 'badge-warning',
          reason: 'Cours en attente de synchronisation. Cliquez sur "Modifier" pour ajuster le symbole ou le montant à tout moment.'
        },
        dailyBreakdown: [],
        notes: pos.notes || ''
      };
    }
  }));

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

// --- FAST LOCAL FALLBACK (0ms INSTANT RENDER) ---
function renderInstantPositions(local) {
  const positions = local.positions || [];
  let totalInvestedEur = 0;
  let totalCurrentValueEur = 0;

  const enriched = positions.map(pos => {
    const shares = parseFloat(pos.shares) || 0;
    const buyPrice = parseFloat(pos.buyPrice) || 0;
    const investedEur = parseFloat(pos.investedAmount) || (shares * buyPrice);
    totalInvestedEur += investedEur;
    totalCurrentValueEur += investedEur;

    return {
      id: pos.id,
      symbol: pos.symbol,
      name: pos.name || pos.symbol,
      buyDate: pos.buyDate,
      buyPrice: buyPrice,
      shares: shares,
      investedEur: investedEur,
      currency: pos.currency || 'EUR',
      currentPrice: buyPrice,
      currentPriceEur: buyPrice,
      currentValueEur: investedEur,
      totalGainEur: 0,
      totalGainPercent: 0,
      todayChangePercent: 0,
      todayChangeEur: 0,
      consecutiveUp: 0,
      consecutiveDown: 0,
      suggestion: {
        action: 'HOLD',
        label: 'Synchronisation...',
        badgeClass: 'badge-neutral',
        reason: 'Actualisation des cours en cours...'
      },
      dailyBreakdown: [],
      notes: pos.notes || ''
    };
  });

  portfolio = {
    summary: {
      totalInvestedEur,
      totalCurrentValueEur,
      totalGainEur: 0,
      totalGainPercent: 0,
      totalDayGainEur: 0,
      totalDayGainPercent: 0,
      positionsCount: enriched.length,
      lastSync: new Date().toISOString()
    },
    settings: local.settings || {},
    positions: enriched
  };

  renderSummary();
  renderPositions();
}

// --- LOAD PORTFOLIO ---
async function loadPortfolio(forceRefresh = false) {
  const local = getLocalData();
  // Immediately render local data in 0ms so the screen is never blocked
  if (!portfolio) {
    renderInstantPositions(local);
  }

  try {
    portfolio = await buildPortfolioData();
    renderSummary();
    renderPositions();
  } catch (err) {
    console.warn('Erreur synchronisation portfolio:', err);
    if (!portfolio) {
      renderInstantPositions(local);
    }
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
            <button class="btn btn-secondary" onclick="editPosition('${pos.id}')" style="font-size: 11px; padding: 4px 10px;">Modifier</button>
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
      const targetUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=6&newsCount=0`;
      const proxyUrl = `https://proxy.cors.dev/${targetUrl}`;
      const res = await fetch(proxyUrl, {
        signal: getAbortSignal(4000)
      });
      const data = await res.json();
      const results = (data.quotes || []).map(item => ({
        symbol: item.symbol,
        name: item.shortname || item.longname || item.symbol,
        type: item.quoteType
      }));

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

window.editPosition = function(id) {
  const local = getLocalData();
  const pos = (local.positions || []).find(p => p.id === id);
  if (!pos) return;

  document.getElementById('posId').value = pos.id;
  document.getElementById('modalTitle').textContent = `Modifier ${pos.name || pos.symbol}`;
  document.getElementById('posSearch').value = pos.name || pos.symbol;
  document.getElementById('posSymbol').value = pos.symbol || '';
  document.getElementById('posName').value = pos.name || '';
  document.getElementById('posBuyDate').value = pos.buyDate || '';
  document.getElementById('posCurrency').value = pos.currency || 'EUR';
  document.getElementById('posInvestedAmount').value = pos.investedAmount || '';
  document.getElementById('posShares').value = pos.shares || '';
  document.getElementById('posBuyPrice').value = pos.buyPrice || '';
  document.getElementById('posNotes').value = pos.notes || '';

  autocompleteDropdown.style.display = 'none';
  positionModal.classList.add('active');
};

function closePositionModal() {
  positionModal.classList.remove('active');
}

// Submit Position Form (Permissive - never blocks, saves whatever you provide!)
async function handleFormSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('posId').value;
  let symbol = document.getElementById('posSymbol').value.trim();
  let name = document.getElementById('posName').value.trim();
  const searchVal = document.getElementById('posSearch').value.trim();

  // If symbol or name empty, fallback gracefully
  if (!symbol && searchVal) symbol = searchVal.toUpperCase();
  if (!name && searchVal) name = searchVal;
  if (!symbol && name) symbol = name.toUpperCase();
  if (!name && symbol) name = symbol;
  if (!symbol) symbol = 'TITRE';
  if (!name) name = 'Mon investissement';

  const buyDate = document.getElementById('posBuyDate').value || new Date().toISOString().split('T')[0];
  const currency = document.getElementById('posCurrency').value || 'EUR';
  const investedAmount = parseFloat(document.getElementById('posInvestedAmount').value) || 0;
  const shares = parseFloat(document.getElementById('posShares').value) || 1;
  const buyPrice = parseFloat(document.getElementById('posBuyPrice').value) || (shares > 0 && investedAmount > 0 ? investedAmount / shares : 0);
  const notes = document.getElementById('posNotes').value;

  const posData = {
    id: id || ('pos_' + Date.now()),
    symbol: symbol.toUpperCase(),
    name: name,
    buyDate,
    currency,
    investedAmount,
    shares,
    buyPrice,
    notes
  };

  const local = getLocalData();
  local.positions = local.positions || [];

  if (id) {
    const idx = local.positions.findIndex(p => p.id === id);
    if (idx !== -1) {
      local.positions[idx] = { ...local.positions[idx], ...posData };
    } else {
      local.positions.unshift(posData);
    }
  } else {
    local.positions.unshift(posData);
  }

  saveLocalData(local);
  closePositionModal();
  loadPortfolio(true);

  // Sync with cloud
  pushToCloud();
}

// Delete Position
window.deletePosition = async function(id, symbol) {
  if (!confirm(`Supprimer la position ${symbol} du portefeuille ?`)) return;

  const local = getLocalData();
  local.positions = (local.positions || []).filter(p => p.id !== id);
  saveLocalData(local);
  loadPortfolio();

  // Sync with cloud
  pushToCloud();
};

// --- SETTINGS ---
async function openSettingsModal() {
  try {
    const settings = getLocalData().settings || {};
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

  const local = getLocalData();
  local.settings = { ...local.settings, ...payload };
  saveLocalData(local);

  closeSettingsModal();
  loadPortfolio(true);
  pushToCloud();
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
  const data = { positions: portfolio?.positions || [] };
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
      pushToCloud();
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
