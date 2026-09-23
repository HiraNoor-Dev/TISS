import 'server-only';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import type { Database } from './types';
const globalDb = globalThis as unknown as { tissDb?: Database };
export function database(): Database {
  if (!globalDb.tissDb) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    globalDb.tissDb = drizzle(new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }), { schema });
  }
  return globalDb.tissDb;
}
