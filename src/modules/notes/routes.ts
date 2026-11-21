import type { FastifyPluginAsync } from 'fastify';
import { NoteService } from './service.js';
import { createNoteSchema, updateNoteSchema, noteQuerySchema, createNoteFolderSchema } from './schemas.js';

export const noteRoutes: FastifyPluginAsync<{ noteService: NoteService }> = async (app, { noteService }) => {
  app.get('/notes', async (req) => {
    const ownerId = req.principal!.sub;
    const query = noteQuerySchema.parse(req.query);
    const data = await noteService.list(ownerId, query);
    return { data };
  });

  app.post('/notes', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const body = createNoteSchema.parse(req.body);
    const data = await noteService.create(ownerId, body);
    reply.status(201);
    return { data };
  });

  app.get('/notes/:id', async (req) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const data = await noteService.getById(ownerId, id);
    return { data };
  });

  app.patch('/notes/:id', async (req) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const body = updateNoteSchema.parse(req.body);
    const data = await noteService.update(ownerId, id, body);
    return { data };
  });

  app.delete('/notes/:id', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    await noteService.delete(ownerId, id);
    reply.status(204);
  });

  app.get('/note-folders', async (req) => {
    const ownerId = req.principal!.sub;
    const data = await noteService.listFolders(ownerId);
    return { data };
  });

  app.post('/note-folders', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const body = createNoteFolderSchema.parse(req.body);
    const data = await noteService.createFolder(ownerId, body);
    reply.status(201);
    return { data };
  });

  app.delete('/note-folders/:id', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    await noteService.deleteFolder(ownerId, id);
    reply.status(204);
  });
};
