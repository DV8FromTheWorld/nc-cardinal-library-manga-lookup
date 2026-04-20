/**
 * Test helper: builds the Fastify app for integration testing.
 * Uses fastify.inject() so no real ports are opened.
 */

import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { mangaRoutes } from '../routes/manga.js';
import { userRoutes } from '../routes/users.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  }).withTypeProvider<ZodTypeProvider>();

  app.register(cors, { origin: true });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.get('/health', async () => ({ status: 'ok' }));
  app.register(userRoutes, { prefix: '/users' });
  app.register(mangaRoutes, { prefix: '/manga' });

  await app.ready();
  return app;
}
