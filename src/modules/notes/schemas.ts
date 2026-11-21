import { z } from 'zod';

export const createNoteFolderSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: z.string().uuid().nullable().optional(),
});

export const createNoteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.any().default({ type: 'doc', content: [] }),
  rawText: z.string().default(''),
  folderId: z.string().uuid().nullable().optional(),
  pinned: z.boolean().default(false),
});

export const updateNoteSchema = createNoteSchema.partial().extend({
  archived: z.boolean().optional(),
});

export const noteQuerySchema = z.object({
  folderId: z.string().uuid().optional(),
  archived: z.coerce.boolean().default(false),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});
