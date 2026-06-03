// server/src/projects/projects.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportService } from '../report/report.service';
import { ProjectSummaryDto, HealthScoreDto } from '../report/report.dto';

export type HealthLabel = 'healthy' | 'at-risk' | 'blocked';

/**
 * Derives a health label and 0–100 score from raw project signals.
 *
 * Signals (weighted):
 *  - blockedCount    (weight 30): any blocked item pulls toward "blocked"
 *  - highRiskCount   (weight 25): high-severity risks
 *  - staleCount      (weight 20): stale in-progress items
 *  - scopeCreepCount (weight 15): scope-creep artifacts
 *  - overload        (weight 10): resource-overload indicators
 *
 * Score starts at 100 and is reduced by each signal.
 * Label:
 *   score >= 80 && no high risks && no blocked → healthy
 *   score >= 50 || any risks || any stale       → at-risk
 *   otherwise                                   → blocked
 */
export function deriveHealth(signals: {
  blockedCount: number;
  highRiskCount: number;
  staleCount: number;
  scopeCreepCount: number;
  resourceOverloadCount: number;
}): HealthScoreDto {
  const { blockedCount, highRiskCount, staleCount, scopeCreepCount, resourceOverloadCount } = signals;

  let score = 100;
  score -= Math.min(blockedCount * 15, 30);
  score -= Math.min(highRiskCount * 12, 25);
  score -= Math.min(staleCount * 8, 20);
  score -= Math.min(scopeCreepCount * 5, 15);
  score -= Math.min(resourceOverloadCount * 5, 10);
  score = Math.max(0, score);

  let label: HealthLabel;
  if (blockedCount > 0 || highRiskCount > 0) {
    label = score < 50 ? 'blocked' : 'at-risk';
  } else if (staleCount > 0 || scopeCreepCount > 0 || resourceOverloadCount > 0) {
    label = 'at-risk';
  } else {
    label = 'healthy';
  }

  return { overall: Math.round(score), label };
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportService: ReportService,
  ) {}

  async findAll(): Promise<ProjectSummaryDto[]> {
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
    };

    try {
      const report = await this.reportService.compute(project.key);
      signals.blockedCount = report.summary.blocked;
      signals.staleCount = report.staleStories.length;
      signals.highRiskCount = report.risks.filter((r) => r.severity === 'high').length;
      signals.scopeCreepCount = report.risks.filter((r) => r.kind === 'scope_creep').length;
      signals.resourceOverloadCount = report.risks.filter((r) => r.kind === 'resource_overload').length;
    } catch {
      // No artifacts yet (e.g. project just created, no sync run) → healthy with zeroes
    }

    const health = deriveHealth(signals);
    const openRiskCount = signals.highRiskCount + signals.scopeCreepCount + signals.resourceOverloadCount;

    return {
      id: project.id,
      key: project.key,
      name: project.name,
      status: health.label,
      health,
      lastSyncedAt: project.lastSyncedAt ? project.lastSyncedAt.toISOString() : null,
      openRiskCount,
    };
  }
}
