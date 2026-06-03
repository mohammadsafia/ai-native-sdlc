// server/src/normalization/mappers.ts
import { JiraIssue, JiraChangelogHistory } from '../jira/jira.types';

export type StatusCategory = 'done' | 'in_progress' | 'todo';

/**
 * Maps Jira's statusCategory.key to our canonical StatusCategory.
 * 'indeterminate' → 'in_progress', 'done' → 'done', everything else → 'todo'
 */
export function toStatusCategory(jiraCategoryKey: string): StatusCategory {
  switch (jiraCategoryKey) {
    case 'done':
      return 'done';
    case 'indeterminate':
      return 'in_progress';
    default:
      return 'todo';
  }
}

/**
 * Returns true if the Jira status name matches any of the blockedStatuses list
 * (case-insensitive).
 */
export function isBlocked(
  statusName: string,
  blockedStatuses: string[] = ['Blocked', 'Impediment'],
): boolean {
  const lower = statusName.toLowerCase();
  return blockedStatuses.some((s) => s.toLowerCase() === lower);
}

/**
 * Extracts story points from issue fields.
 * Tries pointsFieldId first, then falls back to customfield_10016 and customfield_10028.
 * Returns null if no numeric value is found.
 */
export function extractPoints(
  fields: Record<string, unknown>,
  pointsFieldId?: string,
): number | null {
  const candidates = [
    pointsFieldId,
    'customfield_10016',
    'customfield_10028',
  ].filter(Boolean) as string[];

  for (const field of candidates) {
    const val = fields[field];
    if (typeof val === 'number' && !isNaN(val)) {
      return val;
    }
  }
  return null;
}

/**
 * Extracts the assignee display name from issue fields.
 * Returns null if no assignee.
 */
export function mapAssignee(fields: JiraIssue['fields']): string | null {
  return fields.assignee?.displayName ?? null;
}

/**
 * Returns true if any changelog history entry:
 *   - has field === 'Sprint'
 *   - AND fromString is null/empty (i.e., first time added to a sprint)
 *   - AND was created AFTER sprintStartDate
 *
 * This detects scope creep: an issue added to an already-started sprint.
 */
export function addedToSprintAfterStart(
  histories: JiraChangelogHistory[],
  sprintStartDate: Date,
): boolean {
  return histories.some((history) => {
    const historyDate = new Date(history.created);
    if (historyDate <= sprintStartDate) return false;

    return history.items.some(
      (item) =>
        item.field === 'Sprint' &&
        (item.fromString === null || item.fromString === '') &&
        item.toString !== null &&
        item.toString !== '',
    );
  });
}

/**
 * Maps a JiraIssue to a plain object matching the Artifact model fields.
 * projectId is intentionally omitted here — NormalizeService resolves it after upsert.
 */
export function mapIssueToArtifact(
  issue: JiraIssue,
  opts: {
    pointsFieldId?: string;
    blockedStatuses?: string[];
    sprintStartDate?: Date;
  } = {},
): {
  key: string;
  type: string;
  status: string;
  statusCategory: string;
  assignee: string | null;
  points: number | null;
  jiraUpdatedAt: Date;
  addedToSprintAfterStart: boolean;
  raw: JiraIssue;
} {
  const { fields, changelog } = issue;
  const { pointsFieldId, blockedStatuses, sprintStartDate } = opts;

  const rawStatusCategory = toStatusCategory(fields.status.statusCategory.key);
  const blocked = isBlocked(fields.status.name, blockedStatuses);
  // If blocked, override statusCategory to 'in_progress' (still in-flight but impediment)
  const statusCategory = blocked ? 'in_progress' : rawStatusCategory;

  const histories = changelog?.histories ?? [];

  const scopeCreep =
    sprintStartDate != null
      ? addedToSprintAfterStart(histories, sprintStartDate)
      : false;

  return {
    key: issue.key,
    type: normalizeIssueType(fields.issuetype.name),
    status: fields.status.name,
    statusCategory,
    assignee: mapAssignee(fields),
    points: extractPoints(fields as Record<string, unknown>, pointsFieldId),
    jiraUpdatedAt: new Date(fields.updated),
    addedToSprintAfterStart: scopeCreep,
    raw: issue,
  };
}

function normalizeIssueType(name: string): string {
  switch (name.toLowerCase()) {
    case 'story':
      return 'story';
    case 'bug':
      return 'bug';
    case 'task':
      return 'task';
    case 'epic':
      return 'epic';
    case 'sub-task':
    case 'subtask':
      return 'sub_task';
    default:
      return 'task';
  }
}
