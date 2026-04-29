import fetch from "node-fetch";

const PADDLE_API_VERSION = "1";

async function parseJson(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  return JSON.parse(text);
}

function getPaddleBaseUrl(apiKey) {
  return apiKey.includes("_sdbx_")
    ? "https://sandbox-api.paddle.com"
    : "https://api.paddle.com";
}

function getPaddleHeaders(apiKey) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "Paddle-Version": PADDLE_API_VERSION,
  };
}

function getErrorMessage(payload, fallbackMessage) {
  const detail = payload?.error?.detail;
  const firstError = Array.isArray(payload?.errors) ? payload.errors[0] : null;
  const firstMessage = firstError?.detail || firstError?.message;

  return detail || firstMessage || fallbackMessage;
}

function createPaddleError(statusCode, payload, fallbackMessage) {
  const error = new Error(getErrorMessage(payload, fallbackMessage));
  error.statusCode = statusCode;
  error.payload = payload;
  return error;
}

function getProductNameFromTransaction(transaction) {
  return (
    transaction?.custom_data?.productName ||
    transaction?.custom_data?.product_name ||
    transaction?.items?.[0]?.product?.name ||
    transaction?.items?.[0]?.price?.name ||
    null
  );
}

function getEmailFromTransaction(transaction) {
  return (
    transaction?.customer?.email ||
    transaction?.custom_data?.email ||
    transaction?.checkout?.customer?.email ||
    null
  );
}

export async function getTransaction(transactionId, apiKey) {
  const baseUrl = getPaddleBaseUrl(apiKey);
  const response = await fetch(
    `${baseUrl}/transactions/${transactionId}?include=customer`,
    {
      method: "GET",
      headers: getPaddleHeaders(apiKey),
    },
  );

  const payload = await parseJson(response);

  if (!response.ok) {
    throw createPaddleError(
      502,
      payload,
      `Paddle transaction lookup failed (${response.status})`,
    );
  }

  return payload?.data ?? null;
}

export async function listTransactions({
  apiKey,
  perPage = 30,
}) {
  const baseUrl = getPaddleBaseUrl(apiKey);
  const response = await fetch(
    `${baseUrl}/transactions?status=completed&per_page=${perPage}&include=customer`,
    {
      method: "GET",
      headers: getPaddleHeaders(apiKey),
    },
  );

  const payload = await parseJson(response);

  if (!response.ok) {
    throw createPaddleError(
      502,
      payload,
      `Paddle list transactions failed (${response.status})`,
    );
  }

  const transactions = Array.isArray(payload?.data) ? payload.data : [];

  return transactions.map((transaction) => ({
    id: transaction?.id ?? null,
    status: transaction?.status ?? null,
    currency:
      transaction?.details?.totals?.currency_code ||
      transaction?.currency_code ||
      "USD",
    amountMinor: Number(
      transaction?.details?.totals?.grand_total ??
      transaction?.details?.totals?.total ??
      0,
    ),
    productName: getProductNameFromTransaction(transaction),
    email: getEmailFromTransaction(transaction),
    billedAt: transaction?.billed_at ?? transaction?.created_at ?? null,
  }));
}

export async function listPrices({
  apiKey,
  productId,
  recurring,
  perPage = 50,
}) {
  const baseUrl = getPaddleBaseUrl(apiKey);
  const params = new URLSearchParams({
    product_id: productId,
    status: "active",
    per_page: String(perPage),
  });

  if (typeof recurring === "boolean") {
    params.set("recurring", recurring ? "true" : "false");
  }

  const response = await fetch(`${baseUrl}/prices?${params.toString()}`, {
    method: "GET",
    headers: getPaddleHeaders(apiKey),
  });

  const payload = await parseJson(response);

  if (!response.ok) {
    throw createPaddleError(
      502,
      payload,
      `Paddle list prices failed (${response.status})`,
    );
  }

  const prices = Array.isArray(payload?.data) ? payload.data : [];

  return prices.map((price) => ({
    id: price?.id ?? null,
    productId: price?.product_id ?? null,
    name: price?.name ?? null,
    description: price?.description ?? null,
    status: price?.status ?? null,
    recurring: Boolean(price?.billing_cycle),
    billingCycle: price?.billing_cycle ?? null,
    unitPrice: price?.unit_price ?? null,
  }));
}

export async function getCheckoutPrice({
  apiKey,
  productId,
  plan,
}) {
  const wantsRecurring = plan === "yearly";
  const prices = await listPrices({
    apiKey,
    productId,
    recurring: wantsRecurring,
    perPage: 100,
  });

  const price =
    prices.find((entry) => entry.recurring === wantsRecurring) ?? prices[0] ?? null;

  if (!price?.id) {
    const error = new Error(
      `No active Paddle price found for ${plan} product ${productId}.`,
    );
    error.statusCode = 502;
    throw error;
  }

  return price;
}

export async function createCheckoutTransaction({
  apiKey,
  priceId,
  email,
  product,
  plan,
  productName,
}) {
  const baseUrl = getPaddleBaseUrl(apiKey);
  const customData = {
    product,
    plan,
    productName,
  };

  if (email) {
    customData.email = email;
  }

  const response = await fetch(`${baseUrl}/transactions`, {
    method: "POST",
    headers: {
      ...getPaddleHeaders(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      collection_mode: "automatic",
      items: [
        {
          price_id: priceId,
          quantity: 1,
        },
      ],
      custom_data: customData,
    }),
  });

  const payload = await parseJson(response);

  if (!response.ok) {
    throw createPaddleError(
      502,
      payload,
      `Paddle create transaction failed (${response.status})`,
    );
  }

  const transaction = payload?.data ?? {};

  return {
    id: transaction?.id ?? null,
    status: transaction?.status ?? null,
    checkoutUrl: transaction?.checkout?.url ?? null,
    billedAt: transaction?.billed_at ?? null,
    priceId,
  };
}

export async function extractWebhookPurchase(payload, paddleApiKey) {
  if (payload?.email && payload?.productName) {
    return {
      email: payload.email,
      productName: payload.productName,
      transactionId: null,
      source: "test",
    };
  }

  if (payload?.event_type && payload.event_type !== "transaction.completed") {
    return {
      ignored: true,
      reason: `Ignoring unsupported event: ${payload.event_type}`,
    };
  }

  const transaction = payload?.data ?? payload ?? {};
  const transactionId = transaction?.id ?? null;

  let email = getEmailFromTransaction(transaction);
  let productName = getProductNameFromTransaction(transaction);

  if ((!email || !productName) && transactionId) {
    const fullTransaction = await getTransaction(transactionId, paddleApiKey);

    email ||= getEmailFromTransaction(fullTransaction);
    productName ||= getProductNameFromTransaction(fullTransaction);
  }

  if (!email || !productName) {
    const error = new Error(
      "Unable to extract email and productName from webhook payload.",
    );
    error.statusCode = 400;
    throw error;
  }

  return {
    email,
    productName,
    transactionId,
    source: payload?.event_type ? "webhook" : "direct",
  };
}
