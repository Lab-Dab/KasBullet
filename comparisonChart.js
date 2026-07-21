(function () {
  "use strict";

  function getThemeColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function normalizePoints(points, basePoints) {
    if (!Array.isArray(points) || points.length === 0) return [];

    const baseLaunchValue = basePoints.find(p => p.value !== null)?.value;
    if (typeof baseLaunchValue !== 'number' || baseLaunchValue === 0) return [];

    return points.map(point => ({
      ...point,
      normalized: typeof point.value === 'number' ? (point.value / baseLaunchValue) * 100 : null,
    }));
  }

  function drawComparisonChart(canvas, baseAssetData, comparisonAssetData) {
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

    const gridColor = "rgba(37, 47, 61, .70)";
    const textColor = getThemeColor("--text-secondary");

    context.clearRect(0, 0, width, height);
    context.lineWidth = 1;
    context.strokeStyle = gridColor;
    context.fillStyle = textColor;
    context.font = "12px Inter, sans-serif";

    // Draw horizontal grid lines
    for (let index = 0; index <= 4; index += 1) {
      const y = padding.top + (chartHeight / 4) * index;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(width - padding.right, y);
      context.stroke();
    }

    if (!baseAssetData?.points.length || !comparisonAssetData?.points.length) {
      context.textAlign = "center";
      context.fillText("Comparison data unavailable", width / 2, height / 2);
      return;
    }

    // Since Launch: Align timelines. Find the master date range.
    const allDates = [...new Set([...baseAssetData.points.map(p => p.date.getTime()), ...comparisonAssetData.points.map(p => p.date.getTime())])].sort();
    const dateMap = new Map(allDates.map((time, i) => [time, i]));
    const totalPoints = allDates.length;

    const createAlignedSeries = (series) => {
      const seriesMap = new Map(series.points.map(p => [p.date.getTime(), p.value]));
      let lastSeenValue = null;
      return allDates.map(time => {
        if (seriesMap.has(time)) {
          lastSeenValue = seriesMap.get(time);
          return { date: new Date(time), value: lastSeenValue };
        }
        // Before this asset's launch, its value is null.
        return { date: new Date(time), value: null };
      });
    };

    const alignedBase = createAlignedSeries(baseAssetData);
    const alignedComparison = createAlignedSeries(comparisonAssetData);

    const normalizedBase = normalizePoints(alignedBase, alignedBase);
    const normalizedComparison = normalizePoints(alignedComparison, alignedBase);

    const allNormalizedValues = [
        ...normalizedBase.map(p => p.normalized),
        ...normalizedComparison.map(p => p.normalized)
    ].filter(v => v !== null);

    if (allNormalizedValues.length < 2) {
        context.textAlign = "center";
        context.fillText("Not enough data to render comparison", width / 2, height / 2);
        return;
    }

    const minLog = Math.min(...allNormalizedValues.filter(v => v > 0));
    const maxLog = Math.max(...allNormalizedValues);
    const logRange = Math.log(maxLog) - Math.log(minLog);

    const xFor = (index) => padding.left + (chartWidth * index) / (totalPoints - 1);
    const yFor = (value) => {
        if (value === null || value <= 0) return height - padding.bottom; // Render flat line at bottom for null/zero
        if (logRange === 0) return padding.top + chartHeight / 2;
        return padding.top + chartHeight - ((Math.log(value) - Math.log(minLog)) / logRange) * chartHeight;
    };

    const drawSeries = (series, color) => {
      context.beginPath();
      let firstPoint = true;
      series.forEach((point, index) => {
        if (point.normalized !== null) {
          const x = xFor(dateMap.get(point.date.getTime()));
          const y = yFor(point.normalized);
          if (firstPoint) {
            context.moveTo(x, y);
            firstPoint = false;
          } else {
            context.lineTo(x, y);
          }
        }
      });
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.stroke();
    };

    // Draw comparison asset first (behind)
    drawSeries(normalizedComparison, comparisonAssetData.color || '#F7931A');
    // Draw base asset second (in front)
    drawSeries(normalizedBase, baseAssetData.color || getThemeColor('--color-primary'));

    // Draw Legend
    const drawLegend = (label, color, x, y) => {
        context.fillStyle = color;
        context.fillRect(x, y - 10, 12, 12);
        context.fillStyle = textColor;
        context.textAlign = "left";
        context.fillText(label, x + 18, y);
    };

    drawLegend(baseAssetData.name, baseAssetData.color, padding.left, padding.top - 4);
    drawLegend(comparisonAssetData.name, comparisonAssetData.color, padding.left + 100, padding.top - 4);

    // Draw Axes Labels
    const firstDate = new Date(allDates[0]);
    const lastDate = new Date(allDates[allDates.length - 1]);
    context.fillStyle = textColor;
    context.textAlign = "left";
    context.fillText(
      firstDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      padding.left,
      height - 10
    );
    context.textAlign = "right";
    context.fillText(
      lastDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      width - padding.right,
      height - 10
    );

    // Y-Axis labels (log scale)
    const yAxisLabelCount = 5;
    context.textAlign = "right";
    for (let i = 0; i < yAxisLabelCount; i++) {
        const valueRatio = i / (yAxisLabelCount - 1);
        const y = padding.top + chartHeight - (valueRatio * chartHeight);

        // Inverse transform from y-coordinate back to log value
        const logValue = Math.exp(Math.log(minLog) + valueRatio * logRange);

        let label;
        if (logValue < 1000) {
            label = `${logValue.toFixed(0)}%`;
        } else {
            label = `${(logValue / 100).toFixed(0)}x`;
        }

        context.fillText(label, padding.left - 8, y + 4);
    }
  }

  function renderComparisonLegend(containerId, asset, data) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const launchPoint = data?.points.find(p => p.value !== null);
      const currentPoint = data?.points[data.points.length - 1];

      container.innerHTML = `
        <div class="stat-label">${asset.name}</div>
        <div class="stat-value comparison-legend-symbol">${asset.symbol}</div>
        <div class="stat-src">Launch: ${launchPoint ? launchPoint.date.toLocaleDateString('en-US') : 'N/A'}</div>
        <div class="stat-src">Launch Price: ${launchPoint ? '$'+launchPoint.value.toPrecision(4) : 'N/A'}</div>
        <div class="stat-src">Current Price: ${currentPoint ? '$'+currentPoint.value.toPrecision(4) : 'N/A'}</div>
      `;
  }

  window.KasBulletComparisonChart = {
    drawComparisonChart,
    renderComparisonLegend,
  };
})();
