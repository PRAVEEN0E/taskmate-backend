import { z } from 'zod';

export const TaskPriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const TaskStatusEnum = z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']);
export const RecurrenceRuleEnum = z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().default(''),
  priority: TaskPriorityEnum.default('MEDIUM'),
  status: TaskStatusEnum.default('TODO'),
  dueAt: z.string().datetime().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  goalId: z.string().uuid().nullable().optional(),
  recurrence: RecurrenceRuleEnum.default('NONE'),
  subtasks: z.array(z.string().trim().min(1)).optional(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  completed: z.boolean().optional(),
});

export const taskQuerySchema = z.object({
  status: TaskStatusEnum.optional(),
  priority: TaskPriorityEnum.optional(),
  categoryId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export const createSubtaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export const updateSubtaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  completed: z.boolean().optional(),
  position: z.number().int().optional(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#38bdf8'),
});

export const bulkActionSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1),
  action: z.enum(['DELETE', 'COMPLETE', 'SET_TODO', 'SET_IN_PROGRESS']),
});
