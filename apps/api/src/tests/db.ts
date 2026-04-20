/**
 * Test database helper.
 *
 * Creates an in-memory SQLite database with all migrations applied.
 * Each test file gets its own isolated DB — no state leaks between files.
 *
 * Usage in test files:
 *   import { createTestDb, type TestDb } from '../../../tests/db.js';
 *
 *   let db: TestDb;
 *   beforeEach(() => { db = createTestDb(); });
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from '../db/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = join(__dirname, '../../drizzle');

export function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  return db;
}

export type TestDb = ReturnType<typeof createTestDb>;
