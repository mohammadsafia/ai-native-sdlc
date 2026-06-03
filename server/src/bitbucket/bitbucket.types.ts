// server/src/bitbucket/bitbucket.types.ts

export interface BitbucketAuthor {
  raw: string; // "Alice Smith <alice@example.com>"
}

export interface BitbucketCommit {
  hash: string;
  message: string;
  date: string; // ISO 8601
  author: BitbucketAuthor;
}

export interface BitbucketBranchRef {
  name: string;
}

export interface BitbucketBranchSource {
  branch: BitbucketBranchRef;
}

export interface BitbucketPullRequest {
  id: number;
  title: string;
  state: string; // OPEN | MERGED | DECLINED | SUPERSEDED
  source: BitbucketBranchSource;
  destination: BitbucketBranchSource;
  created_on: string; // ISO 8601
  updated_on: string; // ISO 8601
}

export interface BitbucketPage<T> {
  values: T[];
  next?: string; // URL for next page; undefined means last page
}
