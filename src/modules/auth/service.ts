import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import type { AuthStore } from './types.js';
import { HttpError } from '../../utils/errors.js';
const invalid = () =>
  new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid credentials or account temporarily locked.');
export async function createAuthService(store: AuthStore, sessionMinutes: number) {
  // Match bcrypt cost for absent/incorrect identifiers without a hardcoded credential.
  const dummyHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
  return {
    async register(name: string, email: string, username: string, password: string) {
      const existing = await store.findUserByIdentifier(email);
      if (existing) {
        throw new HttpError(409, 'USER_EXISTS', 'An account with this email already exists.');
      }
      const existingUser = await store.findUserByIdentifier(username);
      if (existingUser) {
        throw new HttpError(409, 'USERNAME_TAKEN', 'This username is already taken. Please choose another.');
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await store.createUser({ name, email, username, passwordHash });
      const session = await store.createSession(
        user.id,
        new Date(Date.now() + sessionMinutes * 60000),
      );
      return { owner: user, session, csrf: randomBytes(32).toString('base64url') };
    },
    async login(identifier: string, password: string) {
      const user = await store.findUserByIdentifier(identifier);
      const matches = !!user;
      const valid = await bcrypt.compare(password, matches ? user.passwordHash : dummyHash);
      if (!user || !matches) throw invalid();
      if (user.lockedUntil && user.lockedUntil > new Date()) throw invalid();
      if (!valid) {
        await store.recordFailure(user.id);
        throw invalid();
      }
      const session = await store.createSession(
        user.id,
        new Date(Date.now() + sessionMinutes * 60000),
      );
      // Recovery/password change racing with login must not mint a durable session.
      const latest = await store.findUserById(user.id);
      if (!latest || latest.passwordHash !== user.passwordHash) {
        await store.deleteSession(session.id);
        throw invalid();
      }
      await store.clearFailures(user.id);
      return { owner: user, session, csrf: randomBytes(32).toString('base64url') };
    },
    async changePassword(ownerId: string, currentPassword: string, newPassword: string) {
      const owner = await store.findOwner();
      if (
        !owner ||
        owner.id !== ownerId ||
        !(await bcrypt.compare(currentPassword, owner.passwordHash))
      )
        throw invalid();
      if (
        !(await store.changePassword(
          ownerId,
          owner.passwordHash,
          await bcrypt.hash(newPassword, 12),
        ))
      )
        throw invalid();
    },
  };
}
