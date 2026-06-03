// server/src/demo/demo-data.service.ts
/**
 * DemoDataService — builds an in-memory dataset of THREE projects at startup
 * so the Projects list looks populated when DEMO_MODE=true.
 *
 * FALCON (at-risk)  – real pipeline on fixtures: jira-search.json +
 *                     bitbucket-commits.json / bitbucket-prs.json
 * ORION  (healthy)  – 5 synthesized artifacts (mostly done, recent commits)
 * ATLAS  (blocked)  – a blocked artifact + a stale in-progress one
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { mapIssueToArtifact } from '../normalization/mappers';
import { JiraIssue } from '../jira/jira.types';

// ---------------------------------------------------------------------------
// Shared types (Prisma-like shapes so ReportService can consume them)
// ---------------------------------------------------------------------------

export interface DemoArtifact {
  id: string;
  projectId: string;
  key: string;
  type: string;
  status: string;
  statusCategory: string;
  assignee: string | null;
  points: number | null;
  sprintId: string | null;
  jiraUpdatedAt: Date;
  addedToSprintAfterStart: boolean;
  raw: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DemoCommit {
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

export interface DemoPullRequest {
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

export interface DemoSprint {
  id: string;
  projectId: string;
  name: string;
  state: string;
  startDate: Date;
  endDate: Date;
}

export interface DemoProject {
  id: string;
  key: string;
  name: string;
  lastSyncedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Helper to load fixture JSON
// ---------------------------------------------------------------------------

function loadFixture<T>(filename: string): T {
  const fixturePath = path.resolve(
    __dirname,
    '../../test/fixtures',
    filename,
  );
  const raw = fs.readFileSync(fixturePath, 'utf8');
  return JSON.parse(raw) as T;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DemoDataService implements OnModuleInit {
  private projects: Map<string, DemoProject> = new Map();
  private artifacts: Map<string, DemoArtifact[]> = new Map();
  private commits: Map<string, DemoCommit[]> = new Map();
  private pullRequests: Map<string, DemoPullRequest[]> = new Map();
  private sprints: Map<string, DemoSprint[]> = new Map();

  onModuleInit() {
    this.buildFalcon();
    this.buildOrion();
    this.buildAtlas();
  }

  // -------------------------------------------------------------------------
  // Public accessors
  // -------------------------------------------------------------------------

  getProjects(): DemoProject[] {
    return Array.from(this.projects.values());
  }

  getProject(key: string): DemoProject | undefined {
    return this.projects.get(key);
  }

  getArtifacts(key: string): DemoArtifact[] {
    return this.artifacts.get(key) ?? [];
  }

  getCommits(key: string): DemoCommit[] {
    return this.commits.get(key) ?? [];
  }

  getPullRequests(key: string): DemoPullRequest[] {
    return this.pullRequests.get(key) ?? [];
  }

  getSprints(key: string): DemoSprint[] {
    return this.sprints.get(key) ?? [];
  }

  // -------------------------------------------------------------------------
  // FALCON – at-risk: real pipeline on fixtures
  // -------------------------------------------------------------------------

  private buildFalcon() {
    const KEY = 'FALCON';
    const projectId = 'demo-project-falcon';

    this.projects.set(KEY, {
      id: projectId,
      key: KEY,
      name: 'Project Falcon',
      lastSyncedAt: new Date('2026-06-04T00:00:00.000Z'),
    });

    // Sprint: started 2026-05-21 (matches fixture sprintStartDate)
    const sprintStartDate = new Date('2026-05-21T00:00:00.000Z');
    const sprint: DemoSprint = {
      id: 'demo-sprint-falcon',
      projectId,
      name: 'Sprint 1',
      state: 'active',
      startDate: sprintStartDate,
      endDate: new Date('2026-06-04T00:00:00.000Z'),
    };
    this.sprints.set(KEY, [sprint]);

    // Load all Jira issues from fixture (page1 + page2)
    const jiraFixture = loadFixture<{
      page1: { issues: JiraIssue[] };
      page2: { issues: JiraIssue[] };
    }>('jira-search.json');

    const allIssues = [
      ...jiraFixture.page1.issues,
      ...jiraFixture.page2.issues,
    ];

    const arts: DemoArtifact[] = allIssues.map((issue, idx) => {
      const mapped = mapIssueToArtifact(issue, {
        sprintStartDate,
        blockedStatuses: ['Blocked'],
      });
      return {
        id: `demo-art-falcon-${idx}`,
        projectId,
        key: mapped.key,
        type: mapped.type,
        status: mapped.status,
        statusCategory: mapped.statusCategory,
        assignee: mapped.assignee,
        points: mapped.points,
        sprintId: sprint.id,
        jiraUpdatedAt: mapped.jiraUpdatedAt,
        addedToSprintAfterStart: mapped.addedToSprintAfterStart,
        raw: { title: issue.fields.summary } as Record<string, unknown>,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });
    this.artifacts.set(KEY, arts);

    // Load commits from fixture
    const commitsFixture = loadFixture<{
      page1: { values: Array<{ hash: string; message: string; date: string; author: { raw: string } }> };
      page2: { values: Array<{ hash: string; message: string; date: string; author: { raw: string } }> };
    }>('bitbucket-commits.json');

    const allCommitValues = [
      ...(commitsFixture.page1?.values ?? []),
      ...(commitsFixture.page2?.values ?? []),
    ];

    const extractIssueKeys = (msg: string): string[] => {
      const matches = msg.match(/[A-Z][A-Z0-9]+-\d+/g) ?? [];
      return matches;
    };

    const demoCommits: DemoCommit[] = allCommitValues.map((c, idx) => ({
      id: `demo-commit-falcon-${idx}`,
      projectId,
      repo: 'falcon-repo',
      hash: c.hash,
      message: c.message,
      author: c.author.raw,
      date: new Date(c.date),
      linkedIssueKeys: extractIssueKeys(c.message),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    this.commits.set(KEY, demoCommits);

    // Load PRs from fixture
    const prsFixture = loadFixture<{
      page1: { values: Array<{
        id: number;
        title: string;
        state: string;
        source: { branch: { name: string } };
        destination: { branch: { name: string } };
        created_on: string;
        updated_on: string;
      }> };
    }>('bitbucket-prs.json');

    const demoPrs: DemoPullRequest[] = (prsFixture.page1?.values ?? []).map((pr) => ({
      id: `demo-pr-falcon-${pr.id}`,
      projectId,
      repo: 'falcon-repo',
      prId: String(pr.id),
      title: pr.title,
      state: pr.state,
      sourceBranch: pr.source.branch.name,
      destBranch: pr.destination.branch.name,
      createdOn: new Date(pr.created_on),
      updatedOn: new Date(pr.updated_on),
      linkedIssueKeys: extractIssueKeys(pr.title + ' ' + pr.source.branch.name),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    this.pullRequests.set(KEY, demoPrs);
  }

  // -------------------------------------------------------------------------
  // ORION – healthy: ~5 synthesized artifacts, mostly done, recent commits
  // -------------------------------------------------------------------------

  private buildOrion() {
    const KEY = 'ORION';
    const projectId = 'demo-project-orion';
    const NOW = new Date('2026-06-04T00:00:00.000Z');

    this.projects.set(KEY, {
      id: projectId,
      key: KEY,
      name: 'Project Orion',
      lastSyncedAt: NOW,
    });

    const sprint: DemoSprint = {
      id: 'demo-sprint-orion',
      projectId,
      name: 'Sprint 3',
      state: 'active',
      startDate: new Date('2026-05-28T00:00:00.000Z'),
      endDate: new Date('2026-06-11T00:00:00.000Z'),
    };
    this.sprints.set(KEY, [sprint]);

    const arts: DemoArtifact[] = [
      this.makeArt('ORION-1', projectId, sprint.id, 'story', 'Done', 'done', 'Alice Chen', 8, NOW, false, 'Implement user auth module'),
      this.makeArt('ORION-2', projectId, sprint.id, 'story', 'Done', 'done', 'Bob Nguyen', 5, NOW, false, 'Set up CI/CD pipeline'),
      this.makeArt('ORION-3', projectId, sprint.id, 'task', 'Done', 'done', 'Carol Li', 3, NOW, false, 'Write API documentation'),
      this.makeArt('ORION-4', projectId, sprint.id, 'story', 'In Progress', 'in_progress', 'Alice Chen', 5, new Date(NOW.getTime() - 1 * 86_400_000), false, 'Build notification service'),
      this.makeArt('ORION-5', projectId, sprint.id, 'task', 'To Do', 'todo', 'Bob Nguyen', 2, new Date(NOW.getTime() - 1 * 86_400_000), false, 'Add rate limiting middleware'),
    ];
    this.artifacts.set(KEY, arts);

    // All recent commits — no staleness
    const demoCommits: DemoCommit[] = [
      {
        id: 'demo-commit-orion-1',
        projectId,
        repo: 'orion-repo',
        hash: 'orion111aaa222bbb333ccc',
        message: 'feat: ORION-4 notification service initial implementation',
        author: 'Alice Chen <alice.chen@example.com>',
        date: new Date(NOW.getTime() - 1 * 86_400_000),
        linkedIssueKeys: ['ORION-4'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'demo-commit-orion-2',
        projectId,
        repo: 'orion-repo',
        hash: 'orion222bbb333ccc444ddd',
        message: 'docs: ORION-3 complete API docs',
        author: 'Carol Li <carol.li@example.com>',
        date: new Date(NOW.getTime() - 2 * 86_400_000),
        linkedIssueKeys: ['ORION-3'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    this.commits.set(KEY, demoCommits);

    // No idle PRs
    const demoPrs: DemoPullRequest[] = [
      {
        id: 'demo-pr-orion-1',
        projectId,
        repo: 'orion-repo',
        prId: '201',
        title: 'feat: ORION-4 notification service',
        state: 'OPEN',
        sourceBranch: 'feature/ORION-4-notifications',
        destBranch: 'main',
        createdOn: new Date(NOW.getTime() - 1 * 86_400_000),
        updatedOn: new Date(NOW.getTime() - 1 * 86_400_000),
        linkedIssueKeys: ['ORION-4'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    this.pullRequests.set(KEY, demoPrs);
  }

  // -------------------------------------------------------------------------
  // ATLAS – blocked: a blocked artifact + a stale in-progress one
  // -------------------------------------------------------------------------

  private buildAtlas() {
    const KEY = 'ATLAS';
    const projectId = 'demo-project-atlas';
    const NOW = new Date('2026-06-04T00:00:00.000Z');

    this.projects.set(KEY, {
      id: projectId,
      key: KEY,
      name: 'Project Atlas',
      lastSyncedAt: NOW,
    });

    const sprint: DemoSprint = {
      id: 'demo-sprint-atlas',
      projectId,
      name: 'Sprint 2',
      state: 'active',
      startDate: new Date('2026-05-21T00:00:00.000Z'),
      endDate: new Date('2026-06-04T00:00:00.000Z'),
    };
    this.sprints.set(KEY, [sprint]);

    const arts: DemoArtifact[] = [
      // Blocked artifact
      this.makeArt('ATLAS-1', projectId, sprint.id, 'story', 'Blocked', 'in_progress', 'David Park', 8, new Date(NOW.getTime() - 4 * 86_400_000), false, 'Integrate third-party payment gateway'),
      // Stale in-progress (updated 10 days ago — well over staleDays=3)
      this.makeArt('ATLAS-2', projectId, sprint.id, 'story', 'In Progress', 'in_progress', 'Eve Martinez', 5, new Date(NOW.getTime() - 10 * 86_400_000), false, 'Refactor legacy database schema'),
      // Done
      this.makeArt('ATLAS-3', projectId, sprint.id, 'task', 'Done', 'done', 'David Park', 3, NOW, false, 'Set up staging environment'),
      // Todo
      this.makeArt('ATLAS-4', projectId, sprint.id, 'task', 'To Do', 'todo', 'Eve Martinez', 2, NOW, false, 'Write migration runbook'),
    ];
    this.artifacts.set(KEY, arts);

    // ATLAS-2 has no commits linked → stale; ATLAS-1 is blocked
    const demoCommits: DemoCommit[] = [
      {
        id: 'demo-commit-atlas-1',
        projectId,
        repo: 'atlas-repo',
        hash: 'atlas111aaa222bbb333',
        message: 'chore: ATLAS-3 configure staging infrastructure',
        author: 'David Park <david.park@example.com>',
        date: new Date(NOW.getTime() - 2 * 86_400_000),
        linkedIssueKeys: ['ATLAS-3'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    this.commits.set(KEY, demoCommits);

    // One idle PR (not updated in 5 days)
    const demoPrs: DemoPullRequest[] = [
      {
        id: 'demo-pr-atlas-1',
        projectId,
        repo: 'atlas-repo',
        prId: '301',
        title: 'feat: ATLAS-2 legacy db refactor',
        state: 'OPEN',
        sourceBranch: 'feature/ATLAS-2-db-refactor',
        destBranch: 'main',
        createdOn: new Date(NOW.getTime() - 8 * 86_400_000),
        updatedOn: new Date(NOW.getTime() - 5 * 86_400_000),
        linkedIssueKeys: ['ATLAS-2'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    this.pullRequests.set(KEY, demoPrs);
  }

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------

  private makeArt(
    key: string,
    projectId: string,
    sprintId: string,
    type: string,
    status: string,
    statusCategory: string,
    assignee: string | null,
    points: number | null,
    jiraUpdatedAt: Date,
    addedToSprintAfterStart: boolean,
    title: string,
  ): DemoArtifact {
    return {
      id: `demo-art-${key.toLowerCase()}`,
      projectId,
      key,
      type,
      status,
      statusCategory,
      assignee,
      points,
      sprintId,
      jiraUpdatedAt,
      addedToSprintAfterStart,
      raw: { title } as Record<string, unknown>,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
