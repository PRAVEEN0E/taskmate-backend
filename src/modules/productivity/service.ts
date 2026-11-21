import type { PrismaClient } from '../../generated/prisma/client.js';
import { HttpError } from '../../utils/errors.js';
import { z } from 'zod';

export const createFocusSessionSchema = z.object({
  taskId: z.string().uuid().optional(),
  durationSeconds: z.number().int().min(60),
  completed: z.boolean().default(true),
  notes: z.string().default(''),
});

export const createHabitSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#10b981'),
});

export const toggleHabitLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const createGoalSchema = z.object({
  title: z.string().trim().min(1).max(150),
  description: z.string().default(''),
  targetAt: z.string().datetime().nullable().optional(),
  milestones: z.array(z.string().trim().min(1)).optional(),
});

export class ProductivityService {
  constructor(private prisma: PrismaClient) {}

  // 1. Focus Sessions
  async listFocusSessions(ownerId: string) {
    return this.prisma.focusSession.findMany({
      where: { ownerId },
      include: { task: { select: { id: true, title: true } } },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  }

  async recordFocusSession(ownerId: string, input: z.infer<typeof createFocusSessionSchema>) {
    return this.prisma.focusSession.create({
      data: {
        ...input,
        ownerId,
        startedAt: new Date(),
      },
    });
  }

  // 2. Habits
  async listHabits(ownerId: string) {
    return this.prisma.habit.findMany({
      where: { ownerId, archived: false },
      include: {
        logs: {
          orderBy: { date: 'desc' },
          take: 30,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createHabit(ownerId: string, input: z.infer<typeof createHabitSchema>) {
    return this.prisma.habit.create({
      data: { ...input, ownerId },
    });
  }

  async toggleHabitLog(ownerId: string, habitId: string, date: string) {
    const existing = await this.prisma.habitLog.findUnique({
      where: { habitId_date: { habitId, date } },
    });

    if (existing) {
      await this.prisma.habitLog.delete({ where: { id: existing.id } });
      return { completed: false, date };
    } else {
      await this.prisma.habitLog.create({
        data: { habitId, ownerId, date },
      });
      return { completed: true, date };
    }
  }

  async deleteHabit(ownerId: string, id: string) {
    const habit = await this.prisma.habit.findFirst({ where: { id, ownerId } });
    if (!habit) throw new HttpError(404, 'NOT_FOUND', 'Habit not found');
    return this.prisma.habit.delete({ where: { id } });
  }

  // 3. Goals
  async listGoals(ownerId: string) {
    return this.prisma.goal.findMany({
      where: { ownerId },
      include: {
        milestones: { orderBy: { createdAt: 'asc' } },
        tasks: { select: { id: true, title: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createGoal(ownerId: string, input: z.infer<typeof createGoalSchema>) {
    const { milestones, targetAt, ...rest } = input;
    return this.prisma.goal.create({
      data: {
        ...rest,
        targetAt: targetAt ? new Date(targetAt) : null,
        ownerId,
        milestones: milestones && milestones.length > 0 ? {
          create: milestones.map((title) => ({
            title,
            ownerId,
          })),
        } : undefined,
      },
      include: { milestones: true },
    });
  }

  async toggleMilestone(ownerId: string, goalId: string, milestoneId: string) {
    const ms = await this.prisma.goalMilestone.findFirst({
      where: { id: milestoneId, goalId, ownerId },
    });
    if (!ms) throw new HttpError(404, 'NOT_FOUND', 'Milestone not found');

    return this.prisma.goalMilestone.update({
      where: { id: milestoneId },
      data: { completed: !ms.completed },
    });
  }

  async deleteGoal(ownerId: string, id: string) {
    const goal = await this.prisma.goal.findFirst({ where: { id, ownerId } });
    if (!goal) throw new HttpError(404, 'NOT_FOUND', 'Goal not found');
    return this.prisma.goal.delete({ where: { id } });
  }

  // 4. Productivity Analytics
  async getAnalytics(ownerId: string) {
    const [totalTasks, completedTasks, focusSessions, habitCount] = await Promise.all([
      this.prisma.task.count({ where: { ownerId } }),
      this.prisma.task.count({ where: { ownerId, status: 'COMPLETED' } }),
      this.prisma.focusSession.findMany({
        where: { ownerId },
        select: { durationSeconds: true, startedAt: true },
      }),
      this.prisma.habit.count({ where: { ownerId, archived: false } }),
    ]);

    const totalFocusMinutes = Math.round(
      focusSessions.reduce((acc: number, curr: any) => acc + curr.durationSeconds, 0) / 60,
    );

    return {
      taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      totalTasks,
      completedTasks,
      totalFocusMinutes,
      activeHabits: habitCount,
      recentSessionsCount: focusSessions.length,
    };
  }
}
