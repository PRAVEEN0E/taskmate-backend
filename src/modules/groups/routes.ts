import type { FastifyPluginAsync } from 'fastify';
import { GroupService } from './service.js';
import { z } from 'zod';

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(255).optional(),
});

const joinGroupSchema = z.object({
  code: z.string().trim().min(4).max(20),
});

const createNoteSchema = z.object({
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1),
});

const updateNoteSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  content: z.string().trim().optional(),
  pinned: z.boolean().optional(),
});

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(160),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().uuid().optional(),
  dueAt: z.string().optional(),
});

const updateTaskStatusSchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']),
});

export const groupRoutes: FastifyPluginAsync<{ groupService: GroupService }> = async (
  app,
  { groupService },
) => {
  // 1. List user's groups
  app.get('/groups', async (req) => {
    const userId = req.principal!.sub;
    const data = await groupService.listUserGroups(userId);
    return { data };
  });

  // 2. Create a new group
  app.post('/groups', async (req, reply) => {
    const userId = req.principal!.sub;
    const body = createGroupSchema.parse(req.body);
    const data = await groupService.createGroup(userId, body);
    reply.status(201);
    return { data };
  });

  // 3. Join group via invite code
  app.post('/groups/join', async (req, reply) => {
    const userId = req.principal!.sub;
    const body = joinGroupSchema.parse(req.body);
    const data = await groupService.joinGroupByCode(userId, body.code);
    reply.status(200);
    return { data };
  });

  // 4. Get single group details
  app.get('/groups/:id', async (req) => {
    const userId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const data = await groupService.getGroupDetails(userId, id);
    return { data };
  });

  // ----------------- NOTES -----------------
  app.get('/groups/:id/notes', async (req) => {
    const userId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const data = await groupService.listGroupNotes(userId, id);
    return { data };
  });

  app.post('/groups/:id/notes', async (req, reply) => {
    const userId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const body = createNoteSchema.parse(req.body);
    const data = await groupService.createGroupNote(userId, id, body);
    reply.status(201);
    return { data };
  });

  app.put('/groups/:id/notes/:noteId', async (req) => {
    const userId = req.principal!.sub;
    const { id, noteId } = req.params as { id: string; noteId: string };
    const body = updateNoteSchema.parse(req.body);
    const data = await groupService.updateGroupNote(userId, id, noteId, body);
    return { data };
  });

  app.delete('/groups/:id/notes/:noteId', async (req) => {
    const userId = req.principal!.sub;
    const { id, noteId } = req.params as { id: string; noteId: string };
    const data = await groupService.deleteGroupNote(userId, id, noteId);
    return { data };
  });

  // ----------------- TASKS -----------------
  app.get('/groups/:id/tasks', async (req) => {
    const userId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const data = await groupService.listGroupTasks(userId, id);
    return { data };
  });

  app.post('/groups/:id/tasks', async (req, reply) => {
    const userId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const body = createTaskSchema.parse(req.body);
    const data = await groupService.createGroupTask(userId, id, body);
    reply.status(201);
    return { data };
  });

  app.patch('/groups/:id/tasks/:taskId/status', async (req) => {
    const userId = req.principal!.sub;
    const { id, taskId } = req.params as { id: string; taskId: string };
    const body = updateTaskStatusSchema.parse(req.body);
    const data = await groupService.toggleGroupTaskStatus(userId, id, taskId, body.status);
    return { data };
  });

  app.delete('/groups/:id/tasks/:taskId', async (req) => {
    const userId = req.principal!.sub;
    const { id, taskId } = req.params as { id: string; taskId: string };
    const data = await groupService.deleteGroupTask(userId, id, taskId);
    return { data };
  });

  // ----------------- ACTIVITY -----------------
  app.get('/groups/:id/activity', async (req) => {
    const userId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const data = await groupService.listGroupActivity(userId, id);
    return { data };
  });
};
