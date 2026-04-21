/**
 * Railway production database driver (Postgres).
 *
 * Connects via DATABASE_URL environment variable provided by Railway's
 * Postgres service. Migrations are run via `drizzle-kit migrate` in
 * Railway's pre-deploy command, not on startup.
 */

import { drizzle } from 'drizzle-orm/node-postgres';

import * as schema from './schema.js';

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl == null) {
  throw new Error('DATABASE_URL environment variable is required in production');
}

export const db = drizzle(databaseUrl, { schema });
