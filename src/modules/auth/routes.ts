import type { FastifyInstance } from 'fastify';
import type { Config } from '../../config/env.js';
import type { AuthStore } from './types.js';
import { publicOwner } from './types.js';
import { createAuthService } from './service.js';
import { loginSchema, passwordChangeSchema, signupSchema } from './schemas.js';
import { cookieName } from '../../plugins/security.js';
export async function authRoutes(app: FastifyInstance, store: AuthStore, config: Config) {
  const service = await createAuthService(store, config.SESSION_MINUTES);
  const options = {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
  };
  const name = cookieName(config.NODE_ENV === 'production');

  app.post(
    '/api/v1/auth/signup',
    {
      config: { rateLimit: { max: 30, timeWindow: '15 minutes' } },
      schema: {
        tags: ['Authentication'],
        summary: 'Create a new user account',
        body: {
          type: 'object',
          required: ['name', 'email', 'username', 'password'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 80 },
            email: { type: 'string', format: 'email', maxLength: 254 },
            username: { type: 'string', minLength: 3, maxLength: 30 },
            password: { type: 'string', minLength: 6, maxLength: 72 },
          },
        },
      },
    },
    async (req, reply) => {
      const input = signupSchema.parse(req.body);
      const result = await service.register(input.name, input.email, input.username, input.password);
      const token = await reply.jwtSign(
        { sub: result.owner.id, sid: result.session.id, csrf: result.csrf },
        { expiresIn: config.SESSION_MINUTES * 60 },
      );
      reply.setCookie(name, token, { ...options, maxAge: config.SESSION_MINUTES * 60 });
      reply.status(201);
      return {
        data: {
          owner: publicOwner(result.owner),
          csrfToken: result.csrf,
          expiresAt: result.session.expiresAt,
        },
      };
    },
  );

  app.post(
    '/api/v1/auth/login',
    {
      config: { rateLimit: { max: 50, timeWindow: '15 minutes' } },
      schema: {
        tags: ['Authentication'],
        summary: 'Sign in as the initialized owner',
        body: {
          type: 'object',
          required: ['identifier', 'password'],
          additionalProperties: false,
          properties: {
            identifier: { type: 'string', maxLength: 254 },
            password: { type: 'string', maxLength: 256 },
          },
        },
      },
    },
    async (req, reply) => {
      const input = loginSchema.parse(req.body),
        result = await service.login(input.identifier, input.password);
      const token = await reply.jwtSign(
        { sub: result.owner.id, sid: result.session.id, csrf: result.csrf },
        { expiresIn: config.SESSION_MINUTES * 60 },
      );
      reply.setCookie(name, token, { ...options, maxAge: config.SESSION_MINUTES * 60 });
      return {
        data: {
          owner: publicOwner(result.owner),
          csrfToken: result.csrf,
          expiresAt: result.session.expiresAt,
        },
      };
    },
  );
  app.get(
    '/api/v1/auth/me',
    {
      schema: {
        tags: ['Authentication'],
        summary: 'Current authenticated owner',
        security: [{ cookieAuth: [] }],
      },
    },
    async (req) => ({
      data: {
        owner: publicOwner(req.principal!.owner),
        csrfToken: req.principal!.csrf,
        settings: await store.getSettings(req.principal!.sub),
      },
    }),
  );
  app.post(
    '/api/v1/auth/logout',
    {
      schema: {
        tags: ['Authentication'],
        summary: 'Invalidate the current session',
        security: [{ cookieAuth: [] }],
      },
    },
    async (req, reply) => {
      await store.deleteSession(req.principal!.sid);
      reply.clearCookie(name, options);
      return reply.code(204).send();
    },
  );
  app.post(
    '/api/v1/auth/password',
    {
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
      schema: {
        tags: ['Authentication'],
        summary: 'Change password and invalidate every session',
        security: [{ cookieAuth: [] }],
      },
    },
    async (req, reply) => {
      const data = passwordChangeSchema.parse(req.body);
      await service.changePassword(req.principal!.sub, data.currentPassword, data.newPassword);
      reply.clearCookie(name, options);
      return reply.code(204).send();
    },
  );
}
