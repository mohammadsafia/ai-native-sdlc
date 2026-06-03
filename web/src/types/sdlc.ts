export type ProjectStatus = 'healthy' | 'at-risk' | 'blocked';
export type RiskKind = 'delivery' | 'scope_creep' | 'dependency' | 'resource_overload';
export type Severity = 'low' | 'medium' | 'high';
export type TraceType = 'requirement' | 'epic' | 'story' | 'task' | 'pr' | 'deployment' | 'release';

export interface Person { id: string; name: string; initials: string; role: string; }
export interface SubScores { scope: number; timeline: number; velocity: number; techRisk: number; }
export interface HealthScore { overall: number; label: ProjectStatus; subScores: SubScores; }
export interface Sprint { id: string; name: string; committed: number; completed: number; start: string; end: string; }
export interface Risk { id: string; projectId: string; kind: RiskKind; severity: Severity; title: string; subjectRef: string; evidence: string; recommendation: string; }
export interface Decision { id: string; date: string; statement: string; adrRef?: string; }
export interface Blocker { id: string; title: string; since: string; owner: string; }
export interface TimelineForecast { expected: string; low: string; high: string; confidence: number; basisSprints: string[]; }
export interface TraceNode { id: string; type: TraceType; label: string; parentId: string | null; status: 'ok' | 'orphan' | 'in-progress'; }
export interface ReportItem { key: string; title: string; assignee: string; }
export interface WeeklyReport {
  projectId: string; periodEnd: string; generatedAt: string; dataCompleteness: number;
  summary: { done: number; inProgress: number; todo: number; blocked: number; pointsCompleted: number; pointsCommitted: number };
  narrative: string;            // contains [[KEY]] tokens to render as evidence chips
  completed: ReportItem[]; inProgress: ReportItem[]; staleStories: ReportItem[]; idlePrs: { id: string; daysIdle: number }[];
  risks: Risk[];
}
export interface Project {
  id: string; key: string; name: string; lead: Person; status: ProjectStatus;
  lastSyncedAt: string; health: HealthScore; sprint: Sprint;
  risks: Risk[]; decisions: Decision[]; blockers: Blocker[];
  forecast: TimelineForecast; report: WeeklyReport; trace: TraceNode[];
  velocityHistory: number[]; // sparkline
}
export interface PortfolioSummary {
  projects: Pick<Project,'id'|'key'|'name'|'status'|'health'>[];
  riskByKind: Record<RiskKind, number>;
  throughput: { window: string; merged: number; trend: number };
  executiveSummary: string;
}
