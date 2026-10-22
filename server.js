'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
const appPassword = process.env.APP_PASSWORD;

if (!databaseUrl) throw new Error('DATABASE_URL environment variable is required');
if (!appPassword || appPassword.length < 12) {
  throw new Error('APP_PASSWORD must be set to at least 12 characters');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});
const app = express();
const port = Number(process.env.PORT) || 3000;

function requirePassword(req, res, next) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Basic\s+(.+)$/i);
  let password = '';

  if (match) {
    const credentials = Buffer.from(match[1], 'base64').toString('utf8');
    const separator = credentials.indexOf(':');
    if (separator >= 0 && credentials.slice(0, separator) === 'teacher') {
      password = credentials.slice(separator + 1);
    }
  }

  const provided = Buffer.from(password);
  const expected = Buffer.from(appPassword);
  const valid = provided.length === expected.length
    && crypto.timingSafeEqual(provided, expected);

  if (valid) return next();
  res.set('WWW-Authenticate', 'Basic realm="Sijil Alfasl", charset="UTF-8"');
  return res.status(401).send('يلزم تسجيل الدخول للوصول إلى سجل الفصل.');
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function validDocument(collection, id) {
  if (collection === 'app') return id === 'settings';
  if (collection === 'classes') return /^[A-Za-z0-9]+$/.test(id);
  if (collection === 'att') return /^[A-Za-z0-9]+_\d{4}-\d{2}$/.test(id);
  return false;
}

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  next();
});
app.use(requirePassword);
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/collections/:collection', asyncRoute(async (req, res) => {
  const { collection } = req.params;
  if (collection !== 'classes' && collection !== 'att') {
    return res.status(404).json({ error: 'Unknown collection' });
  }

  const result = await pool.query(
    'SELECT path, data FROM app_documents WHERE path LIKE $1 ORDER BY path',
    [`${collection}/%`]
  );
  const docs = result.rows.map((row) => ({
    id: row.path.slice(collection.length + 1),
    data: row.data
  }));
  return res.json({ docs, empty: docs.length === 0 });
}));

app.get('/api/docs/:collection/:id', asyncRoute(async (req, res) => {
  const { collection, id } = req.params;
  if (!validDocument(collection, id)) return res.status(404).json({ error: 'Unknown document' });

  const result = await pool.query(
    'SELECT data FROM app_documents WHERE path = $1',
    [`${collection}/${id}`]
  );
  if (!result.rowCount) return res.json({ exists: false, data: null });
  return res.json({ exists: true, data: result.rows[0].data });
}));

app.put('/api/docs/:collection/:id', asyncRoute(async (req, res) => {
  const { collection, id } = req.params;
  if (!validDocument(collection, id)) return res.status(404).json({ error: 'Unknown document' });
  if (!req.body || !req.body.data || typeof req.body.data !== 'object' || Array.isArray(req.body.data)) {
    return res.status(400).json({ error: 'Document data must be an object' });
  }

  await pool.query(
    `INSERT INTO app_documents (path, data, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [`${collection}/${id}`, JSON.stringify(req.body.data)]
  );
  return res.status(204).end();
}));

app.delete('/api/docs/:collection/:id', asyncRoute(async (req, res) => {
  const { collection, id } = req.params;
  if (!validDocument(collection, id)) return res.status(404).json({ error: 'Unknown document' });
  await pool.query('DELETE FROM app_documents WHERE path = $1', [`${collection}/${id}`]);
  return res.status(204).end();
}));

app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: '1h',
  setHeaders(res, filePath) {
    if (filePath.endsWith(`${path.sep}sw.js`)) res.set('Cache-Control', 'no-cache');
  }
}));

app.use((err, req, res, next) => {
  console.error('Request failed:', err);
  if (res.headersSent) return next(err);
  return res.status(500).json({ error: 'حدث خطأ في الخادم. حاول مرة أخرى.' });
});

async function start() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_documents (
      path text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  app.listen(port, () => {
    console.log(`سجل الفصل يعمل على المنفذ ${port}`);
  });
}

start().catch((err) => {
  console.error('Unable to start server:', err);
  process.exitCode = 1;
});
