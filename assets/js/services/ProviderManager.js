(function () {
  "use strict";

  window.KasBulletServices = window.KasBulletServices || {};

  class ProviderManager {
    constructor(cacheManager, eventBus) {
      this.cache = cacheManager;
      this.eventBus = eventBus;
      this.providers = new Map();
      this.health = new Map();
    }

    register(provider) {
      this.providers.set(provider.id, provider);
      this.health.set(provider.id, {
        id: provider.id,
        status: "unknown",
        priority: provider.priority || 100,
        lastSuccessfulUpdate: null,
        latencyMs: null,
        error: null,
      });
      return provider;
    }

    get(providerId) {
      return this.providers.get(providerId);
    }

    async request(providerId, operation, args, cacheKey, ttl) {
      const provider = this.providers.get(providerId);
      if (!provider || typeof provider[operation] !== "function") {
        throw new Error(`Provider operation unavailable: ${providerId}.${operation}`);
      }

      return this.cache.remember(cacheKey, ttl, async () => {
        const startedAt = performance.now();
        try {
          const value = await provider[operation](args);
          this.markHealthy(providerId, performance.now() - startedAt);
          return value;
        } catch (error) {
          this.markUnhealthy(providerId, error);
          const fallback = this.cache.get(cacheKey, { allowStale: true });
          if (fallback) return fallback;
          throw error;
        }
      });
    }

    async requestWithFailover(providerIds, operation, args, cacheKey, ttl) {
      const orderedProviderIds = providerIds.filter(Boolean);
      let lastError = null;
      for (const providerId of orderedProviderIds) {
        try {
          return await this.request(providerId, operation, args, `${cacheKey}:${providerId}`, ttl);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error(`No provider configured for ${operation}`);
    }

    markHealthy(providerId, latencyMs) {
      const current = this.health.get(providerId) || {};
      this.health.set(providerId, {
        ...current,
        status: "live",
        latencyMs: Math.round(latencyMs),
        lastSuccessfulUpdate: new Date().toISOString(),
        error: null,
      });
      this.eventBus.publish("provider:health", this.getStatus());
    }

    markUnhealthy(providerId, error) {
      const current = this.health.get(providerId) || {};
      this.health.set(providerId, {
        ...current,
        status: "error",
        error: error.message,
      });
      this.eventBus.publish("provider:health", this.getStatus());
    }

    getStatus() {
      return Object.fromEntries(this.health);
    }
  }

  window.KasBulletServices.ProviderManager = ProviderManager;
})();
