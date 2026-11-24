import { z } from 'zod';
export const passwordSchema = z
  .string()
  .min(12)
  .max(72)
  .refine((s) => Buffer.byteLength(s, 'utf8') <= 72, 'Use at most 72 UTF-8 bytes')
  .refine((s) => !s.startsWith('REPLACE_'), 'Choose a unique password');
export const loginSchema = z
  .object({
    identifier: z
      .string()
      .trim()
      .min(1)
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z
      .string()
      .min(1)
      .max(72)
      .refine((s) => Buffer.byteLength(s, 'utf8') <= 72, 'Password is too long'),
  })
  .strict();
export const signupSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()),
    username: z
      .string()
      .trim()
      .min(3)
      .max(30)
      .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores and dashes')
      .transform((v) => v.toLowerCase()),
    password: z.string().min(6).max(72),
  })
  .strict();
export const passwordChangeSchema = z
  .object({ currentPassword: z.string().min(1).max(256), newPassword: passwordSchema })
  .strict();
export const profileSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();
export const settingsSchema = z
  .object({
    timezone: z
      .string()
      .max(100)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, 'Invalid timezone')
      .optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .refine((v) => Intl.supportedValuesOf('currency').includes(v), 'Unsupported currency')
      .optional(),
    theme: z.enum(['dark', 'light', 'system']).optional(),
    focusMinutes: z.number().int().min(5).max(120).optional(),
    shortBreak: z.number().int().min(1).max(30).optional(),
    longBreak: z.number().int().min(5).max(60).optional(),
    emailReminders: z.boolean().optional(),
    aiEnabled: z.boolean().optional(),
  })
  .strict();
