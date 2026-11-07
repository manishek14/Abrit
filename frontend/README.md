# AbrIT Admin Panel (frontend)

Production admin SPA for the AbrIT Telegram support-ticketing system.
Vite + React 18 + TypeScript (strict) + Ant Design 5 + TanStack Query v5 +
axios + react-router v7 + socket.io-client v4, with dayjs for dates.

> **Repository split:** this panel was extracted from the
> [AbrIT monorepo](https://github.com/manishek14/Abrit); the NestJS backend
> (Telegram bot, REST API, Socket.IO, PostgreSQL) now lives in
> [Abrit-back](https://github.com/manishek14/Abrit-back).

## Screenshots

![login](docs/screenshots/01-login.png)
![dashboard](docs/screenshots/02-dashboard.png)
![live ticket](docs/screenshots/03-ticket-live.png)
![settings](docs/screenshots/04-settings.png)

*(Screenshots are from a real run — the ticket screen shows a Telegram
message arriving over the live websocket while the panel stays open.)*

## Features

- **Auth** — email/password login, JWT stored in `localStorage` under
  `abrit.accessToken`; any 401 clears the session and redirects to `/login`.
- **Dashboard** — six stat cards (total / open / in-progress / closed /
  today's new / Telegram users) plus an `updatedAt · timezone` tag.
- **Tickets** — server-side paginated table, status filter and ticket-number
  search, all synced to URL query params (`?status=OPEN&q=10001&page=2`) so
  refresh/back keeps the exact view. Row click opens the ticket.
- **Ticket detail** — ticket + user info, status change via Select +
  Popconfirm (toasts for success, no-op, 400 and 409 errors), and a live chat
  transcript: USER right/blue, ASSISTANT left (with model tag from `meta`),
  ADMIN right/green, SYSTEM centered gray italic. Persian content renders
  correctly via `dir="auto"` + `unicode-bidi: plaintext`. Failed deliveries
  are flagged with the error in a tooltip. Auto-scrolls when near bottom.
- **Users** — Telegram users table (id, @username, name, ticket count,
  blocked, joined) with search; row click opens a drawer with the profile
  and the user's tickets.
- **Settings** — assistant system prompt (textarea), model
  (AutoComplete fed by `/settings/assistant/models`, free text allowed —
  required for the fallback list), active switch; shows `updated_at`.
- **Realtime** — Socket.IO events (`ticket:new`, `ticket:updated`,
  `message:new`, `message:updated`) drive query-cache updates. While the
  socket is offline (or before the first connect) TanStack Query polls
  instead: dashboard 30s, tickets list 15s, conversation 5s using cheap
  incremental `after=<lastId>` requests. Header badge shows Live/Polling.

## Getting started

```bash
npm install
npm run dev      # dev server on http://localhost:5173
npm run build    # type-check (tsc -b) + production build
npm run preview  # serve the production build
```

The backend is expected at `http://localhost:3000` (REST under `/api`,
Socket.IO at the root). Override with env vars if needed — e.g. create your
own `.env.local` (not committed; no real values in this repo):

| Variable         | Default                     |
| ---------------- | --------------------------- |
| `VITE_API_URL`   | `http://localhost:3000/api` |
| `VITE_WS_URL`    | `http://localhost:3000`     |

## Project structure

```
src/
├── api/
│   ├── client.ts       # axios instance + auth/401 interceptors + error helper
│   ├── hooks.ts        # TanStack Query hooks (polling fallback logic lives here)
│   ├── keys.ts         # query-key registry
│   ├── queryClient.ts  # QueryClient defaults
│   └── token.ts         # localStorage session helpers
├── components/         # AdminLayout, Conversation (chat), UserDrawer, ...
├── context/
│   ├── AuthContext.tsx  # token/admin state, login/logout
│   └── SocketContext.tsx# socket lifecycle + WS events → cache updates
├── pages/               # Login, Dashboard, Tickets, TicketDetail, Users, Settings
├── socket.ts            # socket factory + current-ticket tracker
├── types.ts             # shared API types (snake_case mirrors the backend)
└── utils/               # message merging (bigint-id safe), formatting helpers
```

## Notes

- All API field names are kept in the backend's snake_case; types in
  `src/types.ts` document the exact contract.
- Message ids are bigint strings; ordering compares them numerically
  (`BigInt`), never lexicographically.
- No secrets are committed; the API/WS base URLs come from env vars with
  localhost defaults.

## Sync provenance

- **Sync base:** `manishek14/Abrit@4dde1ca` — monorepo `main` HEAD at
  extraction time (2026-11-06). Every commit below the extraction commit maps
  1:1 to a monorepo commit that touched `frontend/`.
- Application code is byte-identical to the monorepo subtree (verified by git
  tree-hash comparison); standalone additions are limited to the CI workflow,
  `.env.example`, this note and the copied screenshots.
- To sync future monorepo changes: cherry-pick monorepo commits touching
  `frontend/`, or re-run `git filter-branch --subdirectory-filter frontend`
  on the monorepo and merge.
