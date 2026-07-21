(function () {
  "use strict";

  const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
  const KASPA_BASE = "https://api.kaspa.org";
  const STOOQ_BASE = "https://stooq.com/q/d/l/";

  const refreshIntervals = {
    price: 5 * 1000,
    network: 30 * 1000,
    hashrate: 60 * 1000,
    marketCap: 60 * 1000,
    blocks: 30 * 1000,
    macro: 24 * 60 * 60 * 1000,
    dormantSupply: 24 * 60 * 60 * 1000,
  };

  const assets = [
    {
      id: "kaspa",
      name: "Kaspa",
      symbol: "KAS",
      category: "crypto",
      provider: "coingecko",
      fallbackProvider: "kaspaApi",
      providerAssetId: "kaspa",
      launchDate: "2022-05-07",
      brandColor: "#49EACB",
      comparisonEnabled: true,
      historicalEnabled: true,
      supportedMetrics: ["price", "marketCap", "supply", "transactions", "addresses", "hashrate", "difficulty"],
    },
    {
      id: "bitcoin",
      name: "Bitcoin",
      symbol: "BTC",
      category: "crypto",
      provider: "coingecko",
      fallbackProvider: null,
      providerAssetId: "bitcoin",
      launchDate: "2009-01-03",
      brandColor: "#F7931A",
      comparisonEnabled: true,
      historicalEnabled: true,
      supportedMetrics: ["price", "marketCap"],
    },
    {
      id: "ethereum",
      name: "Ethereum",
      symbol: "ETH",
      category: "crypto",
      provider: "coingecko",
      fallbackProvider: null,
      providerAssetId: "ethereum",
      launchDate: "2015-07-30",
      brandColor: "#627EEA",
      comparisonEnabled: true,
      historicalEnabled: true,
      supportedMetrics: ["price", "marketCap"],
    },
    {
      id: "solana",
      name: "Solana",
      symbol: "SOL",
      category: "crypto",
      provider: "coingecko",
      fallbackProvider: null,
      providerAssetId: "solana",
      launchDate: "2020-03-16",
      brandColor: "#14F195",
      comparisonEnabled: true,
      historicalEnabled: true,
      supportedMetrics: ["price", "marketCap"],
    },
    {
      id: "binancecoin",
      name: "BNB",
      symbol: "BNB",
      category: "crypto",
      provider: "coingecko",
      fallbackProvider: null,
      providerAssetId: "binancecoin",
      launchDate: "2017-07-25",
      brandColor: "#F3BA2F",
      comparisonEnabled: true,
      historicalEnabled: true,
      supportedMetrics: ["price", "marketCap"],
    },
    {
      id: "ripple",
      name: "XRP",
      symbol: "XRP",
      category: "crypto",
      provider: "coingecko",
      fallbackProvider: null,
      providerAssetId: "ripple",
      launchDate: "2013-01-01",
      brandColor: "#9AA8B5",
      comparisonEnabled: true,
      historicalEnabled: true,
      supportedMetrics: ["price", "marketCap"],
    },
    {
      id: "gold",
      name: "Gold",
      symbol: "XAU",
      category: "macro",
      provider: "stooq",
      fallbackProvider: null,
      providerAssetId: "xauusd",
      launchDate: null,
      brandColor: "#F2C94C",
      comparisonEnabled: true,
      historicalEnabled: true,
      supportedMetrics: ["price"],
    },
    {
      id: "silver",
      name: "Silver",
      symbol: "XAG",
      category: "macro",
      provider: "stooq",
      fallbackProvider: null,
      providerAssetId: "xagusd",
      launchDate: null,
      brandColor: "#C6D0D8",
      comparisonEnabled: true,
      historicalEnabled: true,
      supportedMetrics: ["price"],
    },
    {
      id: "oil",
      name: "Oil",
      symbol: "WTI",
      category: "macro",
      provider: "stooq",
      fallbackProvider: null,
      providerAssetId: "cl.f",
      launchDate: null,
      brandColor: "#8F9A7A",
      comparisonEnabled: true,
      historicalEnabled: true,
      supportedMetrics: ["price"],
    },
    {
      id: "nasdaq",
      name: "Nasdaq",
      symbol: "NDX",
      category: "macro",
      provider: "stooq",
      fallbackProvider: null,
      providerAssetId: "^ndq",
      launchDate: "1971-02-08",
      brandColor: "#4AA8FF",
      comparisonEnabled: true,
      historicalEnabled: true,
      supportedMetrics: ["price"],
    },
    {
      id: "sp500",
      name: "S&P 500",
      symbol: "SPX",
      category: "macro",
      provider: "stooq",
      fallbackProvider: null,
      providerAssetId: "^spx",
      launchDate: "1957-03-04",
      brandColor: "#7EBC89",
      comparisonEnabled: true,
      historicalEnabled: true,
      supportedMetrics: ["price"],
    },
    {
      id: "dxy",
      name: "DXY",
      symbol: "DXY",
      category: "macro",
      provider: "stooq",
      fallbackProvider: null,
      providerAssetId: "dx.f",
      launchDate: "1973-03-01",
      brandColor: "#9AA8B5",
      comparisonEnabled: true,
      historicalEnabled: true,
      supportedMetrics: ["price"],
    },
  ];

  function parseCsv(text) {
    return text
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((line) => {
        const [date, open, high, low, close] = line.split(",");
        return {
          timestamp: date,
          value: Number(close || low || high || open),
        };
      })
      .filter((point) => Number.isFinite(point.value));
  }

  async function getJson(url, label) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
    return response.json();
  }

  const providers = [
    {
      id: "kaspaApi",
      priority: 1,
      getNetwork: () => getJson(`${KASPA_BASE}/info/network`, "Kaspa API network"),
      getBlockdag: () => getJson(`${KASPA_BASE}/info/blockdag`, "Kaspa API blockdag"),
      getCoinSupply: () => getJson(`${KASPA_BASE}/info/coinsupply`, "Kaspa API coin supply"),
      getHashrate: () => getJson(`${KASPA_BASE}/info/hashrate`, "Kaspa API hashrate"),
    },
    { id: "kaspaStream", priority: 2 },
    { id: "kaspaExplorer", priority: 3 },
    { id: "kaspaNodeApi", priority: 4 },
    {
      id: "coingecko",
      priority: 1,
      async getMarkets({ ids }) {
        const params = new URLSearchParams({
          vs_currency: "usd",
          ids: ids.join(","),
          order: "market_cap_desc",
          per_page: String(ids.length),
          page: "1",
          sparkline: "true",
          price_change_percentage: "24h",
        });
        return getJson(`${COINGECKO_BASE}/coins/markets?${params}`, "CoinGecko markets");
      },
      getGlobal: () => getJson(`${COINGECKO_BASE}/global`, "CoinGecko global"),
      getFearGreed: () => getJson("https://api.alternative.me/fng/?limit=1", "Alternative.me Fear and Greed"),
      getAltcoinSeason: async () => ({
        status: "unavailable",
        source: "Provider not configured",
        value: null,
      }),
      async getMarketChart({ asset, days }) {
        const params = new URLSearchParams({ vs_currency: "usd", days: String(days), interval: "daily" });
        const data = await getJson(`${COINGECKO_BASE}/coins/${asset.providerAssetId}/market_chart?${params}`, "CoinGecko history");
        return (data.prices || []).map(([timestamp, value]) => ({ timestamp, value }));
      },
    },
    {
      id: "stooq",
      priority: 1,
      async getDailySeries({ asset }) {
        const params = new URLSearchParams({ s: asset.providerAssetId, i: "d" });
        const response = await fetch(`${STOOQ_BASE}?${params}`);
        if (!response.ok) throw new Error(`Macro history HTTP ${response.status}`);
        return parseCsv(await response.text());
      },
    },
    {
      id: "localFeed",
      priority: 1,
      getAlerts: () => getJson("data/news.json", "Local feed"),
    },
  ];

  const coreEngine = new window.KasBulletServices.CoreEngine({ assets, providers, refreshIntervals }).initialize();
  window.KasBulletCore = coreEngine.toGlobalApi();
})();
