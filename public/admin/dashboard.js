const state = {
  licenses: [],
  stats: null,
  selectedLicense: null,
  search: "",
  statusFilter: "ALL",
  planFilter: "all",
  productFilter: "all",
};

const elements = {
  backendStatus: document.querySelector("#backend-status"),
  lastRefresh: document.querySelector("#last-refresh"),
  refreshButton: document.querySelector("#refresh-dashboard"),
  exportButton: document.querySelector("#export-report"),
  logoutButton: document.querySelector("#logout-button"),
  metricRevenue: document.querySelector("#metric-revenue"),
  metricRevenueNote: document.querySelector("#metric-revenue-note"),
  metricSales: document.querySelector("#metric-sales"),
  metricSalesNote: document.querySelector("#metric-sales-note"),
  metricActive: document.querySelector("#metric-active"),
  metricActiveNote: document.querySelector("#metric-active-note"),
  metricExpired: document.querySelector("#metric-expired"),
  metricExpiredNote: document.querySelector("#metric-expired-note"),
  metricCustomers: document.querySelector("#metric-customers"),
  metricCustomersNote: document.querySelector("#metric-customers-note"),
  currentWindowRevenue: document.querySelector("#current-window-revenue"),
  previousWindowRevenue: document.querySelector("#previous-window-revenue"),
  transactionCount: document.querySelector("#transaction-count"),
  revenueChart: document.querySelector("#revenue-chart"),
  planDonut: document.querySelector("#plan-donut"),
  planTotal: document.querySelector("#plan-total"),
  planBreakdown: document.querySelector("#plan-breakdown"),
  recentActivity: document.querySelector("#recent-activity"),
  alertCards: document.querySelector("#alert-cards"),
  alertsList: document.querySelector("#alerts-list"),
  licenseCount: document.querySelector("#license-count"),
  licensesBody: document.querySelector("#licenses-body"),
  webhooksBody: document.querySelector("#webhooks-body"),
  customersList: document.querySelector("#customers-list"),
  productsGrid: document.querySelector("#products-grid"),
  analyticsStrip: document.querySelector("#analytics-strip"),
  searchInput: document.querySelector("#license-search"),
  statusFilter: document.querySelector("#license-status-filter"),
  planFilter: document.querySelector("#license-plan-filter"),
  productFilter: document.querySelector("#license-product-filter"),
  validateForm: document.querySelector("#validate-form"),
  validatePlan: document.querySelector("#validate-plan"),
  validateResult: document.querySelector("#validate-result"),
  drawer: document.querySelector("#license-drawer"),
  drawerTitle: document.querySelector("#drawer-title"),
  drawerContent: document.querySelector("#drawer-content"),
  copyLicenseKey: document.querySelector("#copy-license-key"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatTrend(value) {
  const numeric = Number(value || 0);

  if (!Number.isFinite(numeric) || numeric === 0) {
    return "No change from the previous 7-day window";
  }

  const direction = numeric > 0 ? "up" : "down";
  const arrow = numeric > 0 ? "↑" : "↓";

  return `${arrow} ${Math.abs(numeric).toFixed(1)}% ${direction} vs previous 7 days`;
}

function formatDate(value) {
  if (!value) {
    return "No expiry";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatShortDate(value) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatRelativeTime(value) {
  if (!value) {
    return "Just now";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);

  return formatter.format(diffDays, "day");
}

function maskLicenseKey(key) {
  if (!key) {
    return "Unavailable";
  }

  if (key.length <= 12) {
    return key;
  }

  return `${key.slice(0, 8)}...${key.slice(-6)}`;
}

function normalizePlan(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "yearly") {
    return "yearly";
  }

  if (normalized === "lifetime") {
    return "lifetime";
  }

  return "unknown";
}

function formatPlan(value) {
  const normalized = normalizePlan(value);

  if (normalized === "yearly") {
    return "Yearly";
  }

  if (normalized === "lifetime") {
    return "Lifetime";
  }

  return value || "Unknown";
}

function statusClass(status) {
  const normalized = String(status || "").trim().toLowerCase().replaceAll(" ", "-").replaceAll("_", "-");

  if (normalized === "active" || normalized === "success") {
    return "status-badge status-active";
  }

  if (normalized === "expired" || normalized === "failed" || normalized === "invalid" || normalized === "not-found" || normalized === "product-mismatch" || normalized === "plan-mismatch" || normalized === "revoked") {
    return "status-badge status-failed";
  }

  if (normalized === "ignored" || normalized === "warning") {
    return "status-badge status-warning";
  }

  return "status-badge status-other";
}

function toneClasses(tone) {
  if (tone === "success") {
    return {
      text: "tone-success",
      background: "bg-success",
    };
  }

  if (tone === "warning") {
    return {
      text: "tone-warning",
      background: "bg-warning",
    };
  }

  if (tone === "danger") {
    return {
      text: "tone-danger",
      background: "bg-danger",
    };
  }

  if (tone === "purple") {
    return {
      text: "tone-purple",
      background: "bg-purple",
    };
  }

  return {
    text: "tone-info",
    background: "bg-info",
  };
}

function redirectToLogin() {
  window.localStorage.removeItem("admin");
  window.location.replace("/admin/login.html");
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);

  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Admin session expired.");
  }

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error || "Request failed.");
  }

  return payload;
}

function filteredLicenses() {
  const search = state.search.trim().toLowerCase();

  return [...state.licenses]
    .filter((license) => {
      if (
        state.statusFilter !== "ALL" &&
        String(license.status || "").toUpperCase() !== state.statusFilter
      ) {
        return false;
      }

      if (
        state.planFilter !== "all" &&
        normalizePlan(license.plan) !== state.planFilter
      ) {
        return false;
      }

      if (
        state.productFilter !== "all" &&
        String(license.product || "") !== state.productFilter
      ) {
        return false;
      }

      if (!search) {
        return true;
      }

      return [
        license.licenseKey,
        license.email,
        license.product,
        license.plan,
        license.status,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(search));
    })
    .sort((left, right) => {
      const leftTime = Date.parse(left.createdAt || left.updatedAt || "") || 0;
      const rightTime = Date.parse(right.createdAt || right.updatedAt || "") || 0;

      return rightTime - leftTime;
    });
}

function updateProductFilterOptions() {
  const currentValue = state.productFilter;
  const products = [...new Set(state.licenses.map((license) => license.product).filter(Boolean))].sort();

  elements.productFilter.innerHTML = [
    '<option value="all">All products</option>',
    ...products.map(
      (product) =>
        `<option value="${escapeHtml(product)}">${escapeHtml(product)}</option>`,
    ),
  ].join("");

  elements.productFilter.value = products.includes(currentValue)
    ? currentValue
    : "all";
}

function renderOverview() {
  const overview = state.stats?.overview;
  const revenue = state.stats?.revenue;

  if (!overview) {
    return;
  }

  elements.metricRevenue.textContent = overview.revenueDisplay || "--";
  elements.metricRevenueNote.textContent = revenue?.available
    ? formatTrend(revenue?.trend?.deltaPercent)
    : revenue?.error || "Revenue sync unavailable";

  elements.metricSales.textContent = formatNumber(
    revenue?.totalTransactions || overview.totalSales || 0,
  );
  elements.metricSalesNote.textContent = revenue?.available
    ? `${revenue.totalTransactions} completed Paddle transaction${revenue.totalTransactions === 1 ? "" : "s"} in the current sample`
    : "Waiting for transaction data";

  elements.metricActive.textContent = formatNumber(overview.activeLicenses);
  elements.metricActiveNote.textContent = `${formatPercent(
    overview.activeSharePercent,
  )} of issued licenses are currently active`;

  elements.metricExpired.textContent = formatNumber(overview.expiredLicenses);
  elements.metricExpiredNote.textContent = `${formatPercent(
    overview.expiredSharePercent,
  )} of licenses are past expiry or inactive`;

  elements.metricCustomers.textContent = formatNumber(overview.uniqueCustomers);
  elements.metricCustomersNote.textContent = `${overview.uniqueCustomers} customer${overview.uniqueCustomers === 1 ? "" : "s"} represented across ${overview.totalLicenses} license${overview.totalLicenses === 1 ? "" : "s"}`;
}

function niceCeiling(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  const power = 10 ** Math.floor(Math.log10(value));
  const normalized = value / power;

  if (normalized <= 1) {
    return power;
  }

  if (normalized <= 2) {
    return 2 * power;
  }

  if (normalized <= 5) {
    return 5 * power;
  }

  return 10 * power;
}

function buildLineChartSvg(trend) {
  const labels = trend?.labels || [];
  const currentValues = (trend?.current || []).map((value) => value / 100);
  const previousValues = (trend?.previous || []).map((value) => value / 100);

  if (!labels.length) {
    return "";
  }

  const width = 900;
  const height = 320;
  const padding = {
    top: 24,
    right: 28,
    bottom: 52,
    left: 64,
  };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = niceCeiling(Math.max(...currentValues, ...previousValues, 1));
  const stepX = labels.length > 1 ? plotWidth / (labels.length - 1) : plotWidth;
  const yFor = (value) =>
    padding.top + (1 - Math.min(value / maxValue, 1)) * plotHeight;
  const xFor = (index) => padding.left + index * stepX;
  const currentPoints = currentValues.map(
    (value, index) => `${xFor(index)},${yFor(value)}`,
  );
  const previousPoints = previousValues.map(
    (value, index) => `${xFor(index)},${yFor(value)}`,
  );
  const areaPath = [
    `M ${xFor(0)} ${padding.top + plotHeight}`,
    ...currentValues.map(
      (value, index) => `L ${xFor(index)} ${yFor(value)}`,
    ),
    `L ${xFor(labels.length - 1)} ${padding.top + plotHeight}`,
    "Z",
  ].join(" ");
  const gridLevels = 5;
  const gridMarkup = Array.from({ length: gridLevels + 1 }, (_, index) => {
    const value = (maxValue / gridLevels) * (gridLevels - index);
    const y = padding.top + (plotHeight / gridLevels) * index;

    return `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(148, 163, 184, 0.16)" stroke-dasharray="${index === gridLevels ? "0" : "4 8"}" />
      <text x="${padding.left - 12}" y="${y + 4}" fill="#6f83a0" font-size="12" text-anchor="end">${escapeHtml(
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: trend.currency || "USD",
          maximumFractionDigits: 0,
        }).format(value),
      )}</text>
    `;
  }).join("");
  const labelMarkup = labels.map((label, index) => `
    <text x="${xFor(index)}" y="${height - 18}" fill="#7f93b6" font-size="12" text-anchor="middle">${escapeHtml(
      label,
    )}</text>
  `).join("");
  const markerMarkup = currentValues.map((value, index) => `
    <circle cx="${xFor(index)}" cy="${yFor(value)}" r="5" fill="#7750f8" stroke="#bba7ff" stroke-width="2" />
  `).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Revenue trend chart">
      <defs>
        <linearGradient id="currentArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(119, 80, 248, 0.38)" />
          <stop offset="100%" stop-color="rgba(119, 80, 248, 0.02)" />
        </linearGradient>
      </defs>
      ${gridMarkup}
      <path d="${areaPath}" fill="url(#currentArea)" />
      <polyline fill="none" stroke="rgba(159, 176, 202, 0.72)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="8 8" points="${previousPoints.join(" ")}" />
      <polyline fill="none" stroke="#7750f8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${currentPoints.join(" ")}" />
      ${markerMarkup}
      ${labelMarkup}
    </svg>
  `;
}

function renderRevenueChart() {
  const trend = state.stats?.revenue?.trend;

  if (!trend) {
    return;
  }

  elements.currentWindowRevenue.textContent = trend.currentDisplay || "--";
  elements.previousWindowRevenue.textContent = trend.previousDisplay || "--";
  elements.transactionCount.textContent = formatNumber(
    state.stats?.revenue?.totalTransactions || 0,
  );
  elements.revenueChart.innerHTML = buildLineChartSvg(trend) || `
    <div class="empty-state">Revenue chart data is unavailable.</div>
  `;
}

function renderPlanSales() {
  const planSales = state.stats?.planSales;

  if (!planSales) {
    return;
  }

  const lifetime = planSales.items.find((item) => item.key === "lifetime");
  const yearly = planSales.items.find((item) => item.key === "yearly");
  const lifetimeShare = lifetime ? lifetime.share * 360 : 0;

  elements.planDonut.style.setProperty("--lifetime-share", `${lifetimeShare}deg`);
  elements.planTotal.textContent = formatNumber(planSales.total);

  elements.planBreakdown.innerHTML = planSales.items
    .map(
      (item) => `
        <div class="plan-row">
          <div class="plan-row-head">
            <strong><span class="plan-swatch ${escapeHtml(item.key)}"></span>${escapeHtml(
              item.label,
            )}</strong>
            <span>${formatNumber(item.count)}</span>
          </div>
          <small>${formatPercent(item.share * 100)} of tracked licenses and sales mix</small>
        </div>
      `,
    )
    .join("");
}

function activityIcon(item) {
  if (item.kind === "validation") {
    return item.tone === "success" ? "✓" : "!";
  }

  return item.tone === "success" ? "↺" : item.tone === "warning" ? "…" : "!";
}

function renderRecentActivity() {
  const entries = state.stats?.activity?.recent || [];

  if (!entries.length) {
    elements.recentActivity.innerHTML = `
      <div class="empty-state">No recent validations or webhooks yet.</div>
    `;
    return;
  }

  elements.recentActivity.innerHTML = entries
    .map((entry) => {
      const tone = toneClasses(entry.tone);

      return `
        <article class="activity-item">
          <div class="activity-icon ${tone.background}">${escapeHtml(
            activityIcon(entry),
          )}</div>
          <div class="activity-body">
            <strong>${escapeHtml(entry.title)}</strong>
            <p>${escapeHtml(entry.subtitle)}</p>
            <p class="customer-meta">${escapeHtml(entry.meta)}</p>
          </div>
          <div class="activity-time">${escapeHtml(
            formatRelativeTime(entry.timestamp),
          )}</div>
        </article>
      `;
    })
    .join("");
}

function renderAlerts() {
  const cards = state.stats?.alerts?.cards || [];
  const items = state.stats?.alerts?.items || [];

  elements.alertCards.innerHTML = cards
    .map((card) => `
      <article class="alert-card ${escapeHtml(card.tone)}">
        <p class="eyebrow">${escapeHtml(card.title)}</p>
        <strong>${formatNumber(card.value)}</strong>
        <p class="metric-note">${escapeHtml(card.description)}</p>
      </article>
    `)
    .join("");

  elements.alertsList.innerHTML = items
    .map((item) => {
      const tone = toneClasses(item.tone);

      return `
        <div class="alert-item">
          <strong class="${tone.text}">${escapeHtml(item.message)}</strong>
        </div>
      `;
    })
    .join("");
}

function renderLicenses() {
  const licenses = filteredLicenses();

  elements.licenseCount.textContent = `${licenses.length} license${licenses.length === 1 ? "" : "s"}`;

  if (!licenses.length) {
    elements.licensesBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">No licenses match your current filters.</td>
      </tr>
    `;
    return;
  }

  elements.licensesBody.innerHTML = licenses
    .map((license) => {
      const normalizedPlan = normalizePlan(license.plan);

      return `
        <tr>
          <td><span class="key-chip">${escapeHtml(maskLicenseKey(license.licenseKey))}</span></td>
          <td>${escapeHtml(license.email || "No email")}</td>
          <td>${escapeHtml(license.product || "unknown-product")}</td>
          <td><span class="plan-chip ${escapeHtml(normalizedPlan)}">${escapeHtml(
            formatPlan(license.plan),
          )}</span></td>
          <td><span class="${statusClass(license.status)}">${escapeHtml(
            license.status,
          )}</span></td>
          <td>${escapeHtml(formatDate(license.expiry))}</td>
          <td>${escapeHtml(formatRelativeTime(license.createdAt || license.updatedAt))}</td>
          <td>
            <div class="table-actions">
              <button class="table-button" data-view-license="${escapeHtml(
                license.id,
              )}">View</button>
              <button class="table-button danger" data-revoke-license="${escapeHtml(
                license.id,
              )}">Revoke</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderWebhooks() {
  const events = state.stats?.recentWebhooks || [];

  if (!events.length) {
    elements.webhooksBody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-cell">No webhook deliveries have been captured yet.</td>
      </tr>
    `;
    return;
  }

  elements.webhooksBody.innerHTML = events
    .map(
      (event) => `
        <tr>
          <td>${escapeHtml(event.eventType)}</td>
          <td><span class="${statusClass(event.status)}">${escapeHtml(
            event.status,
          )}</span></td>
          <td>${escapeHtml(formatRelativeTime(event.receivedAt))}</td>
          <td>
            <strong>${escapeHtml(event.details)}</strong>
            <div class="webhook-meta">${escapeHtml(event.source)}</div>
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderCustomers() {
  const customers = state.stats?.customers || [];

  if (!customers.length) {
    elements.customersList.innerHTML = `
      <div class="empty-state">No customer records are available yet.</div>
    `;
    return;
  }

  elements.customersList.innerHTML = customers
    .map(
      (customer) => `
        <article class="customer-item">
          <div class="customer-top">
            <div>
              <strong>${escapeHtml(customer.email)}</strong>
              <p class="customer-meta">${customer.licenses} license${customer.licenses === 1 ? "" : "s"} • ${customer.activeLicenses} active</p>
            </div>
            <span class="status-badge status-other">${escapeHtml(
              customer.products.join(", ") || "No product",
            )}</span>
          </div>
          <div class="customer-tags">
            <span class="mini-pill">Lifetime ${formatNumber(
              customer.lifetimeLicenses,
            )}</span>
            <span class="mini-pill">Yearly ${formatNumber(
              customer.yearlyLicenses,
            )}</span>
            <span class="mini-pill">Latest expiry ${escapeHtml(
              formatDate(customer.latestExpiry),
            )}</span>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderProducts() {
  const products = state.stats?.products || [];

  if (!products.length) {
    elements.productsGrid.innerHTML = `
      <div class="empty-state">Product performance data is unavailable.</div>
    `;
    return;
  }

  elements.productsGrid.innerHTML = products
    .map(
      (product) => `
        <article class="product-item">
          <div class="product-top">
            <strong>${escapeHtml(product.name)}</strong>
            <span class="status-badge status-other">${formatNumber(
              product.totalLicenses,
            )} licenses</span>
          </div>
          <p class="product-meta">Latest expiry: ${escapeHtml(
            formatDate(product.latestExpiry),
          )}</p>
          <div class="product-tags">
            <span class="mini-pill">Active ${formatNumber(product.activeLicenses)}</span>
            <span class="mini-pill">Expired ${formatNumber(product.expiredLicenses)}</span>
            <span class="mini-pill">Yearly ${formatNumber(product.yearlyLicenses)}</span>
            <span class="mini-pill">Lifetime ${formatNumber(product.lifetimeLicenses)}</span>
            <span class="mini-pill">Customers ${formatNumber(product.uniqueCustomers)}</span>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderAnalytics() {
  const analytics = state.stats?.analytics || [];

  if (!analytics.length) {
    elements.analyticsStrip.innerHTML = `
      <div class="empty-state">Analytics are unavailable right now.</div>
    `;
    return;
  }

  elements.analyticsStrip.innerHTML = analytics
    .map((item) => {
      const tone = toneClasses(item.tone);

      return `
        <article class="analytics-item">
          <p class="eyebrow">${escapeHtml(item.label)}</p>
          <strong class="${tone.text}">${escapeHtml(item.value)}</strong>
          <p class="metric-note">${escapeHtml(item.note)}</p>
        </article>
      `;
    })
    .join("");
}

function renderAll() {
  updateProductFilterOptions();
  renderOverview();
  renderRevenueChart();
  renderPlanSales();
  renderRecentActivity();
  renderAlerts();
  renderLicenses();
  renderWebhooks();
  renderCustomers();
  renderProducts();
  renderAnalytics();

  elements.backendStatus.textContent = "Backend connected";
  elements.lastRefresh.textContent = `Last sync ${formatShortDate(
    state.stats?.refreshedAt,
  )}`;
}

function setValidationResult(message, type = "empty") {
  elements.validateResult.className = `validate-result ${type}`;
  elements.validateResult.innerHTML = message;
}

async function loadDashboard() {
  elements.backendStatus.textContent = "Syncing dashboard";
  elements.refreshButton.disabled = true;
  elements.exportButton.disabled = true;

  try {
    const [statsPayload, licensePayload] = await Promise.all([
      fetchJson("/stats"),
      fetchJson("/licenses"),
    ]);

    state.stats = statsPayload;
    state.licenses = licensePayload.data || [];

    renderAll();
  } catch (error) {
    if (error.message === "Admin session expired.") {
      return;
    }

    elements.backendStatus.textContent = "Dashboard sync failed";
    elements.revenueChart.innerHTML = `
      <div class="empty-state">Unable to load dashboard data right now.</div>
    `;
    elements.licensesBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">Unable to load licenses right now.</td>
      </tr>
    `;
    elements.webhooksBody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-cell">Unable to load webhook activity.</td>
      </tr>
    `;
  } finally {
    elements.refreshButton.disabled = false;
    elements.exportButton.disabled = false;
  }
}

async function runValidation(event) {
  event.preventDefault();

  const licenseKey = document.querySelector("#validate-license-key").value.trim();
  const product = document.querySelector("#validate-product").value.trim();
  const plan = elements.validatePlan.value;

  if (!licenseKey || !product) {
    setValidationResult("Enter both a license key and product.", "error");
    return;
  }

  setValidationResult("Checking license...", "empty");

  try {
    const response = await fetch("/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        licenseKey,
        product,
        plan,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.error || "Validation failed.");
    }

    setValidationResult(
      `
        <strong>${payload.valid ? "License is valid" : "License is invalid"}</strong>
        <p>${escapeHtml(payload.status || "UNKNOWN")} • ${escapeHtml(payload.product || product)}</p>
        <p>${escapeHtml(formatDate(payload.expiry))}</p>
        ${payload.message ? `<p>${escapeHtml(payload.message)}</p>` : ""}
      `,
      payload.valid ? "success" : "error",
    );

    await loadDashboard();
  } catch (error) {
    setValidationResult(escapeHtml(error.message), "error");
  }
}

function openDrawer(licenseId) {
  const license = state.licenses.find((entry) => entry.id === licenseId);

  if (!license) {
    return;
  }

  state.selectedLicense = license;
  elements.drawerTitle.textContent = license.product || "License Detail";
  elements.drawerContent.innerHTML = [
    ["License Key", license.licenseKey || "Unavailable"],
    ["Product", license.product || "unknown-product"],
    ["Plan", formatPlan(license.plan)],
    ["Email", license.email || "No email"],
    ["Status", license.status || "Unknown"],
    ["Expiry", formatDate(license.expiry)],
    ["Created", formatDate(license.createdAt)],
    ["Updated", formatDate(license.updatedAt)],
    ["License ID", license.id || "Unavailable"],
  ]
    .map(
      ([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>
      `,
    )
    .join("");

  elements.drawer.classList.remove("hidden");
  elements.drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  state.selectedLicense = null;
  elements.drawer.classList.add("hidden");
  elements.drawer.setAttribute("aria-hidden", "true");
}

async function revokeLicense(licenseId) {
  const confirmed = window.confirm(
    "Revoke this license? This will immediately disable it in Keygen.",
  );

  if (!confirmed) {
    return;
  }

  try {
    await fetchJson("/licenses/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ licenseId }),
    });

    closeDrawer();
    await loadDashboard();
  } catch (error) {
    if (error.message === "Admin session expired.") {
      return;
    }

    window.alert(error.message);
  }
}

async function copySelectedLicense() {
  if (!state.selectedLicense?.licenseKey) {
    return;
  }

  await navigator.clipboard.writeText(state.selectedLicense.licenseKey);
  elements.copyLicenseKey.textContent = "Copied";

  window.setTimeout(() => {
    elements.copyLicenseKey.textContent = "Copy License Key";
  }, 1200);
}

async function exportReport() {
  try {
    const response = await fetch("/reports/export");

    if (response.status === 401) {
      redirectToLogin();
      return;
    }

    if (!response.ok) {
      throw new Error("Export failed.");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const disposition = response.headers.get("Content-Disposition") || "";
    const filenameMatch = disposition.match(/filename="([^"]+)"/u);

    link.href = url;
    link.download = filenameMatch?.[1] || "license-report.csv";
    document.body.append(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    window.alert(error.message);
  }
}

async function logout() {
  try {
    await fetch("/admin-logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (_error) {
    // Ignore transient failures and clear the local session anyway.
  }

  redirectToLogin();
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view-license]");
  const revokeButton = event.target.closest("[data-revoke-license]");
  const closeButton = event.target.closest("[data-close-drawer]");
  const navLink = event.target.closest(".nav-link");

  if (viewButton) {
    openDrawer(viewButton.getAttribute("data-view-license"));
  }

  if (revokeButton) {
    revokeLicense(revokeButton.getAttribute("data-revoke-license"));
  }

  if (closeButton) {
    closeDrawer();
  }

  if (navLink) {
    document
      .querySelectorAll(".nav-link")
      .forEach((link) => link.classList.remove("active"));
    navLink.classList.add("active");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDrawer();
  }
});

elements.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderLicenses();
});

elements.statusFilter.addEventListener("change", (event) => {
  state.statusFilter = event.target.value;
  renderLicenses();
});

elements.planFilter.addEventListener("change", (event) => {
  state.planFilter = event.target.value;
  renderLicenses();
});

elements.productFilter.addEventListener("change", (event) => {
  state.productFilter = event.target.value;
  renderLicenses();
});

elements.refreshButton.addEventListener("click", loadDashboard);
elements.exportButton.addEventListener("click", exportReport);
elements.validateForm.addEventListener("submit", runValidation);
elements.copyLicenseKey.addEventListener("click", copySelectedLicense);
elements.logoutButton.addEventListener("click", logout);

loadDashboard();
