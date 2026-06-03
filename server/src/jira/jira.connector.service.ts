// server/src/jira/jira.connector.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NormalizeService } from '../normalization/normalize.service';
import { JiraClient } from './jira.client';

export interface SyncResult {
  syncRunId: string;
  issueCount: number;
}

@Injectable()
export class JiraConnectorService {
  private readonly logger = new Logger(JiraConnectorService.name);

  constructor(
    private readonly jiraClient: JiraClient,
    private readonly normalizeService: NormalizeService,
    private readonly prisma: PrismaService,
  ) {}

  async sync(projectKey: string): Promise<SyncResult> {
    // 1. Ensure project exists; create SyncRun record
    const project = await this.prisma.project.upsert({
      where: { key: projectKey },
      update: {},
      create: { key: projectKey, name: projectKey },
    });

    const syncRun = await this.prisma.syncRun.create({
      data: {
        projectId: project.id,
        status: 'running',
      },
    });

    try {
      // 2. Fetch all issues via paginated JQL
      const jql = `project = "${projectKey}" ORDER BY updated DESC`;
      this.logger.log(`Starting sync for ${projectKey}, jql: ${jql}`);
      const issues = await this.jiraClient.searchIssues(jql);

      this.logger.log(`Fetched ${issues.length} issues for ${projectKey}`);

      // 3. Persist via normalization
      await this.normalizeService.persist(projectKey, issues);

      // 4. Mark SyncRun as success
      await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'success',
          finishedAt: new Date(),
          issueCount: issues.length,
        },
      });

      return { syncRunId: syncRun.id, issueCount: issues.length };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sync failed for ${projectKey}: ${errorMessage}`);

      await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          errorMessage,
        },
      });

      throw err;
    }
  }
}
