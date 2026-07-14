(function () {
  "use strict";

  const { dataService, refreshManager, eventBus } = window.KasBulletCore;
  const ui = window.KasBulletComponents;
  let latestChartPoints = [];

  const cryptoAssets = [
    { label: "KAS", id: "kaspa" },
    { label: "BTC", id: "bitcoin" },
    { label: "ETH", id: "ethereum" },
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
    ui.renderSectionHeader("global-markets-header", {
      id: "global-markets-title",
      title: "Global Markets",
      statusId: "global-markets-status",
      statusText: "Preparing markets",
    });
    ui.renderSectionHeader("primary-chart-header", {
      id: "primary-chart-title",
      title: "Primary Interactive KAS Chart",
      statusId: "primary-chart-status",
      statusText: "Preparing chart",
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
    ui.renderSectionHeader("ai-executive-summary-header", {
      id: "ai-executive-summary-title",
      title: "AI Executive Summary",
      statusId: "ai-executive-summary-status",
      status: "unavailable",
      statusText: "Engine not enabled",
    });
    ui.renderSectionHeader("latest-alerts-header", {
      id: "latest-alerts-title",
      title: "Latest Alerts",
      statusId: "latest-alerts-status",
      statusText: "Preparing alerts",
    });
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

    document.getElementById("global-markets").innerHTML = cryptoAssets.map((asset) =>
      ui.marketRow({ label: asset.label, value: "Loading", change: "--" })
    ).concat(["Gold", "Silver", "Oil", "Nasdaq", "S&P 500"].map((label) =>
      ui.marketRow({ label, value: "Unavailable", change: "--" })
    )).join("");

    document.getElementById("chart-stats").innerHTML = [
      ui.statCard({ label: "KAS Price", value: "Loading", source: "CoinGecko", field: "chartPrice" }),
      ui.statCard({ label: "Window Return", value: "Loading", source: "Selected timeframe", field: "chartReturn" }),
      ui.statCard({ label: "24h Change", value: "Loading", source: "CoinGecko", field: "chartChange" }),
    ].join("");

    document.getElementById("market-grid").innerHTML = [
      ui.statCard({ label: "Price", value: "Loading", source: "CoinGecko", field: "marketPrice" }),
      ui.statCard({ label: "Market Cap", value: "Loading", source: "CoinGecko", field: "marketCap" }),
      ui.statCard({ label: "Volume", value: "Loading", source: "CoinGecko", field: "marketVolume" }),
      ui.statCard({ label: "Dominance", value: "Loading", source: "Kaspa market cap / crypto market cap", field: "kaspaDominance" }),
    ].join("");

    document.getElementById("supply-grid").innerHTML = [
      ui.statCard({ label: "Circulating Supply", value: "Loading", source: "CoinGecko", field: "circulatingSupply" }),
      ui.statCard({ label: "Exchange Supply", value: "Unavailable", source: "Verified aggregate feed required" }),
      ui.statCard({ label: "Dormant Supply", value: "Unavailable", source: "Future on-chain model container" }),
      ui.statCard({ label: "Velocity", value: "Unavailable", source: "Future on-chain model container" }),
    ].join("");

    document.getElementById("network-grid").innerHTML = [
      ui.statCard({ label: "Block Rate", value: "10 BPS", source: "Kaspa Crescendo network target" }),
      ui.statCard({ label: "Network Explorer", value: "kas.fyi", source: "Live chain detail" }),
      ui.statCard({ label: "Hashrate Security", value: "Unavailable", source: "Verified provider required" }),
      ui.statCard({ label: "Node Count", value: "Unavailable", source: "Verified provider required" }),
    ].join("");

    document.getElementById("cycle-grid").innerHTML = [
      ui.statCard({ label: "KasBullet Cycle Score", value: "Unavailable", source: "Cycle model not implemented" }),
      ui.statCard({ label: "Peak Probability", value: "Unavailable", source: "Cycle model not implemented" }),
      ui.statCard({ label: "Bottom Probability", value: "Unavailable", source: "Cycle model not implemented" }),
      ui.statCard({ label: "Valuation Bands", value: "Unavailable", source: "Cycle model not implemented" }),
    ].join("");

    document.getElementById("summary-panel").innerHTML =
      '<p>AI executive analysis is intentionally disabled until the verified intelligence engine is implemented.</p>';
    document.getElementById("alerts-grid").innerHTML = ui.loadingSkeleton("Loading latest verified alerts.");
  }

  function renderGlobalMarkets(markets) {
    const marketById = new Map(markets.map((market) => [market.id, market]));
    const cryptoRows = cryptoAssets.map((asset) => {
      const market = marketById.get(asset.id);
      const change = market?.price_change_percentage_24h;
      return ui.marketRow({
        label: asset.label,
        value: formatPrice(market?.current_price),
        change: formatPercent(change),
        changeClass: changeClass(change),
      });
    });
    const unavailableRows = ["Gold", "Silver", "Oil", "Nasdaq", "S&P 500"].map((label) =>
      ui.marketRow({ label, value: "Unavailable", change: "--" })
    );
    document.getElementById("global-markets").innerHTML = cryptoRows.concat(unavailableRows).join("");
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
    setText("marketPrice", price);
    setText("marketCap", formatCompact(kaspa?.market_cap));
    setText("marketVolume", formatCompact(kaspa?.total_volume));
    setText("kaspaDominance", typeof kaspaDominance === "number" ? `${kaspaDominance.toFixed(4)}%` : "Unavailable");
    setText("circulatingSupply", formatCompact(kaspa?.circulating_supply, " KAS"));

    renderGlobalMarkets(markets);
    setStatus("ribbon-status", "live", "Live market data");
    setStatus("global-markets-status", "live", "Live via CoinGecko");
    setStatus("market-intelligence-status", "live", "Live via CoinGecko");
    setStatus("supply-intelligence-status", "live", "Partial live data");
    setStatus("network-intelligence-status", "live", "Foundation live");
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
      setStatus("global-markets-status", "error", "Markets unavailable");
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
      const alerts = await dataService.getAlerts();
      if (!Array.isArray(alerts) || alerts.length === 0) {
        grid.innerHTML = ui.loadingSkeleton("No verified alerts are available.");
        setStatus("latest-alerts-status", "unavailable", "No alerts");
        return;
      }
      grid.innerHTML = alerts.slice(0, 3).map(ui.alertCard).join("");
      setStatus("latest-alerts-status", "live", "Local verified feed");
    } catch (error) {
      grid.innerHTML = ui.loadingSkeleton("Alert feed unavailable.");
      setStatus("latest-alerts-status", "error", "Feed unavailable");
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
