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
    const error = new Error(
      `Paddle transaction lookup failed (${response.status})`,
    );
    error.statusCode = 502;
    throw error;
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
    const error = new Error(
      `Paddle list transactions failed (${response.status})`,
    );
    error.statusCode = 502;
    throw error;
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
