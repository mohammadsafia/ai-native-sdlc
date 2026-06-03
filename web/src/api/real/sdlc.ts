/**
 * Real fetchers for the SDLC backend (NestJS on :3001).
 *
 * Backend DTOs were designed to mirror the frontend @app-types shapes, so
 * most mappings are 1-to-1.  Fields the backend doesn't yet expose (lead,
 * sprint, decisions, blockers, forecast, trace, velocityHistory) are filled
 * with sensible defaults so the UI renders without errors.
 *
 * NOTE: In live mode the `id` field of returned projects is set to `key`
 * (the Jira project key) so that URL routing and weekly-report fetches work
 * without an extra lookup.  This is intentional for this slice.
 */

import { httpClient } from '@api/config/HttpClient';
import { ApiEndpoints } from '@api/config/ApiEndpoints';
import type { Project, WeeklyReport } from '@app-types';

// ─── Backend DTO shapes (subset of what the server actually returns) ──────────

interface BackendHealthScore {
  overall: number;
  label: 'healthy' | 'at-risk' | 'blocked';
}

interface BackendProjectSummary {
  id: string;
  key: string;
  name: string;
  status: 'healthy' | 'at-risk' | 'blocked';
  health: BackendHealthScore;
  lastSyncedAt: string | null;
  openRiskCount: number;
}

// WeeklyReportDto from the server is structurally identical to WeeklyReport.
type BackendWeeklyReport = WeeklyReport & { projectKey?: string };

// ─── Empty / default report used when the hub view needs project.report ───────

function emptyReport(projectId: string): WeeklyReport {
  const now = new Date().toISOString();
  return {
    projectId,
    periodEnd: now,
    generatedAt: now,
    dataCompleteness: 0,
    summary: { done: 0, inProgress: 0, todo: 0, blocked: 0, pointsCompleted: 0, pointsCommitted: 0 },
    narrative: '',
    completed: [],
    inProgress: [],
    staleStories: [],
    idlePrs: [],
    risks: [],
  };
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

/**
 * Map a BackendProjectSummary to the full frontend Project shape.
 * id is set to key so routing + weekly-report fetches work without N+1.
 * Fields not yet exposed (lead, sprint, decisions, etc.) get safe defaults.
 */
function toProject(dto: BackendProjectSummary): Project {
  const id = dto.key; // use Jira key as id in live mode
  return {
    id,
    key: dto.key,
    name: dto.name,
    status: dto.status,
    lastSyncedAt: dto.lastSyncedAt ?? new Date().toISOString(),
    health: {
      overall: dto.health.overall,
      label: dto.health.label,
      subScores: { scope: 0, timeline: 0, velocity: 0, techRisk: 0 },
    },
    lead: { id: '', name: '—', initials: '?', role: '' },
    sprint: { id: '', name: '—', committed: 0, completed: 0, start: '', end: '' },
    risks: [],
    decisions: [],
    blockers: [],
    forecast: { expected: '', low: '', high: '', confidence: 0, basisSprints: [] },
    velocityHistory: [],
    report: emptyReport(id),
    trace: [],
  };
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

/**
 * GET /api/projects → list of project summaries
 */
export async function getProjects(): Promise<Project[]> {
  const data = await httpClient.get<BackendProjectSummary[]>(ApiEndpoints.SDLC.PROJECTS);
  return data.map(toProject);
}

/**
 * GET /api/projects/:key → single project (id = key in live mode)
 */
export async function getProject(key: string): Promise<Project> {
  const url = ApiEndpoints.SDLC.PROJECT.replace(':key', encodeURIComponent(key));
  const data = await httpClient.get<BackendProjectSummary>(url);
  return toProject(data);
}

/**
 * GET /api/projects/:key/weekly-report → WeeklyReport
 * The backend DTO is structurally identical to the frontend WeeklyReport type.
 */
export async function getWeeklyReport(key: string): Promise<WeeklyReport> {
  const url = ApiEndpoints.SDLC.WEEKLY_REPORT.replace(':key', encodeURIComponent(key));
  const data = await httpClient.get<BackendWeeklyReport>(url);
  // Strip the server-only `projectKey` field if present
  const { projectKey: _pk, ...report } = data;
  return report as WeeklyReport;
}
