import { defineConfig } from 'drizzle-kit';

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig(
  isProduction
    ? {
        schema: './src/modules/*/db/schema.ts',
        out: './drizzle',
        dialect: 'postgresql',
        dbCredentials: {
          url: process.env.DATABASE_URL ?? '',
        },
      }
    : {
        schema: './src/modules/*/db/schema.ts',
        out: './drizzle',
        dialect: 'sqlite',
        dbCredentials: {
          url: process.env.DATABASE_URL ?? '.data/manga.db',
        },
      }
);
