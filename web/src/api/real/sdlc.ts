/**
 * Real fetchers for the SDLC backend (NestJS on :3001).
 *
 * Backend DTOs were designed to mirror the frontend @app-types shapes, so
 * most mappings are 1-to-1.  Fields the backend doesn't yet expose (lead,
 * sprint, decisions, blockers, forecast, trace, velocityHistory) are filled
 * with sensible defaults so the UI renders without errors.
 *
 * - The Hub (`getProject`) fetches the project summary AND its weekly report in
 *   parallel, so `project.report` and `project.risks` are real (not empty).
 * - The Projects list (`getProjects`) can't cheaply fetch every report, so it
 *   fills `risks` with `openRiskCount` placeholders purely so the count column
 *   is accurate; the Risks screen itself is a separate (mock) data source.
 *
 * In live mode the `id` field of returned projects is set to `key` (the Jira
 * project key) so URL routing and weekly-report fetches work without a lookup.
 */

import { httpClient } from '@api/config/HttpClient';
import { ApiEndpoints } from '@api/config/ApiEndpoints';
import type { Project, Risk, WeeklyReport } from '@app-types';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// Placeholder risks so the Projects-list "Open Risks" count is accurate without
// fetching each project's full report. Only the array length is read by the list.
function placeholderRisks(projectId: string, n: number): Risk[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => ({
    id: `${projectId}-r${i}`,
    projectId,
    kind: 'delivery',
    severity: 'medium',
    title: '',
    subjectRef: '',
    evidence: '',
    recommendation: '',
  }));
}

/**
 * Map a BackendProjectSummary to the full frontend Project shape.
 * When `report` is provided (Hub), `report`/`risks` are real; otherwise (list)
 * `risks` is a length-only placeholder of `openRiskCount`.
 */
function toProject(dto: BackendProjectSummary, report?: WeeklyReport): Project {
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
    risks: report ? report.risks : placeholderRisks(id, dto.openRiskCount),
    decisions: [],
    blockers: [],
    forecast: { expected: '', low: '', high: '', confidence: 0, basisSprints: [] },
    velocityHistory: [],
    report: report ?? emptyReport(id),
    trace: [],
  };
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

/** GET /api/projects → list of project summaries */
export async function getProjects(): Promise<Project[]> {
  const data = await httpClient.get<BackendProjectSummary[]>(ApiEndpoints.SDLC.PROJECTS);
  return data.map((dto) => toProject(dto));
}

/** GET /api/projects/:key (+ its weekly report) → a fully-populated Project for the Hub */
export async function getProject(key: string): Promise<Project> {
  const summaryUrl = ApiEndpoints.SDLC.PROJECT.replace(':key', encodeURIComponent(key));
  const [summary, report] = await Promise.all([
    httpClient.get<BackendProjectSummary>(summaryUrl),
    getWeeklyReport(key).catch(() => undefined),
  ]);
  return toProject(summary, report);
}

/**
 * GET /api/projects/:key/weekly-report → WeeklyReport
 * The backend DTO is structurally identical to the frontend WeeklyReport type.
 */
export async function getWeeklyReport(key: string): Promise<WeeklyReport> {
  const url = ApiEndpoints.SDLC.WEEKLY_REPORT.replace(':key', encodeURIComponent(key));
  const data = await httpClient.get<BackendWeeklyReport>(url);
  const { projectKey: _pk, ...report } = data;
  return report as WeeklyReport;
}
