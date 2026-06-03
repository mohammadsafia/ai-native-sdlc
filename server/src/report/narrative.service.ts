// server/src/report/narrative.service.ts
/**
 * NarrativeService — wraps optional LLM narrative generation.
 *
 * - When ANTHROPIC_API_KEY is set: makes one call to Claude claude-haiku-4-5
 *   with the structured report fields, prompt-caches the system prompt,
 *   and returns a 4-6 sentence narrative that cites only facts from the input.
 * - When no key is set (or any error occurs): falls back to the existing
 *   deterministic template string so existing behaviour is unchanged.
 *
 * The service is intentionally import-safe: it only `require`s the SDK if a
 * key is present, so the module loads cleanly in test environments without
 * a real key.
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NarrativeInput {
  projectKey: string;
  periodEnd: string;
  summary: {
    done: number;
    inProgress: number;
    todo: number;
    blocked: number;
    pointsCompleted: number;
    pointsCommitted: number;
  };
  staleStoryKeys: string[];
  scopeCreepKeys: string[];
  idlePrCount: number;
  riskCount: number;
  stalenessMode: 'commit' | 'jira-proxy';
  staleDays: number;
  prIdleDays: number;
}

const SYSTEM_PROMPT =
  'Write a 4-6 sentence status narrative using ONLY the facts in this JSON; cite issue keys; invent nothing.';

@Injectable()
export class NarrativeService {
  constructor(private readonly configService: ConfigService) {}

  async generate(input: NarrativeInput): Promise<string> {
    let apiKey: string | undefined;
    try {
      apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    } catch {
      // ConfigService errors should not crash the report pipeline
    }

    if (apiKey) {
      try {
        return await this.generateWithClaude(input, apiKey);
      } catch {
        // Fallback to template on any error (network, API, etc.)
      }
    }

    return this.buildTemplate(input);
  }

  // ---------------------------------------------------------------------------
  // Claude path
  // ---------------------------------------------------------------------------

  private async generateWithClaude(input: NarrativeInput, apiKey: string): Promise<string> {
    // Dynamic import so the module compiles/loads even when SDK not present
    // (though we added it with `yarn add`, this is a safety measure)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Anthropic = require('@anthropic-ai/sdk').default ?? require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          // Prompt-cache the system prompt so repeated calls within the TTL
          // avoid re-uploading those tokens.
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: JSON.stringify(input, null, 2),
        },
      ],
    });

    // Extract text block
    for (const block of response.content) {
      if (block.type === 'text') {
        return block.text.trim();
      }
    }

    // No text block → fall back to template
    return this.buildTemplate(input);
  }

  // ---------------------------------------------------------------------------
  // Deterministic fallback template (identical to original ReportService text)
  // ---------------------------------------------------------------------------

  buildTemplate(input: NarrativeInput): string {
    const {
      summary,
      staleStoryKeys,
      scopeCreepKeys,
      idlePrCount,
      riskCount,
      stalenessMode,
      staleDays,
      prIdleDays,
    } = input;

    const staleKeys = staleStoryKeys.map((k) => `[[${k}]]`).join(', ') || 'none';
    const creepKeys = scopeCreepKeys.map((k) => `[[${k}]]`).join(', ') || 'none';

    return (
      `Sprint summary: ${summary.done} done, ` +
      `${summary.inProgress} in-progress, ` +
      `${summary.blocked} blocked, ` +
      `${summary.todo} to-do. ` +
      `Points: ${summary.pointsCompleted}/${summary.pointsCommitted} completed. ` +
      `${staleStoryKeys.length} stale story(ies) (${stalenessMode === 'commit' ? 'commit-based' : 'Jira-update proxy'}, ${staleDays}+ days): ${staleKeys}. ` +
      `${scopeCreepKeys.length} scope-creep item(s) added after sprint start: ${creepKeys}. ` +
      `${idlePrCount} idle PR(s) (no update in ${prIdleDays}+ days). ` +
      `${riskCount} risk(s) detected. ` +
      `NOTE: narrative will be Claude-generated once the LLM gateway is wired.`
    );
  }
}
