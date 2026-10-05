import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.DATABASE_URL_DIRECT ||
      process.env.DATABASE_URL ||
      '',
  },
});
