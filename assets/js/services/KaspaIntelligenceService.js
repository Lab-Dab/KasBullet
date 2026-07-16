(function () {
  "use strict";

  window.KasBulletServices = window.KasBulletServices || {};

  class KaspaIntelligenceService {
    constructor(providerManager, stateStore, analyticsEngine, refreshIntervals) {
      this.providers = providerManager;
      this.state = stateStore;
      this.analytics = analyticsEngine;
      this.refreshIntervals = refreshIntervals;
    }

    async getSnapshot() {
      const results = await Promise.allSettled([
        this.providers.request("kaspaApi", "getNetwork", {}, "kaspa:network", this.refreshIntervals.network),
        this.providers.request("kaspaApi", "getBlockdag", {}, "kaspa:blockdag", this.refreshIntervals.blocks),
        this.providers.request("kaspaApi", "getCoinSupply", {}, "kaspa:coin-supply", this.refreshIntervals.marketCap),
        this.providers.request("kaspaApi", "getHashrate", {}, "kaspa:hashrate", this.refreshIntervals.hashrate),
      ]);
      const [network, blockdag, coinSupply, hashrate] = results.map((result) =>
        result.status === "fulfilled" ? result.value : null
      );
      const hasVerifiedData = results.some((result) => result.status === "fulfilled");

      if (hasVerifiedData) {
        const data = this.normalizeSnapshot({
          network,
          blockdag,
          coinSupply,
          hashrate,
        });

        this.state.merge("kaspa", {
          status: "live",
          data,
          updatedAt: new Date().toISOString(),
          providerStatus: this.providers.getStatus(),
          error: null,
        });
        return data;
      }

      const error = results.find((result) => result.status === "rejected")?.reason;
      this.state.merge("kaspa", {
        status: "unavailable",
        error: error?.message || "Kaspa public API unavailable",
        providerStatus: this.providers.getStatus(),
      });
      return null;
    }

    getNetworkSnapshot() {
      return this.getSnapshot();
    }

    normalizeSnapshot({ network, blockdag, coinSupply, hashrate }) {
      const difficulty = Number(blockdag?.difficulty || network?.difficulty);
      const blocksPerSecond = Number(blockdag?.blocksPerSecond || network?.bps || 10);
      const normalizedHashrate = Number(hashrate?.hashrate || hashrate?.value || blockdag?.hashrate);
      const circulatingSupply = Number(coinSupply?.circulatingSupply || coinSupply?.circulating_supply);
      const health = network ? "Healthy" : "Unavailable";

      return {
        health,
        network: network?.networkName || network?.network || null,
        difficulty,
        hashrate: normalizedHashrate,
        bps: Number.isFinite(blocksPerSecond) ? blocksPerSecond : null,
        tps: Number(blockdag?.transactionsPerSecond || blockdag?.tps),
        circulatingSupply: Number.isFinite(circulatingSupply) ? circulatingSupply : null,
        marketCap: null,
        coinSupply,
        blocks: Number(blockdag?.blockCount || blockdag?.blocks),
        addresses: null,
        transactions: Number(blockdag?.transactionCount || blockdag?.transactions),
        halving: null,
        networkStatus: health,
        networkStrength: this.analytics.networkStrength({
          hashrate: normalizedHashrate,
          difficulty,
          bps: blocksPerSecond,
          health,
        }),
        addressDistribution: {
          lt1k: null,
          from1kTo10k: null,
          from10kTo100k: null,
          from100kTo1m: null,
          gt1m: null,
        },
      };
    }
  }

  window.KasBulletServices.KaspaIntelligenceService = KaspaIntelligenceService;
})();
