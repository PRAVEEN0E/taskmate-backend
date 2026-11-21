import type { FastifyPluginAsync } from 'fastify';
import {
  ExpenseService,
  createExpenseCategorySchema,
  createTransactionSchema,
  setBudgetSchema,
} from './service.js';
import { z } from 'zod';

export const expenseRoutes: FastifyPluginAsync<{ expenseService: ExpenseService }> = async (app, { expenseService }) => {
  app.get('/expense-categories', async (req) => {
    const ownerId = req.principal!.sub;
    const data = await expenseService.listCategories(ownerId);
    return { data };
  });

  app.post('/expense-categories', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const body = createExpenseCategorySchema.parse(req.body);
    const data = await expenseService.createCategory(ownerId, body);
    reply.status(201);
    return { data };
  });

  app.get('/expenses', async (req) => {
    const ownerId = req.principal!.sub;
    const { month } = req.query as { month?: string };
    const data = await expenseService.listTransactions(ownerId, month);
    return { data };
  });

  app.post('/expenses', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const body = createTransactionSchema.parse(req.body);
    const data = await expenseService.createTransaction(ownerId, body);
    reply.status(201);
    return { data };
  });

  app.delete('/expenses/:id', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    await expenseService.deleteTransaction(ownerId, id);
    reply.status(204);
  });

  app.get('/budgets', async (req) => {
    const ownerId = req.principal!.sub;
    const { month } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(req.query);
    const data = await expenseService.listBudgets(ownerId, month);
    return { data };
  });

  app.post('/budgets', async (req) => {
    const ownerId = req.principal!.sub;
    const body = setBudgetSchema.parse(req.body);
    const data = await expenseService.setBudget(ownerId, body);
    return { data };
  });

  app.get('/expenses/export.csv', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const csv = await expenseService.exportCsv(ownerId);
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="taskmate_expenses.csv"');
    return csv;
  });
};
