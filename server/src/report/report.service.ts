// server/src/report/report.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WeeklyReportDto, ReportItemDto, RiskDto } from './report.dto';
import { DemoDataService } from '../demo/demo-data.service';
import { LiveDataService } from '../live/live-data.service';
import { NarrativeService, NarrativeInput } from './narrative.service';

export interface ReportOptions {
  windowDays?: number;
  staleDays?: number;
  prIdleDays?: number;
  overloadThreshold?: number;
  blockedStatuses?: string[];
  asOf?: Date; // override "now" for deterministic tests
}

// ---------------------------------------------------------------------------
// Pure data shapes consumed by computeFromData
// ---------------------------------------------------------------------------

export interface RawArtifact {
  id: string;
  projectId: string;
  key: string;
  type: string;
  status: string;
  statusCategory: string;
  assignee: string | null;
  points: number | null;
  sprintId?: string | null;
  jiraUpdatedAt: Date;
  addedToSprintAfterStart: boolean;
  raw: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface RawCommit {
  id: string;
  projectId: string;
  repo: string;
  hash: string;
  message: string;
  author: string;
  date: Date;
  linkedIssueKeys: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface RawPullRequest {
  id: string;
  projectId: string;
  repo: string;
  prId: string;
  title: string;
  state: string;
  sourceBranch: string;
  destBranch: string;
  createdOn: Date;
  updatedOn: Date;
  linkedIssueKeys: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Pure computation (no Prisma, no DemoDataService — just data → DTO)
// Accepts an optional async narrative generator so both paths can reuse it.
// ---------------------------------------------------------------------------

export async function computeFromData(
  projectId: string,
  projectKey: string,
  artifacts: RawArtifact[],
  commits: RawCommit[],
  openPrs: RawPullRequest[],
  opts: ReportOptions = {},
  narrativeFn?: (input: NarrativeInput) => Promise<string>,
): Promise<WeeklyReportDto> {
  const {
    staleDays = 3,
    prIdleDays = 2,
    overloadThreshold = 5,
    blockedStatuses = ['Blocked'],
    asOf = new Date(),
  } = opts;

  // --- 1. Classify artifacts into mutually exclusive buckets ----------------
  const blockedLower = blockedStatuses.map((s) => s.toLowerCase());

  const doneArtifacts: RawArtifact[] = [];
  const inProgressArtifacts: RawArtifact[] = [];
  const blockedArtifacts: RawArtifact[] = [];
  const todoArtifacts: RawArtifact[] = [];

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
      todoArtifacts.push(a);
    }
  }

  // --- 2. Points committed / completed --------------------------------------
  const sum = (arr: RawArtifact[]) =>
    arr.reduce((acc, a) => acc + (a.points ?? 0), 0);

  const pointsCompleted = sum(doneArtifacts);
  const pointsCommitted = sum(artifacts);

  // --- 3. Staleness (commit-based when commits exist; fallback to Jira proxy)
  const staleThreshold = new Date(asOf.getTime() - staleDays * 86_400_000);
  const hasCommits = commits.length > 0;
  const stalenessMode: 'commit' | 'jira-proxy' = hasCommits ? 'commit' : 'jira-proxy';

  let staleArtifacts: RawArtifact[];

  if (stalenessMode === 'commit') {
    staleArtifacts = inProgressArtifacts.filter((a) => {
      const linkedCommits = commits.filter((c) =>
        (c.linkedIssueKeys as string[]).includes(a.key),
      );
      if (linkedCommits.length === 0) return true;
      return !linkedCommits.some((c) => c.date >= staleThreshold);
    });
  } else {
    staleArtifacts = inProgressArtifacts.filter(
      (a) => a.jiraUpdatedAt < staleThreshold,
    );
  }

  // --- 4. Idle PRs ----------------------------------------------------------
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

  // --- 5. Risks -------------------------------------------------------------
  const risks: RiskDto[] = [];
  let riskSeq = 0;

  const scopeCreepArtifacts = artifacts.filter((a) => a.addedToSprintAfterStart);
  for (const a of scopeCreepArtifacts) {
    risks.push({
      id: `risk-${++riskSeq}`,
      projectId: projectKey,
      kind: 'scope_creep',
      severity: 'high',
      subjectRef: a.key,
      title: `Scope creep: ${a.key} added after sprint start`,
      evidence: `${a.key} was added to the sprint after it started`,
      recommendation:
        'Review with PM whether this issue should be moved to backlog or is genuinely urgent.',
    });
  }

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
        projectId: projectKey,
        kind: 'resource_overload',
        severity: 'medium',
        subjectRef: keys[0],
        title: `Resource overload: ${assignee} has ${keys.length} concurrent in-progress issues`,
        evidence: `${assignee} is assigned to ${keys.length} in-progress issues: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`,
        recommendation: `Reduce ${assignee}'s WIP to ${overloadThreshold} or fewer items.`,
      });
    }
  }

  // --- 6. Narrative ---------------------------------------------------------
  let narrative: string;

  if (narrativeFn) {
    const narrativeInput: NarrativeInput = {
      projectKey,
      periodEnd: nextFriday(asOf).toISOString().slice(0, 10),
      summary: {
        done: doneArtifacts.length,
        inProgress: inProgressArtifacts.length,
        todo: todoArtifacts.length,
        blocked: blockedArtifacts.length,
        pointsCompleted,
        pointsCommitted,
      },
      staleStoryKeys: staleArtifacts.map((a) => a.key),
      scopeCreepKeys: scopeCreepArtifacts.map((a) => a.key),
      idlePrCount: idlePrs.length,
      riskCount: risks.length,
      stalenessMode,
      staleDays,
      prIdleDays,
    };
    narrative = await narrativeFn(narrativeInput);
  } else {
    // Deterministic fallback template (also used by NarrativeService when no key)
    const staleKeys = staleArtifacts.map((a) => `[[${a.key}]]`).join(', ') || 'none';
    const scopeCreepKeys = scopeCreepArtifacts.map((a) => `[[${a.key}]]`).join(', ') || 'none';
    narrative =
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
  }

  // --- 7. Derived period-end (next Friday relative to asOf) ----------------
  const periodEnd = nextFriday(asOf).toISOString().slice(0, 10);

  // --- 8. dataCompleteness -------------------------------------------------
  const dataCompleteness = hasCommits ? 1.0 : 0.8;

  const toItem = (a: RawArtifact): ReportItemDto => ({
    key: a.key,
    title: (a.raw as Record<string, unknown>)?.['title'] as string ?? a.key,
    assignee: a.assignee ?? 'Unassigned',
  });

  return {
    projectId,
    projectKey,
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

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly demoDataService: DemoDataService,
    private readonly liveDataService: LiveDataService,
    private readonly narrativeService: NarrativeService,
  ) {}

  async compute(projectKey: string, opts: ReportOptions = {}): Promise<WeeklyReportDto> {
    const isLiveFetch = this.configService.get<boolean>('LIVE_FETCH') === true;
    const isDemoMode = this.configService.get<boolean>('DEMO_MODE') === true;

    if (isLiveFetch) {
      return this.computeLive(projectKey, opts);
    }

    if (isDemoMode) {
      return this.computeDemo(projectKey, opts);
    }

    return this.computeFromPrisma(projectKey, opts);
  }

  // -------------------------------------------------------------------------
  // Live-fetch path
  // -------------------------------------------------------------------------

  private async computeLive(projectKey: string, opts: ReportOptions): Promise<WeeklyReportDto> {
    const project = await this.liveDataService.getProject(projectKey);
    if (!project) {
      throw new NotFoundException(`Project with key "${projectKey}" not found`);
    }

    const artifacts = await this.liveDataService.getArtifacts(projectKey);
    // No Bitbucket in LIVE_FETCH — commits and PRs are empty
    const commits = this.liveDataService.getCommits(projectKey);
    const openPrs = this.liveDataService
      .getPullRequests(projectKey)
      .filter((pr) => pr.state === 'OPEN');

    return computeFromData(
      project.id,
      projectKey,
      artifacts,
      commits,
      openPrs,
      opts,
      (input) => this.narrativeService.generate(input),
    );
  }

  // -------------------------------------------------------------------------
  // Demo path
  // -------------------------------------------------------------------------

  private async computeDemo(projectKey: string, opts: ReportOptions): Promise<WeeklyReportDto> {
    const project = this.demoDataService.getProject(projectKey);
    if (!project) {
      throw new NotFoundException(`Project with key "${projectKey}" not found`);
    }

    const artifacts = this.demoDataService.getArtifacts(projectKey);
    const commits = this.demoDataService.getCommits(projectKey);
    const openPrs = this.demoDataService
      .getPullRequests(projectKey)
      .filter((pr) => pr.state === 'OPEN');

    return computeFromData(
      project.id,
      projectKey,
      artifacts,
      commits,
      openPrs,
      opts,
      (input) => this.narrativeService.generate(input),
    );
  }

  // -------------------------------------------------------------------------
  // Prisma path (original logic, now delegated to computeFromData)
  // -------------------------------------------------------------------------

  private async computeFromPrisma(
    projectKey: string,
    opts: ReportOptions,
  ): Promise<WeeklyReportDto> {
    const { windowDays = 7 } = opts;
    // suppress unused warning for windowDays (reserved for future use)
    void windowDays;

    const project = await this.prisma.project.findUnique({
      where: { key: projectKey },
    });
    if (!project) {
      throw new NotFoundException(`Project with key "${projectKey}" not found`);
    }

    const activeSprint = await this.prisma.sprint.findFirst({
      where: { projectId: project.id, state: 'active' },
      orderBy: { startDate: 'desc' },
    });

    const artifacts = await this.prisma.artifact.findMany({
      where: {
        projectId: project.id,
        ...(activeSprint ? { sprintId: activeSprint.id } : {}),
      },
    });

    const commits = await this.prisma.commit.findMany({
      where: { projectId: project.id },
    });

    const openPrs = await this.prisma.pullRequest.findMany({
      where: { projectId: project.id, state: 'OPEN' },
    });

    // Cast Prisma types to RawArtifact/RawCommit/RawPullRequest shapes
    const rawArtifacts = artifacts as unknown as RawArtifact[];
    const rawCommits = commits as unknown as RawCommit[];
    const rawPrs = openPrs as unknown as RawPullRequest[];

    return computeFromData(
      project.id,
      project.key,
      rawArtifacts,
      rawCommits,
      rawPrs,
      opts,
      (input) => this.narrativeService.generate(input),
    );
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
