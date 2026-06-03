// server/src/jira/jira.connector.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { JiraConnectorService } from './jira.connector.service';
import { JiraClient } from './jira.client';
import { NormalizeService } from '../normalization/normalize.service';
import { PrismaService } from '../prisma/prisma.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fixtureData = require('../../test/fixtures/jira-search.json');
import { JiraIssue } from './jira.types';

const allIssues = [
  ...fixtureData.page1.issues,
  ...fixtureData.page2.issues,
] as unknown as JiraIssue[];

describe('JiraConnectorService', () => {
  let service: JiraConnectorService;
  let searchIssuesMock: jest.Mock;
  let persistMock: jest.Mock;
  let projectUpsertMock: jest.Mock;
  let syncRunCreateMock: jest.Mock;
  let syncRunUpdateMock: jest.Mock;

  beforeEach(async () => {
    searchIssuesMock = jest.fn().mockResolvedValue(allIssues);
    persistMock = jest.fn().mockResolvedValue(undefined);
    projectUpsertMock = jest.fn().mockResolvedValue({ id: 'proj-id-1' });
    syncRunCreateMock = jest.fn().mockResolvedValue({ id: 'sync-run-id-1' });
    syncRunUpdateMock = jest.fn().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JiraConnectorService,
        {
          provide: JiraClient,
          useValue: { searchIssues: searchIssuesMock },
        },
        {
          provide: NormalizeService,
          useValue: { persist: persistMock },
        },
        {
          provide: PrismaService,
          useValue: {
            project: { upsert: projectUpsertMock },
            syncRun: {
              create: syncRunCreateMock,
              update: syncRunUpdateMock,
            },
          },
        },
      ],
    }).compile();

    service = module.get<JiraConnectorService>(JiraConnectorService);
  });

  it('calls searchIssues with the correct JQL for the project key', async () => {
    await service.sync('PROJ');
    expect(searchIssuesMock).toHaveBeenCalledWith(
      'project = "PROJ" ORDER BY updated DESC',
    );
  });

  it('returns the syncRunId and issueCount', async () => {
    const result = await service.sync('PROJ');
    expect(result.syncRunId).toBe('sync-run-id-1');
    expect(result.issueCount).toBe(7);
  });

  it('creates a SyncRun with status=running before fetching', async () => {
    await service.sync('PROJ');
    expect(syncRunCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'running' }),
      }),
    );
  });

  it('marks the SyncRun as success with issueCount after a successful sync', async () => {
    await service.sync('PROJ');
    expect(syncRunUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'success',
          issueCount: 7,
        }),
      }),
    );
  });

  it('calls NormalizeService.persist with the projectKey and fetched issues', async () => {
    await service.sync('PROJ');
    expect(persistMock).toHaveBeenCalledWith('PROJ', allIssues);
  });

  it('marks SyncRun as failed and rethrows when searchIssues throws', async () => {
    searchIssuesMock.mockRejectedValueOnce(new Error('Network error'));

    await expect(service.sync('PROJ')).rejects.toThrow('Network error');
    expect(syncRunUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
          errorMessage: 'Network error',
        }),
      }),
    );
  });
});
