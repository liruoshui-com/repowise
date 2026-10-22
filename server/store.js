import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export function openStore(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(resolve(directory, 'repowise.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS subscribers (
      id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', preferences TEXT NOT NULL,
      created_at INTEGER NOT NULL, confirmed_at INTEGER, last_request INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS tokens (
      hash TEXT PRIMARY KEY, subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, expires_at INTEGER NOT NULL, payload TEXT
    );
    CREATE TABLE IF NOT EXISTS feedback (
      subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY(subscriber_id, project_id)
    );
    CREATE TABLE IF NOT EXISTS follows (
      subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL, PRIMARY KEY(subscriber_id, project_id)
    );
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY, subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, issue_id TEXT, recipient TEXT NOT NULL, subject TEXT NOT NULL,
      html TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
      created_at INTEGER NOT NULL, sent_at INTEGER, error TEXT, attempts INTEGER NOT NULL DEFAULT 0,
      UNIQUE(subscriber_id, issue_id)
    );
    CREATE TABLE IF NOT EXISTS publications (issue_id TEXT PRIMARY KEY, approved_at INTEGER NOT NULL, content_hash TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS tokens_subscriber ON tokens(subscriber_id);
  `);
  return db;
}
