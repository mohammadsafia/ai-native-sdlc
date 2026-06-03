// server/src/bitbucket/bitbucket.client.spec.ts
import { BitbucketClient, HttpAdapter } from './bitbucket.client';
import { ConfigService } from '@nestjs/config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const commitFixtures = require('../../test/fixtures/bitbucket-commits.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const prFixtures = require('../../test/fixtures/bitbucket-prs.json');

/**
 * Fake adapter for commits: returns page1 on first call, page2 on second.
 * page2 has no `next` so pagination stops.
 */
class FakeCommitAdapter implements HttpAdapter {
  private callCount = 0;

  async get<T>(_url: string, _params?: Record<string, unknown>): Promise<T> {
    const page = this.callCount === 0 ? commitFixtures.page1 : commitFixtures.page2;
    this.callCount++;
    return page as unknown as T;
  }
}

/**
 * Fake adapter for PRs: returns page1 (single page, no next).
 */
class FakePrAdapter implements HttpAdapter {
  async get<T>(_url: string, _params?: Record<string, unknown>): Promise<T> {
    return prFixtures.page1 as unknown as T;
  }
}

describe('BitbucketClient', () => {
  let configService: ConfigService;

  beforeEach(() => {
    configService = { get: jest.fn() } as unknown as ConfigService;
  });

  describe('listCommits', () => {
    it('paginates across two pages and returns all 4 commits', async () => {
      const client = new BitbucketClient(configService).withHttpAdapter(new FakeCommitAdapter());
      const commits = await client.listCommits('myws', 'my-repo');
      expect(commits).toHaveLength(4);
    });

    it('returns page1 commits first, then page2', async () => {
      const client = new BitbucketClient(configService).withHttpAdapter(new FakeCommitAdapter());
      const commits = await client.listCommits('myws', 'my-repo');
      expect(commits[0].hash).toBe('abc123def456abc123def456abc123def456abc1');
      expect(commits[3].hash).toBe('999zzz888yyy777xxx666www555vvv444uuu333t');
    });

    it('parses commit message and author', async () => {
      const client = new BitbucketClient(configService).withHttpAdapter(new FakeCommitAdapter());
      const commits = await client.listCommits('myws', 'my-repo');
      expect(commits[0].message).toContain('PROJ-1');
      expect(commits[0].author.raw).toBe('Alice Smith <alice@example.com>');
    });
  });

  describe('listPullRequests', () => {
    it('returns all PRs from a single page', async () => {
      const client = new BitbucketClient(configService).withHttpAdapter(new FakePrAdapter());
      const prs = await client.listPullRequests('myws', 'my-repo');
      expect(prs).toHaveLength(2);
    });

    it('parses PR title, state, and branch names', async () => {
      const client = new BitbucketClient(configService).withHttpAdapter(new FakePrAdapter());
      const prs = await client.listPullRequests('myws', 'my-repo');
      expect(prs[0].title).toContain('PROJ-1');
      expect(prs[0].state).toBe('OPEN');
      expect(prs[0].source.branch.name).toBe('feature/PROJ-1-login-fix');
    });

    it('parses updated_on timestamps', async () => {
      const client = new BitbucketClient(configService).withHttpAdapter(new FakePrAdapter());
      const prs = await client.listPullRequests('myws', 'my-repo');
      expect(prs[0].updated_on).toBe('2026-05-30T10:00:00.000Z');
    });
  });
});
