import { getActivitySnapshot } from "./activity.js";
import { listLicenses } from "./keygen.js";
import { listTransactions } from "./paddle.js";

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

function formatCurrencyFromMinorUnits(amountMinor, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format((amountMinor || 0) / 100);
}

function buildProductStats(licenses) {
  const products = new Map();

  for (const license of licenses) {
    const productName = license?.product || "unknown-product";
    const current = products.get(productName) || {
      name: productName,
      totalLicenses: 0,
      activeLicenses: 0,
      expiredLicenses: 0,
      latestExpiry: null,
    };

    current.totalLicenses += 1;

    if (isExpiredLicense(license)) {
      current.expiredLicenses += 1;
    } else {
      current.activeLicenses += 1;
    }

    if (
      license?.expiry &&
      (!current.latestExpiry || license.expiry > current.latestExpiry)
    ) {
      current.latestExpiry = license.expiry;
    }

    products.set(productName, current);
  }

  return [...products.values()].sort(
    (left, right) => right.totalLicenses - left.totalLicenses,
  );
}

function buildRevenueSummary(transactions) {
  const totalsByCurrency = new Map();

  for (const transaction of transactions) {
    const amountMinor = Number(transaction?.amountMinor ?? 0);
    const currency = transaction?.currency || "USD";
    const current = totalsByCurrency.get(currency) || 0;

    totalsByCurrency.set(currency, current + amountMinor);
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
        : breakdown.map((entry) => entry.display).join(" · "),
  };
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
      limit: 100,
    }),
    getActivitySnapshot(10),
  ]);

  const expiredLicenses = licenses.filter(isExpiredLicense).length;
  const activeLicenses = licenses.length - expiredLicenses;
  const products = buildProductStats(licenses);

  let revenue = {
    totalTransactions: 0,
    breakdown: [],
    display: "Unavailable",
    available: false,
    error: null,
  };

  try {
    const transactions = await listTransactions({
      apiKey: paddleApiKey,
      perPage: 30,
    });

    revenue = {
      ...buildRevenueSummary(transactions),
      available: true,
      error: null,
    };
  } catch (error) {
    revenue = {
      ...revenue,
      error: error.message,
    };
  }

  return {
    overview: {
      totalLicenses: licenses.length,
      activeLicenses,
      expiredLicenses,
      revenueDisplay: revenue.display,
    },
    revenue,
    products,
    activity,
    refreshedAt: new Date().toISOString(),
  };
}
