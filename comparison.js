/* ========== KASBULLET COMPARISON MODULE ========== */
/* Provides price data, performance calculations, and chart rendering
   through modular, testable services with no API calls from UI components. */

/* ========== CONSTANTS ========== */

const KASPA_LAUNCH_DATE = new Date('2022-11-07');
const BTC_LAUNCH_DATE = new Date('2009-01-03');

/* ========== NOTIFICATION SYSTEM ========== */

const NotificationManager = (() => {
  const show = (message, type = 'info', duration = 3000) => {
    const container = document.getElementById('notification-container') || (() => {
      const div = document.createElement('div');
      div.id = 'notification-container';
      div.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        font-family: system-ui, sans-serif;
      `;
      document.body.appendChild(div);
      return div;
    })();

    const notification = document.createElement('div');
    const bgColor = type === 'success' ? '#51cf66' : type === 'error' ? '#ff6b6b' : '#70c7ba';
    notification.style.cssText = `
      background: ${bgColor};
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      margin-bottom: 10px;
      animation: slideIn 0.3s ease-out;
      font-size: 0.9rem;
      max-width: 300px;
      word-wrap: break-word;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    `;
    notification.textContent = message;
    container.appendChild(notification);

    if (duration > 0) {
      setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
      }, duration);
    }

    return notification;
  };

  // Add animation keyframes
  if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  return {
    success: (msg) => show(msg, 'success'),
    error: (msg) => show(msg, 'error', 5000),
    info: (msg) => show(msg, 'info', 3000),
  };
})();

/* ========== PRICE SERVICE ========== */
/* Abstracts CoinGecko API; enables provider replacement without UI changes */

const PriceService = (() => {
  const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
  const CURRENT_CACHE_DURATION = 60000; // 1 minute
  const HISTORICAL_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  let cache = {};

  const getCached = (key) => {
    const entry = cache[key];
    if (!entry) return null;
    const duration = key.startsWith('historical-') ? HISTORICAL_CACHE_DURATION : CURRENT_CACHE_DURATION;
    if (Date.now() - entry.timestamp < duration) {
      return entry.data;
    }
    delete cache[key];
    return null;
  };

  const setCached = (key, data) => {
    cache[key] = { data, timestamp: Date.now() };
  };

  /**
   * Trim price data to a specific start date
   * Returns only prices from startDate onwards
   */
  const trimToDate = (prices, startDate) => {
    return prices.filter(p => new Date(p[0]) >= startDate);
  };

  return {
    /**
     * Get current prices for KAS and BTC in USD
     */
    async getCurrentPrices() {
      const cacheKey = 'current-prices';
      const cached = getCached(cacheKey);
      if (cached) return cached;

      try {
        const res = await fetch(
          `${COINGECKO_BASE}/simple/price?ids=kaspa,bitcoin&vs_currencies=usd&include_market_cap=true&include_24hr_change=true`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const prices = {
          kas: {
            usd: data.kaspa?.usd ?? null,
            marketCap: data.kaspa?.usd_market_cap ?? null,
            change24h: data.kaspa?.usd_24h_change ?? null,
          },
          btc: {
            usd: data.bitcoin?.usd ?? null,
            marketCap: data.bitcoin?.usd_market_cap ?? null,
            change24h: data.bitcoin?.usd_24h_change ?? null,
          },
          timestamp: Date.now(),
        };

        setCached(cacheKey, prices);
        return prices;
      } catch (err) {
        console.error('PriceService.getCurrentPrices failed:', err);
        throw err;
      }
    },

    /**
     * Get historical prices for a given timeframe
     * For "all" timeframe: BTC history is trimmed to start from Kaspa launch date
     * for proper institutional-grade normalization
     * @param {number} days - Number of days of history
     * @returns {Object} { dates, kasPrice, btcPrice }
     */
    async getHistoricalPrices(days) {
      const cacheKey = `historical-${days}d`;
      const cached = getCached(cacheKey);
      if (cached) return cached;

      try {
        const [kasRes, btcRes] = await Promise.all([
          fetch(
            `${COINGECKO_BASE}/coins/kaspa/market_chart?vs_currency=usd&days=${days}&interval=daily`
          ),
          fetch(
            `${COINGECKO_BASE}/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`
          ),
        ]);

        if (!kasRes.ok || !btcRes.ok) throw new Error('Failed to fetch historical data');

        const kasData = await kasRes.json();
        const btcData = await btcRes.json();

        // For "all" timeframe (days > 1000), trim BTC to Kaspa launch date
        // for institutional-grade comparison: both normalized from same start date
        let btcPrices = btcData.prices;
        if (days > 1000) {
          btcPrices = trimToDate(btcPrices, KASPA_LAUNCH_DATE);
        }

        const result = {
          dates: kasData.prices.map(p => new Date(p[0])),
          kasPrice: kasData.prices.map(p => p[1]),
          btcPrice: btcPrices.map(p => p[1]),
        };

        setCached(cacheKey, result);
        return result;
      } catch (err) {
        console.error(`PriceService.getHistoricalPrices(${days}) failed:`, err);
        throw err;
      }
    },

    clearCache() {
      cache = {};
    },
  };
})();

/* ========== COMPARISON SERVICE ========== */
/* Calculates normalized performance, correlations, and metrics */

const ComparisonService = (() => {
  /**
   * Normalize prices from a common starting value (100)
   */
  const normalize = (prices) => {
    if (!prices || prices.length === 0) return [];
    const startPrice = prices[0];
    return prices.map(p => (p / startPrice) * 100);
  };

  /**
   * Calculate returns between two prices
   */
  const calcReturn = (startPrice, endPrice) => {
    if (!startPrice || startPrice === 0) return 0;
    return ((endPrice - startPrice) / startPrice) * 100;
  };

  /**
   * Calculate CAGR (Compound Annual Growth Rate)
   */
  const calcCAGR = (startPrice, endPrice, years) => {
    if (!startPrice || startPrice === 0 || years === 0) return 0;
    return (Math.pow(endPrice / startPrice, 1 / years) - 1) * 100;
  };

  /**
   * Calculate volatility (standard deviation of daily returns)
   */
  const calcVolatility = (prices) => {
    if (!prices || prices.length < 2) return 0;
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * 100 * Math.sqrt(365); // Annualized
  };

  /**
   * Calculate rolling correlation (Pearson)
   */
  const calcRollingCorrelation = (prices1, prices2, window) => {
    if (prices1.length !== prices2.length || prices1.length < window + 1) return 0;

    const start = Math.max(0, prices1.length - window);
    const p1 = prices1.slice(start);
    const p2 = prices2.slice(start);

    const returns1 = [];
    const returns2 = [];
    for (let i = 1; i < p1.length; i++) {
      returns1.push((p1[i] - p1[i - 1]) / p1[i - 1]);
      returns2.push((p2[i] - p2[i - 1]) / p2[i - 1]);
    }

    if (returns1.length === 0) return 0;

    const mean1 = returns1.reduce((a, b) => a + b, 0) / returns1.length;
    const mean2 = returns2.reduce((a, b) => a + b, 0) / returns2.length;

    let covariance = 0;
    let variance1 = 0;
    let variance2 = 0;

    for (let i = 0; i < returns1.length; i++) {
      const diff1 = returns1[i] - mean1;
      const diff2 = returns2[i] - mean2;
      covariance += diff1 * diff2;
      variance1 += diff1 * diff1;
      variance2 += diff2 * diff2;
    }

    const stdDev1 = Math.sqrt(variance1 / returns1.length);
    const stdDev2 = Math.sqrt(variance2 / returns2.length);

    if (stdDev1 === 0 || stdDev2 === 0) return 0;
    return (covariance / returns1.length) / (stdDev1 * stdDev2);
  };

  /**
   * Calculate maximum drawdown
   */
  const calcMaxDrawdown = (prices) => {
    if (!prices || prices.length < 2) return 0;
    let maxDD = 0;
    let peak = prices[0];

    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > peak) peak = prices[i];
      const dd = (peak - prices[i]) / peak;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD * 100;
  };

  /**
   * Calculate Sharpe Ratio (assuming 0% risk-free rate for crypto)
   */
  const calcSharpeRatio = (prices) => {
    if (!prices || prices.length < 2) return 0;
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return 0;
    return (mean / stdDev) * Math.sqrt(365); // Annualized
  };

  return {
    normalize,
    calcReturn,
    calcCAGR,
    calcVolatility,
    calcRollingCorrelation,
    calcMaxDrawdown,
    calcSharpeRatio,

    /**
     * Calculate all comparison metrics
     */
    async calculateMetrics(days) {
      try {
        const [prices, current] = await Promise.all([
          PriceService.getHistoricalPrices(days),
          PriceService.getCurrentPrices(),
        ]);

        const kasPrices = prices.kasPrice;
        const btcPrices = prices.btcPrice;

        const normKas = normalize(kasPrices);
        const normBtc = normalize(btcPrices);

        const kasVolatility = calcVolatility(kasPrices);
        const btcVolatility = calcVolatility(btcPrices);

        const kasReturn = calcReturn(kasPrices[0], kasPrices[kasPrices.length - 1]);
        const btcReturn = calcReturn(btcPrices[0], btcPrices[btcPrices.length - 1]);

        // Calculate correlations for different windows
        const corr30d = calcRollingCorrelation(kasPrices, btcPrices, 30);
        const corr90d = calcRollingCorrelation(kasPrices, btcPrices, 90);
        const corr1y = calcRollingCorrelation(kasPrices, btcPrices, 365);

        const kasMaxDD = calcMaxDrawdown(kasPrices);
        const btcMaxDD = calcMaxDrawdown(btcPrices);

        const kasSharpe = calcSharpeRatio(kasPrices);
        const btcSharpe = calcSharpeRatio(btcPrices);

        // CAGR calculation
        const yearsElapsed = days / 365.25;
        const kasCAGR = calcCAGR(kasPrices[0], kasPrices[kasPrices.length - 1], yearsElapsed);
        const btcCAGR = calcCAGR(btcPrices[0], btcPrices[btcPrices.length - 1], yearsElapsed);

        return {
          kasPrice: current.kas.usd,
          btcPrice: current.btc.usd,
          kasChange24h: current.kas.change24h,
          btcChange24h: current.btc.change24h,
          kasMarketCap: current.kas.marketCap,
          btcMarketCap: current.btc.marketCap,
          normKas,
          normBtc,
          kasVolatility,
          btcVolatility,
          corr30d,
          corr90d,
          corr1y,
          kasMaxDD,
          btcMaxDD,
          kasSharpe,
          btcSharpe,
          kasCAGR,
          btcCAGR,
          kasReturn,
          btcReturn,
          outperformance: kasReturn - btcReturn,
          dates: prices.dates,
          kasRawPrices: kasPrices,
          btcRawPrices: btcPrices,
        };
      } catch (err) {
        console.error('ComparisonService.calculateMetrics failed:', err);
        throw err;
      }
    },
  };
})();

/* ========== CHART MANAGER ========== */
/* Handles Chart.js initialization, updates, and interactions with zoom/pan
   REQUIRES: chartjs-plugin-zoom to be loaded before this module */

const ChartManager = (() => {
  let chart = null;
  let currentMetrics = null;
  let originalXScale = null;

  // Verify required plugin is loaded
  const validateZoomPlugin = () => {
    if (typeof window.Chart === 'undefined') {
      throw new Error('Chart.js is not loaded. Load Chart.js before ChartManager.');
    }
    if (typeof window.Chart.plugins.getAll !== 'function') {
      console.warn('ChartManager: Chart.js appears to be loaded but plugin system may not be fully initialized.');
    }
    // chartjs-plugin-zoom registers itself globally when loaded
    // If zoom controls don't work, verify chartjs-plugin-zoom is loaded in HTML
  };

  const getChartColors = () => {
    const isDark = !document.body.classList.contains('light');
    return {
      kas: isDark ? '#49eacb' : '#0d7566',
      btc: isDark ? '#70c7ba' : '#1f8f7f',
      gridColor: isDark ? 'rgba(112,199,186,0.1)' : 'rgba(15,60,53,0.15)',
      textColor: isDark ? '#8a9795' : '#55645f',
    };
  };

  const createChartInstance = () => {
    const ctx = document.getElementById('comparisonChart')?.getContext('2d');
    if (!ctx) return null;

    validateZoomPlugin();
    const colors = getChartColors();

    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: currentMetrics?.dates?.map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) || [],
        datasets: [
          {
            label: 'Kaspa (Normalized)',
            data: currentMetrics?.normKas || [],
            borderColor: colors.kas,
            backgroundColor: `${colors.kas}15`,
            borderWidth: 2.5,
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 8,
            pointBackgroundColor: colors.kas,
            pointBorderColor: 'white',
            pointBorderWidth: 2,
          },
          {
            label: 'Bitcoin (Normalized)',
            data: currentMetrics?.normBtc || [],
            borderColor: colors.btc,
            backgroundColor: `${colors.btc}15`,
            borderWidth: 2.5,
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 8,
            pointBackgroundColor: colors.btc,
            pointBorderColor: 'white',
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: colors.textColor,
              font: { size: 12, weight: '600' },
              padding: 15,
              usePointStyle: true,
            },
          },
          tooltip: {
            backgroundColor: `${colors.gridColor}cc`,
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: colors.kas,
            borderWidth: 1,
            padding: 12,
            displayColors: true,
            callbacks: {
              label: function (context) {
                return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}`;
              },
            },
          },
          zoom: {
            zoom: {
              wheel: { enabled: true },
              pinch: { enabled: true },
              mode: 'x',
            },
            pan: {
              enabled: true,
              mode: 'x',
            },
          },
        },
        scales: {
          x: {
            display: true,
            grid: {
              color: colors.gridColor,
              drawBorder: false,
            },
            ticks: {
              color: colors.textColor,
              font: { size: 11 },
              maxRotation: 0,
            },
          },
          y: {
            type: 'logarithmic',
            display: true,
            grid: {
              color: colors.gridColor,
              drawBorder: false,
            },
            ticks: {
              color: colors.textColor,
              font: { size: 11 },
              callback: (value) => {
                if (value >= 1000) return (value / 1000).toFixed(0) + 'k';
                if (value >= 1) return value.toFixed(0);
                return value.toFixed(2);
              },
            },
            min: 1,
          },
        },
      },
      plugins: [
        {
          id: 'chartAreaPlugin',
          afterDatasetsDraw(chart) {
            const canvas = chart.canvas;
            canvas.addEventListener('mousemove', (e) => {
              const rect = canvas.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              const xScale = chart.scales.x;
              const yScale = chart.scales.y;

              if (x >= xScale.left && x <= xScale.right && y >= yScale.top && y <= yScale.bottom) {
                canvas.style.cursor = 'crosshair';
              } else {
                canvas.style.cursor = 'default';
              }
            });
          },
        },
      ],
    });

    return chart;
  };

  return {
    async init(days = 365) {
      try {
        currentMetrics = await ComparisonService.calculateMetrics(days);
        createChartInstance();
        return currentMetrics;
      } catch (err) {
        console.error('ChartManager.init failed:', err);
        throw err;
      }
    },

    async update(days = 365) {
      try {
        currentMetrics = await ComparisonService.calculateMetrics(days);
        
        if (chart) {
          chart.data.labels = currentMetrics.dates.map(d =>
            d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          );
          chart.data.datasets[0].data = currentMetrics.normKas;
          chart.data.datasets[1].data = currentMetrics.normBtc;
          chart.update();
        }
        return currentMetrics;
      } catch (err) {
        console.error('ChartManager.update failed:', err);
        throw err;
      }
    },

    getMetrics() {
      return currentMetrics;
    },

    destroy() {
      if (chart) {
        chart.destroy();
        chart = null;
      }
    },

    resetZoom() {
      if (chart) {
        chart.resetZoom();
      }
    },
  };
})();

/* ========== INSIGHT GENERATOR ========== */
/* Generates institutional-grade insights from metrics */

const InsightGenerator = (() => {
  return {
    generatePerformanceInsight(metrics) {
      const out = metrics.outperformance;
      const direction = out > 0 ? 'outperformed' : 'underperformed';
      const absOut = Math.abs(out).toFixed(1);
      return `Kaspa has ${direction} Bitcoin by ${absOut}% over the selected timeframe.`;
    },

    generateCorrelationInsight(metrics, timeframe) {
      const corr = timeframe === '30d' ? metrics.corr30d :
                   timeframe === '90d' ? metrics.corr90d :
                   timeframe === '1y' ? metrics.corr1y : metrics.corr1y;
      
      let insight = '';
      if (corr > 0.7) {
        insight = `Correlation has strengthened (${(corr * 100).toFixed(0)}%), indicating KAS is moving closely with Bitcoin.`;
      } else if (corr > 0.3) {
        insight = `Correlation is moderate (${(corr * 100).toFixed(0)}%), showing some independence from Bitcoin price action.`;
      } else {
        insight = `Correlation has weakened (${(corr * 100).toFixed(0)}%), indicating Kaspa is trading independently.`;
      }
      return insight;
    },

    generateVolatilityInsight(metrics) {
      const volDiff = metrics.kasVolatility - metrics.btcVolatility;
      if (Math.abs(volDiff) < 5) {
        return 'Volatility is comparable between both assets during this period.';
      }
      const direction = volDiff > 0 ? 'higher' : 'lower';
      const absVolDiff = Math.abs(volDiff).toFixed(1);
      return `Kaspa volatility is ${absVolDiff}% ${direction} than Bitcoin, indicating ${volDiff > 0 ? 'greater' : 'relatively lower'} price dispersion.`;
    },

    generateMomentumInsight(metrics) {
      if (!metrics.kasRawPrices || metrics.kasRawPrices.length < 8) return '';
      const p7d = ComparisonService.calcReturn(
        metrics.kasRawPrices[metrics.kasRawPrices.length - 8],
        metrics.kasRawPrices[metrics.kasRawPrices.length - 1]
      );
      if (p7d > 10) return '🚀 Strong upside momentum detected over the last 7 days.';
      if (p7d > 0) return '📈 Positive momentum, though moderate.';
      if (p7d > -10) return '📉 Slight downside pressure building.';
      return '🔴 Significant downside momentum observed.';
    },

    generateCAGRInsight(metrics) {
      const kasCAGR = metrics.kasCAGR;
      const btcCAGR = metrics.btcCAGR;
      if (kasCAGR > btcCAGR) {
        const diff = (kasCAGR - btcCAGR).toFixed(1);
        return `Kaspa's annualized growth rate (${kasCAGR.toFixed(1)}%) exceeds Bitcoin's (${btcCAGR.toFixed(1)}%) by ${diff}%.`;
      } else {
        const diff = (btcCAGR - kasCAGR).toFixed(1);
        return `Bitcoin's annualized growth rate (${btcCAGR.toFixed(1)}%) exceeds Kaspa's (${kasCAGR.toFixed(1)}%) by ${diff}%.`;
      }
    },
  };
})();

/* ========== UI CONTROLLER ========== */
/* Updates UI elements with calculated metrics */

const UIController = (() => {
  const formatPrice = (n) => {
    if (n === null || n === undefined) return '—';
    return '$' + n.toLocaleString('en-US', {
      minimumFractionDigits: n < 1 ? 4 : 2,
      maximumFractionDigits: n < 1 ? 5 : 2,
    });
  };

  const formatPercent = (n) => {
    if (n === null || n === undefined) return '—';
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  };

  const formatRatio = (n) => {
    if (n === null || n === undefined) return '—';
    return n.toFixed(8);
  };

  const setTextContent = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const setClassConditional = (id, className, condition) => {
    const el = document.getElementById(id);
    if (el) {
      if (condition) {
        el.classList.add(className);
      } else {
        el.classList.remove(className);
      }
    }
  };

  return {
    updateMetricCards(metrics) {
      if (!metrics) return;

      setTextContent('kas-price', formatPrice(metrics.kasPrice));
      setTextContent('kas-price-change', formatPercent(metrics.kasChange24h));
      setTextContent('kas-price-updated', `via CoinGecko`);
      setClassConditional('kas-price-change', 'positive', metrics.kasChange24h >= 0);
      setClassConditional('kas-price-change', 'negative', metrics.kasChange24h < 0);

      setTextContent('btc-price', formatPrice(metrics.btcPrice));
      setTextContent('btc-price-change', formatPercent(metrics.btcChange24h));
      setTextContent('btc-price-updated', `via CoinGecko`);
      setClassConditional('btc-price-change', 'positive', metrics.btcChange24h >= 0);
      setClassConditional('btc-price-change', 'negative', metrics.btcChange24h < 0);

      setTextContent('kas-return', formatPercent(metrics.kasReturn));
      setTextContent('btc-return', formatPercent(metrics.btcReturn));
      setTextContent('kas-btc-ratio', formatRatio(metrics.kasPrice / metrics.btcPrice));
      setTextContent('correlation', (metrics.corr1y * 100).toFixed(1) + '%');
    },

    updateGrowthComparison(metrics) {
      if (!metrics) return;

      const calc7d = () => {
        if (metrics.kasRawPrices.length < 8) return { kas: 0, btc: 0 };
        return {
          kas: ComparisonService.calcReturn(
            metrics.kasRawPrices[metrics.kasRawPrices.length - 8],
            metrics.kasRawPrices[metrics.kasRawPrices.length - 1]
          ),
          btc: ComparisonService.calcReturn(
            metrics.btcRawPrices[metrics.btcRawPrices.length - 8],
            metrics.btcRawPrices[metrics.btcRawPrices.length - 1]
          ),
        };
      };

      const calc30d = () => {
        if (metrics.kasRawPrices.length < 31) return { kas: 0, btc: 0 };
        return {
          kas: ComparisonService.calcReturn(
            metrics.kasRawPrices[metrics.kasRawPrices.length - 31],
            metrics.kasRawPrices[metrics.kasRawPrices.length - 1]
          ),
          btc: ComparisonService.calcReturn(
            metrics.btcRawPrices[metrics.btcRawPrices.length - 31],
            metrics.btcRawPrices[metrics.btcRawPrices.length - 1]
          ),
        };
      };

      const calc90d = () => {
        if (metrics.kasRawPrices.length < 91) return { kas: 0, btc: 0 };
        return {
          kas: ComparisonService.calcReturn(
            metrics.kasRawPrices[metrics.kasRawPrices.length - 91],
            metrics.kasRawPrices[metrics.kasRawPrices.length - 1]
          ),
          btc: ComparisonService.calcReturn(
            metrics.btcRawPrices[metrics.btcRawPrices.length - 91],
            metrics.btcRawPrices[metrics.btcRawPrices.length - 1]
          ),
        };
      };

      const p7d = calc7d();
      const p30d = calc30d();
      const p90d = calc90d();

      setTextContent('kas-7d', formatPercent(p7d.kas));
      setTextContent('btc-7d', formatPercent(p7d.btc));
      setTextContent('kas-30d', formatPercent(p30d.kas));
      setTextContent('btc-30d', formatPercent(p30d.btc));
      setTextContent('kas-90d', formatPercent(p90d.kas));
      setTextContent('btc-90d', formatPercent(p90d.btc));
      setTextContent('kas-1y', formatPercent(metrics.kasReturn));
      setTextContent('btc-1y', formatPercent(metrics.btcReturn));

      setTextContent('sum-kas-7d', formatPercent(p7d.kas));
      setTextContent('sum-btc-7d', formatPercent(p7d.btc));
      setTextContent('sum-kas-30d', formatPercent(p30d.kas));
      setTextContent('sum-btc-30d', formatPercent(p30d.btc));
      setTextContent('sum-kas-1y', formatPercent(metrics.kasReturn));
      setTextContent('sum-btc-1y', formatPercent(metrics.btcReturn));
    },

    updatePerformanceInsights(metrics, timeframe = '1y') {
      if (!metrics) return;

      setTextContent('outperformance', formatPercent(metrics.outperformance));

      const volDiff = metrics.kasVolatility - metrics.btcVolatility;
      setTextContent('volatility', metrics.kasVolatility.toFixed(2) + '%');
      setClassConditional('volatility', 'positive', volDiff < 0);
      setClassConditional('volatility', 'negative', volDiff >= 0);

      setTextContent('max-drawdown', formatPercent(-metrics.kasMaxDD));

      const trend = metrics.kasReturn > metrics.btcReturn ? 'KAS Leading' : 'BTC Leading';
      setTextContent('current-trend', trend);
    },

    updateKeyRatios(metrics) {
      if (!metrics) return;

      setTextContent('ratio-kasbtc', formatRatio(metrics.kasPrice / metrics.btcPrice));
      setTextContent('ratio-mcap', formatRatio((metrics.kasMarketCap || 0) / (metrics.btcMarketCap || 1)));
      setTextContent('ratio-corr', (metrics.corr1y * 100).toFixed(1) + '%');
      setTextContent('ratio-vol-kas', metrics.kasVolatility.toFixed(2) + '%');
      setTextContent('ratio-vol-btc', metrics.btcVolatility.toFixed(2) + '%');
    },

    updateMarketStructure(metrics) {
      if (!metrics) return;

      // Note: BTC dominance correctly requires total crypto market cap from API
      // For now, we'll display a placeholder
      setTextContent('btc-dominance', '—');

      const p7d = metrics.kasRawPrices.length > 7
        ? ComparisonService.calcReturn(
            metrics.kasRawPrices[metrics.kasRawPrices.length - 8],
            metrics.kasRawPrices[metrics.kasRawPrices.length - 1]
          )
        : 0;
      const momentum = p7d > 0 ? '📈 Bullish' : '📉 Bearish';
      setTextContent('kas-momentum', momentum);

      const corr = metrics.corr1y;
      const regime = corr > 0.7 ? 'Correlated' : corr > 0.3 ? 'Moderate' : 'Diverging';
      setTextContent('regime', regime);
    },

    showError: (message) => NotificationManager.error(message),
    showSuccess: (message) => NotificationManager.success(message),
    showInfo: (message) => NotificationManager.info(message),
  };
})();

/* ========== INITIALIZATION & EVENT HANDLERS ========== */

window.initComparison = async () => {
  const activeTimeframe = localStorage.getItem('comparison-timeframe') || '1y';
  
  const timeframeMap = {
    '7d': 7,
    '1m': 30,
    '3m': 90,
    '1y': 365,
    'all': (() => {
      const now = new Date();
      return Math.ceil((now - KASPA_LAUNCH_DATE) / (1000 * 60 * 60 * 24));
    })(),
  };

  const showLoading = () => {
    document.querySelectorAll('.metric-value:not(.skeleton)').forEach(el => {
      if (el.textContent === '—') {
        el.classList.add('skeleton');
      }
    });
  };

  const hideLoading = () => {
    document.querySelectorAll('.metric-value.skeleton').forEach(el => {
      el.classList.remove('skeleton');
    });
  };

  const loadComparison = async (timeframe) => {
    try {
      showLoading();
      const days = timeframeMap[timeframe] || 365;
      const metrics = await ChartManager.update(days);

      UIController.updateMetricCards(metrics);
      UIController.updateGrowthComparison(metrics);
      UIController.updatePerformanceInsights(metrics, timeframe);
      UIController.updateKeyRatios(metrics);
      UIController.updateMarketStructure(metrics);

      localStorage.setItem('comparison-timeframe', timeframe);
      hideLoading();
    } catch (err) {
      UIController.showError('Failed to load comparison data: ' + err.message);
      hideLoading();
    }
  };

  // Initialize chart
  try {
    await ChartManager.init(timeframeMap[activeTimeframe] || 365);
    await loadComparison(activeTimeframe);
  } catch (err) {
    UIController.showError('Failed to initialize comparison: ' + err.message);
  }

  // Timeframe button handlers
  document.querySelectorAll('.timeframe-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await loadComparison(btn.dataset.timeframe);
    });
  });

  // Set initial active button
  document.querySelector(`.timeframe-btn[data-timeframe="${activeTimeframe}"]`)?.classList.add('active');

  // Chart reset button
  document.getElementById('chart-reset-btn')?.addEventListener('click', () => {
    ChartManager.resetZoom();
    UIController.showInfo('Chart zoom reset');
  });

  // Share button
  document.getElementById('share-btn')?.addEventListener('click', async () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: 'KAS vs BTC Comparison',
        text: 'Compare Kaspa performance against Bitcoin',
        url: url,
      });
    } else {
      try {
        await navigator.clipboard.writeText(url);
        UIController.showSuccess('Link copied to clipboard');
      } catch (err) {
        UIController.showError('Failed to copy link');
      }
    }
  });

  // Date range button (placeholder for future feature)
  document.getElementById('date-range-btn')?.addEventListener('click', () => {
    UIController.showInfo('Custom date range coming soon');
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    ChartManager.destroy();
  });
};

// Auto-initialize if DOM is ready
if (document.readyState !== 'loading') {
  window.initComparison();
} else {
  document.addEventListener('DOMContentLoaded', window.initComparison);
}
