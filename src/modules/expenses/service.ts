import type { PrismaClient } from '../../generated/prisma/client.js';
import { HttpError } from '../../utils/errors.js';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';

export const createExpenseCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f43f5e'),
});

export const createTransactionSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  kind: z.enum(['INCOME', 'EXPENSE']),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid currency amount'),
  currency: z.string().length(3).default('INR'),
  method: z.string().default('UPI'),
  memo: z.string().default(''),
  date: z.string().datetime(),
});

export const setBudgetSchema = z.object({
  categoryId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3).default('INR'),
});

export class ExpenseService {
  constructor(private prisma: PrismaClient) {}

  async listCategories(ownerId: string) {
    return this.prisma.expenseCategory.findMany({
      where: { ownerId },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(ownerId: string, input: z.infer<typeof createExpenseCategorySchema>) {
    return this.prisma.expenseCategory.create({
      data: { ...input, ownerId },
    });
  }

  async listTransactions(ownerId: string, month?: string) {
    const where: any = { ownerId };
    if (month) {
      const start = new Date(`${month}-01T00:00:00.000Z`);
      const [year, m] = month.split('-').map(Number);
      const end = new Date(Date.UTC(year, m, 1, 0, 0, 0, 0));
      where.date = { gte: start, lt: end };
    }

    return this.prisma.expenseTransaction.findMany({
      where,
      include: { category: true },
      orderBy: { date: 'desc' },
      take: 100,
    });
  }

  async createTransaction(ownerId: string, input: z.infer<typeof createTransactionSchema>) {
    return this.prisma.expenseTransaction.create({
      data: {
        ownerId,
        categoryId: input.categoryId,
        kind: input.kind,
        amount: new Prisma.Decimal(input.amount),
        currency: input.currency,
        method: input.method,
        memo: input.memo,
        date: new Date(input.date),
      },
      include: { category: true },
    });
  }

  async deleteTransaction(ownerId: string, id: string) {
    const tx = await this.prisma.expenseTransaction.findFirst({ where: { id, ownerId } });
    if (!tx) throw new HttpError(404, 'NOT_FOUND', 'Transaction not found');
    return this.prisma.expenseTransaction.delete({ where: { id } });
  }

  async listBudgets(ownerId: string, month: string) {
    return this.prisma.budget.findMany({
      where: { ownerId, month },
      include: { category: true },
    });
  }

  async setBudget(ownerId: string, input: z.infer<typeof setBudgetSchema>) {
    return this.prisma.budget.upsert({
      where: {
        ownerId_categoryId_month_currency: {
          ownerId,
          categoryId: input.categoryId,
          month: input.month,
          currency: input.currency,
        },
      },
      create: {
        ownerId,
        categoryId: input.categoryId,
        month: input.month,
        amount: new Prisma.Decimal(input.amount),
        currency: input.currency,
      },
      update: {
        amount: new Prisma.Decimal(input.amount),
      },
      include: { category: true },
    });
  }

  async exportCsv(ownerId: string) {
    const txs = await this.prisma.expenseTransaction.findMany({
      where: { ownerId },
      include: { category: true },
      orderBy: { date: 'desc' },
    });

    const headers = ['Date', 'Kind', 'Category', 'Amount', 'Currency', 'Method', 'Memo'];
    const rows = txs.map((tx: any) => [
      tx.date.toISOString(),
      tx.kind,
      `"${tx.category?.name || 'Uncategorized'}"`,
      tx.amount.toString(),
      tx.currency,
      tx.method,
      `"${tx.memo.replace(/"/g, '""')}"`,
    ]);

    return [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
  }
}
