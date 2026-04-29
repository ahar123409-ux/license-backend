import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { config } from "./config.js";
import {
  changeLicensePolicy,
  createLicense,
  listLicenses,
  revokeLicense,
  renewLicense,
  validateLicense,
} from "./services/keygen.js";
import {
  getActivitySnapshot,
  recordValidationEvent,
  recordWebhookEvent,
} from "./services/activity.js";
import {
  clearAdminSession,
  createAdminSession,
  isAdminPasswordValid,
  requireAdminSession,
} from "./services/adminAuth.js";
import { getDashboardStats } from "./services/dashboard.js";
import { buildLicenseCsvReport } from "./services/reports.js";
import {
  createCheckoutTransaction,
  extractWebhookPurchase,
  getCheckoutPrice,
} from "./services/paddle.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminDir = path.resolve(__dirname, "../public/admin");
const checkoutDir = path.resolve(__dirname, "../public/checkout");

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const CANONICAL_PRODUCT_ALIASES = new Map([
  ["chrome extension", "chrome-extension"],
  ["chrome-extension", "chrome-extension"],
]);

function canonicalizeProductName(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();

  if (!normalizedValue) {
    return null;
  }

  return (
    CANONICAL_PRODUCT_ALIASES.get(normalizedValue) ||
    normalizedValue.replace(/\s+/gu, "-")
  );
}

function parseProductName(productName) {
  if (typeof productName !== "string" || !productName.trim()) {
    throw new HttpError(400, "productName must be a non-empty string.");
  }

  const normalizedName = productName
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .replace(/[_-]+/gu, "-");
  const yearlyMatch = normalizedName.match(/(?:^|[\s-])(yearly)$/u);
  const lifetimeMatch = normalizedName.match(/(?:^|[\s-])(lifetime)$/u);
  const plan = yearlyMatch
    ? "yearly"
    : lifetimeMatch
      ? "lifetime"
      : null;

  if (!plan) {
    throw new HttpError(
      400,
      "productName must end with yearly or lifetime.",
    );
  }

  const rawProduct = normalizedName
    .replace(/(?:^|[\s-])(yearly|lifetime)$/u, "")
    .replace(/[\s-]+$/u, "")
    .trim();

  if (!rawProduct) {
    throw new HttpError(400, "productName is missing the product portion.");
  }

  const product = canonicalizeProductName(rawProduct);

  if (!product) {
    throw new HttpError(400, "productName is missing the product portion.");
  }

  return { product, plan };
}

function getPolicyId(plan) {
  return plan === "yearly"
    ? config.yearlyPolicyId
    : config.lifetimePolicyId;
}

function getCheckoutProductId(plan) {
  const productId = plan === "yearly"
    ? config.yearlyProductId
    : config.lifetimeProductId;

  if (!productId) {
    throw new HttpError(
      500,
      `Missing Paddle product ID for ${plan} checkout. Update your environment variables first.`,
    );
  }

  return productId;
}

function normalizePlan(plan) {
  if (typeof plan !== "string") {
    return null;
  }

  const normalized = plan.trim().toLowerCase();

  return normalized === "yearly" || normalized === "lifetime"
    ? normalized
    : null;
}

function isPlanCompatible(plan, expiry) {
  if (plan === "lifetime") {
    return expiry === null;
  }

  if (plan === "yearly") {
    return expiry !== null;
  }

  return true;
}

function normalizeCheckoutProduct(product) {
  if (typeof product !== "string" || !product.trim()) {
    throw new HttpError(400, "product must be a non-empty string.");
  }

  const canonicalProduct = canonicalizeProductName(
    product.trim().replace(/-(yearly|lifetime)$/u, ""),
  );

  if (!canonicalProduct) {
    throw new HttpError(400, "product must be a non-empty string.");
  }

  return canonicalProduct;
}

function buildProductName(product, plan) {
  return `${product}-${plan}`;
}

function getRequestOrigin(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = forwardedHost || req.headers.host;
  const proto = forwardedProto
    ? String(forwardedProto).split(",")[0].trim()
    : "http";

  if (!host) {
    return null;
  }

  return `${proto}://${host}`;
}

async function safeTrack(action, payload) {
  try {
    await action(payload);
  } catch (error) {
    console.error("[activity]", error.message);
  }
}

const app = express();

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    console.log(
      `[request] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - startedAt}ms`,
    );
  });

  next();
});

app.use(express.json({ limit: "1mb" }));
app.use("/admin", express.static(adminDir));
app.use("/checkout", express.static(checkoutDir));

app.post("/admin-login", async (req, res, next) => {
  try {
    const password = req.body?.password;

    if (!isAdminPasswordValid(password, config.adminPassword)) {
      clearAdminSession(req, res);
      res.json({ success: false });
      return;
    }

    createAdminSession(res);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post("/admin-logout", async (req, res, next) => {
  try {
    clearAdminSession(req, res);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "paddle-keygen-backend",
  });
});

app.get("/checkout-config", (_req, res) => {
  res.json({
    ok: true,
    environment: config.paddleEnvironment,
    clientToken: config.paddleClientToken,
    ready: Boolean(config.paddleClientToken),
  });
});

app.post("/create-checkout", async (req, res, next) => {
  try {
    const normalizedPlan = normalizePlan(req.body?.plan);

    if (!normalizedPlan) {
      throw new HttpError(400, "plan must be yearly or lifetime.");
    }

    const product = normalizeCheckoutProduct(req.body?.product);
    const email = typeof req.body?.email === "string"
      ? req.body.email.trim()
      : "";
    const productName = buildProductName(product, normalizedPlan);
    const productId = getCheckoutProductId(normalizedPlan);

    console.log(
      `[checkout] Creating ${normalizedPlan} Paddle transaction for ${productName}`,
    );

    const price = await getCheckoutPrice({
      apiKey: config.paddleApiKey,
      productId,
      plan: normalizedPlan,
    });

    const transaction = await createCheckoutTransaction({
      apiKey: config.paddleApiKey,
      priceId: price.id,
      email,
      product,
      plan: normalizedPlan,
      productName,
    });

    const origin = getRequestOrigin(req);
    const checkoutPageUrl = origin
      ? `${origin}/checkout/?transactionId=${encodeURIComponent(transaction.id)}`
      : null;

    res.json({
      ok: true,
      product,
      plan: normalizedPlan,
      productName,
      productId,
      priceId: price.id,
      transactionId: transaction.id,
      checkoutUrl: transaction.checkoutUrl,
      checkoutPageUrl,
      requiresClientToken: !config.paddleClientToken,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/licenses", requireAdminSession, async (req, res, next) => {
  try {
    const search = String(req.query?.search || "").trim().toLowerCase();
    const statusFilter = String(req.query?.status || "all").trim().toUpperCase();
    const productFilter = canonicalizeProductName(req.query?.product);
    const planFilter = normalizePlan(req.query?.plan);

    let licenses = await listLicenses({
      accountId: config.keygenAccountId,
      apiKey: config.keygenApiKey,
      limit: 250,
    });

    if (search) {
      licenses = licenses.filter((license) =>
        [
          license.licenseKey,
          license.product,
          license.plan,
          license.email,
          license.status,
        ]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(search)),
      );
    }

    if (statusFilter !== "ALL") {
      licenses = licenses.filter((license) => license.status === statusFilter);
    }

    if (productFilter) {
      licenses = licenses.filter((license) => license.product === productFilter);
    }

    if (planFilter) {
      licenses = licenses.filter(
        (license) => normalizePlan(license.plan) === planFilter,
      );
    }

    res.json({
      data: licenses,
      total: licenses.length,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/stats", requireAdminSession, async (_req, res, next) => {
  try {
    const stats = await getDashboardStats({
      keygenAccountId: config.keygenAccountId,
      keygenApiKey: config.keygenApiKey,
      paddleApiKey: config.paddleApiKey,
    });

    res.json(stats);
  } catch (error) {
    next(error);
  }
});

app.get("/activity", requireAdminSession, async (_req, res, next) => {
  try {
    const activity = await getActivitySnapshot(24);

    res.json(activity);
  } catch (error) {
    next(error);
  }
});

app.get("/reports/export", requireAdminSession, async (_req, res, next) => {
  try {
    const licenses = await listLicenses({
      accountId: config.keygenAccountId,
      apiKey: config.keygenApiKey,
      limit: 250,
    });
    const report = buildLicenseCsvReport(licenses);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="license-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(report);
  } catch (error) {
    next(error);
  }
});

app.post("/webhook", async (req, res, next) => {
  try {
    const purchase = await extractWebhookPurchase(req.body, config.paddleApiKey);
    const eventType = req.body?.event_type || "transaction.completed";

    if (purchase.ignored) {
      console.log(`[webhook] ${purchase.reason}`);

      await safeTrack(recordWebhookEvent, {
        email: null,
        productName: null,
        eventType,
        source: "webhook",
        transactionId: req.body?.data?.id ?? null,
        outcome: "IGNORED",
        status: purchase.reason,
      });

      return res.status(202).json({
        received: true,
        ignored: true,
        reason: purchase.reason,
      });
    }
    const { email, productName, transactionId, source } = purchase;
    const { product, plan } = parseProductName(productName);
    const policyId = getPolicyId(plan);

    console.log(
      `[webhook] Creating ${plan} license for ${email} (${product})`,
    );

    const license = await createLicense({
      accountId: config.keygenAccountId,
      apiKey: config.keygenApiKey,
      email,
      product,
      policyId,
    });

    await safeTrack(recordWebhookEvent, {
      email,
      productName,
      eventType,
      source,
      transactionId,
      outcome: "LICENSE_CREATED",
      status: license.status,
    });

    res.json({
      ok: true,
      source,
      transactionId,
      email,
      product,
      plan,
      licenseId: license.id,
      licenseKey: license.key,
      expiry: license.expiry,
      status: license.status,
    });
  } catch (error) {
    await safeTrack(recordWebhookEvent, {
      email: req.body?.email ?? req.body?.data?.customer?.email ?? null,
      productName:
        req.body?.productName ??
        req.body?.data?.items?.[0]?.product?.name ??
        req.body?.data?.items?.[0]?.price?.name ??
        null,
      eventType: req.body?.event_type || "transaction.completed",
      source: req.body?.event_type ? "webhook" : "direct",
      transactionId: req.body?.data?.id ?? null,
      outcome: "FAILED",
      status: error.message,
    });
    next(error);
  }
});

app.post("/validate", async (req, res, next) => {
  try {
    const { licenseKey, product, plan } = req.body ?? {};

    if (!licenseKey || !product) {
      throw new HttpError(400, "licenseKey and product are required.");
    }

    console.log(`[validate] Validating key for product ${product}`);

    const result = await validateLicense({
      accountId: config.keygenAccountId,
      apiKey: config.keygenApiKey,
      licenseKey,
      product,
    });

    const normalizedPlan = normalizePlan(plan);

    if (
      result.valid &&
      normalizedPlan &&
      !isPlanCompatible(normalizedPlan, result.expiry)
    ) {
      const planMismatchResult = {
        valid: false,
        status: "PLAN_MISMATCH",
        message: "License type does not match plan",
      };

      await safeTrack(recordValidationEvent, {
        licenseKey,
        product,
        valid: planMismatchResult.valid,
        status: planMismatchResult.status,
      });

      res.json(planMismatchResult);
      return;
    }

    await safeTrack(recordValidationEvent, {
      licenseKey,
      product,
      valid: result.valid,
      status: result.status,
    });

    res.json(result);
  } catch (error) {
    await safeTrack(recordValidationEvent, {
      licenseKey: req.body?.licenseKey,
      product: req.body?.product,
      valid: false,
      status: error.statusCode === 400 ? "BAD_REQUEST" : "REQUEST_ERROR",
    });
    next(error);
  }
});

app.post("/licenses/revoke", requireAdminSession, async (req, res, next) => {
  try {
    const licenseId = req.body?.licenseId;

    if (!licenseId) {
      throw new HttpError(400, "licenseId is required.");
    }

    await revokeLicense({
      accountId: config.keygenAccountId,
      apiKey: config.keygenApiKey,
      licenseId,
    });

    res.json({
      ok: true,
      licenseId,
      revoked: true,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/licenses/renew", requireAdminSession, async (req, res, next) => {
  try {
    const licenseId = req.body?.licenseId;

    if (!licenseId) {
      throw new HttpError(400, "licenseId is required.");
    }

    const license = await renewLicense({
      accountId: config.keygenAccountId,
      apiKey: config.keygenApiKey,
      licenseId,
    });

    res.json({
      ok: true,
      action: "renew",
      license,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/licenses/change-plan", requireAdminSession, async (req, res, next) => {
  try {
    const licenseId = req.body?.licenseId;
    const plan = normalizePlan(req.body?.plan);

    if (!licenseId) {
      throw new HttpError(400, "licenseId is required.");
    }

    if (!plan) {
      throw new HttpError(400, "plan must be yearly or lifetime.");
    }

    const license = await changeLicensePolicy({
      accountId: config.keygenAccountId,
      apiKey: config.keygenApiKey,
      licenseId,
      policyId: getPolicyId(plan),
    });

    res.json({
      ok: true,
      action: "change-plan",
      plan,
      license,
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;

  console.error(
    `[error] ${statusCode} ${error.message}${error.stack ? `\n${error.stack}` : ""}`,
  );

  res.status(statusCode).json({
    ok: false,
    error:
      statusCode >= 500 ? "Internal server error." : error.message,
  });
});

app.listen(config.port, () => {
  console.log(
    `[startup] Server listening on http://localhost:${config.port} in ${process.env.NODE_ENV || "development"} mode`,
  );
  console.log(
    `[startup] Admin dashboard available at http://localhost:${config.port}/admin`,
  );
});
