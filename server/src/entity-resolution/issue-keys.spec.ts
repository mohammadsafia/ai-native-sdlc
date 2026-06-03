// server/src/entity-resolution/issue-keys.spec.ts
import { extractIssueKeys } from './issue-keys';

describe('extractIssueKeys', () => {
  it('extracts a single issue key from a commit message', () => {
    expect(extractIssueKeys('fix: resolve PROJ-123 null pointer')).toEqual(['PROJ-123']);
  });

  it('extracts multiple distinct keys', () => {
    const keys = extractIssueKeys('PROJ-1 and ABC-99: related work');
    expect(keys).toContain('PROJ-1');
    expect(keys).toContain('ABC-99');
    expect(keys).toHaveLength(2);
  });

  it('deduplicates repeated keys', () => {
    expect(extractIssueKeys('PROJ-1 PROJ-1 PROJ-1')).toEqual(['PROJ-1']);
  });

  it('returns empty array when no keys present', () => {
    expect(extractIssueKeys('refactor: tidy up code')).toEqual([]);
  });

  it('ignores lowercase project prefixes', () => {
    expect(extractIssueKeys('proj-1 fix something')).toEqual([]);
  });

  it('extracts keys from branch names like feature/PROJ-42-my-feature', () => {
    expect(extractIssueKeys('feature/PROJ-42-my-feature')).toEqual(['PROJ-42']);
  });

  it('handles empty string', () => {
    expect(extractIssueKeys('')).toEqual([]);
  });

  it('extracts keys with multi-char project prefix', () => {
    expect(extractIssueKeys('AB-1 and ABCDEF-999')).toContain('ABCDEF-999');
  });
});
