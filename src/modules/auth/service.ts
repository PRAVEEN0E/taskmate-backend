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
    async login(identifier: string, password: string) {
      const owner = await store.findOwner();
      const matches = owner && (identifier === owner.email || identifier === owner.username);
      const valid = await bcrypt.compare(password, matches ? owner.passwordHash : dummyHash);
      if (!owner || !matches) throw invalid();
      if (owner.lockedUntil && owner.lockedUntil > new Date()) throw invalid();
      if (!valid) {
        await store.recordFailure(owner.id);
        throw invalid();
      }
      const session = await store.createSession(
        owner.id,
        new Date(Date.now() + sessionMinutes * 60000),
      );
      // Recovery/password change racing with login must not mint a durable session.
      const latest = await store.findOwner();
      if (!latest || latest.passwordHash !== owner.passwordHash) {
        await store.deleteSession(session.id);
        throw invalid();
      }
      await store.clearFailures(owner.id);
      return { owner, session, csrf: randomBytes(32).toString('base64url') };
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
