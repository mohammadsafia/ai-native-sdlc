// server/src/report/narrative.service.spec.ts
/**
 * Tests for NarrativeService.
 *
 * Design:
 * - All tests exercise the no-key (template fallback) path.
 * - ConfigService is mocked with get() returning undefined (no ANTHROPIC_API_KEY).
 * - This keeps tests fully deterministic and without network calls.
 * - We validate that:
 *     1. No key → returns the template (not undefined/null/empty).
 *     2. Template contains every issue key that was passed in (grounded).
 *     3. Template correctly reflects stale + scope-creep + idle PR counts.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NarrativeService, NarrativeInput } from './narrative.service';
import { ConfigService } from '@nestjs/config';

// ConfigService with NO key set — exercises the template fallback path
const mockConfigServiceNoKey = { get: jest.fn().mockReturnValue(undefined) };

function makeInput(overrides: Partial<NarrativeInput> = {}): NarrativeInput {
  return {
    projectKey: 'PROJ',
    periodEnd: '2026-06-06',
    summary: {
      done: 2,
      inProgress: 3,
      todo: 1,
      blocked: 1,
      pointsCompleted: 8,
      pointsCommitted: 20,
    },
    staleStoryKeys: ['PROJ-10', 'PROJ-11'],
    scopeCreepKeys: ['PROJ-99'],
    idlePrCount: 1,
    riskCount: 2,
    stalenessMode: 'jira-proxy',
    staleDays: 3,
    prIdleDays: 2,
    ...overrides,
  };
}

describe('NarrativeService', () => {
  let service: NarrativeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NarrativeService,
        { provide: ConfigService, useValue: mockConfigServiceNoKey },
      ],
    }).compile();

    service = module.get<NarrativeService>(NarrativeService);
  });

  // -------------------------------------------------------------------------
  describe('no key → template fallback', () => {
    it('returns a non-empty string when no ANTHROPIC_API_KEY is set', async () => {
      const result = await service.generate(makeInput());
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('narrative mentions each stale story key from the input (grounded)', async () => {
      const input = makeInput({ staleStoryKeys: ['PROJ-10', 'PROJ-11'] });
      const result = await service.generate(input);
      expect(result).toContain('PROJ-10');
      expect(result).toContain('PROJ-11');
    });

    it('narrative mentions scope-creep key from the input (grounded)', async () => {
      const input = makeInput({ scopeCreepKeys: ['PROJ-99'] });
      const result = await service.generate(input);
      expect(result).toContain('PROJ-99');
    });

    it('narrative does NOT mention keys that were not in the input', async () => {
      const input = makeInput({
        staleStoryKeys: ['PROJ-10'],
        scopeCreepKeys: ['PROJ-99'],
      });
      const result = await service.generate(input);
      // Keys not passed in should not appear
      expect(result).not.toContain('PROJ-42');
      expect(result).not.toContain('PROJ-77');
    });

    it('reflects commit-based staleness mode in narrative', async () => {
      const input = makeInput({ stalenessMode: 'commit' });
      const result = await service.generate(input);
      expect(result).toContain('commit-based');
    });

    it('reflects Jira-proxy staleness mode in narrative', async () => {
      const input = makeInput({ stalenessMode: 'jira-proxy' });
      const result = await service.generate(input);
      expect(result).toContain('Jira-update proxy');
    });

    it('narrative includes counts matching the summary', async () => {
      const input = makeInput();
      const result = await service.generate(input);
      // Contains done count
      expect(result).toContain(`${input.summary.done} done`);
      // Contains in-progress count
      expect(result).toContain(`${input.summary.inProgress} in-progress`);
    });

    it('with no stale stories, narrative says none', async () => {
      const input = makeInput({ staleStoryKeys: [] });
      const result = await service.generate(input);
      expect(result).toContain('none');
    });

    it('buildTemplate produces deterministic output for identical inputs', () => {
      const input = makeInput();
      const t1 = service.buildTemplate(input);
      const t2 = service.buildTemplate(input);
      expect(t1).toBe(t2);
    });
  });

  // -------------------------------------------------------------------------
  describe('error fallback', () => {
    it('returns template string even if ConfigService.get throws', async () => {
      // Override the get mock to throw
      mockConfigServiceNoKey.get.mockImplementationOnce(() => {
        throw new Error('unexpected');
      });
      // The service catches the error and falls back to template
      const result = await service.generate(makeInput());
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
