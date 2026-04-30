import { getActivitySnapshot } from "./activity.js";
import { listLicenses } from "./keygen.js";
import { listTransactions } from "./paddle.js";

const DAY_MS = 1000 * 60 * 60 * 24;
const RECENT_WINDOW_DAYS = 7;

function isExpiredLicense(license) {
  if (license?.status === "EXPIRED") {
    return true;
  }

  if (!license?.expiry) {
    return false;
  }

  const expiry = Date.parse(license.expiry);

  return Number.isFinite(expiry) && expiry < Date.now();
}

function isLicenseActive(license) {
  return !isExpiredLicense(license) && license?.status !== "REVOKED";
}

function normalizePlan(plan) {
  const normalized = String(plan || "").trim().toLowerCase();

  if (normalized === "yearly") {
    return "yearly";
  }

  if (normalized === "lifetime") {
    return "lifetime";
  }

  return null;
}

function inferPlanFromName(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized.includes("lifetime")) {
    return "lifetime";
  }

  if (
    normalized.includes("yearly") ||
    normalized.includes("annual") ||
    normalized.includes("subscription")
  ) {
    return "yearly";
  }

  return null;
}

function formatCurrencyFromMinorUnits(amountMinor, currency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format((amountMinor || 0) / 100);
  } catch (_error) {
    return `${currency} ${((amountMinor || 0) / 100).toFixed(2)}`;
  }
}

function formatPercentage(value) {
  const numeric = Number(value || 0);

  return `${numeric.toFixed(1)}%`;
}

function computePercentChange(current, previous) {
  if (!previous && !current) {
    return 0;
  }

  if (!previous) {
    return 100;
  }

  return ((current - previous) / previous) * 100;
}

function getPrimaryCurrency(transactions) {
  const counts = new Map();

  for (const transaction of transactions) {
    const currency = transaction?.currency || "USD";
    counts.set(currency, (counts.get(currency) || 0) + 1);
  }

  const [primaryCurrency] = [...counts.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0] || ["USD", 0];

  return primaryCurrency;
}

function getStartOfDayMs(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

function formatChartLabel(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function sortByTimestampDescending(items, getTimestamp) {
  return [...items].sort((left, right) => {
    const leftMs = Date.parse(getTimestamp(left) || "") || 0;
    const rightMs = Date.parse(getTimestamp(right) || "") || 0;

    return rightMs - leftMs;
  });
}

function buildRevenueSummary(transactions) {
  const totalsByCurrency = new Map();

  for (const transaction of transactions) {
    const amountMinor = Number(transaction?.amountMinor ?? 0);
    const currency = transaction?.currency || "USD";

    totalsByCurrency.set(currency, (totalsByCurrency.get(currency) || 0) + amountMinor);
  }

  const breakdown = [...totalsByCurrency.entries()].map(
    ([currency, amountMinor]) => ({
      currency,
      amountMinor,
      display: formatCurrencyFromMinorUnits(amountMinor, currency),
    }),
  );

  return {
    totalTransactions: transactions.length,
    breakdown,
    display: breakdown.length === 0
      ? "No transactions"
      : breakdown.length === 1
        ? breakdown[0].display
        : breakdown.map((entry) => entry.display).join(" • "),
  };
}

function buildRevenueTrend(transactions, days = RECENT_WINDOW_DAYS) {
  const primaryCurrency = getPrimaryCurrency(transactions);
  const scopedTransactions = transactions.filter(
    (transaction) => (transaction?.currency || "USD") === primaryCurrency,
  );
  const current = Array.from({ length: days }, () => 0);
  const previous = Array.from({ length: days }, () => 0);
  const todayStart = getStartOfDayMs(Date.now()) ?? Date.now();
  const currentStart = todayStart - (days - 1) * DAY_MS;
  const previousStart = currentStart - days * DAY_MS;
  const currentEnd = currentStart + days * DAY_MS;
  const previousEnd = previousStart + days * DAY_MS;

  for (const transaction of scopedTransactions) {
    const bucketTime = getStartOfDayMs(transaction?.billedAt);
    const amountMinor = Number(transaction?.amountMinor ?? 0);

    if (bucketTime === null) {
      continue;
    }

    if (bucketTime >= currentStart && bucketTime < currentEnd) {
      const index = Math.floor((bucketTime - currentStart) / DAY_MS);
      current[index] += amountMinor;
      continue;
    }

    if (bucketTime >= previousStart && bucketTime < previousEnd) {
      const index = Math.floor((bucketTime - previousStart) / DAY_MS);
      previous[index] += amountMinor;
    }
  }

  const currentTotal = current.reduce((sum, value) => sum + value, 0);
  const previousTotal = previous.reduce((sum, value) => sum + value, 0);

  return {
    currency: primaryCurrency,
    labels: Array.from({ length: days }, (_, index) =>
      formatChartLabel(currentStart + index * DAY_MS)),
    current,
    previous,
    currentDisplay: formatCurrencyFromMinorUnits(currentTotal, primaryCurrency),
    previousDisplay: formatCurrencyFromMinorUnits(previousTotal, primaryCurrency),
    deltaPercent: computePercentChange(currentTotal, previousTotal),
  };
}

function buildPlanSales(transactions, licenses) {
  const counts = {
    yearly: 0,
    lifetime: 0,
  };

  for (const transaction of transactions) {
    const plan = inferPlanFromName(transaction?.productName);

    if (plan) {
      counts[plan] += 1;
    }
  }

  if (!counts.yearly && !counts.lifetime) {
    for (const license of licenses) {
      const plan = normalizePlan(license?.plan);

      if (plan) {
        counts[plan] += 1;
      }
    }
  }

  const total = counts.yearly + counts.lifetime;
  const items = [
    {
      key: "lifetime",
      label: "Lifetime",
      count: counts.lifetime,
      share: total ? counts.lifetime / total : 0,
    },
    {
      key: "yearly",
      label: "Yearly",
      count: counts.yearly,
      share: total ? counts.yearly / total : 0,
    },
  ];

  return {
    total,
    items,
  };
}

function buildProductStats(licenses) {
  const products = new Map();

  for (const license of licenses) {
    const productName = license?.product || "unknown-product";
    const plan = normalizePlan(license?.plan);
    const current = products.get(productName) || {
      name: productName,
      totalLicenses: 0,
      activeLicenses: 0,
      expiredLicenses: 0,
      yearlyLicenses: 0,
      lifetimeLicenses: 0,
      latestExpiry: null,
      uniqueCustomers: new Set(),
    };

    current.totalLicenses += 1;

    if (isExpiredLicense(license)) {
      current.expiredLicenses += 1;
    } else {
      current.activeLicenses += 1;
    }

    if (plan === "yearly") {
      current.yearlyLicenses += 1;
    }

    if (plan === "lifetime") {
      current.lifetimeLicenses += 1;
    }

    if (license?.email) {
      current.uniqueCustomers.add(license.email);
    }

    if (
      license?.expiry &&
      (!current.latestExpiry || license.expiry > current.latestExpiry)
    ) {
      current.latestExpiry = license.expiry;
    }

    products.set(productName, current);
  }

  return [...products.values()]
    .map((product) => ({
      ...product,
      uniqueCustomers: product.uniqueCustomers.size,
    }))
    .sort((left, right) => right.totalLicenses - left.totalLicenses);
}

function buildCustomerStats(licenses) {
  const customers = new Map();

  for (const license of licenses) {
    const email = license?.email;

    if (!email) {
      continue;
    }

    const current = customers.get(email) || {
      email,
      licenses: 0,
      activeLicenses: 0,
      lifetimeLicenses: 0,
      yearlyLicenses: 0,
      products: new Set(),
      latestExpiry: null,
    };

    current.licenses += 1;

    if (isLicenseActive(license)) {
      current.activeLicenses += 1;
    }

    if (normalizePlan(license?.plan) === "lifetime") {
      current.lifetimeLicenses += 1;
    } else {
      current.yearlyLicenses += 1;
    }

    if (license?.product) {
      current.products.add(license.product);
    }

    if (
      license?.expiry &&
      (!current.latestExpiry || license.expiry > current.latestExpiry)
    ) {
      current.latestExpiry = license.expiry;
    }

    customers.set(email, current);
  }

  return [...customers.values()]
    .map((customer) => ({
      ...customer,
      products: [...customer.products],
    }))
    .sort((left, right) => {
      if (right.licenses !== left.licenses) {
        return right.licenses - left.licenses;
      }

      return left.email.localeCompare(right.email);
    });
}

function buildRecentLicenses(licenses, limit = 6) {
  return sortByTimestampDescending(
    licenses,
    (license) => license?.createdAt || license?.updatedAt,
  )
    .slice(0, limit)
    .map((license) => ({
      id: license.id,
      licenseKey: license.licenseKey,
      email: license.email,
      product: license.product,
      plan: license.plan,
      status: license.status,
      expiry: license.expiry,
      createdAt: license.createdAt,
    }));
}

function isValidationFailure(entry) {
  return entry?.valid === false;
}

function isWebhookFailure(entry) {
  const status = String(entry?.status || "").toUpperCase();
  const outcome = String(entry?.outcome || "").toUpperCase();

  return (
    outcome.includes("FAIL") ||
    outcome.includes("ERROR") ||
    status.includes("FAIL") ||
    status.includes("ERROR")
  );
}

function buildRecentActivity(activity) {
  const items = [
    ...activity.validations.map((entry) => ({
      id: entry.id,
      timestamp: entry.timestamp,
      tone: entry.valid ? "success" : "danger",
      title: entry.valid ? "Validation success" : "Validation failed",
      subtitle: `${entry.product || "unknown-product"} • key ${entry.keySuffix || "n/a"}`,
      meta: entry.status || "UNKNOWN",
      kind: "validation",
    })),
    ...activity.webhooks.map((entry) => ({
      id: entry.id,
      timestamp: entry.timestamp,
      tone: isWebhookFailure(entry)
        ? "danger"
        : entry.outcome === "IGNORED"
          ? "warning"
          : "success",
      title: entry.outcome === "LICENSE_CREATED"
        ? "License issued"
        : entry.outcome === "IGNORED"
          ? "Webhook ignored"
          : entry.outcome || "Webhook processed",
      subtitle: [
        entry.productName || "No product",
        entry.email || entry.transactionId || "No customer",
      ].join(" • "),
      meta: entry.eventType || entry.source || "webhook",
      kind: "webhook",
    })),
  ];

  return sortByTimestampDescending(items, (entry) => entry.timestamp).slice(0, 6);
}

function buildRecentWebhookTable(webhooks, limit = 5) {
  return sortByTimestampDescending(webhooks, (entry) => entry.timestamp)
    .slice(0, limit)
    .map((entry) => ({
      id: entry.id,
      eventType: entry.eventType || entry.outcome || "webhook",
      status: isWebhookFailure(entry)
        ? "FAILED"
        : entry.outcome === "IGNORED"
          ? "IGNORED"
          : "SUCCESS",
      tone: isWebhookFailure(entry)
        ? "danger"
        : entry.outcome === "IGNORED"
          ? "warning"
          : "success",
      receivedAt: entry.timestamp,
      details: entry.productName || entry.transactionId || entry.email || "Event captured",
      source: entry.source || "webhook",
    }));
}

function buildAlertSummary(licenses, activity) {
  const now = Date.now();
  const sevenDaysFromNow = now + 7 * DAY_MS;
  const expiringSoon = licenses.filter((license) => {
    if (!license?.expiry || isExpiredLicense(license)) {
      return false;
    }

    const expiry = Date.parse(license.expiry);

    return Number.isFinite(expiry) && expiry <= sevenDaysFromNow;
  }).length;
  const failedWebhooks = activity.webhooks.filter(isWebhookFailure).length;
  const failedValidations = activity.validations.filter(isValidationFailure).length;
  const suspiciousKeys = new Map();

  for (const entry of activity.validations) {
    if (!isValidationFailure(entry) || !entry?.keySuffix) {
      continue;
    }

    suspiciousKeys.set(
      entry.keySuffix,
      (suspiciousKeys.get(entry.keySuffix) || 0) + 1,
    );
  }

  const overuseSignals = [...suspiciousKeys.values()].filter((count) => count >= 3).length;

  const cards = [
    {
      id: "expiring-soon",
      title: "Expiring Soon",
      value: expiringSoon,
      description: "Licenses ending within the next 7 days",
      tone: expiringSoon ? "warning" : "success",
    },
    {
      id: "failed-webhooks",
      title: "Failed Webhooks",
      value: failedWebhooks,
      description: "Webhook deliveries or processing errors",
      tone: failedWebhooks ? "warning" : "success",
    },
    {
      id: "failed-validations",
      title: "Failed Validations",
      value: failedValidations,
      description: "Recent invalid or mismatched license checks",
      tone: failedValidations ? "danger" : "success",
    },
    {
      id: "overuse-signals",
      title: "Overuse Signals",
      value: overuseSignals,
      description: "Repeated failed checks on the same license key",
      tone: overuseSignals ? "info" : "success",
    },
  ];

  const items = [];

  if (expiringSoon) {
    items.push({
      id: "expiring-list",
      tone: "warning",
      message: `${expiringSoon} license${expiringSoon === 1 ? "" : "s"} will expire in the next 7 days`,
    });
  }

  if (failedWebhooks) {
    items.push({
      id: "webhook-list",
      tone: "danger",
      message: `${failedWebhooks} webhook event${failedWebhooks === 1 ? "" : "s"} need attention`,
    });
  }

  if (failedValidations) {
    items.push({
      id: "validation-list",
      tone: "danger",
      message: `${failedValidations} validation attempt${failedValidations === 1 ? "" : "s"} failed in recent activity`,
    });
  }

  if (overuseSignals) {
    items.push({
      id: "overuse-list",
      tone: "info",
      message: `${overuseSignals} license key${overuseSignals === 1 ? "" : "s"} showed repeated failures`,
    });
  }

  if (!items.length) {
    items.push({
      id: "healthy",
      tone: "success",
      message: "No urgent alerts in the latest dashboard snapshot",
    });
  }

  return {
    cards,
    items,
  };
}

function buildAnalytics(licenses, customers, transactions, activity, revenue) {
  const primaryCurrency = getPrimaryCurrency(transactions);
  const primaryTransactions = transactions.filter(
    (transaction) => (transaction?.currency || "USD") === primaryCurrency,
  );
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthRevenueMinor = primaryTransactions.reduce((sum, transaction) => {
    const billedAt = Date.parse(transaction?.billedAt || "");

    if (!Number.isFinite(billedAt) || billedAt < monthStart.getTime()) {
      return sum;
    }

    return sum + Number(transaction?.amountMinor ?? 0);
  }, 0);
  const validValidationCount = activity.validations.filter((entry) => entry.valid).length;
  const totalValidationCount = activity.validations.length;
  const validationSuccessRate = totalValidationCount
    ? (validValidationCount / totalValidationCount) * 100
    : 100;
  const averageOrderMinor = primaryTransactions.length
    ? Math.round(
      primaryTransactions.reduce(
        (sum, transaction) => sum + Number(transaction?.amountMinor ?? 0),
        0,
      ) / primaryTransactions.length,
    )
    : 0;
  const yearlyLicenses = licenses.filter(
    (license) => normalizePlan(license?.plan) === "yearly",
  ).length;
  const yearlyShare = licenses.length
    ? (yearlyLicenses / licenses.length) * 100
    : 0;

  return [
    {
      id: "customers",
      label: "Total Customers",
      value: customers.length.toLocaleString("en-US"),
      note: `${licenses.length.toLocaleString("en-US")} total licenses issued`,
      tone: "info",
    },
    {
      id: "month-revenue",
      label: "This Month Revenue",
      value: formatCurrencyFromMinorUnits(monthRevenueMinor, primaryCurrency),
      note: revenue.available
        ? "Completed Paddle transactions this month"
        : "Revenue sync unavailable right now",
      tone: "purple",
    },
    {
      id: "validation-rate",
      label: "Validation Success Rate",
      value: formatPercentage(validationSuccessRate),
      note: `${validValidationCount}/${totalValidationCount || 0} recent validation checks passed`,
      tone: "success",
    },
    {
      id: "avg-order",
      label: "Avg. Order Value",
      value: formatCurrencyFromMinorUnits(averageOrderMinor, primaryCurrency),
      note: `${primaryTransactions.length} completed order${primaryTransactions.length === 1 ? "" : "s"} in the current sample`,
      tone: "warning",
    },
    {
      id: "yearly-share",
      label: "Yearly License Share",
      value: formatPercentage(yearlyShare),
      note: `${yearlyLicenses} of ${licenses.length} licenses are subscription-based`,
      tone: "teal",
    },
  ];
}

export async function getDashboardStats({
  keygenAccountId,
  keygenApiKey,
  paddleApiKey,
}) {
  const [licenses, activity] = await Promise.all([
    listLicenses({
      accountId: keygenAccountId,
      apiKey: keygenApiKey,
      limit: 250,
    }),
    getActivitySnapshot(60),
  ]);

  const expiredLicenses = licenses.filter(isExpiredLicense).length;
  const activeLicenses = licenses.length - expiredLicenses;
  const products = buildProductStats(licenses);
  const customers = buildCustomerStats(licenses);
  const recentLicenses = buildRecentLicenses(licenses, 6);
  const recentActivity = buildRecentActivity(activity);
  const alerts = buildAlertSummary(licenses, activity);

  let revenue = {
    totalTransactions: 0,
    breakdown: [],
    display: "Unavailable",
    available: false,
    error: null,
    trend: buildRevenueTrend([]),
  };
  let transactions = [];

  try {
    transactions = await listTransactions({
      apiKey: paddleApiKey,
      perPage: 100,
    });

    revenue = {
      ...buildRevenueSummary(transactions),
      available: true,
      error: null,
      trend: buildRevenueTrend(transactions),
    };
  } catch (error) {
    revenue = {
      ...revenue,
      error: error.message,
    };
  }

  const planSales = buildPlanSales(transactions, licenses);
  const analytics = buildAnalytics(
    licenses,
    customers,
    transactions,
    activity,
    revenue,
  );
  const uniqueCustomers = customers.length;
  const primaryCurrency = getPrimaryCurrency(transactions);
  const currentRevenueMinor = revenue.trend.current.reduce(
    (sum, value) => sum + value,
    0,
  );
  const previousRevenueMinor = revenue.trend.previous.reduce(
    (sum, value) => sum + value,
    0,
  );
  const currentSalesCount = planSales.total;
  const previousSalesCount = Math.max(
    0,
    transactions.filter((transaction) => {
      const billedTime = getStartOfDayMs(transaction?.billedAt);
      const todayStart = getStartOfDayMs(Date.now()) ?? Date.now();
      const currentStart = todayStart - (RECENT_WINDOW_DAYS - 1) * DAY_MS;
      const previousStart = currentStart - RECENT_WINDOW_DAYS * DAY_MS;

      return billedTime !== null && billedTime >= previousStart && billedTime < currentStart;
    }).length,
  );

  return {
    overview: {
      totalLicenses: licenses.length,
      totalSales: currentSalesCount,
      activeLicenses,
      expiredLicenses,
      uniqueCustomers,
      revenueDisplay: revenue.display,
      revenueDeltaPercent: computePercentChange(
        currentRevenueMinor,
        previousRevenueMinor,
      ),
      salesDeltaPercent: computePercentChange(currentSalesCount, previousSalesCount),
      activeSharePercent: licenses.length
        ? (activeLicenses / licenses.length) * 100
        : 0,
      expiredSharePercent: licenses.length
        ? (expiredLicenses / licenses.length) * 100
        : 0,
      customerCoveragePercent: licenses.length
        ? (uniqueCustomers / licenses.length) * 100
        : 0,
      primaryCurrency,
    },
    revenue,
    planSales,
    products,
    customers: customers.slice(0, 6),
    recentLicenses,
    recentWebhooks: buildRecentWebhookTable(activity.webhooks, 5),
    activity: {
      validations: activity.validations,
      webhooks: activity.webhooks,
      recent: recentActivity,
    },
    alerts,
    analytics,
    refreshedAt: new Date().toISOString(),
  };
}
