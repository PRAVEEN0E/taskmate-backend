import type { FastifyPluginAsync } from 'fastify';
import { IntegrationService } from './service.js';

export const integrationRoutes: FastifyPluginAsync<{ integrationService: IntegrationService }> = async (
  app,
  { integrationService },
) => {
  app.get('/search', async (req) => {
    const ownerId = req.principal!.sub;
    const { q } = req.query as { q?: string };
    const data = await integrationService.globalSearch(ownerId, q || '');
    return { data };
  });

  app.get('/backup/export', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const backup = await integrationService.exportFullBackup(ownerId);
    reply.header('Content-Type', 'application/json');
    reply.header(
      'Content-Disposition',
      `attachment; filename="taskmate_backup_${new Date().toISOString().slice(0, 10)}.json"`,
    );
    return backup;
  });
};
