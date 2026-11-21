import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import type { Config } from '../config/env.js';
import type { AuthStore, Claims } from '../modules/auth/types.js';
import { HttpError } from '../utils/errors.js';
export const cookieName = (production: boolean) =>
  production ? '__Host-taskmate' : 'taskmate_session';
export function addSecurity(app: FastifyInstance, config: Config, store: AuthStore) {
  app.decorateRequest('principal', null);
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      req.headers.origin !== config.APP_ORIGIN
    )
      throw new HttpError(403, 'ORIGIN_REJECTED', 'Request origin is not allowed.');
    if (req.method === 'OPTIONS') return;
    const path = req.url.split('?')[0];
    if (path === '/healthz' || path === '/api/v1/auth/login') return;
    let claims: Claims;
    try {
      claims = await req.jwtVerify<Claims>({ onlyCookie: true });
    } catch {
      throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in.');
    }
    if (!claims.sid || !claims.sub || typeof claims.csrf !== 'string')
      throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in.');
    const [session, owner] = await Promise.all([store.findSession(claims.sid), store.findOwner()]);
    if (
      !session ||
      !owner ||
      session.ownerId !== claims.sub ||
      owner.id !== claims.sub ||
      session.expiresAt <= new Date()
    )
      throw new HttpError(
        401,
        'SESSION_EXPIRED',
        'Your session has expired. Please sign in again.',
      );
    req.principal = { ...claims, owner };
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const token = req.headers['x-csrf-token'];
      if (
        typeof token !== 'string' ||
        Buffer.byteLength(token) !== Buffer.byteLength(claims.csrf) ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(claims.csrf))
      )
        throw new HttpError(403, 'CSRF_REJECTED', 'Refresh the page and try again.');
    }
  });
}
