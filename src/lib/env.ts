import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z
    .string()
    .url()
    .default(
      process.env.POSTGRES_URL ||
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@localhost:5432/barberbot'
    ),
  DATABASE_URL_DIRECT: z
    .string()
    .url()
    .optional()
    .default(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL_DIRECT || ''),
  AUTH_SECRET: z.string().min(1).default('development-auth-secret-min-32-chars-long-123456789'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  WA_GRAPH_VERSION: z.string().optional(),
  WA_PHONE_NUMBER_ID: z.string().optional(),
  WA_WABA_ID: z.string().optional(),
  WA_ACCESS_TOKEN: z.string().optional(),
  WA_APP_SECRET: z.string().optional(),
  WA_VERIFY_TOKEN: z.string().optional(),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }
  return result.data;
};

export const env = parseEnv();
