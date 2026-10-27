import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
neonConfig.webSocketConstructor = ws;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

export async function query(text, values = []) {
  return pool.query(text, values);
}
