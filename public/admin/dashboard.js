const THEME_STORAGE_KEY = "focuspluz-theme";

const state = {
  licenses: [],
  stats: null,
  selectedLicense: null,
  search: "",
  statusFilter: "ALL",
  planFilter: "all",
  productFilter: "all",
  theme: document.documentElement.dataset.theme || "light",
};

const elements = {
  backendStatus: document.querySelector("#backend-status"),
  lastRefresh: document.querySelector("#last-refresh"),
  refreshButton: document.querySelector("#refresh-dashboard"),
  exportButton: document.querySelector("#export-report"),
  logoutButton: document.querySelector("#logout-button"),
  themeToggle: document.querySelector("#theme-toggle"),
  globalSearch: document.querySelector("#global-search"),
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
  drawerSubtitle: document.querySelector("#drawer-subtitle"),
  drawerContent: document.querySelector("#drawer-content"),
  drawerAudit: document.querySelector("#drawer-audit"),
  renewLicenseButton: document.querySelector("#renew-license-button"),
  upgradeLicenseButton: document.querySelector("#upgrade-license-button"),
  revokeLicenseButton: document.querySelector("#revoke-license-button"),
  copyEmailDraftButton: document.querySelector("#copy-email-draft-button"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatShortPercent(value) {
  const numeric = Number(value || 0);

  if (!Number.isFinite(numeric) || numeric === 0) {
    return "No change";
  }

  return `${numeric > 0 ? "↑" : "↓"} ${Math.abs(numeric).toFixed(1)}%`;
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
  const plan = normalizePlan(value);

  if (plan === "yearly") {
    return "Yearly";
  }

  if (plan === "lifetime") {
    return "Lifetime";
  }

  return value || "Unknown";
}

function statusClass(status) {
  const normalized = String(status || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "-")
    .replaceAll("_", "-");

  if (normalized === "active" || normalized === "success") {
    return "status-badge status-active";
  }

  if (
    normalized === "expired" ||
    normalized === "failed" ||
    normalized === "invalid" ||
    normalized === "not-found" ||
    normalized === "product-mismatch" ||
    normalized === "plan-mismatch" ||
    normalized === "revoked"
  ) {
    return "status-badge status-failed";
  }

  if (normalized === "warning" || normalized === "ignored" || normalized === "expiring") {
    return "status-badge status-warning";
  }

  return "status-badge status-other";
}

function activityToneClasses(tone) {
  if (tone === "success") {
    return {
      background: "bg-success",
      text: "tone-success",
    };
  }

  if (tone === "warning") {
    return {
      background: "bg-warning",
      text: "tone-warning",
    };
  }

  if (tone === "danger") {
    return {
      background: "bg-danger",
      text: "tone-danger",
    };
  }

  return {
    background: "bg-info",
    text: "tone-info",
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

function setTheme(theme) {
  state.theme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = state.theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, state.theme);
  elements.themeToggle.textContent = state.theme === "dark" ? "Light Mode" : "Dark Mode";
}

function toggleTheme() {
  setTheme(state.theme === "dark" ? "light" : "dark");
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
      (product) => `<option value="${escapeHtml(product)}">${escapeHtml(product)}</option>`,
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
    ? `${formatShortPercent(revenue?.trend?.deltaPercent)} vs previous 7-day window`
    : revenue?.error || "Revenue sync unavailable";

  elements.metricSales.textContent = formatNumber(
    revenue?.totalTransactions || overview.totalSales || 0,
  );
  elements.metricSalesNote.textContent = `${formatShortPercent(
    overview.salesDeltaPercent,
  )} transactions compared to the previous window`;

  elements.metricActive.textContent = formatNumber(overview.activeLicenses);
  elements.metricActiveNote.textContent = `${formatPercent(
    overview.activeSharePercent,
  )} of issued licenses are active`;

  elements.metricExpired.textContent = formatNumber(overview.expiredLicenses);
  elements.metricExpiredNote.textContent = `${formatPercent(
    overview.expiredSharePercent,
  )} are expired or inactive`;

  elements.metricCustomers.textContent = formatNumber(overview.uniqueCustomers);
  elements.metricCustomersNote.textContent = `${formatPercent(
    overview.customerCoveragePercent,
  )} customer-to-license coverage`;
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

function themeChartColor(token, fallback) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim() || fallback;
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
    right: 24,
    bottom: 48,
    left: 64,
  };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = niceCeiling(Math.max(...currentValues, ...previousValues, 1));
  const stepX = labels.length > 1 ? plotWidth / (labels.length - 1) : plotWidth;
  const xFor = (index) => padding.left + index * stepX;
  const yFor = (value) =>
    padding.top + (1 - Math.min(value / maxValue, 1)) * plotHeight;
  const currentStroke = themeChartColor("--teal", "#0f8f7c");
  const currentFill = themeChartColor("--teal-soft", "rgba(15, 143, 124, 0.12)");
  const previousStroke = themeChartColor("--text-faint", "#90a0b7");
  const gridStroke = themeChartColor("--border-strong", "rgba(15, 23, 42, 0.14)");
  const labelFill = themeChartColor("--text-faint", "#90a0b7");
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
  const gridMarkup = Array.from({ length: 5 }, (_, index) => {
    const level = 4 - index;
    const value = (maxValue / 4) * level;
    const y = padding.top + (plotHeight / 4) * index;
    const amount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: trend.currency || "USD",
      maximumFractionDigits: 0,
    }).format(value);

    return `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="${gridStroke}" stroke-dasharray="${index === 4 ? "0" : "4 8"}" />
      <text x="${padding.left - 10}" y="${y + 4}" fill="${labelFill}" font-size="12" text-anchor="end">${escapeHtml(amount)}</text>
    `;
  }).join("");
  const labelMarkup = labels.map((label, index) => `
    <text x="${xFor(index)}" y="${height - 18}" fill="${labelFill}" font-size="12" text-anchor="middle">${escapeHtml(label)}</text>
  `).join("");
  const markerMarkup = currentValues.map((value, index) => `
    <circle cx="${xFor(index)}" cy="${yFor(value)}" r="4.5" fill="${currentStroke}" stroke="${themeChartColor("--panel-strong", "#ffffff")}" stroke-width="2" />
  `).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Revenue trend chart">
      <defs>
        <linearGradient id="chartAreaFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="${currentFill}" />
          <stop offset="100%" stop-color="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      ${gridMarkup}
      <path d="${areaPath}" fill="url(#chartAreaFill)" />
      <polyline fill="none" stroke="${previousStroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="8 8" points="${previousPoints.join(" ")}" />
      <polyline fill="none" stroke="${currentStroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${currentPoints.join(" ")}" />
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
    <div class="empty-state">Revenue trend is unavailable right now.</div>
  `;
}

function renderPlanSales() {
  const planSales = state.stats?.planSales;

  if (!planSales) {
    return;
  }

  const lifetime = planSales.items.find((item) => item.key === "lifetime");
  const lifetimeShare = lifetime ? lifetime.share * 360 : 0;

  elements.planDonut.style.setProperty("--lifetime-share", `${lifetimeShare}deg`);
  elements.planTotal.textContent = formatNumber(planSales.total);

  elements.planBreakdown.innerHTML = planSales.items
    .map(
      (item) => `
        <div class="plan-row">
          <div class="plan-row-head">
            <strong><span class="plan-swatch ${escapeHtml(item.key)}"></span>${escapeHtml(item.label)}</strong>
            <span>${formatNumber(item.count)}</span>
          </div>
          <small>${formatPercent(item.share * 100)} of the current plan mix</small>
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
      <div class="empty-state">No validation or webhook activity has been logged yet.</div>
    `;
    return;
  }

  elements.recentActivity.innerHTML = entries
    .map((entry) => {
      const tone = activityToneClasses(entry.tone);

      return `
        <article class="activity-item">
          <div class="activity-icon ${tone.background}">${escapeHtml(activityIcon(entry))}</div>
          <div>
            <strong>${escapeHtml(entry.title)}</strong>
            <p>${escapeHtml(entry.subtitle)}</p>
            <p class="${tone.text}">${escapeHtml(entry.meta)}</p>
          </div>
          <div class="activity-time">${escapeHtml(formatRelativeTime(entry.timestamp))}</div>
        </article>
      `;
    })
    .join("");
}

function renderAlerts() {
  const cards = state.stats?.alerts?.cards || [];
  const items = state.stats?.alerts?.items || [];

  elements.alertCards.innerHTML = cards
    .map(
      (card) => `
        <article class="alert-card ${escapeHtml(card.tone)}">
          <p class="eyebrow">${escapeHtml(card.title)}</p>
          <strong>${formatNumber(card.value)}</strong>
          <p class="metric-note">${escapeHtml(card.description)}</p>
        </article>
      `,
    )
    .join("");

  elements.alertsList.innerHTML = items
    .map((item) => {
      const tone = activityToneClasses(item.tone);

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
      const plan = normalizePlan(license.plan);

      return `
        <tr>
          <td><span class="key-chip">${escapeHtml(maskLicenseKey(license.licenseKey))}</span></td>
          <td>${escapeHtml(license.email || "No email")}</td>
          <td>${escapeHtml(license.product || "unknown-product")}</td>
          <td><span class="plan-chip ${escapeHtml(plan)}">${escapeHtml(formatPlan(license.plan))}</span></td>
          <td><span class="${statusClass(license.status)}">${escapeHtml(license.status)}</span></td>
          <td>${escapeHtml(formatDate(license.expiry))}</td>
          <td>${escapeHtml(formatRelativeTime(license.createdAt || license.updatedAt))}</td>
          <td>
            <div class="table-actions">
              <button class="table-button" data-view-license="${escapeHtml(license.id)}">View</button>
              <button class="table-button" data-renew-license="${escapeHtml(license.id)}">Extend</button>
              <button class="table-button danger" data-revoke-license="${escapeHtml(license.id)}">Revoke</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderProducts() {
  const products = state.stats?.products || [];

  if (!products.length) {
    elements.productsGrid.innerHTML = `
      <div class="empty-state">Product performance is unavailable right now.</div>
    `;
    return;
  }

  elements.productsGrid.innerHTML = products
    .map(
      (product) => `
        <article class="product-item">
          <div class="product-top">
            <strong>${escapeHtml(product.name)}</strong>
            <span class="status-badge status-other">${formatNumber(product.totalLicenses)} licenses</span>
          </div>
          <p class="metric-note">Latest expiry: ${escapeHtml(formatDate(product.latestExpiry))}</p>
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

function renderCustomers() {
  const customers = state.stats?.customers || [];

  if (!customers.length) {
    elements.customersList.innerHTML = `
      <div class="empty-state">Customer data is unavailable right now.</div>
    `;
    return;
  }

  elements.customersList.innerHTML = customers
    .map(
      (customer) => `
        <article class="customer-item">
          <div class="customer-top">
            <strong>${escapeHtml(customer.email)}</strong>
            <span class="status-badge status-other">${formatNumber(customer.licenses)} licenses</span>
          </div>
          <p class="metric-note">${formatNumber(customer.activeLicenses)} active licenses • Latest expiry ${escapeHtml(formatDate(customer.latestExpiry))}</p>
          <div class="customer-tags">
            <span class="mini-pill">Lifetime ${formatNumber(customer.lifetimeLicenses)}</span>
            <span class="mini-pill">Yearly ${formatNumber(customer.yearlyLicenses)}</span>
            ${customer.products.map((product) => `<span class="mini-pill">${escapeHtml(product)}</span>`).join("")}
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
    .map(
      (item) => `
        <article class="analytics-item">
          <p class="eyebrow">${escapeHtml(item.label)}</p>
          <strong>${escapeHtml(item.value)}</strong>
          <p class="metric-note">${escapeHtml(item.note)}</p>
        </article>
      `,
    )
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
          <td><span class="${statusClass(event.status)}">${escapeHtml(event.status)}</span></td>
          <td>${escapeHtml(formatRelativeTime(event.receivedAt))}</td>
          <td>
            <strong>${escapeHtml(event.details)}</strong>
            <div class="metric-note">${escapeHtml(event.source)}</div>
          </td>
        </tr>
      `,
    )
    .join("");
}

function getAuditEntriesForLicense(license) {
  if (!license || !state.stats?.activity) {
    return [];
  }

  const licenseSuffix = String(license.keySuffix || "").toLowerCase();
  const email = String(license.email || "").toLowerCase();
  const product = String(license.product || "").toLowerCase();
  const entries = [];

  for (const validation of state.stats.activity.validations || []) {
    if (
      licenseSuffix &&
      String(validation.keySuffix || "").toLowerCase() === licenseSuffix
    ) {
      entries.push({
        id: validation.id,
        title: validation.valid ? "Validation succeeded" : "Validation failed",
        detail: `${validation.status || "UNKNOWN"} • ${validation.product || product}`,
        timestamp: validation.timestamp,
      });
    }
  }

  for (const webhook of state.stats.activity.webhooks || []) {
    const matchesEmail =
      email &&
      String(webhook.email || "").toLowerCase() === email;
    const matchesProduct =
      product &&
      String(webhook.productName || "").toLowerCase().includes(product);

    if (matchesEmail || matchesProduct) {
      entries.push({
        id: webhook.id,
        title: webhook.outcome || webhook.eventType || "Webhook event",
        detail: `${webhook.status || "Unknown status"} • ${webhook.productName || license.product || "No product"}`,
        timestamp: webhook.timestamp,
      });
    }
  }

  return entries.sort((left, right) => {
    const leftTime = Date.parse(left.timestamp || "") || 0;
    const rightTime = Date.parse(right.timestamp || "") || 0;

    return rightTime - leftTime;
  }).slice(0, 8);
}

function renderDrawerAudit(license) {
  const entries = getAuditEntriesForLicense(license);

  if (!entries.length) {
    elements.drawerAudit.innerHTML = `
      <div class="empty-state compact">No filtered validation or webhook events were found for this license yet.</div>
    `;
    return;
  }

  elements.drawerAudit.innerHTML = entries
    .map(
      (entry) => `
        <article class="audit-item">
          <strong>${escapeHtml(entry.title)}</strong>
          <p>${escapeHtml(entry.detail)}</p>
          <span class="audit-time">${escapeHtml(formatRelativeTime(entry.timestamp))}</span>
        </article>
      `,
    )
    .join("");
}

function renderDrawer(license) {
  elements.drawerTitle.textContent = license.product || "License Detail";
  elements.drawerSubtitle.textContent = `${license.email || "No email"} • ${formatPlan(
    license.plan,
  )} plan`;
  elements.drawerContent.innerHTML = [
    ["License Key", license.licenseKey || "Unavailable"],
    ["Product", license.product || "unknown-product"],
    ["Plan", formatPlan(license.plan)],
    ["Email", license.email || "No email"],
    ["Status", license.status || "Unknown"],
    ["Expiry", formatDate(license.expiry)],
    ["Created", formatDate(license.createdAt)],
    ["Updated", formatDate(license.updatedAt)],
    ["Policy ID", license.policyId || "Unavailable"],
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

  const plan = normalizePlan(license.plan);
  elements.upgradeLicenseButton.disabled = plan !== "yearly";
  elements.upgradeLicenseButton.textContent =
    plan === "yearly" ? "Upgrade to Lifetime" : "Already Lifetime";
  renderDrawerAudit(license);
}

function renderAll() {
  updateProductFilterOptions();
  renderOverview();
  renderRevenueChart();
  renderPlanSales();
  renderRecentActivity();
  renderAlerts();
  renderLicenses();
  renderProducts();
  renderCustomers();
  renderAnalytics();
  renderWebhooks();

  if (state.selectedLicense) {
    const refreshedSelected = state.licenses.find(
      (entry) => entry.id === state.selectedLicense.id,
    );

    if (refreshedSelected) {
      state.selectedLicense = refreshedSelected;
      renderDrawer(refreshedSelected);
    } else {
      closeDrawer();
    }
  }

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
  renderDrawer(license);
  elements.drawer.classList.remove("hidden");
  elements.drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  state.selectedLicense = null;
  elements.drawer.classList.add("hidden");
  elements.drawer.setAttribute("aria-hidden", "true");
}

async function performLicenseAction(path, body, successText) {
  const payload = await fetchJson(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  await loadDashboard();

  if (body.licenseId && payload.license) {
    openDrawer(body.licenseId);
  }

  return payload;
}

async function renewLicenseAction(licenseId = state.selectedLicense?.id) {
  if (!licenseId) {
    return;
  }

  const confirmed = window.confirm(
    "Extend this license by one policy renewal period?",
  );

  if (!confirmed) {
    return;
  }

  try {
    const button = state.selectedLicense?.id === licenseId
      ? elements.renewLicenseButton
      : null;

    if (button) {
      button.disabled = true;
      button.textContent = "Extending...";
    }

    await performLicenseAction("/licenses/renew", { licenseId });

    if (button) {
      button.textContent = "Extended";
      window.setTimeout(() => {
        button.textContent = "Extend License";
      }, 1200);
    }
  } catch (error) {
    window.alert(error.message);
  } finally {
    elements.renewLicenseButton.disabled = false;
  }
}

async function upgradeLicenseAction() {
  const license = state.selectedLicense;

  if (!license?.id) {
    return;
  }

  if (normalizePlan(license.plan) !== "yearly") {
    return;
  }

  const confirmed = window.confirm(
    "Upgrade this yearly license to the lifetime policy?",
  );

  if (!confirmed) {
    return;
  }

  try {
    elements.upgradeLicenseButton.disabled = true;
    elements.upgradeLicenseButton.textContent = "Upgrading...";
    await performLicenseAction("/licenses/change-plan", {
      licenseId: license.id,
      plan: "lifetime",
    });
    elements.upgradeLicenseButton.textContent = "Upgraded";
    window.setTimeout(() => {
      if (state.selectedLicense) {
        elements.upgradeLicenseButton.textContent =
          normalizePlan(state.selectedLicense.plan) === "yearly"
            ? "Upgrade to Lifetime"
            : "Already Lifetime";
      }
    }, 1200);
  } catch (error) {
    window.alert(error.message);
  } finally {
    elements.upgradeLicenseButton.disabled =
      normalizePlan(state.selectedLicense?.plan) !== "yearly";
  }
}

async function revokeLicenseAction(licenseId = state.selectedLicense?.id) {
  if (!licenseId) {
    return;
  }

  const confirmed = window.confirm(
    "Revoke this license? This cannot be undone in Keygen.",
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
    window.alert(error.message);
  }
}

async function copySelectedLicense() {
  if (!state.selectedLicense?.licenseKey) {
    return;
  }

  const license = state.selectedLicense;
  const message = [
    `Hello ${license.email || "there"},`,
    "",
    `Here is your license key for ${license.product || "your product"}:`,
    license.licenseKey,
    "",
    `Plan: ${formatPlan(license.plan)}`,
    `Status: ${license.status || "Unknown"}`,
    `Expiry: ${formatDate(license.expiry)}`,
    "",
    "Thank you,",
    "FocusPluz Support",
  ].join("\n");

  await navigator.clipboard.writeText(message);
  elements.copyEmailDraftButton.textContent = "Copied Draft";

  window.setTimeout(() => {
    elements.copyEmailDraftButton.textContent = "Copy Email Draft";
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
    // Ignore transient failures.
  }

  redirectToLogin();
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view-license]");
  const renewButton = event.target.closest("[data-renew-license]");
  const revokeButton = event.target.closest("[data-revoke-license]");
  const closeButton = event.target.closest("[data-close-drawer]");
  const navLink = event.target.closest(".nav-link");

  if (viewButton) {
    openDrawer(viewButton.getAttribute("data-view-license"));
  }

  if (renewButton) {
    renewLicenseAction(renewButton.getAttribute("data-renew-license"));
  }

  if (revokeButton) {
    revokeLicenseAction(revokeButton.getAttribute("data-revoke-license"));
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

elements.globalSearch.addEventListener("input", (event) => {
  state.search = event.target.value;
  elements.searchInput.value = event.target.value;
  renderLicenses();
});

elements.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  elements.globalSearch.value = event.target.value;
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
elements.logoutButton.addEventListener("click", logout);
elements.themeToggle.addEventListener("click", () => {
  toggleTheme();
  renderRevenueChart();
});
elements.validateForm.addEventListener("submit", runValidation);
elements.renewLicenseButton.addEventListener("click", () => renewLicenseAction());
elements.upgradeLicenseButton.addEventListener("click", upgradeLicenseAction);
elements.revokeLicenseButton.addEventListener("click", () => revokeLicenseAction());
elements.copyEmailDraftButton.addEventListener("click", copySelectedLicense);

setTheme(state.theme);
loadDashboard();
