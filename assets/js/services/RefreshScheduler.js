(function () {
  "use strict";

  window.KasBulletServices = window.KasBulletServices || {};

  class RefreshScheduler {
    constructor(eventBus) {
      this.eventBus = eventBus;
      this.tasks = new Map();
    }

    register(name, task, intervalMs) {
      this.unregister(name);
      const run = async () => {
        try {
          const result = await task();
          this.eventBus.publish(`refresh:${name}`, result);
        } catch (error) {
          this.eventBus.publish(`refresh-error:${name}`, error);
        }
      };
      this.tasks.set(name, window.setInterval(run, intervalMs));
      return run();
    }

    unregister(name) {
      const task = this.tasks.get(name);
      if (task) window.clearInterval(task);
      this.tasks.delete(name);
    }
  }

  class BackgroundPrefetchManager {
    constructor(eventBus) {
      this.eventBus = eventBus;
      this.tasks = [];
      this.hasStarted = false;
    }

    register(name, task) {
      this.tasks.push({ name, task });
    }

    start() {
      if (this.hasStarted) return;
      this.hasStarted = true;
      this.tasks.forEach(async ({ name, task }) => {
        try {
          const result = await task();
          this.eventBus.publish(`prefetch:${name}`, result);
        } catch (error) {
          this.eventBus.publish(`prefetch-error:${name}`, error);
        }
      });
    }
  }

  window.KasBulletServices.RefreshScheduler = RefreshScheduler;
  window.KasBulletServices.BackgroundPrefetchManager = BackgroundPrefetchManager;
})();
