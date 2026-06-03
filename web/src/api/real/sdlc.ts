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

interface BackendSubScores {
  scope: number;
  timeline: number;
  velocity: number;
  techRisk: number;
}

interface BackendHealthScore {
  overall: number;
  label: 'healthy' | 'at-risk' | 'blocked';
  subScores?: BackendSubScores;
}

interface BackendTimelineForecast {
  expected: string;
  low: string;
  high: string;
  confidence: number;
  basisSprints: string[];
}

interface BackendProjectSummary {
  id: string;
  key: string;
  name: string;
  status: 'healthy' | 'at-risk' | 'blocked';
  health: BackendHealthScore;
  lastSyncedAt: string | null;
  openRiskCount: number;
  forecast?: BackendTimelineForecast;
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
const EMPTY_FORECAST = { expected: '', low: '', high: '', confidence: 0, basisSprints: [] };

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
      subScores: dto.health.subScores ?? { scope: 0, timeline: 0, velocity: 0, techRisk: 0 },
    },
    lead: { id: '', name: '—', initials: '?', role: '' },
    sprint: { id: '', name: '—', committed: 0, completed: 0, start: '', end: '' },
    risks: report ? report.risks : placeholderRisks(id, dto.openRiskCount),
    decisions: [],
    blockers: [],
    forecast: dto.forecast ?? EMPTY_FORECAST,
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

// ─── PaginatedResult helper ───────────────────────────────────────────────────

import type { PaginatedResult } from '@app-types';

/**
 * Live implementation of the mock `listProjectsPaged` function.
 * Fetches all projects from GET /api/projects, then applies the same
 * client-side search, status filter, sort, and pagination as the mock.
 */
export async function listProjectsPagedReal(
  rawParams: string,
): Promise<PaginatedResult<Omit<Project, 'trace' | 'report'>>> {
  // Parse query string
  const params = new URLSearchParams(rawParams);
  const page = Math.max(1, Number(params.get('page') ?? 1));
  const pageSize = Math.max(1, Number(params.get('pageSize') ?? 10));
  const search = (params.get('search') ?? '').toLowerCase();
  const sortParam = params.get('sort') ?? '';
  const statusFilter: string[] = params.getAll('status');

  type ProjectRow = Omit<Project, 'trace' | 'report'>;

  // Fetch all projects (list route doesn't include trace/report)
  const all = await getProjects();
  let projects: ProjectRow[] = all.map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ trace: _t, report: _r, ...rest }) => rest as ProjectRow,
  );

  // Global search — name, key, lead.name
  if (search) {
    projects = projects.filter(
      (proj) =>
        proj.name.toLowerCase().includes(search) ||
        proj.key.toLowerCase().includes(search) ||
        proj.lead.name.toLowerCase().includes(search),
    );
  }

  // Faceted status filter
  if (statusFilter.length > 0) {
    projects = projects.filter((proj) => statusFilter.includes(proj.status));
  }

  // Sorting: "field:asc" or "field:desc"
  if (sortParam) {
    const [field, dir] = sortParam.split(':');
    const desc = dir === 'desc';
    projects = [...projects].sort((a, b) => {
      const aVal: string | number =
        field === 'health.overall'
          ? a.health.overall
          : ((a[field as keyof ProjectRow] ?? '') as string | number);
      const bVal: string | number =
        field === 'health.overall'
          ? b.health.overall
          : ((b[field as keyof ProjectRow] ?? '') as string | number);
      if (aVal < bVal) return desc ? 1 : -1;
      if (aVal > bVal) return desc ? -1 : 1;
      return 0;
    });
  }

  const total = projects.length;
  const totalPage = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const data = projects.slice(start, start + pageSize);

  return {
    data,
    pagination: { page, pageSize, total, totalPage },
  };
}
