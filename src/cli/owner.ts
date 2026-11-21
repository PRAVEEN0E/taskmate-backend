import 'dotenv/config';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { createDatabase } from '../services/database.js';
import { passwordSchema } from '../modules/auth/schemas.js';
const mode = process.argv[2];
if (!['setup', 'recover'].includes(mode ?? '')) throw new Error('Use owner:setup or owner:recover');
const input = z
  .object({
    DATABASE_URL: z.string().startsWith('postgres'),
    OWNER_EMAIL: z.email().transform((v) => v.toLowerCase()),
    OWNER_USERNAME: z
      .string()
      .regex(/^[a-zA-Z0-9_]{3,40}$/)
      .transform((v) => v.toLowerCase()),
    OWNER_NAME: z.string().trim().min(1).max(80),
    OWNER_PASSWORD: passwordSchema,
  })
  .safeParse(process.env);
if (!input.success) {
  console.error(
    'Set valid DATABASE_URL, OWNER_EMAIL, OWNER_USERNAME, OWNER_NAME and OWNER_PASSWORD environment variables.',
  );
  process.exit(1);
}
const db = createDatabase(input.data.DATABASE_URL);
try {
  const data = input.data,
    passwordHash = await bcrypt.hash(data.OWNER_PASSWORD, 12);
  await db.$transaction(async (tx) => {
    if (mode === 'setup') {
      if (await tx.user.count())
        throw new Error('An owner already exists. Setup is one-time only.');
      await tx.user.create({
        data: {
          ownerSlot: 1,
          email: data.OWNER_EMAIL,
          username: data.OWNER_USERNAME,
          name: data.OWNER_NAME,
          passwordHash,
          settings: { create: {} },
        },
      });
    } else {
      const owner = await tx.user.findUnique({ where: { ownerSlot: 1 } });
      if (!owner || owner.email !== data.OWNER_EMAIL)
        throw new Error('Recovery email must match the existing owner.');
      await tx.user.update({
        where: { id: owner.id },
        data: { passwordHash, failedLogins: 0, lockedUntil: null },
      });
      await tx.session.deleteMany({ where: { ownerId: owner.id } });
    }
  });
  console.log(
    mode === 'setup'
      ? 'Owner initialized. Remove OWNER_PASSWORD from the environment.'
      : 'Password replaced and all sessions revoked. Remove OWNER_PASSWORD from the environment.',
  );
} catch {
  console.error(
    'Owner operation failed. Verify the database, migration state, and owner identity; setup refuses an existing owner.',
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
