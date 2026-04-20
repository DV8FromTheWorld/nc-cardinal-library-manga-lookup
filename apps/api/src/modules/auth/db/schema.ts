import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  sessionToken: text('session_token').notNull(),
  loggedIn: integer('logged_in', { mode: 'boolean' }).notNull().default(false),
  userId: text('user_id'),
  barcode: text('barcode'),
  displayName: text('display_name'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});
