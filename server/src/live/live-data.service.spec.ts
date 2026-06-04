// server/src/live/live-data.service.spec.ts
/**
 * Unit tests for LiveDataService.
 *
 * All network calls are replaced by a mocked JiraClient — no real HTTP occurs.
 * The project-name GET (fetch) is globally mocked via jest.spyOn(global, 'fetch').
 *
 * Coverage:
 *  1. getProjects: returns the configured project keys with mapped artifacts.
 *  2. getProject: returns a DemoProject with correct id, key, name.
 *  3. getArtifacts: returns DemoArtifact[] with expected fields mapped from Jira issues.
 *  4. Caching: a second call within TTL does NOT re-invoke jira.searchIssues.
 *  5. getCommits / getPullRequests / getSprints: always return [].
 *  6. Health smoke: artifacts from a mocked Jira can drive deriveHealth to a result.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LiveDataService } from './live-data.service';
import { JiraClient, HttpAdapter } from '../jira/jira.client';
import { JiraIssue } from '../jira/jira.types';
import { deriveHealth } from '../projects/projects.service';
import { computeFromData, RawArtifact } from '../report/report.service';

// ---------------------------------------------------------------------------
// Fixture Jira issues
// ---------------------------------------------------------------------------

function makeJiraIssue(
  key: string,
  statusCategoryKey: 'done' | 'indeterminate' | 'new',
  statusName: string,
  summary: string,
  points: number | null = null,
  assignee: string | null = 'Alice',
): JiraIssue {
  return {
    id: key,
    key,
    fields: {
      summary,
      issuetype: { name: 'Story' },
      status: {
        name: statusName,
        statusCategory: { key: statusCategoryKey, name: statusName },
      },
      assignee: assignee ? { displayName: assignee, emailAddress: `${assignee.toLowerCase()}@example.com` } : null,
      updated: '2026-05-25T10:00:00.000Z',
      ...(points !== null ? { customfield_10016: points } : {}),
    } as JiraIssue['fields'],
    changelog: { histories: [] },
  };
}

const FIXTURE_ISSUES: JiraIssue[] = [
  makeJiraIssue('DM-1', 'done', 'Done', 'Implement login', 5, 'Alice'),
  makeJiraIssue('DM-2', 'indeterminate', 'In Progress', 'Build dashboard', 3, 'Bob'),
  makeJiraIssue('DM-3', 'indeterminate', 'Blocked', 'Fix auth', 2, 'Alice'),
  makeJiraIssue('DM-4', 'new', 'To Do', 'Write tests', null, null),
];

// ---------------------------------------------------------------------------
// Fake HttpAdapter: records calls and returns FIXTURE_ISSUES as a single page
// ---------------------------------------------------------------------------

class FakeHttpAdapter implements HttpAdapter {
  callCount = 0;

  async get<T>(_url: string, _params?: Record<string, unknown>): Promise<T> {
    this.callCount++;
    // Return a single-page result (isLast = true) with our fixture issues
    return {
      issues: FIXTURE_ISSUES,
      isLast: true,
      nextPageToken: undefined,
    } as unknown as T;
  }
}

// ---------------------------------------------------------------------------
// Build module helper
// ---------------------------------------------------------------------------

async function buildService(
  fakeHttp: FakeHttpAdapter,
  projectKeys = 'DM',
): Promise<LiveDataService> {
  const mockConfig = {
    get: jest.fn((key: string) => {
      switch (key) {
        case 'JIRA_PROJECT_KEYS': return projectKeys;
        case 'JIRA_LOOKBACK_DAYS': return 120;
        case 'JIRA_BASE_URL': return '';  // empty → fetchProjectName returns key directly
        case 'JIRA_EMAIL': return '';
        case 'JIRA_API_TOKEN': return '';
        default: return undefined;
      }
    }),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      LiveDataService,
      { provide: ConfigService, useValue: mockConfig },
      {
        provide: JiraClient,
        useFactory: () => {
          const configService = { get: jest.fn() } as unknown as ConfigService;
          return new JiraClient(configService).withHttpAdapter(fakeHttp);
        },
      },
    ],
  }).compile();

  return module.get<LiveDataService>(LiveDataService);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LiveDataService', () => {
  let fakeHttp: FakeHttpAdapter;
  let service: LiveDataService;

  beforeEach(async () => {
    fakeHttp = new FakeHttpAdapter();
    service = await buildService(fakeHttp, 'DM');
  });

  // -------------------------------------------------------------------------
  describe('getProjects', () => {
    it('returns one project for a single key', async () => {
      const projects = await service.getProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0].key).toBe('DM');
    });

    it('project has id, key, name, and lastSyncedAt', async () => {
      const [p] = await service.getProjects();
      expect(p.id).toBe('live-project-dm');
      expect(p.key).toBe('DM');
      expect(typeof p.name).toBe('string');
      expect(p.lastSyncedAt).toBeInstanceOf(Date);
    });

    it('falls back to key as project name when JIRA_BASE_URL is empty', async () => {
      const [p] = await service.getProjects();
      // baseUrl is '' → fetchProjectName returns the key
      expect(p.name).toBe('DM');
    });

    it('returns two projects when two keys are configured', async () => {
      const multiService = await buildService(new FakeHttpAdapter(), 'DM,DS');
      const projects = await multiService.getProjects();
      expect(projects).toHaveLength(2);
      const keys = projects.map((p) => p.key);
      expect(keys).toContain('DM');
      expect(keys).toContain('DS');
    });

    it('returns empty array when JIRA_PROJECT_KEYS is empty', async () => {
      const emptyService = await buildService(new FakeHttpAdapter(), '');
      const projects = await emptyService.getProjects();
      expect(projects).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('getArtifacts', () => {
    it('returns an artifact for each Jira issue fetched', async () => {
      const artifacts = await service.getArtifacts('DM');
      expect(artifacts).toHaveLength(FIXTURE_ISSUES.length);
    });

    it('artifact keys match the Jira issue keys', async () => {
      const artifacts = await service.getArtifacts('DM');
      const keys = artifacts.map((a) => a.key);
      expect(keys).toContain('DM-1');
      expect(keys).toContain('DM-2');
      expect(keys).toContain('DM-3');
      expect(keys).toContain('DM-4');
    });

    it('done artifact has statusCategory = "done"', async () => {
      const artifacts = await service.getArtifacts('DM');
      const done = artifacts.find((a) => a.key === 'DM-1');
      expect(done?.statusCategory).toBe('done');
    });

    it('in-progress artifact has statusCategory = "in_progress"', async () => {
      const artifacts = await service.getArtifacts('DM');
      const inProg = artifacts.find((a) => a.key === 'DM-2');
      expect(inProg?.statusCategory).toBe('in_progress');
    });

    it('blocked artifact has statusCategory = "in_progress" (overridden from done/todo)', async () => {
      const artifacts = await service.getArtifacts('DM');
      const blocked = artifacts.find((a) => a.key === 'DM-3');
      // mapIssueToArtifact forces in_progress for blocked statuses
      expect(blocked?.statusCategory).toBe('in_progress');
      expect(blocked?.status).toBe('Blocked');
    });

    it('artifacts have correct points when customfield_10016 is set', async () => {
      const artifacts = await service.getArtifacts('DM');
      const a1 = artifacts.find((a) => a.key === 'DM-1');
      expect(a1?.points).toBe(5);
    });

    it('artifact with null points has points = null', async () => {
      const artifacts = await service.getArtifacts('DM');
      const a4 = artifacts.find((a) => a.key === 'DM-4');
      expect(a4?.points).toBeNull();
    });

    it('artifacts have raw.title set from issue summary', async () => {
      const artifacts = await service.getArtifacts('DM');
      const a1 = artifacts.find((a) => a.key === 'DM-1');
      expect((a1?.raw as { title?: string })?.title).toBe('Implement login');
    });

    it('sprintId is null (no sprint assignment for live fetch)', async () => {
      const artifacts = await service.getArtifacts('DM');
      expect(artifacts.every((a) => a.sprintId === null)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('caching', () => {
    it('does NOT re-fetch from Jira on the second call within TTL', async () => {
      // First call
      await service.getArtifacts('DM');
      const callsAfterFirst = fakeHttp.callCount;

      // Second call (same key, TTL not expired)
      await service.getArtifacts('DM');
      const callsAfterSecond = fakeHttp.callCount;

      expect(callsAfterSecond).toBe(callsAfterFirst); // no additional HTTP calls
    });

    it('re-fetches after cache is cleared', async () => {
      await service.getArtifacts('DM');
      const callsBeforeClear = fakeHttp.callCount;

      service.clearCache();
      await service.getArtifacts('DM');
      const callsAfterClear = fakeHttp.callCount;

      expect(callsAfterClear).toBeGreaterThan(callsBeforeClear);
    });

    it('getProject returns cached data on second call', async () => {
      await service.getProject('DM');
      const callsAfterFirst = fakeHttp.callCount;

      await service.getProject('DM');
      expect(fakeHttp.callCount).toBe(callsAfterFirst);
    });
  });

  // -------------------------------------------------------------------------
  describe('static accessors (no Jira)', () => {
    it('getSprints returns empty array', () => {
      expect(service.getSprints('DM')).toEqual([]);
    });

    it('getCommits returns empty array', () => {
      expect(service.getCommits('DM')).toEqual([]);
    });

    it('getPullRequests returns empty array', () => {
      expect(service.getPullRequests('DM')).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  describe('end-to-end health derivation (mocked Jira → deriveHealth)', () => {
    it('derives a valid health label from live artifacts', async () => {
      const artifacts = await service.getArtifacts('DM');
      const asOf = new Date('2026-06-04T00:00:00.000Z');

      // computeFromData is a pure function — use it directly with the live artifacts
      const project = await service.getProject('DM');
      const rawArtifacts = artifacts as unknown as RawArtifact[];

      const report = await computeFromData(
        project!.id,
        'DM',
        rawArtifacts,
        [], // no commits
        [], // no PRs
        { asOf, staleDays: 3, blockedStatuses: ['Blocked', 'Blocked!'] },
      );

      const velocityRatio =
        report.summary.pointsCommitted > 0
          ? report.summary.pointsCompleted / report.summary.pointsCommitted
          : undefined;

      const health = deriveHealth({
        blockedCount: report.summary.blocked,
        highRiskCount: report.risks.filter((r) => r.severity === 'high').length,
        staleCount: report.staleStories.length,
        scopeCreepCount: report.risks.filter((r) => r.kind === 'scope_creep').length,
        resourceOverloadCount: report.risks.filter((r) => r.kind === 'resource_overload').length,
        idlePrCount: report.idlePrs.length,
        velocityRatio,
      });

      expect(['healthy', 'at-risk', 'blocked']).toContain(health.label);
      expect(health.overall).toBeGreaterThanOrEqual(0);
      expect(health.overall).toBeLessThanOrEqual(100);
    });

    it('blocked artifact (DM-3) is counted as blocked in the report summary', async () => {
      const artifacts = await service.getArtifacts('DM');
      const asOf = new Date('2026-06-04T00:00:00.000Z');
      const project = await service.getProject('DM');
      const rawArtifacts = artifacts as unknown as RawArtifact[];

      const report = await computeFromData(
        project!.id,
        'DM',
        rawArtifacts,
        [],
        [],
        { asOf, blockedStatuses: ['Blocked', 'Blocked!'] },
      );

      expect(report.summary.blocked).toBe(1);
    });

    it('done artifact (DM-1) is counted as done in the report summary', async () => {
      const artifacts = await service.getArtifacts('DM');
      const asOf = new Date('2026-06-04T00:00:00.000Z');
      const project = await service.getProject('DM');
      const rawArtifacts = artifacts as unknown as RawArtifact[];

      const report = await computeFromData(
        project!.id,
        'DM',
        rawArtifacts,
        [],
        [],
        { asOf },
      );

      expect(report.summary.done).toBe(1);
    });
  });
});
