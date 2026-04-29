function escapeCsvValue(value) {
  const normalized = String(value ?? "");

  if (
    normalized.includes(",") ||
    normalized.includes('"') ||
    normalized.includes("\n")
  ) {
    return `"${normalized.replaceAll('"', '""')}"`;
  }

  return normalized;
}

export function buildLicenseCsvReport(licenses = []) {
  const header = [
    "License Key",
    "Product",
    "Plan",
    "Email",
    "Status",
    "Expiry",
    "Created At",
    "License ID",
  ];
  const rows = licenses.map((license) => [
    license.licenseKey,
    license.product,
    license.plan,
    license.email,
    license.status,
    license.expiry,
    license.createdAt,
    license.id,
  ]);

  return [header, ...rows]
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\n");
}
