// server/src/entity-resolution/issue-keys.ts

/** Matches Jira-style issue keys: uppercase project prefix (2+ chars) + dash + digits. */
const ISSUE_KEY_PATTERN = /\b[A-Z][A-Z0-9]+-\d+/g;

/**
 * Extracts all unique Jira-style issue keys from a text string.
 * Matches patterns like PROJ-123, ABC-1, MYPROJECT-999.
 * Lowercase prefixes (proj-1) are intentionally ignored.
 * Returns a deduplicated array in order of first appearance.
 */
export function extractIssueKeys(text: string): string[] {
  const matches = text.match(ISSUE_KEY_PATTERN) ?? [];
  return [...new Set(matches)];
}
