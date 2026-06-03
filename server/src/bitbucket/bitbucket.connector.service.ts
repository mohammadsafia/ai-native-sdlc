// server/src/bitbucket/bitbucket.connector.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BitbucketClient } from './bitbucket.client';
import { extractIssueKeys } from '../entity-resolution/issue-keys';

export interface BitbucketSyncResult {
  syncRunId: string;
  commitCount: number;
  prCount: number;
}

@Injectable()
export class BitbucketConnectorService {
  private readonly logger = new Logger(BitbucketConnectorService.name);

  constructor(
    private readonly bitbucketClient: BitbucketClient,
    private readonly prisma: PrismaService,
  ) {}

  async sync(workspace: string, repo: string): Promise<BitbucketSyncResult> {
    // 1. Ensure a project row exists for this workspace/repo
    const repoKey = `${workspace}/${repo}`;
    const project = await this.prisma.project.upsert({
      where: { key: repoKey },
      update: {},
      create: { key: repoKey, name: repoKey },
    });

    // 2. Create SyncRun
    const syncRun = await this.prisma.syncRun.create({
      data: { projectId: project.id, status: 'running' },
    });

    try {
      // 3. Fetch commits and PRs in parallel
      const [commits, prs] = await Promise.all([
        this.bitbucketClient.listCommits(workspace, repo),
        this.bitbucketClient.listPullRequests(workspace, repo),
      ]);

      this.logger.log(
        `Fetched ${commits.length} commits and ${prs.length} PRs for ${repoKey}`,
      );

      // 4. Persist commits (idempotent by hash)
      for (const c of commits) {
        const linkedIssueKeys = extractIssueKeys(c.message);
        const data = {
          repo,
          hash: c.hash,
          message: c.message,
          author: c.author.raw,
          date: new Date(c.date),
          linkedIssueKeys,
          projectId: project.id,
        };
        await this.prisma.commit.upsert({
          where: { hash: c.hash },
          update: { message: data.message, linkedIssueKeys: data.linkedIssueKeys },
          create: data,
        });
      }

      // 5. Persist PRs (idempotent by repo+prId)
      for (const pr of prs) {
        const titleKeys = extractIssueKeys(pr.title);
        const srcBranchKeys = extractIssueKeys(pr.source.branch.name);
        const linkedIssueKeys = [...new Set([...titleKeys, ...srcBranchKeys])];
        const prIdStr = String(pr.id);
        const data = {
          repo,
          prId: prIdStr,
          title: pr.title,
          state: pr.state,
          sourceBranch: pr.source.branch.name,
          destBranch: pr.destination.branch.name,
          createdOn: new Date(pr.created_on),
          updatedOn: new Date(pr.updated_on),
          linkedIssueKeys,
          projectId: project.id,
        };
        await this.prisma.pullRequest.upsert({
          where: { repo_prId: { repo, prId: prIdStr } },
          update: {
            state: data.state,
            updatedOn: data.updatedOn,
            linkedIssueKeys: data.linkedIssueKeys,
          },
          create: data,
        });
      }

      // 6. Mark SyncRun success
      await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'success',
          finishedAt: new Date(),
          issueCount: commits.length + prs.length,
        },
      });

      return { syncRunId: syncRun.id, commitCount: commits.length, prCount: prs.length };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sync failed for ${repoKey}: ${errorMessage}`);
      await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: { status: 'failed', finishedAt: new Date(), errorMessage },
      });
      throw err;
    }
  }
}
