import { setTimeout as wait } from 'node:timers/promises';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema';
import type { Database } from '../src/db/types';
import { processOneWhatsAppRecipient, whatsappConfig } from '../src/server/whatsapp';

const once = process.argv.includes('--once'); let stopping = false;
process.on('SIGINT', () => { stopping = true; }); process.on('SIGTERM', () => { stopping = true; });
const config = whatsappConfig();
if (!config.enabled) throw new Error('Configure WhatsApp and set WHATSAPP_ENABLED=true before starting the worker.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const db = drizzle(pool, { schema }) as Database;
try {
  do {
    const worked = await processOneWhatsAppRecipient(db, config);
    if (once) break;
    if (!worked) await wait(2000);
  } while (!stopping);
} finally { await pool.end(); }
