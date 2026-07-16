(function () {
  "use strict";

  window.KasBulletServices = window.KasBulletServices || {};

  class HealthMonitor {
    constructor(providerManager, stateStore, cacheManager) {
      this.providers = providerManager;
      this.state = stateStore;
      this.cache = cacheManager;
    }

    snapshot() {
      const providerStatus = this.providers.getStatus();
      const providerValues = Object.values(providerStatus);
      const liveProviders = providerValues.filter((provider) => provider.status === "live");
      const latencyValues = providerValues
        .map((provider) => provider.latencyMs)
        .filter((latency) => Number.isFinite(latency));
      const latencyMs = latencyValues.length
        ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length)
        : null;
      const marketStatus = this.state.get("market.status");
      const kaspaStatus = this.state.get("kaspa.status");

      return {
        status: providerValues.some((provider) => provider.status === "error") ? "degraded" : "healthy",
        providerStatus,
        availableProviders: liveProviders.length,
        totalProviders: providerValues.length,
        latencyMs,
        checkedAt: new Date().toISOString(),
        historicalCache: this.cache.entries.size ? "Warm" : "Ready",
        liveStream: kaspaStatus === "live" || marketStatus === "live" ? "Connected" : "Preparing",
        connectionStatus: providerValues.some((provider) => provider.status === "live") ? "Connected" : "Preparing",
      };
    }
  }

  window.KasBulletServices.HealthMonitor = HealthMonitor;
})();
