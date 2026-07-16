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
