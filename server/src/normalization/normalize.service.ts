// server/src/normalization/normalize.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JiraIssue } from '../jira/jira.types';
import { mapIssueToArtifact } from './mappers';

@Injectable()
export class NormalizeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert Project, Sprints, and Artifacts from a set of raw Jira issues.
   * Idempotent: re-running with the same issues updates rather than duplicating.
   * Runs inside a single Prisma $transaction.
   */
  async persist(
    projectKey: string,
    rawIssues: JiraIssue[],
    opts: {
      pointsFieldId?: string;
      blockedStatuses?: string[];
      sprintStartDate?: Date;
    } = {},
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. Upsert Project
      const project = await tx.project.upsert({
        where: { key: projectKey },
        update: { lastSyncedAt: new Date() },
        create: {
          key: projectKey,
          name: projectKey,
          lastSyncedAt: new Date(),
        },
      });

      // 2. Collect unique sprint names from changelog histories
      const sprintNames = new Set<string>();
      for (const issue of rawIssues) {
        for (const history of issue.changelog?.histories ?? []) {
          for (const item of history.items) {
            if (item.field === 'Sprint' && item.toString) {
              sprintNames.add(item.toString);
            }
          }
        }
      }

      // findFirst-or-create for each unique sprint name
      const sprintMap = new Map<string, string>(); // name → Prisma Sprint.id
      for (const name of sprintNames) {
        let sprint = await tx.sprint.findFirst({
          where: { projectId: project.id, name },
        });
        if (!sprint) {
          sprint = await tx.sprint.create({
            data: { projectId: project.id, name, state: 'active' },
          });
        }
        sprintMap.set(name, sprint.id);
      }

      // 3. Upsert Artifacts
      for (const issue of rawIssues) {
        const mapped = mapIssueToArtifact(issue, opts);

        // Determine sprintId: use the most recent Sprint changelog entry
        let sprintId: string | undefined;
        const sprintHistories = (issue.changelog?.histories ?? [])
          .filter((h) => h.items.some((i) => i.field === 'Sprint' && i.toString))
          .sort(
            (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
          );
        if (sprintHistories.length > 0) {
          const latestSprintName = sprintHistories[0].items.find(
            (i) => i.field === 'Sprint',
          )?.toString;
          if (latestSprintName) {
            sprintId = sprintMap.get(latestSprintName);
          }
        }

        await tx.artifact.upsert({
          where: { key: mapped.key },
          update: {
            type: mapped.type,
            status: mapped.status,
            statusCategory: mapped.statusCategory,
            assignee: mapped.assignee,
            points: mapped.points,
            sprintId: sprintId ?? null,
            jiraUpdatedAt: mapped.jiraUpdatedAt,
            addedToSprintAfterStart: mapped.addedToSprintAfterStart,
            raw: mapped.raw as object,
          },
          create: {
            projectId: project.id,
            key: mapped.key,
            type: mapped.type,
            status: mapped.status,
            statusCategory: mapped.statusCategory,
            assignee: mapped.assignee,
            points: mapped.points,
            sprintId: sprintId ?? null,
            jiraUpdatedAt: mapped.jiraUpdatedAt,
            addedToSprintAfterStart: mapped.addedToSprintAfterStart,
            raw: mapped.raw as object,
          },
        });
      }
    });
  }
}
