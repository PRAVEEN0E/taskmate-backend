import type { FastifyPluginAsync } from 'fastify';
import { AIService } from './service.js';
import { z } from 'zod';

const sendMessageSchema = z.object({
  content: z.string().trim().min(1),
});

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
});

const proposeSchema = z.object({
  actionType: z.enum(['CREATE_TASK', 'DAILY_PLAN', 'TASK_BREAKDOWN']),
  prompt: z.string().trim().min(1),
});

export const aiRoutes: FastifyPluginAsync<{ aiService: AIService }> = async (app, { aiService }) => {
  app.get('/ai/conversations', async (req) => {
    const ownerId = req.principal!.sub;
    const data = await aiService.listConversations(ownerId);
    return { data };
  });

  app.post('/ai/conversations', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const body = createConversationSchema.parse(req.body || {});
    const data = await aiService.createConversation(ownerId, body.title);
    reply.status(201);
    return { data };
  });

  app.get('/ai/conversations/:id/messages', async (req) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const data = await aiService.getMessages(ownerId, id);
    return { data };
  });

  app.post('/ai/conversations/:id/messages', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const body = sendMessageSchema.parse(req.body);
    const data = await aiService.sendMessage(ownerId, id, body.content);
    reply.status(201);
    return { data };
  });

  app.post('/ai/proposals', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const body = proposeSchema.parse(req.body);
    const data = await aiService.createProposal(ownerId, body.actionType, body.prompt);
    reply.status(201);
    return { data };
  });

  app.post('/ai/proposals/:id/confirm', async (req) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const data = await aiService.confirmProposal(ownerId, id);
    return { data };
  });
};
