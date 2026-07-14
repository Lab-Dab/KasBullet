(function () {
  "use strict";

  function getThemeColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function normalizePoints(points) {
    if (!Array.isArray(points) || points.length === 0) return [];
    const prices = points.map((point) => point.price).filter((price) => typeof price === "number");
    if (prices.length === 0) return [];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    return points.map((point) => ({
      ...point,
      normalized: typeof point.price === "number" ? (point.price - min) / range : 0,
    }));
  }

  function drawKasChart(canvas, points) {
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 20, right: 24, bottom: 32, left: 52 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const normalized = normalizePoints(points);
    const gridColor = "rgba(37, 47, 61, .70)";
    const textColor = getThemeColor("--text-secondary");
    const primaryColor = getThemeColor("--color-primary");

    context.clearRect(0, 0, width, height);
    context.lineWidth = 1;
    context.strokeStyle = gridColor;
    context.fillStyle = textColor;
    context.font = "12px Inter, sans-serif";

    for (let index = 0; index <= 4; index += 1) {
      const y = padding.top + (chartHeight / 4) * index;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(width - padding.right, y);
      context.stroke();
    }

    if (normalized.length < 2) {
      context.textAlign = "center";
      context.fillText("KAS price history unavailable", width / 2, height / 2);
      return;
    }

    const xFor = (index) => padding.left + (chartWidth * index) / (normalized.length - 1);
    const yFor = (point) => padding.top + chartHeight - point.normalized * chartHeight;

    const gradient = context.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, "rgba(73, 234, 203, .26)");
    gradient.addColorStop(1, "rgba(73, 234, 203, 0)");

    context.beginPath();
    normalized.forEach((point, index) => {
      const x = xFor(index);
      const y = yFor(point);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.lineTo(width - padding.right, height - padding.bottom);
    context.lineTo(padding.left, height - padding.bottom);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();

    context.beginPath();
    normalized.forEach((point, index) => {
      const x = xFor(index);
      const y = yFor(point);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = primaryColor;
    context.lineWidth = 2;
    context.stroke();

    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    context.fillStyle = textColor;
    context.textAlign = "left";
    context.fillText(
      first.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      padding.left,
      height - 10
    );
    context.textAlign = "right";
    context.fillText(
      last.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      width - padding.right,
      height - 10
    );
  }

  window.KasBulletChart = {
    drawKasChart,
  };
})();
