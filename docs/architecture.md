# Architecture

## The one rule this system optimizes for

No message is ever lost and nothing is ever processed twice. Everything else
(dashboard, panel niceties) is secondary to that guarantee.

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
Whatever happens in between is retryable and idempotent.

## Components

| Component | Responsibility |
|---|---|
| `modules/telegram` | Telegraf transport (polling/webhook), gateway interface, webhook controller (constant-time secret), outbox dispatcher, sweeper |
| `modules/conversation` | Orchestrator (claim → upsert → command/ticket flow → reply) and bot commands; per-chat serial promise queue |
| `modules/ai` | `AiProvider` interface, `OpenRouterProvider` (fetch, no SDK), `ContextBuilder` (ticket isolation), retry/backoff policy, concurrency semaphore |
| `modules/inbox` | `bot_updates` ingest/claim/requeue |
| `modules/{users,tickets,messages,settings}` | Domain services (business rules + outbox writes) |
| `modules/auth`, global guard | JWT everywhere except `@Public()` routes; login rate-limited |
| `modules/ws` | Socket.IO gateway (same JWT, room `admins`) bridged to domain events |
| `modules/dashboard` | One aggregate query (COUNT FILTER) + users count |

## Crash matrix

| Crash point | Result after restart |
|---|---|
| Before inbox insert | Telegram re-delivers (webhook) or offset not acked (polling) — nothing lost |
| Inbox stored, not processed | Sweeper re-drives RECEIVED rows |
| Mid-processing (row PROCESSING) | Sweeper requeues after 2 min, ≤ 3 attempts, then FAILED |
| After USER message stored, before reply | Re-run skips the duplicate USER row (unique `telegram_update_id`) and the unique partial index blocks a second ASSISTANT reply for the same `in_reply_to_id` |
| After outbox insert, before send | Sweeper delivers PENDING rows (5 attempts, `retry_after` honored) |

## Concurrency controls

- **Per-chat ordering** — an in-process `Map<chat_id, Promise>` serializes each
  user's updates so the second message's AI context contains the first reply.
- **AI concurrency cap** — a counting semaphore (default 3) protects the
  OpenRouter rate limit.
- **One active ticket per user** — PostgreSQL partial unique index, race-free.
- **Atomic claim** — `UPDATE … WHERE status='RECEIVED' RETURNING` so two workers
  can never process the same update.

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

- Per-chat queue is in-memory → single instance (see scale-up path).
- Outbox delivery is at-least-once: a crash between a successful Telegram send
  and the SENT update can duplicate one message.
- Context windowing is message-count + character-budget, not exact token count.
- JWT in localStorage (Bearer) — httpOnly cookies are the hardened upgrade.
- A message right after `/close` opens a NEW ticket (simple, PDF-compliant
  policy; a post-close grace window is the possible refinement).
