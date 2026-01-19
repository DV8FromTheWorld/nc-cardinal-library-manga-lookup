import { UserSchema } from '@repo/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

// Create user request schema (without id, since server generates it)
const CreateUserSchema = UserSchema.omit({ id: true });

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /users - List all users
  app.get('/', async () => {
    // TODO: Replace with actual database query
    return { users: [] };
  });

  // GET /users/:id - Get user by ID
  app.get(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      // TODO: Replace with actual database query
      return reply.status(404).send({ error: 'User not found', id });
    }
  );

  // POST /users - Create a new user
  app.post(
    '/',
    {
      schema: {
        body: CreateUserSchema,
        response: {
          201: UserSchema,
        },
      },
    },
    async (request, reply) => {
      const { email, name } = request.body; // Fully typed!

      // TODO: Replace with actual database insert
      const user = {
        id: crypto.randomUUID(),
        email,
        name,
      };

      return reply.status(201).send(user);
    }
  );
};
