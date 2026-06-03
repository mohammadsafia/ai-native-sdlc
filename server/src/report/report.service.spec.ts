// server/src/report/report.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ReportService } from './report.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DemoDataService } from '../demo/demo-data.service';

// Minimal ConfigService mock: DEMO_MODE = false (Prisma path)
const mockConfigService = { get: jest.fn().mockReturnValue(false) };

// Minimal DemoDataService mock (not used in non-demo tests)
const mockDemoDataService = {
  getProject: jest.fn(),
  getArtifacts: jest.fn().mockReturnValue([]),
  getCommits: jest.fn().mockReturnValue([]),
  getPullRequests: jest.fn().mockReturnValue([]),
  getSprints: jest.fn().mockReturnValue([]),
};

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const PROJECT = { id: 'proj-1', key: 'PROJ', name: 'My Project', lastSyncedAt: new Date('2026-06-01') };
const SPRINT = { id: 'sprint-1', projectId: 'proj-1', name: 'Sprint 1', state: 'active', startDate: new Date('2026-05-26'), endDate: new Date('2026-06-06') };

const FROZEN_NOW = new Date('2026-06-03T12:00:00.000Z');
const STALE_THRESHOLD = new Date(FROZEN_NOW.getTime() - 3 * 86_400_000); // 3 days ago = 2026-05-31

/** Make a minimal Artifact fixture. */
function artifact(
  overrides: Partial<{
    id: string;
    key: string;
    statusCategory: string;
    status: string;
    assignee: string | null;
    points: number | null;
    jiraUpdatedAt: Date;
    addedToSprintAfterStart: boolean;
    sprintId: string | null;
  }>,
) {
  return {
    id: overrides.id ?? `art-${overrides.key ?? 'x'}`,
    projectId: 'proj-1',
    key: overrides.key ?? 'PROJ-99',
    type: 'story',
    status: overrides.status ?? 'In Progress',
    statusCategory: overrides.statusCategory ?? 'in_progress',
    assignee: overrides.assignee ?? 'Alice',
    points: overrides.points ?? null,
    sprintId: overrides.sprintId ?? 'sprint-1',
    jiraUpdatedAt: overrides.jiraUpdatedAt ?? FROZEN_NOW,
    addedToSprintAfterStart: overrides.addedToSprintAfterStart ?? false,
    raw: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Seeded fixture set (all in sprint-1)
// ---------------------------------------------------------------------------
const FIXTURES = [
  // done
  artifact({ key: 'PROJ-1', statusCategory: 'done', status: 'Done', points: 5, jiraUpdatedAt: FROZEN_NOW }),
  artifact({ key: 'PROJ-2', statusCategory: 'done', status: 'Done', points: 3, jiraUpdatedAt: FROZEN_NOW }),

  // in-progress (fresh)
  artifact({ key: 'PROJ-3', statusCategory: 'in_progress', status: 'In Progress', points: 2, jiraUpdatedAt: FROZEN_NOW }),

  // in-progress STALE (jiraUpdatedAt = 5 days ago — older than staleDays=3)
  artifact({
    key: 'PROJ-10',
    statusCategory: 'in_progress',
    status: 'In Progress',
    points: 3,
    jiraUpdatedAt: new Date(FROZEN_NOW.getTime() - 5 * 86_400_000),
  }),

  // blocked (statusCategory = in_progress but status name = 'Blocked')
  artifact({ key: 'PROJ-5', statusCategory: 'in_progress', status: 'Blocked', points: 1 }),

  // todo
  artifact({ key: 'PROJ-6', statusCategory: 'todo', status: 'To Do', points: 2 }),

  // scope-creep (addedToSprintAfterStart = true)
  artifact({ key: 'PROJ-99', statusCategory: 'in_progress', status: 'In Progress', addedToSprintAfterStart: true, points: 0 }),
];

// ---------------------------------------------------------------------------
// Mock PrismaService
// ---------------------------------------------------------------------------
function buildMockPrisma(overrides: {
  project?: object | null;
  sprint?: object | null;
  artifacts?: object[];
  commits?: object[];
  pullRequests?: object[];
} = {}) {
  return {
    project: {
      findUnique: jest.fn().mockResolvedValue(overrides.project !== undefined ? overrides.project : PROJECT),
    },
    sprint: {
      findFirst: jest.fn().mockResolvedValue(overrides.sprint !== undefined ? overrides.sprint : SPRINT),
    },
    artifact: {
      findMany: jest.fn().mockResolvedValue(overrides.artifacts !== undefined ? overrides.artifacts : FIXTURES),
    },
    commit: {
      findMany: jest.fn().mockResolvedValue(overrides.commits !== undefined ? overrides.commits : []),
    },
    pullRequest: {
      findMany: jest.fn().mockResolvedValue(overrides.pullRequests !== undefined ? overrides.pullRequests : []),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ReportService', () => {
  let service: ReportService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DemoDataService, useValue: mockDemoDataService },
      ],
    }).compile();

    service = module.get<ReportService>(ReportService);
  });

  // -------------------------------------------------------------------------
  describe('project not found', () => {
    it('throws NotFoundException when project does not exist', async () => {
      mockPrisma = buildMockPrisma({ project: null });
      const mod = await Test.createTestingModule({
        providers: [
          ReportService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: DemoDataService, useValue: mockDemoDataService },
        ],
      }).compile();
      const svc = mod.get<ReportService>(ReportService);

      await expect(svc.compute('MISSING', { asOf: FROZEN_NOW })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  describe('bucket reconciliation', () => {
    it('buckets are mutually exclusive and exhaustive: sum equals total artifact count', async () => {
      const report = await service.compute('PROJ', { asOf: FROZEN_NOW });
      const { done, inProgress, todo, blocked } = report.summary;
      expect(done + inProgress + todo + blocked).toBe(FIXTURES.length);
    });

    it('done count is correct', async () => {
      const report = await service.compute('PROJ', { asOf: FROZEN_NOW });
      expect(report.summary.done).toBe(2);
    });

    it('blocked count is correct (status = Blocked, not double-counted as inProgress)', async () => {
      const report = await service.compute('PROJ', { asOf: FROZEN_NOW });
      expect(report.summary.blocked).toBe(1);
    });

    it('todo count is correct', async () => {
      const report = await service.compute('PROJ', { asOf: FROZEN_NOW });
      expect(report.summary.todo).toBe(1);
    });

    it('inProgress count excludes blocked and stale detection does not remove from bucket', async () => {
      // stale detection = staleStories list; the artifact stays in inProgress bucket
      const report = await service.compute('PROJ', { asOf: FROZEN_NOW });
      // PROJ-3, PROJ-10 (stale), PROJ-99 (scope-creep) are all in inProgress bucket
      expect(report.summary.inProgress).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  describe('stale stories', () => {
    it('detects stale in-progress artifact (jiraUpdatedAt 5 days ago, staleDays=3)', async () => {
      const report = await service.compute('PROJ', { asOf: FROZEN_NOW, staleDays: 3 });
      const keys = report.staleStories.map((s) => s.key);
      expect(keys).toContain('PROJ-10');
    });

    it('does not include fresh in-progress artifact in staleStories', async () => {
      const report = await service.compute('PROJ', { asOf: FROZEN_NOW, staleDays: 3 });
      const keys = report.staleStories.map((s) => s.key);
      expect(keys).not.toContain('PROJ-3');
    });

    it('does not include done or todo artifacts in staleStories', async () => {
      const report = await service.compute('PROJ', { asOf: FROZEN_NOW, staleDays: 3 });
      const keys = report.staleStories.map((s) => s.key);
      expect(keys).not.toContain('PROJ-1');
      expect(keys).not.toContain('PROJ-6');
    });
  });

  // -------------------------------------------------------------------------
  describe('scope-creep risk', () => {
    it('produces a scope_creep risk for artifact with addedToSprintAfterStart=true', async () => {
      const report = await service.compute('PROJ', { asOf: FROZEN_NOW });
      const scopeCreepRisks = report.risks.filter((r) => r.kind === 'scope_creep');
      expect(scopeCreepRisks.length).toBe(1);
      expect(scopeCreepRisks[0].subjectRef).toBe('PROJ-99');
      expect(scopeCreepRisks[0].severity).toBe('high');
    });

    it('scope-creep risk has non-empty evidence and recommendation', async () => {
      const report = await service.compute('PROJ', { asOf: FROZEN_NOW });
      const risk = report.risks.find((r) => r.kind === 'scope_creep')!;
      expect(risk.evidence.length).toBeGreaterThan(0);
      expect(risk.recommendation.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('resource-overload risk', () => {
    it('fires when an assignee has more in-progress items than overloadThreshold', async () => {
      // Create 6 in-progress items all assigned to Bob (threshold = 5)
      const heavyLoad = Array.from({ length: 6 }, (_, i) =>
        artifact({ key: `PROJ-${100 + i}`, statusCategory: 'in_progress', status: 'In Progress', assignee: 'Bob' }),
      );
      const mockPrismaOverload = buildMockPrisma({ artifacts: heavyLoad });
      const mod = await Test.createTestingModule({
        providers: [
          ReportService,
          { provide: PrismaService, useValue: mockPrismaOverload },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: DemoDataService, useValue: mockDemoDataService },
        ],
      }).compile();
      const svc = mod.get<ReportService>(ReportService);

      const report = await svc.compute('PROJ', { asOf: FROZEN_NOW, overloadThreshold: 5 });
      const overloadRisks = report.risks.filter((r) => r.kind === 'resource_overload');
      expect(overloadRisks.length).toBe(1);
      expect(overloadRisks[0].evidence).toContain('Bob');
    });

    it('does NOT fire when in-progress count equals the threshold', async () => {
      const exactLoad = Array.from({ length: 5 }, (_, i) =>
        artifact({ key: `PROJ-${200 + i}`, statusCategory: 'in_progress', status: 'In Progress', assignee: 'Carol' }),
      );
      const mockPrismaExact = buildMockPrisma({ artifacts: exactLoad });
      const mod = await Test.createTestingModule({
        providers: [
          ReportService,
          { provide: PrismaService, useValue: mockPrismaExact },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: DemoDataService, useValue: mockDemoDataService },
        ],
      }).compile();
      const svc = mod.get<ReportService>(ReportService);

      const report = await svc.compute('PROJ', { asOf: FROZEN_NOW, overloadThreshold: 5 });
      const overloadRisks = report.risks.filter((r) => r.kind === 'resource_overload');
      expect(overloadRisks.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('points', () => {
    it('pointsCompleted is sum of done artifact points', async () => {
      const report = await service.compute('PROJ', { asOf: FROZEN_NOW });
      // PROJ-1=5, PROJ-2=3 → 8
      expect(report.summary.pointsCompleted).toBe(8);
    });

    it('pointsCommitted is sum of ALL sprint artifact points', async () => {
      const report = await service.compute('PROJ', { asOf: FROZEN_NOW });
      // PROJ-1=5, PROJ-2=3, PROJ-3=2, PROJ-10=3, PROJ-5=1, PROJ-6=2, PROJ-99=0 → 16
      expect(report.summary.pointsCommitted).toBe(16);
    });
  });

  // -------------------------------------------------------------------------
  describe('determinism', () => {
    it('produces identical output for two calls with the same frozen asOf', async () => {
      const r1 = await service.compute('PROJ', { asOf: FROZEN_NOW });
      const r2 = await service.compute('PROJ', { asOf: FROZEN_NOW });
      expect(r1).toEqual(r2);
    });

    it('generatedAt reflects the asOf date, not wall clock', async () => {
      const report = await service.compute('PROJ', { asOf: FROZEN_NOW });
      expect(report.generatedAt).toBe(FROZEN_NOW.toISOString());
    });
  });

  // -------------------------------------------------------------------------
  describe('output shape', () => {
    it('projectKey matches the requested key', async () => {
      const report = await service.compute('PROJ', { asOf: FROZEN_NOW });
      expect(report.projectKey).toBe('PROJ');
    });

    it('dataCompleteness is 0.8 (no Bitbucket connector yet)', async () => {
      const report = await service.compute('PROJ', { asOf: FROZEN_NOW });
      expect(report.dataCompleteness).toBe(0.8);
    });

    it('idlePrs is an empty array when no open PRs exist', async () => {
      const report = await service.compute('PROJ', { asOf: FROZEN_NOW });
      expect(report.idlePrs).toEqual([]);
    });

    it('narrative mentions stale and scope-creep specifics', async () => {
      const report = await service.compute('PROJ', { asOf: FROZEN_NOW });
      expect(report.narrative).toContain('PROJ-10');
      expect(report.narrative).toContain('PROJ-99');
    });
  });

  // -------------------------------------------------------------------------
  describe('commit-based staleness (Bitbucket data present)', () => {
    const FROZEN_NOW_CB = new Date('2026-06-03T12:00:00.000Z');

    // Commit for PROJ-10 (in-progress in FIXTURES) dated 5 days ago — outside staleDays=3 window
    // PROJ-10 is in_progress with jiraUpdatedAt 5 days ago; its OLD_COMMIT is also 5 days ago → stale
    const OLD_COMMIT = {
      id: 'c1',
      projectId: 'proj-1',
      repo: 'my-repo',
      hash: 'abc123',
      message: 'fix: resolve PROJ-10 null pointer',
      author: 'Alice',
      date: new Date(FROZEN_NOW_CB.getTime() - 5 * 86_400_000), // 2026-05-29
      linkedIssueKeys: ['PROJ-10'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Commit for PROJ-3 (in-progress in FIXTURES) dated 1 day ago — within staleDays=3 window
    const FRESH_COMMIT = {
      id: 'c2',
      projectId: 'proj-1',
      repo: 'my-repo',
      hash: 'def456',
      message: 'feat: implement PROJ-3 dashboard widget',
      author: 'Bob',
      date: new Date(FROZEN_NOW_CB.getTime() - 1 * 86_400_000), // 2026-06-02
      linkedIssueKeys: ['PROJ-3'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Open PR idle 4 days (older than prIdleDays=2)
    const IDLE_PR = {
      id: 'pr-1',
      projectId: 'proj-1',
      repo: 'my-repo',
      prId: '101',
      title: 'feat: PROJ-1 login flow fix',
      state: 'OPEN',
      sourceBranch: 'feature/PROJ-1-login-fix',
      destBranch: 'main',
      createdOn: new Date('2026-05-25T10:00:00.000Z'),
      updatedOn: new Date(FROZEN_NOW_CB.getTime() - 4 * 86_400_000), // 2026-05-30
      linkedIssueKeys: ['PROJ-1'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Open PR fresh (not idle)
    const FRESH_PR = {
      id: 'pr-2',
      projectId: 'proj-1',
      repo: 'my-repo',
      prId: '102',
      title: 'feat: PROJ-3 dashboard widget',
      state: 'OPEN',
      sourceBranch: 'feature/PROJ-3-dashboard',
      destBranch: 'main',
      createdOn: new Date('2026-06-01T10:00:00.000Z'),
      updatedOn: new Date(FROZEN_NOW_CB.getTime() - 1 * 86_400_000), // 2026-06-02
      linkedIssueKeys: ['PROJ-3'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('PROJ-10 with old commit (5 days ago) is stale at staleDays=3', async () => {
      // PROJ-10 is in_progress in FIXTURES; its linked commit is 5 days old → stale
      const mockPrismaCB = buildMockPrisma({ commits: [OLD_COMMIT, FRESH_COMMIT] });
      const mod = await Test.createTestingModule({
        providers: [
          ReportService,
          { provide: PrismaService, useValue: mockPrismaCB },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: DemoDataService, useValue: mockDemoDataService },
        ],
      }).compile();
      const svc = mod.get<ReportService>(ReportService);

      const report = await svc.compute('PROJ', { asOf: FROZEN_NOW_CB, staleDays: 3 });
      const staleKeys = report.staleStories.map((s) => s.key);
      expect(staleKeys).toContain('PROJ-10');
    });

    it('PROJ-3 with fresh commit (1 day ago) is NOT stale at staleDays=3', async () => {
      // PROJ-3 is in_progress in FIXTURES; its linked commit is 1 day old → not stale
      const mockPrismaCB = buildMockPrisma({ commits: [OLD_COMMIT, FRESH_COMMIT] });
      const mod = await Test.createTestingModule({
        providers: [
          ReportService,
          { provide: PrismaService, useValue: mockPrismaCB },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: DemoDataService, useValue: mockDemoDataService },
        ],
      }).compile();
      const svc = mod.get<ReportService>(ReportService);

      const report = await svc.compute('PROJ', { asOf: FROZEN_NOW_CB, staleDays: 3 });
      const staleKeys = report.staleStories.map((s) => s.key);
      expect(staleKeys).not.toContain('PROJ-3');
    });

    it('dataCompleteness is 1.0 when commits exist', async () => {
      const mockPrismaCB = buildMockPrisma({ commits: [OLD_COMMIT] });
      const mod = await Test.createTestingModule({
        providers: [
          ReportService,
          { provide: PrismaService, useValue: mockPrismaCB },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: DemoDataService, useValue: mockDemoDataService },
        ],
      }).compile();
      const svc = mod.get<ReportService>(ReportService);

      const report = await svc.compute('PROJ', { asOf: FROZEN_NOW_CB });
      expect(report.dataCompleteness).toBe(1.0);
    });

    it('idle PR (4 days old) appears in idlePrs with correct daysIdle', async () => {
      const mockPrismaCB = buildMockPrisma({
        commits: [OLD_COMMIT],
        pullRequests: [IDLE_PR, FRESH_PR],
      });
      const mod = await Test.createTestingModule({
        providers: [
          ReportService,
          { provide: PrismaService, useValue: mockPrismaCB },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: DemoDataService, useValue: mockDemoDataService },
        ],
      }).compile();
      const svc = mod.get<ReportService>(ReportService);

      const report = await svc.compute('PROJ', { asOf: FROZEN_NOW_CB, prIdleDays: 2 });
      expect(report.idlePrs).toHaveLength(1);
      expect(report.idlePrs[0].id).toBe('pr-1');
      expect(report.idlePrs[0].daysIdle).toBe(4);
    });

    it('fresh PR (1 day old) does NOT appear in idlePrs at prIdleDays=2', async () => {
      const mockPrismaCB = buildMockPrisma({
        commits: [OLD_COMMIT],
        pullRequests: [FRESH_PR],
      });
      const mod = await Test.createTestingModule({
        providers: [
          ReportService,
          { provide: PrismaService, useValue: mockPrismaCB },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: DemoDataService, useValue: mockDemoDataService },
        ],
      }).compile();
      const svc = mod.get<ReportService>(ReportService);

      const report = await svc.compute('PROJ', { asOf: FROZEN_NOW_CB, prIdleDays: 2 });
      expect(report.idlePrs).toHaveLength(0);
    });

    it('narrative indicates commit-based staleness mode when commits exist', async () => {
      const mockPrismaCB = buildMockPrisma({ commits: [OLD_COMMIT, FRESH_COMMIT] });
      const mod = await Test.createTestingModule({
        providers: [
          ReportService,
          { provide: PrismaService, useValue: mockPrismaCB },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: DemoDataService, useValue: mockDemoDataService },
        ],
      }).compile();
      const svc = mod.get<ReportService>(ReportService);

      const report = await svc.compute('PROJ', { asOf: FROZEN_NOW_CB });
      expect(report.narrative).toContain('commit-based');
    });
  });
});
