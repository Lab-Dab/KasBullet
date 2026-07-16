(function () {
  "use strict";

  window.KasBulletServices = window.KasBulletServices || {};

  class IntelligenceEngine {
    summarizeNetwork(snapshot) {
      if (!snapshot) return "Verified network data is unavailable.";
      const parts = [];
      if (Number.isFinite(snapshot.bps)) parts.push(`BPS ${snapshot.bps.toFixed(2)}`);
      if (Number.isFinite(snapshot.hashrate)) parts.push("hashrate verified");
      if (Number.isFinite(snapshot.difficulty)) parts.push("difficulty verified");
      return parts.length ? `Network data verified: ${parts.join(", ")}.` : "Network fields are pending verification.";
    }

    summarizeMarket(markets) {
      const kaspa = Array.isArray(markets) ? markets.find((market) => market.id === "kaspa") : null;
      if (!kaspa) return "Verified market data is unavailable.";
      const change = Number(kaspa.price_change_percentage_24h);
      if (!Number.isFinite(change)) return "Kaspa market data is verified; 24h change is unavailable.";
      return `Kaspa 24h change is ${change >= 0 ? "positive" : "negative"} at ${change.toFixed(2)}%.`;
    }

    summarize({ market, kaspa }) {
      return {
        market: this.summarizeMarket(market?.markets),
        network: this.summarizeNetwork(kaspa),
        updatedAt: new Date().toISOString(),
      };
    }
  }

  window.KasBulletServices.IntelligenceEngine = IntelligenceEngine;
})();
