import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
  console.log('Database schema is up to date.');
} finally {
  await pool.end();
}
