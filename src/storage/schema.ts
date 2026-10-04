import type { Client } from '@libsql/client';

export async function applyMigrations(db: Client): Promise<void> {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS linkedin_tokens (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      member_urn TEXT,
      access_token TEXT NOT NULL,
      access_token_expires_at TEXT NOT NULL,
      refresh_token TEXT,
      refresh_token_expires_at TEXT,
      authorized_scopes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS publications (
      id TEXT PRIMARY KEY,
      notion_page_id TEXT NOT NULL UNIQUE,
      idempotency_key TEXT NOT NULL UNIQUE,
      operational_state TEXT NOT NULL,
      scheduled_at TEXT,
      linkedin_post_urn TEXT,
      linkedin_post_url TEXT,
      published_at TEXT,
      error_code TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_snapshots (
      id TEXT PRIMARY KEY,
      notion_page_id TEXT NOT NULL,
      linkedin_post_urn TEXT,
      checkpoint TEXT,
      captured_at TEXT NOT NULL,
      post_age_minutes INTEGER,
      impressions INTEGER,
      reach INTEGER,
      reactions INTEGER,
      comments INTEGER,
      shares INTEGER,
      saves INTEGER,
      sends INTEGER,
      profile_views INTEGER,
      followers_gained INTEGER,
      link_clicks INTEGER,
      premium_cta_clicks INTEGER,
      source TEXT NOT NULL,
      raw_payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drive_processed_files (
      drive_file_id TEXT PRIMARY KEY,
      processed_at TEXT NOT NULL
    );
  `);
}
