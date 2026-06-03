// server/src/bitbucket/bitbucket.connector.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { BitbucketConnectorService } from './bitbucket.connector.service';
import { BitbucketClient } from './bitbucket.client';
import { PrismaService } from '../prisma/prisma.service';
import { BitbucketCommit, BitbucketPullRequest } from './bitbucket.types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const commitFixtures = require('../../test/fixtures/bitbucket-commits.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const prFixtures = require('../../test/fixtures/bitbucket-prs.json');

const allCommits: BitbucketCommit[] = [
  ...commitFixtures.page1.values,
  ...commitFixtures.page2.values,
];
const allPrs: BitbucketPullRequest[] = prFixtures.page1.values;

describe('BitbucketConnectorService', () => {
  let service: BitbucketConnectorService;
  let listCommitsMock: jest.Mock;
  let listPrsMock: jest.Mock;
  let projectUpsertMock: jest.Mock;
  let syncRunCreateMock: jest.Mock;
  let syncRunUpdateMock: jest.Mock;
  let commitUpsertMock: jest.Mock;
  let prUpsertMock: jest.Mock;

  beforeEach(async () => {
    listCommitsMock = jest.fn().mockResolvedValue(allCommits);
    listPrsMock = jest.fn().mockResolvedValue(allPrs);
    projectUpsertMock = jest.fn().mockResolvedValue({ id: 'proj-id-1', key: 'myws/my-repo' });
    syncRunCreateMock = jest.fn().mockResolvedValue({ id: 'sync-run-1' });
    syncRunUpdateMock = jest.fn().mockResolvedValue({});
    commitUpsertMock = jest.fn().mockResolvedValue({});
    prUpsertMock = jest.fn().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BitbucketConnectorService,
        {
          provide: BitbucketClient,
          useValue: {
            listCommits: listCommitsMock,
            listPullRequests: listPrsMock,
          },
        },
        {
          provide: PrismaService,
          useValue: {
            project: {
              upsert: projectUpsertMock,
            },
            syncRun: {
              create: syncRunCreateMock,
              update: syncRunUpdateMock,
            },
            commit: { upsert: commitUpsertMock },
            pullRequest: { upsert: prUpsertMock },
          },
        },
      ],
    }).compile();

    service = module.get<BitbucketConnectorService>(BitbucketConnectorService);
  });

  it('calls listCommits with workspace and repo', async () => {
    await service.sync('myws', 'my-repo');
    expect(listCommitsMock).toHaveBeenCalledWith('myws', 'my-repo');
  });

  it('calls listPullRequests with workspace and repo', async () => {
    await service.sync('myws', 'my-repo');
    expect(listPrsMock).toHaveBeenCalledWith('myws', 'my-repo');
  });

  it('upserts one commit record per commit fetched', async () => {
    await service.sync('myws', 'my-repo');
    expect(commitUpsertMock).toHaveBeenCalledTimes(allCommits.length);
  });

  it('upserts one PR record per PR fetched', async () => {
    await service.sync('myws', 'my-repo');
    expect(prUpsertMock).toHaveBeenCalledTimes(allPrs.length);
  });

  it('extracts linked issue keys from commit message and stores them', async () => {
    await service.sync('myws', 'my-repo');
    // First commit message: "fix: resolve PROJ-1 null pointer in login" → PROJ-1
    const firstCall = commitUpsertMock.mock.calls[0][0];
    const createData = firstCall.create;
    expect(createData.linkedIssueKeys).toContain('PROJ-1');
  });

  it('commit with no issue key gets empty linkedIssueKeys', async () => {
    await service.sync('myws', 'my-repo');
    // Third commit: "chore: tidy up whitespace" → no keys
    const thirdCall = commitUpsertMock.mock.calls[2][0];
    expect(thirdCall.create.linkedIssueKeys).toEqual([]);
  });

  it('creates a SyncRun with status=running before fetching', async () => {
    await service.sync('myws', 'my-repo');
    expect(syncRunCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'running' }),
      }),
    );
  });

  it('marks SyncRun as success after successful sync', async () => {
    await service.sync('myws', 'my-repo');
    expect(syncRunUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'success' }),
      }),
    );
  });

  it('marks SyncRun as failed and rethrows when listCommits throws', async () => {
    listCommitsMock.mockRejectedValueOnce(new Error('API error'));
    await expect(service.sync('myws', 'my-repo')).rejects.toThrow('API error');
    expect(syncRunUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', errorMessage: 'API error' }),
      }),
    );
  });
});
