(function () {
  "use strict";

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }

  function renderSectionHeader(targetId, { id, title, statusId, status = "loading", statusText }) {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.innerHTML = `
      <div class="module-header">
        <h2 id="${escapeHtml(id)}">${escapeHtml(title)}</h2>
        <span class="module-status" id="${escapeHtml(statusId)}" data-status="${escapeHtml(status)}">${escapeHtml(statusText)}</span>
      </div>
    `;
  }

  function metricCard({ label, value, note, field, noteField }) {
    const fieldAttr = field ? ` data-field="${escapeHtml(field)}"` : "";
    const noteFieldAttr = noteField ? ` data-field="${escapeHtml(noteField)}"` : "";
    return `
      <article class="metric-card">
        <h3 class="metric-title">${escapeHtml(label)}</h3>
        <strong class="metric-value"${fieldAttr}>${escapeHtml(value)}</strong>
        <span class="metric-note"${noteFieldAttr}>${escapeHtml(note)}</span>
      </article>
    `;
  }

  function statCard({ label, value, source, field, valueClass = "" }) {
    const fieldAttr = field ? ` data-field="${escapeHtml(field)}"` : "";
    const className = valueClass ? ` stat-value ${escapeHtml(valueClass)}` : "stat-value";
    return `
      <article class="stat-card">
        <span class="stat-label">${escapeHtml(label)}</span>
        <strong class="${className}"${fieldAttr}>${escapeHtml(value)}</strong>
        <span class="stat-src">${escapeHtml(source)}</span>
      </article>
    `;
  }

  function marketRow({ label, value, change, changeClass = "change neutral" }) {
    return `
      <div class="market-row">
        <span>${escapeHtml(label)}</span>
        <span>${escapeHtml(value)}</span>
        <span class="${escapeHtml(changeClass)}">${escapeHtml(change)}</span>
      </div>
    `;
  }

  function alertCard(item) {
    const date = item.publishedAt ? new Date(item.publishedAt) : null;
    const displayDate = date && !Number.isNaN(date.valueOf())
      ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "Undated";
    const url = item.videoUrl || item.channelUrl || "#";
    return `
      <article class="alert-card">
        <time datetime="${escapeHtml(item.publishedAt || "")}">${escapeHtml(displayDate)}</time>
        <h3>${escapeHtml(item.headline || "Verified alert")}</h3>
        <p>${escapeHtml(item.story || "No alert detail is available.")}</p>
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener">Source</a>
      </article>
    `;
  }

  function loadingSkeleton(label = "Loading") {
    return `<p class="empty-state">${escapeHtml(label)}</p>`;
  }

  window.KasBulletComponents = {
    renderSectionHeader,
    metricCard,
    statCard,
    marketRow,
    alertCard,
    loadingSkeleton,
    escapeHtml,
  };
})();
