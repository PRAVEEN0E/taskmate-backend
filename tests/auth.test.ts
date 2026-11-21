import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.js';
import { config, fixture, password, dashboard, notifications } from './support.js';
let app: FastifyInstance, state: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  state = await fixture();
  app = await createApp(config, { auth: state.store, dashboard, notifications });
  await app.ready();
});
afterEach(async () => {
  await app.close();
});
async function login() {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: config.APP_ORIGIN },
    payload: { identifier: 'OWNER', password },
  });
  expect(response.statusCode).toBe(200);
  return {
    cookie: response.cookies[0].name + '=' + response.cookies[0].value,
    csrf: response.json().data.csrfToken as string,
    response,
  };
}
describe('owner authentication boundary', () => {
  it('protects every private endpoint, including docs and unknown routes', async () => {
    for (const url of [
      '/api/v1/auth/me',
      '/api/v1/dashboard',
      '/api/v1/settings',
      '/api/v1/notifications',
      '/api/v1/openapi.json',
      '/api/v1/tasks',
      '/api/v1/signup',
    ]) {
      expect((await app.inject({ url })).statusCode).toBe(401);
    }
    expect((await app.inject({ url: '/healthz' })).statusCode).toBe(200);
  });
  it('logs in, exposes only safe profile fields and revokes a copied cookie on logout', async () => {
    const { cookie, csrf, response } = await login();
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(response.headers['set-cookie']).toContain('SameSite=Strict');
    expect(response.headers['cache-control']).toBe('no-store');
    const me = await app.inject({ url: '/api/v1/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.body).not.toContain('passwordHash');
    expect(me.body).not.toContain('failedLogins');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/logout',
          headers: { cookie, origin: config.APP_ORIGIN, 'x-csrf-token': csrf },
        })
      ).statusCode,
    ).toBe(204);
    expect((await app.inject({ url: '/api/v1/dashboard', headers: { cookie } })).statusCode).toBe(
      401,
    );
  });
  it('rejects missing/foreign origins and missing/incorrect CSRF tokens', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { identifier: 'owner', password },
        })
      ).statusCode,
    ).toBe(403);
    const { cookie, csrf } = await login();
    for (const headers of [
      { cookie, origin: 'https://evil.example', 'x-csrf-token': csrf },
      { cookie, origin: config.APP_ORIGIN },
      { cookie, origin: config.APP_ORIGIN, 'x-csrf-token': 'bad' },
    ])
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: '/api/v1/settings',
            headers,
            payload: { timezone: 'UTC' },
          })
        ).statusCode,
      ).toBe(403);
  });
  it('returns generic invalid credentials and rate limits login', async () => {
    for (let i = 0; i < 5; i++) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { origin: config.APP_ORIGIN },
        payload: { identifier: 'not-the-owner', password: 'incorrect-password' },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: { origin: config.APP_ORIGIN },
          payload: { identifier: 'owner', password },
        })
      ).statusCode,
    ).toBe(429);
  });
  it('uses a persistent account lock across fresh server instances', async () => {
    for (let i = 0; i < 5; i++) await state.store.recordFailure(state.ownerId);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: config.APP_ORIGIN },
      payload: { identifier: 'owner', password },
    });
    expect(response.statusCode).toBe(401);
  });
  it('rejects expired sessions, tampered cookies and bearer-only tokens', async () => {
    const { cookie } = await login();
    for (const session of state.sessions.values()) session.expiresAt = new Date(0);
    expect((await app.inject({ url: '/api/v1/auth/me', headers: { cookie } })).statusCode).toBe(
      401,
    );
    expect(
      (await app.inject({ url: '/api/v1/auth/me', headers: { cookie: cookie + 'x' } })).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          url: '/api/v1/auth/me',
          headers: { authorization: 'Bearer ' + cookie.split('=')[1] },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('validates preferences and scopes dashboard calls to the authenticated owner', async () => {
    const summary = vi.spyOn(dashboard, 'summary');
    const { cookie, csrf } = await login();
    const headers = { cookie, origin: config.APP_ORIGIN, 'x-csrf-token': csrf };
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/v1/settings',
          headers,
          payload: { timezone: 'Not/A_Zone' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/v1/settings',
          headers,
          payload: { ownerId: 'another-owner', focusMinutes: 25 },
        })
      ).statusCode,
    ).toBe(400);
    const saved = await app.inject({
      method: 'PATCH',
      url: '/api/v1/settings',
      headers,
      payload: { timezone: 'UTC', focusMinutes: 45 },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().data.focusMinutes).toBe(45);
    await app.inject({ url: '/api/v1/dashboard', headers: { cookie } });
    expect(summary).toHaveBeenCalledWith(state.ownerId);
    summary.mockRestore();
  });
  it('changes password and invalidates all active sessions', async () => {
    const first = await login(),
      second = await login();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/password',
          headers: { cookie: first.cookie, origin: config.APP_ORIGIN, 'x-csrf-token': first.csrf },
          payload: { currentPassword: password, newPassword: 'a-new-secure-test-password' },
        })
      ).statusCode,
    ).toBe(204);
    for (const cookie of [first.cookie, second.cookie])
      expect((await app.inject({ url: '/api/v1/auth/me', headers: { cookie } })).statusCode).toBe(
        401,
      );
  });
  it('does not leak internal errors or credential values', async () => {
    const { cookie } = await login();
    const spy = vi
      .spyOn(dashboard, 'summary')
      .mockRejectedValueOnce(new Error('postgres://secret-password@private-host'));
    const response = await app.inject({ url: '/api/v1/dashboard', headers: { cookie } });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('secret-password');
    spy.mockRestore();
  });
  it('sets production host-only Secure cookies', async () => {
    await app.close();
    app = await createApp(
      { ...config, NODE_ENV: 'production', APP_ORIGIN: 'https://taskmate.example' },
      { auth: state.store, dashboard, notifications },
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: 'https://taskmate.example' },
      payload: { identifier: 'owner', password },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toContain('__Host-taskmate=');
    expect(response.headers['set-cookie']).toContain('Secure');
    expect(response.headers['set-cookie']).not.toContain('Domain=');
  });
});
