# Running the backend against REAL Jira + Bitbucket

Verified against the code on `main` (2026-06-04). This stands up the NestJS backend on Postgres, ingests your live Atlassian data, and points the frontend at it. Nothing here is committed-secret — all creds live in `server/.env` (gitignored).

---

## 0. Prerequisites you provide

| Need | How to get it |
|------|---------------|
| **Docker Desktop running** | for the Postgres container |
| **Jira API token** | https://id.atlassian.com/manage-profile/security/api-tokens → *Create API token*. Read-only Basic auth (email + token). |
| **Jira site URL + project key** | e.g. `https://yourco.atlassian.net` and a project key like `PROJ` (one with issues + an active sprint). |
| **Bitbucket app password** *(optional but recommended)* | Bitbucket → Personal settings → *App passwords* → Create, with scopes **`Repositories: Read`** and **`Pull requests: Read`**. Note your **workspace** and **repo slug**. |

> Bitbucket is optional — without it you still get the full report, but staleness falls back to the Jira-updated proxy instead of commit-based.

---

## 1. Database + backend up

```bash
cd server
docker compose up -d                 # Postgres 16 on :5433
yarn install
yarn prisma migrate dev --name init  # creates projects/sprints/artifacts/commits/pull_requests/sync_runs
```

Create `server/.env` (copy from `.env.example`) and fill in:

```dotenv
DATABASE_URL=postgresql://sdlc:sdlc@localhost:5433/sdlc
PORT=3001
DEMO_MODE=false            # IMPORTANT: false = use the real DB; true = serve fixtures

# Jira (required for sync)
JIRA_BASE_URL=https://yourco.atlassian.net
JIRA_EMAIL=you@yourco.com
JIRA_API_TOKEN=<paste the token>
JIRA_PROJECT_KEYS=PROJ

# Bitbucket (optional)
BITBUCKET_WORKSPACE=your-workspace
BITBUCKET_USERNAME=your-bitbucket-username
BITBUCKET_APP_PASSWORD=<paste the app password>
BITBUCKET_REPOS=your-repo-slug

# Optional: real Claude-written narrative (else a deterministic template is used)
# ANTHROPIC_API_KEY=sk-ant-...
```

```bash
yarn start:dev                       # boots on http://localhost:3001 ; docs at /api/docs
```

`GET http://localhost:3001/api/health` should return `{ "status": "ok" }`.

---

## 2. Ingest your real data

```bash
# Jira → normalize → Postgres
curl -XPOST http://localhost:3001/api/sync/PROJ
#   → { "syncRunId": "...", "issueCount": N }

# Bitbucket → commits + PRs → entity-resolve to issues  (optional)
curl -XPOST http://localhost:3001/api/sync-bitbucket/your-workspace/your-repo-slug
```

Verify the computed outputs:

```bash
curl -s http://localhost:3001/api/projects | jq          # your project(s) + health + sub-scores + forecast
curl -s http://localhost:3001/api/projects/PROJ/weekly-report | jq   # the real report
# inspect the DB visually:
yarn prisma studio
```

---

## 3. Point the frontend at it

```bash
cd ../web
# in web/.env:
#   VITE_USE_MOCK=false
#   VITE_APP_API_URL=http://localhost:3001/api
yarn dev                              # http://localhost:3000
```

Open **Projects** → click your project → the **Hub** shows your live Jira/Bitbucket data.
(Risks / Portfolio / Traceability screens are still mock for now — out of this slice.)

To go back to the standalone demo: set `web/.env VITE_USE_MOCK=true` (and run the backend with `DEMO_MODE=true` if you want the fixture data without a DB).

---

## 4. Troubleshooting (the things most likely to bite)

- **Story points show 0 / velocity + forecast look off.** The connector reads story points from `customfield_10016` and `customfield_10028`. Many Jira instances use a *different* custom field. Find yours: `curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" "$JIRA_BASE_URL/rest/api/3/field" | jq '.[] | select(.name|test("Story.?Point";"i")) | {id,name}'`. **If it isn't 10016/10028, tell me the id** — it's a ~1-line change to make it a `JIRA_STORY_POINTS_FIELD` env var.
- **`POST /api/sync/:key` returns 410 / 404 / "Gone".** Atlassian has been migrating the issue-search API from `/rest/api/3/search` (what the connector uses) to `/rest/api/3/search/jql` (cursor-based). If your instance has removed the old one, ping me and I'll switch the connector to the new endpoint.
- **401 / 403 from Jira.** Wrong email/token, or the token lacks access to the project. The token must belong to a user who can see `PROJ`. Read scopes only are needed.
- **Bitbucket 403.** The app password needs **Repositories: Read** + **Pull requests: Read**; check the workspace/repo slug casing.
- **App boots but every request errors with a DB message.** `DEMO_MODE` is `false` (correct) but Postgres isn't reachable — confirm `docker compose ps` shows it healthy and `DATABASE_URL` port matches (`5433`).
- **Frontend still shows mock data.** `VITE_USE_MOCK` must be `false` in `web/.env`, and Vite bakes env at **build/dev-start** time — restart `yarn dev` after editing `.env`.
- **CORS error in the browser.** The backend allows `http://localhost:3000` by default; if you run the frontend on another port, tell me and I'll widen CORS.
- **Sprint points / committed-vs-completed look empty.** The connector resolves sprint membership from the issue changelog; boards using non-standard sprint fields may need a tweak — share an example issue and I'll adjust the mapper.

When you hit any of these, paste the error/output and I'll fix it fast.
