# AI-Native SDLC — Backend Server

NestJS 11 backend providing Jira ingestion, normalization, and Weekly Status & Risk Reports.

- **Port:** 3001 (configurable via `PORT` env var)
- **API prefix:** `/api`
- **Swagger UI:** http://localhost:3001/api/docs

---

## Quick Start

### 1. Install dependencies

```bash
cd server
yarn
```

### 2. Start the database (Docker required)

```bash
docker compose up -d
```

This starts a `postgres:16-alpine` container on **port 5433** (not the default 5432, to avoid collisions).

### 3. Run the initial database migration

```bash
yarn prisma migrate dev --name init
```

This creates all tables (`projects`, `sprints`, `artifacts`, `sync_runs`).

### 4. Start the dev server

```bash
yarn start:dev
```

The server boots on http://localhost:3001. Visit http://localhost:3001/api/health to verify.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string. Default: `postgresql://sdlc:sdlc@localhost:5433/sdlc` |
| `PORT` | No | Server port. Default: `3001` |
| `JIRA_BASE_URL` | For Jira sync | Your Atlassian site URL, e.g. `https://yourcompany.atlassian.net` |
| `JIRA_EMAIL` | For Jira sync | Your Atlassian account email |
| `JIRA_API_TOKEN` | For Jira sync | API token from https://id.atlassian.com/manage-profile/security/api-tokens |
| `JIRA_PROJECT_KEYS` | For Jira sync | Comma-separated project keys, e.g. `PROJ,CORE` |

> The Jira variables are optional at startup — the server boots without them. They become required when you call `POST /api/sync/:projectKey`.

---

## End-to-End Live Run (with Docker + Jira creds)

Once Docker Desktop and your Jira credentials are ready, run this sequence:

```bash
# 1. Start Postgres
docker compose up -d

# 2. Apply the schema
yarn prisma migrate dev

# 3. Set Jira creds in server/.env:
#    JIRA_BASE_URL=https://yourcompany.atlassian.net
#    JIRA_EMAIL=you@example.com
#    JIRA_API_TOKEN=<from id.atlassian.com → Security → API tokens>
#    JIRA_PROJECT_KEYS=PROJ

# 4. Start the backend
yarn start:dev
# Verify: curl http://localhost:3001/api/health

# 5. Trigger a Jira sync
curl -XPOST http://localhost:3001/api/sync/PROJ
# Returns: {"issueCount": N, "syncRunId": "..."}

# 6. Check data
# yarn prisma studio   (GUI browser)
# curl http://localhost:3001/api/projects/PROJ/weekly-report

# 7. Switch the frontend to live data
# In web/.env set: VITE_USE_MOCK=false
# Then:
cd ../web && yarn dev
# The Projects and Weekly Report screens now show live Jira data.
```

---

## Available Scripts

| Script | Description |
|---|---|
| `yarn start:dev` | Start in watch mode (recompiles on file change) |
| `yarn build` | Compile TypeScript to `dist/` |
| `yarn start` | Run the compiled `dist/main.js` |
| `yarn test` | Run unit tests (jest) |
| `yarn prisma` | Shortcut to `prisma` CLI |
| `yarn generate:openapi` | Build + write `server/swagger.json` (works without DB) |

---

## Database Schema

Four models, all in `prisma/schema.prisma`:

- **Project** — top-level Jira project (`key`, `name`, `lastSyncedAt`)
- **Sprint** — Jira sprints with committed/completed story points
- **Artifact** — individual Jira issues normalized to a canonical shape (`statusCategory`, `addedToSprintAfterStart`, `raw` JSON)
- **SyncRun** — audit log of every sync invocation

---

## API Endpoints (Milestone 0)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |

More endpoints arrive in Milestones 1–3 (Jira sync, projects, weekly report).

---

## Offline Migration SQL

An offline migration SQL file was generated at `prisma/migrations/0_init/migration.sql`.
This file proves the schema is valid. To apply it to a real database:

```bash
# Option 1: Prisma managed migrations (recommended)
docker compose up -d
yarn prisma migrate dev --name init

# Option 2: Apply the SQL directly
psql postgresql://sdlc:sdlc@localhost:5433/sdlc < prisma/migrations/0_init/migration.sql
```
