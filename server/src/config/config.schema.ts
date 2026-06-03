import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  JIRA_BASE_URL: z
    .string()
    .refine(
      (val) => val === '' || /^https?:\/\/.+/.test(val),
      'JIRA_BASE_URL must be a valid URL (e.g. https://yourcompany.atlassian.net)',
    )
    .optional()
    .default(''),
  JIRA_EMAIL: z.string().optional().default(''),
  JIRA_API_TOKEN: z.string().optional().default(''),
  JIRA_PROJECT_KEYS: z.string().optional().default(''),
  BITBUCKET_WORKSPACE: z.string().optional().default(''),
  BITBUCKET_USERNAME: z.string().optional().default(''),
  BITBUCKET_APP_PASSWORD: z.string().optional().default(''),
  BITBUCKET_REPOS: z.string().optional().default(''),
  PORT: z
    .string()
    .optional()
    .default('3001')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const missingOrInvalid = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `\n[Config] Environment validation failed. Fix the following:\n${missingOrInvalid}\n\nCopy server/.env.example to server/.env and fill in the required values.`,
    );
  }

  return result.data;
}
