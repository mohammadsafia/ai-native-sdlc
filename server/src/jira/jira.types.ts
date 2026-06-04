// server/src/jira/jira.types.ts

export interface JiraStatusCategory {
  key: string; // 'new' | 'indeterminate' | 'done'
  name: string;
}

export interface JiraStatus {
  name: string;
  statusCategory: JiraStatusCategory;
}

export interface JiraIssueType {
  name: string; // 'Story' | 'Bug' | 'Task' | 'Epic' | 'Sub-task'
}

export interface JiraUser {
  displayName: string;
  emailAddress: string;
}

// Sprint field shape returned by the Jira board/sprint custom field
export interface JiraSprintField {
  id: number;
  name: string;
  state: string; // 'active' | 'closed' | 'future'
  startDate?: string; // ISO 8601
  endDate?: string; // ISO 8601
}

export interface JiraChangelogItem {
  field: string; // e.g. 'Sprint', 'status'
  fromString: string | null;
  toString: string | null;
}

export interface JiraChangelogHistory {
  created: string; // ISO 8601
  items: JiraChangelogItem[];
}

export interface JiraChangelog {
  histories: JiraChangelogHistory[];
}

export interface JiraIssueFields {
  summary: string;
  issuetype: JiraIssueType;
  status: JiraStatus;
  assignee: JiraUser | null;
  updated: string; // ISO 8601
  // Story points: Jira uses customfield_10016 (next-gen) or customfield_10028 (classic)
  // We accept both; callers supply the fieldId to extract
  [key: string]: unknown;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: JiraIssueFields;
  changelog?: JiraChangelog;
}

export interface JiraSearchResponse {
  issues: JiraIssue[];
  nextPageToken?: string;
  isLast?: boolean;
  /** @deprecated Not returned by /rest/api/3/search/jql; kept for compatibility only. */
  total?: number;
}
