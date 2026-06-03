// server/src/projects/projects.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsService, deriveHealth } from './projects.service';
import { computeForecast } from '../report/forecast';
import { ReportService } from '../report/report.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { WeeklyReportDto } from '../report/report.dto';
import { ConfigService } from '@nestjs/config';
import { DemoDataService } from '../demo/demo-data.service';

// DEMO_MODE=false → Prisma path
const mockConfigService = { get: jest.fn().mockReturnValue(false) };

const mockDemoDataService = {
  getProjects: jest.fn().mockReturnValue([]),
  getProject: jest.fn().mockReturnValue(undefined),
  getArtifacts: jest.fn().mockReturnValue([]),
  getCommits: jest.fn().mockReturnValue([]),
  getPullRequests: jest.fn().mockReturnValue([]),
  getSprints: jest.fn().mockReturnValue([]),
};

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const PROJECT_A = {
  id: 'proj-a',
  key: 'ALPHA',
  name: 'Alpha Project',
  lastSyncedAt: new Date('2026-06-01T10:00:00.000Z'),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PROJECT_B = {
  id: 'proj-b',
  key: 'BETA',
  name: 'Beta Project',
  lastSyncedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeReport(overrides: Partial<WeeklyReportDto> = {}): WeeklyReportDto {
  return {
    projectId: 'proj-a',
    projectKey: 'ALPHA',
    periodEnd: '2026-06-06',
    generatedAt: '2026-06-03T12:00:00.000Z',
    dataCompleteness: 0.8,
    summary: { done: 2, inProgress: 1, todo: 1, blocked: 0, pointsCompleted: 8, pointsCommitted: 16 },
    completed: [],
    inProgress: [],
    staleStories: [],
    idlePrs: [],
    risks: [],
    narrative: 'All good.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unit tests for deriveHealth (pure function — no mocks needed)
// ---------------------------------------------------------------------------
describe('deriveHealth (pure)', () => {
  it('returns healthy label when all signals are zero', () => {
    // With no velocity data, velocityRatio is undefined → velocity defaults to 70.
    // overall = round((70+100+100+100)/4) = 93.
    const result = deriveHealth({ blockedCount: 0, highRiskCount: 0, staleCount: 0, scopeCreepCount: 0, resourceOverloadCount: 0 });
    expect(result.label).toBe('healthy');
    expect(result.overall).toBeGreaterThanOrEqual(75);
  });

  it('returns overall=100 when all signals zero and full velocity', () => {
    const result = deriveHealth({ blockedCount: 0, highRiskCount: 0, staleCount: 0, scopeCreepCount: 0, resourceOverloadCount: 0, velocityRatio: 1.0 });
    expect(result.label).toBe('healthy');
    expect(result.overall).toBe(100);
  });

  it('returns at-risk when there are stale stories but no blocking signals', () => {
    const result = deriveHealth({ blockedCount: 0, highRiskCount: 0, staleCount: 2, scopeCreepCount: 0, resourceOverloadCount: 0 });
    expect(result.label).toBe('at-risk');
    expect(result.overall).toBeLessThan(100);
  });

  it('returns at-risk when there are high risks but score >= 50', () => {
    const result = deriveHealth({ blockedCount: 0, highRiskCount: 1, staleCount: 0, scopeCreepCount: 0, resourceOverloadCount: 0 });
    expect(result.label).toBe('at-risk');
  });

  it('returns blocked when overall drops below 50 with blockers and high risks', () => {
    // velocity: no velocityRatio → 70; scope: 100-3*15=55; timeline: 100-5*12=40; techRisk: 100-2*15-2*10=60
    // overall = round((70+55+40+60)/4) = round(56.25) = 56 → at-risk (>=50 with blocked signals)
    // To get blocked we need overall < 50:
    // velocity: 0 (velocityRatio=0); scope: 0 (7+ creep); timeline: 0 (9+ stale); techRisk: 0 (blocked+highRisk enough)
    const result = deriveHealth({
      blockedCount: 5,          // techRisk = 100 - 5*15 - 5*10 = -25 → 0
      highRiskCount: 5,
      staleCount: 9,            // timeline = 100 - 9*12 = -8 → 0
      scopeCreepCount: 7,       // scope = 100 - 7*15 = -5 → 0
      resourceOverloadCount: 2,
      velocityRatio: 0,         // velocity = 0
    });
    // overall = round((0+0+0+0)/4) = 0 → blocked (overall < 50 AND blocked > 0)
    expect(result.label).toBe('blocked');
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThan(50);
  });

  it('score is never negative', () => {
    const result = deriveHealth({ blockedCount: 10, highRiskCount: 10, staleCount: 10, scopeCreepCount: 10, resourceOverloadCount: 10 });
    expect(result.overall).toBeGreaterThanOrEqual(0);
  });

  it('returns at-risk when scope-creep exists but no blocked/high-risk', () => {
    const result = deriveHealth({ blockedCount: 0, highRiskCount: 0, staleCount: 0, scopeCreepCount: 1, resourceOverloadCount: 0 });
    expect(result.label).toBe('at-risk');
  });

  it('returns subScores with all four dimensions', () => {
    const result = deriveHealth({ blockedCount: 0, highRiskCount: 0, staleCount: 0, scopeCreepCount: 0, resourceOverloadCount: 0, velocityRatio: 1.0 });
    expect(result.subScores).toBeDefined();
    expect(typeof result.subScores.scope).toBe('number');
    expect(typeof result.subScores.timeline).toBe('number');
    expect(typeof result.subScores.velocity).toBe('number');
    expect(typeof result.subScores.techRisk).toBe('number');
  });

  it('overall equals round avg of the four sub-scores', () => {
    const result = deriveHealth({ blockedCount: 1, highRiskCount: 0, staleCount: 2, scopeCreepCount: 1, resourceOverloadCount: 0, velocityRatio: 0.8, idlePrCount: 1 });
    const { scope, timeline, velocity, techRisk } = result.subScores;
    const expectedOverall = Math.round((scope + timeline + velocity + techRisk) / 4);
    expect(result.overall).toBe(expectedOverall);
  });

  it('all sub-scores are clamped to [0, 100]', () => {
    const result = deriveHealth({ blockedCount: 10, highRiskCount: 10, staleCount: 10, scopeCreepCount: 10, resourceOverloadCount: 10, velocityRatio: 0 });
    for (const v of Object.values(result.subScores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

// ---------------------------------------------------------------------------
// Unit tests for computeForecast (pure function — no mocks needed)
// ---------------------------------------------------------------------------
describe('computeForecast (pure)', () => {
  const FROZEN_NOW = new Date('2026-06-04T00:00:00.000Z');

  function sprint(name: string, completedPoints: number, daysAgo: number): Parameters<typeof computeForecast>[0][0] {
    const endDate = new Date(FROZEN_NOW.getTime() - daysAgo * 86_400_000);
    const startDate = new Date(endDate.getTime() - 14 * 86_400_000);
    return { name, completedPoints, startDate, endDate };
  }

  it('returns empty strings when no sprints provided', () => {
    const result = computeForecast([], 50, FROZEN_NOW);
    expect(result.expected).toBe('');
    expect(result.low).toBe('');
    expect(result.high).toBe('');
    expect(result.confidence).toBe(0);
    expect(result.basisSprints).toHaveLength(0);
  });

  it('returns empty strings when all sprints have zero velocity', () => {
    const result = computeForecast([sprint('S1', 0, 14)], 50, FROZEN_NOW);
    expect(result.expected).toBe('');
  });

  it('returns ordered low <= expected <= high dates', () => {
    const sprints = [
      sprint('S1', 30, 42),
      sprint('S2', 20, 28),
      sprint('S3', 25, 14),
    ];
    const result = computeForecast(sprints, 100, FROZEN_NOW);
    expect(result.expected).not.toBe('');
    expect(result.low <= result.expected).toBe(true);
    expect(result.expected <= result.high).toBe(true);
  });

  it('confidence is in [0, 1]', () => {
    const sprints = [sprint('S1', 30, 42), sprint('S2', 25, 28)];
    const result = computeForecast(sprints, 50, FROZEN_NOW);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('confidence is 0.5 with a single sprint sample', () => {
    const result = computeForecast([sprint('S1', 25, 14)], 50, FROZEN_NOW);
    expect(result.confidence).toBe(0.5);
  });

  it('basisSprints lists the sprint names used', () => {
    const sprints = [sprint('Alpha', 20, 42), sprint('Beta', 22, 28)];
    const result = computeForecast(sprints, 60, FROZEN_NOW);
    expect(result.basisSprints).toContain('Alpha');
    expect(result.basisSprints).toContain('Beta');
  });

  it('returns expected=low=high when all sprints have same velocity', () => {
    const sprints = [sprint('S1', 20, 42), sprint('S2', 20, 28), sprint('S3', 20, 14)];
    const result = computeForecast(sprints, 40, FROZEN_NOW);
    expect(result.low).toBe(result.expected);
    expect(result.high).toBe(result.expected);
  });

  it('uses only the last 4 sprints', () => {
    const sprints = [
      sprint('S1', 5, 70),   // oldest — excluded
      sprint('S2', 20, 56),
      sprint('S3', 22, 42),
      sprint('S4', 21, 28),
      sprint('S5', 23, 14),  // newest
    ];
    const result = computeForecast(sprints, 80, FROZEN_NOW);
    expect(result.basisSprints).not.toContain('S1');
    expect(result.basisSprints).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// ProjectsService integration (mocked Prisma + ReportService)
// ---------------------------------------------------------------------------
describe('ProjectsService', () => {
  let service: ProjectsService;
  let mockPrisma: { project: { findMany: jest.Mock; findUnique: jest.Mock } };
  let mockReportService: { compute: jest.Mock };

  async function buildModule(
    projects: object[],
    reportResult: WeeklyReportDto | Error = makeReport(),
  ) {
    mockPrisma = {
      project: {
        findMany: jest.fn().mockResolvedValue(projects),
        findUnique: jest.fn().mockResolvedValue(projects[0] ?? null),
      },
    };

    mockReportService = {
      compute:
        reportResult instanceof Error
          ? jest.fn().mockRejectedValue(reportResult)
          : jest.fn().mockResolvedValue(reportResult),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ReportService, useValue: mockReportService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DemoDataService, useValue: mockDemoDataService },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  }

  // -------------------------------------------------------------------------
  describe('findAll', () => {
    it('returns a list of project summaries', async () => {
      await buildModule([PROJECT_A, PROJECT_B]);
      mockPrisma.project.findMany.mockResolvedValue([PROJECT_A, PROJECT_B]);
      // For PROJECT_B findUnique is not directly called in findAll — compute uses project object
      mockReportService.compute.mockResolvedValue(makeReport());

      const results = await service.findAll();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
    });

    it('returns healthy status for a project with no risks and no stale stories', async () => {
      await buildModule([PROJECT_A], makeReport({ risks: [], staleStories: [], summary: { done: 5, inProgress: 2, todo: 1, blocked: 0, pointsCompleted: 20, pointsCommitted: 30 } }));
      const [summary] = await service.findAll();
      expect(summary.status).toBe('healthy');
      expect(summary.health.label).toBe('healthy');
    });

    it('returns at-risk status when report has high-severity scope_creep risks', async () => {
      const atRiskReport = makeReport({
        risks: [
          { id: 'r1', projectId: 'ALPHA', kind: 'scope_creep', severity: 'high', subjectRef: 'ALPHA-5', title: 'Scope creep', evidence: '...', recommendation: '...' },
        ],
        staleStories: [],
        summary: { done: 2, inProgress: 2, todo: 1, blocked: 0, pointsCompleted: 8, pointsCommitted: 16 },
      });
      await buildModule([PROJECT_A], atRiskReport);
      const [summary] = await service.findAll();
      expect(summary.status).toBe('at-risk');
      expect(summary.openRiskCount).toBeGreaterThan(0);
    });

    it('returns at-risk status when report has stale stories', async () => {
      const staleReport = makeReport({
        risks: [],
        staleStories: [{ key: 'ALPHA-10', title: 'Old task', assignee: 'Bob' }],
        summary: { done: 2, inProgress: 1, todo: 1, blocked: 0, pointsCompleted: 8, pointsCommitted: 16 },
      });
      await buildModule([PROJECT_A], staleReport);
      const [summary] = await service.findAll();
      expect(summary.status).toBe('at-risk');
    });

    it('falls back to healthy/zero-signals when compute throws (no artifacts yet)', async () => {
      await buildModule([PROJECT_A], new Error('Project has no artifacts'));
      const results = await service.findAll();
      expect(results[0].status).toBe('healthy');
      expect(results[0].openRiskCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('findOne', () => {
    it('throws NotFoundException when project does not exist', async () => {
      mockPrisma = { project: { findMany: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) } };
      mockReportService = { compute: jest.fn() };
      const module = await Test.createTestingModule({
        providers: [
          ProjectsService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ReportService, useValue: mockReportService },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: DemoDataService, useValue: mockDemoDataService },
        ],
      }).compile();
      const svc = module.get<ProjectsService>(ProjectsService);

      await expect(svc.findOne('MISSING')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns correct summary DTO shape', async () => {
      await buildModule([PROJECT_A]);
      mockPrisma.project.findUnique.mockResolvedValue(PROJECT_A);
      const summary = await service.findOne('ALPHA');

      expect(summary).toMatchObject({
        id: 'proj-a',
        key: 'ALPHA',
        name: 'Alpha Project',
        lastSyncedAt: '2026-06-01T10:00:00.000Z',
      });
      expect(typeof summary.health.overall).toBe('number');
      expect(['healthy', 'at-risk', 'blocked']).toContain(summary.status);
    });

    it('lastSyncedAt is null for a project that has never synced', async () => {
      const unsyncedProject = { ...PROJECT_A, lastSyncedAt: null };
      mockPrisma = { project: { findMany: jest.fn(), findUnique: jest.fn().mockResolvedValue(unsyncedProject) } };
      mockReportService = { compute: jest.fn().mockResolvedValue(makeReport()) };
      const module = await Test.createTestingModule({
        providers: [
          ProjectsService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ReportService, useValue: mockReportService },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: DemoDataService, useValue: mockDemoDataService },
        ],
      }).compile();
      const svc = module.get<ProjectsService>(ProjectsService);

      const summary = await svc.findOne('ALPHA');
      expect(summary.lastSyncedAt).toBeNull();
    });
  });
});
