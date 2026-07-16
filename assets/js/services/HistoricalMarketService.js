(function () {
  "use strict";

  window.KasBulletServices = window.KasBulletServices || {};

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

  class HistoricalMarketService {
    constructor(providerManager, assetRegistry, historicalStore, timeSeriesEngine, stateStore, refreshIntervals) {
      this.providers = providerManager;
      this.assets = assetRegistry;
      this.store = historicalStore;
      this.series = timeSeriesEngine;
      this.state = stateStore;
      this.refreshIntervals = refreshIntervals;
    }

    async getCurrentMarkets(assetKeys = ["kaspa", "bitcoin", "ethereum"]) {
      const ids = assetKeys
        .map((key) => this.assets.get(key))
        .filter((asset) => asset?.provider === "coingecko")
        .map((asset) => asset.providerAssetId);

      const markets = await this.providers.request(
        "coingecko",
        "getMarkets",
        { ids },
        `markets:${ids.sort().join(",")}`,
        this.refreshIntervals.price
      );
      const global = await this.providers.request("coingecko", "getGlobal", {}, "global-market", this.refreshIntervals.marketCap);
      this.state.merge("market", {
        status: "live",
        data: { markets, global },
        updatedAt: new Date().toISOString(),
        providerStatus: this.providers.getStatus(),
        error: null,
      });
      return { markets, global };
    }

    async getHistory(assetKey, days = 30, metric = "price") {
      const cached = this.store.get(`${assetKey}:${metric}`, days);
      if (cached?.length) return this.series.normalize(cached);

      const asset = this.assets.get(assetKey);
      if (!asset) throw new Error(`Unknown asset: ${assetKey}`);
      if (!asset.historicalEnabled || !asset.supportedMetrics.includes(metric)) {
        throw new Error(`Historical ${metric} unavailable for ${assetKey}`);
      }

      const rawPoints = await this.providers.request(
        asset.provider,
        "getMarketChart",
        { asset, days },
        `historical:${assetKey}:${metric}:${days}:raw`,
        5 * 60 * 1000
      );
      const points = this.series.normalize(rawPoints, "value", metric);
      this.store.set(`${assetKey}:${metric}`, days, points);
      this.state.set(`history.${assetKey}.${metric}.${days}`, { status: "live", points, updatedAt: new Date().toISOString() });
      return points;
    }
  }

  window.KasBulletServices.HistoricalDataStore = HistoricalDataStore;
  window.KasBulletServices.HistoricalMarketService = HistoricalMarketService;
})();
