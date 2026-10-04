import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DRY_RUN: z.enum(['true', 'false']).default('true'),
  NOTION_TOKEN: z.string().default(''),
  NOTION_DATA_SOURCE_ID: z.uuid().default('3b1f73c4-d13e-4f4e-b5d8-d6a038e9ec99'),
  NOTION_API_VERSION: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default('2022-06-28'),
  TIMEZONE: z.literal('America/Sao_Paulo').default('America/Sao_Paulo'),
  DATA_DIR: z.string().min(1).default('./data'),
  DATABASE_PATH: z.string().min(1).default('./data/linkedin-monitor.sqlite'),
  LINKEDIN_ANALYTICS_ENABLED: z.enum(['true', 'false']).default('false'),
  LINKEDIN_CLIENT_ID: z.string().default(''),
  LINKEDIN_CLIENT_SECRET: z.string().default(''),
  LINKEDIN_REDIRECT_URI: z.string().default('http://localhost:3000/auth/linkedin/callback'),
  LINKEDIN_API_VERSION: z.preprocess(v => (v === '' ? undefined : v), z.string().regex(/^\d{6}$/).default('202501')),
  API_PORT: z.coerce.number().int().min(1024).max(65535).default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH: z.string().default(''),
  GOOGLE_DRIVE_FOLDER_ID: z.string().default(''),
});

export function loadEnv(source: NodeJS.ProcessEnv = process.env, requireToken = true) {
  const result = schema.safeParse(source);
  // Não incluir valores de entrada ou o objeto ZodError em logs.
  if (!result.success) throw new Error(`ENV_INVALID: ${result.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const env = result.data;
  if (requireToken && !env.NOTION_TOKEN.trim()) throw new Error('NOTION_TOKEN_REQUIRED');
  return env;
}
