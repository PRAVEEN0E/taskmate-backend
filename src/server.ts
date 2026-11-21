import { readConfig } from './config/env.js';
import { createDatabase } from './services/database.js';
import { prismaAuthStore } from './modules/auth/repository.js';
import { createDashboardService } from './modules/dashboard/service.js';
import { createApp } from './app.js';
import { createNotificationsService } from './modules/notifications/service.js';

import { TaskService } from './modules/tasks/service.js';
import { NoteService } from './modules/notes/service.js';
import { CalendarService } from './modules/calendar/service.js';
import { AIService } from './modules/ai/service.js';
import { ProductivityService } from './modules/productivity/service.js';
import { ExpenseService } from './modules/expenses/service.js';
import { PersonalService } from './modules/personal/service.js';
import { FileService } from './modules/files/service.js';
import { IntegrationService } from './modules/integration/service.js';
import { ReminderWorker } from './jobs/reminder-worker.js';

const config = readConfig();
const db = createDatabase(config.DATABASE_URL);

// Services
const taskService = new TaskService(db);
const noteService = new NoteService(db);
const calendarService = new CalendarService(db);
const aiService = new AIService(db, config);
const productivityService = new ProductivityService(db);
const expenseService = new ExpenseService(db);
const personalService = new PersonalService(db);
const fileService = new FileService(db, config);
const integrationService = new IntegrationService(db);

const app = await createApp(config, {
  auth: prismaAuthStore(db),
  dashboard: createDashboardService(db),
  notifications: createNotificationsService(db),
  taskService,
  noteService,
  calendarService,
  aiService,
  productivityService,
  expenseService,
  personalService,
  fileService,
  integrationService,
});

// Reminder background worker
const reminderWorker = new ReminderWorker(db, config);
reminderWorker.start(30000);

app.addHook('onClose', async () => {
  reminderWorker.stop();
  await db.$disconnect();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    reminderWorker.stop();
    void app.close();
  });
}

try {
  await db.$connect();

  // Auto-bootstrap owner account if no owner exists yet
  const ownerCount = await db.user.count();
  if (ownerCount === 0) {
    const bcrypt = (await import('bcrypt')).default;
    const email = (process.env.OWNER_EMAIL || 'owner@example.com').toLowerCase();
    const username = (process.env.OWNER_USERNAME || 'owner').toLowerCase();
    const name = process.env.OWNER_NAME || 'Owner';
    const password = process.env.OWNER_PASSWORD || 'TaskMateOwner123!';
    const passwordHash = await bcrypt.hash(password, 12);

    await db.user.create({
      data: {
        ownerSlot: 1,
        email,
        username,
        name,
        passwordHash,
        settings: { create: {} },
      },
    });
    app.log.info({ email, username }, 'Auto-bootstrapped initial owner account on first start.');
  }

  await app.listen({ port: config.PORT, host: config.HOST });
} catch (err) {
  app.log.fatal(err, 'Startup failed. Check database connectivity and configuration.');
  await app.close();
  process.exitCode = 1;
}
