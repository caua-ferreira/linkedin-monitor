import { createClient, type Client } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { applyMigrations } from './schema.js';

export type { Client as Db };

export async function openDatabase(pathOrUrl: string, authToken?: string): Promise<Client> {
  const isRemote = /^(libsql|wss?|https?):\/\//.test(pathOrUrl);
  const isMemory = pathOrUrl === ':memory:' || pathOrUrl === 'file::memory:';
  const url = isRemote
    ? pathOrUrl
    : pathOrUrl === ':memory:'
      ? 'file::memory:'
      : pathOrUrl.startsWith('file:')
        ? pathOrUrl
        : `file:${pathOrUrl}`;

  if (!isRemote && !isMemory) {
    const filePath = url.slice('file:'.length);
    mkdirSync(dirname(filePath), { recursive: true });
  }

  const client = createClient({ url, authToken });

  if (!isRemote) {
    await client.execute('PRAGMA journal_mode = WAL');
    await client.execute('PRAGMA foreign_keys = ON');
  }

  await applyMigrations(client);
  return client;
}
