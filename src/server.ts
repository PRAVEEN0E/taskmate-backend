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
import { GroupService } from './modules/groups/service.js';
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
const groupService = new GroupService(db);

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
  groupService,
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

  // Ensure database constraints allow multi-user signup without schema conflicts
  try {
    await db.$executeRawUnsafe(`ALTER TABLE "User" ALTER COLUMN "ownerSlot" DROP NOT NULL;`);
    await db.$executeRawUnsafe(`ALTER TABLE "User" ALTER COLUMN "ownerSlot" DROP DEFAULT;`);
    app.log.info('Ensured User.ownerSlot is nullable and has no default.');
  } catch (schemaErr) {
    app.log.warn({ err: schemaErr }, 'Non-fatal: Database schema adjustment on ownerSlot skipped or already applied.');
  }

  // Ensure Collaborative Groups tables exist
  try {
    await db.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "GroupRole" AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      CREATE TABLE IF NOT EXISTS "Group" (
        "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" VARCHAR(100) NOT NULL,
        "description" VARCHAR(255) DEFAULT '',
        "code" TEXT NOT NULL UNIQUE,
        "ownerId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS "GroupMember" (
        "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        "groupId" UUID NOT NULL REFERENCES "Group"("id") ON DELETE CASCADE,
        "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "role" "GroupRole" NOT NULL DEFAULT 'MEMBER',
        "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "GroupMember_groupId_userId_key" UNIQUE ("groupId", "userId")
      );

      CREATE TABLE IF NOT EXISTS "GroupNote" (
        "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        "groupId" UUID NOT NULL REFERENCES "Group"("id") ON DELETE CASCADE,
        "authorId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "title" VARCHAR(160) NOT NULL,
        "content" TEXT NOT NULL DEFAULT '',
        "pinned" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS "GroupTask" (
        "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        "groupId" UUID NOT NULL REFERENCES "Group"("id") ON DELETE CASCADE,
        "creatorId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "assigneeId" UUID REFERENCES "User"("id") ON DELETE SET NULL,
        "title" VARCHAR(160) NOT NULL,
        "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
        "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
        "dueAt" TIMESTAMPTZ(3),
        "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS "GroupActivity" (
        "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        "groupId" UUID NOT NULL REFERENCES "Group"("id") ON DELETE CASCADE,
        "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "action" TEXT NOT NULL,
        "target" TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    app.log.info('Ensured Group collaboration tables exist.');
  } catch (groupTableErr) {
    app.log.warn({ err: groupTableErr }, 'Non-fatal: Group table bootstrap skipped or already applied.');
  }

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
