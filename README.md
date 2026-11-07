# Loadup

**Top up any phone, buy data or a travel eSIM in 150+ countries — paid with NIM or USDT, without leaving Nimiq Pay.**

Loadup is a Nimiq Pay Mini App. Enter a phone number, pick a package, tap Pay. Nimiq Pay's built-in Lightning bridge lets you pay with NIM or USDT, and the credit lands on the phone in seconds.

Built for the **Nimiq Mini Apps Competition — Cycle III** · Category: **On/Off-Ramp** · Full spec: [PRD.md](PRD.md)

## Open it

- In Nimiq Pay: `https://nimpay.app/miniapps/open/<your-domain>` (or Mini Apps → Custom URL)
- Demo video: _coming soon_

## How it works

1. Choose airtime, data, an eSIM or a gift card.
2. Loadup's server creates a fixed-price Lightning invoice with Bitrefill (`payment_method: "lightning"`).
3. The app calls `payLightningInvoice` — Nimiq Pay opens its native dialog and you choose NIM or USDT.
4. Nimiq Pay pays the invoice; Loadup tracks the order (poll + webhook + live SSE) until it's delivered.

```
Loadup (Mini App) ──create order──► Loadup API ──POST /invoices (lightning)──► Bitrefill
        │                                  ▲                                      │
        │  payLightningInvoice(bolt11)     │ status (poll + webhook)              │ delivers
        ▼                                  │                                      ▼
   Nimiq Pay ── NIM or USDT ──► Lightning swap ──► Bitrefill invoice      📱 Phone / eSIM / code
```

Loadup never holds your funds — you pay the provider's invoice directly from your wallet.

## Features

| Feature | Description |
|---|---|
| Airtime & data | Operator auto-detected from the phone number; fixed packages or custom amount |
| Travel eSIMs | Plans by destination, QR + install link + iOS/Android steps, "My eSIMs", top up later |
| Gift cards | Search by brand and country; code, PIN and redemption link with copy buttons |
| Pay with NIM or USDT | Via Nimiq Pay's Lightning bridge (`payLightningInvoice`) |
| Live tracking | Paid → Processing → Delivered (SSE, polling fallback) |
| Safe retries | After `TRANSACTION_OUTCOME_UNKNOWN` / `DUPLICATE_PAYMENT` the invoice is never shown or refreshed again |
| Invoice refresh | Countdown; a new invoice is created automatically if the old one expired unpaid |
| Order history & receipts | Filters, receipts shareable as image or privacy-safe link, one-tap reorder |
| Saved numbers | Nicknames, AES-256-GCM encrypted, masked (`+234 ••• ••• 4521`), deletable |
| "Top me up" links | Link + QR; a second wallet opens it in Nimiq Pay and pays |
| Spending limits | Per order and per day (paid + open invoices), configurable |
| 4 languages | English, Spanish, French, Portuguese (default from Nimiq Pay's language) |
| Browser fallback | "Open in Nimiq Pay" page with deep links |
| Mainnet gate | Lightning is mainnet-only; testnet shows a clear screen |
| Status | `/status` page and `GET /api/health` |

## Nimiq Pay integration

| API | Used for |
|---|---|
| `init({ timeout: 10_000 })` — `@nimiq/mini-app-sdk` | Provider startup |
| `listAccounts()` · `sign({ message })` | Wallet sign-in; verified server-side with `@nimiq/core` |
| `payLightningInvoice({ invoice })` | Every purchase, paid in NIM or USDT |
| `getBalance(htlc)` (feature-detected) | NIM balance hint at checkout |
| `getHostNetwork()` | Mainnet-only gate |
| `getHostLanguage()`, `requestFullscreen()` | Localization, full screen (asked first) |
| `NimiqProviderError.is()` | `PERMISSION_DENIED`, `INVALID_REQUEST`, `INVALID_TRANSACTION`, `DUPLICATE_PAYMENT`, `TRANSACTION_OUTCOME_UNKNOWN`, `NETWORK_ERROR` each have their own message and behaviour |

Payment safety rules (see `src/screens/Order.tsx`, `server/services/orders.ts`):

- Before opening the Nimiq Pay dialog, the app stores a "payment in flight" marker. If the app is killed mid-dialog, the next visit reports the payment as uncertain instead of offering to pay again.
- `TRANSACTION_OUTCOME_UNKNOWN` / `DUPLICATE_PAYMENT` → `POST /orders/:id/paid { uncertain: true }`; from then on the server never returns the BOLT11 and refuses `refresh-invoice`.
- `refresh-invoice` re-fetches the old invoice from Bitrefill first and refuses if it was paid.
- `NETWORK_ERROR` → the order status is re-checked before another attempt is allowed (Nimiq Pay also rejects reuse of an invoice).

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Vite, React 19, TypeScript, Tailwind CSS 4, `@nimiq/mini-app-sdk`, `libphonenumber-js`, `qrcode` |
| API | Hono on Node (`@hono/node-server`), same origin as the app |
| Database | Postgres (Neon) + Drizzle ORM; embedded PGlite for local dev/tests |
| Provider | Bitrefill API v2 behind a `TopupProvider` interface (`server/providers`) |
| Security | AES-256-GCM for phone numbers and redemption codes; Ed25519 signature checks with `@nimiq/core`; HMAC session tokens |
| Jobs | In-process cron every minute (`POST /api/cron/tick` for external schedulers) |
| Tests | Vitest (59 unit/integration tests), Playwright (11 end-to-end flows with a mocked Nimiq Pay host) |

## Getting started

### Prerequisites

- Node.js 22+
- Nimiq Pay on your phone, on **mainnet**
- Phone and computer on the same Wi-Fi
- A Bitrefill API key (bitrefill.com → Account → Developers)
- A Postgres database (e.g. Neon) for production; local dev works without one

### Environment variables

Copy `.env.example` to `.env`. Generate the secrets with `openssl rand -base64 32`.

```bash
PUBLIC_APP_URL=             # e.g. https://loadup.example.com (webhooks need https)
DATABASE_URL=               # empty in dev → embedded PGlite in ./.data
SESSION_SECRET=             # ≥32 chars
DATA_ENCRYPTION_KEY=        # 32-byte key, base64
TOPUP_PROVIDER=bitrefill    # or "mock" for local UI work (refused in production)
BITREFILL_BASE_URL=https://api.bitrefill.com/v2
BITREFILL_API_KEY=          # Personal API (Bearer)
BITREFILL_API_ID=           # Business/Affiliate (Basic) — optional
BITREFILL_API_SECRET=       # Business/Affiliate (Basic) — optional
WEBHOOK_TOKEN=              # optional, appended to the webhook URL
CRON_SECRET=                # protects POST /api/cron/tick in production
LIMIT_PER_ORDER_USD=100
LIMIT_PER_DAY_USD=300
SUPPORT_EMAIL=
SUPPORT_URL=
```

### Run locally

```bash
git clone https://github.com/softalpha0/loadup.git
cd loadup
cp .env.example .env
npm install
npm run db:migrate
npm run dev -- --host
```

The API runs on `:8787`, the Mini App on `:5173` (proxying `/api`). In Nimiq Pay: **Mini Apps → Custom URL →** the Network URL from your terminal (e.g. `http://192.168.1.42:5173`).

Without a Bitrefill key, set `TOPUP_PROVIDER=mock` to click through every flow with a fake catalogue (invoices from the mock cannot be paid by a real wallet).

### Test

```bash
npm test          # Vitest: adapter fixtures, status mapping, limits, encryption, signatures, full API
npm run e2e       # Playwright: builds the app and runs every user flow against a mocked Nimiq Pay host
npm run typecheck
```

### Deploy

One Node process serves the API and the built Mini App from one stable URL:

```bash
npm ci && npm run build
NODE_ENV=production npm start
```

A `Dockerfile` is included (Render, Fly.io, Railway, any VPS). Migrations run on startup. Point Bitrefill webhooks at `https://<domain>/api/webhooks/bitrefill` — they are only used as a trigger; state is always re-fetched with `GET /invoices/{id}`.

## Project layout

```
server/            Hono API
  providers/       TopupProvider interface, Bitrefill adapter, mock provider
  services/        Order lifecycle (create, refresh, sync, limits)
  auth/            Nimiq signed-message verification, session tokens
  db/              Drizzle schema + client (Postgres / PGlite)
shared/            Types, status mapping, limits, BOLT11 reader, phone helpers
src/               Mini App (React)
  screens/         One file per screen
  locales/         en, es, fr, pt
tests/             Vitest
e2e/               Playwright
drizzle/           SQL migrations
```

## Privacy & safety

- **Non-custodial:** Loadup never holds, receives or moves your funds.
- **Stored:** your NIM address, saved numbers (encrypted), order details and status.
- **Never stored:** private keys.
- **Delete anytime:** Settings → Delete my data.
- Top-ups, eSIMs and gift cards are fulfilled by Bitrefill; their terms apply.
- Delivery is usually under a minute but can take longer; failed orders have a "Get help" button with the order ID.

## License

[MIT](LICENSE)

## Author

Built solo by **softalpha0** for the Nimiq Mini Apps Competition.
