# Test Report

- **Date:** 13–15 Aban 1405 / 4–6 Nov 2026
- **Environment:** Node v24.22.2 · PostgreSQL 16+ (real server, not SQLite) ·
  NestJS 11 · TypeORM 0.3 · Jest 29 + ts-jest + Supertest · socket.io-client (e2e)
- **CI:** GitHub Actions runs backend build + unit tests, e2e on PostgreSQL 16
  and the frontend build on every push (`.github/workflows/ci.yml`)
- **Telegram/OpenRouter credentials:** intentionally empty during this test run
  (per the project owner's instruction). No test performs any network call to
  Telegram or OpenRouter — delivery is faked, AI is either disabled or the
  honest fallback. Real-credential smoke testing remains to be done by the
  owner (see "Manual scenarios").

## Commands

```bash
cd backend
npm test            # unit
npm run test:cov    # unit + coverage
npm run test:e2e    # 24 scenarios, REAL PostgreSQL (database abrit_test)
```

## Automated results (actual output)

```
Unit:      Test Suites: 17 passed, 17 total
           Tests:       146 passed, 146 total

E2E:       Test Suites:  1 passed,  1 total
           Tests:        24 passed, 24 total

Coverage:  ~84% statements (baseline held; all new code is covered by the suites below)
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

## What still needs real credentials

1. Real Telegram bot end-to-end (polling, actual chat).
2. Real OpenRouter multi-turn conversation quality check.
Both activate purely by filling `TELEGRAM_BOT_TOKEN` / `OPENROUTER_API_KEY`
in `.env` — no code changes.
