import type { PrismaClient } from '../../generated/prisma/client.js';
import { HttpError } from '../../utils/errors.js';
import type { z } from 'zod';
import type { createNoteSchema, updateNoteSchema, noteQuerySchema, createNoteFolderSchema } from './schemas.js';

export class NoteService {
  constructor(private prisma: PrismaClient) {}

  async list(ownerId: string, query: z.infer<typeof noteQuerySchema>) {
    const where: any = { ownerId, archived: query.archived };
    if (query.folderId) where.folderId = query.folderId;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { rawText: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.note.findMany({
      where,
      include: { folder: true },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      take: query.limit,
    });
  }

  async getById(ownerId: string, id: string) {
    const note = await this.prisma.note.findFirst({
      where: { id, ownerId },
      include: { folder: true, attachments: { include: { file: true } } },
    });
    if (!note) throw new HttpError(404, 'NOT_FOUND', 'Note not found');
    return note;
  }

  async create(ownerId: string, input: z.infer<typeof createNoteSchema>) {
    return this.prisma.note.create({
      data: {
        ...input,
        ownerId,
      },
      include: { folder: true },
    });
  }

  async update(ownerId: string, id: string, input: z.infer<typeof updateNoteSchema>) {
    await this.getById(ownerId, id);
    return this.prisma.note.update({
      where: { id },
      data: input,
      include: { folder: true },
    });
  }

  async delete(ownerId: string, id: string) {
    await this.getById(ownerId, id);
    return this.prisma.note.delete({ where: { id } });
  }

  async listFolders(ownerId: string) {
    return this.prisma.noteFolder.findMany({
      where: { ownerId },
      orderBy: { name: 'asc' },
    });
  }

  async createFolder(ownerId: string, input: z.infer<typeof createNoteFolderSchema>) {
    return this.prisma.noteFolder.create({
      data: { ...input, ownerId },
    });
  }

  async deleteFolder(ownerId: string, id: string) {
    return this.prisma.noteFolder.deleteMany({
      where: { id, ownerId },
    });
  }
}
