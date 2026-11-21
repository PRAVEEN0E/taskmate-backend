import type { FastifyPluginAsync } from 'fastify';
import { CalendarService } from './service.js';
import {
  createCalendarEventSchema,
  updateCalendarEventSchema,
  calendarQuerySchema,
  createReminderSchema,
  snoozeReminderSchema,
} from './schemas.js';

export const calendarRoutes: FastifyPluginAsync<{ calendarService: CalendarService }> = async (app, { calendarService }) => {
  app.get('/calendar/events', async (req) => {
    const ownerId = req.principal!.sub;
    const query = calendarQuerySchema.parse(req.query);
    const data = await calendarService.listEvents(ownerId, query);
    return { data };
  });

  app.post('/calendar/events', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const body = createCalendarEventSchema.parse(req.body);
    const data = await calendarService.createEvent(ownerId, body);
    reply.status(201);
    return { data };
  });

  app.patch('/calendar/events/:id', async (req) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const body = updateCalendarEventSchema.parse(req.body);
    const data = await calendarService.updateEvent(ownerId, id, body);
    return { data };
  });

  app.delete('/calendar/events/:id', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    await calendarService.deleteEvent(ownerId, id);
    reply.status(204);
  });

  app.get('/reminders', async (req) => {
    const ownerId = req.principal!.sub;
    const data = await calendarService.listReminders(ownerId);
    return { data };
  });

  app.post('/reminders', async (req, reply) => {
    const ownerId = req.principal!.sub;
    const body = createReminderSchema.parse(req.body);
    const data = await calendarService.createReminder(ownerId, body);
    reply.status(201);
    return { data };
  });

  app.post('/reminders/:id/snooze', async (req) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const body = snoozeReminderSchema.parse(req.body);
    const data = await calendarService.snoozeReminder(ownerId, id, body.minutes);
    return { data };
  });

  app.post('/reminders/:id/dismiss', async (req) => {
    const ownerId = req.principal!.sub;
    const { id } = req.params as { id: string };
    const data = await calendarService.dismissReminder(ownerId, id);
    return { data };
  });
};
