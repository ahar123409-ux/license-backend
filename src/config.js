import dotenv from "dotenv";

dotenv.config();

const REQUIRED_ENV_VARS = [
  "PADDLE_API_KEY",
  "KEYGEN_API_KEY",
  "KEYGEN_ACCOUNT_ID",
  "YEARLY_POLICY_ID",
  "LIFETIME_POLICY_ID",
  "ADMIN_PASSWORD",
];

for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

export const config = {
  port: Number(process.env.PORT || 3000),
  paddleApiKey: process.env.PADDLE_API_KEY,
  keygenApiKey: process.env.KEYGEN_API_KEY,
  keygenAccountId: process.env.KEYGEN_ACCOUNT_ID,
  yearlyPolicyId: process.env.YEARLY_POLICY_ID,
  lifetimePolicyId: process.env.LIFETIME_POLICY_ID,
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD,
};
