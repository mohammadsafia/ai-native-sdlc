// server/src/bitbucket/bitbucket.client.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  BitbucketCommit,
  BitbucketPullRequest,
  BitbucketPage,
} from './bitbucket.types';

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
export class BitbucketClient {
  private http: HttpAdapter | null = null;

  /** Injected only in unit tests; production uses axios. */
  private testHttp: HttpAdapter | undefined;

  constructor(private readonly config: ConfigService) {}

  /**
   * Allow unit tests to swap in a fake HTTP adapter.
   * Call this before any fetch method in tests.
   */
  withHttpAdapter(http: HttpAdapter): this {
    this.testHttp = http;
    return this;
  }

  private getHttp(): HttpAdapter {
    if (this.testHttp) return this.testHttp;
    if (!this.http) {
      const username = this.config.get<string>('BITBUCKET_USERNAME') ?? '';
      const password = this.config.get<string>('BITBUCKET_APP_PASSWORD') ?? '';
      const axiosInstance = axios.create({
        baseURL: 'https://api.bitbucket.org/2.0',
        auth: { username, password },
        headers: { Accept: 'application/json' },
      });
      this.http = new AxiosAdapter(axiosInstance);
    }
    return this.http;
  }

  /**
   * Paginate GET /repositories/{workspace}/{repo}/commits.
   * Follows the `next` cursor until exhausted.
   * Read-only: GET only.
   */
  async listCommits(
    workspace: string,
    repo: string,
  ): Promise<BitbucketCommit[]> {
    const all: BitbucketCommit[] = [];
    let url: string | undefined =
      `/repositories/${workspace}/${repo}/commits`;

    while (url) {
      // If url is a full URL (next cursor from Bitbucket), extract just the path+query
      const path = url.startsWith('http')
        ? new URL(url).pathname + new URL(url).search
        : url;
      const page = await this.getHttp().get<BitbucketPage<BitbucketCommit>>(path);
      all.push(...page.values);
      url = page.next;
    }

    return all;
  }

  /**
   * Paginate GET /repositories/{workspace}/{repo}/pullrequests.
   * state defaults to 'OPEN'.
   * Follows the `next` cursor until exhausted.
   * Read-only: GET only.
   */
  async listPullRequests(
    workspace: string,
    repo: string,
    state = 'OPEN',
  ): Promise<BitbucketPullRequest[]> {
    const all: BitbucketPullRequest[] = [];
    let url: string | undefined =
      `/repositories/${workspace}/${repo}/pullrequests`;

    while (url) {
      const path = url.startsWith('http')
        ? new URL(url).pathname + new URL(url).search
        : url;
      const page = await this.getHttp().get<BitbucketPage<BitbucketPullRequest>>(
        path,
        { state },
      );
      all.push(...page.values);
      url = page.next;
    }

    return all;
  }
}
