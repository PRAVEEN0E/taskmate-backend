import type { FastifyPluginAsync } from 'fastify';
import {
  PersonalService,
  createBookmarkSchema,
  createLearningPathSchema,
  createJournalSchema,
  createProjectSchema,
} from './service.js';
import { z } from 'zod';

export const personalRoutes: FastifyPluginAsync<{ personalService: PersonalService }> = async (app, { personalService }) => {
  // Bookmarks
  app.get('/bookmarks', async (req) => {
    const ownerId = req.principal!.sub;
    const { folderId } = req.query as { folderId?: string };
    const data = await personalService.listBookmarks(ownerId, folderId);
    return { data };
  });

  app.post('/bookmarks', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const body = createBookmarkSchema.parse(req.body);
    const data = await personalService.createBookmark(ownerId, body);
    reply.status(201);
    return { data };
  });

  app.post('/bookmarks/:id/favorite', async (req) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const data = await personalService.toggleBookmarkFavorite(ownerId, id);
    return { data };
  });

  app.delete('/bookmarks/:id', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    await personalService.deleteBookmark(ownerId, id);
    reply.status(204);
  });

  // Learning
  app.get('/learning-paths', async (req) => {
    const ownerId = req.principal!.sub;
    const data = await personalService.listLearningPaths(ownerId);
    return { data };
  });

  app.post('/learning-paths', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const body = createLearningPathSchema.parse(req.body);
    const data = await personalService.createLearningPath(ownerId, body);
    reply.status(201);
    return { data };
  });

  app.post('/learning-paths/:id/topics', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const body = z.object({ title: z.string().trim().min(1) }).parse(req.body);
    const data = await personalService.addLearningTopic(ownerId, id, body.title);
    reply.status(201);
    return { data };
  });

  app.post('/learning-topics/:id/toggle', async (req) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const data = await personalService.toggleTopic(ownerId, id);
    return { data };
  });

  // Journal
  app.get('/journal', async (req) => {
    const ownerId = req.principal!.sub;
    const data = await personalService.listJournal(ownerId);
    return { data };
  });

  app.get('/journal/:date', async (req) => {
    const ownerId = req.principal!.sub;
    const { date } = req.params as { date: string };
    const data = await personalService.getJournalEntry(ownerId, date);
    return { data };
  });

  app.post('/journal', async (req) => {
    const ownerId = req.principal!.sub;
    const body = createJournalSchema.parse(req.body);
    const data = await personalService.saveJournalEntry(ownerId, body);
    return { data };
  });

  // Projects
  app.get('/projects', async (req) => {
    const ownerId = req.principal!.sub;
    const data = await personalService.listProjects(ownerId);
    return { data };
  });

  app.post('/projects', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const body = createProjectSchema.parse(req.body);
    const data = await personalService.createProject(ownerId, body);
    reply.status(201);
    return { data };
  });

  app.patch('/projects/:id/status', async (req) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const body = z.object({ status: z.enum(['PLANNED', 'ACTIVE', 'COMPLETED', 'ARCHIVED']) }).parse(req.body);
    const data = await personalService.updateProjectStatus(ownerId, id, body.status);
    return { data };
  });
};
