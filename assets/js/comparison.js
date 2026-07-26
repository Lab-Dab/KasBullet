(function () {
  "use strict";

  function getThemeColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function normalizePoints(points, scale = "log") {
    if (!Array.isArray(points) || points.length === 0) return [];
    const validPoints = points.filter((point) => Number.isFinite(point.price) && point.price > 0 && point.date instanceof Date);
    const prices = validPoints.map((point) => scale === "log" ? Math.log(point.price) : point.price);
    if (prices.length === 0) return [];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    return validPoints.map((point) => ({
      ...point,
      normalized: typeof point.price === "number"
        ? ((scale === "log" ? Math.log(point.price) : point.price) - min) / range
        : 0,
    }));
  }

  function tooltipFor(canvas) {
    const shell = canvas?.parentElement;
    if (!shell) return null;
    let tooltip = shell.querySelector(".chart-tooltip");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "chart-tooltip";
      tooltip.hidden = true;
      shell.appendChild(tooltip);
    }
    return tooltip;
  }

  function bindTooltip(canvas, normalized, bounds, formatValue) {
    const tooltip = tooltipFor(canvas);
    if (!canvas || !tooltip || !normalized.length) return;
    canvas.onmouseleave = () => {
      tooltip.hidden = true;
    };
    canvas.onmousemove = (event) => {
      const rect = canvas.getBoundingClientRect();
      const relativeX = Math.max(bounds.left, Math.min(rect.width - bounds.right, event.clientX - rect.left));
      const index = Math.round(((relativeX - bounds.left) / bounds.width) * (normalized.length - 1));
      const point = normalized[Math.max(0, Math.min(normalized.length - 1, index))];
      if (!point) return;
      tooltip.hidden = false;
      tooltip.style.left = `${relativeX}px`;
      tooltip.style.top = `${Math.max(bounds.top + 12, event.clientY - rect.top - 16)}px`;
      tooltip.innerHTML = `<strong>${point.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</strong><span>${formatValue(point)}</span>`;
    };
  }

  function drawKasChart(canvas, points, { events = [], scale = "log", overlays = new Set(["events", "listings"]) } = {}) {
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
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
    const normalized = normalizePoints(points, scale);
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

    context.beginPath();
    normalized.forEach((point, index) => {
      const x = xFor(index);
      const y = yFor(point);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = primaryColor;
    context.lineWidth = 1.8;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.stroke();

    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    const startTime = first.date.getTime();
    const endTime = last.date.getTime();
    const timeRange = endTime - startTime || 1;
    const visibleEvents = events
      .map((event) => ({ ...event, date: new Date(event.date) }))
      .filter((event) => {
        const eventType = String(event.type || event.category || "").toLowerCase();
        const isListing = eventType.includes("listing") || String(event.title || "").toLowerCase().includes("listing");
        const shouldShow = isListing ? overlays.has("listings") : overlays.has("events");
        return shouldShow && !Number.isNaN(event.date.valueOf()) && event.date >= first.date && event.date <= last.date;
      });

    visibleEvents
      .forEach((event) => {
        const eventTime = event.date.getTime();
        let nearest = normalized[0];
        normalized.forEach((point) => {
          if (Math.abs(point.date.getTime() - eventTime) < Math.abs(nearest.date.getTime() - eventTime)) nearest = point;
        });
        const markerX = padding.left + ((eventTime - startTime) / timeRange) * chartWidth;
        const markerY = yFor(nearest);
        context.beginPath();
        context.arc(markerX, markerY, 3, 0, Math.PI * 2);
        context.fillStyle = primaryColor;
        context.fill();
      });

    bindTooltip(canvas, normalized, { ...padding, width: chartWidth, top: padding.top }, (point) => {
      const price = point.price.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: point.price < 1 ? 4 : 2,
        maximumFractionDigits: point.price < 1 ? 5 : 2,
      });
      return `KAS ${price}`;
    });

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

  function normalizedSeries(points) {
    const valid = (points || [])
      .map((point) => ({ date: point.date instanceof Date ? point.date : new Date(point.timestamp || point.date), value: Number(point.value ?? point.price) }))
      .filter((point) => Number.isFinite(point.value) && point.value > 0 && !Number.isNaN(point.date.valueOf()))
      .sort((a, b) => a.date - b.date);
    const first = valid[0]?.value || 1;
    return valid.map((point) => ({ ...point, normalized: point.value / first }));
  }

  function drawComparisonChart(canvas, results = []) {
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 24, right: 24, bottom: 34, left: 56 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const primary = results[0]?.datasets?.primary || [];
    const series = [
      { label: "KAS", color: getThemeColor("--color-primary"), points: normalizedSeries(primary) },
      ...results.map((result) => ({
        label: result.asset?.symbol || result.asset?.name || "Peer",
        color: result.asset?.brandColor || getThemeColor("--text-muted"),
        points: normalizedSeries(result.datasets?.benchmark || []),
      })),
    ].filter((item) => item.points.length > 1);

    context.clearRect(0, 0, width, height);
    context.strokeStyle = "rgba(37, 47, 61, .70)";
    context.fillStyle = getThemeColor("--text-secondary");
    context.font = "12px Inter, sans-serif";

    for (let index = 0; index <= 4; index += 1) {
      const y = padding.top + (chartHeight / 4) * index;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(width - padding.right, y);
      context.stroke();
    }

    if (!series.length) {
      context.textAlign = "center";
      context.fillText("Comparison history unavailable", width / 2, height / 2);
      return;
    }

    const max = Math.max(...series.flatMap((item) => item.points.map((point) => Math.log(point.normalized || 1))));
    const min = Math.min(...series.flatMap((item) => item.points.map((point) => Math.log(point.normalized || 1))));
    const range = max - min || 1;

    series.forEach((item) => {
      context.beginPath();
      item.points.forEach((point, index) => {
        const x = padding.left + (chartWidth * index) / (item.points.length - 1);
        const y = padding.top + chartHeight - ((Math.log(point.normalized || 1) - min) / range) * chartHeight;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = item.color;
      context.lineWidth = item.label === "KAS" ? 2.2 : 1.4;
      context.stroke();
    });

    context.textAlign = "left";
    series.slice(0, 6).forEach((item, index) => {
      context.fillStyle = item.color;
      context.fillText(item.label, padding.left + index * 54, 16);
    });

    bindTooltip(canvas, series[0].points, { ...padding, width: chartWidth, top: padding.top }, (point) => {
      return `KAS ${point.normalized.toFixed(2)}x since launch`;
    });
  }

  window.KasBulletChart = {
    drawKasChart,
    drawComparisonChart,
  };
})();
