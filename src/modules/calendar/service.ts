import type { PrismaClient } from '../../generated/prisma/client.js';
import { HttpError } from '../../utils/errors.js';
import type { z } from 'zod';
import type {
  createCalendarEventSchema,
  updateCalendarEventSchema,
  calendarQuerySchema,
  createReminderSchema,
} from './schemas.js';

export class CalendarService {
  constructor(private prisma: PrismaClient) {}

  async listEvents(ownerId: string, query: z.infer<typeof calendarQuerySchema>) {
    return this.prisma.calendarEvent.findMany({
      where: {
        ownerId,
        OR: [
          { startAt: { gte: new Date(query.start), lte: new Date(query.end) } },
          { endAt: { gte: new Date(query.start), lte: new Date(query.end) } },
        ],
      },
      orderBy: { startAt: 'asc' },
    });
  }

  async createEvent(ownerId: string, input: z.infer<typeof createCalendarEventSchema>) {
    const { remindMinutesBefore, ...rest } = input;
    const startAt = new Date(rest.startAt);
    const endAt = new Date(rest.endAt);
    if (endAt <= startAt) throw new HttpError(400, 'INVALID_DATES', 'End date must be after start date');

    const event = await this.prisma.calendarEvent.create({
      data: {
        ...rest,
        startAt,
        endAt,
        ownerId,
      },
    });

    if (remindMinutesBefore !== undefined) {
      const remindAt = new Date(startAt.getTime() - remindMinutesBefore * 60 * 1000);
      await this.prisma.reminder.create({
        data: {
          ownerId,
          eventId: event.id,
          title: `Event: ${event.title}`,
          remindAt,
        },
      });
    }

    return event;
  }

  async updateEvent(ownerId: string, id: string, input: z.infer<typeof updateCalendarEventSchema>) {
    const existing = await this.prisma.calendarEvent.findFirst({ where: { id, ownerId } });
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Event not found');

    const data: any = { ...input };
    if (input.startAt) data.startAt = new Date(input.startAt);
    if (input.endAt) data.endAt = new Date(input.endAt);

    return this.prisma.calendarEvent.update({
      where: { id },
      data,
    });
  }

  async deleteEvent(ownerId: string, id: string) {
    const existing = await this.prisma.calendarEvent.findFirst({ where: { id, ownerId } });
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Event not found');
    return this.prisma.calendarEvent.delete({ where: { id } });
  }

  async listReminders(ownerId: string) {
    return this.prisma.reminder.findMany({
      where: { ownerId },
      include: {
        task: { select: { id: true, title: true } },
        event: { select: { id: true, title: true } },
      },
      orderBy: { remindAt: 'asc' },
    });
  }

  async createReminder(ownerId: string, input: z.infer<typeof createReminderSchema>) {
    return this.prisma.reminder.create({
      data: {
        ...input,
        remindAt: new Date(input.remindAt),
        ownerId,
      },
    });
  }

  async snoozeReminder(ownerId: string, id: string, minutes: number) {
    const existing = await this.prisma.reminder.findFirst({ where: { id, ownerId } });
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Reminder not found');
    return this.prisma.reminder.update({
      where: { id },
      data: {
        remindAt: new Date(Date.now() + minutes * 60 * 1000),
        status: 'SNOOZED',
      },
    });
  }

  async dismissReminder(ownerId: string, id: string) {
    const existing = await this.prisma.reminder.findFirst({ where: { id, ownerId } });
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Reminder not found');
    return this.prisma.reminder.update({
      where: { id },
      data: { status: 'DISMISSED' },
    });
  }
}
