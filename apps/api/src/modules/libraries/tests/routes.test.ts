import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../../tests/setup.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /manga/libraries', () => {
  it('returns 200 with a list of libraries and a default', async () => {
    const res = await app.inject({ method: 'GET', url: '/manga/libraries' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).toHaveProperty('libraries');
    expect(body).toHaveProperty('defaultLibrary');
    expect(Array.isArray(body.libraries)).toBe(true);
    expect(body.libraries.length).toBeGreaterThan(0);
    expect(typeof body.defaultLibrary).toBe('string');

    const first = body.libraries[0];
    expect(first).toHaveProperty('code');
    expect(first).toHaveProperty('name');
  });
});
