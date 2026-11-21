import type { Database } from '../../services/database.js';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { addDays, parseISO, format } from 'date-fns';
export function dayBounds(now: Date, timezone: string) {
  const local = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
  const tomorrow = format(addDays(parseISO(local), 1), 'yyyy-MM-dd');
  return {
    start: fromZonedTime(`${local}T00:00:00`, timezone),
    end: fromZonedTime(`${tomorrow}T00:00:00`, timezone),
    monthStart: fromZonedTime(`${local.slice(0, 7)}-01T00:00:00`, timezone),
  };
}
export function createDashboardService(db: Database) {
  return {
    async summary(ownerId: string) {
      const settings = await db.userSettings.findUniqueOrThrow({ where: { ownerId } });
      const now = new Date(),
        { start, end, monthStart } = dayBounds(now, settings.timezone);
      const [
        pending,
        completed,
        overdue,
        todayTasks,
        notes,
        projects,
        focus,
        expense,
        learning,
        storage,
        unread,
      ] = await db.$transaction([
        db.task.count({ where: { ownerId, status: { not: 'COMPLETED' } } }),
        db.task.count({
          where: { ownerId, status: 'COMPLETED', completedAt: { gte: start, lt: end } },
        }),
        db.task.count({ where: { ownerId, status: { not: 'COMPLETED' }, dueAt: { lt: now } } }),
        db.task.findMany({
          where: { ownerId, dueAt: { gte: start, lt: end } },
          select: { id: true, title: true, status: true, priority: true, dueAt: true },
          orderBy: { dueAt: 'asc' },
          take: 5,
        }),
        db.note.findMany({
          where: { ownerId, archived: false },
          select: { id: true, title: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 3,
        }),
        db.project.findMany({
          where: { ownerId, status: 'ACTIVE' },
          select: { id: true, title: true, targetAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 3,
        }),
        db.focusSession.aggregate({
          where: { ownerId, completed: true, startedAt: { gte: start, lt: end } },
          _sum: { durationSeconds: true },
        }),
        db.expenseTransaction.aggregate({
          where: {
            ownerId,
            kind: 'EXPENSE',
            currency: settings.currency,
            date: { gte: monthStart, lte: now },
          },
          _sum: { amount: true },
        }),
        db.learningPath.count({ where: { ownerId } }),
        db.fileAsset.aggregate({ where: { ownerId }, _sum: { bytes: true }, _count: true }),
        db.notification.count({ where: { ownerId, readAt: null } }),
      ]);
      return {
        pending,
        completed,
        overdue,
        todayTasks,
        notes,
        projects,
        focusSeconds: focus._sum.durationSeconds ?? 0,
        monthExpense: expense._sum.amount?.toFixed(2) ?? '0.00',
        currency: settings.currency,
        learningPaths: learning,
        storageBytes: String(storage._sum.bytes ?? 0n),
        fileCount: storage._count,
        unreadNotifications: unread,
        timezone: settings.timezone,
        generatedAt: now.toISOString(),
      };
    },
  };
}
export type DashboardService = ReturnType<typeof createDashboardService>;
