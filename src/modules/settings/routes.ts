import type { FastifyInstance } from 'fastify';
import type { AuthStore } from '../auth/types.js';
import { settingsSchema, profileSchema } from '../auth/schemas.js';
export function settingsRoutes(app: FastifyInstance, store: AuthStore) {
  app.get(
    '/api/v1/settings',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Read owner preferences',
        security: [{ cookieAuth: [] }],
      },
    },
    async (req) => ({ data: await store.getSettings(req.principal!.sub) }),
  );
  app.patch(
    '/api/v1/settings',
    {
      schema: { tags: ['Settings'], summary: 'Update preferences', security: [{ cookieAuth: [] }] },
    },
    async (req) => ({
      data: await store.updateSettings(req.principal!.sub, settingsSchema.parse(req.body)),
    }),
  );
  app.patch(
    '/api/v1/profile',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Update display name',
        security: [{ cookieAuth: [] }],
      },
    },
    async (req, reply) => {
      await store.updateProfile(req.principal!.sub, profileSchema.parse(req.body));
      return reply.code(204).send();
    },
  );
}
