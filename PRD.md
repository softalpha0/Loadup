# PRD — Loadup

Top up any phone, buy data or a travel eSIM in 150+ countries — paid with NIM or USDT, without leaving Nimiq Pay. Loadup turns crypto in Nimiq Pay into real-world value people use every week. It uses Nimiq Pay's `payLightningInvoice` bridge: Loadup creates a fixed-price Lightning invoice with Bitrefill, the user pays it with NIM or USDT in a native Nimiq Pay dialog, and the top-up lands on the phone in seconds.

| | |
|---|---|
| Competition | Nimiq Mini Apps Competition — Cycle III — tracker ID HK-011 |
| Category | On/Off-Ramp ("local top-ups" is named in the brief) — $4,000 USDC for #1 |
| Deadline | Nov 11, 2026 (submit by Nov 10 evening, Lagos time) |
| Winners announced | Nov 27, 2026 |
| Team | Solo — softalpha0 |
| Status | Build spec v1.0 — 2026-11-07 |

## 1. Problem

Crypto in a wallet is only useful if you can spend it on things you need. For most people, the most frequent everyday purchase is mobile airtime and data — bought weekly, often in small amounts. Travellers need eSIMs the moment they land.

Today a Nimiq Pay user who wants airtime has to leave the app, sell crypto on an exchange, wait for a bank or mobile-money transfer, then buy the top-up — several apps, fees and hours.

In Cycle II (142 entries) no Mini App let users turn NIM or USDT into phone credit, data or eSIMs. Almost none used Nimiq Pay's Lightning bridge.

## 2. Who it's for

| User | Need |
|---|---|
| Everyday Nimiq Pay users | Top up their own phone or data in seconds with NIM/USDT. |
| Families & diaspora | Send airtime or data to a relative's phone in another country. |
| Travellers & remote workers | Buy a data eSIM for their destination before or after landing. |
| Friends asking for help | Share a "Top me up" request link that someone else pays. |

## 3. Solution

Three products and one checkout:

- **Airtime & data** — enter a phone number → Loadup detects the country and operator → choose a package → pay.
- **Travel eSIM** — choose a destination → choose a data plan → pay → install with QR / link.
- **Gift cards** — search a brand and country → choose a value → pay → get the code.

Checkout (same for all):

1. Loadup's server creates a Bitrefill invoice with `payment_method: "lightning"` → receives a fixed-amount BOLT11 invoice.
2. The app calls `nimiq.payLightningInvoice({ invoice })`.
3. Nimiq Pay shows its native dialog; the user chooses NIM or USDT and approves. Nimiq Pay swaps and pays the Lightning invoice.
4. Loadup tracks the Bitrefill invoice until the order is delivered and shows the result.

Non-custodial: Loadup never holds user funds.

## 4. Feature list (all in scope)

| # | Feature | User story |
|---|---|---|
| F1 | Wallet sign-in | I approve a sign-in message in Nimiq Pay; my NIM address keeps my history and saved numbers. |
| F2 | Home | Three big actions — Airtime & Data, eSIM, Gift cards — plus recent orders and saved numbers. |
| F3 | Phone number entry + operator detection | Country picker, E.164 formatting, operator via Bitrefill's phone check. |
| F4 | Airtime packages | Fixed package or amount within min/max/step. |
| F5 | Data bundles | Data products for the detected operator/country. |
| F6 | Travel eSIMs | Destination, plans ("1GB, 7 Days"), QR + install link + iOS/Android steps. |
| F7 | eSIM top-up | Add data to an eSIM bought before. |
| F8 | Gift cards | Search brand by country, value, code/link/PIN. |
| F9 | Price display | Face value in local currency and price; note that I choose NIM or USDT in Nimiq Pay. |
| F10 | Lightning checkout | One tap opens Nimiq Pay's dialog via `payLightningInvoice`. |
| F11 | Invoice expiry handling | Countdown; expired unpaid invoice is replaced. |
| F12 | Live order tracking | Paid → Processing → Delivered (or Failed). |
| F13 | Delivery result | Airtime/data credited message; eSIM QR + link; gift card code with copy. |
| F14 | Order history & receipts | All orders, receipts, share as image or link. |
| F15 | Reorder | One tap repeats a previous top-up. |
| F16 | Saved numbers | Nicknames, encrypted, deletable. |
| F17 | Top-up request link | "Top me up" link that a friend pays in Nimiq Pay. |
| F18 | Safe error handling | Clear message per `NimiqProviderError`/Bitrefill status; never ask to pay again after `TRANSACTION_OUTCOME_UNKNOWN` or `DUPLICATE_PAYMENT`. |
| F19 | Spending limits | ≤ $100 per order, ≤ $300/day per wallet (configurable). |
| F20 | Network handling | Testnet shows "Switch Nimiq Pay to mainnet". |
| F21 | Localization | English, Spanish, French, Portuguese; default from `window.nimiqPay.language`. |
| F22 | Open-outside-Nimiq-Pay page | What Loadup is, "Open in Nimiq Pay" deep link, store links. |
| F23 | Onboarding, FAQ & disclosures | 3 intro cards, FAQ, privacy notice, "Powered by Bitrefill" attribution. |
| F24 | Support | "Get help" with order ID prefilled. |
| F25 | Status & health | `/status` shows API health and provider configuration. |

**Hard constraints:** non-custodial; secrets server-side only; personal data minimised and encrypted, masked in lists; accurate delivery claims ("usually under 1 minute"); brand use within Bitrefill's terms; MIT-licensed public repo.

## 5–7. Integration, provider, stack

- Nimiq Pay: `init`, `listAccounts`, `sign`, `payLightningInvoice` → `{ hash, swapId }`, `getBalance`, `getHostNetwork`, `window.nimiqPay.language`, `requestFullscreen`, `NimiqProviderError`.
- Deep links: `https://nimpay.app/miniapps/open/<app-domain>` · `nimiqpay://miniapp?url=<app-domain>`.
- Bitrefill: `GET /check_phone_number`, `GET /products`, `/products/search`, `/products/{id}`, `/products/esims`, `POST /invoices` (lightning), `POST /esims` (with `esim_id` for top-ups), `GET /invoices/{id}`, `GET /orders/{id}`, webhook (unsigned → trigger only). Personal API = Bearer; Business/Affiliate = Basic.
- Invoice states: unpaid → payment_detected → payment_confirmed → pending → complete (or blocked / denied / payment_error). Order states: created → payment_detected → processing → delivered (or failed / refunded).
- All provider calls go through a `TopupProvider` interface.
- Stack: Vite + React + TypeScript + Tailwind, Hono, Postgres (Neon) + Drizzle, AES-256-GCM, `@nimiq/core`, cron every minute, Vitest + Playwright.

## 8–11. Flows, screens, data model, API

See the implementation: screens in `src/screens`, schema in `server/db/schema.ts`, API in `server/app.ts` (mounted under `/api`).

## 12. Disclosures

- Loadup is non-custodial — payments go from your Nimiq Pay wallet to the provider's Lightning invoice; Loadup never holds your funds.
- Top-ups, eSIMs and gift cards are fulfilled by Bitrefill; their terms apply.
- Data stored: your NIM address, saved numbers (encrypted), order details and status. No private keys. Delete everything anytime in Settings.
- Delivery is usually under a minute but can take longer; if an order fails, use "Get help" with your order ID.

## 15. Acceptance criteria

| # | Criterion |
|---|---|
| A1 | Opens inside Nimiq Pay (Custom URL and deep link) |
| A2 | Sign-in verified server-side |
| A3 | Phone number → operator detected → packages shown (3 countries tested) |
| A4 | Real airtime top-up paid with NIM delivered to a real phone |
| A5 | Real top-up or data bundle paid with USDT delivered |
| A6 | eSIM purchase returns QR/link and instructions |
| A7 | Gift card purchase returns code |
| A8 | Expired invoice is refreshed; no double payment possible |
| A9 | `TRANSACTION_OUTCOME_UNKNOWN` path never shows a second Pay button |
| A10 | Testnet shows the mainnet-required screen |
| A11 | Top-up request link paid by a second wallet |
| A12 | Saved numbers encrypted in DB; masked in UI; delete-my-data works |
| A13 | Limits enforced (per order, per day) |
| A14 | No secrets in repo (gitleaks clean); MIT license |
| A15 | Unit tests for provider adapter, status mapping, limits, encryption |

## 17. Risks & fallbacks

| Risk | Fallback |
|---|---|
| Bitrefill Partner/Affiliate approval doesn't arrive in time | Build and demo with the Personal API key; `TopupProvider` ready for a partner key. |
| Lightning invoice expires during approval | Countdown + refresh endpoint (F11). |
| Swap fails or outcome unknown | Never resend; poll provider; "Get help" with order ID. |
| Country/operator not supported | "Not available for this number" with eSIM/gift-card alternatives. |
| Mainnet-only testing costs money | Test with the smallest packages ($1–5). |

## 18. Open questions

- Bitrefill API base URL and exact path names (confirm in the API reference).
- Does Bitrefill's Personal API allow purchases on behalf of other users, or is the Partner Program required for production?
- Refund handling for Lightning-paid failed orders.
- Minimum Lightning amount accepted by Nimiq Pay's bridge.
