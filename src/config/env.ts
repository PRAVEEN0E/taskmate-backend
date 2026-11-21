import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('127.0.0.1'),
  APP_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().startsWith('postgres'),
  JWT_SECRET: z
    .string()
    .min(32)
    .refine((v) => !v.startsWith('REPLACE_'), 'Generate a random JWT_SECRET'),
  SESSION_MINUTES: z.coerce.number().int().min(5).max(30).default(15),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).default('info'),
  TRUST_PROXY: z.string().default(''),
  // Optional integrations
  GEMINI_API_KEY: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function readConfig(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success)
    throw new Error(
      `Invalid environment keys: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  const config = parsed.data,
    url = new URL(config.APP_ORIGIN);
  if (url.origin !== config.APP_ORIGIN)
    throw new Error('APP_ORIGIN must be an exact origin without a trailing slash');
  if (config.NODE_ENV === 'production' && url.protocol !== 'https:')
    throw new Error('Production APP_ORIGIN must use HTTPS');
  return config;
}
