# Paddle + Keygen backend

Minimal Node.js (ESM) Express backend with:

- `GET /` health
- `GET /admin` admin dashboard UI
- `GET /licenses` license listing for the dashboard
- `GET /stats` dashboard metrics, revenue summary, products, and activity
- `POST /webhook` for Paddle `transaction.completed`
- `POST /validate` for Keygen license validation
- `POST /licenses/revoke` to revoke a license from the dashboard

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a local env file:

```bash
copy .env.example .env
```

3. Fill in:

- `KEYGEN_ACCOUNT_ID`
- `KEYGEN_API_KEY`
- `PADDLE_API_KEY`
- `YEARLY_POLICY_ID`
- `LIFETIME_POLICY_ID`
- `PORT` (optional, defaults to `3000`)

4. Start the server:

```bash
npm start
```

The API will run on `http://localhost:PORT`.

Open the admin dashboard at `http://localhost:PORT/admin`.

## Project structure

```text
src/
  index.js
  services/
public/
  admin/
data/
```

## Render deployment

This project is ready to deploy on Render with:

- Build command: `npm install`
- Start command: `npm start`

Set these environment variables in Render:

- `KEYGEN_ACCOUNT_ID`
- `KEYGEN_API_KEY`
- `PADDLE_API_KEY`
- `YEARLY_POLICY_ID`
- `LIFETIME_POLICY_ID`
- `PORT` (optional)

## Example requests

Health:

```bash
curl http://localhost:3000/
```

Webhook test mode:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"user@example.com\",\"productName\":\"extension-name-yearly\"}"
```

Validate:

```bash
curl -X POST http://localhost:3000/validate \
  -H "Content-Type: application/json" \
  -d "{\"licenseKey\":\"YOUR-LICENSE-KEY\",\"product\":\"extension-name\"}"
```

## Notes

- Product names are expected to look like `extension-name-yearly` or `extension-name-lifetime`.
- The webhook handler accepts direct test payloads with `{ email, productName }`.
- For real Paddle webhooks, it handles `transaction.completed` and will try to resolve the customer email from the webhook body first, then from the Paddle API using `PADDLE_API_KEY` if needed.
- Validation and webhook activity are persisted locally in `data/activity.json` for the dashboard activity feed.
- `.env` and all other environment files are gitignored, while `.env.example` remains safe to commit.
