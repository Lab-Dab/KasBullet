(function () {
  "use strict";

  const {
    dataService,
    refreshManager,
    eventBus,
    stateStore,
    historicalDataService,
    kaspaNetworkService,
    backgroundPrefetchManager,
    assetRegistry,
  } = window.KasBulletCore;
  const ui = window.KasBulletComponents;
  let latestChartPoints = [];
  const snapshotAssetOrder = ["bitcoin", "ethereum", "solana", "binancecoin", "ripple"];
  const unreadAlertStorageKey = "kasbullet:read-alerts:v1";

  const marketSnapshotRows = snapshotAssetOrder
    .map((id) => assetRegistry.get(id))
    .filter(Boolean)
    .map((asset) => ({ label: asset.symbol || asset.name, id: asset.id, provider: asset.provider }));

  function field(name) {
    return document.querySelector(`[data-field="${name}"]`);
  }

  function setText(name, value) {
    const element = field(name);
    if (element) element.textContent = value;
  }

  function setStatus(id, status, text) {
    const element = document.getElementById(id);
    if (!element) return;
    element.dataset.status = status;
    element.textContent = text;
  }

  function formatPrice(value) {
    if (typeof value !== "number") return "Unavailable";
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: value < 1 ? 4 : 2,
      maximumFractionDigits: value < 1 ? 5 : 2,
    });
  }

  function formatCompact(value, suffix = "") {
    if (typeof value !== "number") return "Unavailable";
    return `${Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value)}${suffix}`;
  }

  function formatPercent(value) {
    if (typeof value !== "number") return "Unavailable";
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  }

  function formatLastUpdated(value) {
    if (!value) return "Last Updated unavailable";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return "Last Updated unavailable";
    return `Last Updated ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }

  function formatUtcTime(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return "--";
    return date.toISOString().slice(11, 19);
  }

  function changeClass(value) {
    if (typeof value !== "number") return "change neutral";
    if (value > 0) return "change up";
    if (value < 0) return "change down";
    return "change neutral";
  }

  function fearGreedLabel(score) {
    if (!Number.isFinite(score)) return "Unavailable";
    if (score <= 24) return "Extreme Fear";
    if (score <= 44) return "Fear";
    if (score <= 54) return "Neutral";
    if (score <= 74) return "Greed";
    return "Extreme Greed";
  }

  function altcoinSeasonLabel(score) {
    if (!Number.isFinite(score)) return "Unavailable";
    if (score < 25) return "Bitcoin Season";
    if (score <= 75) return "Neutral";
    return "Altcoin Season";
  }

  function readAlertIds() {
    try {
      return new Set(JSON.parse(localStorage.getItem(unreadAlertStorageKey) || "[]"));
    } catch (_) {
      return new Set();
    }
  }

  function writeAlertIds(ids) {
    try {
      localStorage.setItem(unreadAlertStorageKey, JSON.stringify(Array.from(ids).slice(-200)));
    } catch (_) {
      return;
    }
  }

  function alertId(item) {
    return [item.category || "feed", item.headline || "alert", item.publishedAt || item.story || ""].join(":");
  }

  function normalizeAlerts(feed = []) {
    return feed.map((item) => ({
      ...item,
      id: alertId(item),
      category: item.category || "Market",
      severity: item.severity || "Notable",
      source: item.source || item.channelTitle || "Local feed",
      description: item.story || item.headline || "Verified alert pending.",
    }));
  }

  function latestUnreadAlert(feed = []) {
    const readIds = readAlertIds();
    const severityRank = { Major: 3, Significant: 2, Notable: 1 };
    return normalizeAlerts(feed)
      .filter((item) => !readIds.has(item.id))
      .sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0))[0] || null;
  }

  function smallSparkline(values = []) {
    const points = values.filter(Number.isFinite).slice(-7);
    if (points.length < 2) return '<svg class="sparkline" aria-hidden="true"></svg>';
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const path = points.map((value, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 28 - ((value - min) / range) * 28;
      return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
    const direction = points[points.length - 1] > points[0] ? "up" : points[points.length - 1] < points[0] ? "down" : "neutral";
    return `<svg class="sparkline sparkline--${direction}" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><path d="${path}"></path></svg>`;
  }

  function calcReturn(points) {
    if (!points.length || typeof points[0].price !== "number") return null;
    const first = points[0].price;
    const last = points[points.length - 1].price;
    return ((last - first) / first) * 100;
  }

  function renderSectionHeaders() {
    ui.renderSectionHeader("ribbon-header", {
      id: "ribbon-title",
      title: "Live Intelligence Ribbon",
      statusId: "ribbon-status",
      statusText: "Preparing data",
    });
    ui.renderSectionHeader("market-snapshot-header", {
      id: "market-snapshot-title",
      title: "KasBullet Snapshot",
      statusId: "market-snapshot-status",
      statusText: "Preparing snapshot",
    });
    ui.renderSectionHeader("kaspa-network-status-header", {
      id: "kaspa-network-status-title",
      title: "Kaspa Network Status",
      statusId: "kaspa-network-status-status",
      statusText: "Preparing network",
    });
    ui.renderSectionHeader("primary-chart-header", {
      id: "primary-chart-title",
      title: "Kaspa Market Terminal",
      statusId: "primary-chart-status",
      statusText: "Preparing chart",
    });
    ui.renderSectionHeader("cycle-strip-header", {
      id: "cycle-strip-title",
      title: "Cycle Strip",
      statusId: "cycle-strip-status",
      status: "unavailable",
      statusText: "Models not enabled",
    });
    ui.renderSectionHeader("market-intelligence-header", {
      id: "market-intelligence-title",
      title: "Market Intelligence",
      statusId: "market-intelligence-status",
      statusText: "Preparing market data",
    });
    ui.renderSectionHeader("kaspa-comparison-header", {
      id: "kaspa-comparison-title",
      title: "Kaspa Comparison Terminal",
      statusId: "kaspa-comparison-status",
      statusText: "Preparing comparisons",
    });
    ui.renderSectionHeader("supply-intelligence-header", {
      id: "supply-intelligence-title",
      title: "Supply Intelligence",
      statusId: "supply-intelligence-status",
      statusText: "Preparing supply data",
    });
    ui.renderSectionHeader("network-intelligence-header", {
      id: "network-intelligence-title",
      title: "Network Intelligence",
      statusId: "network-intelligence-status",
      statusText: "Preparing network data",
    });
    ui.renderSectionHeader("cycle-intelligence-header", {
      id: "cycle-intelligence-title",
      title: "Kaspa Market Cap Terminal",
      statusId: "cycle-intelligence-status",
      status: "unavailable",
      statusText: "Models not enabled",
    });
    ui.renderSectionHeader("market-intelligence-summary-header", {
      id: "market-intelligence-summary-title",
      title: "KasBullet Brief",
      statusId: "market-intelligence-summary-status",
      status: "unavailable",
      statusText: "Factual summary",
    });
    ui.renderSectionHeader("market-intelligence-feed-header", {
      id: "market-intelligence-feed-title",
      title: "Latest Alerts",
      statusId: "market-intelligence-feed-status",
      statusText: "Preparing feed",
    });
  }

  function renderChartToolbar() {
    document.getElementById("chart-toolbar").innerHTML = [
      '<div class="timeframe-group" role="group" aria-label="KAS chart timeframe">',
      '<button type="button" class="timeframe" data-timeframe="max" aria-pressed="false">ALL</button>',
      '<button type="button" class="timeframe" data-timeframe="1460" aria-pressed="false">4Y</button>',
      '<button type="button" class="timeframe" data-timeframe="730" aria-pressed="false">2Y</button>',
      '<button type="button" class="timeframe" data-timeframe="365" aria-pressed="false">1Y</button>',
      '<button type="button" class="timeframe" data-timeframe="180" aria-pressed="false">6M</button>',
      '<button type="button" class="timeframe" data-timeframe="90" aria-pressed="false">3M</button>',
      '<button type="button" class="timeframe" data-timeframe="30" aria-pressed="true">1M</button>',
      '</div>',
      '<button type="button" class="toolbar-button" data-chart-scale="log" aria-pressed="true">Log</button>',
      ui.toolbarButton({ label: "Overlays", disabled: true }),
    ].join("");
    document.getElementById("terminal-legend").innerHTML = [
      '<span>KAS price since genesis</span>',
      '<span>Log scale default</span>',
    ].join("");
    document.getElementById("terminal-overlays").innerHTML = '<span>Overlays unavailable until verified secondary series are connected</span>';
  }

  function renderInitialState() {
    document.getElementById("ribbon-grid").innerHTML = [
      ui.metricCard({ label: "Live Status", value: "Loading", note: "Preparing sync", field: "ribbonSync" }),
      ui.metricCard({ label: "Network Health", value: "Loading", note: "Kaspa Intelligence", field: "ribbonHealth", noteField: "ribbonHealthNote", jump: "#network-intelligence" }),
      ui.metricCard({ label: "KAS Price", value: "Loading", note: "24h --", field: "ribbonPrice", noteField: "ribbonPriceNote", jump: "#primary-chart-header" }),
      ui.metricCard({ label: "Hashrate", value: "Loading", note: "vs 30d avg unavailable", field: "ribbonHashrate", noteField: "ribbonHashrateNote", jump: "#network-intelligence" }),
      ui.metricCard({ label: "Fear & Greed", value: "Loading", note: "Alternative.me", field: "ribbonFearGreed", noteField: "ribbonFearGreedNote", jump: "#market-intelligence" }),
      ui.metricCard({ label: "Latest Alert", value: "No active alerts", note: "Unread feed", field: "ribbonAlert", noteField: "ribbonAlertNote", jump: "#market-intelligence-feed" }),
    ].join("");

    document.getElementById("market-snapshot").innerHTML = marketSnapshotRows.map((asset) =>
      ui.marketRow({ label: asset.label, value: asset.provider === "coingecko" ? "Loading" : "Unavailable", change: "--" })
    ).join("");

    document.getElementById("kaspa-network-status-grid").innerHTML = [
      ui.statCard({ label: "Network", value: "Loading", source: "Kaspa Intelligence", field: "networkHealth" }),
      ui.statCard({ label: "BPS", value: "Loading", source: "Kaspa Intelligence", field: "networkBps" }),
      ui.statCard({ label: "TPS", value: "Unavailable", source: "Kaspa Intelligence", field: "networkTps" }),
      ui.statCard({ label: "Hashrate", value: "Loading", source: "Kaspa Intelligence", field: "networkHashrate" }),
      ui.statCard({ label: "Difficulty", value: "Loading", source: "Kaspa Intelligence", field: "networkDifficulty" }),
      ui.statCard({ label: "Supply", value: "Loading", source: "Kaspa Intelligence", field: "networkSupply" }),
    ].join("");

    document.getElementById("cycle-strip-grid").innerHTML = [
      "Cycle Score",
      "Market Risk",
      "Conviction",
      "Liquidity",
      "Network Strength",
    ].map((label) => ui.metricCard({ label, value: "Unavailable", note: "Future intelligence container" })).join("");

    document.getElementById("chart-stats").innerHTML = [
      ui.statCard({ label: "KAS Price", value: "Loading", source: "CoinGecko", field: "chartPrice" }),
      ui.statCard({ label: "Window Return", value: "Loading", source: "Selected timeframe", field: "chartReturn" }),
      ui.statCard({ label: "24h Change", value: "Loading", source: "CoinGecko", field: "chartChange" }),
    ].join("");

    document.getElementById("kaspa-comparison-grid").innerHTML = ui.loadingSkeleton("Loading Kaspa comparison context.");

    document.getElementById("market-grid").innerHTML = ui.intelligencePanel({
      title: "Market Intelligence",
      headline: "Loading",
      chartLabel: "Market intelligence interactive chart container",
      insight: "Objective market context will render here when verified data is available.",
      statusId: "market-panel-status",
    });

    document.getElementById("supply-grid").innerHTML = ui.intelligencePanel({
      title: "Supply Intelligence",
      headline: "Loading",
      chartLabel: "Supply intelligence interactive chart container",
      insight: "Supply metrics remain limited to verified public data until additional providers are connected.",
      statusId: "supply-panel-status",
    });

    document.getElementById("network-grid").innerHTML = ui.intelligencePanel({
      title: "Network Intelligence",
      headline: "10 BPS",
      chartLabel: "Network intelligence interactive chart container",
      insight: "Network intelligence containers are ready for verified chain data.",
      statusId: "network-panel-status",
    });

    document.getElementById("cycle-grid").innerHTML = '<p class="empty-state">Market cap ladder data is unavailable until live ranking thresholds are connected.</p>';

    document.getElementById("summary-panel").innerHTML =
      '<p>KasBullet Brief is preparing objective market conditions. Not analysis or advice.</p>';
    document.getElementById("feed-category-grid").innerHTML = [
      "All",
      "Market",
      "Network",
      "Development",
      "Ecosystem",
      "Macro",
    ].map((label) => ui.feedCategory({ label })).join("");
    document.getElementById("alerts-grid").innerHTML = ui.loadingSkeleton("Loading latest verified alerts.");
  }

  function renderMarketSnapshot(markets, global, altcoinSeason) {
    const marketById = new Map(markets.map((market) => [market.id, market]));
    const kaspaChange = marketById.get("kaspa")?.price_change_percentage_24h;
    const outperformCount = marketSnapshotRows.filter((asset) => {
      const change = marketById.get(asset.id)?.price_change_percentage_24h;
      return Number.isFinite(kaspaChange) && Number.isFinite(change) && kaspaChange > change;
    }).length;
    const rows = marketSnapshotRows.map((asset) => {
      const market = marketById.get(asset.id);
      const change = market?.price_change_percentage_24h;
      return `
        <button type="button" class="market-row market-row--benchmark" data-benchmark="${ui.escapeHtml(asset.id)}">
          <span>${ui.escapeHtml(asset.label)}</span>
          <span>${ui.escapeHtml(formatPrice(market?.current_price))}</span>
          ${smallSparkline(market?.sparkline_in_7d?.price || [])}
          <span class="${ui.escapeHtml(changeClass(change))}">${ui.escapeHtml(formatPercent(change))}</span>
          <span class="correlation-badge">corr --</span>
        </button>
      `;
    });
    const btcDominance = global?.data?.market_cap_percentage?.btc;
    const totalMarketCap = global?.data?.total_market_cap?.usd;
    const stablecoinMarketCap = global?.data?.total_market_cap?.usd
      ? null
      : null;
    const altcoinScore = typeof altcoinSeason?.value === "number" ? altcoinSeason.value : null;
    document.getElementById("market-snapshot").innerHTML = [
      `<p class="snapshot-summary">KAS is outperforming ${outperformCount} of 5 majors today</p>`,
      ...rows,
      '<div class="snapshot-index-strip">',
      `<article><span>BTC Dominance</span><strong>${Number.isFinite(btcDominance) ? `${btcDominance.toFixed(1)}%` : "Unavailable"}</strong><meter class="gauge" min="0" max="100" value="${Number.isFinite(btcDominance) ? Math.min(100, btcDominance).toFixed(1) : 0}"></meter></article>`,
      `<article><span>Altcoin Season</span><strong>${Number.isFinite(altcoinScore) ? altcoinScore : "Unavailable"}</strong><small>${ui.escapeHtml(altcoinSeasonLabel(altcoinScore))}</small></article>`,
      `<article><span>Total Crypto Cap</span><strong>${formatCompact(totalMarketCap)}</strong></article>`,
      `<article><span>Stablecoin Cap</span><strong>${formatCompact(stablecoinMarketCap)}</strong><small>Provider pending</small></article>`,
      '</div>',
    ].join("");
  }

  async function updateSnapshotCorrelations() {
    try {
      const kaspaHistory = await historicalDataService.getHistory("kaspa", 90);
      await Promise.all(marketSnapshotRows.map(async (asset) => {
        const row = document.querySelector(`[data-benchmark="${asset.id}"] .correlation-badge`);
        if (!row) return;
        try {
          const benchmarkHistory = await historicalDataService.getHistory(asset.id, 90);
          const correlation = window.KasBulletCore.analyticsEngine.correlation(kaspaHistory, benchmarkHistory);
          row.textContent = Number.isFinite(correlation) ? `corr ${correlation.toFixed(2)}` : "corr --";
        } catch (_) {
          row.textContent = "corr --";
        }
      }));
    } catch (_) {
      document.querySelectorAll(".correlation-badge").forEach((row) => {
        row.textContent = "corr --";
      });
    }
  }

  function updateSnapshot({ markets, global }, updatedAt) {
    const kaspa = markets.find((market) => market.id === "kaspa");
    const totalMarketCap = global.data?.total_market_cap?.usd;
    const kaspaDominance =
      typeof kaspa?.market_cap === "number" && typeof totalMarketCap === "number"
        ? (kaspa.market_cap / totalMarketCap) * 100
        : null;
    const change = kaspa?.price_change_percentage_24h;
    const price = formatPrice(kaspa?.current_price);

    setText("ribbonPrice", price);
    setText("ribbonPriceNote", `24h ${formatPercent(change)}`);
    setText("ribbonSync", "Live");
    setText("chartPrice", price);
    setText("chartChange", formatPercent(change));
    if (field("chartChange")) field("chartChange").className = `stat-value ${changeClass(change)}`;
    const marketHeadline = document.querySelector("#market-grid .panel-headline .stat-value");
    const supplyHeadline = document.querySelector("#supply-grid .panel-headline .stat-value");
    if (marketHeadline) marketHeadline.textContent = price;
    if (supplyHeadline) supplyHeadline.textContent = formatCompact(kaspa?.circulating_supply, " KAS");

    const currentMarketState = stateStore.getState().market.data || {};
    const fearGreedScore = Number(currentMarketState.fearGreed?.data?.[0]?.value);
    setText("ribbonFearGreed", Number.isFinite(fearGreedScore) ? String(fearGreedScore) : "Unavailable");
    setText("ribbonFearGreedNote", fearGreedLabel(fearGreedScore));
    renderMarketSnapshot(markets, global, currentMarketState.altcoinSeason);
    updateSnapshotCorrelations();
    setStatus("ribbon-status", "live", formatLastUpdated(updatedAt));
    setStatus("market-snapshot-status", "live", formatLastUpdated(updatedAt));
    setStatus("market-intelligence-status", "live", "Live via CoinGecko");
    setStatus("supply-intelligence-status", "live", "Partial live data");
    setStatus("network-intelligence-status", "live", "Foundation live");
    setStatus("market-panel-status", "live", typeof kaspaDominance === "number" ? `${kaspaDominance.toFixed(4)}% dominance` : formatLastUpdated(updatedAt));
    setStatus("supply-panel-status", "live", "Circulating supply live");
    setStatus("network-panel-status", "unavailable", "Verified provider pending");
  }

  function updateSystemStatus(system) {
    if (!system) return;
    const isHealthy = system.status !== "degraded";
    setText("coreEngineStatus", isHealthy ? "Core Engine Healthy" : "Core Engine Degraded");
    setText("providerHealth", `Provider Health: ${isHealthy ? "Healthy" : "Degraded"}`);
    setText("providerCount", `Providers: ${system.availableProviders || 0}/${system.totalProviders || 0}`);
    setText("latency", `Latency: ${typeof system.latencyMs === "number" ? system.latencyMs : "--"} ms`);
    setText("lastSync", `Last Sync: ${formatUtcTime(system.checkedAt)} UTC`);
    setText("connectionStatus", `Connection Status: ${isHealthy ? "Connected" : "Degraded"}`);
    setText("historicalCache", `Historical Cache: ${system.historicalCache || "Ready"}`);
    setText("liveStream", `Live Stream: ${system.liveStream || "Connected"}`);
    const coreStatus = field("coreEngineStatus");
    if (coreStatus) coreStatus.classList.toggle("status-healthy", isHealthy);
  }

  function updateKaspaSnapshot(kaspaState) {
    const data = kaspaState?.data;
    if (!data) return;
    setText("networkHealth", data.health || "Unavailable");
    setText("networkBps", typeof data.bps === "number" ? data.bps.toFixed(2) : "Unavailable");
    setText("networkTps", typeof data.tps === "number" ? data.tps.toFixed(2) : "Unavailable");
    setText("networkHashrate", formatCompact(data.hashrate));
    setText("networkDifficulty", formatCompact(data.difficulty));
    setText("networkSupply", formatCompact(data.circulatingSupply, " KAS"));
    const healthBand = window.KasBulletCore.analyticsEngine.healthBand(data.networkStrength);
    setText("ribbonHealth", typeof data.networkStrength === "number" ? `${data.networkStrength}/100` : "Unavailable");
    setText("ribbonHealthNote", healthBand.label);
    setText("ribbonHashrate", formatCompact(data.hashrate));
    setText("ribbonHashrateNote", "vs 30d avg unavailable");
    setStatus("kaspa-network-status-status", "live", formatLastUpdated(kaspaState.updatedAt));
    setStatus("network-intelligence-status", "live", formatLastUpdated(kaspaState.updatedAt));
    setStatus("network-panel-status", "live", "Kaspa Intelligence connected");
  }

  function renderChart(points) {
    latestChartPoints = points;
    const fallback = document.getElementById("chart-fallback");
    const canvas = document.getElementById("kasChart");
    const windowReturn = calcReturn(points);
    setText("chartReturn", formatPercent(windowReturn));

    if (!points.length) {
      if (canvas) canvas.hidden = true;
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent = "KAS price history is unavailable right now.";
      }
      return;
    }

    try {
      if (canvas) canvas.hidden = false;
      if (fallback) fallback.hidden = true;
      window.KasBulletChart.drawKasChart(canvas, points);
      setStatus("primary-chart-status", "live", "Live via CoinGecko");
    } catch (error) {
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent = "Chart temporarily unavailable. Last data fetch remains cached.";
      }
      setStatus("primary-chart-status", "error", "Chart temporarily unavailable");
    }
  }

  function renderComparisonTerminal(results) {
    const liveResults = results.filter((result) => result?.status === "live");
    const cards = liveResults.map((result) => {
      const primaryReturn = result.summary?.primary?.windowReturn;
      const benchmarkReturn = result.summary?.benchmark?.windowReturn;
      const spread = Number.isFinite(primaryReturn) && Number.isFinite(benchmarkReturn)
        ? primaryReturn - benchmarkReturn
        : null;
      const correlation = window.KasBulletCore.analyticsEngine.correlation(
        result.datasets.primary.map((point) => ({ value: point.value })),
        result.datasets.benchmark.map((point) => ({ value: point.value }))
      );
      return `
        <article class="comparison-card">
          <h3>KAS / ${ui.escapeHtml(result.asset.symbol || result.asset.name)}</h3>
          <dl>
            <div><dt>KAS 1Y</dt><dd>${ui.escapeHtml(formatPercent(primaryReturn))}</dd></div>
            <div><dt>${ui.escapeHtml(result.asset.symbol || result.asset.name)} 1Y</dt><dd>${ui.escapeHtml(formatPercent(benchmarkReturn))}</dd></div>
            <div><dt>Spread</dt><dd class="${ui.escapeHtml(changeClass(spread))}">${ui.escapeHtml(formatPercent(spread))}</dd></div>
            <div><dt>Correlation</dt><dd>${Number.isFinite(correlation) ? correlation.toFixed(2) : "Unavailable"}</dd></div>
          </dl>
        </article>
      `;
    });
    document.getElementById("kaspa-comparison-grid").innerHTML = cards.length
      ? cards.join("")
      : ui.loadingSkeleton("Comparison data unavailable.");
    setStatus("kaspa-comparison-status", cards.length ? "live" : "unavailable", cards.length ? "Shared historical cache" : "Comparison data unavailable");
  }

  function renderComparisonTerminalFromState(comparisons) {
    const results = ["bitcoin", "ethereum", "solana"]
      .map((assetId) => comparisons?.[assetId]?.price?.[365])
      .filter(Boolean);
    if (!results.length) {
      setStatus("kaspa-comparison-status", "loading", "Preparing comparisons");
      return;
    }
    renderComparisonTerminal(results);
  }

  function renderBrief(state) {
    const market = state.market.data?.markets?.find((item) => item.id === "kaspa");
    const history = latestChartPoints.map((point) => ({ value: point.price, price: point.price }));
    const trend = window.KasBulletCore.analyticsEngine.trendRegime(history);
    const volatility = window.KasBulletCore.analyticsEngine.annualizedVolatility(history);
    const volatilityLabel = Number.isFinite(volatility)
      ? volatility >= 90 ? "elevated" : volatility <= 45 ? "low" : "normal"
      : "unavailable";
    const change = market?.price_change_percentage_24h;
    const developments = Number.isFinite(change) && change > 2
      ? [`KAS price up ${change.toFixed(2)}% over 24h.`]
      : [];
    const risks = Number.isFinite(change) && change < -2
      ? [`KAS price down ${Math.abs(change).toFixed(2)}% over 24h.`]
      : [];
    document.getElementById("summary-panel").innerHTML = `
      <div class="brief-badges">
        <span>Trend: ${ui.escapeHtml(trend)}</span>
        <span>Volatility: ${ui.escapeHtml(volatilityLabel)}</span>
      </div>
      <div class="brief-grid">
        <article><h3>Strongest Positive Developments</h3><p>${developments.length ? developments.map(ui.escapeHtml).join("<br>") : "No significant developments today."}</p></article>
        <article><h3>Primary Risks</h3><p>${risks.length ? risks.map(ui.escapeHtml).join("<br>") : "No significant risks today."}</p></article>
      </div>
      <p class="metric-note">Objective summary of current conditions, not analysis or advice.</p>
    `;
    setStatus("market-intelligence-summary-status", "live", "Templated brief");
  }

  function applyState(state, change) {
    if (state.system && (!change || change.path === "initial" || change.path === "system")) {
      updateSystemStatus(state.system);
    }

    if (state.market.status === "live" && state.market.data && (!change || change.path === "market")) {
      updateSnapshot(state.market.data, state.market.updatedAt);
    }

    if (state.kaspa.status === "live" && (!change || change.path === "kaspa")) {
      updateKaspaSnapshot(state.kaspa);
      renderBrief(state);
    }

    if (state.kaspa.status === "unavailable" && (!change || change.path === "kaspa")) {
      setStatus("kaspa-network-status-status", "unavailable", "Cached or pending network data");
      setStatus("network-intelligence-status", "unavailable", "Cached or pending network data");
      setStatus("network-panel-status", "unavailable", "Verified provider pending");
    }

    if (state.feed.status === "live" && (!change || change.path === "feed")) {
      setStatus("market-intelligence-feed-status", "live", formatLastUpdated(state.feed.updatedAt));
    }

    if (state.comparisons && (!change || change.path === "initial" || change.path.startsWith("comparisons."))) {
      renderComparisonTerminalFromState(state.comparisons);
    }
  }

  async function loadSnapshot() {
    try {
      await dataService.getDashboardSnapshot();
    } catch (error) {
      setStatus("ribbon-status", "error", "Market data unavailable");
      setStatus("market-snapshot-status", "error", "Snapshot unavailable");
      setStatus("market-intelligence-status", "error", "Market data unavailable");
      setStatus("supply-intelligence-status", "unavailable", "Partial data");
      setStatus("network-intelligence-status", "unavailable", "Partial data");
    }
  }

  async function loadChart() {
    const pressed = document.querySelector(".timeframe[aria-pressed='true']");
    const timeframe = pressed?.dataset.timeframe || "30";
    const days = timeframe === "max" ? "max" : Number(timeframe);
    try {
      setStatus("primary-chart-status", "loading", "Loading chart");
      const points = await historicalDataService.getHistory("kaspa", days);
      renderChart(points.map((point) => ({ ...point, price: point.value })));
      renderBrief(stateStore.getState());
    } catch (error) {
      setStatus("primary-chart-status", "error", "Chart data unavailable");
      renderChart([]);
    }
  }

  async function loadAlerts() {
    const grid = document.getElementById("alerts-grid");
    if (!grid) return;
    try {
      const feed = normalizeAlerts(await dataService.getAlerts());
      const readIds = readAlertIds();
      const unread = feed.filter((item) => !readIds.has(item.id));
      const latest = latestUnreadAlert(feed);
      setText("ribbonAlert", latest ? latest.headline || latest.description : "No active alerts");
      setText("ribbonAlertNote", latest ? latest.severity : "Unread feed clear");
      document.querySelectorAll("[data-field='ribbonAlert']").forEach((element) => {
        element.closest(".metric-card")?.setAttribute("data-clickable", "true");
        element.closest(".metric-card")?.setAttribute("data-jump", "#market-intelligence-feed");
      });
      document.getElementById("feed-category-grid").innerHTML = [
        "All",
        "Market",
        "Network",
        "Development",
        "Ecosystem",
        "Macro",
      ].map((label) => ui.feedCategory({ label, unread: label === "All" ? unread.length > 0 : unread.some((item) => item.category === label) })).join("");
      grid.innerHTML = feed.length
        ? feed.map((item) => ui.alertCard({ ...item, read: readIds.has(item.id) })).join("")
        : ui.loadingSkeleton("No alerts in this category yet.");
      setStatus("market-intelligence-feed-status", feed.length ? "live" : "unavailable", feed.length ? `${unread.length} new` : "Categories ready");
    } catch (error) {
      grid.innerHTML = ui.loadingSkeleton("Alert feed unavailable.");
      setStatus("market-intelligence-feed-status", "error", "Feed unavailable");
    }
  }

  function bindControls() {
    document.querySelectorAll(".timeframe").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".timeframe").forEach((item) => item.setAttribute("aria-pressed", "false"));
        button.setAttribute("aria-pressed", "true");
        loadChart();
      });
    });

    document.addEventListener("click", (event) => {
      const target = event.target.closest("[data-jump]");
      const destination = target ? document.querySelector(target.dataset.jump) : null;
      if (!destination) return;
      destination.scrollIntoView({ behavior: "smooth", block: "start" });
      const alertField = target.querySelector("[data-field='ribbonAlert']");
      if (alertField) {
        const latest = latestUnreadAlert(stateStore.getState().feed.data);
        if (latest) {
          const readIds = readAlertIds();
          readIds.add(latest.id);
          writeAlertIds(readIds);
          loadAlerts();
        }
      }
    });

    window.addEventListener("resize", () => {
      if (latestChartPoints.length) window.KasBulletChart.drawKasChart(document.getElementById("kasChart"), latestChartPoints);
    });
  }

  async function initializeDashboard() {
    renderSectionHeaders();
    renderChartToolbar();
    renderInitialState();
    bindControls();
    stateStore.subscribe(applyState);
    backgroundPrefetchManager.start();
    await Promise.allSettled([loadSnapshot(), loadChart(), loadAlerts(), kaspaNetworkService.getNetworkSnapshot()]);
    refreshManager.register("dashboard-price", loadSnapshot, window.KasBulletCore.refreshIntervals.price);
    refreshManager.register("dashboard-network", () => kaspaNetworkService.getNetworkSnapshot(), window.KasBulletCore.refreshIntervals.network);
    eventBus.publish("dashboard:ready");
  }

  window.KasBulletDashboard = {
    initializeDashboard,
    loadSnapshot,
    loadChart,
    loadAlerts,
  };
})();
