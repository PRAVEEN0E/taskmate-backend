import type { PrismaClient } from '../../generated/prisma/client.js';
import { HttpError } from '../../utils/errors.js';
import { z } from 'zod';

export const createBookmarkFolderSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const createBookmarkSchema = z.object({
  url: z.string().url(),
  title: z.string().trim().min(1).max(200),
  description: z.string().default(''),
  folderId: z.string().uuid().nullable().optional(),
  favorite: z.boolean().default(false),
});

export const updateBookmarkSchema = createBookmarkSchema.partial();

export const createLearningPathSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().default(''),
  targetAt: z.string().datetime().nullable().optional(),
});

export const createJournalSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mood: z.enum(['GREAT', 'GOOD', 'NEUTRAL', 'LOW', 'BAD']).default('NEUTRAL'),
  title: z.string().default(''),
  content: z.any().default({ type: 'doc', content: [] }),
  rawText: z.string().default(''),
  favorite: z.boolean().default(false),
});

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().default(''),
  status: z.enum(['PLANNED', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).default('PLANNED'),
  startAt: z.string().datetime().nullable().optional(),
  targetAt: z.string().datetime().nullable().optional(),
});

export class PersonalService {
  constructor(private prisma: PrismaClient) {}

  // Bookmarks
  async listBookmarks(ownerId: string, folderId?: string) {
    const where: any = { ownerId };
    if (folderId) where.folderId = folderId;
    return this.prisma.bookmark.findMany({
      where,
      include: { folder: true },
      orderBy: [{ favorite: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createBookmark(ownerId: string, input: z.infer<typeof createBookmarkSchema>) {
    return this.prisma.bookmark.create({
      data: { ...input, ownerId },
      include: { folder: true },
    });
  }

  async toggleBookmarkFavorite(ownerId: string, id: string) {
    const bm = await this.prisma.bookmark.findFirst({ where: { id, ownerId } });
    if (!bm) throw new HttpError(404, 'NOT_FOUND', 'Bookmark not found');
    return this.prisma.bookmark.update({
      where: { id },
      data: { favorite: !bm.favorite },
    });
  }

  async deleteBookmark(ownerId: string, id: string) {
    const bm = await this.prisma.bookmark.findFirst({ where: { id, ownerId } });
    if (!bm) throw new HttpError(404, 'NOT_FOUND', 'Bookmark not found');
    return this.prisma.bookmark.delete({ where: { id } });
  }

  // Learning
  async listLearningPaths(ownerId: string) {
    return this.prisma.learningPath.findMany({
      where: { ownerId },
      include: {
        topics: { orderBy: { position: 'asc' } },
        resources: true,
        certifications: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createLearningPath(ownerId: string, input: z.infer<typeof createLearningPathSchema>) {
    return this.prisma.learningPath.create({
      data: {
        ...input,
        targetAt: input.targetAt ? new Date(input.targetAt) : null,
        ownerId,
      },
      include: { topics: true, resources: true },
    });
  }

  async addLearningTopic(ownerId: string, pathId: string, title: string) {
    const count = await this.prisma.learningTopic.count({ where: { pathId } });
    return this.prisma.learningTopic.create({
      data: { pathId, ownerId, title, position: count },
    });
  }

  async toggleTopic(ownerId: string, topicId: string) {
    const topic = await this.prisma.learningTopic.findFirst({ where: { id: topicId, ownerId } });
    if (!topic) throw new HttpError(404, 'NOT_FOUND', 'Topic not found');
    return this.prisma.learningTopic.update({
      where: { id: topicId },
      data: { completed: !topic.completed },
    });
  }

  // Journal
  async listJournal(ownerId: string) {
    return this.prisma.journalEntry.findMany({
      where: { ownerId },
      orderBy: { date: 'desc' },
      take: 60,
    });
  }

  async getJournalEntry(ownerId: string, date: string) {
    return this.prisma.journalEntry.findUnique({
      where: { ownerId_date: { ownerId, date } },
    });
  }

  async saveJournalEntry(ownerId: string, input: z.infer<typeof createJournalSchema>) {
    return this.prisma.journalEntry.upsert({
      where: { ownerId_date: { ownerId, date: input.date } },
      create: { ...input, ownerId },
      update: {
        mood: input.mood,
        title: input.title,
        content: input.content,
        rawText: input.rawText,
        favorite: input.favorite,
      },
    });
  }

  // Projects
  async listProjects(ownerId: string) {
    return this.prisma.project.findMany({
      where: { ownerId },
      include: {
        milestones: { orderBy: { position: 'asc' } },
        tasks: {
          select: { id: true, title: true, status: true, priority: true, dueAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createProject(ownerId: string, input: z.infer<typeof createProjectSchema>) {
    return this.prisma.project.create({
      data: {
        ...input,
        startAt: input.startAt ? new Date(input.startAt) : null,
        targetAt: input.targetAt ? new Date(input.targetAt) : null,
        ownerId,
      },
      include: { milestones: true, tasks: true },
    });
  }

  async updateProjectStatus(ownerId: string, id: string, status: any) {
    const p = await this.prisma.project.findFirst({ where: { id, ownerId } });
    if (!p) throw new HttpError(404, 'NOT_FOUND', 'Project not found');
    return this.prisma.project.update({
      where: { id },
      data: { status },
    });
  }
}
