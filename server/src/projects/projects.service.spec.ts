// server/src/projects/projects.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsService, deriveHealth } from './projects.service';
import { ReportService } from '../report/report.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { WeeklyReportDto } from '../report/report.dto';

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
    const result = deriveHealth({ blockedCount: 0, highRiskCount: 0, staleCount: 0, scopeCreepCount: 0, resourceOverloadCount: 0 });
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

  it('returns blocked when score drops below 50 with multiple signals', () => {
    const result = deriveHealth({
      blockedCount: 2,     // -30
      highRiskCount: 2,    // -24
      staleCount: 3,       // -20
      scopeCreepCount: 3,  // -15
      resourceOverloadCount: 2, // -10
    });
    // score = 100 - 30 - 24 - 20 - 15 - 10 = 1 → blocked
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
        ],
      }).compile();
      const svc = module.get<ProjectsService>(ProjectsService);

      const summary = await svc.findOne('ALPHA');
      expect(summary.lastSyncedAt).toBeNull();
    });
  });
});
