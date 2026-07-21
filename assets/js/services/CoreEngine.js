(function () {
  "use strict";

  window.KasBulletServices = window.KasBulletServices || {};

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

  class CoreEngine {
    constructor({ assets, providers, refreshIntervals }) {
      const services = window.KasBulletServices;
      this.refreshIntervals = refreshIntervals;
      this.eventBus = new services.EventBus();
      this.cacheManager = new services.CacheManager();
      this.stateStore = new services.StateStore(this.eventBus);
      this.assetRegistry = new services.AssetRegistry(assets);
      this.providerManager = new services.ProviderManager(this.cacheManager, this.eventBus);
      providers.forEach((provider) => this.providerManager.register(provider));
      this.timeSeriesEngine = new services.TimeSeriesEngine();
      this.historicalDataStore = new services.HistoricalDataStore(this.cacheManager);
      this.analyticsEngine = new services.AnalyticsEngine();
      this.intelligenceEngine = new services.IntelligenceEngine();
      this.historicalMarketService = new services.HistoricalMarketService(
        this.providerManager,
        this.assetRegistry,
        this.historicalDataStore,
        this.timeSeriesEngine,
        this.stateStore,
        refreshIntervals
      );
      this.macroMarketService = new services.MacroMarketService(
        this.providerManager,
        this.assetRegistry,
        this.historicalDataStore,
        this.timeSeriesEngine,
        this.stateStore,
        refreshIntervals
      );
      this.kaspaIntelligenceService = new services.KaspaIntelligenceService(
        this.providerManager,
        this.stateStore,
        this.analyticsEngine,
        refreshIntervals
      );
      this.comparisonEngine = new services.ComparisonEngine(
        this.assetRegistry,
        this.historicalMarketService,
        this.macroMarketService,
        this.timeSeriesEngine,
        this.analyticsEngine,
        this.stateStore
      );
      this.refreshScheduler = new services.RefreshScheduler(this.eventBus);
      this.backgroundPrefetchManager = new services.BackgroundPrefetchManager(this.eventBus);
      this.webSocketManager = new WebSocketManager(this.eventBus);
      this.healthMonitor = new services.HealthMonitor(this.providerManager, this.stateStore, this.cacheManager);
      this.dataService = this.createDataService();
      this.eventBus.subscribe("provider:health", () => this.publishSystemStatus());
    }

    createDataService() {
      return {
        getCurrentCryptoMarket: (ids) =>
          this.providerManager.request("coingecko", "getMarkets", { ids }, `markets:${ids.sort().join(",")}`, this.refreshIntervals.price),
        getGlobalMarket: () =>
          this.providerManager.request("coingecko", "getGlobal", {}, "global-market", this.refreshIntervals.marketCap),
        getKaspaHistory: async (days) => {
          const points = await this.historicalMarketService.getHistory("kaspa", days);
          return points.map((point) => ({ date: point.date, price: point.value, value: point.value, timestamp: point.timestamp }));
        },
        getDashboardSnapshot: async () => {
          const snapshot = await this.historicalMarketService.getCurrentMarkets([
            "kaspa",
            "bitcoin",
            "ethereum",
            "solana",
            "binancecoin",
            "ripple",
          ]);
          const [fearGreed, altcoinSeason] = await Promise.allSettled([
            this.providerManager.request("coingecko", "getFearGreed", {}, "fear-greed", this.refreshIntervals.macro),
            this.providerManager.request("coingecko", "getAltcoinSeason", {}, "altcoin-season", this.refreshIntervals.macro),
          ]);
          snapshot.fearGreed = fearGreed.status === "fulfilled" ? fearGreed.value : null;
          snapshot.altcoinSeason = altcoinSeason.status === "fulfilled" ? altcoinSeason.value : null;
          this.stateStore.merge("market", { data: snapshot, updatedAt: new Date().toISOString() });
          return snapshot;
        },
        getAlerts: async () => {
          const data = await this.providerManager.request("localFeed", "getAlerts", {}, "local-alerts", 30 * 1000);
          this.stateStore.merge("feed", {
            status: data.length ? "live" : "unavailable",
            data,
            updatedAt: new Date().toISOString(),
            error: null,
          });
          return data;
        },
      };
    }

    initialize() {
      this.backgroundPrefetchManager.register("historical-market-data", () =>
        this.historicalMarketService.getCurrentMarkets(["kaspa", "bitcoin", "ethereum", "solana", "binancecoin", "ripple"])
      );
      this.backgroundPrefetchManager.register("kaspa-intelligence", () => this.kaspaIntelligenceService.getSnapshot());
      this.backgroundPrefetchManager.register("kaspa-history", () => this.historicalMarketService.getHistory("kaspa", 365));
      this.assetRegistry.supportedComparisons().forEach((asset) => {
        this.backgroundPrefetchManager.register(`comparison-${asset.id}`, () => this.comparisonEngine.compareKaspaTo(asset.id, 365));
      });
      this.backgroundPrefetchManager.register("market-feed", () => this.dataService.getAlerts());
      this.publishSystemStatus();
      this.eventBus.publish("core:ready", this);
      return this;
    }

    publishSystemStatus() {
      this.stateStore.merge("system", this.healthMonitor.snapshot());
    }

    toGlobalApi() {
      const services = window.KasBulletServices;
      return {
        ...services,
        CoreEngine,
        WebSocketManager,
        refreshIntervals: this.refreshIntervals,
        coreEngine: this,
        eventBus: this.eventBus,
        cacheManager: this.cacheManager,
        stateStore: this.stateStore,
        assetRegistry: this.assetRegistry,
        providerManager: this.providerManager,
        timeSeriesEngine: this.timeSeriesEngine,
        historicalDataStore: this.historicalDataStore,
        historicalMarketService: this.historicalMarketService,
        marketDataService: this.historicalMarketService,
        macroMarketService: this.macroMarketService,
        kaspaIntelligenceService: this.kaspaIntelligenceService,
        kaspaNetworkService: this.kaspaIntelligenceService,
        historicalDataService: this.historicalMarketService,
        analyticsEngine: this.analyticsEngine,
        intelligenceEngine: this.intelligenceEngine,
        comparisonEngine: this.comparisonEngine,
        compareService: this.comparisonEngine,
        refreshScheduler: this.refreshScheduler,
        backgroundPrefetchManager: this.backgroundPrefetchManager,
        webSocketManager: this.webSocketManager,
        healthMonitor: this.healthMonitor,
        dataService: this.dataService,
        refreshManager: this.refreshScheduler,
      };
    }
  }

  window.KasBulletServices.CoreEngine = CoreEngine;
  window.KasBulletServices.WebSocketManager = WebSocketManager;
})();
