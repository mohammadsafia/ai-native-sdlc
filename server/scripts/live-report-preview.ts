/**
 * live-report-preview.ts
 *
 * Fetches REAL Jira issues for a given project key using the real JiraClient,
 * maps them through the real normalization pipeline, computes a Weekly Report
 * entirely in-memory (no Postgres), and prints a concise summary.
 *
 * Usage:
 *   cd server && npx ts-node -r dotenv/config scripts/live-report-preview.ts [PROJECT_KEY]
 *
 * Defaults to project key "DM" if none is supplied.
 */

// ---------------------------------------------------------------------------
// Bootstrap: load .env from server/.env before anything else
// ---------------------------------------------------------------------------
import * as path from 'path';
import * as fs from 'fs';

// Load .env manually so the script is self-contained (no dotenv CLI flag needed)
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  console.log(`[env] Loaded ${envPath}`);
} else {
  console.warn(`[env] WARNING: ${envPath} not found — relying on pre-set environment variables`);
}

// ---------------------------------------------------------------------------
// Imports — use real production modules (no re-implementation)
// ---------------------------------------------------------------------------
import { JiraClient } from '../src/jira/jira.client';
import { mapIssueToArtifact } from '../src/normalization/mappers';
import { computeFromData, RawArtifact } from '../src/report/report.service';
import { deriveHealth } from '../src/projects/projects.service';

// ---------------------------------------------------------------------------
// Minimal ConfigService shim — reads from process.env
// ---------------------------------------------------------------------------
const configShim = {
  get: (key: string) => process.env[key],
} as any;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const projectKey = process.argv[2] || 'DM';
  const asOf = new Date();

  console.log('');
  console.log('='.repeat(60));
  console.log(`  LIVE REPORT PREVIEW — Project: ${projectKey}`);
  console.log(`  As of: ${asOf.toISOString()}`);
  console.log('='.repeat(60));

  // 1. Instantiate the real JiraClient
  const jira = new JiraClient(configShim);

  // 2. Fetch all issues for the project via the migrated /rest/api/3/search/jql endpoint
  console.log(`\n[jira] Searching issues: project = ${projectKey} ORDER BY updated DESC`);
  let jiraIssues;
  try {
    jiraIssues = await jira.searchIssues(
      `project = ${projectKey} ORDER BY updated DESC`,
    );
  } catch (err: any) {
    const status = err?.response?.status ?? err?.status ?? 'unknown';
    const message = err?.response?.data?.errorMessages?.join(', ')
      ?? err?.response?.data?.message
      ?? err?.message
      ?? String(err);
    console.error(`[ERROR] Jira request failed — HTTP ${status}: ${message}`);
    process.exit(1);
  }

  console.log(`[jira] Retrieved ${jiraIssues.length} issue(s)`);

  // 3. Normalize issues → artifacts via the real mapIssueToArtifact
  const now = new Date();
  const artifacts: RawArtifact[] = jiraIssues.map((issue, idx) => {
    const mapped = mapIssueToArtifact(issue, {
      blockedStatuses: ['Blocked', 'Blocked!'],
      // pointsFieldId omitted → falls back to standard custom fields
    });
    // RawArtifact requires id, projectId, createdAt, updatedAt — synthetic values fine here
    // Cast raw to Record<string,unknown> to satisfy RawArtifact's index-signature requirement
    return {
      ...mapped,
      raw: mapped.raw as unknown as Record<string, unknown>,
      id: `live-${idx}`,
      projectId: projectKey,
      sprintId: null,
      createdAt: now,
      updatedAt: now,
    } as RawArtifact;
  });

  // 4. Compute the Weekly Report (no commits, no PRs, no narrative fn → deterministic template)
  const report = await computeFromData(
    projectKey,           // projectId (synthetic — no DB)
    projectKey,           // projectKey
    artifacts,
    [],                   // commits — Bitbucket connector not wired yet
    [],                   // openPrs
    {
      staleDays: 3,
      prIdleDays: 2,
      overloadThreshold: 5,
      blockedStatuses: ['Blocked', 'Blocked!'],
      asOf,
    },
    // narrativeFn omitted → uses deterministic fallback template
  );

  // 5. Derive health from the report signals
  const velocityRatio =
    report.summary.pointsCommitted > 0
      ? report.summary.pointsCompleted / report.summary.pointsCommitted
      : undefined;

  const health = deriveHealth({
    blockedCount: report.summary.blocked,
    highRiskCount: report.risks.filter((r) => r.severity === 'high').length,
    staleCount: report.staleStories.length,
    scopeCreepCount: report.risks.filter((r) => r.kind === 'scope_creep').length,
    resourceOverloadCount: report.risks.filter((r) => r.kind === 'resource_overload').length,
    idlePrCount: report.idlePrs.length,
    velocityRatio,
  });

  // 6. Print concise summary
  console.log('');
  console.log('--- ISSUE COUNTS & STATUS BUCKETS ---');
  console.log(`  Total issues fetched : ${jiraIssues.length}`);
  console.log(`  Done                 : ${report.summary.done}`);
  console.log(`  In-Progress          : ${report.summary.inProgress}`);
  console.log(`  Blocked              : ${report.summary.blocked}`);
  console.log(`  To-Do                : ${report.summary.todo}`);

  console.log('');
  console.log('--- POINTS ---');
  console.log(`  Committed : ${report.summary.pointsCommitted}`);
  console.log(`  Completed : ${report.summary.pointsCompleted}`);

  console.log('');
  console.log('--- STALE STORIES (in-progress, no Jira update > 3 days) ---');
  if (report.staleStories.length === 0) {
    console.log('  (none)');
  } else {
    for (const s of report.staleStories) {
      console.log(`  ${s.key}  assignee=${s.assignee}`);
    }
  }

  console.log('');
  console.log('--- RISKS ---');
  if (report.risks.length === 0) {
    console.log('  (none)');
  } else {
    for (const r of report.risks) {
      console.log(`  [${r.severity.toUpperCase()}] ${r.kind}  subject=${r.subjectRef}`);
      console.log(`    ${r.title}`);
    }
  }

  console.log('');
  console.log('--- HEALTH ---');
  console.log(`  Overall : ${health.overall}  (${health.label})`);
  console.log(`  velocity=${health.subScores.velocity}  scope=${health.subScores.scope}  timeline=${health.subScores.timeline}  techRisk=${health.subScores.techRisk}`);

  console.log('');
  console.log('--- NARRATIVE (first 240 chars) ---');
  console.log('  ' + report.narrative.slice(0, 240));

  console.log('');
  console.log(`  periodEnd=${report.periodEnd}  dataCompleteness=${report.dataCompleteness}`);
  console.log('='.repeat(60));
  console.log('');
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
