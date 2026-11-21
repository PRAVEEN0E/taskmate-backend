import type { PrismaClient } from '../generated/prisma/client.js';
import type { Config } from '../config/env.js';
import nodemailer from 'nodemailer';

export class ReminderWorker {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private prisma: PrismaClient,
    private config: Config,
  ) {}

  start(intervalMs = 30000) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.processDueReminders();
    }, intervalMs);
    void this.processDueReminders();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async processDueReminders() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = new Date();
      const dueReminders = await this.prisma.reminder.findMany({
        where: {
          status: 'PENDING',
          remindAt: { lte: now },
        },
        include: {
          owner: {
            include: { settings: true },
          },
        },
        take: 50,
      });

      for (const reminder of dueReminders) {
        // 1. Create In-App Notification
        await this.prisma.notification.create({
          data: {
            ownerId: reminder.ownerId,
            title: reminder.title,
            body: `Reminder scheduled for ${reminder.remindAt.toLocaleTimeString()}`,
            link: reminder.taskId ? '/tasks' : reminder.eventId ? '/calendar' : undefined,
          },
        });

        // 2. Email Delivery if configured and enabled
        if (
          reminder.owner.settings?.emailReminders &&
          this.config.SMTP_HOST &&
          this.config.SMTP_USER &&
          this.config.SMTP_PASSWORD
        ) {
          try {
            const transporter = nodemailer.createTransport({
              host: this.config.SMTP_HOST,
              port: this.config.SMTP_PORT,
              secure: this.config.SMTP_PORT === 465,
              auth: {
                user: this.config.SMTP_USER,
                pass: this.config.SMTP_PASSWORD,
              },
            });

            await transporter.sendMail({
              from: this.config.SMTP_FROM || this.config.SMTP_USER,
              to: reminder.owner.email,
              subject: `[TaskMate AI] Reminder: ${reminder.title}`,
              text: `Hello ${reminder.owner.name},\n\nThis is a reminder for: ${reminder.title}.\nDue: ${reminder.remindAt.toISOString()}`,
            });

            await this.prisma.reminder.update({
              where: { id: reminder.id },
              data: { sentEmail: true },
            });
          } catch (mailErr) {
            console.error('[ReminderWorker] Email delivery failed:', mailErr);
          }
        }

        // 3. Mark Triggered
        await this.prisma.reminder.update({
          where: { id: reminder.id },
          data: { status: 'TRIGGERED' },
        });
      }
    } catch (err) {
      console.error('[ReminderWorker] Error processing reminders:', err);
    } finally {
      this.isProcessing = false;
    }
  }
}
