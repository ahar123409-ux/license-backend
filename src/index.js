import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { config } from "./config.js";
import {
  createLicense,
  listLicenses,
  revokeLicense,
  validateLicense,
} from "./services/keygen.js";
import {
  getActivitySnapshot,
  recordValidationEvent,
  recordWebhookEvent,
} from "./services/activity.js";
import { getDashboardStats } from "./services/dashboard.js";
import { extractWebhookPurchase } from "./services/paddle.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminDir = path.resolve(__dirname, "../public/admin");

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function parseProductName(productName) {
  if (typeof productName !== "string" || !productName.trim()) {
    throw new HttpError(400, "productName must be a non-empty string.");
  }

  const parts = productName.trim().split("-");

  if (parts.length < 2) {
    throw new HttpError(
      400,
      "productName must look like extension-name-yearly or extension-name-lifetime.",
    );
  }

  const plan = parts.at(-1).toLowerCase();

  if (plan !== "yearly" && plan !== "lifetime") {
    throw new HttpError(
      400,
      "productName must end with yearly or lifetime.",
    );
  }

  const product = parts.slice(0, -1).join("-");

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

function parseBasicAuthorizationHeader(headerValue) {
  if (!headerValue || !headerValue.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = Buffer.from(headerValue.slice(6), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex === -1) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

function safeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ""), "utf8");
  const rightBuffer = Buffer.from(String(right ?? ""), "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function requireAdminAuth(req, res, next) {
  const credentials = parseBasicAuthorizationHeader(req.headers.authorization);
  const usernameMatches = safeEquals(
    credentials?.username,
    config.adminUsername,
  );
  const passwordMatches = safeEquals(
    credentials?.password,
    config.adminPassword,
  );

  if (usernameMatches && passwordMatches) {
    next();
    return;
  }

  res.setHeader("WWW-Authenticate", 'Basic realm="License Admin"');
  res.status(401).json({
    ok: false,
    error: "Authentication required.",
  });
}

async function safeTrack(action, payload) {
  try {
    await action(payload);
  } catch (error) {
    console.error("[activity]", error.message);
  }
}

async function sendPublicAsset(res, filename, contentType) {
  const content = await readFile(
    new URL(`../public/${filename}`, import.meta.url),
    "utf8",
  );

  res.setHeader("Content-Type", contentType);
  res.send(content);
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
app.use("/admin", requireAdminAuth);
app.use("/licenses", requireAdminAuth);
app.use("/stats", requireAdminAuth);
app.use("/activity", requireAdminAuth);
app.use("/admin", express.static(adminDir));

app.get("/admin", async (_req, res, next) => {
  try {
    await sendPublicAsset(
      res,
      "admin/index.html",
      "text/html; charset=utf-8",
    );
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

app.get("/licenses", async (req, res, next) => {
  try {
    const search = String(req.query?.search || "").trim().toLowerCase();
    const statusFilter = String(req.query?.status || "all").trim().toUpperCase();

    let licenses = await listLicenses({
      accountId: config.keygenAccountId,
      apiKey: config.keygenApiKey,
      limit: 100,
    });

    if (search) {
      licenses = licenses.filter((license) =>
        [
          license.licenseKey,
          license.product,
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

    res.json({
      data: licenses,
      total: licenses.length,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/stats", async (_req, res, next) => {
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

app.get("/activity", async (_req, res, next) => {
  try {
    const activity = await getActivitySnapshot(24);

    res.json(activity);
  } catch (error) {
    next(error);
  }
});

app.post("/webhook", async (req, res, next) => {
  try {
    const purchase = await extractWebhookPurchase(req.body, config.paddleApiKey);

    if (purchase.ignored) {
      console.log(`[webhook] ${purchase.reason}`);

      await safeTrack(recordWebhookEvent, {
        email: null,
        productName: null,
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
    next(error);
  }
});

app.post("/validate", async (req, res, next) => {
  try {
    const { licenseKey, product } = req.body ?? {};

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

    await safeTrack(recordValidationEvent, {
      licenseKey,
      product,
      valid: result.valid,
      status: result.status,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/licenses/revoke", async (req, res, next) => {
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
