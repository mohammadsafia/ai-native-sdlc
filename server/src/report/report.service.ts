// server/src/report/report.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WeeklyReportDto, ReportItemDto, RiskDto } from './report.dto';

export interface ReportOptions {
  windowDays?: number;
  staleDays?: number;
  prIdleDays?: number;
  overloadThreshold?: number;
  blockedStatuses?: string[];
  asOf?: Date; // override "now" for deterministic tests
}

@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  async compute(projectKey: string, opts: ReportOptions = {}): Promise<WeeklyReportDto> {
    const {
      windowDays = 7,
      staleDays = 3,
      prIdleDays = 2,
      overloadThreshold = 5,
      blockedStatuses = ['Blocked'],
      asOf = new Date(),
    } = opts;

    // suppress unused warning for windowDays (reserved for future use)
    void windowDays;

    // --- 1. Resolve the project -----------------------------------------------
    const project = await this.prisma.project.findUnique({
      where: { key: projectKey },
    });
    if (!project) {
      throw new NotFoundException(`Project with key "${projectKey}" not found`);
    }

    // --- 2. Find the active sprint for this project ----------------------------
    const activeSprint = await this.prisma.sprint.findFirst({
      where: { projectId: project.id, state: 'active' },
      orderBy: { startDate: 'desc' },
    });

    // --- 3. Fetch artifacts (scoped to active sprint if one exists) ------------
    const artifacts = await this.prisma.artifact.findMany({
      where: {
        projectId: project.id,
        ...(activeSprint ? { sprintId: activeSprint.id } : {}),
      },
    });

    // --- 4. Fetch commits for this project ------------------------------------
    const commits = await this.prisma.commit.findMany({
      where: { projectId: project.id },
    });

    // --- 5. Fetch open PRs for this project -----------------------------------
    const openPrs = await this.prisma.pullRequest.findMany({
      where: { projectId: project.id, state: 'OPEN' },
    });

    // --- 6. Classify artifacts into mutually exclusive buckets ----------------
    // blocked:     statusCategory == 'in_progress' AND status name is in blockedStatuses
    // inProgress:  statusCategory == 'in_progress' AND NOT blocked
    // done:        statusCategory == 'done'
    // todo:        everything else (statusCategory == 'todo')
    const blockedLower = blockedStatuses.map((s) => s.toLowerCase());

    const doneArtifacts: typeof artifacts = [];
    const inProgressArtifacts: typeof artifacts = [];
    const blockedArtifacts: typeof artifacts = [];
    const todoArtifacts: typeof artifacts = [];

    for (const a of artifacts) {
      if (a.statusCategory === 'done') {
        doneArtifacts.push(a);
      } else if (a.statusCategory === 'in_progress') {
        if (blockedLower.includes(a.status.toLowerCase())) {
          blockedArtifacts.push(a);
        } else {
          inProgressArtifacts.push(a);
        }
      } else {
        // todo / new / anything else
        todoArtifacts.push(a);
      }
    }

    // --- 7. Points committed / completed --------------------------------------
    const sum = (arr: typeof artifacts) =>
      arr.reduce((acc, a) => acc + (a.points ?? 0), 0);

    const pointsCompleted = sum(doneArtifacts);
    const pointsCommitted = sum(artifacts); // all sprint artifacts

    // --- 8. Staleness (commit-based when commits exist; fallback to Jira proxy) -
    const staleThreshold = new Date(asOf.getTime() - staleDays * 86_400_000);
    const hasCommits = commits.length > 0;
    const stalenessMode: 'commit' | 'jira-proxy' = hasCommits ? 'commit' : 'jira-proxy';

    let staleArtifacts: typeof artifacts;

    if (stalenessMode === 'commit') {
      // An in-progress artifact is stale if NO linked commit is dated >= staleThreshold
      staleArtifacts = inProgressArtifacts.filter((a) => {
        const linkedCommits = commits.filter((c) =>
          (c.linkedIssueKeys as string[]).includes(a.key),
        );
        if (linkedCommits.length === 0) {
          // No commits linked at all → stale
          return true;
        }
        // Has at least one recent commit → NOT stale
        return !linkedCommits.some((c) => c.date >= staleThreshold);
      });
    } else {
      // Fallback: Jira-updated proxy (existing behavior)
      staleArtifacts = inProgressArtifacts.filter(
        (a) => a.jiraUpdatedAt < staleThreshold,
      );
    }

    // --- 9. Idle PRs ----------------------------------------------------------
    const prIdleThreshold = new Date(asOf.getTime() - prIdleDays * 86_400_000);
    const idlePrs = openPrs
      .filter((pr) => (pr.updatedOn as Date) < prIdleThreshold)
      .map((pr) => ({
        id: pr.id,
        title: pr.title,
        daysIdle: Math.floor(
          (asOf.getTime() - (pr.updatedOn as Date).getTime()) / 86_400_000,
        ),
      }));

    // --- 10. Risks -------------------------------------------------------------
    const risks: RiskDto[] = [];
    let riskSeq = 0;

    // 10a. Scope-creep risks
    const scopeCreepArtifacts = artifacts.filter((a) => a.addedToSprintAfterStart);
    for (const a of scopeCreepArtifacts) {
      risks.push({
        id: `risk-${++riskSeq}`,
        projectId: project.key,
        kind: 'scope_creep',
        severity: 'high',
        subjectRef: a.key,
        title: `Scope creep: [[${a.key}]] added after sprint start`,
        evidence: `${a.key} was added to the sprint after it started`,
        recommendation:
          'Review with PM whether this issue should be moved to backlog or is genuinely urgent.',
      });
    }

    // 10b. Resource-overload risks
    const inProgressByAssignee = new Map<string, string[]>();
    for (const a of inProgressArtifacts) {
      const assignee = a.assignee ?? 'Unassigned';
      if (!inProgressByAssignee.has(assignee)) {
        inProgressByAssignee.set(assignee, []);
      }
      inProgressByAssignee.get(assignee)!.push(a.key);
    }
    for (const [assignee, keys] of inProgressByAssignee.entries()) {
      if (keys.length > overloadThreshold) {
        risks.push({
          id: `risk-${++riskSeq}`,
          projectId: project.key,
          kind: 'resource_overload',
          severity: 'medium',
          subjectRef: keys[0],
          title: `Resource overload: ${assignee} has ${keys.length} concurrent in-progress issues`,
          evidence: `${assignee} is assigned to ${keys.length} in-progress issues: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`,
          recommendation: `Reduce ${assignee}'s WIP to ${overloadThreshold} or fewer items.`,
        });
      }
    }

    // --- 11. Narrative --------------------------------------------------------
    const staleKeys = staleArtifacts.map((a) => `[[${a.key}]]`).join(', ') || 'none';
    const scopeCreepKeys = scopeCreepArtifacts.map((a) => `[[${a.key}]]`).join(', ') || 'none';
    const narrative =
      `Sprint summary: ${doneArtifacts.length} done, ` +
      `${inProgressArtifacts.length} in-progress, ` +
      `${blockedArtifacts.length} blocked, ` +
      `${todoArtifacts.length} to-do. ` +
      `Points: ${pointsCompleted}/${pointsCommitted} completed. ` +
      `${staleArtifacts.length} stale story(ies) (${stalenessMode === 'commit' ? 'commit-based' : 'Jira-update proxy'}, ${staleDays}+ days): ${staleKeys}. ` +
      `${scopeCreepArtifacts.length} scope-creep item(s) added after sprint start: ${scopeCreepKeys}. ` +
      `${idlePrs.length} idle PR(s) (no update in ${prIdleDays}+ days). ` +
      `${risks.length} risk(s) detected. ` +
      `NOTE: narrative will be Claude-generated once the LLM gateway is wired.`;

    // --- 12. Derived period-end (next Friday relative to asOf) ----------------
    const periodEnd = nextFriday(asOf).toISOString().slice(0, 10);

    // --- 13. dataCompleteness: 1.0 when Bitbucket data present, 0.8 otherwise -
    const dataCompleteness = hasCommits ? 1.0 : 0.8;

    const toItem = (a: (typeof artifacts)[0]): ReportItemDto => ({
      key: a.key,
      title: (a.raw as Record<string, unknown>)?.['title'] as string ?? a.key,
      assignee: a.assignee ?? 'Unassigned',
    });

    return {
      projectId: project.id,
      projectKey: project.key,
      periodEnd,
      generatedAt: asOf.toISOString(),
      dataCompleteness,
      summary: {
        done: doneArtifacts.length,
        inProgress: inProgressArtifacts.length,
        todo: todoArtifacts.length,
        blocked: blockedArtifacts.length,
        pointsCompleted,
        pointsCommitted,
      },
      completed: doneArtifacts.map(toItem),
      inProgress: inProgressArtifacts.map(toItem),
      staleStories: staleArtifacts.map(toItem),
      idlePrs,
      risks,
      narrative,
    };
  }
}

/** Returns the next Friday on or after a given date (ISO date boundary). */
function nextFriday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun ... 5=Fri ... 6=Sat
  const daysUntilFriday = (5 - day + 7) % 7;
  d.setDate(d.getDate() + (daysUntilFriday === 0 ? 7 : daysUntilFriday));
  d.setHours(23, 59, 59, 0);
  return d;
}
