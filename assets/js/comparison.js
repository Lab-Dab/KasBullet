/* ========== KASBULLET COMPARISON MODULE ========== */
/* Provides price data, performance calculations, and chart rendering
   through modular, testable services with no API calls from UI components. */

/* ========== PRICE SERVICE ========== */
/* Abstracts CoinGecko API; enables provider replacement without UI changes */

const PriceService = (() => {
  const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
  const CACHE_DURATION = 60000; // 1 minute
  let cache = {};

  const getCached = (key) => {
    const entry = cache[key];
    if (entry && Date.now() - entry.timestamp < CACHE_DURATION) {
      return entry.data;
    }
    return null;
  };

  const setCached = (key, data) => {
    cache[key] = { data, timestamp: Date.now() };
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

        const result = {
          dates: kasData.prices.map(p => new Date(p[0])),
          kasPrice: kasData.prices.map(p => p[1]),
          btcPrice: btcData.prices.map(p => p[1]),
        };

        setCached(cacheKey, result);
        return result;
      } catch (err) {
        console.error(`PriceService.getHistoricalPrices(${days}) failed:`, err);
        throw err;
      }
    },

    /**
     * Get prices for a specific date in the past
     */
    async getPriceAtDate(date, days) {
      try {
        const historical = await this.getHistoricalPrices(days);
        const index = historical.dates.findIndex(
          d => d.toDateString() === date.toDateString()
        );
        if (index === -1) return null;
        return {
          kas: historical.kasPrice[index],
          btc: historical.btcPrice[index],
          date: historical.dates[index],
        };
      } catch (err) {
        console.error('PriceService.getPriceAtDate failed:', err);
        return null;
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
   * @param {number[]} prices - Array of prices
   * @returns {number[]} Normalized values
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
   * Calculate volatility (standard deviation of returns)
   */
  const calcVolatility = (prices) => {
    if (!prices || prices.length < 2) return 0;
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * 100;
  };

  /**
   * Calculate Pearson correlation coefficient
   */
  const calcCorrelation = (prices1, prices2) => {
    if (prices1.length !== prices2.length || prices1.length < 2) return 0;

    const returns1 = [];
    const returns2 = [];
    for (let i = 1; i < prices1.length; i++) {
      returns1.push((prices1[i] - prices1[i - 1]) / prices1[i - 1]);
      returns2.push((prices2[i] - prices2[i - 1]) / prices2[i - 1]);
    }

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

  return {
    normalize,
    calcReturn,
    calcVolatility,
    calcCorrelation,
    calcMaxDrawdown,

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
        const correlation = calcCorrelation(kasPrices, btcPrices);
        const kasMaxDD = calcMaxDrawdown(kasPrices);
        const btcMaxDD = calcMaxDrawdown(btcPrices);

        const kasReturn = calcReturn(kasPrices[0], kasPrices[kasPrices.length - 1]);
        const btcReturn = calcReturn(btcPrices[0], btcPrices[btcPrices.length - 1]);

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
          correlation,
          kasMaxDD,
          btcMaxDD,
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
/* Handles Chart.js initialization, updates, and interactions */

const ChartManager = (() => {
  let chart = null;
  let currentMetrics = null;

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
              callback: (value) => value.toFixed(0),
            },
            min: 1,
          },
        },
      },
      plugins: [
        {
          id: 'chartAreaPlugin',
          afterDatasetsDraw(chart) {
            const ctx = chart.ctx;
            const xScale = chart.scales.x;
            const yScale = chart.scales.y;
            const canvas = chart.canvas;

            canvas.addEventListener('mousemove', (e) => {
              const rect = canvas.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;

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

      // KAS Price
      setTextContent('kas-price', formatPrice(metrics.kasPrice));
      setTextContent('kas-price-change', formatPercent(metrics.kasChange24h));
      setTextContent('kas-price-updated', `via CoinGecko`);
      setClassConditional('kas-price-change', 'positive', metrics.kasChange24h >= 0);
      setClassConditional('kas-price-change', 'negative', metrics.kasChange24h < 0);

      // BTC Price
      setTextContent('btc-price', formatPrice(metrics.btcPrice));
      setTextContent('btc-price-change', formatPercent(metrics.btcChange24h));
      setTextContent('btc-price-updated', `via CoinGecko`);
      setClassConditional('btc-price-change', 'positive', metrics.btcChange24h >= 0);
      setClassConditional('btc-price-change', 'negative', metrics.btcChange24h < 0);

      // Returns
      setTextContent('kas-return', formatPercent(metrics.kasReturn));
      setTextContent('btc-return', formatPercent(metrics.btcReturn));

      // Ratio
      setTextContent('kas-btc-ratio', formatRatio(metrics.kasPrice / metrics.btcPrice));

      // Correlation
      setTextContent('correlation', (metrics.correlation * 100).toFixed(1) + '%');
    },

    updateGrowthComparison(metrics) {
      if (!metrics) return;

      // Calculate returns for different periods
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

      // Performance Summary Sidebar
      setTextContent('sum-kas-7d', formatPercent(p7d.kas));
      setTextContent('sum-btc-7d', formatPercent(p7d.btc));
      setTextContent('sum-kas-30d', formatPercent(p30d.kas));
      setTextContent('sum-btc-30d', formatPercent(p30d.btc));
      setTextContent('sum-kas-1y', formatPercent(metrics.kasReturn));
      setTextContent('sum-btc-1y', formatPercent(metrics.btcReturn));
    },

    updatePerformanceInsights(metrics) {
      if (!metrics) return;

      // Outperformance
      setTextContent('outperformance', formatPercent(metrics.outperformance));

      // Volatility
      const volDiff = metrics.kasVolatility - metrics.btcVolatility;
      setTextContent('volatility', metrics.kasVolatility.toFixed(2) + '%');
      setClassConditional('volatility', 'positive', volDiff < 0);
      setClassConditional('volatility', 'negative', volDiff >= 0);

      // Max Drawdown
      setTextContent('max-drawdown', formatPercent(-metrics.kasMaxDD));

      // Trend
      const trend = metrics.kasReturn > metrics.btcReturn ? 'KAS Leading' : 'BTC Leading';
      setTextContent('current-trend', trend);
    },

    updateKeyRatios(metrics) {
      if (!metrics) return;

      const kasToSat = metrics.kasPrice / (metrics.btcPrice / 100000000);

      setTextContent('ratio-kasbtc', formatRatio(metrics.kasPrice / metrics.btcPrice));
      setTextContent('ratio-mcap', formatRatio((metrics.kasMarketCap || 0) / (metrics.btcMarketCap || 1)));
      setTextContent('ratio-corr', (metrics.correlation * 100).toFixed(1) + '%');
      setTextContent('ratio-vol-kas', metrics.kasVolatility.toFixed(2) + '%');
      setTextContent('ratio-vol-btc', metrics.btcVolatility.toFixed(2) + '%');
    },

    updateMarketStructure(metrics) {
      if (!metrics) return;

      // BTC dominance approximation
      const dominance = (metrics.btcMarketCap / ((metrics.btcMarketCap || 1) + (metrics.kasMarketCap || 0))) * 100;
      setTextContent('btc-dominance', dominance.toFixed(1) + '%');

      // KAS momentum (short-term vs long-term)
      const p7d = metrics.kasRawPrices.length > 7
        ? ComparisonService.calcReturn(
            metrics.kasRawPrices[metrics.kasRawPrices.length - 8],
            metrics.kasRawPrices[metrics.kasRawPrices.length - 1]
          )
        : 0;
      const momentum = p7d > 0 ? '📈 Bullish' : '📉 Bearish';
      setTextContent('kas-momentum', momentum);

      // Regime determination
      const corr = metrics.correlation;
      const regime = corr > 0.7 ? 'Correlated' : corr > 0.3 ? 'Moderate' : 'Diverging';
      setTextContent('regime', regime);
    },

    showError(message) {
      console.error(message);
      alert(`Error: ${message}`);
    },
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
    'all': 1825, // ~5 years
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
      UIController.updatePerformanceInsights(metrics);
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
  });

  // Share button
  document.getElementById('share-btn')?.addEventListener('click', () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: 'KAS vs BTC Comparison',
        text: 'Compare Kaspa performance against Bitcoin',
        url: url,
      });
    } else {
      prompt('Share this link:', url);
    }
  });

  // Date range button (placeholder)
  document.getElementById('date-range-btn')?.addEventListener('click', () => {
    alert('Custom date range coming soon');
  });
};

// Auto-initialize if DOM is ready
if (document.readyState !== 'loading') {
  window.initComparison();
} else {
  document.addEventListener('DOMContentLoaded', window.initComparison);
}
