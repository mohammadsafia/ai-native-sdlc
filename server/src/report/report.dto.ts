// server/src/report/report.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class ReportItemDto {
  @ApiProperty({ example: 'PROJ-42', description: 'Jira issue key' })
  key: string;

  @ApiProperty({ example: 'Implement login flow', description: 'Issue summary / title' })
  title: string;

  @ApiProperty({ example: 'Alice Smith', description: 'Assignee display name' })
  assignee: string;
}

export class ReportSummaryDto {
  @ApiProperty({ example: 5, description: 'Number of done artifacts in the active sprint' })
  done: number;

  @ApiProperty({ example: 3, description: 'Number of in-progress artifacts (excluding blocked)' })
  inProgress: number;

  @ApiProperty({ example: 4, description: 'Number of to-do artifacts in the active sprint' })
  todo: number;

  @ApiProperty({ example: 1, description: 'Number of blocked artifacts' })
  blocked: number;

  @ApiProperty({ example: 13, description: 'Sum of story points for done artifacts in the active sprint' })
  pointsCompleted: number;

  @ApiProperty({ example: 21, description: 'Sum of story points committed in the active sprint (all sprint artifacts)' })
  pointsCommitted: number;
}

export class RiskDto {
  @ApiProperty({ example: 'risk-1', description: 'Unique identifier for the risk' })
  id: string;

  @ApiProperty({ example: 'PROJ', description: 'Project key this risk belongs to' })
  projectId: string;

  @ApiProperty({
    enum: ['delivery', 'scope_creep', 'dependency', 'resource_overload'],
    example: 'scope_creep',
    description: 'Risk category',
  })
  kind: 'delivery' | 'scope_creep' | 'dependency' | 'resource_overload';

  @ApiProperty({
    enum: ['low', 'medium', 'high'],
    example: 'high',
    description: 'Risk severity',
  })
  severity: 'low' | 'medium' | 'high';

  @ApiProperty({ example: 'PROJ-99', description: 'Jira key of the subject artifact' })
  subjectRef: string;

  @ApiProperty({ example: 'Scope creep: issue added after sprint start', description: 'Short risk title' })
  title: string;

  @ApiProperty({ example: 'PROJ-99 was added to sprint after start date', description: 'Evidence for the risk' })
  evidence: string;

  @ApiProperty({ example: 'Review with PM whether this should be moved to backlog', description: 'Recommended action' })
  recommendation: string;
}

export class WeeklyReportDto {
  @ApiProperty({ example: 'proj-cuid', description: 'Project database ID' })
  projectId: string;

  @ApiProperty({ example: 'PROJ', description: 'Jira project key' })
  projectKey: string;

  @ApiProperty({ example: '2026-06-06', description: 'ISO date string of the reporting period end (Friday)' })
  periodEnd: string;

  @ApiProperty({ example: '2026-06-03T00:00:00.000Z', description: 'ISO timestamp when this report was generated' })
  generatedAt: string;

  @ApiProperty({
    example: 0.8,
    description:
      'Fraction [0–1] indicating how complete the data is. ' +
      '< 1.0 means some signals are unavailable (e.g. commit-based staleness requires the Bitbucket connector).',
  })
  dataCompleteness: number;

  @ApiProperty({ type: ReportSummaryDto })
  summary: ReportSummaryDto;

  @ApiProperty({ type: [ReportItemDto], description: 'In-progress artifacts (not blocked)' })
  inProgress: ReportItemDto[];

  @ApiProperty({ type: [ReportItemDto], description: 'Completed artifacts in the active sprint' })
  completed: ReportItemDto[];

  @ApiProperty({
    type: [ReportItemDto],
    description:
      'In-progress artifacts with no Jira activity for longer than staleDays. ' +
      'NOTE: staleness is Jira-update-based; commit-based staleness arrives with the Bitbucket connector.',
  })
  staleStories: ReportItemDto[];

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        daysIdle: { type: 'number' },
      },
    },
    description: 'Open PRs with no update for longer than prIdleDays',
  })
  idlePrs: { id: string; title: string; daysIdle: number }[];

  @ApiProperty({ type: [RiskDto], description: 'Computed risks: scope_creep and resource_overload for this slice' })
  risks: RiskDto[];

  @ApiProperty({
    example:
      'Sprint had 5 done, 3 in-progress, 1 blocked, 4 todo. ' +
      '1 stale story (PROJ-10). 2 scope-creep risks detected.',
    description:
      'Deterministic narrative summary of this report. ' +
      '[[KEY]] tokens mark evidence references. ' +
      'A real Claude-generated narrative arrives with the LLM gateway (next slice).',
  })
  narrative: string;
}

export class SubScoresDto {
  @ApiProperty({ example: 85, description: 'Scope health 0–100 (lower = more scope creep)' })
  scope: number;

  @ApiProperty({ example: 76, description: 'Timeline health 0–100 (lower = more stale stories)' })
  timeline: number;

  @ApiProperty({ example: 90, description: 'Velocity health 0–100 (ratio of completed/committed points)' })
  velocity: number;

  @ApiProperty({ example: 70, description: 'Technical risk health 0–100 (lower = more blockers/idle PRs/high risks)' })
  techRisk: number;
}

export class HealthScoreDto {
  @ApiProperty({ example: 72, description: 'Composite health score 0–100 (weighted avg of sub-scores)' })
  overall: number;

  @ApiProperty({ enum: ['healthy', 'at-risk', 'blocked'], example: 'at-risk' })
  label: 'healthy' | 'at-risk' | 'blocked';

  @ApiProperty({ type: SubScoresDto })
  subScores: SubScoresDto;
}

export class TimelineForecastDto {
  @ApiProperty({ example: '2026-08-15', description: 'Expected completion date (ISO date, empty when no velocity data)' })
  expected: string;

  @ApiProperty({ example: '2026-07-25', description: 'Optimistic (fast velocity) completion date' })
  low: string;

  @ApiProperty({ example: '2026-09-05', description: 'Pessimistic (slow velocity) completion date' })
  high: string;

  @ApiProperty({ example: 0.82, description: 'Forecast confidence 0–1' })
  confidence: number;

  @ApiProperty({ example: ['Sprint 1', 'Sprint 2', 'Sprint 3'], description: 'Sprint names used as velocity basis' })
  basisSprints: string[];
}

export class ProjectSummaryDto {
  @ApiProperty({ example: 'proj-cuid', description: 'Project database ID' })
  id: string;

  @ApiProperty({ example: 'PROJ', description: 'Jira project key' })
  key: string;

  @ApiProperty({ example: 'My Project', description: 'Project name' })
  name: string;

  @ApiProperty({ enum: ['healthy', 'at-risk', 'blocked'], example: 'healthy' })
  status: 'healthy' | 'at-risk' | 'blocked';

  @ApiProperty({ type: HealthScoreDto })
  health: HealthScoreDto;

  @ApiProperty({ example: '2026-06-03T12:00:00.000Z', nullable: true })
  lastSyncedAt: string | null;

  @ApiProperty({ example: 2, description: 'Number of open (non-resolved) risks' })
  openRiskCount: number;

  @ApiProperty({ type: TimelineForecastDto })
  forecast: TimelineForecastDto;
}
