import { beforeAll, afterAll, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
let db: PGlite;
const ownerId = randomUUID();
beforeAll(async () => {
  db = new PGlite();
  const root = new URL('../prisma/migrations/', import.meta.url);
  for (const directory of (await readdir(root, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name)))
    await db.exec(await readFile(new URL(directory.name + '/migration.sql', root), 'utf8'));
  await db.query(
    'INSERT INTO "User" (id,email,username,name,"passwordHash","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
    [ownerId, 'owner@example.test', 'owner', 'Owner', 'not-a-production-hash'],
  );
});
afterAll(async () => {
  await db.close();
});
it('enforces exactly one possible owner slot, even with raw SQL', async () => {
  await expect(
    db.query(
      'INSERT INTO "User" (id,email,username,name,"passwordHash","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
      [randomUUID(), 'second@example.test', 'second', 'Second', 'hash'],
    ),
  ).rejects.toThrow();
  await expect(
    db.query(
      'INSERT INTO "User" (id,"ownerSlot",email,username,name,"passwordHash","updatedAt") VALUES ($1,2,$2,$3,$4,$5,NOW())',
      [randomUUID(), 'third@example.test', 'third', 'Third', 'hash'],
    ),
  ).rejects.toThrow();
});
it('preserves exact decimal money and enforces ownership foreign keys', async () => {
  for (const amount of ['0.10', '0.20'])
    await db.query(
      'INSERT INTO "ExpenseTransaction" (id,"ownerId",kind,amount,date,"updatedAt") VALUES ($1,$2,\'EXPENSE\',$3,NOW(),NOW())',
      [randomUUID(), ownerId, amount],
    );
  const result = await db.query<{ total: string }>(
    'SELECT SUM(amount)::text AS total FROM "ExpenseTransaction"',
  );
  expect(result.rows[0].total).toBe('0.30');
  await expect(
    db.query(
      'INSERT INTO "Session" (id,"ownerId","expiresAt","updatedAt") VALUES ($1,$2,NOW(),NOW())',
      [randomUUID(), randomUUID()],
    ),
  ).rejects.toThrow();
});
it('cascades sessions when an owner is removed', async () => {
  await db.query(
    'INSERT INTO "Session" (id,"ownerId","expiresAt","updatedAt") VALUES ($1,$2,NOW(),NOW())',
    [randomUUID(), ownerId],
  );
  await db.query('DELETE FROM "User" WHERE id=$1', [ownerId]);
  const result = await db.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM "Session"');
  expect(result.rows[0].count).toBe(0);
});
