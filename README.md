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
- Privacy-first: only hashes stored, never raw images

**Educational Framework** - Learn social skills through practice:
- Track your communication progress
- Build confidence with AI feedback
- Practice in a judgment-free space

**Dual AI System** - Enterprise-grade reliability:
- Primary: Google Gemini 2.0 Flash (fast, cost-efficient)
- Fallback: Microsoft Azure OpenAI Phi-4 (98.5% uptime)

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

### Web Client (`apps/web-client/.env.local`)

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_key
CLERK_SECRET_KEY=your_secret

# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# LLM Service
LLM_URL=http://localhost:3001
```

### LLM Service (`apps/llm/.env`)

```bash
# AI Providers
GEMINI_API_KEY=your_key
AZURE_OPENAI_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_OPENAI_KEY=your_key
AZURE_OPENAI_DEPLOYMENT=Phi-4-mini-instruct
AZURE_OPENAI_API_VERSION=2024-05-01-preview

# Caching
REDIS_URL=redis://localhost:6379
```

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

# Database
npx supabase start           # Start local database
npx supabase db reset        # Reset database with migrations

# Docker
cd apps/llm && docker compose up -d    # Start LLM service
```

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
