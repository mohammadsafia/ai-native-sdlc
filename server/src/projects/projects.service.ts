// server/src/projects/projects.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ReportService } from '../report/report.service';
import { DemoDataService } from '../demo/demo-data.service';
import { LiveDataService } from '../live/live-data.service';
import { ProjectSummaryDto, HealthScoreDto } from '../report/report.dto';
import { computeForecast } from '../report/forecast';

export type HealthLabel = 'healthy' | 'at-risk' | 'blocked';

/** Clamp a number to [0, 100] and round to integer. */
function clamp100(v: number): number {
  return Math.round(Math.max(0, Math.min(100, v)));
}

/**
 * Derives a health label, 0–100 composite score, and four sub-scores from raw
 * project signals.
 *
 * Sub-score formulas (each clamped to [0,100], higher = healthier):
 *  - velocity   = sprints.length ? round(avg(completed/committed)*100) : 70
 *  - scope      = 100 - scopeCreepCount * 15
 *  - timeline   = 100 - staleCount * 12
 *  - techRisk   = 100 - (blockedCount*15 + idlePrCount*8 + highRiskCount*10)
 *
 * overall = round(equal-weight avg of the four sub-scores).
 *
 * Label thresholds:
 *  overall < 50 && (blocked or high-risk signals) → 'blocked'
 *  overall < 75 OR any adverse signal              → 'at-risk'
 *  otherwise                                       → 'healthy'
 */
export function deriveHealth(signals: {
  blockedCount: number;
  highRiskCount: number;
  staleCount: number;
  scopeCreepCount: number;
  resourceOverloadCount: number;
  idlePrCount?: number;
  velocityRatio?: number; // completed/committed (0–1+), undefined when no sprint data
}): HealthScoreDto {
  const {
    blockedCount,
    highRiskCount,
    staleCount,
    scopeCreepCount,
    idlePrCount = 0,
    velocityRatio,
  } = signals;

  // Sub-scores (clamped to [0,100])
  const velocity = clamp100(
    velocityRatio !== undefined ? Math.round(velocityRatio * 100) : 70,
  );
  const scope = clamp100(100 - scopeCreepCount * 15);
  const timeline = clamp100(100 - staleCount * 12);
  const techRisk = clamp100(
    100 - (blockedCount * 15 + idlePrCount * 8 + highRiskCount * 10),
  );

  const overall = Math.round((velocity + scope + timeline + techRisk) / 4);

  let label: HealthLabel;
  if (overall < 50 && (blockedCount > 0 || highRiskCount > 0)) {
    label = 'blocked';
  } else if (
    overall < 75 ||
    blockedCount > 0 ||
    highRiskCount > 0 ||
    staleCount > 0 ||
    scopeCreepCount > 0
  ) {
    label = 'at-risk';
  } else {
    label = 'healthy';
  }

  return { overall, label, subScores: { scope, timeline, velocity, techRisk } };
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportService: ReportService,
    private readonly configService: ConfigService,
    private readonly demoDataService: DemoDataService,
    private readonly liveDataService: LiveDataService,
  ) {}

  async findAll(): Promise<ProjectSummaryDto[]> {
    const isLiveFetch = this.configService.get<boolean>('LIVE_FETCH') === true;
    const isDemoMode = this.configService.get<boolean>('DEMO_MODE') === true;

    if (isLiveFetch) {
      const projects = await this.liveDataService.getProjects();
      const summaries: ProjectSummaryDto[] = [];
      for (const project of projects) {
        const summary = await this.buildSummary(project);
        summaries.push(summary);
      }
      return summaries;
    }

    if (isDemoMode) {
      const projects = this.demoDataService.getProjects();
      const summaries: ProjectSummaryDto[] = [];
      for (const project of projects) {
        const summary = await this.buildSummary(project);
        summaries.push(summary);
      }
      return summaries;
    }

    const projects = await this.prisma.project.findMany({
      orderBy: { key: 'asc' },
    });

    const summaries: ProjectSummaryDto[] = [];
    for (const project of projects) {
      const summary = await this.buildSummary(project);
      summaries.push(summary);
    }
    return summaries;
  }

  async findOne(key: string): Promise<ProjectSummaryDto> {
    const isLiveFetch = this.configService.get<boolean>('LIVE_FETCH') === true;
    const isDemoMode = this.configService.get<boolean>('DEMO_MODE') === true;

    if (isLiveFetch) {
      const project = await this.liveDataService.getProject(key);
      if (!project) {
        throw new NotFoundException(`Project with key "${key}" not found`);
      }
      return this.buildSummary(project);
    }

    if (isDemoMode) {
      const project = this.demoDataService.getProject(key);
      if (!project) {
        throw new NotFoundException(`Project with key "${key}" not found`);
      }
      return this.buildSummary(project);
    }

    const project = await this.prisma.project.findUnique({ where: { key } });
    if (!project) {
      throw new NotFoundException(`Project with key "${key}" not found`);
    }
    return this.buildSummary(project);
  }

  private async buildSummary(project: {
    id: string;
    key: string;
    name: string;
    lastSyncedAt: Date | null;
  }): Promise<ProjectSummaryDto> {
    // Attempt to compute the report for signals; fall back to zero-signals on error.
    let signals = {
      blockedCount: 0,
      highRiskCount: 0,
      staleCount: 0,
      scopeCreepCount: 0,
      resourceOverloadCount: 0,
      idlePrCount: 0,
      velocityRatio: undefined as number | undefined,
    };

    let remainingPoints = 0;

    try {
      const report = await this.reportService.compute(project.key);
      signals.blockedCount = report.summary.blocked;
      signals.staleCount = report.staleStories.length;
      signals.highRiskCount = report.risks.filter((r) => r.severity === 'high').length;
      signals.scopeCreepCount = report.risks.filter((r) => r.kind === 'scope_creep').length;
      signals.resourceOverloadCount = report.risks.filter((r) => r.kind === 'resource_overload').length;
      signals.idlePrCount = report.idlePrs.length;

      // Velocity ratio from the active sprint (guard divide-by-zero)
      if (report.summary.pointsCommitted > 0) {
        signals.velocityRatio = report.summary.pointsCompleted / report.summary.pointsCommitted;
      }

      // Remaining points = todo + in-progress + blocked (not yet done)
      remainingPoints =
        report.summary.pointsCommitted - report.summary.pointsCompleted;
      if (remainingPoints < 0) remainingPoints = 0;
    } catch {
      // No artifacts yet (e.g. project just created, no sync run) → healthy with zeroes
    }

    const health = deriveHealth(signals);
    const openRiskCount = signals.highRiskCount + signals.scopeCreepCount + signals.resourceOverloadCount;

    // Build forecast from historical sprint velocity
    const isLiveFetchForSprints = this.configService.get<boolean>('LIVE_FETCH') === true;
    const rawSprints = isLiveFetchForSprints
      ? this.liveDataService.getSprints(project.key)
      : this.demoDataService.getSprints(project.key);

    // For the Prisma path, fetch closed sprints from DB if DemoDataService returns empty
    let sprintSamples = rawSprints
      .filter((s) => s.state === 'closed' || s.state === 'active')
      .map((s) => ({
        name: s.name,
        completedPoints: s.completedPoints,
        startDate: s.startDate,
        endDate: s.endDate,
      }));

    // For the Prisma path, also fetch sprints from DB
    if (sprintSamples.length === 0) {
      try {
        const dbSprints = await this.prisma.sprint.findMany({
          where: { projectId: project.id },
          orderBy: { endDate: 'asc' },
        });
        sprintSamples = dbSprints.map((s) => ({
          name: s.name,
          completedPoints: s.completedPoints ?? 0,
          startDate: s.startDate ?? undefined,
          endDate: s.endDate ?? undefined,
        }));
      } catch {
        // DB unavailable — proceed without sprint data
      }
    }

    const forecast = computeForecast(sprintSamples, remainingPoints);

    return {
      id: project.id,
      key: project.key,
      name: project.name,
      status: health.label,
      health,
      lastSyncedAt: project.lastSyncedAt ? project.lastSyncedAt.toISOString() : null,
      openRiskCount,
      forecast,
    };
  }
}
