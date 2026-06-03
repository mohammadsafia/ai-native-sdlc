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
  private readonly http: HttpAdapter;

  constructor(private readonly config: ConfigService, http?: HttpAdapter) {
    if (http) {
      this.http = http;
    } else {
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
  }

  /**
   * Paginate GET /rest/api/3/search with expand=changelog.
   * Returns all issues across all pages.
   * Read-only: GETs only.
   */
  async searchIssues(
    jql: string,
    opts: { maxResults?: number } = {},
  ): Promise<JiraIssue[]> {
    const maxResults = opts.maxResults ?? 100;
    let startAt = 0;
    const allIssues: JiraIssue[] = [];

    while (true) {
      const page = await this.http.get<JiraSearchResponse>(
        '/rest/api/3/search',
        {
          jql,
          expand: 'changelog',
          maxResults,
          startAt,
          fields:
            'summary,issuetype,status,assignee,updated,customfield_10016,customfield_10028',
        },
      );

      allIssues.push(...page.issues);

      if (startAt + page.issues.length >= page.total) {
        break;
      }
      startAt += page.issues.length;
    }

    return allIssues;
  }
}
