(function () {
  "use strict";

  const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

  class EventBus {
    constructor() {
      this.listeners = new Map();
    }

    subscribe(eventName, handler) {
      const handlers = this.listeners.get(eventName) || new Set();
      handlers.add(handler);
      this.listeners.set(eventName, handlers);
      return () => handlers.delete(handler);
    }

    publish(eventName, payload) {
      const handlers = this.listeners.get(eventName);
      if (!handlers) return;
      handlers.forEach((handler) => handler(payload));
    }
  }

  class CacheManager {
    constructor(defaultTtl = 60 * 1000) {
      this.defaultTtl = defaultTtl;
      this.entries = new Map();
    }

    get(key) {
      const entry = this.entries.get(key);
      if (!entry || Date.now() > entry.expiresAt) {
        this.entries.delete(key);
        return null;
      }
      return entry.value;
    }

    set(key, value, ttl = this.defaultTtl) {
      this.entries.set(key, {
        value,
        expiresAt: Date.now() + ttl,
      });
      return value;
    }

    clear(key) {
      if (key) {
        this.entries.delete(key);
        return;
      }
      this.entries.clear();
    }
  }

  class BackgroundRefreshManager {
    constructor(eventBus) {
      this.eventBus = eventBus;
      this.tasks = new Map();
    }

    register(name, task, intervalMs) {
      this.unregister(name);
      this.tasks.set(name, window.setInterval(async () => {
        try {
          const result = await task();
          this.eventBus.publish(`refresh:${name}`, result);
        } catch (error) {
          this.eventBus.publish(`refresh-error:${name}`, error);
        }
      }, intervalMs));
    }

    unregister(name) {
      const task = this.tasks.get(name);
      if (task) window.clearInterval(task);
      this.tasks.delete(name);
    }
  }

  class WebSocketManager {
    constructor(eventBus) {
      this.eventBus = eventBus;
      this.connections = new Map();
    }

    connect(name, url) {
      if (!url || typeof WebSocket === "undefined") return null;
      this.disconnect(name);
      const socket = new WebSocket(url);
      socket.addEventListener("message", (event) => {
        this.eventBus.publish(`socket:${name}`, event.data);
      });
      socket.addEventListener("error", (event) => {
        this.eventBus.publish(`socket-error:${name}`, event);
      });
      this.connections.set(name, socket);
      return socket;
    }

    disconnect(name) {
      const socket = this.connections.get(name);
      if (socket) socket.close();
      this.connections.delete(name);
    }
  }

  class DataService {
    constructor(cacheManager, eventBus) {
      this.cache = cacheManager;
      this.eventBus = eventBus;
    }

    async getJson(url, key, ttl) {
      const cached = this.cache.get(key);
      if (cached) return cached;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this.cache.set(key, data, ttl);
      this.eventBus.publish("data:fetched", { key });
      return data;
    }

    getCurrentCryptoMarket(ids) {
      const params = new URLSearchParams({
        vs_currency: "usd",
        ids: ids.join(","),
        order: "market_cap_desc",
        per_page: String(ids.length),
        page: "1",
        sparkline: "false",
        price_change_percentage: "24h",
      });
      return this.getJson(`${COINGECKO_BASE}/coins/markets?${params}`, `markets:${ids.join(",")}`);
    }

    getGlobalMarket() {
      return this.getJson(`${COINGECKO_BASE}/global`, "global-market");
    }

    async getKaspaHistory(days) {
      const params = new URLSearchParams({
        vs_currency: "usd",
        days: String(days),
        interval: "daily",
      });
      const data = await this.getJson(
        `${COINGECKO_BASE}/coins/kaspa/market_chart?${params}`,
        `history:kaspa:${days}`,
        5 * 60 * 1000
      );
      return (data.prices || []).map(([timestamp, price]) => ({
        date: new Date(timestamp),
        price,
      }));
    }

    async getDashboardSnapshot() {
      const [markets, global] = await Promise.all([
        this.getCurrentCryptoMarket(["kaspa", "bitcoin", "ethereum"]),
        this.getGlobalMarket(),
      ]);
      return { markets, global };
    }

    async getAlerts() {
      return this.getJson("data/news.json", "local-alerts", 30 * 1000);
    }
  }

  const eventBus = new EventBus();
  const cacheManager = new CacheManager();
  const dataService = new DataService(cacheManager, eventBus);
  const refreshManager = new BackgroundRefreshManager(eventBus);
  const webSocketManager = new WebSocketManager(eventBus);

  window.KasBulletCore = {
    EventBus,
    CacheManager,
    BackgroundRefreshManager,
    WebSocketManager,
    DataService,
    eventBus,
    cacheManager,
    dataService,
    refreshManager,
    webSocketManager,
  };
})();
