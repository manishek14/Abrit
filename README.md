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
  per-chat ordering (held after failures by a DB-level gate) and a
  15-second sweeper. Processing milestones are
  tracked per update (`CLAIMED → USER_SAVED → REPLY_SAVED`), so a crash
  mid-flight **resumes** instead of dropping the half-finished work — a
  stored user message is never left unanswered, and a retry can never leave
  a fresh, empty active ticket behind.
  A user flagged blocked after a Telegram 403 is auto-recovered the moment
  they message the bot again (the fresh update proves they unblocked us).
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
  bubbles, delivery badges, model tags, newest-first history with
  **load-older pagination**), **operator replies from the composer** (stored as
  ADMIN outbox rows with `admin_id`, delivered by the same durable dispatcher,
  live `Sending… → Sent` badges, locked on closed tickets), a designed empty
  state, users, assistant settings — all realtime via **Socket.IO** with
  automatic polling fallback and a full cache resync after every reconnect.
  Keyboard-accessible rows, responsive tables/drawer and a shared design-token
  theme round out the panel.
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

- Node.js ≥ 20.19 (developed on 24; matches the frontend's `engines` field)
- Docker (for PostgreSQL) **or** a local PostgreSQL 16
- A Telegram bot token and an OpenRouter API key (see below — the repository
  intentionally ships with both **empty**; everything else works without them)

## Quick start (development)

**One command** — creates `.env` from the template (random JWT secret), starts
PostgreSQL (`docker compose up -d db` when no server is reachable), builds
backend + frontend once and boots the production build of both:

```bash
./demo.sh
# admin panel → http://localhost:5173   (login: admin@abrit.local / Admin1234!)
# API + docs  → http://localhost:3000/api (swagger: /api/docs)
```

Or step by step:

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
| `DATABASE_SSL` / `DATABASE_SSL_CA` | `false` / *(empty)* | TLS for managed PostgreSQL (`true` = encrypt; `CA` (PEM) additionally pins the server cert); `?sslmode=require` in the URL also works |
| `MIGRATIONS_RUN` | `true` | Run pending migrations on boot |
| `SEED_DEMO_DATA` | `true` (dev) / `false` (prod) | Seed Persian demo data when the DB is empty — **refused in production** |
| `BOT_UPDATES_RETENTION_DAYS` | `30` | Purge raw Telegram inbox payloads older than N days (`0` = keep forever); conversation history is never purged |
| `JWT_SECRET` | — (**required**) | ≥ 16 trimmed chars (whitespace-only and repeated patterns rejected everywhere); ≥ 32 trimmed chars in production |
| `JWT_EXPIRES_IN` | `8h` | Admin session lifetime — the JWT and the session cookie maxAge share this ONE policy (`45m` / `8h` / `7d`) |
| `COOKIE_SECURE` | `true` in production | The panel session cookie is HttpOnly + SameSite=Strict; `Secure` defaults on in production (HTTPS mandatory) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@abrit.local` / `Admin1234!` (dev only) | First admin (seeded idempotently, bcrypt-hashed); **must be set explicitly in production and strong: 12+ trimmed chars, ≥ 3 character classes** |
| `TELEGRAM_MODE` | `polling` | `polling` or `webhook` |
| `TELEGRAM_BOT_TOKEN` | *(empty)* | Bot disabled while empty; real token verified in the 2026-11-06 smoke test (@ABRIT_Ticket_Bot) |
| `TELEGRAM_WEBHOOK_URL` / `TELEGRAM_WEBHOOK_SECRET` | *(empty)* | Webhook mode only (secret required in that mode) |
| `TELEGRAM_ALLOWED_UPDATES` | `message` | Comma-separated update types |
| `OPENROUTER_API_KEY` | *(empty)* | Fixed fallback reply while empty |
| `OPENROUTER_DEFAULT_MODEL` | `nvidia/nemotron-3-ultra-550b-a55b:free` | Seeded default model — verified with the owner's key (openrouter/auto is region-blocked for it: 403) |
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
   (Settings → Assistant — the live OpenRouter model list) or keep the
   verified default.

## Running the tests

```bash
cd backend
npm test                # 272 unit tests (no DB, no network)
npm run test:e2e        # 50 e2e scenarios on REAL PostgreSQL (db abrit_test, or E2E_DATABASE_URL)
npm run test:cov        # coverage

cd ../frontend
npm test                # 37 component tests (vitest + React Testing Library, jsdom)
```

The e2e suite boots the whole application with only the Telegram transport
faked — dedup, concurrency, ticket isolation, status rules, auth, sweeper
crash-recovery, crash **resume**, outbox concurrency/lease, newest-first
pagination + load-older, **operator replies (delivery + realtime badges)**,
**idempotent operator replies (client_message_id replay)**, **multi-part
send resume (per-chunk progress)**, cursor range validation, input validation,
retention and the websocket channel all run against a real database.
Frontend tests cover the conversation's loading/empty/error states, the
operator/customer bubble sides and the Sending/Sent/Retrying/Failed delivery
badges, the composer's send/double-click-guard/idempotency-key behavior and
the bigint id merge/pagination logic. See [docs/test-report.md](docs/test-report.md).

**CI:** every push runs the backend build + unit tests, the e2e suite on a real
PostgreSQL 16 service and the frontend component tests + build —
[.github/workflows/ci.yml](.github/workflows/ci.yml).

## Demo scenario for the evaluator

With the default `.env` (both keys empty):

1. `docker compose up -d db` + start backend & frontend (see Quick start).
2. Log into the panel — 6 stat cards, seeded Persian demo data, users/tickets/
   conversations are all live.
3. Open a ticket: watch the bidi-safe conversation (long conversations open on
   the NEWEST messages; "Load older messages" pages history), delivery badges
   (`FAILED` = expected while the bot token is empty), model tags.
4. **Reply as an operator**: type in the composer under the transcript and send
   — the reply appears with a `Support` tag and a live `Sending…` badge. With a
   real bot token the badge flips to `Sent` and the user receives it on
   Telegram; with an empty token it honestly ends as `FAILED` after retries.
   Closed tickets lock the composer until you reopen them.
5. While a ticket is open, simulate an incoming Telegram message:

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
6. Change a status from the panel → a SYSTEM notification message is stored.
7. Swagger: <http://localhost:3000/api/docs> (Authorize with the login token).

With real credentials added, steps 4–6 deliver actual Telegram messages and
real AI replies with zero code changes.

## Design decisions & known limitations

- **PostgreSQL-as-queue** (no Redis/BullMQ in v1): the inbox/outbox tables give
  the same at-least-once guarantees with one source of truth; the upgrade path
  is documented in `docs/architecture.md`.
- **At-least-once delivery, single-send guaranteed**: concurrent duplicate
  sends are impossible (atomic claim + per-claim token fencing — a sender
  whose lease expired mid-send writes 0 rows and aborts); only a hard crash
  between a successful Telegram send of a chunk and its durable progress
  commit can duplicate that one chunk (documented, per-chunk, honest).
  Exactly-once is impossible across an unacknowledged external API call — the
  docs say so explicitly instead of overclaiming.
- **In-memory per-chat queue + DB ordering gate**: user-message ordering is
  guaranteed in a single instance — and it HOLDS after a processing failure:
  while an earlier update of the same chat is not terminal yet, later ones
  wait (no attempt consumed) until the sweeper finishes the blocker. The
  multi-instance path (advisory locks / BullMQ) is documented.
- **Admin replies ship from the panel**: operators answer from the ticket
  conversation (composer under the transcript). Replies are stored as ADMIN
  outbox rows with `admin_id`, delivered by the same durable dispatcher, and
  the panel shows live `Sending… → Sent` delivery badges. Closed tickets
  refuse replies with 409 until reopened.
- The e2e suite intentionally runs with an **empty OpenRouter key** — no test
  spends quota; AI behavior is covered by fast unit tests with fakes.
- **Panel session = HttpOnly cookie** (round 6): no token in JavaScript,
  `SameSite=Strict` + `Secure` (prod) + `maxAge = JWT_EXPIRES_IN`, plus a
  double-submit CSRF guard for cookie-authenticated mutations. Bearer stays
  supported for API clients/Swagger. See docs/DEPLOYMENT.md §9 for the
  liveness/readiness split (a dead Telegram bot fails readiness, a temporary
  OpenRouter outage does not).

## Production checklist

1. `NODE_ENV=production` — the app then refuses to boot unless:
   - `JWT_SECRET` is at least 32 characters after trimming, not blank,
     not a repeated pattern and not a known/example value
     (`openssl rand -hex 32`),
   - `ADMIN_PASSWORD` is set explicitly and strong (12+ trimmed characters,
     at least 3 of lowercase/UPPERCASE/digits/symbols; the dev default is
     rejected),
   - `SEED_DEMO_DATA=false`.
2. Set a strong `CORS_ORIGIN` (the panel's real origin).
3. Decide the retention window (`BOT_UPDATES_RETENTION_DAYS`, default 30).
4. Fill `TELEGRAM_BOT_TOKEN` / `OPENROUTER_API_KEY` when you go live — no code
   changes needed. A failed Telegram bootstrap **aborts a production boot**
   (in development it degrades readiness instead).

## Production deployment

Dockerfiles for both apps, an nginx reverse proxy (REST + WebSocket), a
production compose file, managed-PostgreSQL TLS support and the full
runbook — backup/retention, HTTPS, restart behavior, the single-instance
constraint and the liveness/readiness monitoring split — live in
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** with
`docker-compose.prod.yml` + `.env.production.example`.

License: UNLICENSED (private trial project).
