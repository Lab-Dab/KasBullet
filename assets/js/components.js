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

  function metricCard({ label, value, note, field, noteField, jump }) {
    const fieldAttr = field ? ` data-field="${escapeHtml(field)}"` : "";
    const noteFieldAttr = noteField ? ` data-field="${escapeHtml(noteField)}"` : "";
    const jumpAttr = jump ? ` data-clickable="true" data-jump="${escapeHtml(jump)}"` : "";
    return `
      <article class="metric-card"${jumpAttr}>
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

  function toolbarButton({ label, active = false, disabled = false }) {
    return `
      <button type="button" class="toolbar-button" aria-pressed="${active ? "true" : "false"}"${disabled ? " disabled" : ""}>
        ${escapeHtml(label)}
      </button>
    `;
  }

  function intelligencePanel({ title, headline, chartLabel, insight, statusId }) {
    return `
      <article class="intelligence-panel">
        <div class="intelligence-panel-header">
          <h3>${escapeHtml(title)}</h3>
          <span class="module-status" id="${escapeHtml(statusId)}" data-status="unavailable">Container ready</span>
        </div>
        <div class="panel-headline">
          <span class="stat-label">Headline Metric</span>
          <strong class="stat-value">${escapeHtml(headline)}</strong>
        </div>
        <div class="panel-chart" role="img" aria-label="${escapeHtml(chartLabel)}">
          <span>Interactive Chart Container</span>
        </div>
        <div class="panel-insight">
          <span class="stat-label">Key Insight</span>
          <p>${escapeHtml(insight)}</p>
        </div>
        <button type="button" class="expand-button" aria-label="Expand ${escapeHtml(title)}">Expand</button>
      </article>
    `;
  }

  function feedCategory({ label, unread = false }) {
    return `
      <article class="feed-category${unread ? " is-unread" : ""}">
        <h3>${escapeHtml(label)}</h3>
        <p>${unread ? "Unread alerts available." : `Verified ${escapeHtml(label.toLowerCase())} intelligence container.`}</p>
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
    const severity = item.severity || "Notable";
    const category = item.category || "Market";
    const description = item.description || item.story || "No alert detail is available.";
    const source = item.source || item.channelTitle || "Local feed";
    return `
      <article class="alert-card${item.read ? " is-read" : " is-unread"}" data-severity="${escapeHtml(severity)}">
        <time datetime="${escapeHtml(item.publishedAt || "")}">${escapeHtml(displayDate)}</time>
        <span class="alert-meta">${escapeHtml(category)} / ${escapeHtml(severity)}</span>
        <h3>${escapeHtml(item.headline || "Verified alert")}</h3>
        <p>${escapeHtml(description)}</p>
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(source)}</a>
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
    toolbarButton,
    intelligencePanel,
    feedCategory,
    marketRow,
    alertCard,
    loadingSkeleton,
    escapeHtml,
  };
})();
