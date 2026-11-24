import type { Database } from '../../services/database.js';
import type { AuthStore } from './types.js';
export function prismaAuthStore(db: Database): AuthStore {
  return {
    findOwner: () => db.user.findFirst({ orderBy: { createdAt: 'asc' } }),
    findUserById: (id: string) => db.user.findUnique({ where: { id } }),
    findUserByIdentifier: (identifier: string) =>
      db.user.findFirst({
        where: {
          OR: [
            { email: { equals: identifier, mode: 'insensitive' } },
            { username: { equals: identifier, mode: 'insensitive' } },
          ],
        },
      }),
    createUser: async ({ name, email, username, passwordHash }) =>
      db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name,
            email,
            username,
            passwordHash,
          },
        });
        await tx.userSettings.create({
          data: {
            ownerId: user.id,
            timezone: 'Asia/Kolkata',
            currency: 'INR',
            theme: 'dark',
          },
        });
        return user;
      }),
    recordFailure: async (ownerId) => {
      await db.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: ownerId },
          data: { failedLogins: { increment: 1 } },
        });
        if (updated.failedLogins >= 5)
          await tx.user.update({
            where: { id: ownerId },
            data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
          });
      });
    },
    clearFailures: async (id) => {
      await db.user.update({ where: { id }, data: { failedLogins: 0, lockedUntil: null } });
    },
    createSession: async (ownerId, expiresAt) =>
      db.$transaction(async (tx) => {
        await tx.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        return tx.session.create({ data: { ownerId, expiresAt } });
      }),
    findSession: (id) => db.session.findUnique({ where: { id } }),
    deleteSession: async (id) => {
      await db.session.deleteMany({ where: { id } });
    },
    changePassword: async (ownerId, previousHash, passwordHash) =>
      db.$transaction(async (tx) => {
        const result = await tx.user.updateMany({
          where: { id: ownerId, passwordHash: previousHash },
          data: { passwordHash, failedLogins: 0, lockedUntil: null },
        });
        if (!result.count) return false;
        await tx.session.deleteMany({ where: { ownerId } });
        return true;
      }),
    getSettings: async (ownerId) => db.userSettings.findUniqueOrThrow({ where: { ownerId } }),
    updateProfile: async (id, data) => {
      await db.user.update({ where: { id }, data });
    },
    updateSettings: (ownerId, data) => db.userSettings.update({ where: { ownerId }, data }),
  };
}
