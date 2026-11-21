import Fastify, { LogController } from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import { ZodError } from 'zod';
import type { Config } from './config/env.js';
import type { AuthStore } from './modules/auth/types.js';
import type { DashboardService } from './modules/dashboard/service.js';
import { authRoutes } from './modules/auth/routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';
import { settingsRoutes } from './modules/settings/routes.js';
import { addSecurity, cookieName } from './plugins/security.js';
import { HttpError } from './utils/errors.js';
import { notificationRoutes } from './modules/notifications/routes.js';
import type { NotificationsService } from './modules/notifications/service.js';

// Phases 2–6 Modules
import { TaskService } from './modules/tasks/service.js';
import { taskRoutes } from './modules/tasks/routes.js';
import { NoteService } from './modules/notes/service.js';
import { noteRoutes } from './modules/notes/routes.js';
import { CalendarService } from './modules/calendar/service.js';
import { calendarRoutes } from './modules/calendar/routes.js';
import { AIService } from './modules/ai/service.js';
import { aiRoutes } from './modules/ai/routes.js';
import { ProductivityService } from './modules/productivity/service.js';
import { productivityRoutes } from './modules/productivity/routes.js';
import { ExpenseService } from './modules/expenses/service.js';
import { expenseRoutes } from './modules/expenses/routes.js';
import { PersonalService } from './modules/personal/service.js';
import { personalRoutes } from './modules/personal/routes.js';
import { FileService } from './modules/files/service.js';
import { fileRoutes } from './modules/files/routes.js';
import { IntegrationService } from './modules/integration/service.js';
import { integrationRoutes } from './modules/integration/routes.js';

export async function createApp(
  config: Config,
  deps: {
    auth: AuthStore;
    dashboard: DashboardService;
    notifications: NotificationsService;
    taskService?: TaskService;
    noteService?: NoteService;
    calendarService?: CalendarService;
    aiService?: AIService;
    productivityService?: ProductivityService;
    expenseService?: ExpenseService;
    personalService?: PersonalService;
    fileService?: FileService;
    integrationService?: IntegrationService;
  },
) {
  const app = Fastify({
    bodyLimit: 65536,
    trustProxy: config.TRUST_PROXY || false,
    logController: new LogController({ disableRequestLogging: true }),
    logger:
      config.LOG_LEVEL === 'silent'
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'req.headers["x-csrf-token"]',
              'res.headers["set-cookie"]',
              'password',
              'passwordHash',
              'token',
            ],
          },
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: config.APP_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    cookie: { cookieName: cookieName(config.NODE_ENV === 'production'), signed: false },
    sign: { iss: 'taskmate-ai', aud: 'taskmate-owner' },
    verify: { allowedIss: 'taskmate-ai', allowedAud: 'taskmate-owner', algorithms: ['HS256'] },
  });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'TaskMate AI API',
        version: '1.0.0',
        description: 'Complete personal management API for TaskMate AI.',
      },
      components: {
        securitySchemes: {
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: cookieName(config.NODE_ENV === 'production'),
          },
        },
      },
    },
  });

  addSecurity(app, config, deps.auth);

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Check the submitted fields.',
          fields: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
    if (error instanceof HttpError)
      return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    const status = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500;
    if (status === 429)
      return reply.code(429).send({
        error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait and try again.' },
      });
    if (status >= 400 && status < 500)
      return reply.code(status).send({ error: { code: 'BAD_REQUEST', message: 'The request could not be accepted.' } });

    req.log.error({ requestId: req.id }, 'Request failed');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
        requestId: req.id,
      },
    });
  });

  app.get('/healthz', { schema: { hide: true } }, async () => ({ status: 'ok' }));

  // Phase 1 Routes
  await authRoutes(app, deps.auth, config);
  settingsRoutes(app, deps.auth);
  dashboardRoutes(app, deps.dashboard);
  notificationRoutes(app, deps.notifications);

  // Phases 2–6 Routes (Scoped under /api/v1)
  await app.register(
    async (v1) => {
      if (deps.taskService) taskRoutes(v1, { taskService: deps.taskService });
      if (deps.noteService) noteRoutes(v1, { noteService: deps.noteService });
      if (deps.calendarService) calendarRoutes(v1, { calendarService: deps.calendarService });
      if (deps.aiService) aiRoutes(v1, { aiService: deps.aiService });
      if (deps.productivityService) productivityRoutes(v1, { productivityService: deps.productivityService });
      if (deps.expenseService) expenseRoutes(v1, { expenseService: deps.expenseService });
      if (deps.personalService) personalRoutes(v1, { personalService: deps.personalService });
      if (deps.fileService) fileRoutes(v1, { fileService: deps.fileService });
      if (deps.integrationService) integrationRoutes(v1, { integrationService: deps.integrationService });
    },
    { prefix: '/api/v1' },
  );

  app.get('/api/v1/openapi.json', { schema: { hide: true } }, async () => app.swagger());
  return app;
}
