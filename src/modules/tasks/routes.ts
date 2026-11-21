import type { FastifyPluginAsync } from 'fastify';
import { TaskService } from './service.js';
import {
  createTaskSchema,
  updateTaskSchema,
  taskQuerySchema,
  createSubtaskSchema,
  updateSubtaskSchema,
  createCategorySchema,
  bulkActionSchema,
} from './schemas.js';

export const taskRoutes: FastifyPluginAsync<{ taskService: TaskService }> = async (app, { taskService }) => {
  app.get('/tasks', async (req) => {
    const ownerId = req.principal!.sub;
    const query = taskQuerySchema.parse(req.query);
    const data = await taskService.list(ownerId, query);
    return { data };
  });

  app.post('/tasks', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const body = createTaskSchema.parse(req.body);
    const data = await taskService.create(ownerId, body);
    reply.status(201);
    return { data };
  });

  app.get('/tasks/:id', async (req) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const data = await taskService.getById(ownerId, id);
    return { data };
  });

  app.patch('/tasks/:id', async (req) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const body = updateTaskSchema.parse(req.body);
    const data = await taskService.update(ownerId, id, body);
    return { data };
  });

  app.delete('/tasks/:id', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    await taskService.delete(ownerId, id);
    reply.status(204);
  });

  app.post('/tasks/:id/subtasks', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const body = createSubtaskSchema.parse(req.body);
    const data = await taskService.addSubtask(ownerId, id, body.title);
    reply.status(201);
    return { data };
  });

  app.patch('/tasks/:id/subtasks/:subtaskId', async (req) => {
    const ownerId = req.principal!.sub;
    const { id, subtaskId } = req.params as { id: string; subtaskId: string };
    const body = updateSubtaskSchema.parse(req.body);
    const data = await taskService.updateSubtask(ownerId, id, subtaskId, body);
    return { data };
  });

  app.delete('/tasks/:id/subtasks/:subtaskId', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const { id, subtaskId } = req.params as { id: string; subtaskId: string };
    await taskService.deleteSubtask(ownerId, id, subtaskId);
    reply.status(204);
  });

  app.post('/tasks/bulk', async (req) => {
    const ownerId = req.principal!.sub;
    const body = bulkActionSchema.parse(req.body);
    const result = await taskService.bulkAction(ownerId, body);
    return { data: result };
  });

  app.get('/task-categories', async (req) => {
    const ownerId = req.principal!.sub;
    const data = await taskService.listCategories(ownerId);
    return { data };
  });

  app.post('/task-categories', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const body = createCategorySchema.parse(req.body);
    const data = await taskService.createCategory(ownerId, body);
    reply.status(201);
    return { data };
  });

  app.delete('/task-categories/:id', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    await taskService.deleteCategory(ownerId, id);
    reply.status(204);
  });
};
