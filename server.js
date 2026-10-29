import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'data', 'portfolio.json');
const PUBLIC_DIR = __dirname;

// Cache in-memory for financial queries (TTL: 3 minutes)
const cache = {
  quotes: new Map(),
  rates: new Map(),
  lastUpdated: null,
};
const CACHE_TTL_MS = 3 * 60 * 1000;

// Utility: Read JSON file safely
function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = {
        settings: {
          currency: 'EUR',
          profitTargetPercent: 15,
          stopLossPercent: -10,
          consecutiveDownDaysAlert: 3,
          consecutiveUpDaysAlert: 3,
          dipBuyThresholdPercent: -3,
          defaultPeriodDays: 7
        },
        positions: []
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading portfolio data:', err);
    return { settings: {}, positions: [] };
  }
}

// Utility: Write JSON file safely
function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing portfolio data:', err);
    return false;
  }
}

// Fetch currency conversion rate to EUR
async function getCurrencyRateToEUR(fromCurrency) {
  const cur = (fromCurrency || 'EUR').toUpperCase();
  if (cur === 'EUR') return 1.0;

  const now = Date.now();
  const cached = cache.rates.get(cur);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.rate;
  }

  try {
    // E.g. EURUSD=X gives how many USD for 1 EUR.
    // If stock is in USD, 1 USD = 1 / (EURUSD=X) EUR.
    const pair = `EUR${cur}=X`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${pair}?range=1d&interval=1d`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } });
    if (!res.ok) throw new Error(`Currency fetch status ${res.status}`);
    const json = await res.json();
    const eurToCur = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (eurToCur && eurToCur > 0) {
      const curToEur = 1 / eurToCur;
      cache.rates.set(cur, { rate: curToEur, timestamp: now });
      return curToEur;
    }
  } catch (e) {
    console.warn(`Could not fetch live rate for ${cur}, using fallback:`, e.message);
  }

  // Fallbacks if offline
  const fallbacks = { USD: 0.92, GBP: 1.18, CHF: 1.05 };
  return fallbacks[cur] || 1.0;
}

// Fetch historical chart data from Yahoo Finance
async function fetchChartData(symbol, forceRefresh = false) {
  const now = Date.now();
  const cached = cache.quotes.get(symbol);
  if (!forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${symbol}: HTTP ${res.status}`);
  }

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    throw new Error(`No chart data returned for ${symbol}`);
  }

  const meta = result.meta || {};
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const closes = quote.close || [];

  // Filter out null/undefined close values
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

  cache.quotes.set(symbol, { data: payload, timestamp: now });
  return payload;
}

// Generate decision suggestions based on custom criteria
function evaluateSuggestion(position, enrichedData, settings) {
  const { totalGainPercent, todayChangePercent, consecutiveUp, consecutiveDown, recentDays } = enrichedData;
  const targetProfit = settings.profitTargetPercent ?? 15;
  const stopLoss = settings.stopLossPercent ?? -10;
  const downAlertDays = settings.consecutiveDownDaysAlert ?? 3;

  // 1. Stop-Loss check (Priority 1: Risk management)
  if (totalGainPercent <= stopLoss) {
    return {
      action: 'SELL_STOP_LOSS',
      label: 'Stop-Loss / Couper',
      badgeClass: 'badge-danger',
      reason: `Perte globale de ${totalGainPercent.toFixed(1)}% (seuil stop-loss: ${stopLoss}%). Envisagez de couper la position pour limiter les pertes.`
    };
  }

  // 2. Take profit check (Priority 2: Secure gains)
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

  // 3. Consecutive down days alert (User's pain point: "est-ce que ça baisse de jour en jour ?")
  if (consecutiveDown >= downAlertDays) {
    return {
      action: 'WATCH_DOWNTREND',
      label: `Alerte baisse (${consecutiveDown}j)`,
      badgeClass: 'badge-orange',
      reason: `${consecutiveDown} séances consécutives de baisse. Vos gains s'effritent de jour en jour : surveillez attentivement.`
    };
  }

  // 4. Dip buy opportunity in a healthy stock
  if (totalGainPercent > 3 && consecutiveDown >= 2 && todayChangePercent < -2.0) {
    return {
      action: 'BUY_DIP',
      label: 'Opportunité / Renforcer',
      badgeClass: 'badge-blue',
      reason: `Position globalement haussière (+${totalGainPercent.toFixed(1)}%) subissant un repli court terme. Opportunité potentielle de renfort à moindre coût.`
    };
  }

  // 5. Positive momentum / Hold
  if (consecutiveUp >= 2) {
    return {
      action: 'HOLD_BULLISH',
      label: `Garder (Hausse ${consecutiveUp}j)`,
      badgeClass: 'badge-success',
      reason: `Excellente dynamique : ${consecutiveUp} jours d'affilée dans le vert. Conservez la position.`
    };
  }

  // Default: Hold
  return {
    action: 'HOLD',
    label: 'Garder',
    badgeClass: 'badge-neutral',
    reason: `Tendance neutre ou stable. Aucune alerte déclenchée, conservez la position.`
  };
}

// Compute full portfolio view with day-by-day metrics
async function getEnrichedPortfolio(forceRefresh = false) {
  const data = readData();
  const settings = data.settings || {};
  const positions = data.positions || [];

  const enrichedPositions = [];
  let totalInvestedEur = 0;
  let totalCurrentValueEur = 0;
  let totalDayGainEur = 0;

  for (const pos of positions) {
    try {
      const chart = await fetchChartData(pos.symbol, forceRefresh);
      const toEurRate = await getCurrencyRateToEUR(chart.currency);

      const shares = parseFloat(pos.shares) || 0;
      const buyPrice = parseFloat(pos.buyPrice) || 0;
      const investedEur = parseFloat(pos.investedAmount) || (shares * buyPrice * toEurRate);

      const currentPrice = chart.currentPrice;
      const currentPriceEur = currentPrice * toEurRate;
      const currentValueEur = shares * currentPriceEur;

      const totalGainEur = currentValueEur - investedEur;
      const totalGainPercent = investedEur > 0 ? (totalGainEur / investedEur) * 100 : 0;

      // Extract day-by-day series (last 30 market days)
      const fullHistory = chart.history;
      const daysCount = Math.min(fullHistory.length, 30);
      const recentHistory = fullHistory.slice(fullHistory.length - daysCount);

      // Format each day with delta relative to previous day
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
          trend, // 'up' | 'down' | 'flat'
          dayValueEur,
          dayGainFromBuyEur,
          dayGainFromBuyPct
        });
      }

      // Calculate consecutive streaks ending today
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

      // Suggestion
      const suggestion = evaluateSuggestion(pos, {
        totalGainPercent,
        todayChangePercent,
        consecutiveUp,
        consecutiveDown,
        recentDays: dailyBreakdown
      }, settings);

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
      console.error(`Error enriching position ${pos.symbol}:`, err.message);
      // Fallback with basic position info
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
          action: 'ERROR',
          label: 'Données en cours...',
          badgeClass: 'badge-neutral',
          reason: 'Données en cours de synchronisation ou symbole inconnu.'
        },
        dailyBreakdown: [],
        notes: pos.notes || '',
        error: err.message
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

// Request dispatcher
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Enable CORS & JSON headers helper
  const sendJson = (data, status = 200) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
  };

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // --- API ROUTES ---

  // GET /api/portfolio
  if (method === 'GET' && pathname === '/api/portfolio') {
    try {
      const force = parsedUrl.searchParams.get('refresh') === 'true';
      const portfolio = await getEnrichedPortfolio(force);
      return sendJson(portfolio);
    } catch (err) {
      console.error('API /api/portfolio error:', err);
      return sendJson({ error: 'Failed to build portfolio', message: err.message }, 500);
    }
  }

  // GET /api/search?q=query (Yahoo ticker search)
  if (method === 'GET' && pathname === '/api/search') {
    const q = parsedUrl.searchParams.get('q');
    if (!q || q.trim().length < 1) {
      return sendJson([]);
    }
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q.trim())}&quotesCount=6&newsCount=0`;
      const yRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const data = await yRes.json();
      const quotes = (data.quotes || []).map(item => ({
        symbol: item.symbol,
        name: item.shortname || item.longname || item.symbol,
        exchange: item.exchDisp || item.exchange,
        type: item.quoteType
      }));
      return sendJson(quotes);
    } catch (err) {
      return sendJson([]);
    }
  }

  // POST /api/positions (Add position)
  if (method === 'POST' && pathname === '/api/positions') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (!payload.symbol || !payload.buyDate) {
          return sendJson({ error: 'Symbole et date d\'achat requis' }, 400);
        }

        const data = readData();
        const newPos = {
          id: 'pos_' + Date.now(),
          symbol: payload.symbol.trim().toUpperCase(),
          name: payload.name || payload.symbol.trim().toUpperCase(),
          buyDate: payload.buyDate,
          buyPrice: parseFloat(payload.buyPrice) || 0,
          shares: parseFloat(payload.shares) || 0,
          investedAmount: parseFloat(payload.investedAmount) || 0,
          currency: (payload.currency || 'USD').toUpperCase(),
          notes: payload.notes || ''
        };

        // If invested amount not provided, calculate from buyPrice * shares
        if (!newPos.investedAmount && newPos.buyPrice && newPos.shares) {
          newPos.investedAmount = newPos.buyPrice * newPos.shares;
        }

        data.positions = data.positions || [];
        data.positions.unshift(newPos);
        writeData(data);

        return sendJson({ success: true, position: newPos });
      } catch (err) {
        return sendJson({ error: 'Payload invalide' }, 400);
      }
    });
    return;
  }

  // DELETE /api/positions/:id
  if (method === 'DELETE' && pathname.startsWith('/api/positions/')) {
    const id = pathname.replace('/api/positions/', '');
    const data = readData();
    const initialLen = data.positions.length;
    data.positions = data.positions.filter(p => p.id !== id);
    if (data.positions.length !== initialLen) {
      writeData(data);
      return sendJson({ success: true });
    } else {
      return sendJson({ error: 'Position non trouvée' }, 404);
    }
  }

  // PUT /api/positions/:id
  if (method === 'PUT' && pathname.startsWith('/api/positions/')) {
    const id = pathname.replace('/api/positions/', '');
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const data = readData();
        const posIndex = data.positions.findIndex(p => p.id === id);
        if (posIndex === -1) {
          return sendJson({ error: 'Position non trouvée' }, 404);
        }
        data.positions[posIndex] = {
          ...data.positions[posIndex],
          ...payload,
          id // prevent ID mutation
        };
        writeData(data);
        return sendJson({ success: true, position: data.positions[posIndex] });
      } catch (err) {
        return sendJson({ error: 'Payload invalide' }, 400);
      }
    });
    return;
  }

  // GET & POST /api/settings
  if (pathname === '/api/settings') {
    if (method === 'GET') {
      const data = readData();
      return sendJson(data.settings || {});
    }
    if (method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const data = readData();
          data.settings = { ...data.settings, ...payload };
          writeData(data);
          return sendJson({ success: true, settings: data.settings });
        } catch (err) {
          return sendJson({ error: 'Payload invalide' }, 400);
        }
      });
      return;
    }
  }

  // --- STATIC FILE SERVING ---
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Security: Prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Access denied');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Fallback to index.html for SPA if not an asset
        if (!ext || ext === '.html') {
          fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, fallback) => {
            if (err2) {
              res.writeHead(404);
              res.end('Not found');
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(fallback);
            }
          });
          return;
        }
        res.writeHead(404);
        return res.end('Not found');
      }
      res.writeHead(500);
      return res.end('Internal server error');
    }
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

function startServer(portToTry) {
  server.listen(portToTry, () => {
    console.log(`\n🚀 Stock Tracker prêt sur : http://localhost:${portToTry}\n`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`Port ${PORT} déjà utilisé, essai sur le port ${PORT + 1}...`);
    PORT = PORT + 1;
    startServer(PORT);
  } else {
    console.error('Erreur serveur:', err);
  }
});

startServer(PORT);
