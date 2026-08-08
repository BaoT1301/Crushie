# Crushie

### AI Dating Coach for Students

_Learn communication skills through AI-powered profile analysis, conversation coaching, and real-time feedback._

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Gemini](https://img.shields.io/badge/Gemini-2.0_Flash-4285F4?logo=google)](https://ai.google.dev/)
[![Azure](https://img.shields.io/badge/Azure_OpenAI-Phi--4-0078D4?logo=microsoftazure)](https://azure.microsoft.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase)](https://supabase.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://www.docker.com/)
[![tRPC](https://img.shields.io/badge/tRPC-11-2596BE?logo=trpc)](https://trpc.io/)
[![Clerk](https://img.shields.io/badge/Clerk-Auth-6C47FF?logo=clerk)](https://clerk.com/)

</div>

---

## Overview

**Crushie** is an AI-powered communication coach that helps students build real social skills through profile analysis and personalized feedback—like Duolingo, but for dating.

Upload a dating profile screenshot → AI analyzes their communication style → Get personalized conversation starters and date ideas.

---

## Key Features

**Profile Analyzer** - Upload a screenshot, get instant insights:
- Communication style prediction (playful, intellectual, direct, adventurous, shy)
- 8 personalized conversation starters
- 3 date suggestions with compatibility scoring
- Uploads go to a private bucket and are served only through short-lived signed
  URLs, scoped to the uploader by RLS

> **On storage, precisely:** the *database* really does keep only a hash —
> `analyzer_sessions` has an `image_hash` column and no image or URL column at
> all. But the uploaded screenshots themselves do persist in Supabase Storage
> under `{userId}/analyzer/`, private and owner-scoped, served only through
> expiring signed URLs. So "we never store your images" is true of the database
> and false of the bucket. Retention is enforced by a scheduled job (see
> `/api/cron/retention`); before that job existed, uploads were kept forever.

**Educational Framework** - Learn social skills through practice:
- Track your communication progress
- Build confidence with AI feedback
- Practice in a judgment-free space

**AI** - OpenAI, via a dedicated service:
- `gpt-4o` for analysis, matching and identity verification
- `gpt-4o-mini` for the realtime coach, which runs at high frequency
- Optional Redis caching in front of both

> Earlier revisions described a "dual AI system" over Google Gemini and Azure
> OpenAI Phi-4, with a 98.5% uptime figure. There is no such fallback — the
> Gemini and Azure clients were deleted — and that number was never measured.

---

## Tech Stack

**Frontend:** Next.js 16, TypeScript, tRPC, Framer Motion  
**Backend:** Node.js, Express, PostgreSQL (Supabase), Drizzle ORM  
**AI:** Google Gemini 2.0 Flash + Azure OpenAI Phi-4  
**Auth:** Clerk with JWT-based Row Level Security  
**Infrastructure:** Docker, Redis caching

---

## Quick Start

### Prerequisites
- Node.js 22+
- Docker Desktop
- Supabase CLI

### Installation

```bash
# Install dependencies
npm install

# Start Supabase
npx supabase start

# Start LLM service
cd apps/llm
docker compose up -d

# Start web client
cd apps/web-client
npm run dev
```

Visit `http://localhost:3000/analyze-profile`

---

## Environment Variables

Each app ships a fully commented `.env.example`. Copy it and fill in the blanks
rather than working from the summary below:

```bash
cp apps/web-client/.env.example apps/web-client/.env
cp apps/llm/.env.example        apps/llm/.env
```

The file must be named `.env`, not `.env.local` — `src/db/index.ts` and
`drizzle.config.ts` load that exact filename via dotenv.

### Web Client (`apps/web-client/.env`)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | |
| `CLERK_SECRET_KEY` | yes | |
| `DATABASE_URL` | yes | Must use the `crushie_app` role from migration 00009, not `postgres` |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Also the SSRF allowlist source for image fetching |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Storage operations |
| `LLM_URL` | yes in prod | Defaults to localhost:3001; silently wrong when deployed |
| `LLM_SERVICE_TOKEN` | yes in prod | Shared secret with the LLM service |
| `NEXT_PUBLIC_APP_URL` | recommended | Defaults to localhost:3000 for server-side tRPC |
| `GOOGLE_MAPS_API_KEY` | optional | Real venues in date suggestions |
| `OPENWEATHER_API_KEY` | optional | Weather-aware planning |
| `CLERK_WEBHOOK_SECRET`, `RESEND_API_KEY` | optional | Password-change email only |

Clerk also needs a JWT template named exactly `supabase`, created in the Clerk
dashboard. Without it every authenticated procedure throws `UNAUTHORIZED` even
though the keys are valid.

### LLM Service (`apps/llm/.env`)

| Variable | Required | Notes |
|---|---|---|
| `OPENAI_API_KEY` | yes | |
| `LLM_SERVICE_TOKEN` | yes in prod | Must match the web client's value |
| `NODE_ENV` | yes in prod | Left as `development` the service accepts unauthenticated requests and leaks error internals |
| `CORS_ORIGINS` | yes in prod | Defaults to localhost:3000 |
| `OPENAI_MODEL`, `OPENAI_FAST_MODEL` | optional | Default `gpt-4o` / `gpt-4o-mini` |
| `REDIS_URL` | optional | Caching; degrades gracefully when absent |
| `ELEVENLABS_API_KEY` | optional | Voice for the glasses simulator |

> Earlier revisions of this README documented `GEMINI_API_KEY`, `AZURE_OPENAI_*`
> and `DIRECT_URL`. Those are gone — the service moved to OpenAI, and no code
> reads any of them. Configuring them does nothing.

### Before going live

```bash
npm run db:preflight   # verifies RLS, pgvector, seeds, bucket privacy, migrations
```

All checks must pass. Then run `supabase/launch/remove-demo-profiles.sql` to
clear the seeded demo personas.

---

## Project Structure

```
crushie/
├── apps/
│   ├── web-client/          # Next.js web app
│   │   ├── src/app/         # App router pages
│   │   └── src/services/    # tRPC procedures
│   └── llm/                 # AI microservice
│       ├── src/routes/      # API endpoints
│       └── src/lib/         # Prompt templates
└── supabase/
    └── migrations/          # Database schema
```

---

## Key Scripts

```bash
# Development
npm run dev:web              # Start web client
npm run dev:llm              # Start LLM service

# Quality gates
npm run typecheck            # tsc across the web app
npm run lint                 # eslint
npm test                     # unit tests (llm service)
npm run test:e2e             # Playwright, needs a server on :3000

# Database
npx supabase db push         # Apply supabase/migrations (canonical)
npm run db:preflight         # 8 checks that catch silent misconfiguration
npm run db:backfill-embeddings --workspace=@starter/web

# Docker
cd apps/llm && docker compose up -d    # Start LLM service
```

> `npm run db:push` and `db:migrate` are deliberately blocked — both would apply
> the Drizzle-generated schema, which models none of this project's RLS policies,
> SQL functions or pgvector indexes and would drop them.

---

## Deploying

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full runbook: topology, the
environment variables with no safe default, migration order, embeddings backfill,
the retention cron, and a pre-launch checklist.

---

## How It Works

1. **Upload** - User uploads dating profile screenshot
2. **Hash** - Client-side SHA-256 hashing (privacy-first)
3. **Analyze** - AI analyzes communication style via Gemini Vision API
4. **Generate** - LLM creates conversation starters and date suggestions
5. **Display** - Animated results with copy-to-clipboard features

---

## Built With

- **PatriotAI** - Prompt design and concept development
- **Google Gemini 2.0 Flash** - Multimodal vision analysis
- **Microsoft Azure OpenAI** - Enterprise reliability fallback
- **Supabase** - PostgreSQL with Row Level Security
- **Docker** - Containerized LLM service

---

## License

This project is proprietary. All rights reserved.

---

## Team

- Bao Tran https://github.com/BaoT1301
- Lam Anh https://github.com/anhlamtruong
- Mai Tran https://github.com/tranthanhmai2006
- Nguyen Ho https://github.com/hodangkhoinguyen

---

<div align="center">

**Built at PatriotHacks 2026** 🚀

</div>
