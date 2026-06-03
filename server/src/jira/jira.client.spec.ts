// server/src/jira/jira.client.spec.ts
import { JiraClient, HttpAdapter } from './jira.client';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fixtureData = require('../../test/fixtures/jira-search.json');

// Fake HttpAdapter that returns page1, then page2 on successive calls
class FakeHttpAdapter implements HttpAdapter {
  private callCount = 0;

  async get<T>(_url: string, _params?: Record<string, unknown>): Promise<T> {
    const page = this.callCount === 0 ? fixtureData.page1 : fixtureData.page2;
    this.callCount++;
    return page as unknown as T;
  }
}

describe('JiraClient', () => {
  let client: JiraClient;
  let fakeHttp: FakeHttpAdapter;

  beforeEach(() => {
    fakeHttp = new FakeHttpAdapter();
    const configService = { get: jest.fn() } as unknown as ConfigService;
    client = new JiraClient(configService, fakeHttp);
  });

  it('paginates across two pages and returns all 7 issues', async () => {
    const issues = await client.searchIssues('project = PROJ ORDER BY updated DESC');
    expect(issues).toHaveLength(7);
  });

  it('concatenates page1 issues first, then page2 issues', async () => {
    const issues = await client.searchIssues('project = PROJ ORDER BY updated DESC');
    expect(issues[0].key).toBe('PROJ-1');
    expect(issues[4].key).toBe('PROJ-5');
    expect(issues[6].key).toBe('PROJ-7');
  });

  it('parses fields.issuetype.name on the first issue', async () => {
    const issues = await client.searchIssues('project = PROJ');
    expect(issues[0].fields.issuetype.name).toBe('Story');
  });

  it('parses fields.status.statusCategory.key', async () => {
    const issues = await client.searchIssues('project = PROJ');
    const blockedIssue = issues.find((i) => i.key === 'PROJ-2');
    expect(blockedIssue?.fields.status.statusCategory.key).toBe('indeterminate');
  });

  it('parses fields.assignee when present', async () => {
    const issues = await client.searchIssues('project = PROJ');
    const issue = issues.find((i) => i.key === 'PROJ-1');
    expect(issue?.fields.assignee?.displayName).toBe('Alice Smith');
  });

  it('handles null assignee on PROJ-3', async () => {
    const issues = await client.searchIssues('project = PROJ');
    const issue = issues.find((i) => i.key === 'PROJ-3');
    expect(issue?.fields.assignee).toBeNull();
  });

  it('includes changelog histories', async () => {
    const issues = await client.searchIssues('project = PROJ');
    const issue = issues.find((i) => i.key === 'PROJ-5');
    expect(issue?.changelog?.histories.length).toBeGreaterThan(0);
  });
});
