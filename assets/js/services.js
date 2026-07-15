(function () {
  "use strict";

  const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
  const KASPA_BASE = "https://api.kaspa.org";
  const STOOQ_BASE = "https://stooq.com/q/d/l/";
  const DEFAULT_TTL = 60 * 1000;

  const refreshIntervals = {
    price: 5 * 1000,
    network: 30 * 1000,
    hashrate: 60 * 1000,
    marketCap: 60 * 1000,
    blocks: 30 * 1000,
    macro: 24 * 60 * 60 * 1000,
    dormantSupply: 24 * 60 * 60 * 1000,
  };

  const assets = {
    kaspa: { key: "kaspa", name: "Kaspa", symbol: "KAS", type: "crypto", providerId: "coingecko", providerAssetId: "kaspa", launchDate: "2022-05-07" },
    bitcoin: { key: "bitcoin", name: "Bitcoin", symbol: "BTC", type: "crypto", providerId: "coingecko", providerAssetId: "bitcoin", launchDate: "2009-01-03" },
    ethereum: { key: "ethereum", name: "Ethereum", symbol: "ETH", type: "crypto", providerId: "coingecko", providerAssetId: "ethereum", launchDate: "2015-07-30" },
    solana: { key: "solana", name: "Solana", symbol: "SOL", type: "crypto", providerId: "coingecko", providerAssetId: "solana", launchDate: "2020-03-16" },
    ripple: { key: "ripple", name: "XRP", symbol: "XRP", type: "crypto", providerId: "coingecko", providerAssetId: "ripple", launchDate: "2013-08-04" },
    gold: { key: "gold", name: "Gold", symbol: "XAU", type: "macro", providerId: "stooq", providerAssetId: "xauusd" },
    silver: { key: "silver", name: "Silver", symbol: "XAG", type: "macro", providerId: "stooq", providerAssetId: "xagusd" },
    oil: { key: "oil", name: "Oil", symbol: "WTI", type: "macro", providerId: "stooq", providerAssetId: "cl.f" },
    nasdaq: { key: "nasdaq", name: "Nasdaq", symbol: "NDX", type: "macro", providerId: "stooq", providerAssetId: "^ndq" },
    sp500: { key: "sp500", name: "S&P 500", symbol: "SPX", type: "macro", providerId: "stooq", providerAssetId: "^spx" },
    dxy: { key: "dxy", name: "DXY", symbol: "DXY", type: "macro", providerId: "stooq", providerAssetId: "dx.f" },
  };

  class EventBus {
    constructor() {
      this.listeners = new Map();
    }

    subscribe(eventName, handler) {
      const handlers = this.listeners.get(eventName) || new Set();
      handlers.add(handler);
      this.listeners.set(eventName, handlers);
      return () => handlers.delete(handler);
    }

    publish(eventName, payload) {
      const handlers = this.listeners.get(eventName);
      if (!handlers) return;
      handlers.forEach((handler) => handler(payload));
    }
  }

  class CacheManager {
    constructor(defaultTtl = DEFAULT_TTL, storagePrefix = "kasbullet:cache:") {
      this.defaultTtl = defaultTtl;
      this.storagePrefix = storagePrefix;
      this.entries = new Map();
      this.inFlight = new Map();
    }

    get(key, { allowStale = false } = {}) {
      const memoryEntry = this.entries.get(key) || this.readPersisted(key);
      if (!memoryEntry) return null;
      const isFresh = Date.now() <= memoryEntry.expiresAt;
      if (!isFresh && !allowStale) {
        this.entries.delete(key);
        return null;
      }
      this.entries.set(key, memoryEntry);
      return memoryEntry.value;
    }

    getMeta(key) {
      const entry = this.entries.get(key) || this.readPersisted(key);
      return entry ? { updatedAt: entry.updatedAt, expiresAt: entry.expiresAt } : null;
    }

    set(key, value, ttl = this.defaultTtl) {
      const entry = {
        value,
        updatedAt: new Date().toISOString(),
        expiresAt: Date.now() + ttl,
      };
      this.entries.set(key, entry);
      this.writePersisted(key, entry);
      return value;
    }

    async remember(key, ttl, loader) {
      const cached = this.get(key);
      if (cached) return cached;
      if (this.inFlight.has(key)) return this.inFlight.get(key);
      const request = loader()
        .then((value) => this.set(key, value, ttl))
        .finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, request);
      return request;
    }

    readPersisted(key) {
      try {
        const raw = window.localStorage?.getItem(`${this.storagePrefix}${key}`);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }

    writePersisted(key, entry) {
      try {
        window.localStorage?.setItem(`${this.storagePrefix}${key}`, JSON.stringify(entry));
      } catch {
        return null;
      }
    }
  }

  class StateStore {
    constructor(eventBus) {
      this.eventBus = eventBus;
      this.state = {
        market: { status: "loading", data: null, error: null, updatedAt: null, providerStatus: {} },
        history: {},
        comparisons: {},
        network: { status: "loading", data: null, error: null, updatedAt: null, providerStatus: {} },
        feed: { status: "loading", data: [], error: null, updatedAt: null },
      };
      this.subscribers = new Set();
    }

    getState() {
      return this.state;
    }

    set(path, value) {
      const segments = path.split(".");
      let cursor = this.state;
      segments.slice(0, -1).forEach((segment) => {
        cursor[segment] = cursor[segment] || {};
        cursor = cursor[segment];
      });
      cursor[segments[segments.length - 1]] = value;
      this.notify(path, value);
    }

    merge(path, value) {
      const current = this.get(path) || {};
      this.set(path, { ...current, ...value });
    }

    get(path) {
      return path.split(".").reduce((cursor, segment) => cursor?.[segment], this.state);
    }

    subscribe(handler) {
      this.subscribers.add(handler);
      handler(this.state, { path: "initial", value: this.state });
      return () => this.subscribers.delete(handler);
    }

    notify(path, value) {
      const payload = { path, value };
      this.subscribers.forEach((handler) => handler(this.state, payload));
      this.eventBus.publish("state:changed", payload);
    }
  }

  class AssetRegistry {
    constructor(initialAssets) {
      this.assets = new Map(Object.entries(initialAssets));
    }

    register(asset) {
      this.assets.set(asset.key, asset);
      return asset;
    }

    get(key) {
      return this.assets.get(key);
    }

    list() {
      return Array.from(this.assets.values());
    }

    supportedComparisons() {
      return this.list().filter((asset) => asset.key !== "kaspa");
    }
  }

  class ProviderManager {
    constructor(cacheManager, eventBus) {
      this.cache = cacheManager;
      this.eventBus = eventBus;
      this.providers = new Map();
      this.health = new Map();
    }

    register(provider) {
      this.providers.set(provider.id, provider);
      this.health.set(provider.id, {
        id: provider.id,
        status: "unknown",
        priority: provider.priority || 100,
        lastSuccessfulUpdate: null,
        error: null,
      });
      return provider;
    }

    async request(providerId, operation, args, cacheKey, ttl) {
      const provider = this.providers.get(providerId);
      if (!provider || typeof provider[operation] !== "function") {
        throw new Error(`Provider operation unavailable: ${providerId}.${operation}`);
      }

      return this.cache.remember(cacheKey, ttl, async () => {
        try {
          const value = await provider[operation](args);
          this.markHealthy(providerId);
          return value;
        } catch (error) {
          this.markUnhealthy(providerId, error);
          const fallback = this.cache.get(cacheKey, { allowStale: true });
          if (fallback) return fallback;
          throw error;
        }
      });
    }

    markHealthy(providerId) {
      const current = this.health.get(providerId) || {};
      this.health.set(providerId, {
        ...current,
        status: "live",
        lastSuccessfulUpdate: new Date().toISOString(),
        error: null,
      });
      this.eventBus.publish("provider:health", this.getStatus());
    }

    markUnhealthy(providerId, error) {
      const current = this.health.get(providerId) || {};
      this.health.set(providerId, {
        ...current,
        status: "error",
        error: error.message,
      });
      this.eventBus.publish("provider:health", this.getStatus());
    }

    getStatus() {
      return Object.fromEntries(this.health);
    }
  }

  class TimeSeriesEngine {
    normalize(points, valueKey = "value") {
      if (!Array.isArray(points)) return [];
      return points
        .map((point) => ({
          timestamp: new Date(point.timestamp || point.date).getTime(),
          date: new Date(point.timestamp || point.date),
          value: Number(point[valueKey] ?? point.value ?? point.price),
        }))
        .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.value))
        .sort((a, b) => a.timestamp - b.timestamp);
    }

    align(seriesMap) {
      const entries = Object.entries(seriesMap);
      if (!entries.length) return {};
      const sharedTimestamps = entries
        .map(([, series]) => new Set(series.map((point) => point.timestamp)))
        .reduce((shared, timestamps) => new Set([...shared].filter((timestamp) => timestamps.has(timestamp))));

      return Object.fromEntries(entries.map(([key, series]) => [
        key,
        series.filter((point) => sharedTimestamps.has(point.timestamp)),
      ]));
    }

    normalizePerformance(series) {
      if (!series.length) return [];
      const first = series[0].value || 1;
      return series.map((point) => ({
        ...point,
        performance: ((point.value - first) / first) * 100,
      }));
    }
  }

  class HistoricalDataStore {
    constructor(cacheManager) {
      this.cache = cacheManager;
    }

    get(assetKey, days) {
      return this.cache.get(`historical:${assetKey}:${days}`, { allowStale: true });
    }

    set(assetKey, days, points, ttl = 24 * 60 * 60 * 1000) {
      return this.cache.set(`historical:${assetKey}:${days}`, points, ttl);
    }
  }

  class MarketDataService {
    constructor(providerManager, assetRegistry, stateStore) {
      this.providers = providerManager;
      this.assets = assetRegistry;
      this.state = stateStore;
    }

    async getCurrentMarkets(assetKeys = ["kaspa", "bitcoin", "ethereum", "solana", "ripple"]) {
      const ids = assetKeys
        .map((key) => this.assets.get(key))
        .filter((asset) => asset?.providerId === "coingecko")
        .map((asset) => asset.providerAssetId);
      const markets = await this.providers.request(
        "coingecko",
        "getMarkets",
        { ids },
        `markets:${ids.sort().join(",")}`,
        refreshIntervals.price
      );
      const global = await this.providers.request("coingecko", "getGlobal", {}, "global-market", refreshIntervals.marketCap);
      this.state.merge("market", {
        status: "live",
        data: { markets, global },
        updatedAt: new Date().toISOString(),
        providerStatus: this.providers.getStatus(),
        error: null,
      });
      return { markets, global };
    }
  }

  class KaspaNetworkService {
    constructor(providerManager, stateStore) {
      this.providers = providerManager;
      this.state = stateStore;
    }

    async getNetworkSnapshot() {
      try {
        const data = await this.providers.request("kaspaApi", "getNetwork", {}, "kaspa:network", refreshIntervals.network);
        this.state.merge("network", {
          status: "live",
          data,
          updatedAt: new Date().toISOString(),
          providerStatus: this.providers.getStatus(),
          error: null,
        });
        return data;
      } catch (error) {
        this.state.merge("network", {
          status: "unavailable",
          error: error.message,
          providerStatus: this.providers.getStatus(),
        });
        return null;
      }
    }
  }

  class HistoricalDataService {
    constructor(providerManager, assetRegistry, historicalStore, timeSeriesEngine, stateStore) {
      this.providers = providerManager;
      this.assets = assetRegistry;
      this.store = historicalStore;
      this.series = timeSeriesEngine;
      this.state = stateStore;
    }

    async getHistory(assetKey, days = 30) {
      const cached = this.store.get(assetKey, days);
      if (cached?.length) return this.series.normalize(cached);

      const asset = this.assets.get(assetKey);
      if (!asset) throw new Error(`Unknown asset: ${assetKey}`);

      const operation = asset.providerId === "coingecko" ? "getMarketChart" : "getDailySeries";
      const rawPoints = await this.providers.request(
        asset.providerId,
        operation,
        { asset, days },
        `historical:${assetKey}:${days}:raw`,
        asset.type === "macro" ? refreshIntervals.macro : 5 * 60 * 1000
      );
      const points = this.series.normalize(rawPoints);
      this.store.set(assetKey, days, points);
      this.state.set(`history.${assetKey}.${days}`, { status: "live", points, updatedAt: new Date().toISOString() });
      return points;
    }
  }

  class AnalyticsEngine {
    windowReturn(points) {
      if (!points?.length) return null;
      const first = points[0].value ?? points[0].price;
      const last = points[points.length - 1].value ?? points[points.length - 1].price;
      if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
      return ((last - first) / first) * 100;
    }

    summary(points) {
      return {
        windowReturn: this.windowReturn(points),
        first: points?.[0] || null,
        last: points?.[points.length - 1] || null,
        points: points?.length || 0,
      };
    }
  }

  class CompareService {
    constructor(assetRegistry, historicalDataService, timeSeriesEngine, analyticsEngine, stateStore) {
      this.assets = assetRegistry;
      this.history = historicalDataService;
      this.series = timeSeriesEngine;
      this.analytics = analyticsEngine;
      this.state = stateStore;
    }

    async compareKaspaTo(benchmarkKey, days = 365, mode = "shared") {
      const target = this.assets.get(benchmarkKey);
      if (!target) throw new Error(`Unsupported comparison asset: ${benchmarkKey}`);

      try {
        const [kaspa, benchmark] = await Promise.all([
          this.history.getHistory("kaspa", days),
          this.history.getHistory(benchmarkKey, days),
        ]);
        const aligned = mode === "shared" ? this.series.align({ kaspa, benchmark }) : { kaspa, benchmark };
        const result = {
          status: aligned.kaspa?.length && aligned.benchmark?.length ? "live" : "unavailable",
          asset: target,
          mode,
          datasets: {
            kaspa: this.series.normalizePerformance(aligned.kaspa || []),
            benchmark: this.series.normalizePerformance(aligned.benchmark || []),
          },
          summary: {
            kaspa: this.analytics.summary(aligned.kaspa || []),
            benchmark: this.analytics.summary(aligned.benchmark || []),
          },
          updatedAt: new Date().toISOString(),
        };
        this.state.set(`comparisons.${benchmarkKey}.${days}`, result);
        return result;
      } catch (error) {
        const result = {
          status: "unavailable",
          asset: target,
          mode,
          datasets: { kaspa: [], benchmark: [] },
          summary: null,
          error: error.message,
          updatedAt: new Date().toISOString(),
        };
        this.state.set(`comparisons.${benchmarkKey}.${days}`, result);
        return result;
      }
    }
  }

  class RefreshScheduler {
    constructor(eventBus) {
      this.eventBus = eventBus;
      this.tasks = new Map();
    }

    register(name, task, intervalMs) {
      this.unregister(name);
      const run = async () => {
        try {
          const result = await task();
          this.eventBus.publish(`refresh:${name}`, result);
        } catch (error) {
          this.eventBus.publish(`refresh-error:${name}`, error);
        }
      };
      this.tasks.set(name, window.setInterval(run, intervalMs));
      return run();
    }

    unregister(name) {
      const task = this.tasks.get(name);
      if (task) window.clearInterval(task);
      this.tasks.delete(name);
    }
  }

  class BackgroundPrefetchManager {
    constructor(eventBus) {
      this.eventBus = eventBus;
      this.tasks = [];
      this.hasStarted = false;
    }

    register(name, task) {
      this.tasks.push({ name, task });
    }

    start() {
      if (this.hasStarted) return;
      this.hasStarted = true;
      this.tasks.forEach(async ({ name, task }) => {
        try {
          const result = await task();
          this.eventBus.publish(`prefetch:${name}`, result);
        } catch (error) {
          this.eventBus.publish(`prefetch-error:${name}`, error);
        }
      });
    }
  }

  class WebSocketManager {
    constructor(eventBus) {
      this.eventBus = eventBus;
      this.connections = new Map();
    }

    connect(name, url) {
      if (!url || typeof WebSocket === "undefined") return null;
      this.disconnect(name);
      const socket = new WebSocket(url);
      socket.addEventListener("message", (event) => this.eventBus.publish(`socket:${name}`, event.data));
      socket.addEventListener("error", (event) => this.eventBus.publish(`socket-error:${name}`, event));
      this.connections.set(name, socket);
      return socket;
    }

    disconnect(name) {
      const socket = this.connections.get(name);
      if (socket) socket.close();
      this.connections.delete(name);
    }
  }

  class HealthMonitor {
    constructor(providerManager, stateStore) {
      this.providers = providerManager;
      this.state = stateStore;
    }

    snapshot() {
      return {
        providers: this.providers.getStatus(),
        state: {
          market: this.state.get("market.status"),
          network: this.state.get("network.status"),
          feed: this.state.get("feed.status"),
        },
        checkedAt: new Date().toISOString(),
      };
    }
  }

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

  const providers = {
    coingecko: {
      id: "coingecko",
      priority: 1,
      async getMarkets({ ids }) {
        const params = new URLSearchParams({
          vs_currency: "usd",
          ids: ids.join(","),
          order: "market_cap_desc",
          per_page: String(ids.length),
          page: "1",
          sparkline: "false",
          price_change_percentage: "24h",
        });
        const response = await fetch(`${COINGECKO_BASE}/coins/markets?${params}`);
        if (!response.ok) throw new Error(`CoinGecko markets HTTP ${response.status}`);
        return response.json();
      },
      async getGlobal() {
        const response = await fetch(`${COINGECKO_BASE}/global`);
        if (!response.ok) throw new Error(`CoinGecko global HTTP ${response.status}`);
        return response.json();
      },
      async getMarketChart({ asset, days }) {
        const params = new URLSearchParams({ vs_currency: "usd", days: String(days), interval: "daily" });
        const response = await fetch(`${COINGECKO_BASE}/coins/${asset.providerAssetId}/market_chart?${params}`);
        if (!response.ok) throw new Error(`CoinGecko history HTTP ${response.status}`);
        const data = await response.json();
        return (data.prices || []).map(([timestamp, value]) => ({ timestamp, value }));
      },
    },
    stooq: {
      id: "stooq",
      priority: 2,
      async getDailySeries({ asset }) {
        const params = new URLSearchParams({ s: asset.providerAssetId, i: "d" });
        const response = await fetch(`${STOOQ_BASE}?${params}`);
        if (!response.ok) throw new Error(`Stooq history HTTP ${response.status}`);
        return parseCsv(await response.text());
      },
    },
    kaspaApi: {
      id: "kaspaApi",
      priority: 1,
      async getNetwork() {
        const response = await fetch(`${KASPA_BASE}/info/network`);
        if (!response.ok) throw new Error(`Kaspa API HTTP ${response.status}`);
        return response.json();
      },
    },
    local: {
      id: "local",
      priority: 1,
      async getAlerts() {
        const response = await fetch("data/news.json");
        if (!response.ok) throw new Error(`Local feed HTTP ${response.status}`);
        return response.json();
      },
    },
  };

  const eventBus = new EventBus();
  const cacheManager = new CacheManager();
  const stateStore = new StateStore(eventBus);
  const assetRegistry = new AssetRegistry(assets);
  const providerManager = new ProviderManager(cacheManager, eventBus);
  Object.values(providers).forEach((provider) => providerManager.register(provider));
  const timeSeriesEngine = new TimeSeriesEngine();
  const historicalDataStore = new HistoricalDataStore(cacheManager);
  const marketDataService = new MarketDataService(providerManager, assetRegistry, stateStore);
  const kaspaNetworkService = new KaspaNetworkService(providerManager, stateStore);
  const historicalDataService = new HistoricalDataService(providerManager, assetRegistry, historicalDataStore, timeSeriesEngine, stateStore);
  const analyticsEngine = new AnalyticsEngine();
  const compareService = new CompareService(assetRegistry, historicalDataService, timeSeriesEngine, analyticsEngine, stateStore);
  const refreshScheduler = new RefreshScheduler(eventBus);
  const backgroundPrefetchManager = new BackgroundPrefetchManager(eventBus);
  const webSocketManager = new WebSocketManager(eventBus);
  const healthMonitor = new HealthMonitor(providerManager, stateStore);

  const dataService = {
    getCurrentCryptoMarket(ids) {
      return providerManager.request("coingecko", "getMarkets", { ids }, `markets:${ids.sort().join(",")}`, refreshIntervals.price);
    },
    getGlobalMarket() {
      return providerManager.request("coingecko", "getGlobal", {}, "global-market", refreshIntervals.marketCap);
    },
    async getKaspaHistory(days) {
      const points = await historicalDataService.getHistory("kaspa", days);
      return points.map((point) => ({ date: point.date, price: point.value, value: point.value, timestamp: point.timestamp }));
    },
    getDashboardSnapshot() {
      return marketDataService.getCurrentMarkets();
    },
    async getAlerts() {
      const data = await providerManager.request("local", "getAlerts", {}, "local-alerts", 30 * 1000);
      stateStore.merge("feed", { status: data.length ? "live" : "unavailable", data, updatedAt: new Date().toISOString(), error: null });
      return data;
    },
  };

  backgroundPrefetchManager.register("market-data", () => marketDataService.getCurrentMarkets());
  backgroundPrefetchManager.register("network-metrics", () => kaspaNetworkService.getNetworkSnapshot());
  backgroundPrefetchManager.register("kaspa-history", () => historicalDataService.getHistory("kaspa", 365));
  assetRegistry.supportedComparisons().forEach((asset) => {
    backgroundPrefetchManager.register(`comparison-${asset.key}`, () => compareService.compareKaspaTo(asset.key, 365));
  });
  backgroundPrefetchManager.register("market-feed", () => dataService.getAlerts());

  window.KasBulletCore = {
    EventBus,
    CacheManager,
    StateStore,
    AssetRegistry,
    ProviderManager,
    MarketDataService,
    KaspaNetworkService,
    HistoricalDataService,
    HistoricalDataStore,
    TimeSeriesEngine,
    CompareService,
    AnalyticsEngine,
    RefreshScheduler,
    BackgroundPrefetchManager,
    WebSocketManager,
    HealthMonitor,
    refreshIntervals,
    eventBus,
    cacheManager,
    stateStore,
    assetRegistry,
    providerManager,
    timeSeriesEngine,
    historicalDataStore,
    marketDataService,
    kaspaNetworkService,
    historicalDataService,
    analyticsEngine,
    compareService,
    refreshScheduler,
    backgroundPrefetchManager,
    webSocketManager,
    healthMonitor,
    dataService,
    refreshManager: refreshScheduler,
  };
})();
