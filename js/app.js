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

// --- INTERNATIONALIZATION (I18N) ---
let currentLang = localStorage.getItem('st_lang') || 'fr';

const I18N = {
  fr: {
    brandBadge: "REVOLUT TRACKER",
    brandTitle: "Suivi de Portefeuille",
    brandSubtitle: "Progression jour par jour • Zéro graphique inutile • Aide à la décision",
    btnSecurity: "Sécurité & Appareils",
    btnCriteria: "Critères",
    btnRefresh: "Actualiser",
    btnImportCsv: "Importer Revolut (CSV)",
    btnAddPosition: "Ajouter un achat",
    portfolioValueLabel: "VALEUR DU PORTEFEUILLE",
    investedPrefix: "Investi : ",
    todayGainLabel: "DYNAMIQUE D'AUJOURD'HUI (VS VEILLE)",
    totalGainLabel: "GAIN TOTAL (DEPUIS L'ACHAT)",
    actionSignalsLabel: "SIGNAUX DÉCISIONNELS",
    signalHold: "Garder",
    signalProfit: "Sécuriser",
    signalAlert: "Attention/Couper",
    positionsCountPrefix: "position",
    positionsCountSuffix: "suivie",
    timeframeTitle: "PÉRIODE AFFICHÉE (JOUR PAR JOUR)",
    timeframe7d: "7 jours",
    timeframe14d: "2 semaines",
    timeframe21d: "3 semaines",
    timeframe30d: "1 mois",
    sortTitle: "TRIER PAR",
    sortGainDesc: "Plus gros gains d'abord",
    sortGainAsc: "Plus faibles gains / pertes",
    sortTodayDesc: "Meilleure performance du jour",
    sortTodayAsc: "Plus forte baisse du jour",
    sortNameAsc: "Nom alphabétique (A-Z)",
    emptyTitle: "Aucun investissement enregistré",
    emptyDesc: "Ajoutez votre première action ou crypto achetée sur Revolut pour démarrer le suivi.",
    emptyAddBtn: "+ Ajouter un achat",
    invested: "Investi",
    currentValue: "Valeur Actuelle",
    totalGain: "Gain Total",
    today: "Aujourd'hui",
    yesterday: "Hier",
    boughtOn: "Acheté le",
    holdingAgoDays: "il y a {n}j",
    holdingAgoMonths: "il y a {n} mois",
    holdingAgoYears: "il y a {n} ans",
    boughtTodayMarker: "📍 Achat",
    sharesText: "parts",
    editBtn: "Modifier",
    deleteBtn: "Supprimer",
    confirmDelete: "Supprimer la position {symbol} du portefeuille ?",
    streakUp: "🔥 {n} jours de hausse d'affilée",
    streakDown: "❄️ {n} jours de baisse consécutive",
    dayStripTitle: "Progression jour par jour ({n} derniers jours)",
    portfolioText: "Portefeuille : ",
    // Suggestions
    sugHold: "Garder",
    sugHoldBullish: "Garder (Hausse {n}j)",
    sugTakeProfit: "Prendre des bénéfices",
    sugTargetReached: "Objectif atteint",
    sugStopLoss: "Stop-Loss / Couper",
    sugWarningDip: "Alerte baisse ({n}j)",
    sugOpportunity: "Opportunité / Renforcer",
    sugBreakStructure: "⚠️ Rupture de creux (Vendre / Sécuriser)",
    sugNearHigh: "🚀 Sur les sommets (Garder)",
    sugPending: "⚠️ Données en attente",
    sugPendingReason: "Cours en attente de synchronisation. Cliquez sur \"Modifier\" pour ajuster le symbole ou le montant.",
    // Form & Modals
    modalAddTitle: "Ajouter un achat Revolut",
    modalEditTitle: "Modifier {name}",
    searchLabel: "Recherche (Nom ou Ticker)",
    searchPlaceholder: "Ex: SpaceX, Apple, Tesla, Bitcoin...",
    symbolLabel: "Symbole officiel (Ticker)",
    symbolHint: "Ex: SPCX, AAPL, BTC-USD...",
    nameLabel: "Nom affiché",
    nameHint: "Votre titre personnel.",
    dateLabel: "Date d'achat",
    timeLabel: "Heure (facultatif)",
    currencyLabel: "Devise d'achat",
    investedAmountLabel: "Montant total investi ({cur})",
    investedAmountPlaceholder: "Ex: 48.82",
    investedHint: "Ce que vous avez payé sur Revolut.",
    sharesLabel: "Nombre de parts / actions",
    sharesPlaceholder: "Ex: 0.36386588",
    sharesHint: "Fraction exacte avec toutes les décimales.",
    priceLabel: "Prix d'achat unitaire (estimé)",
    pricePlaceholder: "Calculé automatiquement",
    buyFeeLabel: "Frais payés à l'achat ({cur})",
    sellFeeLabel: "Frais de vente estimés ({cur})",
    notesLabel: "Note personnelle (facultatif)",
    notesPlaceholder: "Ex: Achat mensuel DCA, conviction perso...",
    btnCancel: "Annuler",
    btnSavePosition: "Enregistrer l'achat",
    netGain: "Gain Net (après frais)",
    grossGain: "Gain Brut",
    totalFeesLabel: "Frais totaux : ",
    afterFees: "après frais",
    highPeak: "Sommet (30j)",
    keySupport: "Support clé",
    distanceFromHigh: "du sommet",
    // Settings
    settingsTitle: "Critères de Recommandation",
    settingsProfitTarget: "Objectif de prise de bénéfices (Gain global)",
    settingsStopLoss: "Seuil de Stop-Loss (Perte globale maximale)",
    settingsDownDays: "Alerte de baisse consécutive",
    settingsDaysUnit: "jours",
    settingsSyncBackup: "Sauvegarde et synchronisation",
    btnExportJson: "Exporter mes positions (JSON)",
    btnImportJson: "Importer JSON",
    btnSettingsImportCsv: "📂 Importer CSV Revolut",
    btnDefaultValues: "Valeurs par défaut",
    btnSaveSettings: "Enregistrer les critères"
  },
  en: {
    brandBadge: "REVOLUT TRACKER",
    brandTitle: "Portfolio Tracker",
    brandSubtitle: "Day-by-day progression • Zero useless charts • Actionable decisions",
    btnSecurity: "Security & Devices",
    btnCriteria: "Rules",
    btnRefresh: "Refresh",
    btnImportCsv: "Import Revolut (CSV)",
    btnAddPosition: "Add Purchase",
    portfolioValueLabel: "PORTFOLIO VALUE",
    investedPrefix: "Invested: ",
    todayGainLabel: "TODAY'S CHANGE (VS YESTERDAY)",
    totalGainLabel: "TOTAL GAIN (SINCE PURCHASE)",
    actionSignalsLabel: "ACTION SIGNALS",
    signalHold: "Hold",
    signalProfit: "Secure",
    signalAlert: "Warning/Cut",
    positionsCountPrefix: "position",
    positionsCountSuffix: "tracked",
    timeframeTitle: "TIMEFRAME (DAY-BY-DAY STRIP)",
    timeframe7d: "7 days",
    timeframe14d: "2 weeks",
    timeframe21d: "3 weeks",
    timeframe30d: "1 month",
    sortTitle: "SORT BY",
    sortGainDesc: "Highest gain first",
    sortGainAsc: "Lowest gain / losses first",
    sortTodayDesc: "Best daily performance",
    sortTodayAsc: "Worst daily drop",
    sortNameAsc: "Alphabetical (A-Z)",
    emptyTitle: "No investments tracked yet",
    emptyDesc: "Add your first stock or crypto purchased on Revolut to start tracking.",
    emptyAddBtn: "+ Add purchase",
    invested: "Invested",
    currentValue: "Current Value",
    totalGain: "Total Gain",
    today: "Today",
    yesterday: "Yesterday",
    boughtOn: "Bought on",
    holdingAgoDays: "{n}d ago",
    holdingAgoMonths: "{n}mo ago",
    holdingAgoYears: "{n}y ago",
    boughtTodayMarker: "📍 Bought",
    sharesText: "shares",
    editBtn: "Edit",
    deleteBtn: "Delete",
    confirmDelete: "Delete position {symbol} from portfolio?",
    streakUp: "🔥 {n} consecutive up days",
    streakDown: "❄️ {n} consecutive down days",
    dayStripTitle: "Day-by-day progression (last {n} days)",
    portfolioText: "Portfolio: ",
    // Suggestions
    sugHold: "Hold",
    sugHoldBullish: "Hold ({n}d rally)",
    sugTakeProfit: "Take Profit",
    sugTargetReached: "Target Reached",
    sugStopLoss: "Stop-Loss / Cut",
    sugWarningDip: "Warning: Drop ({n} days)",
    sugOpportunity: "Buy the Dip",
    sugBreakStructure: "⚠️ Break of Support (Sell / Secure)",
    sugNearHigh: "🚀 Near Peak High (Hold)",
    sugPending: "⚠️ Data Pending",
    sugPendingReason: "Live quotes pending synchronization. Click \"Edit\" to adjust symbol or amount anytime.",
    // Form & Modals
    modalAddTitle: "Add Revolut Purchase",
    modalEditTitle: "Edit {name}",
    searchLabel: "Search (Name or Ticker)",
    searchPlaceholder: "Ex: SpaceX, Apple, Tesla, Bitcoin...",
    symbolLabel: "Official Symbol (Ticker)",
    symbolHint: "Ex: SPCX, AAPL, BTC-USD...",
    nameLabel: "Display Name",
    nameHint: "Your custom title.",
    dateLabel: "Purchase Date",
    timeLabel: "Time (optional)",
    currencyLabel: "Purchase Currency",
    investedAmountLabel: "Total Invested Amount ({cur})",
    investedAmountPlaceholder: "Ex: 48.82",
    investedHint: "What you paid on Revolut.",
    sharesLabel: "Number of shares / units",
    sharesPlaceholder: "Ex: 0.36386588",
    sharesHint: "Exact fraction with all decimals.",
    priceLabel: "Estimated Buy Price",
    pricePlaceholder: "Calculated automatically",
    buyFeeLabel: "Buy fees paid ({cur})",
    sellFeeLabel: "Est. sell fees ({cur})",
    notesLabel: "Personal notes (optional)",
    notesPlaceholder: "Ex: Monthly DCA purchase, conviction...",
    btnCancel: "Cancel",
    btnSavePosition: "Save Purchase",
    netGain: "Net Gain (after fees)",
    grossGain: "Gross Gain",
    totalFeesLabel: "Total fees: ",
    afterFees: "after fees",
    highPeak: "High (30d)",
    keySupport: "Key support",
    distanceFromHigh: "from high",
    // Settings
    settingsTitle: "Recommendation Rules",
    settingsProfitTarget: "Profit taking target (Total gain)",
    settingsStopLoss: "Stop-Loss threshold (Max total loss)",
    settingsDownDays: "Consecutive down days alert",
    settingsDaysUnit: "days",
    settingsSyncBackup: "Backup and synchronization",
    btnExportJson: "Export positions (JSON)",
    btnImportJson: "Import JSON",
    btnSettingsImportCsv: "📂 Import Revolut CSV",
    btnDefaultValues: "Default Values",
    btnSaveSettings: "Save Rules"
  }
};

function t(key, params = {}) {
  let text = I18N[currentLang]?.[key] || I18N['fr'][key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return text;
}

// Formatters
const eurFormat = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatCurrency(val, currency = 'EUR') {
  const cur = (currency || 'EUR').toUpperCase();
  const locale = currentLang === 'en' ? 'en-US' : 'fr-FR';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  } catch (e) {
    return `${val.toFixed(2)} ${cur}`;
  }
}

const pctFormat = (val) => {
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const locale = currentLang === 'en' ? 'en-US' : 'fr-FR';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatDayLabel = (dateStr, indexFromEnd) => {
  if (indexFromEnd === 0) return t('today');
  if (indexFromEnd === 1) return t('yesterday');
  const d = new Date(dateStr);
  const locale = currentLang === 'en' ? 'en-US' : 'fr-FR';
  return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
};

const getHoldingPeriodText = (dateStr, timeStr) => {
  if (!dateStr) return '';
  const dtStr = timeStr ? `${dateStr}T${timeStr}:00` : `${dateStr}T12:00:00`;
  const buyTimestamp = new Date(dtStr).getTime();
  if (isNaN(buyTimestamp)) return '';
  const diffDays = Math.floor((Date.now() - buyTimestamp) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return t('today').toLowerCase();
  if (diffDays === 1) return t('yesterday').toLowerCase();
  if (diffDays < 30) return t('holdingAgoDays', { n: diffDays });
  const months = Math.floor(diffDays / 30.4);
  if (months < 12) return t('holdingAgoMonths', { n: months });
  const years = (diffDays / 365.25).toFixed(1);
  return t('holdingAgoYears', { n: years });
};

// --- HASH HELPER (SHA-256) ---

// --- LANGUAGE SWITCHING & DOM UPDATES ---
function setLanguage(lang) {
  currentLang = (lang === "en") ? "en" : "fr";
  localStorage.setItem("st_lang", currentLang);
  document.documentElement.lang = currentLang;

  document.querySelectorAll("#langSwitch .lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
  });

  const titleEl = document.querySelector(".brand-title");
  if (titleEl) titleEl.textContent = t("brandTitle");
  const subEl = document.querySelector(".brand-subtitle");
  if (subEl) subEl.textContent = t("brandSubtitle");
  const secText = document.getElementById("securityBtnText");
  if (secText) secText.textContent = t("btnSecurity");
  const setSpan = document.querySelector("#settingsBtn span");
  if (setSpan) setSpan.textContent = t("btnCriteria");
  const refSpan = document.querySelector("#refreshBtn span");
  if (refSpan) refSpan.textContent = t("btnRefresh");
  const impSpan = document.querySelector("#importCsvBtn span");
  if (impSpan) impSpan.textContent = t("btnImportCsv");
  const addSpan = document.querySelector("#addPositionBtn span");
  if (addSpan) addSpan.textContent = t("btnAddPosition");

  const cardLabels = document.querySelectorAll(".summary-card .card-label");
  if (cardLabels[0]) cardLabels[0].textContent = t("portfolioValueLabel");
  if (cardLabels[1]) cardLabels[1].textContent = t("totalGainLabel");
  if (cardLabels[2]) cardLabels[2].textContent = t("todayGainLabel");
  if (cardLabels[3]) cardLabels[3].textContent = t("actionSignalsLabel");

  const tfTitle = document.querySelector(".controls-grid .controls-card:first-child .control-title");
  if (tfTitle) tfTitle.textContent = t("timeframeTitle");
  const sortTitle = document.querySelector(".controls-grid .controls-card:last-child .control-title");
  if (sortTitle) sortTitle.textContent = t("sortTitle");

  const pillBtns = document.querySelectorAll("#timeframePills .pill-btn");
  if (pillBtns[0]) pillBtns[0].textContent = t("timeframe7d");
  if (pillBtns[1]) pillBtns[1].textContent = t("timeframe14d");
  if (pillBtns[2]) pillBtns[2].textContent = t("timeframe21d");
  if (pillBtns[3]) pillBtns[3].textContent = t("timeframe30d");

  const sortSelect = document.getElementById("sortSelect");
  if (sortSelect) {
    const opts = sortSelect.options;
    if (opts[0]) opts[0].textContent = t("sortGainDesc");
    if (opts[1]) opts[1].textContent = t("sortGainAsc");
    if (opts[2]) opts[2].textContent = t("sortTodayDesc");
    if (opts[3]) opts[3].textContent = t("sortTodayAsc");
    if (opts[4]) opts[4].textContent = t("sortNameAsc");
  }

  const searchInput = document.getElementById("posSearch");
  if (searchInput) searchInput.placeholder = t("searchPlaceholder");
  const searchLbl = document.querySelector("label[for='posSearch']");
  if (searchLbl) searchLbl.textContent = t("searchLabel");
  const symLbl = document.querySelector("label[for='posSymbol']");
  if (symLbl) symLbl.textContent = t("symbolLabel");
  const nameLbl = document.querySelector("label[for='posName']");
  if (nameLbl) nameLbl.textContent = t("nameLabel");
  const dateLbl = document.querySelector("label[for='posBuyDate']");
  if (dateLbl) dateLbl.textContent = t("dateLabel");
  const timeLbl = document.querySelector("label[for='posBuyTime']");
  if (timeLbl) timeLbl.textContent = t("timeLabel");
  const curLbl = document.querySelector("label[for='posCurrency']");
  if (curLbl) curLbl.textContent = t("currencyLabel");
  const shLbl = document.querySelector("label[for='posShares']");
  if (shLbl) shLbl.textContent = t("sharesLabel");
  const prLbl = document.querySelector("label[for='posBuyPrice']");
  if (prLbl) prLbl.textContent = t("priceLabel");
  const notesLbl = document.querySelector("label[for='posNotes']");
  if (notesLbl) notesLbl.textContent = t("notesLabel");
  const cancelBtn = document.getElementById("modalCancelBtn");
  if (cancelBtn) cancelBtn.textContent = t("btnCancel");
  const saveBtn = document.getElementById("modalSaveBtn");
  if (saveBtn) saveBtn.textContent = t("btnSavePosition");

  const setH2 = document.querySelector("#settingsModal .modal-header h2");
  if (setH2) setH2.textContent = t("settingsTitle");
  const setReset = document.getElementById("settingsResetBtn");
  if (setReset) setReset.textContent = t("btnDefaultValues");
  const setSave = document.getElementById("settingsSaveBtn");
  if (setSave) setSave.textContent = t("btnSaveSettings");
  const setExp = document.getElementById("exportDataBtn");
  if (setExp) setExp.textContent = t("btnExportJson");
  const setImp = document.getElementById("importDataBtn");
  if (setImp) setImp.textContent = t("btnImportJson");
  const setImpCsv = document.getElementById("settingsImportCsvBtn");
  if (setImpCsv) setImpCsv.textContent = t("btnSettingsImportCsv");

  updateCurrencyLabels();
  if (portfolio) {
    renderSummary();
    renderPositions();
  }
}

function updateCurrencyLabels() {
  const cur = (document.getElementById("posCurrency")?.value || "EUR").toUpperCase();
  const symbol = cur === "USD" ? "$ USD" : (cur === "GBP" ? "£ GBP" : "€ EUR");
  const label = document.getElementById("investedAmountLabel");
  if (label) {
    label.textContent = t("investedAmountLabel", { cur: symbol });
  }
  const buyFeeLabel = document.getElementById("buyFeeLabel");
  if (buyFeeLabel) {
    buyFeeLabel.textContent = t("buyFeeLabel", { cur: symbol });
  }
  const sellFeeLabel = document.getElementById("sellFeeLabel");
  if (sellFeeLabel) {
    sellFeeLabel.textContent = t("sellFeeLabel", { cur: symbol });
  }
}

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
    setLanguage(currentLang);
  } catch (e) {
    console.error("setLanguage error:", e);
  }

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
  const langSwitch = document.getElementById("langSwitch");
  if (langSwitch) {
    langSwitch.addEventListener("click", (e) => {
      const btn = e.target.closest(".lang-btn");
      if (!btn) return;
      const lang = btn.dataset.lang;
      if (lang) setLanguage(lang);
    });
  }

  const currencySelect = document.getElementById("posCurrency");
  if (currencySelect) {
    currencySelect.addEventListener("change", updateCurrencyLabels);
  }

  const buyFeeInput = document.getElementById("posBuyFee");
  const sellFeeInput = document.getElementById("posSellFee");
  if (buyFeeInput && sellFeeInput) {
    buyFeeInput.addEventListener("input", () => {
      if (!sellFeeInput.value || sellFeeInput.dataset.autoFilled === "true") {
        sellFeeInput.value = buyFeeInput.value;
        sellFeeInput.dataset.autoFilled = "true";
      }
    });
    sellFeeInput.addEventListener("input", () => {
      sellFeeInput.dataset.autoFilled = "false";
    });
  }

  document.getElementById("themeToggleBtn").addEventListener("click", toggleTheme);

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

  // Revolut CSV Import
  const importCsvBtn = document.getElementById('importCsvBtn');
  const settingsImportCsvBtn = document.getElementById('settingsImportCsvBtn');
  const revolutCsvFileInput = document.getElementById('revolutCsvFileInput');

  if (importCsvBtn && revolutCsvFileInput) {
    importCsvBtn.addEventListener('click', () => revolutCsvFileInput.click());
  }
  if (settingsImportCsvBtn && revolutCsvFileInput) {
    settingsImportCsvBtn.addEventListener('click', () => revolutCsvFileInput.click());
  }
  if (revolutCsvFileInput) {
    revolutCsvFileInput.addEventListener('change', handleCsvFileSelect);
  }

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

// Decision Suggestions (incorporates Profit/Loss rules & Market Structure Highs/Lows)
function evaluateSuggestionClient(totalGainPercent, todayChangePercent, consecutiveUp, consecutiveDown, settings, structure = {}) {
  const targetProfit = settings.profitTargetPercent ?? 15;
  const stopLoss = settings.stopLossPercent ?? -10;
  const downAlertDays = settings.consecutiveDownDaysAlert ?? 3;

  const {
    isBreakOfStructure = false,
    isNearHigh = false,
    distanceFromHighPct = 0,
    recentSwingLow = 0,
    highestClose = 0,
    currency = "EUR"
  } = structure;

  // 1. Hard Stop-Loss reached
  if (totalGainPercent <= stopLoss) {
    return {
      action: "SELL_STOP_LOSS",
      label: t("sugStopLoss"),
      badgeClass: "badge-danger",
      reason: currentLang === "en"
        ? `Total loss of ${totalGainPercent.toFixed(1)}% (stop-loss threshold: ${stopLoss}%). Consider cutting position to protect capital.`
        : `Perte globale de ${totalGainPercent.toFixed(1)}% (seuil stop-loss: ${stopLoss}%). Envisagez de couper la position pour limiter les pertes.`
    };
  }

  // 2. Break of Structure (Price broke below key support swing low - Objective Exit)
  if (isBreakOfStructure && recentSwingLow > 0) {
    const formattedLow = formatCurrency(recentSwingLow, currency);
    if (totalGainPercent > 0) {
      return {
        action: "SELL_BREAKDOWN",
        label: t("sugBreakStructure"),
        badgeClass: "badge-danger",
        reason: currentLang === "en"
          ? `Break of Structure: Price broke below key support (${formattedLow}). Uptrend is broken: objective signal to secure profits without emotion.`
          : `Rupture de structure : le cours a cassé son creux de support (${formattedLow}). La dynamique haussière est brisée : signal objectif pour sécuriser vos gains sans émotion.`
      };
    } else {
      return {
        action: "SELL_STOP_LOSS",
        label: t("sugBreakStructure"),
        badgeClass: "badge-danger",
        reason: currentLang === "en"
          ? `Support breakdown below ${formattedLow}. Downtrend confirmed: consider exiting without emotion.`
          : `Cassure du creux de support sous ${formattedLow}. Tendance baissière confirmée : signal objectif pour couper.`
      };
    }
  }

  // 3. Profit target reached
  if (totalGainPercent >= targetProfit) {
    if (consecutiveDown >= 1 || todayChangePercent < -1.0 || distanceFromHighPct < -4.0) {
      return {
        action: "TAKE_PROFIT",
        label: t("sugTakeProfit"),
        badgeClass: "badge-warning",
        reason: currentLang === "en"
          ? `Profit target met (+${totalGainPercent.toFixed(1)}%) with pullback (${distanceFromHighPct.toFixed(1)}% from peak). Optimal timing to secure profits.`
          : `Objectif de gain atteint (+${totalGainPercent.toFixed(1)}%) et repli (${distanceFromHighPct.toFixed(1)}% sous le sommet). Excellent timing pour encaisser.`
      };
    } else {
      return {
        action: "TARGET_REACHED",
        label: t("sugTargetReached"),
        badgeClass: "badge-gold",
        reason: currentLang === "en"
          ? `Target reached (+${totalGainPercent.toFixed(1)}%). Trading near highs. Prepare to secure if support breaks.`
          : `Objectif dépassé (+${totalGainPercent.toFixed(1)}%). Très forte dynamique. Prêt à sécuriser si le dernier creux lâche.`
      };
    }
  }

  // 4. Sitting right at / near High (Very Bullish)
  if (isNearHigh && consecutiveUp >= 1 && totalGainPercent > 3) {
    return {
      action: "HOLD_AT_HIGH",
      label: t("sugNearHigh"),
      badgeClass: "badge-success",
      reason: currentLang === "en"
        ? `Trading near peak (${formatCurrency(highestClose, currency)}). Uptrend structure is pristine (higher highs & lows). Hold firmly.`
        : `Sur les sommets (${formatCurrency(highestClose, currency)}). Structure haussière intacte (creux et sommets montants). Gardez fermement.`
    };
  }

  // 5. Consecutive downtrend alert
  if (consecutiveDown >= downAlertDays) {
    return {
      action: "WATCH_DOWNTREND",
      label: t("sugWarningDip", { n: consecutiveDown }),
      badgeClass: "badge-orange",
      reason: currentLang === "en"
        ? `${consecutiveDown} consecutive down days. Gains are fading day by day: watch support closely.`
        : `${consecutiveDown} séances consécutives de baisse. Vos gains s'effritent de jour en jour : surveillez attentivement le support.`
    };
  }

  // 6. Healthy Dip in uptrend
  if (totalGainPercent > 3 && consecutiveDown >= 2 && todayChangePercent < -2.0) {
    return {
      action: "BUY_DIP",
      label: t("sugOpportunity"),
      badgeClass: "badge-blue",
      reason: currentLang === "en"
        ? `Upward trending position (+${totalGainPercent.toFixed(1)}%) undergoing short-term dip. Potential opportunity to add at a discount.`
        : `Position globalement haussière (+${totalGainPercent.toFixed(1)}%) subissant un repli court terme. Opportunité potentielle de renfort à moindre coût.`
    };
  }

  if (consecutiveUp >= 2) {
    return {
      action: "HOLD_BULLISH",
      label: t("sugHoldBullish", { n: consecutiveUp }),
      badgeClass: "badge-success",
      reason: currentLang === "en"
        ? `Strong momentum: ${consecutiveUp} consecutive days in the green. Hold your position.`
        : `Excellente dynamique : ${consecutiveUp} jours d'affilée dans le vert. Conservez la position.`
    };
  }

  return {
    action: "HOLD",
    label: t("sugHold"),
    badgeClass: "badge-neutral",
    reason: currentLang === "en"
      ? `Neutral or stable trend above key support. No risk alerts triggered, hold position.`
      : `Tendance neutre ou stable au-dessus du support. Aucune alerte déclenchée, conservez sereinement.`
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
      const posCurrency = (pos.currency || "EUR").toUpperCase();
      const chart = await fetchClientChart(pos.symbol, buyPrice);
      const chartCurrency = (chart.currency || posCurrency).toUpperCase();

      const posToEurRate = await getClientRateToEUR(posCurrency);
      const chartToEurRate = await getClientRateToEUR(chartCurrency);

      let currentPriceInPosCurrency = chart.currentPrice;
      if (chartCurrency !== posCurrency && posToEurRate > 0) {
        currentPriceInPosCurrency = (chart.currentPrice * chartToEurRate) / posToEurRate;
      }

      const investedNative = parseFloat(pos.investedAmount) || (shares * buyPrice);
      const currentValueNative = shares * currentPriceInPosCurrency;
      const totalGainNative = currentValueNative - investedNative;
      const totalGainPercent = investedNative > 0 ? (totalGainNative / investedNative) * 100 : 0;

      // Fees (buy fee paid & estimated sell fee)
      const buyFee = pos.buyFee !== undefined ? (parseFloat(pos.buyFee) || 0) : (pos.symbol === "SPCX" ? 1.17 : 0);
      const sellFee = pos.sellFee !== undefined ? (parseFloat(pos.sellFee) || 0) : buyFee;
      const totalFeesNative = buyFee + sellFee;
      const netGainNative = totalGainNative - totalFeesNative;
      const netGainPercent = investedNative > 0 ? (netGainNative / investedNative) * 100 : 0;

      const fullHistory = chart.history || [];
      const daysCount = Math.min(fullHistory.length, 30);
      const recentHistory = fullHistory.slice(fullHistory.length - daysCount);

      const dailyBreakdown = [];
      for (let i = 0; i < recentHistory.length; i++) {
        const day = recentHistory[i];
        const prevDay = i > 0 ? recentHistory[i - 1] : null;

        let dayCloseInPos = day.close;
        let prevCloseInPos = prevDay ? prevDay.close : dayCloseInPos;
        if (chartCurrency !== posCurrency && posToEurRate > 0) {
          dayCloseInPos = (day.close * chartToEurRate) / posToEurRate;
          prevCloseInPos = (prevCloseInPos * chartToEurRate) / posToEurRate;
        }

        const changeVal = dayCloseInPos - prevCloseInPos;
        const changePct = prevCloseInPos > 0 ? (changeVal / prevCloseInPos) * 100 : 0;

        let trend = "flat";
        if (changeVal > 0.005) trend = "up";
        else if (changeVal < -0.005) trend = "down";

        const dayValueNative = shares * dayCloseInPos;
        const dayGainFromBuy = dayValueNative - investedNative;
        const dayGainFromBuyPct = investedNative > 0 ? (dayGainFromBuy / investedNative) * 100 : 0;

        dailyBreakdown.push({
          dateStr: day.dateStr,
          timestamp: day.timestamp,
          close: dayCloseInPos,
          changeVal,
          changePct,
          trend,
          dayValue: dayValueNative,
          dayGainFromBuy,
          dayGainFromBuyPct
        });
      }

      let consecutiveUp = 0;
      let consecutiveDown = 0;
      for (let i = dailyBreakdown.length - 1; i >= 1; i--) {
        const trend = dailyBreakdown[i].trend;
        if (i === dailyBreakdown.length - 1) {
          if (trend === "up") consecutiveUp++;
          else if (trend === "down") consecutiveDown++;
          else break;
        } else {
          if (consecutiveUp > 0 && trend === "up") consecutiveUp++;
          else if (consecutiveDown > 0 && trend === "down") consecutiveDown++;
          else break;
        }
      }

      const lastDay = dailyBreakdown[dailyBreakdown.length - 1] || {};
      const todayChangePercent = lastDay.changePct || 0;
      const todayChangeNative = (lastDay.changeVal || 0) * shares;

      // Market Structure Analysis (Highs, Lows, Swing Supports)
      let highestClose = 0;
      let lowestClose = Infinity;
      let recentSwingLow = Infinity;
      let recentSwingHigh = 0;

      if (dailyBreakdown.length > 0) {
        for (let i = 0; i < dailyBreakdown.length; i++) {
          const c = dailyBreakdown[i].close;
          if (c > highestClose) highestClose = c;
          if (c < lowestClose) lowestClose = c;
        }

        for (let i = 1; i < dailyBreakdown.length - 1; i++) {
          const prev = dailyBreakdown[i - 1].close;
          const curr = dailyBreakdown[i].close;
          const next = dailyBreakdown[i + 1].close;
          if (curr <= prev && curr <= next) {
            recentSwingLow = curr;
          }
          if (curr >= prev && curr >= next) {
            recentSwingHigh = curr;
          }
        }
      }
      if (recentSwingLow === Infinity) recentSwingLow = lowestClose;
      if (recentSwingHigh === 0) recentSwingHigh = highestClose;

      const distanceFromHighPct = highestClose > 0 ? ((currentPriceInPosCurrency - highestClose) / highestClose) * 100 : 0;
      const distanceFromLowPct = recentSwingLow > 0 ? ((currentPriceInPosCurrency - recentSwingLow) / recentSwingLow) * 100 : 0;
      const isBreakOfStructure = recentSwingLow > 0 && currentPriceInPosCurrency < (recentSwingLow * 0.995);
      const isNearHigh = highestClose > 0 && distanceFromHighPct >= -2.0;

      const suggestion = evaluateSuggestionClient(
        totalGainPercent,
        todayChangePercent,
        consecutiveUp,
        consecutiveDown,
        settings,
        {
          isBreakOfStructure,
          isNearHigh,
          distanceFromHighPct,
          recentSwingLow,
          highestClose,
          currency: posCurrency
        }
      );

      const investedEur = investedNative * posToEurRate;
      const currentValueEur = currentValueNative * posToEurRate;
      const todayChangeEur = todayChangeNative * posToEurRate;
      const totalGainEur = currentValueEur - investedEur;
      const totalFeesEur = totalFeesNative * posToEurRate;
      const netGainEur = totalGainEur - totalFeesEur;

      totalInvestedEur += investedEur;
      totalCurrentValueEur += currentValueEur;
      totalDayGainEur += todayChangeEur;

      return {
        id: pos.id,
        symbol: pos.symbol,
        name: pos.name || chart.shortName,
        buyDate: pos.buyDate,
        buyTime: pos.buyTime || "",
        buyPrice: buyPrice,
        shares: shares,
        currency: posCurrency,
        investedNative,
        investedEur,
        buyFee,
        sellFee,
        totalFeesNative,
        totalFeesEur,
        netGainNative,
        netGainEur,
        netGainPercent,
        highestClose,
        lowestClose,
        recentSwingLow,
        recentSwingHigh,
        distanceFromHighPct,
        distanceFromLowPct,
        isBreakOfStructure,
        currentPrice: currentPriceInPosCurrency,
        currentValueNative,
        currentValueEur,
        totalGainNative,
        totalGainEur,
        totalGainPercent,
        todayChangePercent,
        todayChangeNative,
        todayChangeEur,
        consecutiveUp,
        consecutiveDown,
        suggestion,
        dailyBreakdown,
        notes: pos.notes || ""
      };
    } catch (err) {
      console.error(`Erreur calcul pour ${pos.symbol}:`, err);
      const posCurrency = (pos.currency || "EUR").toUpperCase();
      const shares = parseFloat(pos.shares) || 0;
      const buyPrice = parseFloat(pos.buyPrice) || 0;
      const investedNative = parseFloat(pos.investedAmount) || (shares * buyPrice) || 0;
      const posToEur = posCurrency === "USD" ? 0.92 : (posCurrency === "GBP" ? 1.18 : 1.0);
      const investedEur = investedNative * posToEur;

      const buyFee = parseFloat(pos.buyFee) || 0;
      const sellFee = parseFloat(pos.sellFee) || 0;
      const totalFeesNative = buyFee + sellFee;

      totalInvestedEur += investedEur;
      totalCurrentValueEur += investedEur;

      return {
        id: pos.id,
        symbol: pos.symbol,
        name: pos.name || pos.symbol,
        buyDate: pos.buyDate,
        buyTime: pos.buyTime || "",
        buyPrice: pos.buyPrice,
        shares: pos.shares,
        currency: posCurrency,
        investedNative,
        investedEur,
        buyFee,
        sellFee,
        totalFeesNative,
        totalFeesEur: totalFeesNative * posToEur,
        netGainNative: 0,
        netGainEur: 0,
        netGainPercent: 0,
        highestClose: pos.buyPrice,
        lowestClose: pos.buyPrice,
        recentSwingLow: pos.buyPrice,
        recentSwingHigh: pos.buyPrice,
        distanceFromHighPct: 0,
        distanceFromLowPct: 0,
        isBreakOfStructure: false,
        currentPrice: pos.buyPrice,
        currentValueNative: investedNative,
        currentValueEur: investedEur,
        totalGainNative: 0,
        totalGainEur: 0,
        totalGainPercent: 0,
        todayChangePercent: 0,
        todayChangeNative: 0,
        todayChangeEur: 0,
        consecutiveUp: 0,
        consecutiveDown: 0,
        suggestion: {
          action: "WARNING",
          label: t("sugPending"),
          badgeClass: "badge-warning",
          reason: t("sugPendingReason")
        },
        dailyBreakdown: [],
        notes: pos.notes || ""
      };
    }
  }));

  const summaryGainEur = totalCurrentValueEur - totalInvestedEur;
  const summaryGainPercent = totalInvestedEur > 0 ? (summaryGainEur / totalInvestedEur) * 100 : 0;
  const summaryDayGainPercent = totalCurrentValueEur > 0 && (totalCurrentValueEur - totalDayGainEur) > 0
    ? (totalDayGainEur / (totalCurrentValueEur - totalDayGainEur)) * 100
    : 0;

  return {
    summary: {
      totalInvestedEur,
      totalCurrentValueEur,
      totalGainEur: summaryGainEur,
      totalGainPercent: summaryGainPercent,
      totalDayGainEur,
      totalDayGainPercent: summaryDayGainPercent,
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
    const posCurrency = (pos.currency || "EUR").toUpperCase();
    const investedNative = parseFloat(pos.investedAmount) || (shares * buyPrice);
    const posToEur = posCurrency === "USD" ? 0.92 : (posCurrency === "GBP" ? 1.18 : 1.0);
    const investedEur = investedNative * posToEur;

    totalInvestedEur += investedEur;
    totalCurrentValueEur += investedEur;

    return {
      id: pos.id,
      symbol: pos.symbol,
      name: pos.name || pos.symbol,
      buyDate: pos.buyDate,
      buyTime: pos.buyTime || "",
      buyPrice: buyPrice,
      shares: shares,
      currency: posCurrency,
      investedNative,
      investedEur,
      currentPrice: buyPrice,
      currentValueNative: investedNative,
      currentValueEur: investedEur,
      totalGainNative: 0,
      totalGainEur: 0,
      totalGainPercent: 0,
      todayChangePercent: 0,
      todayChangeNative: 0,
      todayChangeEur: 0,
      consecutiveUp: 0,
      consecutiveDown: 0,
      suggestion: {
        action: "HOLD",
        label: t("sugHold"),
        badgeClass: "badge-neutral",
        reason: currentLang === "en" ? "Updating live prices..." : "Actualisation des cours en cours..."
      },
      dailyBreakdown: [],
      notes: pos.notes || ""
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
  if (!portfolio) {
    renderInstantPositions(local);
  }

  try {
    portfolio = await buildPortfolioData();
    renderSummary();
    renderPositions();
  } catch (err) {
    console.warn("Erreur synchronisation portfolio:", err);
    if (!portfolio) {
      renderInstantPositions(local);
    }
  }
}

// --- RENDER FUNCTIONS ---
function renderSummary() {
  if (!portfolio || !portfolio.summary) return;
  const s = portfolio.summary;

  totalCurrentValueEl.textContent = eurFormat.format(s.totalCurrentValueEur).replace("€", "").trim();
  totalInvestedTextEl.textContent = `${t("investedPrefix")}${eurFormat.format(s.totalInvestedEur)}`;

  const signTotal = s.totalGainEur >= 0 ? "+" : "";
  totalGainEurEl.textContent = `${signTotal}${eurFormat.format(s.totalGainEur)}`;
  totalGainPctBadgeEl.textContent = pctFormat(s.totalGainPercent);
  totalGainPctBadgeEl.className = `pill-badge ${s.totalGainEur >= 0 ? "up" : "down"}`;

  const signDay = s.totalDayGainEur >= 0 ? "+" : "";
  totalDayGainEurEl.textContent = `${signDay}${eurFormat.format(s.totalDayGainEur)}`;
  totalDayGainPctBadgeEl.textContent = pctFormat(s.totalDayGainPercent);
  totalDayGainPctBadgeEl.className = `pill-badge ${s.totalDayGainEur >= 0 ? "up" : "down"}`;

  const counts = { hold: 0, profit: 0, alert: 0 };
  portfolio.positions.forEach(p => {
    const action = p.suggestion?.action;
    if (action === "HOLD" || action === "HOLD_BULLISH") counts.hold++;
    else if (action === "TAKE_PROFIT" || action === "TARGET_REACHED") counts.profit++;
    else counts.alert++;
  });

  signalsSummaryEl.innerHTML = `
    <span class="signal-item signal-hold">${counts.hold} ${t("signalHold")}</span>
    <span class="signal-item signal-profit">${counts.profit} ${t("signalProfit")}</span>
    <span class="signal-item signal-alert">${counts.alert} ${t("signalAlert")}</span>
  `;

  positionsCountTextEl.textContent = `${s.positionsCount} ${t("positionsCountPrefix")}${s.positionsCount > 1 ? "s" : ""} ${t("positionsCountSuffix")}${currentLang === "fr" && s.positionsCount > 1 ? "s" : ""}`;
}

function renderPositions() {
  if (!portfolio || !portfolio.positions) return;

  if (portfolio.positions.length === 0) {
    positionsContainer.innerHTML = `
      <div class="empty-state">
        <h3 style="margin-bottom: 8px; color: var(--text-main);">${t("emptyTitle")}</h3>
        <p>${t("emptyDesc")}</p>
        <button class="btn btn-primary" onclick="openPositionModal()" style="margin-top: 16px;">${t("emptyAddBtn")}</button>
      </div>
    `;
    return;
  }

  const sorted = [...portfolio.positions].sort((a, b) => {
    if (currentSort === "gain_desc") return b.totalGainPercent - a.totalGainPercent;
    if (currentSort === "gain_asc") return a.totalGainPercent - b.totalGainPercent;
    if (currentSort === "today_desc") return b.todayChangePercent - a.todayChangePercent;
    if (currentSort === "today_asc") return a.todayChangePercent - b.todayChangePercent;
    if (currentSort === "name_asc") return a.name.localeCompare(b.name);
    return 0;
  });

  positionsContainer.innerHTML = sorted.map(pos => {
    const sug = pos.suggestion || {};
    const bannerClass = getBannerClass(sug.action);

    const history = pos.dailyBreakdown || [];
    const slicedHistory = history.slice(Math.max(0, history.length - currentDays));
    const reversedHistory = [...slicedHistory].reverse();

    let streakHtml = "";
    if (pos.consecutiveUp >= 2) {
      streakHtml = `<span class="streak-tag streak-up">${t("streakUp", { n: pos.consecutiveUp })}</span>`;
    } else if (pos.consecutiveDown >= 2) {
      streakHtml = `<span class="streak-tag streak-down">${t("streakDown", { n: pos.consecutiveDown })}</span>`;
    }

    const daysHtml = reversedHistory.map((day, idx) => {
      const isUp = day.changePct > 0.005;
      const isDown = day.changePct < -0.005;
      const trendClass = isUp ? "trend-up" : (isDown ? "trend-down" : "trend-flat");
      const changeClass = isUp ? "up" : (isDown ? "down" : "flat");
      const arrow = isUp ? "▲" : (isDown ? "▼" : "—");
      const dayLabel = formatDayLabel(day.dateStr, idx);
      const isBuyDay = day.dateStr === pos.buyDate;
      const buyMarkerHtml = isBuyDay
        ? `<span class="buy-marker-tag" style="display:inline-block; font-size:10px; font-weight:700; color:var(--color-up); background:rgba(16,185,129,0.18); padding:1px 5px; border-radius:4px; margin-top:3px;">${t("boughtTodayMarker")}</span>`
        : "";

      return `
        <div class="day-cell ${trendClass}">
          <span class="day-cell-date">${dayLabel}</span>
          <span class="day-cell-close">${formatCurrency(day.close, pos.currency)}</span>
          <span class="day-cell-change ${changeClass}">
            ${arrow} ${pctFormat(day.changePct)}
          </span>
          <span class="day-cell-val">${t("portfolioText")}${formatCurrency(day.dayValue, pos.currency)}</span>
          ${buyMarkerHtml}
        </div>
      `;
    }).join("");

    const holdingText = getHoldingPeriodText(pos.buyDate, pos.buyTime);
    const timeText = pos.buyTime ? ` ${currentLang === "en" ? "at" : "à"} ${escapeHtml(pos.buyTime)}` : "";
    const holdingBadge = holdingText ? ` (${holdingText})` : "";

    const investedFormatted = formatCurrency(pos.investedNative, pos.currency);
    const currentValFormatted = formatCurrency(pos.currentValueNative, pos.currency);
    const gainFormatted = `${pos.totalGainNative >= 0 ? "+" : ""}${formatCurrency(pos.totalGainNative, pos.currency)}`;
    const convertedInvested = pos.currency !== "EUR" ? `<span style="font-size:11px; color:var(--text-muted); display:block; margin-top:2px;">(~${eurFormat.format(pos.investedEur)})</span>` : "";
    const convertedCurrent = pos.currency !== "EUR" ? `<span style="font-size:11px; color:var(--text-muted); display:block; margin-top:2px;">(~${eurFormat.format(pos.currentValueEur)})</span>` : "";
    const convertedGain = pos.currency !== "EUR" ? `<span style="font-size:11px; color:var(--text-muted); display:block; margin-top:2px;">(~${pos.totalGainEur >= 0 ? "+" : ""}${eurFormat.format(pos.totalGainEur)})</span>` : "";

    const hasFees = (pos.totalFeesNative || 0) > 0;
    const netGainFormatted = `${pos.netGainNative >= 0 ? "+" : ""}${formatCurrency(pos.netGainNative, pos.currency)}`;
    const convertedNetGain = pos.currency !== "EUR" && hasFees
      ? `<span style="font-size:10px; color:var(--text-muted); display:inline-block; margin-left:3px;">(~${pos.netGainEur >= 0 ? "+" : ""}${eurFormat.format(pos.netGainEur)})</span>`
      : "";

    const feesNoticeHtml = hasFees
      ? `<div style="font-size:11px; margin-top:6px; padding-top:4px; border-top:1px dashed var(--card-border); color:var(--text-muted); line-height:1.35;">
          <span>${t("netGain")} : <strong style="color:${pos.netGainNative >= 0 ? 'var(--color-up)' : 'var(--color-down)'}">${netGainFormatted} (${pctFormat(pos.netGainPercent)})</strong>${convertedNetGain}</span>
          <span style="display:block; font-size:10px; opacity:0.85;">${t("totalFeesLabel")}${formatCurrency(pos.totalFeesNative, pos.currency)} (${t("afterFees")})</span>
        </div>`
      : "";

    const highFormatted = formatCurrency(pos.highestClose || 0, pos.currency);
    const lowFormatted = formatCurrency(pos.recentSwingLow || 0, pos.currency);
    const distHighText = `${(pos.distanceFromHighPct || 0) >= -0.1 ? "0.0%" : (pos.distanceFromHighPct || 0).toFixed(1) + "%"}`;
    const structureBar = (pos.highestClose > 0) ? `
      <div class="market-structure-bar" style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; font-size:11px; padding:7px 12px; background:rgba(255,255,255,0.03); border-radius:8px; margin:12px 0 4px 0; border:1px solid var(--card-border);">
        <span>🏔️ <strong style="color:var(--text-main);">${t("highPeak")} :</strong> ${highFormatted} <span style="color:var(--text-muted);">(${distHighText} ${t("distanceFromHigh")})</span></span>
        <span>🛡️ <strong style="color:var(--text-main);">${t("keySupport")} :</strong> ${lowFormatted}</span>
      </div>
    ` : "";

    return `
      <article class="pos-card" data-id="${pos.id}">
        <div class="pos-top-row">
          <div class="pos-identity">
            <span class="pos-symbol-pill">${escapeHtml(pos.symbol)}</span>
            <div>
              <h3 class="pos-name">${escapeHtml(pos.name)}</h3>
              <p class="pos-meta">${t("boughtOn")} ${formatDate(pos.buyDate)}${timeText}${holdingBadge} • ${pos.shares} ${t("sharesText")} @ ${formatCurrency(pos.buyPrice, pos.currency)}</p>
            </div>
          </div>

          <div class="pos-metrics-group">
            <div class="pos-metric-box">
              <span class="metric-label">${t("invested")}</span>
              <span class="metric-value">${investedFormatted}</span>
              ${convertedInvested}
            </div>
            <div class="pos-metric-box">
              <span class="metric-label">${t("currentValue")}</span>
              <span class="metric-value">${currentValFormatted}</span>
              ${convertedCurrent}
            </div>
            <div class="pos-metric-box">
              <span class="metric-label">${hasFees ? t("grossGain") : t("totalGain")}</span>
              <span class="pill-badge ${pos.totalGainPercent >= 0 ? "up" : "down"}">
                ${gainFormatted} (${pctFormat(pos.totalGainPercent)})
              </span>
              ${convertedGain}
              ${feesNoticeHtml}
            </div>
          </div>
        </div>

        ${structureBar}

        <div class="suggestion-banner ${bannerClass}">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="suggestion-badge ${sug.badgeClass || "badge-neutral"}">
              ${escapeHtml(sug.label || t("sugHold"))}
            </span>
            <span class="suggestion-reason">${escapeHtml(sug.reason || "")}</span>
          </div>
        </div>

        <div class="day-strip-wrapper">
          <div class="strip-header">
            <span class="strip-title">${t("dayStripTitle", { n: currentDays })}</span>
            ${streakHtml}
          </div>
          <div class="day-strip">
            ${daysHtml}
          </div>
        </div>

        <div class="pos-footer">
          <span>${pos.notes ? `📝 <em>${escapeHtml(pos.notes)}</em>` : (currentLang === "en" ? "No notes" : "Aucune note")}</span>
          <div class="pos-actions">
            <button class="btn btn-secondary" onclick="editPosition('${pos.id}')" style="font-size: 11px; padding: 4px 10px;">${t("editBtn")}</button>
            <button class="btn-ghost-danger" onclick="deletePosition('${pos.id}', '${pos.symbol}')">${t("deleteBtn")}</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function getBannerClass(action) {
  switch (action) {
    case 'HOLD':
    case 'HOLD_BULLISH':
    case 'HOLD_AT_HIGH':
      return 'banner-success';
    case 'TAKE_PROFIT':
      return 'banner-warning';
    case 'TARGET_REACHED':
      return 'banner-gold';
    case 'WATCH_DOWNTREND':
      return 'banner-orange';
    case 'SELL_STOP_LOSS':
    case 'SELL_BREAKDOWN':
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
  document.getElementById('modalTitle').textContent = t('modalAddTitle');
  document.getElementById('posBuyDate').value = new Date().toISOString().split('T')[0];
  const timeEl = document.getElementById('posBuyTime');
  if (timeEl) timeEl.value = '';
  document.getElementById('posCurrency').value = 'EUR';
  const buyFeeEl = document.getElementById('posBuyFee');
  const sellFeeEl = document.getElementById('posSellFee');
  if (buyFeeEl) buyFeeEl.value = '';
  if (sellFeeEl) sellFeeEl.value = '';
  updateCurrencyLabels();
  autocompleteDropdown.style.display = 'none';
  positionModal.classList.add('active');
};

window.editPosition = function(id) {
  const local = getLocalData();
  const pos = (local.positions || []).find(p => p.id === id);
  if (!pos) return;

  document.getElementById('posId').value = pos.id;
  document.getElementById('modalTitle').textContent = t('modalEditTitle', { name: pos.name || pos.symbol });
  document.getElementById('posSearch').value = pos.name || pos.symbol;
  document.getElementById('posSymbol').value = pos.symbol || '';
  document.getElementById('posName').value = pos.name || '';
  document.getElementById('posBuyDate').value = pos.buyDate || '';
  const timeEl = document.getElementById('posBuyTime');
  if (timeEl) timeEl.value = pos.buyTime || '';
  document.getElementById('posCurrency').value = pos.currency || 'EUR';
  document.getElementById('posInvestedAmount').value = pos.investedAmount || '';
  document.getElementById('posShares').value = pos.shares || '';
  document.getElementById('posBuyPrice').value = pos.buyPrice || '';
  const buyFeeEl = document.getElementById('posBuyFee');
  const sellFeeEl = document.getElementById('posSellFee');
  if (buyFeeEl) buyFeeEl.value = pos.buyFee !== undefined ? pos.buyFee : (pos.symbol === 'SPCX' ? 1.17 : '');
  if (sellFeeEl) sellFeeEl.value = pos.sellFee !== undefined ? pos.sellFee : (pos.symbol === 'SPCX' ? 1.17 : '');
  document.getElementById('posNotes').value = pos.notes || '';
  updateCurrencyLabels();

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
  const buyTime = document.getElementById('posBuyTime')?.value || '';
  const currency = document.getElementById('posCurrency').value || 'EUR';
  const investedAmount = parseFloat(document.getElementById('posInvestedAmount').value) || 0;
  const shares = parseFloat(document.getElementById('posShares').value) || 1;
  const buyPrice = parseFloat(document.getElementById('posBuyPrice').value) || (shares > 0 && investedAmount > 0 ? investedAmount / shares : 0);
  const buyFee = parseFloat(document.getElementById('posBuyFee')?.value) || 0;
  const sellFee = parseFloat(document.getElementById('posSellFee')?.value) || 0;
  const notes = document.getElementById('posNotes').value;

  const posData = {
    id: id || ('pos_' + Date.now()),
    symbol: symbol.toUpperCase(),
    name: name,
    buyDate,
    buyTime,
    currency,
    investedAmount,
    shares,
    buyPrice,
    buyFee,
    sellFee,
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
  if (!confirm(t('confirmDelete', { symbol }))) return;

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

// --- REVOLUT CSV PARSER & IMPORTER ---
function parseRevolutCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) throw new Error("Le fichier est vide ou invalide.");

  const firstLine = lines[0];
  const delim = firstLine.includes(";") ? ";" : (firstLine.includes("\t") ? "\t" : ",");

  function parseCSVLine(line) {
    const res = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQuotes = !inQuotes;
      else if (c === delim && !inQuotes) {
        res.push(cur.trim().replace(/^"|"$/g, ""));
        cur = "";
      } else {
        cur += c;
      }
    }
    res.push(cur.trim().replace(/^"|"$/g, ""));
    return res;
  }

  const rawHeaders = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());

  const idxDate = rawHeaders.findIndex(h => h.includes("date") || h.includes("exécution") || h.includes("time") || h.includes("started"));
  let idxTicker = rawHeaders.findIndex(h => h.includes("ticker") || h.includes("symbol") || h.includes("symbole") || h.includes("asset") || h.includes("code") || h.includes("product"));
  const idxDesc = rawHeaders.findIndex(h => h.includes("description") || h.includes("libellé") || h.includes("nom") || h.includes("name"));
  const idxType = rawHeaders.findIndex(h => h.includes("type") || h.includes("action") || h.includes("side") || h.includes("opération"));
  const idxQty = rawHeaders.findIndex(h => h.includes("quantity") || h.includes("shares") || h.includes("quantité") || h.includes("units") || h.includes("parts"));
  const idxPrice = rawHeaders.findIndex(h => h.includes("price") || h.includes("prix") || h.includes("rate") || h.includes("cours"));
  const idxAmount = rawHeaders.findIndex(h => h.includes("total amount") || h.includes("montant total") || h.includes("amount") || h.includes("montant") || h.includes("total") || h.includes("cost basis") || h.includes("fiat"));
  const idxFee = rawHeaders.findIndex(h => h.includes("fee") || h.includes("frais") || h.includes("commission"));
  const idxCur = rawHeaders.findIndex(h => h.includes("currency") || h.includes("devise"));

  const map = new Map();

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (!row || row.length === 0) continue;

    let rawTicker = (idxTicker >= 0 ? row[idxTicker] : "") || "";
    const desc = (idxDesc >= 0 ? row[idxDesc] : "") || "";

    // If ticker not found, try extracting from description (common in Revolut Crypto)
    if (!rawTicker && desc) {
      const match = desc.match(/(?:Bought|Achat|Acheté|Purchased|Sold|Vendu|Vente)\s+([A-Za-z0-9\.\-]+)/i);
      if (match) {
        rawTicker = match[1];
      } else {
        const parts = desc.trim().split(/\s+/);
        rawTicker = parts[parts.length - 1];
      }
    }

    rawTicker = rawTicker.trim().toUpperCase();
    if (!rawTicker || rawTicker === "USD" || rawTicker === "EUR" || rawTicker === "GBP") continue;

    const typeStr = (idxType >= 0 ? row[idxType] || "" : "BUY").toUpperCase();
    const isSell = typeStr.includes("SELL") || typeStr.includes("VENTE") || typeStr.includes("VENDU");
    const isBuy = typeStr.includes("BUY") || typeStr.includes("ACHAT") || typeStr.includes("ACHET") || (!isSell);

    const rawDateStr = idxDate >= 0 ? (row[idxDate] || "").trim() : "";
    let buyDate = "";
    let buyTime = "";
    if (rawDateStr) {
      const parts = rawDateStr.split(/[ T]/);
      buyDate = parts[0];
      if (parts[1]) buyTime = parts[1].substring(0, 5);
      if (buyDate.includes("/")) {
        const dParts = buyDate.split("/");
        if (dParts.length === 3 && dParts[0].length <= 2 && dParts[2].length === 4) {
          buyDate = `${dParts[2]}-${dParts[1].padStart(2, "0")}-${dParts[0].padStart(2, "0")}`;
        }
      }
    }

    const qty = Math.abs(parseFloat((row[idxQty] || "0").replace(",", "."))) || 0;
    const price = Math.abs(parseFloat((row[idxPrice] || "0").replace(",", "."))) || 0;
    const amount = Math.abs(parseFloat((row[idxAmount] || "0").replace(",", "."))) || (qty * price);
    const fee = idxFee >= 0 ? Math.abs(parseFloat((row[idxFee] || "0").replace(",", "."))) || 0 : 0;
    const currency = idxCur >= 0 ? (row[idxCur] || "EUR").toUpperCase() : "EUR";

    if (!map.has(rawTicker)) {
      map.set(rawTicker, {
        symbol: rawTicker,
        name: desc || rawTicker,
        shares: 0,
        investedAmount: 0,
        buyFee: 0,
        sellFee: 0,
        currency,
        buyDate: buyDate || new Date().toISOString().split("T")[0],
        buyTime: buyTime || ""
      });
    }

    const entry = map.get(rawTicker);
    if (isBuy) {
      entry.shares += qty;
      entry.investedAmount += amount;
      entry.buyFee += fee;
      entry.sellFee = entry.buyFee;
      if (buyDate) {
        entry.buyDate = buyDate;
        entry.buyTime = buyTime;
      }
    } else if (isSell) {
      const prevShares = entry.shares;
      entry.shares = Math.max(0, entry.shares - qty);
      if (prevShares > 0) {
        entry.investedAmount = Math.max(0, entry.investedAmount * (entry.shares / prevShares));
      }
    }
  }

  return Array.from(map.values())
    .filter(p => p.shares > 0.000001)
    .map(p => ({
      id: "pos_" + p.symbol.toLowerCase().replace(/[^a-z0-9]/g, "") + "_" + Math.random().toString(36).substring(2, 7),
      symbol: p.symbol,
      name: p.name !== p.symbol ? p.name : p.symbol,
      buyDate: p.buyDate,
      buyTime: p.buyTime,
      currency: p.currency,
      shares: Math.round(p.shares * 100000000) / 100000000,
      investedAmount: Math.round(p.investedAmount * 100) / 100,
      buyPrice: p.shares > 0 ? Math.round((p.investedAmount / p.shares) * 100) / 100 : 0,
      buyFee: Math.round((p.buyFee || 0) * 100) / 100,
      sellFee: Math.round((p.buyFee || 0) * 100) / 100,
      notes: "Importé depuis relevé Revolut"
    }));
}

async function handleCsvFileSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const content = evt.target.result;
      const parsedPositions = parseRevolutCSV(content);

      if (!parsedPositions || parsedPositions.length === 0) {
        alert("Aucune position d'achat active n'a été trouvée dans ce relevé Revolut.\n\nVérifiez que le fichier contient bien des ordres d'achat d'actions ou de crypto.");
        return;
      }

      const summaryList = parsedPositions.map(p => `${p.symbol} (${p.shares} parts)`).join(', ');
      const confirmAdd = confirm(
        `✅ ${parsedPositions.length} position(s) active(s) détectée(s) :\n${summaryList}\n\n` +
        `Voulez-vous les ajouter à votre portefeuille ?\n` +
        `(Les positions existantes portant le même symbole seront mises à jour).`
      );

      if (!confirmAdd) return;

      const local = getLocalData();
      const existing = local.positions || [];

      parsedPositions.forEach(newPos => {
        const foundIdx = existing.findIndex(p => p.symbol.toUpperCase() === newPos.symbol.toUpperCase());
        if (foundIdx >= 0) {
          existing[foundIdx] = { ...existing[foundIdx], ...newPos, id: existing[foundIdx].id };
        } else {
          existing.push(newPos);
        }
      });

      local.positions = existing;
      saveLocalData(local);

      alert(`🎉 ${parsedPositions.length} position(s) Revolut ajoutée(s) avec succès !`);
      
      e.target.value = '';
      closeSettingsModal();
      loadPortfolio(true);
      pushToCloud();
    } catch (err) {
      alert(`Erreur lors de la lecture du fichier CSV Revolut : ${err.message}`);
    }
  };

  reader.readAsText(file);
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
  const btn = document.getElementById('themeToggleBtn');
  if (icon) {
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
  if (btn) {
    btn.title = theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre';
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
