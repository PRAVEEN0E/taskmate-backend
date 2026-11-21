import type { Database } from '../../services/database.js';
import { HttpError } from '../../utils/errors.js';
export function createNotificationsService(db: Database) {
  return {
    list: async (ownerId: string) =>
      db.notification.findMany({
        where: { ownerId },
        select: { id: true, title: true, body: true, readAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    async mark(ownerId: string, id: string, read: boolean) {
      const result = await db.notification.updateMany({
        where: { id, ownerId },
        data: { readAt: read ? new Date() : null },
      });
      if (!result.count) throw new HttpError(404, 'NOT_FOUND', 'Notification not found.');
    },
  };
}
export type NotificationsService = ReturnType<typeof createNotificationsService>;
