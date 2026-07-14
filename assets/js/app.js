(function () {
  "use strict";

  function start() {
    if (!window.KasBulletCore || !window.KasBulletComponents || !window.KasBulletChart || !window.KasBulletDashboard) {
      return;
    }
    window.KasBulletDashboard.initializeDashboard();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
