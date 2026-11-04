# AbrIT — AI-Powered Telegram Ticketing System

Telegram support bot with an AI assistant (OpenRouter), a web admin panel (React),
a NestJS backend and PostgreSQL. Built for the AbrIT technical trial assignment.

> **Status:** phase-by-phase development in progress — every phase is a separate,
> verified commit on `main`. See the roadmap in `docs/`.
>
> **Stack:** NestJS 11 · TypeORM · PostgreSQL 16 · Telegraf · OpenRouter ·
> React + Vite + TypeScript + Ant Design + TanStack Query + Socket.IO

## Quick start (development)

```bash
cp .env.example .env        # fill JWT_SECRET; Telegram/OpenRouter keys stay empty for now
docker compose up -d db      # PostgreSQL 16 on :5432 (db-test on :5433)
cd backend
npm install
npm run start:dev            # migrations run automatically on boot
# health check: http://localhost:3000/api/health
```

While `TELEGRAM_BOT_TOKEN` / `OPENROUTER_API_KEY` are empty, the Telegram and AI
integrations remain disabled (logged at boot) — every other subsystem works.

## راه‌اندازی سریع (فارسی)

```bash
cp .env.example .env        # مقدار JWT_SECRET را عوض کنید؛ توکن تلگرام و OpenRouter فعلاً خالی می‌ماند
docker compose up -d db     # پایگاه‌داده PostgreSQL نسخه ۱۶ روی پورت 5432
cd backend
npm install
npm run start:dev           # مایگریشن‌ها هنگام بوت خودکار اجرا می‌شوند
# بررسی سلامت سرویس: http://localhost:3000/api/health
```

تا وقتی توکن تلگرام و کلید OpenRouter خالی باشد، این دو سرویس غیرفعال می‌مانند و
بقیه سیستم (پنل، API و پایگاه‌داده) کامل کار می‌کند.
