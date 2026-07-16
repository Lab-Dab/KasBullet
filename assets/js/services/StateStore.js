(function () {
  "use strict";

  window.KasBulletServices = window.KasBulletServices || {};

  class StateStore {
    constructor(eventBus) {
      this.eventBus = eventBus;
      this.state = {
        system: { status: "loading", latencyMs: null, updatedAt: null, liveStream: "Connected" },
        market: { status: "loading", data: null, error: null, updatedAt: null, providerStatus: {} },
        macro: { status: "loading", data: null, error: null, updatedAt: null, providerStatus: {} },
        history: {},
        comparisons: {},
        kaspa: { status: "loading", data: null, error: null, updatedAt: null, providerStatus: {} },
        feed: { status: "loading", data: [], error: null, updatedAt: null },
      };
      this.subscribers = new Set();
    }

    getState() {
      return this.state;
    }

    set(path, value) {
      const segments = path.split(".");
      let cursor = this.state;
      segments.slice(0, -1).forEach((segment) => {
        cursor[segment] = cursor[segment] || {};
        cursor = cursor[segment];
      });
      cursor[segments[segments.length - 1]] = value;
      this.notify(path, value);
    }

    merge(path, value) {
      this.set(path, { ...(this.get(path) || {}), ...value });
    }

    get(path) {
      return path.split(".").reduce((cursor, segment) => cursor?.[segment], this.state);
    }

    subscribe(handler) {
      this.subscribers.add(handler);
      handler(this.state, { path: "initial", value: this.state });
      return () => this.subscribers.delete(handler);
    }

    notify(path, value) {
      const payload = { path, value };
      this.subscribers.forEach((handler) => handler(this.state, payload));
      this.eventBus.publish("state:changed", payload);
    }
  }

  window.KasBulletServices.StateStore = StateStore;
})();
