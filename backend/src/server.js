import 'dotenv/config';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pool, query } from './db.js';
import { asyncRoute } from './middleware.js';
import publicStoreRouter from './publicStore.js';
import apiRouter from './routes.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 characters');
}

const app = express();
const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      connectSrc: ["'self'", 'https:'],
      imgSrc: ["'self'", 'data:', 'https:']
    }
  }
}));
const configuredOrigins = (process.env.CORS_ORIGIN ?? '*').split(',').map((origin) => origin.trim());
app.use(cors({ origin: configuredOrigins.length === 1 ? configuredOrigins[0] : configuredOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }));
app.get('/health', asyncRoute(async (_req, res) => {
  await query('SELECT 1');
  res.json({ status: 'ok', database: 'connected' });
}));
app.use(express.static(publicDirectory));
app.use('/store', publicStoreRouter);
app.use('/api', apiRouter);
app.get('*', (req, res, next) => {
  const indexFile = path.join(publicDirectory, 'index.html');
  if (req.accepts('html') && existsSync(indexFile)) return res.sendFile(indexFile);
  return next();
});
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status ?? 500).json({ error: error.status ? error.message : 'Internal server error' });
});

const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, () => console.log(`ShopKart API listening on port ${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(async () => {
    await pool.end();
    process.exit(0);
  }));
}
