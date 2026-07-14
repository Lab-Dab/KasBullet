(function () {
  "use strict";

  const { dataService, refreshManager, eventBus } = window.KasBulletCore;
  const ui = window.KasBulletComponents;
  let latestChartPoints = [];

  const marketSnapshotRows = [
    { label: "BTC", id: "bitcoin" },
    { label: "ETH", id: "ethereum" },
    { label: "SOL" },
    { label: "Gold" },
    { label: "Silver" },
    { label: "Oil" },
    { label: "DXY" },
    { label: "Global M2" },
    { label: "Watchlist" },
  ];

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
      ui.marketRow({ label: asset.label, value: asset.id ? "Loading" : "Unavailable", change: "--" })
    ).join("");

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
        value: asset.id ? formatPrice(market?.current_price) : "Unavailable",
        change: formatPercent(change),
        changeClass: changeClass(change),
      });
    });
    document.getElementById("market-snapshot").innerHTML = rows.join("");
  }

  function updateSnapshot({ markets, global }) {
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
    setStatus("ribbon-status", "live", "Live market data");
    setStatus("market-snapshot-status", "live", "Live BTC/ETH data");
    setStatus("market-intelligence-status", "live", "Live via CoinGecko");
    setStatus("supply-intelligence-status", "live", "Partial live data");
    setStatus("network-intelligence-status", "live", "Foundation live");
    setStatus("market-panel-status", "live", typeof kaspaDominance === "number" ? `${kaspaDominance.toFixed(4)}% dominance` : "Live KAS price");
    setStatus("supply-panel-status", "live", "Circulating supply live");
    setStatus("network-panel-status", "unavailable", "Verified provider pending");
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

  async function loadSnapshot() {
    try {
      updateSnapshot(await dataService.getDashboardSnapshot());
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
      renderChart(await dataService.getKaspaHistory(days));
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
    await Promise.allSettled([loadSnapshot(), loadChart(), loadAlerts()]);
    refreshManager.register("dashboard-snapshot", loadSnapshot, 60 * 1000);
    eventBus.publish("dashboard:ready");
  }

  window.KasBulletDashboard = {
    initializeDashboard,
    loadSnapshot,
    loadChart,
    loadAlerts,
  };
})();
