import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { NotificationsService } from './service.js';
export function notificationRoutes(app: FastifyInstance, service: NotificationsService) {
  app.get(
    '/api/v1/notifications',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Latest 50 owner notifications',
        security: [{ cookieAuth: [] }],
      },
    },
    async (req) => ({ data: await service.list(req.principal!.sub) }),
  );
  app.patch(
    '/api/v1/notifications/:id',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Mark a notification read or unread',
        security: [{ cookieAuth: [] }],
      },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(req.params);
      const { read } = z.object({ read: z.boolean() }).strict().parse(req.body);
      await service.mark(req.principal!.sub, id, read);
      return reply.code(204).send();
    },
  );
}
