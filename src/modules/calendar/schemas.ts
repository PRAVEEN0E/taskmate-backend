import { z } from 'zod';
import { RecurrenceRuleEnum } from '../tasks/schemas.js';

export const createCalendarEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().default(''),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  allDay: z.boolean().default(false),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#38bdf8'),
  recurrence: RecurrenceRuleEnum.default('NONE'),
  remindMinutesBefore: z.number().int().min(0).optional(),
});

export const updateCalendarEventSchema = createCalendarEventSchema.partial();

export const calendarQuerySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export const createReminderSchema = z.object({
  title: z.string().trim().min(1).max(200),
  remindAt: z.string().datetime(),
  taskId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
});

export const snoozeReminderSchema = z.object({
  minutes: z.number().int().min(5).max(1440).default(15),
});
