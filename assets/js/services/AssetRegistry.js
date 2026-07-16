(function () {
  "use strict";

  window.KasBulletServices = window.KasBulletServices || {};

  class AssetRegistry {
    constructor(initialAssets = []) {
      this.assets = new Map();
      initialAssets.forEach((asset) => this.register(asset));
    }

    register(asset) {
      const normalized = {
        ...asset,
        key: asset.key || asset.id,
        id: asset.id || asset.key,
        fallbackProvider: asset.fallbackProvider || null,
        supportedMetrics: asset.supportedMetrics || ["price"],
        comparisonEnabled: Boolean(asset.comparisonEnabled),
        historicalEnabled: Boolean(asset.historicalEnabled),
      };
      this.assets.set(normalized.id, normalized);
      return normalized;
    }

    get(assetId) {
      return this.assets.get(assetId);
    }

    list() {
      return Array.from(this.assets.values());
    }

    supportedComparisons() {
      return this.list().filter((asset) => asset.id !== "kaspa" && asset.comparisonEnabled);
    }

    supportedSnapshotAssets() {
      return this.list().filter((asset) => asset.category === "crypto" || asset.category === "macro");
    }
  }

  window.KasBulletServices.AssetRegistry = AssetRegistry;
})();
