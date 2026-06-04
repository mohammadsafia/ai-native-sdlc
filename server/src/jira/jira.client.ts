// server/src/jira/jira.client.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { JiraIssue, JiraSearchResponse } from './jira.types';

export interface HttpAdapter {
  get<T>(url: string, params?: Record<string, unknown>): Promise<T>;
}

class AxiosAdapter implements HttpAdapter {
  constructor(private readonly client: AxiosInstance) {}

  async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const response = await this.client.get<T>(url, { params });
    return response.data;
  }
}

@Injectable()
export class JiraClient {
  private http: HttpAdapter | null = null;

  /** Injected only in unit tests via `withHttpAdapter`; production uses axios. */
  private testHttp: HttpAdapter | undefined;

  constructor(private readonly config: ConfigService) {}

  /**
   * Allow unit tests to swap in a fake HTTP adapter without touching DI.
   * Call this before `searchIssues` in tests.
   */
  withHttpAdapter(http: HttpAdapter): this {
    this.testHttp = http;
    return this;
  }

  private getHttp(): HttpAdapter {
    if (this.testHttp) return this.testHttp;
    if (!this.http) {
      const axiosInstance = axios.create({
        baseURL: this.config.get<string>('JIRA_BASE_URL'),
        auth: {
          username: this.config.get<string>('JIRA_EMAIL') ?? '',
          password: this.config.get<string>('JIRA_API_TOKEN') ?? '',
        },
        headers: {
          Accept: 'application/json',
        },
      });
      this.http = new AxiosAdapter(axiosInstance);
    }
    return this.http;
  }

  /**
   * Paginate GET /rest/api/3/search/jql with expand=changelog (cursor-based).
   * Returns all issues across all pages.
   * Read-only: GETs only.
   */
  async searchIssues(
    jql: string,
    opts: { maxResults?: number } = {},
  ): Promise<JiraIssue[]> {
    const maxResults = opts.maxResults ?? 100;
    let nextPageToken: string | undefined;
    const allIssues: JiraIssue[] = [];

    while (true) {
      const params: Record<string, unknown> = {
        jql,
        expand: 'changelog',
        maxResults,
        fields:
          'summary,issuetype,status,assignee,updated,customfield_11025,customfield_10022,customfield_10016,customfield_10028',
        ...(nextPageToken ? { nextPageToken } : {}),
      };

      const page = await this.getHttp().get<JiraSearchResponse>(
        '/rest/api/3/search/jql',
        params,
      );

      allIssues.push(...page.issues);

      // Stop when Jira signals last page, no cursor returned, or empty page guard
      if (page.isLast === true || !page.nextPageToken || page.issues.length === 0) {
        break;
      }
      nextPageToken = page.nextPageToken;
    }

    return allIssues;
  }
}
