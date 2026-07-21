(function () {
  "use strict";

  window.KasBulletServices = window.KasBulletServices || {};

  class MarketEngine {
    windowReturn(points) {
      if (!points?.length) return null;
      const first = points[0].value ?? points[0].price;
      const last = points[points.length - 1].value ?? points[points.length - 1].price;
      if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
      return ((last - first) / first) * 100;
    }

    correlation(primaryPoints, benchmarkPoints) {
      const primary = (primaryPoints || []).map((point) => point.value ?? point.price).filter(Number.isFinite);
      const benchmark = (benchmarkPoints || []).map((point) => point.value ?? point.price).filter(Number.isFinite);
      const length = Math.min(primary.length, benchmark.length);
      if (length < 3) return null;
      const primarySlice = primary.slice(-length);
      const benchmarkSlice = benchmark.slice(-length);
      const primaryMean = primarySlice.reduce((sum, value) => sum + value, 0) / length;
      const benchmarkMean = benchmarkSlice.reduce((sum, value) => sum + value, 0) / length;
      let numerator = 0;
      let primaryVariance = 0;
      let benchmarkVariance = 0;
      for (let index = 0; index < length; index += 1) {
        const primaryDelta = primarySlice[index] - primaryMean;
        const benchmarkDelta = benchmarkSlice[index] - benchmarkMean;
        numerator += primaryDelta * benchmarkDelta;
        primaryVariance += primaryDelta * primaryDelta;
        benchmarkVariance += benchmarkDelta * benchmarkDelta;
      }
      const denominator = Math.sqrt(primaryVariance * benchmarkVariance);
      return denominator ? numerator / denominator : null;
    }

    annualizedVolatility(points) {
      const values = (points || []).map((point) => point.value ?? point.price).filter((value) => Number.isFinite(value) && value > 0);
      if (values.length < 3) return null;
      const returns = values.slice(1).map((value, index) => Math.log(value / values[index]));
      const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
      const variance = returns.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / returns.length;
      return Math.sqrt(variance) * Math.sqrt(365) * 100;
    }

    trendRegime(points) {
      const values = (points || []).map((point) => point.value ?? point.price).filter((value) => Number.isFinite(value) && value > 0);
      if (values.length < 90) return "sideways";
      const average = (items) => items.reduce((sum, value) => sum + value, 0) / items.length;
      const price = values[values.length - 1];
      const smaShort = average(values.slice(-20));
      const smaLong = average(values.slice(-90));
      if (price > smaShort && smaShort > smaLong) return "uptrend";
      if (price < smaShort && smaShort < smaLong) return "downtrend";
      return "sideways";
    }
  }

  class NetworkEngine {
    networkStrength({ hashrate, difficulty, bps, health }) {
      const healthScore = health === "Healthy" ? 25 : 12;
      const bpsScore = Number.isFinite(bps) ? Math.min(25, bps * 2.5) : 0;
      const hashrateScore = Number.isFinite(hashrate) ? 25 : 0;
      const difficultyScore = Number.isFinite(difficulty) ? 25 : 0;
      return Math.round(healthScore + bpsScore + hashrateScore + difficultyScore);
    }
  }

  class SupplyEngine {
    supplyRatio({ circulatingSupply, maxSupply }) {
      if (!Number.isFinite(circulatingSupply) || !Number.isFinite(maxSupply) || maxSupply === 0) return null;
      return (circulatingSupply / maxSupply) * 100;
    }
  }

  class CycleEngine {
    cycleScore() {
      return null;
    }
  }

  class AnalyticsEngine {
    constructor({
      marketEngine = new MarketEngine(),
      networkEngine = new NetworkEngine(),
      supplyEngine = new SupplyEngine(),
      cycleEngine = new CycleEngine(),
    } = {}) {
      this.market = marketEngine;
      this.network = networkEngine;
      this.supply = supplyEngine;
      this.cycle = cycleEngine;
    }

    windowReturn(points) {
      return this.market.windowReturn(points);
    }

    networkStrength(input) {
      return this.network.networkStrength(input);
    }

    healthBand(score) {
      if (!Number.isFinite(score)) return { band: "degraded", label: "Unavailable" };
      if (score >= 80) return { band: "stable", label: "Stable" };
      if (score >= 60) return { band: "watch", label: "Watch" };
      return { band: "degraded", label: "Degraded" };
    }

    correlation(primaryPoints, benchmarkPoints) {
      return this.market.correlation(primaryPoints, benchmarkPoints);
    }

    annualizedVolatility(points) {
      return this.market.annualizedVolatility(points);
    }

    trendRegime(points) {
      return this.market.trendRegime(points);
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

  window.KasBulletServices.MarketEngine = MarketEngine;
  window.KasBulletServices.NetworkEngine = NetworkEngine;
  window.KasBulletServices.SupplyEngine = SupplyEngine;
  window.KasBulletServices.CycleEngine = CycleEngine;
  window.KasBulletServices.AnalyticsEngine = AnalyticsEngine;
})();
