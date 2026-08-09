# Deploying Crushie

Two services. The Next.js app and a separate Express AI service. The app cannot
work without the second one — every AI feature calls it — so deploy both or
neither.

---

## Recommended topology

**Both on Railway.**

The AI service holds `OPENAI_API_KEY` and every endpoint on it spends money. On
Railway both services share a private network, so it never needs a public URL
and the only thing that can reach it is your own app. On a Vercel + Railway
split, that service must be internet-facing and the shared `LLM_SERVICE_TOKEN`
becomes the only thing standing between the internet and your OpenAI bill.

Vercel + Railway is still fine and is the more conventional split — Next on
Vercel is zero-config. Choose it if you want Vercel's edge network. You are not
currently using anything Vercel-specific: `next/image` is imported nowhere and
no route uses ISR.

Redis is optional but worth adding on either host. Without it every AI response
is uncached, which costs money and latency on repeat requests.

---

## Railway, step by step

Two services in one Railway project, so the AI service can stay on the private
network and never take a public URL.

Config lives in the repo (`railway.json` at the root for the web app,
`apps/llm/railway.json` for the AI service), so build and start commands are
already set. The steps below are the parts Railway cannot infer.

### 1. Create the project

1. Railway dashboard, **New Project**, **Deploy from GitHub repo**
2. Pick `BaoT1301/Crushie` and authorise access
3. Railway creates one service. Rename it to **web** in Settings.

### 2. Configure the web service

Settings, Source:

* **Root Directory:** `/` (leave as the repo root)

Root matters here. This is an npm workspaces monorepo, so `npm ci` has to run
where the lockfile is. Pointing the root at `apps/web-client` breaks dependency
resolution.

Build and start commands come from `railway.json`. Do not override them.

Under Settings, Networking, click **Generate Domain**. Note the URL.

### 3. Add the AI service

1. In the same project, **New**, **GitHub Repo**, pick the same repository
2. Rename it to **llm**
3. Settings, Source, **Root Directory:** `apps/llm`

That root directory makes Railway find `apps/llm/Dockerfile` and
`apps/llm/railway.json`. The Dockerfile detects whether it was given the repo
root or the app directory, so both work, and it installs only that workspace.

**Do not generate a public domain for this service.** It holds the OpenAI key
and every endpoint on it spends money. Left private, it is reachable only from
inside the project.

### 4. Add Redis

**New**, **Database**, **Add Redis**. Railway injects `REDIS_URL` into the
project. Without it the AI service still runs, with caching disabled, so every
repeated call pays full price.

### 5. Environment variables

Generate two shared secrets first:

```bash
openssl rand -hex 32    # LLM_SERVICE_TOKEN
openssl rand -hex 32    # CRON_SECRET
```

On the **llm** service:

| Variable | Value |
|:--|:--|
| `OPENAI_API_KEY` | your key |
| `LLM_SERVICE_TOKEN` | the first generated secret |
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | the web service public URL |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `ELEVENLABS_API_KEY` | optional, voice for the live coach |

`NODE_ENV` is the one to double check. Left at development the service accepts
unauthenticated requests and returns internal error detail, which turns it into
an open proxy on your OpenAI key.

On the **web** service:

| Variable | Value |
|:--|:--|
| `DATABASE_URL` | Supabase pooler URI using the `crushie_app` role |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk live key |
| `CLERK_SECRET_KEY` | Clerk live key |
| `LLM_SERVICE_TOKEN` | the same first secret, byte for byte |
| `LLM_URL` | `http://llm.railway.internal:3001` |
| `NEXT_PUBLIC_APP_URL` | the web service public URL |
| `CRON_SECRET` | the second generated secret |

`LLM_URL` uses the private hostname, which is `<service name>.railway.internal`.
If you named the service something other than `llm`, match it here. Private
networking runs over IPv6; the service listens on all interfaces by default, so
nothing extra is needed.

### 6. Apply migrations and verify

From your machine, with `DATABASE_URL` pointing at the same database:

```bash
npx supabase link --project-ref <your-ref>
npx supabase db push
npm run db:preflight            # all 9 checks must pass
```

Then backfill embeddings, which needs the AI service reachable. Easiest from
Railway itself:

```bash
railway run --service web npm run db:backfill-embeddings --workspace=@starter/web
```

### 7. Schedule retention

Railway has no equivalent of `vercel.json` crons, so add a third service:

1. **New**, **Empty Service**, name it **retention**
2. Settings, Source, connect the same repo, Root Directory `/`
3. Settings, Deploy, **Cron Schedule:** `0 4 * * *`
4. Custom Start Command:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/retention"
```

5. Add `CRON_SECRET` (same value as the web service) and `APP_URL` (the web
   service public URL) to this service

The endpoint fails closed: with `CRON_SECRET` unset it returns 503 rather than
running unauthenticated, so a misconfigured cron deletes nothing.

### 8. Check it

```bash
curl -I https://<your-web-domain>/
curl https://<your-web-domain>/robots.txt
```

The AI service should have no public domain at all. To confirm it is wired up,
sign in and run one analysis: if `LLM_URL` or the shared token were wrong you
would get a failure there rather than at build time.

## 1. Database

Migrations are the 15 files in `supabase/migrations/`, applied in order.

```bash
npx supabase link --project-ref <your-ref>
npx supabase db push
```

Or paste each file into the Supabase SQL editor, which runs as `postgres`.

> `npm run db:push` is deliberately blocked. It maps to `drizzle-kit push`,
> which diffs the Drizzle model against the live database and applies the
> difference — and Drizzle models none of the RLS policies, SQL functions or
> pgvector indexes this schema depends on, so it would silently drop all of
> them.

### Create the application role

`DATABASE_URL` must **not** use Supabase's default `postgres` role. That role has
`BYPASSRLS`, which makes every policy in this schema inert — the app appears to
work while enforcing nothing.

Migration `00009` creates a `crushie_app` role with no password. Set one out of
band, never in a tracked file:

```bash
openssl rand -base64 32                       # generate
psql "$SUPERUSER_URL" -c "ALTER ROLE crushie_app PASSWORD '<generated>';"
```

Then point `DATABASE_URL` at it, using the **transaction pooler** (port 6543):

```
postgresql://crushie_app.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

### Verify before going further

```bash
npm run db:preflight --workspace=@starter/web
```

All 9 checks must pass. Every one of them exists because the corresponding
failure is **silent** — a role that bypasses RLS, missing policies, an
unapplied migration, profiles with no embedding, a public storage bucket, and a
vector index that quietly returns a fraction of the matches it should.

That last one is worth calling out. The original ivfflat index (`lists = 100`,
`probes = 1`) returned **2 of 9** profiles on this database — 22% recall, no
error, no warning. Migration `00015` replaces it with HNSW. If
`similarity search has full recall` fails, matching is dropping candidates and
no amount of application code will compensate.

---

## 2. Clerk

Create a JWT template named exactly **`supabase`** (Configure → JWT Templates →
New → Supabase).

Without it, every authenticated procedure throws `UNAUTHORIZED` even though your
keys are valid, because `secure-client.ts` requests that template to build the
RLS claims. This is the single most common way this app looks broken for no
reason.

For production, switch to live keys (`pk_live_` / `sk_live_`). Test keys are
what produce the "Development mode" badge, and they skip real verification on
sign-up.

Optionally add a webhook to `<your-host>/api/webhooks/clerk` for `user.updated`
and set `CLERK_WEBHOOK_SECRET`. It only drives the password-change email; skip it
if you are not sending mail.

---

## 3. The AI service (`apps/llm`)

```bash
npm run build --workspace=@starter/llm
npm start --workspace=@starter/llm
```

A `Dockerfile` is included. Required environment:

| Variable | Notes |
|---|---|
| `OPENAI_API_KEY` | |
| `LLM_SERVICE_TOKEN` | Must match the web app's value exactly. `openssl rand -hex 32` |
| `NODE_ENV=production` | **The most important line here** — see below |
| `CORS_ORIGINS` | Your web origin(s), comma-separated |
| `REDIS_URL` | Optional; caching is disabled without it |
| `ELEVENLABS_API_KEY` | Optional; the glasses simulator is silent without it |

> Left at `development`, `NODE_ENV` makes the service accept **unauthenticated**
> requests and return internal error detail. That turns it into an open proxy on
> your OpenAI key. It fails closed in every other mode, which is why this one
> variable matters more than the rest.

---

## 4. The web app (`apps/web-client`)

Set everything from `apps/web-client/.env.example`. The ones with no safe
default:

| Variable | If unset |
|---|---|
| `LLM_URL` | Defaults to `localhost:3001` → every AI feature `ECONNREFUSED`s at request time, with no build-time warning |
| `LLM_SERVICE_TOKEN` | Header is omitted → the AI service returns 401 |
| `NEXT_PUBLIC_APP_URL` | Server-side tRPC calls target `localhost:3000` |
| `CRON_SECRET` | Retention returns 503 and **nothing is ever deleted** |

Build:

```bash
npm run build:web
```

---

## 5. Embeddings

Matching is similarity search over `vibe_profiles.embedding`. A profile without
one is a valid row that is invisible to every match query — the user just sees
"no compatible profiles".

New profiles are embedded automatically on create. Backfill anything that
predates that:

```bash
npm run db:backfill-embeddings --workspace=@starter/web
```

Requires the AI service to be reachable. `db:preflight` reports how many
profiles are missing one.

> Do not change `OPENAI_EMBEDDING_MODEL` on a database that already has
> embeddings. Vectors are only comparable to others from the same model, and the
> column is `vector(1536)` with an index built for that width. Changing it means
> re-embedding everyone with `-- --force`.

---

## 6. Retention

`/api/cron/retention` deletes expired uploads and stale rows. It authenticates
with `Authorization: Bearer $CRON_SECRET` and fails closed when that is unset.

- **Vercel** reads `apps/web-client/vercel.json` and schedules it daily.
- **Elsewhere**, point any scheduler at it:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/retention
```

Windows are configurable: `UPLOAD_RETENTION_DAYS` (default 30) and
`SESSION_RETENTION_DAYS` (default 180). Uploads go sooner because those images
contain third parties who never used this product.

---

## 7. Demo personas

Eight sample profiles (`demo_*`) ship seeded so Discover is populated from day
one. They appear for every user, and they **reply in character** — messaging one
generates a short response from the model, stored as a real message and pushed
over Supabase Realtime like any other.

They are labelled **"Sample"** on the Discover card and in the chat header, and
the prompt constrains them hard: if asked whether they are real they say plainly
that they are a sample profile, and they refuse to arrange a meeting or exchange
contact details. Those constraints are verified, including under prompt
injection. Do not remove the label — a persona that reads as a person in a
dating app is the one thing this feature must not become.

They still cannot complete a two-person mission, because completion requires
both participants to check in.

Cost: one `gpt-4o-mini` completion per message received, ~1.3s. No extra API key.

To remove them at any point:

```bash
psql "$SUPERUSER_URL" -f supabase/launch/remove-demo-profiles.sql
```

---

## Pre-launch checklist

- [ ] `npm run db:preflight` — 9/9 (migration 00015 included)
- [ ] `crushie_app` password set out of band, and not equal to any value ever committed
- [ ] `NODE_ENV=production` on the AI service
- [ ] `LLM_URL` points at the deployed AI service, not localhost
- [ ] `CRON_SECRET` set and the schedule firing
- [ ] Clerk on live keys, with the `supabase` JWT template present
- [ ] `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` restricted by HTTP referrer in Google Cloud Console — it is inlined into the browser bundle and is billable
- [ ] `npm run build:web` succeeds
- [ ] `npm test` and `npm run test:e2e` pass

## Known gaps

Honest list of what is not solved:

- **No error tracking vendor.** Logs are structured JSON on stdout, which every
  host ingests, and `setErrorReporter` in `src/lib/logger.ts` is a one-line seam
  for Sentry. Nothing is wired to it yet.
- **Rate limiting is in-process.** It keys on end-user id, but the buckets live
  in one process's memory, so a second replica doubles the effective limit. Move
  to Redis before scaling horizontally.
- **No load testing.** Nothing here has been run under concurrency.
