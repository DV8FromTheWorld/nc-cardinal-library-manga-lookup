import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { userRoutes } from './routes/users.js';
import { mangaRoutes } from './routes/manga.js';

const app = Fastify({
  logger: true,
}).withTypeProvider<ZodTypeProvider>();

// Enable CORS for web app
app.register(cors, {
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
});

// Set up Zod validation
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

// Health check
app.get('/health', async () => {
  return { status: 'ok' };
});

// Register routes
app.register(userRoutes, { prefix: '/users' });
app.register(mangaRoutes, { prefix: '/manga' });

// Start server
const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001;
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`API running at http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
