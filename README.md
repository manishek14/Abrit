# AbrIT — AI-Powered Telegram Ticketing System

A Telegram support bot with an AI assistant (OpenRouter), a realtime web admin
panel, a NestJS backend and PostgreSQL — built for the **AbrIT technical trial
assignment** (deadline: Sat 16 Aban 1405 / Nov 7 2026, 12:00).

> **Stack:** NestJS 11 · TypeORM · PostgreSQL 16 · Telegraf · OpenRouter ·
> React 18 + Vite + TypeScript + Ant Design 5 · TanStack Query · Socket.IO ·
> JWT + bcrypt · Jest + Supertest

![login](docs/screenshots/01-login.png)
![dashboard](docs/screenshots/02-dashboard.png)
![live ticket](docs/screenshots/03-ticket-live.png)
![settings](docs/screenshots/04-settings.png)

*(Screenshots are from a real run of this repository — the ticket screen shows a
Telegram message arriving over the live websocket while the panel stays open.)*

## Features

- **Telegram bot** — real Telegram Bot API integration (Telegraf): `/start`,
  `/new`, `/status`, `/close`, `/help`, plain-text ticketing, non-text and
  over-length notices. Polling by default, webhook mode via env.
- **No lost messages, resumable processing** — every update is persisted to an
  inbox table first (`INSERT … ON CONFLICT DO NOTHING`), the caller gets an
  instant `200`, and processing happens asynchronously with atomic claims,
  per-chat ordering and a 15-second sweeper. Processing milestones are
  tracked per update (`CLAIMED → USER_SAVED → REPLY_SAVED`), so a crash
  mid-flight **resumes** instead of dropping the half-finished work — a
  stored user message is never left unanswered.
- **Independent ticket memory** — the AI context is built ONLY from the same
  `ticket_id` (query-level guarantee, not a prompt instruction), with role
  mapping, merging and a character budget. One active ticket per user is
  enforced by a PostgreSQL partial unique index.
- **Durable outbox, single delivery** — every outbound message (AI reply, admin
  notification) is stored `PENDING` before any network attempt; each send is
  guarded by an **atomic claim with a 60 s lease**, so the immediate dispatcher
  and the sweeper can never deliver the same message twice. Retries respect
  `retry_after`, and permanent failures (user blocked the bot) stop retrying.
- **AI with error policy** — OpenRouter behind an interface with timeout,
  retry/backoff, error classification (401/402/404 → no retry, 429/5xx →
  retry) and an honest fallback message; the assistant is configurable from the
  panel (prompt, model, on/off) and applies instantly.
- **Admin panel** — login, dashboard stats, ticket list with filters/search/
  pagination (owner name embedded), ticket conversation (bidi-safe Persian
  bubbles, delivery badges, model tags, **load-older pagination**), users,
  assistant settings — all realtime via **Socket.IO** with automatic polling
  fallback and a full cache resync after every reconnect.
- **Secure by default** — JWT everywhere except login/health/webhook (webhook
  authenticates with the dedicated Telegram secret, compared in constant time
  and now with structural payload validation), bcrypt-hashed passwords, login
  rate limiting, CORS restricted to the panel, helmet, strict DTO validation,
  secrets only via env — and **production mode refuses to boot** with known/
  example JWT secrets, a default admin password or demo seeding enabled.

## Architecture in one paragraph

A single NestJS app serves the REST API (`/api`), the Socket.IO gateway and the
Telegram integration. Incoming updates flow: webhook/polling → `bot_updates`
inbox (point of no return) → atomic claim → per-chat serial queue → user upsert
→ command or ticket flow → `messages` (history + outbox) → OpenRouter (when a
key is configured) → outbox delivery → Telegram. The sweeper (every 15 s)
re-drives stale inbox rows and re-delivers due outbox messages. Domain events
power both the outbox dispatcher and the panel's websocket updates. See
[docs/architecture.md](docs/architecture.md),
[docs/database-design.md](docs/database-design.md) and
[docs/test-report.md](docs/test-report.md).

## Prerequisites

- Node.js ≥ 20 (developed on 24)
- Docker (for PostgreSQL) **or** a local PostgreSQL 16
- A Telegram bot token and an OpenRouter API key (see below — the repository
  intentionally ships with both **empty**; everything else works without them)

## Quick start (development)

```bash
cp .env.example .env          # set JWT_SECRET; Telegram/OpenRouter keys stay empty for now
docker compose up -d db       # PostgreSQL 16 on :5432 (db-test for e2e on :5433)

cd backend
npm install
npm run start:dev             # migrations run automatically on boot (idempotent)
# API:      http://localhost:3000/api
# Swagger:  http://localhost:3000/api/docs
# Login:    admin@abrit.local / Admin1234! (from .env.example — change in .env)

cd ../frontend
npm install
npm run dev                   # panel on http://localhost:5173
```

Demo data (Persian sample users/tickets/messages) is seeded automatically on
first boot (`SEED_DEMO_DATA=true`).

## راه‌اندازی سریع (فارسی)

```bash
cp .env.example .env          # مقدار JWT_SECRET را عوض کنید
docker compose up -d db       # پایگاه‌داده PostgreSQL روی پورت 5432

cd backend && npm install && npm run start:dev   # مایگریشن‌ها هنگام بوت اجرا می‌شوند
cd ../frontend && npm install && npm run dev     # پنل مدیریت: http://localhost:5173
```

- ورود به پنل: `admin@abrit.local` / `Admin1234!` (از `.env.example`؛ در تولید عوضش کنید)
- **توکن ربات تلگرام و کلید OpenRouter فعلاً خالی است** (طبق تصمیم صاحب پروژه).
  تا وقتی خالی باشند این دو سرویس غیرفعال می‌مانند و فقط یک پیام اطلاع‌رسانی
  در لاگ ثبت می‌شود؛ بقیه سیستم (پنل، API، پایگاه‌داده، تست‌ها) کامل کار می‌کند.
- برای فعال‌سازی ربات: `TELEGRAM_BOT_TOKEN` را در `.env` بگذارید و سرویس را
  ری‌استارت کنید (پیش‌فرض Polling است). برای فعال‌سازی دستیار هوشمند:
  `OPENROUTER_API_KEY` را بگذارید؛ همان لحظه پاسخ‌های واقعی مدل جایگزین
  پاسخ ثابت می‌شود — بدون هیچ تغییری در کد.
- پیام‌های خروجیِ ثبت‌شده تا قبل از ست‌شدن توکن با برچسب
  «Delivery failed» در پنل دیده می‌شوند که رفتار موردانتظار است.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `production` enables strict boot rules (see below) |
| `PORT` | `3000` | API port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed panel origin(s), comma-separated |
| `APP_TIMEZONE` | `Asia/Tehran` | Timezone for dashboard "today" stats |
| `DATABASE_URL` | — (required) | e.g. `postgres://abrit:abrit@127.0.0.1:5432/abrit` |
| `MIGRATIONS_RUN` | `true` | Run pending migrations on boot |
| `SEED_DEMO_DATA` | `true` (dev) / `false` (prod) | Seed Persian demo data when the DB is empty — **refused in production** |
| `BOT_UPDATES_RETENTION_DAYS` | `30` | Purge raw Telegram inbox payloads older than N days (`0` = keep forever); conversation history is never purged |
| `JWT_SECRET` | — (**required**) | ≥ 16 chars; known/example values are rejected everywhere; ≥ 32 chars in production |
| `JWT_EXPIRES_IN` | `8h` | Admin token lifetime |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@abrit.local` / `Admin1234!` (dev only) | First admin (seeded idempotently, bcrypt-hashed); **must be set explicitly in production** |
| `TELEGRAM_MODE` | `polling` | `polling` or `webhook` |
| `TELEGRAM_BOT_TOKEN` | *(empty)* | **Empty for now** — bot disabled while empty |
| `TELEGRAM_WEBHOOK_URL` / `TELEGRAM_WEBHOOK_SECRET` | *(empty)* | Webhook mode only (secret required in that mode) |
| `TELEGRAM_ALLOWED_UPDATES` | `message` | Comma-separated update types |
| `OPENROUTER_API_KEY` | *(empty)* | **Empty for now** — fixed fallback reply while empty |
| `OPENROUTER_DEFAULT_MODEL` | `openrouter/auto` | Seeded default model |
| `OPENROUTER_TIMEOUT_MS` | `25000` | Per-request abort timeout |
| `AI_CONTEXT_MAX_MESSAGES` | `20` | Context window (messages) |
| `AI_MAX_CONCURRENCY` | `3` | Global AI concurrency cap |
| `AI_MAX_OUTPUT_TOKENS` | `500` | Response token cap |
| `AI_CONTEXT_MAX_CHARS` | `21000` | Context character budget |

## Creating the bot & getting an OpenRouter key

1. **Telegram bot**: talk to [@BotFather](https://t.me/BotFather) ��� `/newbot`
   → copy the token into `TELEGRAM_BOT_TOKEN` → restart. Then in the bot chat:
   `/start`, write a problem (a ticket is created), continue the conversation,
   `/status`, `/close`. Optionally run
   `curl -F "url=https://YOUR HOST/api/telegram/webhook" -F "secret_token=$TELEGRAM_WEBHOOK_SECRET" https://api.telegram.org/bot<TOKEN>/setWebhook`
   and switch `TELEGRAM_MODE=webhook`.
2. **OpenRouter**: create a key at <https://openrouter.ai/keys> → put it in
   `OPENROUTER_API_KEY` → restart. Pick a model in the panel
   (Settings → Assistant) or leave `openrouter/auto`.

## Running the tests

```bash
cd backend
npm test                # 146 unit tests (no DB, no network)
npm run test:e2e        # 24 e2e scenarios on REAL PostgreSQL (db abrit_test, or E2E_DATABASE_URL)
npm run test:cov        # coverage (~84% statements)
```

The e2e suite boots the whole application with only the Telegram transport
faked — dedup, concurrency, ticket isolation, status rules, auth, sweeper
crash-recovery, crash **resume**, outbox concurrency/lease, pagination,
input validation, retention and the websocket channel all run against a real
database. See [docs/test-report.md](docs/test-report.md).

**CI:** every push runs the backend build + unit tests, the e2e suite on a real
PostgreSQL 16 service and the frontend build —
[.github/workflows/ci.yml](.github/workflows/ci.yml).

## Demo scenario for the evaluator

With the default `.env` (both keys empty):

1. `docker compose up -d db` + start backend & frontend (see Quick start).
2. Log into the panel — 6 stat cards, seeded Persian demo data, users/tickets/
   conversations are all live.
3. Open a ticket: watch the bidi-safe conversation, delivery badges
   (`FAILED` = expected while the bot token is empty), model tags.
4. While a ticket is open, simulate an incoming Telegram message:

```bash
curl -X POST http://localhost:3000/api/telegram/webhook \
  -H 'content-type: application/json' \
  -H 'x-telegram-bot-api-secret-token: <TELEGRAM_WEBHOOK_SECRET from .env>' \
  -d '{"update_id":1234567,"message":{"message_id":1,"from":{"id":555,"is_bot":false,"first_name":"کاربر نمونه"},"chat":{"id":555,"type":"private"},"text":"سلام، درگاه پرداخت خطا می‌دهد"}}'
```

→ The user message appears **instantly** in the open ticket (Socket.IO), a new
ticket is auto-created with a `TKT-…` number, and the honest fallback reply is
stored as `FAILED` (no bot token). Send the same update again — nothing
changes (idempotency).
5. Change a status from the panel → a SYSTEM notification message is stored.
6. Swagger: <http://localhost:3000/api/docs> (Authorize with the login token).

With real credentials added, steps 4–5 deliver actual Telegram messages and
real AI replies with zero code changes.

## Design decisions & known limitations

- **PostgreSQL-as-queue** (no Redis/BullMQ in v1): the inbox/outbox tables give
  the same at-least-once guarantees with one source of truth; the upgrade path
  is documented in `docs/architecture.md`.
- **At-least-once delivery, single-send guaranteed**: concurrent duplicate
  sends are impossible (atomic claim); only a hard crash between a successful
  Telegram send and the `SENT` update can duplicate one outbound message (rare,
  documented).
- **In-memory per-chat queue**: guarantees user-message ordering in a single
  instance; the multi-instance path (advisory locks / BullMQ) is documented.
- **No admin replies from the panel yet** (per the trial's core scope; the
  outbox already supports the `ADMIN` role and the extension path is documented).
- The e2e suite intentionally runs with an **empty OpenRouter key** — no test
  spends quota; AI behavior is covered by fast unit tests with fakes.
- JWT lives in `localStorage` + Bearer header (simple and adequate for this
  trial; `httpOnly` cookies are the hardened upgrade).

## Production checklist

1. `NODE_ENV=production` — the app then refuses to boot unless:
   - `JWT_SECRET` is at least 32 characters and not a known/example value
     (`openssl rand -hex 32`),
   - `ADMIN_PASSWORD` is set explicitly (the dev default is rejected),
   - `SEED_DEMO_DATA=false`.
2. Set a strong `CORS_ORIGIN` (the panel's real origin).
3. Decide the retention window (`BOT_UPDATES_RETENTION_DAYS`, default 30).
4. Fill `TELEGRAM_BOT_TOKEN` / `OPENROUTER_API_KEY` when you go live — no code
   changes needed.

License: UNLICENSED (private trial project).
