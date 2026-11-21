import type { FastifyInstance } from 'fastify';
import type { DashboardService } from './service.js';
export function dashboardRoutes(app: FastifyInstance, service: DashboardService) {
  app.get(
    '/api/v1/dashboard',
    {
      schema: {
        tags: ['Dashboard'],
        summary: 'Owner-scoped dashboard aggregates',
        security: [{ cookieAuth: [] }],
      },
    },
    async (req) => ({ data: await service.summary(req.principal!.sub) }),
  );
}
