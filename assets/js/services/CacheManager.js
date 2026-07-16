(function () {
  "use strict";

  window.KasBulletServices = window.KasBulletServices || {};

  class CacheManager {
    constructor(defaultTtl = 60 * 1000, storagePrefix = "kasbullet:cache:") {
      this.defaultTtl = defaultTtl;
      this.storagePrefix = storagePrefix;
      this.entries = new Map();
      this.inFlight = new Map();
    }

    get(key, { allowStale = false } = {}) {
      const entry = this.entries.get(key) || this.readPersisted(key);
      if (!entry) return null;
      const isFresh = Date.now() <= entry.expiresAt;
      if (!isFresh && !allowStale) {
        this.entries.delete(key);
        return null;
      }
      this.entries.set(key, entry);
      return entry.value;
    }

    getMeta(key) {
      const entry = this.entries.get(key) || this.readPersisted(key);
      return entry ? { updatedAt: entry.updatedAt, expiresAt: entry.expiresAt } : null;
    }

    set(key, value, ttl = this.defaultTtl) {
      const entry = {
        value,
        updatedAt: new Date().toISOString(),
        expiresAt: Date.now() + ttl,
      };
      this.entries.set(key, entry);
      this.writePersisted(key, entry);
      return value;
    }

    async remember(key, ttl, loader) {
      const cached = this.get(key);
      if (cached) return cached;
      if (this.inFlight.has(key)) return this.inFlight.get(key);
      const request = loader()
        .then((value) => this.set(key, value, ttl))
        .finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, request);
      return request;
    }

    readPersisted(key) {
      try {
        const raw = window.localStorage?.getItem(`${this.storagePrefix}${key}`);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }

    writePersisted(key, entry) {
      try {
        window.localStorage?.setItem(`${this.storagePrefix}${key}`, JSON.stringify(entry));
      } catch {
        return null;
      }
    }
  }

  window.KasBulletServices.CacheManager = CacheManager;
})();
