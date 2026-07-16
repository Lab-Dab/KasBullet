(function () {
  "use strict";

  window.KasBulletServices = window.KasBulletServices || {};

  class ComparisonEngine {
    constructor(assetRegistry, historicalMarketService, macroMarketService, timeSeriesEngine, analyticsEngine, stateStore) {
      this.assets = assetRegistry;
      this.historicalMarket = historicalMarketService;
      this.macroMarket = macroMarketService;
      this.series = timeSeriesEngine;
      this.analytics = analyticsEngine;
      this.state = stateStore;
    }

    async getHistory(assetKey, days, metric = "price") {
      const asset = this.assets.get(assetKey);
      if (!asset) throw new Error(`Unknown comparison asset: ${assetKey}`);
      return asset.category === "macro"
        ? this.macroMarket.getHistory(assetKey, days, metric)
        : this.historicalMarket.getHistory(assetKey, days, metric);
    }

    async compareMetric({ primaryKey = "kaspa", benchmarkKey, metric = "price", days = 365, mode = "shared" }) {
      const target = this.assets.get(benchmarkKey);
      if (!target) throw new Error(`Unsupported comparison asset: ${benchmarkKey}`);

      try {
        const [primary, benchmark] = await Promise.all([
          this.getHistory(primaryKey, days, metric),
          this.getHistory(benchmarkKey, days, metric),
        ]);
        const aligned = mode === "shared" ? this.series.align({ primary, benchmark }) : { primary, benchmark };
        const result = {
          status: aligned.primary?.length && aligned.benchmark?.length ? "live" : "unavailable",
          asset: target,
          metric,
          mode,
          datasets: {
            primary: this.series.normalizePerformance(aligned.primary || []),
            benchmark: this.series.normalizePerformance(aligned.benchmark || []),
          },
          summary: {
            primary: this.analytics.summary(aligned.primary || []),
            benchmark: this.analytics.summary(aligned.benchmark || []),
          },
          updatedAt: new Date().toISOString(),
        };
        this.state.set(`comparisons.${benchmarkKey}.${metric}.${days}`, result);
        return result;
      } catch (error) {
        const result = {
          status: "unavailable",
          asset: target,
          metric,
          mode,
          datasets: { primary: [], benchmark: [] },
          summary: null,
          error: error.message,
          updatedAt: new Date().toISOString(),
        };
        this.state.set(`comparisons.${benchmarkKey}.${metric}.${days}`, result);
        return result;
      }
    }

    compareKaspaTo(benchmarkKey, days = 365, mode = "shared") {
      return this.compareMetric({ benchmarkKey, days, mode, metric: "price" });
    }
  }

  window.KasBulletServices.ComparisonEngine = ComparisonEngine;
  window.KasBulletServices.CompareService = ComparisonEngine;
})();
