# Test Report

- **Date:** 13–17 Aban 1405 / 4–8 Nov 2026
- **Environment:** Node v24.22.2 · PostgreSQL 16+ (real server, not SQLite) ·
  NestJS 11 · TypeORM 0.3 · Jest 29 + ts-jest + Supertest · socket.io-client (e2e)
- **CI:** GitHub Actions runs backend build + unit tests, e2e on PostgreSQL 16
  and the frontend component tests + build on every push
  (`.github/workflows/ci.yml`)
- **Telegram/OpenRouter credentials:** unit/e2e suites still run with EMPTY
  credentials (faked delivery, AI disabled/fallback — no network calls). A
  REAL-credential smoke test was run on 6 Nov 2026 (@ABRIT_Ticket_Bot + the
  owner's OpenRouter key) — see "Real-credential smoke test" below.

## Commands

```bash
cd backend
npm test            # unit
npm run test:cov    # unit + coverage
npm run test:e2e    # 50 scenarios, REAL PostgreSQL (database abrit_test)
```

## Automated results (actual output)

```
Unit:      Test Suites: 24 passed, 24 total
           Tests:       272 passed, 272 total

E2E:       Test Suites:  2 passed,  2 total
           Tests:        50 passed, 50 total

Frontend:  Test Files:   5 passed (5)
           Tests:        37 passed (37)
```

## Plan §11 scenario coverage (all automated)

| # | Scenario | Where | Status |
|---|---|---|---|
| 1 | `/start` / re-visit → exactly one telegram_users row (upsert) | unit (`users.service.spec`) + e2e (dedup flow) | ✅ |
| 2 | Message without active ticket → TKT-number ticket + USER message stored | e2e (`scenario 2/4`) | ✅ |
| 3 | 20 users in parallel → 20 distinct ticket numbers (sequence, no races) | e2e (`scenario 3`) | ✅ |
| 4 | AI reply stored and delivered exactly once, telegram_message_id set | e2e (fake gateway SENT + unit dispatcher) | ✅ |
| 5 | Context continuation — only same-ticket messages, correct roles/order, SYSTEM dropped, N cap, merging, char budget, last user message always kept | unit (`context-builder.service.spec`) | ✅ |
| 6 | Isolation — ticket A text NEVER in ticket B payload (two users; same-user two tickets covered by e2e) | unit + e2e (`scenario 6`) | ✅ |
| 7 | Status transitions: no-op same status, 400 invalid, 409 reopen with other active ticket, notification SENT | e2e (`scenario 7`) + unit (`tickets.service.spec`) | ✅ |
| 8 | Status-change notification → correct chat; sweeper retry after gateway failure | unit (dispatcher/markFailed) + e2e | ✅ |
| 9 | Duplicate update (even 3 concurrent posts) → one ticket, one reply, inbox DONE, attempts=1 | e2e (`scenario 1/9`) | ✅ |
| 10 | OpenRouter failures (timeout, 429+Retry-After, 5xx, 401, empty) → retry/fallback policy, key never in logs | unit (`openrouter.provider.spec`, `ai-reply.provider.spec`) | ✅ |
| 11 | All admin routes 401 without token; garbage token 401; webhook 403 without secret | e2e (`scenario 11`, `webhook 403`) + unit (guard) | ✅ |
| 12 | Closed ticket ⇒ new message opens a FRESH ticket (history stays behind) | e2e (`scenario 12/13`) | ✅ |
| 13 | One active ticket per user under concurrency | e2e (`scenario 12/13`) + partial unique index | ✅ |
| 14 | AI disabled from panel → fixed reply, provider never called | e2e (`scenario 14`) + unit | ✅ |
| + | Sweeper re-drives updates left RECEIVED by a crash | e2e | ✅ |
| + | Lists: `{ data, meta }` pagination, login 401 wrong password, health public | e2e | ✅ |
| + | WebSocket: valid token joins `admins`, bad token kicked, live `ticket:new` / `message:new` / `ticket:updated` observed in the panel | unit (gateway) + live browser run | ✅ |

## Review-fix regression coverage (all automated)

| Fix | Scenario | Where | Status |
|---|---|---|---|
| #1 crash resume | User message stored + reply missing → re-run CONTINUES and answers (stage → `REPLY_SAVED`, no `last_error`) | e2e `CRASH RECOVERY #1a` + unit | ✅ |
| #1 crash resume | Reply already stored → done WITHOUT a second AI call or resend | e2e `CRASH RECOVERY #1b` + unit | ✅ |
| #1 / #4-b | Poisoned update exhausts attempts → FAILED with `last_error` preserved (not overwritten) | e2e `CRASH RECOVERY #1c` + unit (`recordError`) | ✅ |
| #2 duplicate sends | Two concurrent `deliver()` on the same message → exactly ONE Telegram send | e2e `OUTBOX CONCURRENCY #2a` | ✅ |
| #2 lease expiry | Fresh claim blocks the sweeper; a stale lease is reclaimed and delivered once | e2e `OUTBOX LEASE #2b` | ✅ |
| #3 events after commit | Commit failure → no websocket/outbox events fire | unit (`tickets.service.spec`) | ✅ |
| #3 websocket after commit | `user:new` and `ticket:updated` still arrive live (socket.io-client) | e2e `WEBSOCKET` | ✅ |
| #4-a status rules | CLOSED → IN_PROGRESS with another active ticket → 409, never a 500 | e2e `STATUS #4-a` + unit | ✅ |
| pagination | `?before=` cursor pages, `has_more`, cursor/limit input validation (400s) | e2e `PAGINATION` + unit (`getConversationPage`) | ✅ |
| input validation | `/users/:id` non-uuid → 400; ticket list embeds the owner | e2e `VALIDATION` | ✅ |
| #4-c webhook shape | Malformed payloads → 400 BEFORE touching the inbox | e2e `WEBHOOK #4-c` + unit (`update-shape.spec`) | ✅ |
| retention | Raw inbox rows older than N days purged; conversation history untouched | e2e `RETENTION` | ✅ |
| config security | JWT_SECRET blacklist + production rules (32+ chars, explicit admin password, no demo seed in prod) | unit (`env.spec`) | ✅ |
| closed-ticket race | Status check + reply insert share ONE transaction under the SAME pessimistic_write lock `changeStatus` takes — a concurrent close can never slip between check and store | unit (`messages.service.spec` — lock asserted, 409/404 paths) + e2e (`ADMIN REPLY` 409) | ✅ |
| operator-reply idempotency | Retry with the same `client_message_id` → the ORIGINAL message is returned (HTTP 200), exactly one Telegram send; partial unique index on `messages.client_message_id` (role = ADMIN) | e2e (`ADMIN REPLY IDEMPOTENCY`) + unit (pre-check replay + concurrent-race loser) | ✅ |
| content-bound idempotency key | The SAME key with DIFFERENT content → 409 (never a replay of the old message); an edited draft with a FRESH key is a new message; reverting an edit back to the original text replays the same key | e2e (`ADMIN REPLY IDEMPOTENCY (content-bound)`) + unit (fast path + race loser) + component (`Composer.test` — edit-after-fail / revert) | ✅ |
| composer mid-flight lock | The textarea is locked while a send is in flight (no mid-flight edits to wipe or misattribute) | component (`Composer.test`) | ✅ |
| ordering after a failure | While an earlier update of the same chat is unfinished (not DONE/FAILED), the later one stays RECEIVED — no attempts consumed, no message stored; the sweeper finishes the first, THEN the second (reply to message 1 stored before message 2's user row exists) | e2e (`ORDERING GATE`) + unit (`orchestrator.service.spec` — gate blocks, gate args, shapes skip the gate) | ✅ |
| production secret strength | Whitespace-only JWT secrets (32 spaces) and ADMIN passwords (12 spaces), single-repeated-char and short-block-repeated patterns, and < 3-character-class passwords are all refused in production (length measured on the TRIMMED value) | unit (`env.spec` — blank/whitespace, repeated-pattern, strength-class cases) | ✅ |
| blocked-state recovery | A fresh message from a user flagged `is_blocked` clears the stale flag and is processed normally (the message proves they unblocked the bot) | e2e (`BLOCKED RECOVERY`) + unit (flag cleared, unblocked users never re-flagged) | ✅ |
| outbox claim attempts | The claim consumes `delivery_attempts` (a hard crash after claiming burns one retry); a LOST claim consumes nothing | unit (`claimForDelivery` SQL asserted) + e2e (`OUTBOX LEASE` — attempts 0 after the skip, 1 after the reclaimed delivery) | ✅ |
| claim-token fencing | Every outcome write (chunk progress, SENT, FAILED, deferral) is fenced by the per-claim token: 0-row writes are ignored, and a zombie sender mid-send ABORTS its remaining chunks | unit (`markSent/markFailed/recordChunkSent` fence + `FENCING: losing the claim mid-send aborts`) | ✅ |
| honest at-least-once window | A hard crash between a chunk's Telegram send and its progress commit re-sends that chunk once on the retry — exactly the documented residual window (this is why progress is committed after EVERY chunk) | unit (`HONEST AT-LEAST-ONCE` — the re-send is asserted and documented) | ✅ |
| no empty ticket on resume | A crash-retried update whose user message already exists resumes in its ORIGINAL ticket even after an operator closed it — exactly one ticket, reply lands next to its message, no fresh empty ACTIVE ticket | e2e (`CRASH RECOVERY (empty-ticket fix)`) + unit (dedup-first pins the ticket; vanished ticket → recorded error) | ✅ |
| atomic creation announcement | Ticket + opening SYSTEM announcement commit in ONE transaction; events fire only after the commit; `/new` uses the same path | unit (`tickets.service.spec` — announce in tx, rollback → no events; `commands.service.spec`) | ✅ |
| user-drawer keyboard access | Ticket rows are REAL buttons: Enter AND Space activate them natively, focusable in sequence, accessible names | component (`UserDrawer.test`) | ✅ |
| whitespace-only replies | `"   "` and `" \n\t "` are rejected with 400 at the DTO (trim-before-validate), never stored as empty messages | e2e (`ADMIN REPLY` validation) | ✅ |
| cursor range validation | `before/after` above BIGINT max or zero → 400 (not a DB 500); the exact bigint boundary is accepted | e2e (`CURSOR VALIDATION`) + unit (`message-id-cursor.validator`) | ✅ |
| multi-part send resume | Chunk 2 of 3 fails → progress `meta.sent_chunks = 1` persists; the retry sends ONLY chunks 2–3 (no duplicated parts); all-chunks-sent crash finishes bookkeeping without a Telegram call | unit (`outbox-dispatcher.service.spec` — 3 scenarios) | ✅ |
| panel draft integrity | `key={ticketId}` remounts Composer + Conversation on ticket switch — a draft, its idempotency key and scroll state can never leak into another ticket | component (`Composer.test` — key lifecycle via retry assertions) | ✅ |
| load-older UX | Scroll-anchored prepend (viewport keeps its content position), inline load-older error + retry, muted empty-state copy, operator/customer bubble sides, Sending/Sent/Retrying/Failed badges | component (`Conversation.test`) | ✅ |
| **round 6 — telegram bootstrap degradation** | A failed Telegram bootstrap (bad token / unreachable API / hung getMe probe) is VISIBLE: lifecycle reported `starting → degraded` into the integration state; development keeps serving, PRODUCTION rethrows (the boot aborts); the getMe probe is bounded so a black-holed network cannot hang the boot | unit (`telegraf.gateway.spec` — 6 bootstrap cases incl. hung probe + webhook-mode failure) + unit (`integration-state.service.spec`) | ✅ |
| **round 6 — liveness vs readiness** | `/api/health/live` consults NOTHING (a dead DB/bot never restarts the container); `/api/health/ready` fails 503 on a DB outage OR a degraded Telegram, REFLECTS openRouter status without failing on it; legacy `/api/health` keeps readiness semantics | unit (`health.controller.spec` — 7 cases) + e2e (`round6.e2e-spec` — live/ready/legacy public shapes) | ✅ |
| **round 6 — OpenRouter status reflected** | AI success → `ok`, permanent failure → `degraded` (with reason), no key → `disabled`; a degraded AI NEVER takes the API down | unit (`ai-reply.provider.spec` — lifecycle assertions) | ✅ |
| **round 6 — HttpOnly session cookie** | Login sets `abrit_session` (HttpOnly, SameSite=Strict) + readable `abrit_csrf`; `/auth/me` restores the session from the cookie ALONE; Bearer still works for API clients; logout clears both cookies and the session stops authenticating | e2e (`round6.e2e-spec` — cookie flags, /auth/me, logout) + unit (`jwt-auth.guard.spec` — cookie fallback/precedence) + unit (`session-cookies.spec` — options, expiry parsing, env validation) | ✅ |
| **round 6 — CSRF double submit** | Cookie-authenticated mutation WITHOUT the X-CSRF-Token header → 403; with a MISMATCHING token → 403; with the echoing header → 200; GETs and Bearer requests are exempt (never 403) | unit (`csrf.guard.spec` — 9 cases) + e2e (`round6.e2e-spec` — 403/200/exemptions through the real guards) | ✅ |
| **round 6 — panel holds no token** | The panel never stores a credential in JS: localStorage holds ONLY the display profile; the session is restored via `/auth/me`; logout works even when the server is unreachable | component (`AuthContext.test` — restore/anonymous/login-no-token/logout-offline) | ✅ |
| **round 6 — DB TLS for managed PostgreSQL** | `DATABASE_SSL=true` encrypts; `DATABASE_SSL_CA` pins the server certificate (rejectUnauthorized); `?sslmode=require` in the URL works; default deployments keep the connection unchanged (no ssl block) | unit (`typeorm.config.spec` — 6 cases) | ✅ |
| **smoke — real long-polling launch** | telegraf's `launch()` in polling mode resolves only when polling STOPS (telegraf#1344): it must be fired, not awaited — awaiting it froze `onApplicationBootstrap` forever and the HTTP server never bound with a REAL token (invisible to tests that stub `launch()` as resolving). A never-resolving launch must not block the boot; an async 401/409 rejection degrades the integration; PRODUCTION exits (visible crash-loop over a silent dead bot) | unit (`telegraf.gateway.spec` — "real long-polling launch", 4 cases) | ✅ |
| **smoke — OpenRouter initial state** | With the key CONFIGURED the integration must report `starting` (configured, unproven), not the misleading `disabled` (the state service's initial value) | unit (`ai-reply.provider.spec`) | ✅ |

## Manual scenarios (PDF §11)

| # | Scenario | Status |
|---|---|---|
| 1 | `/start` welcome, free-text → ticket + reply | ✅ simulated via the (secret-protected) webhook endpoint — full pipeline verified, live websocket update in the panel (screenshots) |
| 2 | Multi-turn memory (order-number follow-up) | ⏳ requires a real OpenRouter key; context building, isolation and reply wiring are covered by automated tests. Run this after adding the key |
| 3 | `/close` + `/new` independence | ✅ covered by automated scenario 12/13; repeat manually with the real bot |
| 4 | Status change from panel → Telegram notification | ✅ notification row created and delivered through the gateway (fake/failed-visible while token is empty); repeat with real bot |
| 5 | Cutting the network / broken OpenRouter key → message stored + fallback | ✅ covered by automated AI failure tests |
| 6 | Sending the same webhook update twice → exactly one DB row | ✅ verified functionally AND in e2e |

Screenshots of the real run: `docs/screenshots/*.png` — including a Telegram
message appearing live in the open ticket over the websocket.

## Real-credential smoke test (6 Nov 2026, @ABRIT_Ticket_Bot)

Run with the owner's real Telegram bot token and OpenRouter key (filled in
`.env` only — never committed; tokens stay out of the repo).

| Check | Result |
|---|---|
| `getMe()` with the real token | ✅ `@ABRIT_Ticket_Bot` (ABRIT Support) |
| Polling bootstrap (`onApplicationBootstrap`) | ✅ after the launch fix: `Polling started`, HTTP bound, readiness `telegram: ok` — **before the fix the whole bootstrap froze and the API never listened** (P0 found only by this smoke test) |
| Webhook ingestion (secret-protected) → inbox → ticket | ✅ TKT-10004 created from a synthetic update, inbox `DONE / REPLY_SAVED` on attempt 1 |
| Real OpenRouter reply | ✅ `nvidia/nemotron-3-ultra-550b-a55b:free`, 358 tokens (175 prompt + 183 completion), 5.1 s latency, honest Persian reply; integration state flipped `starting → ok` |
| Outbox → real Telegram send | ✅ real API answered `400 Bad Request: chat not found` for the synthetic chat — classified PERMANENT, ONE attempt, terminal FAILED (no wasted retries) |
| Panel API with HttpOnly session | ✅ login → `abrit_session` cookie → `/auth/me` restore → tickets/messages with real AI meta; live OpenRouter model list in Settings |
| OpenRouter `openrouter/auto` (former default) | ❌ 403 "not available in your region" for the owner's key → default model changed to the verified free model |
| Google models (`gemma-4-*`) | ❌ 400 "User location is not supported" for this key/region — avoid |
| Key limits | free tier: $50 key budget, 50 free-model requests/day; **key expires 2026-11-13 — renew it before then** |

What remains manual: a REAL user chatting with the bot on Telegram (the send
path was verified with a real API error for a synthetic chat; a real chat
requires a human to write to `@ABRIT_Ticket_Bot`).

## What still needs real credentials

1. ~~Real Telegram bot end-to-end (polling, actual chat).~~ — polling, webhook
   ingestion, outbox and a REAL Telegram API error path verified in the smoke
   test; only a human↔bot conversation remains manual.
2. ~~Real OpenRouter multi-turn conversation quality check.~~ — single-turn
   real reply verified (quality, latency, tokens); a longer multi-turn
   conversation is best done live by the owner.
