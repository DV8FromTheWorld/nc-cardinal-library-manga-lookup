// Dynamic driver selection based on NODE_ENV.
// Local dev uses SQLite, production (Railway) uses Postgres.

const isProduction = process.env.NODE_ENV === 'production';

const { db } = isProduction ? await import('./index.railway.js') : await import('./index.local.js');

export { db };
