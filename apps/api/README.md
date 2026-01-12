# @repo/api

Fastify API server for NC Cardinal Manga lookup.

## Tech Stack

- Fastify 5
- TypeScript
- Zod validation (via fastify-type-provider-zod)
- Shared schemas from `@repo/shared`

## Development

```bash
# From monorepo root
pnpm dev --filter=@repo/api

# Or from this directory
pnpm dev
```

Runs at http://localhost:3001

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm build` | Compile TypeScript |
| `pnpm start` | Run compiled code |
| `pnpm typecheck` | TypeScript check |

## Project Structure

```
src/
├── index.ts            # Server entry point
└── routes/
    └── users.ts        # Example routes (placeholder)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/users` | List users (example) |
| GET | `/users/:id` | Get user by ID (example) |
| POST | `/users` | Create user (example) |

## Validation

Routes use Zod schemas from `@repo/shared` for request/response validation:

```typescript
import { UserSchema } from '@repo/shared';

app.post('/users', {
  schema: {
    body: UserSchema,
  },
}, async (request) => {
  // request.body is typed and validated
});
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3001 |
