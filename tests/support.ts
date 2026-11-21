import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { AuthStore, Owner, SessionRecord, Settings } from '../src/modules/auth/types.js';
import type { Config } from '../src/config/env.js';
export const config: Config = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: 4000,
  APP_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  JWT_SECRET: 'test-only-random-value-not-a-production-key-123456789',
  SESSION_MINUTES: 15,
  LOG_LEVEL: 'silent',
  TRUST_PROXY: '',
};
export const password = 'test-password-not-for-production';
export async function fixture() {
  let owner: Owner = {
    id: randomUUID(),
    email: 'owner@example.test',
    username: 'owner',
    name: 'Test owner',
    passwordHash: await bcrypt.hash(password, 12),
    failedLogins: 0,
    lockedUntil: null,
  };
  const sessions = new Map<string, SessionRecord>();
  let settings: Settings = {
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    theme: 'dark',
    focusMinutes: 25,
    shortBreak: 5,
    longBreak: 15,
    emailReminders: false,
    aiEnabled: false,
  };
  const store: AuthStore = {
    findOwner: async () => ({ ...owner }),
    recordFailure: async () => {
      owner.failedLogins++;
      if (owner.failedLogins >= 5) owner.lockedUntil = new Date(Date.now() + 900000);
    },
    clearFailures: async () => {
      owner.failedLogins = 0;
      owner.lockedUntil = null;
    },
    createSession: async (ownerId, expiresAt) => {
      const session = { id: randomUUID(), ownerId, expiresAt };
      sessions.set(session.id, session);
      return session;
    },
    findSession: async (id) => sessions.get(id) ?? null,
    deleteSession: async (id) => {
      sessions.delete(id);
    },
    changePassword: async (id, previousHash, passwordHash) => {
      if (id !== owner.id || previousHash !== owner.passwordHash) return false;
      owner = { ...owner, passwordHash };
      sessions.clear();
      return true;
    },
    getSettings: async () => settings,
    updateProfile: async (_, data) => {
      owner = { ...owner, ...data };
    },
    updateSettings: async (_, data) => {
      settings = { ...settings, ...data };
      return settings;
    },
  };
  return { store, sessions, ownerId: owner.id };
}
export const dashboard = {
  summary: async () => ({
    pending: 0,
    completed: 0,
    overdue: 0,
    todayTasks: [],
    notes: [],
    projects: [],
    focusSeconds: 0,
    monthExpense: '0.00',
    currency: 'INR',
    learningPaths: 0,
    storageBytes: '0',
    fileCount: 0,
    unreadNotifications: 0,
    timezone: 'Asia/Kolkata',
    generatedAt: new Date().toISOString(),
  }),
};
export const notifications = { list: async () => [], mark: async () => {} };
