// server/src/normalization/mappers.spec.ts
import {
  toStatusCategory,
  isBlocked,
  extractPoints,
  mapAssignee,
  addedToSprintAfterStart,
  mapIssueToArtifact,
} from './mappers';
import { JiraIssue, JiraChangelogHistory } from '../jira/jira.types';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fixtureData = require('../../test/fixtures/jira-search.json');

// Helpers to get fixture issues
const allIssues = [
  ...fixtureData.page1.issues,
  ...fixtureData.page2.issues,
] as unknown as JiraIssue[];

const getIssue = (key: string) => allIssues.find((i) => i.key === key)!;

describe('toStatusCategory', () => {
  it('maps "done" to "done"', () => {
    expect(toStatusCategory('done')).toBe('done');
  });

  it('maps "indeterminate" to "in_progress"', () => {
    expect(toStatusCategory('indeterminate')).toBe('in_progress');
  });

  it('maps "new" to "todo"', () => {
    expect(toStatusCategory('new')).toBe('todo');
  });

  it('maps unknown category to "todo"', () => {
    expect(toStatusCategory('unknown_cat')).toBe('todo');
  });
});

describe('isBlocked', () => {
  it('returns true for "Blocked" status', () => {
    expect(isBlocked('Blocked')).toBe(true);
  });

  it('returns true case-insensitively for "blocked"', () => {
    expect(isBlocked('blocked')).toBe(true);
  });

  it('returns true case-insensitively for "BLOCKED"', () => {
    expect(isBlocked('BLOCKED')).toBe(true);
  });

  it('returns false for "In Progress"', () => {
    expect(isBlocked('In Progress')).toBe(false);
  });

  it('returns true for custom blocked statuses list', () => {
    expect(isBlocked('On Hold', ['On Hold', 'Waiting'])).toBe(true);
  });

  it('returns false for "Done"', () => {
    expect(isBlocked('Done')).toBe(false);
  });
});

describe('extractPoints', () => {
  it('extracts points from customfield_10016 when present (PROJ-1: 5)', () => {
    const issue = getIssue('PROJ-1');
    expect(extractPoints(issue.fields as Record<string, unknown>)).toBe(5);
  });

  it('returns null when customfield_10016 is null (PROJ-4)', () => {
    const issue = getIssue('PROJ-4');
    expect(extractPoints(issue.fields as Record<string, unknown>)).toBeNull();
  });

  it('uses pointsFieldId override when provided', () => {
    const fields = { myField: 13 };
    expect(extractPoints(fields, 'myField')).toBe(13);
  });

  it('falls back to customfield_10028 if 10016 absent', () => {
    const fields = { customfield_10028: 7 };
    expect(extractPoints(fields)).toBe(7);
  });
});

describe('mapAssignee', () => {
  it('returns displayName when assignee present (PROJ-1 -> Alice Smith)', () => {
    const issue = getIssue('PROJ-1');
    expect(mapAssignee(issue.fields)).toBe('Alice Smith');
  });

  it('returns null when assignee is null (PROJ-3)', () => {
    const issue = getIssue('PROJ-3');
    expect(mapAssignee(issue.fields)).toBeNull();
  });
});

describe('addedToSprintAfterStart', () => {
  const sprintStart = new Date(fixtureData._meta.sprintStartDate);

  it('returns true for PROJ-5 (added 2026-05-29, after sprint start 2026-05-21)', () => {
    const issue = getIssue('PROJ-5');
    const histories = issue.changelog!.histories as unknown as JiraChangelogHistory[];
    expect(addedToSprintAfterStart(histories, sprintStart)).toBe(true);
  });

  it('returns true for PROJ-2 (added 2026-05-22, which is after sprint start 2026-05-21)', () => {
    const issue = getIssue('PROJ-2');
    const histories = issue.changelog!.histories as unknown as JiraChangelogHistory[];
    expect(addedToSprintAfterStart(histories, sprintStart)).toBe(true);
  });

  it('returns false when tested with a sprint start that is AFTER all history entries', () => {
    // PROJ-3 history created at 2026-05-21T08:00:00Z; use a start time after that
    const issue = getIssue('PROJ-3');
    const histories = issue.changelog!.histories as unknown as JiraChangelogHistory[];
    const laterStart = new Date('2026-05-21T10:00:00.000Z');
    expect(addedToSprintAfterStart(histories, laterStart)).toBe(false);
  });

  it('returns false for an issue with no changelog histories (PROJ-4)', () => {
    const issue = getIssue('PROJ-4');
    const histories = issue.changelog!.histories as unknown as JiraChangelogHistory[];
    expect(addedToSprintAfterStart(histories, sprintStart)).toBe(false);
  });
});

describe('mapIssueToArtifact', () => {
  const sprintStart = new Date(fixtureData._meta.sprintStartDate);

  it('maps PROJ-5 with addedToSprintAfterStart=true', () => {
    const issue = getIssue('PROJ-5');
    const result = mapIssueToArtifact(issue, { sprintStartDate: sprintStart });
    expect(result.addedToSprintAfterStart).toBe(true);
    expect(result.key).toBe('PROJ-5');
    expect(result.statusCategory).toBe('in_progress');
  });

  it('maps PROJ-2 (Blocked status) to statusCategory=in_progress', () => {
    const issue = getIssue('PROJ-2');
    const result = mapIssueToArtifact(issue, { sprintStartDate: sprintStart });
    expect(result.status).toBe('Blocked');
    expect(result.statusCategory).toBe('in_progress');
  });

  it('maps PROJ-3 (Done) to statusCategory=done with null assignee', () => {
    const issue = getIssue('PROJ-3');
    const result = mapIssueToArtifact(issue, { sprintStartDate: sprintStart });
    expect(result.statusCategory).toBe('done');
    expect(result.assignee).toBeNull();
  });

  it('maps PROJ-4 (To Do, no points) to statusCategory=todo with null points', () => {
    const issue = getIssue('PROJ-4');
    const result = mapIssueToArtifact(issue);
    expect(result.statusCategory).toBe('todo');
    expect(result.points).toBeNull();
  });

  it('maps issue type correctly: Story -> story, Bug -> bug, Task -> task', () => {
    expect(mapIssueToArtifact(getIssue('PROJ-1')).type).toBe('story');
    expect(mapIssueToArtifact(getIssue('PROJ-2')).type).toBe('bug');
    expect(mapIssueToArtifact(getIssue('PROJ-4')).type).toBe('task');
  });

  it('sets raw to the original JiraIssue object', () => {
    const issue = getIssue('PROJ-1');
    const result = mapIssueToArtifact(issue);
    expect(result.raw).toBe(issue);
  });

  it('parses jiraUpdatedAt as a Date', () => {
    const issue = getIssue('PROJ-1');
    const result = mapIssueToArtifact(issue);
    expect(result.jiraUpdatedAt).toBeInstanceOf(Date);
    expect(result.jiraUpdatedAt.toISOString()).toBe('2026-05-25T10:00:00.000Z');
  });
});
