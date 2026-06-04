// server/src/live/live-data.service.ts
/**
 * LiveDataService — fetches REAL Jira data (no Postgres) and caches results
 * in memory for a configurable TTL (default 10 minutes).
 *
 * Public interface mirrors DemoDataService so ProjectsService and ReportService
 * can use it interchangeably via a LIVE_FETCH flag.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JiraClient } from '../jira/jira.client';
import { mapIssueToArtifact } from '../normalization/mappers';
import {
  DemoArtifact,
  DemoCommit,
  DemoPullRequest,
  DemoSprint,
  DemoProject,
} from '../demo/demo-data.service';

// ---------------------------------------------------------------------------
// Cache entry
// ---------------------------------------------------------------------------

interface CacheEntry {
  project: DemoProject;
  artifacts: DemoArtifact[];
  fetchedAt: Date;
}

// ---------------------------------------------------------------------------
// Jira project response shape (just what we need)
// ---------------------------------------------------------------------------

interface JiraProjectResponse {
  id: string;
  key: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class LiveDataService {
  private readonly logger = new Logger(LiveDataService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(
    private readonly jira: JiraClient,
    private readonly config: ConfigService,
  ) {
    // TTL default: 10 minutes
    this.ttlMs = 10 * 60 * 1000;
  }

  // -------------------------------------------------------------------------
  // Public accessors — same interface as DemoDataService
  // -------------------------------------------------------------------------

  async getProjects(): Promise<DemoProject[]> {
    const keys = this.getProjectKeys();
    if (keys.length === 0) return [];
    await Promise.all(keys.map((k) => this.load(k)));
    return keys.map((k) => this.cache.get(k)!.project).filter(Boolean);
  }

  async getProject(key: string): Promise<DemoProject | undefined> {
    await this.load(key);
    return this.cache.get(key)?.project;
  }

  async getArtifacts(key: string): Promise<DemoArtifact[]> {
    await this.load(key);
    return this.cache.get(key)?.artifacts ?? [];
  }

  // Sprints: not fetched from Jira (agile API is out of scope); return empty.
  // The forecast will be sparse — matching real DM/DS data behaviour.
  getSprints(_key: string): DemoSprint[] {
    return [];
  }

  // Bitbucket not wired for LIVE_FETCH; return empty arrays.
  getCommits(_key: string): DemoCommit[] {
    return [];
  }

  getPullRequests(_key: string): DemoPullRequest[] {
    return [];
  }

  // -------------------------------------------------------------------------
  // Internal: load (or serve from cache)
  // -------------------------------------------------------------------------

  /** Exposed for testing: clears the cache. */
  clearCache(): void {
    this.cache.clear();
  }

  private async load(key: string): Promise<void> {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.fetchedAt.getTime() < this.ttlMs) {
      // Cache hit — still fresh
      return;
    }

    this.logger.log(`[live-fetch] Loading project ${key} from Jira...`);

    const lookbackDays =
      this.config.get<number>('JIRA_LOOKBACK_DAYS') ?? 120;

    const jql = `project = ${key} AND updated >= -${lookbackDays}d ORDER BY updated DESC`;

    const issues = await this.jira.searchIssues(jql);
    this.logger.log(`[live-fetch] ${key}: fetched ${issues.length} issue(s)`);

    const now = new Date();
    const artifacts: DemoArtifact[] = issues.map((issue, idx) => {
      const mapped = mapIssueToArtifact(issue, {
        blockedStatuses: ['Blocked', 'Blocked!'],
        // pointsFieldId omitted → falls back to standard custom fields
      });

      return {
        id: `live-${key}-${idx}`,
        projectId: `live-project-${key.toLowerCase()}`,
        key: mapped.key,
        type: mapped.type,
        status: mapped.status,
        statusCategory: mapped.statusCategory,
        assignee: mapped.assignee,
        points: mapped.points,
        sprintId: null,
        jiraUpdatedAt: mapped.jiraUpdatedAt,
        addedToSprintAfterStart: mapped.addedToSprintAfterStart,
        raw: { title: (issue.fields as { summary?: string }).summary ?? mapped.key } as Record<string, unknown>,
        createdAt: now,
        updatedAt: now,
      } satisfies DemoArtifact;
    });

    // Fetch project display name; fall back to the key on error
    const projectName = await this.fetchProjectName(key);

    const project: DemoProject = {
      id: `live-project-${key.toLowerCase()}`,
      key,
      name: projectName,
      lastSyncedAt: now,
    };

    this.cache.set(key, { project, artifacts, fetchedAt: now });
  }

  private async fetchProjectName(key: string): Promise<string> {
    try {
      // JiraClient's internal http adapter is private, but we can access it
      // via the searchIssues method by making a direct project fetch.
      // Since JiraClient only exposes searchIssues publicly and withHttpAdapter
      // for tests, we construct the project URL ourselves using the same base.
      // We fetch via a raw GET using the adapter obtained through the JiraClient's
      // testHttp if present, else we build the URL via the config.
      const baseUrl = this.config.get<string>('JIRA_BASE_URL') ?? '';
      const email = this.config.get<string>('JIRA_EMAIL') ?? '';
      const token = this.config.get<string>('JIRA_API_TOKEN') ?? '';

      if (!baseUrl) return key;

      // Use Node's built-in fetch (Node 18+) for a clean HTTP call
      const url = `${baseUrl}/rest/api/3/project/${key}`;
      const credentials = Buffer.from(`${email}:${token}`).toString('base64');

      const resp = await fetch(url, {
        headers: {
          Authorization: `Basic ${credentials}`,
          Accept: 'application/json',
        },
      });

      if (!resp.ok) {
        this.logger.warn(`[live-fetch] Failed to get project name for ${key}: HTTP ${resp.status}`);
        return key;
      }

      const data = (await resp.json()) as JiraProjectResponse;
      return data.name ?? key;
    } catch (err) {
      this.logger.warn(`[live-fetch] Could not fetch project name for ${key}: ${String(err)}`);
      return key;
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private getProjectKeys(): string[] {
    const raw = this.config.get<string>('JIRA_PROJECT_KEYS') ?? '';
    return raw
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
  }
}
