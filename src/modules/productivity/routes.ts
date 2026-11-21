import type { FastifyPluginAsync } from 'fastify';
import {
  ProductivityService,
  createFocusSessionSchema,
  createHabitSchema,
  toggleHabitLogSchema,
  createGoalSchema,
} from './service.js';

export const productivityRoutes: FastifyPluginAsync<{ productivityService: ProductivityService }> = async (
  app,
  { productivityService },
) => {
  // Focus sessions
  app.get('/focus-sessions', async (req) => {
    const ownerId = req.principal!.sub;
    const data = await productivityService.listFocusSessions(ownerId);
    return { data };
  });

  app.post('/focus-sessions', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const body = createFocusSessionSchema.parse(req.body);
    const data = await productivityService.recordFocusSession(ownerId, body);
    reply.status(201);
    return { data };
  });

  // Habits
  app.get('/habits', async (req) => {
    const ownerId = req.principal!.sub;
    const data = await productivityService.listHabits(ownerId);
    return { data };
  });

  app.post('/habits', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const body = createHabitSchema.parse(req.body);
    const data = await productivityService.createHabit(ownerId, body);
    reply.status(201);
    return { data };
  });

  app.post('/habits/:id/toggle', async (req) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const body = toggleHabitLogSchema.parse(req.body);
    const data = await productivityService.toggleHabitLog(ownerId, id, body.date);
    return { data };
  });

  app.delete('/habits/:id', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    await productivityService.deleteHabit(ownerId, id);
    reply.status(204);
  });

  // Goals
  app.get('/goals', async (req) => {
    const ownerId = req.principal!.sub;
    const data = await productivityService.listGoals(ownerId);
    return { data };
  });

  app.post('/goals', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const body = createGoalSchema.parse(req.body);
    const data = await productivityService.createGoal(ownerId, body);
    reply.status(201);
    return { data };
  });

  app.post('/goals/:goalId/milestones/:milestoneId/toggle', async (req) => {
    const ownerId = req.principal!.sub;
    const { goalId, milestoneId } = req.params as { goalId: string; milestoneId: string };
    const data = await productivityService.toggleMilestone(ownerId, goalId, milestoneId);
    return { data };
  });

  app.delete('/goals/:id', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    await productivityService.deleteGoal(ownerId, id);
    reply.status(204);
  });

  // Analytics
  app.get('/analytics', async (req) => {
    const ownerId = req.principal!.sub;
    const data = await productivityService.getAnalytics(ownerId);
    return { data };
  });
};
