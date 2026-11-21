import type { PrismaClient } from '../../generated/prisma/client.js';

export class IntegrationService {
  constructor(private prisma: PrismaClient) {}

  async globalSearch(ownerId: string, q: string) {
    if (!q || q.trim().length === 0) {
      return { tasks: [], notes: [], projects: [], bookmarks: [] };
    }
    const query = q.trim();

    const [tasks, notes, projects, bookmarks] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          ownerId,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, title: true, status: true, priority: true },
      }),
      this.prisma.note.findMany({
        where: {
          ownerId,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { rawText: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, title: true, pinned: true },
      }),
      this.prisma.project.findMany({
        where: {
          ownerId,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, title: true, status: true },
      }),
      this.prisma.bookmark.findMany({
        where: {
          ownerId,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { url: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, title: true, url: true, favorite: true },
      }),
    ]);

    return { tasks, notes, projects, bookmarks };
  }

  async exportFullBackup(ownerId: string) {
    const [
      user,
      settings,
      tasks,
      notes,
      events,
      reminders,
      projects,
      habits,
      goals,
      expenses,
      bookmarks,
      learningPaths,
      journal,
      files,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: ownerId },
        select: { id: true, email: true, username: true, name: true, createdAt: true },
      }),
      this.prisma.userSettings.findUnique({ where: { ownerId } }),
      this.prisma.task.findMany({ where: { ownerId }, include: { subtasks: true } }),
      this.prisma.note.findMany({ where: { ownerId } }),
      this.prisma.calendarEvent.findMany({ where: { ownerId } }),
      this.prisma.reminder.findMany({ where: { ownerId } }),
      this.prisma.project.findMany({ where: { ownerId }, include: { milestones: true } }),
      this.prisma.habit.findMany({ where: { ownerId }, include: { logs: true } }),
      this.prisma.goal.findMany({ where: { ownerId }, include: { milestones: true } }),
      this.prisma.expenseTransaction.findMany({ where: { ownerId } }),
      this.prisma.bookmark.findMany({ where: { ownerId } }),
      this.prisma.learningPath.findMany({
        where: { ownerId },
        include: { topics: true, resources: true, certifications: true },
      }),
      this.prisma.journalEntry.findMany({ where: { ownerId } }),
      this.prisma.fileAsset.findMany({ where: { ownerId } }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      schemaVersion: '2.0.0',
      owner: user,
      settings,
      data: {
        tasks,
        notes,
        calendarEvents: events,
        reminders,
        projects,
        habits,
        goals,
        expenses: expenses.map((e: any) => ({ ...e, amount: e.amount.toString() })),
        bookmarks,
        learningPaths,
        journal,
        files: files.map((f: any) => ({ ...f, bytes: f.bytes.toString() })),
      },
    };
  }
}
