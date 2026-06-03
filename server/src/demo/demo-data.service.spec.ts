// server/src/demo/demo-data.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { DemoDataService } from './demo-data.service';
import { computeFromData } from '../report/report.service';

// Fixed "now" so tests remain deterministic: 2026-06-04
const FROZEN_NOW = new Date('2026-06-04T12:00:00.000Z');

describe('DemoDataService', () => {
  let service: DemoDataService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DemoDataService],
    }).compile();

    service = module.get<DemoDataService>(DemoDataService);
    // Manually trigger onModuleInit (test harness doesn't call it automatically)
    service.onModuleInit();
  });

  // -------------------------------------------------------------------------
  describe('projects', () => {
    it('returns exactly 3 projects', () => {
      const projects = service.getProjects();
      expect(projects).toHaveLength(3);
    });

    it('contains FALCON, ORION, ATLAS keys', () => {
      const keys = service.getProjects().map((p) => p.key);
      expect(keys).toContain('FALCON');
      expect(keys).toContain('ORION');
      expect(keys).toContain('ATLAS');
    });

    it('getProject returns undefined for unknown key', () => {
      expect(service.getProject('UNKNOWN')).toBeUndefined();
    });

    it('getProject returns a project for FALCON', () => {
      const p = service.getProject('FALCON');
      expect(p).toBeDefined();
      expect(p!.key).toBe('FALCON');
    });
  });

  // -------------------------------------------------------------------------
  describe('FALCON – at-risk (real pipeline on fixtures)', () => {
    it('has artifacts mapped from jira-search.json (7 issues)', () => {
      const arts = service.getArtifacts('FALCON');
      // jira-search.json page1(4) + page2(3) = 7
      expect(arts.length).toBe(7);
    });

    it('has commits loaded from bitbucket-commits.json', () => {
      const commits = service.getCommits('FALCON');
      expect(commits.length).toBeGreaterThan(0);
    });

    it('has PRs loaded from bitbucket-prs.json', () => {
      const prs = service.getPullRequests('FALCON');
      expect(prs.length).toBeGreaterThan(0);
    });

    it('report has a stale story', () => {
      const arts = service.getArtifacts('FALCON');
      const commits = service.getCommits('FALCON');
      const openPrs = service.getPullRequests('FALCON').filter((p) => p.state === 'OPEN');
      const report = computeFromData('demo-project-falcon', 'FALCON', arts, commits, openPrs, {
        asOf: FROZEN_NOW,
        staleDays: 3,
      });
      // PROJ-6 is stale (jiraUpdatedAt 2026-05-20, no linked commits)
      expect(report.staleStories.length).toBeGreaterThan(0);
    });

    it('report has a scope-creep risk (PROJ-5 added after sprint start)', () => {
      const arts = service.getArtifacts('FALCON');
      const commits = service.getCommits('FALCON');
      const openPrs = service.getPullRequests('FALCON').filter((p) => p.state === 'OPEN');
      const report = computeFromData('demo-project-falcon', 'FALCON', arts, commits, openPrs, {
        asOf: FROZEN_NOW,
        staleDays: 3,
      });
      const scopeCreepRisks = report.risks.filter((r) => r.kind === 'scope_creep');
      expect(scopeCreepRisks.length).toBeGreaterThan(0);
    });

    it('report has an idle PR (PR 101 last updated 2026-05-30, > 2 days before 2026-06-04)', () => {
      const arts = service.getArtifacts('FALCON');
      const commits = service.getCommits('FALCON');
      const openPrs = service.getPullRequests('FALCON').filter((p) => p.state === 'OPEN');
      const report = computeFromData('demo-project-falcon', 'FALCON', arts, commits, openPrs, {
        asOf: FROZEN_NOW,
        prIdleDays: 2,
        staleDays: 3,
      });
      expect(report.idlePrs.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('ORION – healthy', () => {
    it('has 5 artifacts', () => {
      const arts = service.getArtifacts('ORION');
      expect(arts).toHaveLength(5);
    });

    it('report is healthy (no blocked, no high risks, no stale stories)', () => {
      const arts = service.getArtifacts('ORION');
      const commits = service.getCommits('ORION');
      const openPrs = service.getPullRequests('ORION').filter((p) => p.state === 'OPEN');
      const report = computeFromData('demo-project-orion', 'ORION', arts, commits, openPrs, {
        asOf: FROZEN_NOW,
        staleDays: 3,
        prIdleDays: 2,
      });
      expect(report.summary.blocked).toBe(0);
      expect(report.staleStories).toHaveLength(0);
      expect(report.risks.filter((r) => r.severity === 'high')).toHaveLength(0);
    });

    it('has mostly done artifacts', () => {
      const arts = service.getArtifacts('ORION');
      const doneCount = arts.filter((a) => a.statusCategory === 'done').length;
      expect(doneCount).toBeGreaterThanOrEqual(3);
    });
  });

  // -------------------------------------------------------------------------
  describe('ATLAS – blocked', () => {
    it('has a blocked artifact', () => {
      const arts = service.getArtifacts('ATLAS');
      const blocked = arts.filter(
        (a) => a.statusCategory === 'in_progress' && a.status.toLowerCase() === 'blocked',
      );
      expect(blocked.length).toBeGreaterThan(0);
    });

    it('report has at least one blocked artifact in summary', () => {
      const arts = service.getArtifacts('ATLAS');
      const commits = service.getCommits('ATLAS');
      const openPrs = service.getPullRequests('ATLAS').filter((p) => p.state === 'OPEN');
      const report = computeFromData('demo-project-atlas', 'ATLAS', arts, commits, openPrs, {
        asOf: FROZEN_NOW,
        staleDays: 3,
      });
      expect(report.summary.blocked).toBeGreaterThan(0);
    });

    it('report has a stale in-progress artifact (ATLAS-2, updated 10 days ago)', () => {
      const arts = service.getArtifacts('ATLAS');
      const commits = service.getCommits('ATLAS');
      const openPrs = service.getPullRequests('ATLAS').filter((p) => p.state === 'OPEN');
      const report = computeFromData('demo-project-atlas', 'ATLAS', arts, commits, openPrs, {
        asOf: FROZEN_NOW,
        staleDays: 3,
      });
      const staleKeys = report.staleStories.map((s) => s.key);
      expect(staleKeys).toContain('ATLAS-2');
    });
  });

  // -------------------------------------------------------------------------
  describe('data accessors', () => {
    it('getCommits returns empty array for unknown project', () => {
      expect(service.getCommits('UNKNOWN')).toEqual([]);
    });

    it('getPullRequests returns empty array for unknown project', () => {
      expect(service.getPullRequests('UNKNOWN')).toEqual([]);
    });

    it('getSprints returns a sprint for each known project', () => {
      for (const key of ['FALCON', 'ORION', 'ATLAS']) {
        const sprints = service.getSprints(key);
        expect(sprints.length).toBeGreaterThan(0);
      }
    });
  });
});
