# Architecture

## The one rule this system optimizes for

**No message is ever lost** — every inbound update is persisted before
anything else (inbox `INSERT … ON CONFLICT DO NOTHING`) and every outbound
message is persisted as `PENDING` before any network attempt (transactional
outbox). **Nothing is processed twice** in normal operation: each step is
idempotent (PK/update_id dedup, atomic claims, partial unique indexes), so
retries and crashed attempts resume instead of duplicating work.

The precise delivery semantics are **at-least-once, single-send guaranteed**:

- concurrent duplicate *sends* are impossible (atomic claim with a 60 s lease);
- storage and processing are idempotent — the same update can never produce
  two user messages or two assistant replies;
- the ONE residual window is a hard crash between a successful Telegram send
  and the `SENT` update: that single outbound message can be re-sent once
  (Telegram dedups nothing; the user may see it twice). Exactly-once delivery
  is impossible across an unacknowledged external API call — claiming
  otherwise would be dishonest.

Everything else (dashboard, panel niceties) is secondary to that guarantee.

## The path of a message (9 steps)

```
1  Telegram update          user sends a message to the bot
2  Ingest (webhook|polling) secret check → instant HTTP 200
3  bot_updates (inbox)      INSERT … ON CONFLICT DO NOTHING  ← point of no return
4  Processor                atomic claim (RECEIVED → PROCESSING)
5  Conversation             user upsert → active ticket → USER message (short tx)
6  Context builder          last N messages OF THE SAME ticket only
7  AI provider → OpenRouter timeout · retry ≤ 2 · fallback model
8  messages (outbox)        ASSISTANT reply stored PENDING     ← second point of no return
9  Telegram gateway         SENT or FAILED (+ sweeper retries)
```

After step 3 the user's message cannot be lost; after step 8 the reply cannot.
Whatever happens in between is retryable, idempotent — and **resumable**: each
completed milestone is recorded on `bot_updates.stage`
(`CLAIMED → USER_SAVED → REPLY_SAVED`), so a re-run after a crash CONTINUES
the half-finished work instead of dropping it.

## Components

| Component | Responsibility |
|---|---|
| `modules/telegram` | Telegraf transport (polling/webhook), gateway interface, webhook controller (constant-time secret), outbox dispatcher, sweeper |
| `modules/conversation` | Orchestrator (claim → upsert → command/ticket flow → reply) and bot commands; per-chat serial promise queue |
| `modules/ai` | `AiProvider` interface, `OpenRouterProvider` (fetch, no SDK), `ContextBuilder` (ticket isolation), retry/backoff policy, concurrency semaphore |
| `modules/inbox` | `bot_updates` ingest/claim/requeue + stage tracking + retention purge |
| `modules/{users,tickets,messages,settings}` | Domain services (business rules + outbox writes) |
| `modules/auth`, global guard | JWT everywhere except `@Public()` routes; login rate-limited |
| `modules/ws` | Socket.IO gateway (same JWT, room `admins`) bridged to domain events |
| `modules/dashboard` | One aggregate query (COUNT FILTER) + users count |

## Crash matrix

| Crash point | Result after restart |
|---|---|
| Before inbox insert | Telegram re-delivers (webhook) or offset not acked (polling) — nothing lost |
| Inbox stored, not processed | Sweeper re-drives RECEIVED rows |
| Mid-processing (row PROCESSING) | Sweeper requeues after 2 min, ≤ 3 attempts, then FAILED (last_error preserved) |
| After USER message stored, before reply | **RESUME**: `addUserMessage` returns the already-stored row, the AI reply step then runs — the user is never left unanswered. An already-stored reply short-circuits the AI call |
| After outbox insert, before send | Sweeper delivers PENDING rows (5 attempts, `retry_after` honored); a crashed sender's lease (`claimed_at`) expires after 60 s and the row is reclaimed |

Events (websocket broadcast + immediate dispatch) are fired **after the
transaction commits**, so the panel and the dispatcher never observe a change
that could still roll back. The durable outbox insert itself stays INSIDE the
transaction (transactional-outbox pattern).

## Concurrency controls

- **Per-chat ordering** — an in-process `Map<chat_id, Promise>` serializes each
  user's updates so the second message's AI context contains the first reply.
  ⚠ **Single-instance only**: the queue lives in process memory — with two or
  more backend instances behind a load balancer, updates of the same chat may
  land on different instances and their relative processing order is NOT
  guaranteed. Multi-instance ordering needs the scale-up path below (per-chat
  advisory locks or a shared queue).
- **AI concurrency cap** — a counting semaphore (default 3) protects the
  OpenRouter rate limit.
- **One active ticket per user** — PostgreSQL partial unique index, race-free;
  the service maps any CLOSED → active transition violation to a controlled
  409 (never a leaking 500).
- **Atomic claim (inbox)** — `UPDATE … WHERE status='RECEIVED' RETURNING` so two
  workers can never process the same update.
- **Atomic claim (outbox)** — every send starts with
  `claimForDelivery`: `UPDATE messages SET claimed_at = now() WHERE …` with a
  60 s lease; the immediate dispatcher and the sweeper can never deliver the
  same message twice, even concurrently.
- **Multi-part sends are resumable** — after every successfully delivered
  chunk the progress is committed to `messages.meta.sent_chunks`; a retry
  (sweeper or crash recovery) continues at the first UNSENT chunk, so the
  user never receives an already-delivered part twice.
- **Operator replies are idempotent end-to-end** — the panel generates a
  `client_message_id` per draft-send and reuses it on retry; a partial unique
  index (`role = 'ADMIN'`) turns a duplicate insert into a replay of the
  ORIGINAL message. The status check and the insert share one transaction
  holding the ticket row's pessimistic_write lock (the SAME lock
  `changeStatus` takes), so a reply can never slip into a ticket that closed
  concurrently.

## Data retention

`bot_updates` keeps the RAW Telegram payloads (needed only for crash-recovery
replays). `InboxRetentionService` purges rows older than
`BOT_UPDATES_RETENTION_DAYS` (default 30, `0` = keep forever) daily at 04:00 and
once at boot. Conversation messages (the actual ticket history) are kept
indefinitely and are NOT affected by the purge.

## Scale-up path (documented, not built — deliberate simplicity)

| When | Change | Cost |
|---|---|---|
| Multiple API/worker instances | `FOR UPDATE SKIP LOCKED` claim + Postgres advisory locks per chat; run the worker as a separate process (same code) | low |
| Heavier AI load | Real queue (BullMQ/Redis) behind the same `enqueue` interface | medium |
| Large tables | Partition `bot_updates.payload` out after 30 days; monthly partitioning; indexes are already in place | low |
| Very long tickets | Rolling summary of old messages + precise token budget | medium |
| Multi-admin/roles | `admins` roles table, audit log | medium |
| Observability | pino structured logs keyed by ticket_number/update_id, request-id, metrics | low |

## Known limitations

- **Per-chat ordering is NOT guaranteed in multi-instance deployments** — the
  queue is in-memory (single instance). Run exactly one backend instance per
  database until the scale-up path (per-chat advisory locks / shared queue)
  is built; no ordering claim should be made for horizontally-scaled setups.
- Outbox delivery is at-least-once ONLY across a hard crash between a successful
  Telegram send (of the LAST chunk) and the SENT update (concurrent duplicate
  sends are impossible — atomic claim; per-chunk progress prevents multipart
  duplication); that rare crash window can duplicate one message.
- Context windowing is message-count + character-budget, not exact token count.
- JWT in localStorage (Bearer) — httpOnly cookies are the hardened upgrade.
- A message right after `/close` opens a NEW ticket (simple, PDF-compliant
  policy; a post-close grace window is the possible refinement).
- Real Telegram/OpenRouter credentials are not exercised in the automated
  suites (delivery is faked) — a real-bot smoke run remains an owner task.
