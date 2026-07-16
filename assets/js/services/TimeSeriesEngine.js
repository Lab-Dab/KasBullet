(function () {
  "use strict";

  window.KasBulletServices = window.KasBulletServices || {};

  class TimeSeriesEngine {
    normalize(points, valueKey = "value", metric = "price") {
      if (!Array.isArray(points)) return [];
      return points
        .map((point) => ({
          timestamp: new Date(point.timestamp || point.date).getTime(),
          date: new Date(point.timestamp || point.date),
          value: Number(point[valueKey] ?? point.value ?? point.price),
          metric,
        }))
        .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.value))
        .sort((a, b) => a.timestamp - b.timestamp);
    }

    align(seriesMap) {
      const entries = Object.entries(seriesMap);
      if (!entries.length) return {};
      const sharedTimestamps = entries
        .map(([, series]) => new Set(series.map((point) => point.timestamp)))
        .reduce((shared, timestamps) => new Set([...shared].filter((timestamp) => timestamps.has(timestamp))));

      return Object.fromEntries(entries.map(([key, series]) => [
        key,
        series.filter((point) => sharedTimestamps.has(point.timestamp)),
      ]));
    }

    normalizePerformance(series) {
      if (!series.length) return [];
      const first = series[0].value || 1;
      return series.map((point) => ({
        ...point,
        performance: ((point.value - first) / first) * 100,
      }));
    }

    createSeries({ assetId, metric = "price", points = [], valueKey = "value", source = "unknown" }) {
      return {
        assetId,
        metric,
        source,
        points: this.normalize(points, valueKey, metric),
        updatedAt: new Date().toISOString(),
      };
    }
  }

  window.KasBulletServices.TimeSeriesEngine = TimeSeriesEngine;
})();
