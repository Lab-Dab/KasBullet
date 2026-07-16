(function () {
  "use strict";

  window.KasBulletServices = window.KasBulletServices || {};

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

  window.KasBulletServices.EventBus = EventBus;
})();
