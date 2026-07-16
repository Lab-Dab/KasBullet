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

  const marketSnapshotRows = assetRegistry
    .supportedSnapshotAssets()
    .filter((asset) => asset.id !== "kaspa")
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
      title: "Market Snapshot",
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
      title: "Cycle Intelligence",
      statusId: "cycle-intelligence-status",
      status: "unavailable",
      statusText: "Models not enabled",
    });
    ui.renderSectionHeader("market-intelligence-summary-header", {
      id: "market-intelligence-summary-title",
      title: "Market Intelligence Summary",
      statusId: "market-intelligence-summary-status",
      status: "unavailable",
      statusText: "Factual summary",
    });
    ui.renderSectionHeader("market-intelligence-feed-header", {
      id: "market-intelligence-feed-title",
      title: "Market Intelligence Feed",
      statusId: "market-intelligence-feed-status",
      statusText: "Preparing feed",
    });
  }

  function renderChartToolbar() {
    document.getElementById("chart-toolbar").innerHTML = [
      ui.toolbarButton({ label: "Compare", disabled: true }),
      ui.toolbarButton({ label: "Indicators", disabled: true }),
      ui.toolbarButton({ label: "Drawing Tools", disabled: true }),
      '<div class="timeframe-group" role="group" aria-label="KAS chart timeframe">',
      '<button type="button" class="timeframe" data-timeframe="7" aria-pressed="false">1W</button>',
      '<button type="button" class="timeframe" data-timeframe="30" aria-pressed="true">1M</button>',
      '<button type="button" class="timeframe" data-timeframe="90" aria-pressed="false">3M</button>',
      '<button type="button" class="timeframe" data-timeframe="365" aria-pressed="false">1Y</button>',
      '</div>',
      ui.toolbarButton({ label: "Chart Settings", disabled: true }),
      ui.toolbarButton({ label: "Fullscreen", disabled: true }),
    ].join("");
    document.getElementById("terminal-legend").innerHTML = [
      '<span>Legend Ready</span>',
      '<span>Status Layer Ready</span>',
      '<span>Comparison Mode Ready</span>',
    ].join("");
    document.getElementById("terminal-overlays").innerHTML = [
      '<span>Overlays Ready</span>',
      '<span>Future Indicators Ready</span>',
    ].join("");
  }

  function renderInitialState() {
    document.getElementById("ribbon-grid").innerHTML = [
      ui.metricCard({ label: "Price", value: "Loading", note: "CoinGecko public API", field: "ribbonPrice", noteField: "ribbonPriceNote" }),
      ui.metricCard({ label: "Network Strength", value: "10 BPS", note: "Kaspa network target", field: "networkStrength" }),
      ui.metricCard({ label: "Cycle Score", value: "Unavailable", note: "Future model container", field: "cycleScore" }),
      ui.metricCard({ label: "Market Risk", value: "Unavailable", note: "Future model container", field: "marketRisk" }),
      ui.metricCard({ label: "Bottom Probability", value: "Unavailable", note: "Future model container", field: "bottomProbability" }),
      ui.metricCard({ label: "Peak Probability", value: "Unavailable", note: "Future model container", field: "peakProbability" }),
      ui.metricCard({ label: "Liquidity", value: "Unavailable", note: "Provider not configured", field: "liquidity" }),
      ui.metricCard({ label: "Conviction", value: "Unavailable", note: "Future supply model container", field: "conviction" }),
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
      "Bottom Probability",
      "Peak Probability",
      "Conviction",
      "Liquidity",
      "Network Strength",
    ].map((label) => ui.metricCard({ label, value: "Unavailable", note: "Future intelligence container" })).join("");

    document.getElementById("chart-stats").innerHTML = [
      ui.statCard({ label: "KAS Price", value: "Loading", source: "CoinGecko", field: "chartPrice" }),
      ui.statCard({ label: "Window Return", value: "Loading", source: "Selected timeframe", field: "chartReturn" }),
      ui.statCard({ label: "24h Change", value: "Loading", source: "CoinGecko", field: "chartChange" }),
    ].join("");

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

    document.getElementById("cycle-grid").innerHTML = ui.intelligencePanel({
      title: "Cycle Intelligence",
      headline: "Unavailable",
      chartLabel: "Cycle intelligence interactive chart container",
      insight: "Cycle models are intentionally not implemented in this refinement pass.",
      statusId: "cycle-panel-status",
    });

    document.getElementById("summary-panel").innerHTML =
      '<p>Market intelligence summary containers are ready for objective market conditions. No financial advice, predictions, or opinions are generated in this milestone.</p>';
    document.getElementById("feed-category-grid").innerHTML = [
      "Market",
      "Network",
      "Development",
      "Macro",
      "Liquidity",
      "Wallets",
      "Research",
    ].map((label) => ui.feedCategory({ label })).join("");
    document.getElementById("alerts-grid").innerHTML = ui.loadingSkeleton("Loading latest verified alerts.");
  }

  function renderMarketSnapshot(markets) {
    const marketById = new Map(markets.map((market) => [market.id, market]));
    const rows = marketSnapshotRows.map((asset) => {
      const market = marketById.get(asset.id);
      const change = market?.price_change_percentage_24h;
      return ui.marketRow({
        label: asset.label,
        value: asset.provider === "coingecko" ? formatPrice(market?.current_price) : "Unavailable",
        change: formatPercent(change),
        changeClass: changeClass(change),
      });
    });
    document.getElementById("market-snapshot").innerHTML = rows.join("");
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
    setText("chartPrice", price);
    setText("chartChange", formatPercent(change));
    if (field("chartChange")) field("chartChange").className = `stat-value ${changeClass(change)}`;
    const marketHeadline = document.querySelector("#market-grid .panel-headline .stat-value");
    const supplyHeadline = document.querySelector("#supply-grid .panel-headline .stat-value");
    if (marketHeadline) marketHeadline.textContent = price;
    if (supplyHeadline) supplyHeadline.textContent = formatCompact(kaspa?.circulating_supply, " KAS");

    renderMarketSnapshot(markets);
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
    setText("networkStrength", typeof data.networkStrength === "number" ? `${data.networkStrength}/100` : "Unavailable");
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

    if (canvas) canvas.hidden = false;
    if (fallback) fallback.hidden = true;
    window.KasBulletChart.drawKasChart(canvas, points);
    setStatus("primary-chart-status", "live", "Live via CoinGecko");
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
      const summary = window.KasBulletCore.intelligenceEngine.summarize({
        market: state.market.data,
        kaspa: state.kaspa.data,
      });
      document.getElementById("summary-panel").innerHTML = `<p>${ui.escapeHtml(summary.market)}</p><p>${ui.escapeHtml(summary.network)}</p>`;
      setStatus("market-intelligence-summary-status", "live", "Verified summary");
    }

    if (state.kaspa.status === "unavailable" && (!change || change.path === "kaspa")) {
      setStatus("kaspa-network-status-status", "unavailable", "Cached or pending network data");
      setStatus("network-intelligence-status", "unavailable", "Cached or pending network data");
      setStatus("network-panel-status", "unavailable", "Verified provider pending");
    }

    if (state.feed.status === "live" && (!change || change.path === "feed")) {
      setStatus("market-intelligence-feed-status", "live", formatLastUpdated(state.feed.updatedAt));
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
    const days = Number(pressed?.dataset.timeframe || 30);
    try {
      setStatus("primary-chart-status", "loading", "Loading chart");
      const points = await historicalDataService.getHistory("kaspa", days);
      renderChart(points.map((point) => ({ ...point, price: point.value })));
    } catch (error) {
      setStatus("primary-chart-status", "error", "Chart data unavailable");
      renderChart([]);
    }
  }

  async function loadAlerts() {
    const grid = document.getElementById("alerts-grid");
    if (!grid) return;
    try {
      await dataService.getAlerts();
      grid.innerHTML = ui.loadingSkeleton("Verified market intelligence feed pending.");
      setStatus("market-intelligence-feed-status", "unavailable", "Categories ready");
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
