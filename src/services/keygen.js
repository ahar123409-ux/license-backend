import fetch from "node-fetch";

const KEYGEN_BASE_URL = "https://api.keygen.sh";
const JSON_API_HEADERS = {
  Accept: "application/vnd.api+json",
  "Content-Type": "application/vnd.api+json",
};

function getErrorMessage(payload) {
  if (payload?.errors?.length) {
    return payload.errors
      .map((error) => error.detail || error.title || error.code)
      .filter(Boolean)
      .join("; ");
  }

  if (payload?.meta?.detail) {
    return payload.meta.detail;
  }

  return "Unknown upstream error";
}

async function parseJson(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  return JSON.parse(text);
}

function getKeygenHeaders(apiKey) {
  return {
    ...JSON_API_HEADERS,
    Authorization: `Bearer ${apiKey}`,
  };
}

function canonicalizeProductName(name) {
  if (typeof name !== "string") {
    return null;
  }

  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[_-]+/gu, "-")
    .replace(/\s+/gu, " ")
    .replace(/-(yearly|lifetime)$/u, "")
    .trim();

  if (!normalized) {
    return null;
  }

  if (
    normalized === "chrome extension" ||
    normalized === "chrome-extension"
  ) {
    return "chrome-extension";
  }

  return normalized.replace(/\s+/gu, "-");
}

function normalizeProductName(name) {
  return canonicalizeProductName(name);
}

function getLicenseStatus(attributes = {}) {
  const rawStatus = String(attributes?.status || "").trim().toUpperCase();
  const expiry = attributes?.expiry ? Date.parse(attributes.expiry) : NaN;

  if (Number.isFinite(expiry) && expiry < Date.now()) {
    return "EXPIRED";
  }

  return rawStatus || "ACTIVE";
}

function mapLicenseRecord(record = {}) {
  const attributes = record?.attributes ?? {};
  const metadata = attributes?.metadata ?? {};
  const expiry = attributes?.expiry ?? null;
  const policyId = record?.relationships?.policy?.data?.id ?? null;

  return {
    id: record?.id ?? null,
    licenseKey: attributes?.key ?? null,
    keySuffix: attributes?.key ? attributes.key.slice(-8) : null,
    product: canonicalizeProductName(metadata?.product) ?? "unknown-product",
    plan: expiry ? "Yearly" : "Lifetime",
    email: metadata?.email ?? null,
    status: getLicenseStatus(attributes),
    expiry,
    createdAt: attributes?.created ?? attributes?.createdAt ?? null,
    updatedAt: attributes?.updated ?? attributes?.updatedAt ?? null,
    policyId,
    metadata,
  };
}

export async function createLicense({
  accountId,
  apiKey,
  email,
  product,
  policyId,
}) {
  const response = await fetch(
    `${KEYGEN_BASE_URL}/v1/accounts/${accountId}/licenses`,
    {
      method: "POST",
      headers: getKeygenHeaders(apiKey),
      body: JSON.stringify({
        data: {
          type: "licenses",
          attributes: {
            metadata: {
              email,
              product,
            },
          },
          relationships: {
            policy: {
              data: {
                type: "policies",
                id: policyId,
              },
            },
          },
        },
      }),
    },
  );

  const payload = await parseJson(response);

  if (!response.ok) {
    const error = new Error(
      `Keygen create license failed (${response.status}): ${getErrorMessage(payload)}`,
    );
    error.statusCode = 502;
    throw error;
  }

  return {
    id: payload?.data?.id ?? null,
    key: payload?.data?.attributes?.key ?? null,
    expiry: payload?.data?.attributes?.expiry ?? null,
    status: getLicenseStatus(payload?.data?.attributes),
    metadata: payload?.data?.attributes?.metadata ?? {},
  };
}

export async function listLicenses({
  accountId,
  apiKey,
  limit = 100,
}) {
  const response = await fetch(
    `${KEYGEN_BASE_URL}/v1/accounts/${accountId}/licenses?limit=${limit}`,
    {
      method: "GET",
      headers: getKeygenHeaders(apiKey),
    },
  );

  const payload = await parseJson(response);

  if (!response.ok) {
    const error = new Error(
      `Keygen list licenses failed (${response.status}): ${getErrorMessage(payload)}`,
    );
    error.statusCode = 502;
    throw error;
  }

  return Array.isArray(payload?.data)
    ? payload.data.map(mapLicenseRecord)
    : [];
}

export async function revokeLicense({
  accountId,
  apiKey,
  licenseId,
}) {
  const response = await fetch(
    `${KEYGEN_BASE_URL}/v1/accounts/${accountId}/licenses/${licenseId}/actions/revoke`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  if (response.status === 204) {
    return { ok: true, licenseId };
  }

  const payload = await parseJson(response);

  if (!response.ok) {
    const error = new Error(
      `Keygen revoke license failed (${response.status}): ${getErrorMessage(payload)}`,
    );
    error.statusCode = 502;
    throw error;
  }

  return { ok: true, licenseId };
}

export async function renewLicense({
  accountId,
  apiKey,
  licenseId,
}) {
  const response = await fetch(
    `${KEYGEN_BASE_URL}/v1/accounts/${accountId}/licenses/${licenseId}/actions/renew`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  const payload = await parseJson(response);

  if (!response.ok) {
    const error = new Error(
      `Keygen renew license failed (${response.status}): ${getErrorMessage(payload)}`,
    );
    error.statusCode = 502;
    throw error;
  }

  return mapLicenseRecord(payload?.data);
}

export async function changeLicensePolicy({
  accountId,
  apiKey,
  licenseId,
  policyId,
}) {
  const response = await fetch(
    `${KEYGEN_BASE_URL}/v1/accounts/${accountId}/licenses/${licenseId}/policy`,
    {
      method: "PUT",
      headers: getKeygenHeaders(apiKey),
      body: JSON.stringify({
        data: {
          type: "policies",
          id: policyId,
        },
      }),
    },
  );

  const payload = await parseJson(response);

  if (!response.ok) {
    const error = new Error(
      `Keygen change policy failed (${response.status}): ${getErrorMessage(payload)}`,
    );
    error.statusCode = 502;
    throw error;
  }

  return mapLicenseRecord(payload?.data);
}

export async function validateLicense({
  accountId,
  apiKey,
  licenseKey,
  product,
}) {
  const response = await fetch(
    `${KEYGEN_BASE_URL}/v1/accounts/${accountId}/licenses/actions/validate-key`,
    {
      method: "POST",
      headers: getKeygenHeaders(apiKey),
      body: JSON.stringify({
        meta: {
          key: licenseKey,
        },
      }),
    },
  );

  const payload = await parseJson(response);

  if (!response.ok) {
    if (response.status >= 400 && response.status < 500) {
      return {
        valid: false,
        product,
        expiry: null,
        status:
          payload?.meta?.code ||
          payload?.errors?.[0]?.code ||
          payload?.errors?.[0]?.title ||
          "INVALID",
      };
    }

    const error = new Error(
      `Keygen validate license failed (${response.status}): ${getErrorMessage(payload)}`,
    );
    error.statusCode = 502;
    throw error;
  }

  const validFromKeygen = Boolean(payload?.meta?.valid);
  const licenseAttributes = payload?.data?.attributes ?? {};
  const metadataProduct = licenseAttributes?.metadata?.product;
  const validationCode = payload?.meta?.code;
  const normalizedMetadataProduct = normalizeProductName(metadataProduct);
  const normalizedRequestedProduct = normalizeProductName(product);
  const matchesProduct =
    !normalizedMetadataProduct ||
    !normalizedRequestedProduct ||
    normalizedMetadataProduct === normalizedRequestedProduct;
  const normalizedStatus = getLicenseStatus(licenseAttributes);

  return {
    valid: validFromKeygen && matchesProduct,
    product,
    expiry: licenseAttributes?.expiry ?? null,
    status: !validFromKeygen
      ? validationCode || licenseAttributes?.status || "INVALID"
      : !matchesProduct
        ? "PRODUCT_MISMATCH"
        : normalizedStatus,
  };
}
