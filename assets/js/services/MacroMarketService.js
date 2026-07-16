(function () {
  "use strict";

  window.KasBulletServices = window.KasBulletServices || {};

  class MacroMarketService {
    constructor(providerManager, assetRegistry, historicalStore, timeSeriesEngine, stateStore, refreshIntervals) {
      this.providers = providerManager;
      this.assets = assetRegistry;
      this.store = historicalStore;
      this.series = timeSeriesEngine;
      this.state = stateStore;
      this.refreshIntervals = refreshIntervals;
    }

    async getHistory(assetKey, days = 365, metric = "price") {
      const cached = this.store.get(`${assetKey}:${metric}`, days);
      if (cached?.length) return this.series.normalize(cached);

      const asset = this.assets.get(assetKey);
      if (!asset) throw new Error(`Unknown macro asset: ${assetKey}`);
      if (!asset.historicalEnabled || !asset.supportedMetrics.includes(metric)) {
        throw new Error(`Historical ${metric} unavailable for ${assetKey}`);
      }

      const rawPoints = await this.providers.requestWithFailover(
        [asset.provider, asset.fallbackProvider],
        "getDailySeries",
        { asset, days },
        `historical:${assetKey}:${metric}:${days}:raw`,
        this.refreshIntervals.macro
      );
      const points = this.series.normalize(rawPoints, "value", metric);
      this.store.set(`${assetKey}:${metric}`, days, points);
      this.state.set(`history.${assetKey}.${metric}.${days}`, { status: "live", points, updatedAt: new Date().toISOString() });
      return points;
    }
  }

  window.KasBulletServices.MacroMarketService = MacroMarketService;
})();
