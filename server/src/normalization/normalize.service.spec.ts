// server/src/normalization/normalize.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { NormalizeService } from './normalize.service';
import { PrismaService } from '../prisma/prisma.service';
import { JiraIssue } from '../jira/jira.types';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fixtureData = require('../../test/fixtures/jira-search.json');

const allIssues = [
  ...fixtureData.page1.issues,
  ...fixtureData.page2.issues,
] as unknown as JiraIssue[];

describe('NormalizeService', () => {
  let service: NormalizeService;

  let projectUpsertSpy: jest.Mock;
  let sprintFindFirstSpy: jest.Mock;
  let sprintCreateSpy: jest.Mock;
  let artifactUpsertSpy: jest.Mock;
  let transactionSpy: jest.Mock;

  beforeEach(async () => {
    projectUpsertSpy = jest.fn().mockResolvedValue({ id: 'proj-id-1' });
    sprintFindFirstSpy = jest.fn().mockResolvedValue(null); // none exist yet
    sprintCreateSpy = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({ id: `sprint-${data.name}`, ...data }),
    );
    artifactUpsertSpy = jest.fn().mockResolvedValue({});

    // Mock tx object passed into the $transaction callback
    const mockTx = {
      project: { upsert: projectUpsertSpy },
      sprint: { findFirst: sprintFindFirstSpy, create: sprintCreateSpy },
      artifact: { upsert: artifactUpsertSpy },
    };

    transactionSpy = jest.fn().mockImplementation(async (cb) => cb(mockTx));

    const mockPrismaService = {
      $transaction: transactionSpy,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NormalizeService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<NormalizeService>(NormalizeService);
  });

  it('calls $transaction exactly once', async () => {
    await service.persist('PROJ', allIssues, {
      sprintStartDate: new Date(fixtureData._meta.sprintStartDate),
    });
    expect(transactionSpy).toHaveBeenCalledTimes(1);
  });

  it('upserts the project with key=PROJ and sets lastSyncedAt', async () => {
    await service.persist('PROJ', allIssues);
    expect(projectUpsertSpy).toHaveBeenCalledTimes(1);
    const call = projectUpsertSpy.mock.calls[0][0];
    expect(call.where.key).toBe('PROJ');
    expect(call.update.lastSyncedAt).toBeInstanceOf(Date);
    expect(call.create.key).toBe('PROJ');
  });

  it('upserts one artifact per issue (7 total)', async () => {
    await service.persist('PROJ', allIssues);
    expect(artifactUpsertSpy).toHaveBeenCalledTimes(7);
  });

  it('maps PROJ-5 with addedToSprintAfterStart=true', async () => {
    await service.persist('PROJ', allIssues, {
      sprintStartDate: new Date(fixtureData._meta.sprintStartDate),
    });

    const proj5Call = artifactUpsertSpy.mock.calls.find(
      ([args]) => args.where.key === 'PROJ-5',
    );
    expect(proj5Call).toBeDefined();
    const upsertArg = proj5Call[0];
    expect(upsertArg.create.addedToSprintAfterStart).toBe(true);
    expect(upsertArg.update.addedToSprintAfterStart).toBe(true);
  });

  it('maps PROJ-3 (Done) with statusCategory=done', async () => {
    await service.persist('PROJ', allIssues);

    const proj3Call = artifactUpsertSpy.mock.calls.find(
      ([args]) => args.where.key === 'PROJ-3',
    );
    expect(proj3Call).toBeDefined();
    expect(proj3Call[0].create.statusCategory).toBe('done');
  });

  it('maps PROJ-2 (Blocked) with statusCategory=in_progress', async () => {
    await service.persist('PROJ', allIssues);

    const proj2Call = artifactUpsertSpy.mock.calls.find(
      ([args]) => args.where.key === 'PROJ-2',
    );
    expect(proj2Call).toBeDefined();
    expect(proj2Call[0].create.statusCategory).toBe('in_progress');
  });

  it('maps PROJ-4 (To Do) with statusCategory=todo and null points', async () => {
    await service.persist('PROJ', allIssues);

    const proj4Call = artifactUpsertSpy.mock.calls.find(
      ([args]) => args.where.key === 'PROJ-4',
    );
    expect(proj4Call).toBeDefined();
    expect(proj4Call[0].create.statusCategory).toBe('todo');
    expect(proj4Call[0].create.points).toBeNull();
  });

  it('creates sprints for unique sprint names found in changelog', async () => {
    await service.persist('PROJ', allIssues);
    // All issues reference 'Sprint 1' in their changelogs
    expect(sprintCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Sprint 1' }),
      }),
    );
  });
});
