const state = {
  licenses: [],
  stats: null,
  selectedLicense: null,
  search: "",
  statusFilter: "ALL",
};

const elements = {
  backendStatus: document.querySelector("#backend-status"),
  lastRefresh: document.querySelector("#last-refresh"),
  refreshButton: document.querySelector("#refresh-dashboard"),
  metricTotal: document.querySelector("#metric-total"),
  metricActive: document.querySelector("#metric-active"),
  metricExpired: document.querySelector("#metric-expired"),
  metricRevenue: document.querySelector("#metric-revenue"),
  metricRevenueNote: document.querySelector("#metric-revenue-note"),
  revenueBreakdown: document.querySelector("#revenue-breakdown"),
  licenseCount: document.querySelector("#license-count"),
  licensesBody: document.querySelector("#licenses-body"),
  productsGrid: document.querySelector("#products-grid"),
  validationActivity: document.querySelector("#validation-activity"),
  webhookActivity: document.querySelector("#webhook-activity"),
  searchInput: document.querySelector("#license-search"),
  statusFilter: document.querySelector("#license-status-filter"),
  validateForm: document.querySelector("#validate-form"),
  validateResult: document.querySelector("#validate-result"),
  validatePlan: document.querySelector("#validate-plan"),
  logoutButton: document.querySelector("#logout-button"),
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
    return "Unknown time";
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

function formatRelativeTime(value) {
  if (!value) {
    return "Just now";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

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

  if (key.length <= 10) {
    return key;
  }

  return `${key.slice(0, 6)}...${key.slice(-6)}`;
}

function redirectToLogin() {
  window.localStorage.removeItem("admin");
  window.location.replace("/admin/login.html");
}

function getBadgeClass(status) {
  const normalized = String(status || "").toUpperCase();

  if (normalized === "ACTIVE") {
    return "badge badge-active";
  }

  if (
    normalized === "EXPIRED" ||
    normalized === "NOT_FOUND" ||
    normalized === "INVALID" ||
    normalized === "PRODUCT_MISMATCH" ||
    normalized === "PLAN_MISMATCH"
  ) {
    return `badge badge-${normalized.toLowerCase().replaceAll("_", "-")}`;
  }

  return "badge badge-other";
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
  return state.licenses.filter((license) => {
    const search = state.search.trim().toLowerCase();
    const statusMatch =
      state.statusFilter === "ALL" || license.status === state.statusFilter;

    if (!statusMatch) {
      return false;
    }

    if (!search) {
      return true;
    }

    return [
      license.licenseKey,
      license.product,
      license.plan,
      license.email,
      license.status,
    ]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(search));
  });
}

function renderOverview() {
  const overview = state.stats?.overview;

  if (!overview) {
    return;
  }

  elements.metricTotal.textContent = overview.totalLicenses;
  elements.metricActive.textContent = overview.activeLicenses;
  elements.metricExpired.textContent = overview.expiredLicenses;
  elements.metricRevenue.textContent = overview.revenueDisplay;
  elements.metricRevenueNote.textContent = state.stats?.revenue?.available
    ? `${state.stats.revenue.totalTransactions} recent completed transactions`
    : "Revenue unavailable from Paddle right now";
}

function renderRevenue() {
  const revenue = state.stats?.revenue;

  if (!revenue) {
    return;
  }

  if (!revenue.breakdown?.length) {
    elements.revenueBreakdown.innerHTML = `
      <div class="empty-state">
        ${revenue.available ? "No completed transactions yet." : "Revenue data is currently unavailable."}
      </div>
    `;
    return;
  }

  elements.revenueBreakdown.innerHTML = revenue.breakdown
    .map(
      (entry) => `
        <div class="revenue-item">
          <strong>${escapeHtml(entry.display)}</strong>
          <p class="small-copy">
            ${escapeHtml(entry.currency)} collected from recent completed transactions
          </p>
        </div>
      `,
    )
    .join("");
}

function renderLicenses() {
  const licenses = filteredLicenses();
  elements.licenseCount.textContent = `${licenses.length} licenses`;

  if (!licenses.length) {
    elements.licensesBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-cell">No licenses match your current filters.</td>
      </tr>
    `;
    return;
  }

  elements.licensesBody.innerHTML = licenses
    .map(
      (license) => `
        <tr>
          <td>
            <span class="key-chip">${escapeHtml(maskLicenseKey(license.licenseKey))}</span>
          </td>
          <td>${escapeHtml(license.product || "unknown-product")}</td>
          <td>${escapeHtml(license.plan || "Unknown")}</td>
          <td>${escapeHtml(license.email || "No email")}</td>
          <td><span class="${getBadgeClass(license.status)}">${escapeHtml(license.status)}</span></td>
          <td>${escapeHtml(formatDate(license.expiry))}</td>
          <td>
            <div class="table-actions">
              <button class="table-link" data-view-license="${escapeHtml(license.id)}">View</button>
              <button class="table-link table-danger" data-revoke-license="${escapeHtml(license.id)}">Revoke</button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderProducts() {
  const products = state.stats?.products || [];

  if (!products.length) {
    elements.productsGrid.innerHTML = `
      <div class="panel empty-state">No product data available yet.</div>
    `;
    return;
  }

  elements.productsGrid.innerHTML = products
    .map(
      (product) => `
        <article class="product-card panel">
          <p class="eyebrow">Product</p>
          <strong>${escapeHtml(product.name)}</strong>
          <p class="small-copy">Latest expiry: ${escapeHtml(formatDate(product.latestExpiry))}</p>
          <div class="product-metrics">
            <div class="mini-metric">
              <span>Total</span>
              <strong>${product.totalLicenses}</strong>
            </div>
            <div class="mini-metric">
              <span>Active</span>
              <strong>${product.activeLicenses}</strong>
            </div>
            <div class="mini-metric">
              <span>Expired</span>
              <strong>${product.expiredLicenses}</strong>
            </div>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderActivityColumn(target, entries, type) {
  if (!entries.length) {
    target.innerHTML = `<div class="empty-state">No ${type} recorded yet.</div>`;
    return;
  }

  target.innerHTML = entries
    .map((entry) => {
      if (type === "validations") {
        return `
          <article class="activity-item">
            <strong>${escapeHtml(entry.status || "UNKNOWN")}</strong>
            <p>${escapeHtml(entry.product || "unknown-product")} | key ending ${escapeHtml(entry.keySuffix || "n/a")}</p>
            <p class="activity-meta">${entry.valid ? "Validation succeeded" : "Validation failed"} | ${escapeHtml(formatRelativeTime(entry.timestamp))}</p>
          </article>
        `;
      }

      return `
        <article class="activity-item">
          <strong>${escapeHtml(entry.outcome || "WEBHOOK")}</strong>
          <p>${escapeHtml(entry.productName || "No product")} | ${escapeHtml(entry.email || "No email")}</p>
          <p class="activity-meta">${escapeHtml(entry.status || "Unknown status")} | ${escapeHtml(formatRelativeTime(entry.timestamp))}</p>
        </article>
      `;
    })
    .join("");
}

function renderActivity() {
  renderActivityColumn(
    elements.validationActivity,
    state.stats?.activity?.validations || [],
    "validations",
  );
  renderActivityColumn(
    elements.webhookActivity,
    state.stats?.activity?.webhooks || [],
    "webhooks",
  );
}

function renderAll() {
  renderOverview();
  renderRevenue();
  renderLicenses();
  renderProducts();
  renderActivity();

  elements.backendStatus.textContent = "Connected";
  elements.lastRefresh.textContent = `Last sync ${formatShortDate(
    state.stats?.refreshedAt,
  )}`;
}

function setValidationResult(message, type = "empty") {
  elements.validateResult.className = `validate-result ${type}`;
  elements.validateResult.innerHTML = message;
}

async function loadDashboard() {
  elements.backendStatus.textContent = "Syncing...";
  elements.refreshButton.disabled = true;

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

    elements.backendStatus.textContent = "Connection failed";
    elements.licensesBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-cell">Unable to load dashboard data.</td>
      </tr>
    `;
    elements.productsGrid.innerHTML = `
      <div class="panel empty-state">Unable to load product data right now.</div>
    `;
  } finally {
    elements.refreshButton.disabled = false;
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
        <p>${escapeHtml(payload.status)} | ${escapeHtml(payload.product || product)}</p>
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
  elements.drawerTitle.textContent = license.product || "License detail";
  elements.drawerContent.innerHTML = [
    ["License Key", license.licenseKey || "Unavailable"],
    ["Product", license.product || "unknown-product"],
    ["Plan", license.plan || "Unknown"],
    ["Email", license.email || "No email"],
    ["Status", license.status || "Unknown"],
    ["Expiry", formatDate(license.expiry)],
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

async function logout() {
  try {
    await fetch("/admin-logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (_error) {
    // Ignore transient logout failures and clear the local state anyway.
  }

  redirectToLogin();
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view-license]");
  const revokeButton = event.target.closest("[data-revoke-license]");
  const closeButton = event.target.closest("[data-close-drawer]");

  if (viewButton) {
    openDrawer(viewButton.getAttribute("data-view-license"));
  }

  if (revokeButton) {
    revokeLicense(revokeButton.getAttribute("data-revoke-license"));
  }

  if (closeButton) {
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

elements.refreshButton.addEventListener("click", loadDashboard);
elements.validateForm.addEventListener("submit", runValidation);
elements.copyLicenseKey.addEventListener("click", copySelectedLicense);
elements.logoutButton.addEventListener("click", logout);

loadDashboard();
