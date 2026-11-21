import type { PrismaClient } from '../../generated/prisma/client.js';
import { HttpError } from '../../utils/errors.js';
import type { z } from 'zod';
import type { createTaskSchema, updateTaskSchema, taskQuerySchema, bulkActionSchema } from './schemas.js';

export class TaskService {
  constructor(private prisma: PrismaClient) {}

  async list(ownerId: string, query: z.infer<typeof taskQuerySchema>) {
    const where: any = { ownerId };
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.projectId) where.projectId = query.projectId;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.task.findMany({
      where,
      include: {
        category: true,
        subtasks: { orderBy: { position: 'asc' } },
        project: { select: { id: true, title: true } },
      },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      take: query.limit,
    });
  }

  async getById(ownerId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, ownerId },
      include: {
        category: true,
        subtasks: { orderBy: { position: 'asc' } },
        project: { select: { id: true, title: true } },
      },
    });
    if (!task) throw new HttpError(404, 'NOT_FOUND', 'Task not found');
    return task;
  }

  async create(ownerId: string, input: z.infer<typeof createTaskSchema>) {
    const { subtasks, dueAt, ...rest } = input;
    return this.prisma.task.create({
      data: {
        ...rest,
        dueAt: dueAt ? new Date(dueAt) : null,
        ownerId,
        subtasks: subtasks && subtasks.length > 0 ? {
          create: subtasks.map((title, idx) => ({
            title,
            position: idx,
            ownerId,
          })),
        } : undefined,
      },
      include: {
        category: true,
        subtasks: { orderBy: { position: 'asc' } },
      },
    });
  }

  async update(ownerId: string, id: string, input: z.infer<typeof updateTaskSchema>) {
    await this.getById(ownerId, id);
    const { dueAt, completed, ...rest } = input;
    const data: any = { ...rest };
    if (dueAt !== undefined) data.dueAt = dueAt ? new Date(dueAt) : null;
    if (completed !== undefined) {
      data.status = completed ? 'COMPLETED' : 'TODO';
      data.completedAt = completed ? new Date() : null;
    } else if (input.status) {
      data.completedAt = input.status === 'COMPLETED' ? new Date() : null;
    }

    return this.prisma.task.update({
      where: { id },
      data,
      include: {
        category: true,
        subtasks: { orderBy: { position: 'asc' } },
      },
    });
  }

  async delete(ownerId: string, id: string) {
    await this.getById(ownerId, id);
    return this.prisma.task.delete({ where: { id } });
  }

  async addSubtask(ownerId: string, taskId: string, title: string) {
    await this.getById(ownerId, taskId);
    const count = await this.prisma.subtask.count({ where: { taskId } });
    return this.prisma.subtask.create({
      data: {
        taskId,
        ownerId,
        title,
        position: count,
      },
    });
  }

  async updateSubtask(ownerId: string, taskId: string, subtaskId: string, input: { title?: string; completed?: boolean; position?: number }) {
    await this.getById(ownerId, taskId);
    return this.prisma.subtask.update({
      where: { id: subtaskId },
      data: input,
    });
  }

  async deleteSubtask(ownerId: string, taskId: string, subtaskId: string) {
    await this.getById(ownerId, taskId);
    return this.prisma.subtask.delete({ where: { id: subtaskId } });
  }

  async bulkAction(ownerId: string, input: z.infer<typeof bulkActionSchema>) {
    const { taskIds, action } = input;
    if (action === 'DELETE') {
      return this.prisma.task.deleteMany({
        where: { id: { in: taskIds }, ownerId },
      });
    }
    const statusMap = {
      COMPLETE: { status: 'COMPLETED' as const, completedAt: new Date() },
      SET_TODO: { status: 'TODO' as const, completedAt: null },
      SET_IN_PROGRESS: { status: 'IN_PROGRESS' as const, completedAt: null },
    };
    return this.prisma.task.updateMany({
      where: { id: { in: taskIds }, ownerId },
      data: statusMap[action],
    });
  }

  async listCategories(ownerId: string) {
    return this.prisma.taskCategory.findMany({
      where: { ownerId },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(ownerId: string, input: { name: string; color: string }) {
    return this.prisma.taskCategory.create({
      data: { ...input, ownerId },
    });
  }

  async deleteCategory(ownerId: string, id: string) {
    return this.prisma.taskCategory.deleteMany({
      where: { id, ownerId },
    });
  }
}
