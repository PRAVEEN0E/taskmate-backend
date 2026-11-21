import type { FastifyPluginAsync } from 'fastify';
import { FileService } from './service.js';
import { z } from 'zod';

const recordUploadSchema = z.object({
  name: z.string().trim().min(1),
  publicId: z.string().min(1),
  url: z.string().url(),
  resourceType: z.string().default('raw'),
  mimeType: z.string().default('application/octet-stream'),
  bytes: z.number().nonnegative(),
  folderId: z.string().uuid().optional(),
});

export const fileRoutes: FastifyPluginAsync<{ fileService: FileService }> = async (app, { fileService }) => {
  app.get('/files', async (req) => {
    const ownerId = req.principal!.sub;
    const { folderId } = req.query as { folderId?: string };
    const data = await fileService.listFiles(ownerId, folderId);
    return { data };
  });

  app.post('/files', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const body = recordUploadSchema.parse(req.body);
    const data = await fileService.recordUpload(ownerId, body);
    reply.status(201);
    return { data };
  });

  app.delete('/files/:id', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    await fileService.deleteFile(ownerId, id);
    reply.status(204);
  });

  app.get('/files/storage', async (req) => {
    const ownerId = req.principal!.sub;
    const data = await fileService.getStorageUsage(ownerId);
    return { data };
  });
};
