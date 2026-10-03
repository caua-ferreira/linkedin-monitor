import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';

export function createLogger(directory: string, level = 'info') {
  mkdirSync(directory, { recursive: true });
  return pino({
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: ['token', 'access_token', 'refresh_token', 'client_secret', 'NOTION_TOKEN', 'headers', 'req.headers', 'env'], censor: '[REDACTED]' },
  }, pino.multistream([
    { stream: process.stdout },
    { stream: pino.destination({ dest: join(directory, 'automation.jsonl'), sync: true }) },
  ]));
}
