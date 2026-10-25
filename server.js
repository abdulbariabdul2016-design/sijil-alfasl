'use strict';
/*
  خادم «سجل الفصل»: يقدّم ملفات الموقع من مجلد public، ويحفظ البيانات في قاعدة Neon (Postgres).
  - بدون DATABASE_URL يحفظ في ملف محلي (للتجربة على جهازك فقط).
  - الدخول بكلمة مرور واحدة (APP_PASSWORD)، ويصدر رمز دخول صالح 90 يوماً.
  المتغيرات: DATABASE_URL, APP_PASSWORD, SESSION_SECRET (اختياري), PORT
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const PORT = Number(process.env.PORT) || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'store.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const TOKEN_MS = 90 * 24 * 3600 * 1000;
const MAX_BODY = 2 * 1024 * 1024;
const PATH_RE = /^(app|classes|att)\/[A-Za-z0-9_-]{1,80}$/;
const PREFIXES = ['app', 'classes', 'att'];

if (!APP_PASSWORD || APP_PASSWORD.length < 4) {
  console.error('خطأ: اضبط متغير البيئة APP_PASSWORD (4 أحرف على الأقل) قبل التشغيل.');
  process.exit(1);
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const KEY = Buffer.concat([sha('k|' + (process.env.SESSION_SECRET || '')), sha('p|' + APP_PASSWORD)]);
const b64u = (b) => Buffer.from(b).toString('base64url');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- الدخول ---------- */
function signToken() {
  const payload = b64u(JSON.stringify({ exp: Date.now() + TOKEN_MS }));
  const sig = b64u(crypto.createHmac('sha256', KEY).update(payload).digest());
  return payload + '.' + sig;
}
function verifyToken(tok) {
  if (typeof tok !== 'string') return false;
  const i = tok.indexOf('.');
  if (i < 1) return false;
  const payload = tok.slice(0, i);
  const want = crypto.createHmac('sha256', KEY).update(payload).digest();
  let got;
  try { got = Buffer.from(tok.slice(i + 1), 'base64url'); } catch (e) { return false; }
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); } catch (e) { return false; }
}
function passwordOk(p) {
  return typeof p === 'string' && crypto.timingSafeEqual(sha(p), sha(APP_PASSWORD));
}
const fails = new Map();
function limited(ip) {
  const f = fails.get(ip);
  return !!(f && f.until > Date.now());
}
function noteFail(ip) {
  const f = fails.get(ip) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= 5) { f.until = Date.now() + 15 * 60 * 1000; f.n = 0; }
  fails.set(ip, f);
  if (fails.size > 5000) fails.clear();
}

/* ---------- التخزين ---------- */
class FileStore {
  constructor(file) {
    this.file = file;
    this.kind = 'file';
    this.m = new Map();
    this.chain = Promise.resolve();
  }
  async init() {
    try { Object.entries(JSON.parse(fs.readFileSync(this.file, 'utf8'))).forEach(([k, v]) => this.m.set(k, v)); } catch (e) { /* ملف جديد */ }
  }
  persist() {
    const obj = {};
    this.m.forEach((v, k) => { obj[k] = v; });
    this.chain = this.chain.then(() => {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(obj));
      fs.renameSync(tmp, this.file);
    }).catch((e) => console.error('write failed', e.message));
    return this.chain;
  }
  async get(p) { const v = this.m.get(p); return v ? { data: v.data, updated: v.updated } : null; }
  async put(p, data) { this.m.set(p, { data, updated: new Date().toISOString() }); await this.persist(); }
  async del(p) { this.m.delete(p); await this.persist(); }
  async list(prefix) {
    const out = [];
    this.m.forEach((v, k) => { if (k.startsWith(prefix + '/')) out.push({ path: k, data: v.data, updated: v.updated }); });
    return out;
  }
  async all() {
    const out = [];
    for (const pre of PREFIXES) out.push(...(await this.list(pre)));
    return out;
  }
}

class PgStore {
  constructor(url) {
    const { Pool } = require('pg');
    this.kind = 'postgres';
    this.pool = new Pool({ connectionString: url, max: 4, idleTimeoutMillis: 20000, connectionTimeoutMillis: 25000 });
    this.pool.on('error', (e) => console.error('pg idle error:', e.message));
  }
  async q(text, params) {
    try {
      return await this.pool.query(text, params);
    } catch (e) {
      const transient = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', '57P01', '08006', '08001', '08003'].includes(e.code) || /terminat|timeout|closed/i.test(e.message || '');
      if (!transient) throw e;
      await sleep(1000); /* قاعدة Neon قد تكون نائمة وتحتاج لحظات */
      return this.pool.query(text, params);
    }
  }
  async init() {
    await this.q('CREATE TABLE IF NOT EXISTS docs (path text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
  }
  async get(p) {
    const r = await this.q('SELECT data, updated_at FROM docs WHERE path = $1', [p]);
    return r.rows[0] ? { data: r.rows[0].data, updated: r.rows[0].updated_at } : null;
  }
  async put(p, data) {
    await this.q('INSERT INTO docs (path, data, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data, updated_at = now()', [p, JSON.stringify(data)]);
  }
  async del(p) { await this.q('DELETE FROM docs WHERE path = $1', [p]); }
  async list(prefix) {
    const r = await this.q('SELECT path, data, updated_at FROM docs WHERE path LIKE $1 ORDER BY path', [prefix + '/%']);
    return r.rows.map((x) => ({ path: x.path, data: x.data, updated: x.updated_at }));
  }
  async all() {
    const r = await this.q('SELECT path, data, updated_at FROM docs ORDER BY path');
    return r.rows.map((x) => ({ path: x.path, data: x.data, updated: x.updated_at }));
  }
}

const store = DATABASE_URL ? new PgStore(DATABASE_URL) : new FileStore(DATA_FILE);

/* ---------- مساعدات HTTP ---------- */
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

function baseHeaders(extra) {
  return Object.assign({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': CSP
  }, extra || {});
}
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, baseHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) }));
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null); }
      catch (e) { reject(Object.assign(new Error('bad json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  return (xf ? String(xf).split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';
}
function authed(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') && verifyToken(h.slice(7));
}

/* ---------- واجهة API ---------- */
async function api(req, res, url) {
  const route = url.pathname;
  if (route === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, app: 'sijil-alfasl', storage: store.kind });
  }
  if (route === '/api/login' && req.method === 'POST') {
    const ip = clientIp(req);
    if (limited(ip)) return sendJson(res, 429, { error: 'محاولات كثيرة. حاول بعد 15 دقيقة.' });
    const body = await readBody(req);
    if (!body || !passwordOk(body.password)) { noteFail(ip); return sendJson(res, 401, { error: 'كلمة المرور غير صحيحة' }); }
    fails.delete(ip);
    return sendJson(res, 200, { token: signToken() });
  }
  if (!authed(req)) return sendJson(res, 401, { error: 'unauthenticated' });

  if (route === '/api/docs' && req.method === 'GET') {
    const prefix = url.searchParams.get('prefix') || '';
    if (!PREFIXES.includes(prefix)) return sendJson(res, 400, { error: 'bad prefix' });
    return sendJson(res, 200, { docs: await store.list(prefix) });
  }
  if (route === '/api/export' && req.method === 'GET') {
    return sendJson(res, 200, { docs: await store.all() });
  }
  if (route === '/api/doc') {
    const p = url.searchParams.get('path') || '';
    if (!PATH_RE.test(p)) return sendJson(res, 400, { error: 'bad path' });
    if (req.method === 'GET') {
      const d = await store.get(p);
      return sendJson(res, 200, d ? { data: d.data, updated: d.updated } : { data: null });
    }
    if (req.method === 'PUT') {
      const body = await readBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJson(res, 400, { error: 'body must be an object' });
      await store.put(p, body);
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      await store.del(p);
      return sendJson(res, 200, { ok: true });
    }
  }
  return sendJson(res, 404, { error: 'not found' });
}

/* ---------- الملفات الثابتة ---------- */
const gzCache = new Map();
function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, baseHeaders({ Allow: 'GET, HEAD' })); return res.end(); }
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400, baseHeaders()); return res.end(); }
  if (rel.includes('\0')) { res.writeHead(400, baseHeaders()); return res.end(); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403, baseHeaders()); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, baseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' })); return res.end('غير موجود'); }
    const ext = path.extname(file).toLowerCase();
    const type = TYPES[ext] || 'application/octet-stream';
    const headers = baseHeaders({ 'Content-Type': type, 'Cache-Control': 'no-cache', 'Last-Modified': st.mtime.toUTCString() });
    const compressible = /^(text|application\/(json|manifest|javascript))|svg/.test(type) && st.size > 1024;
    const wantGz = compressible && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    fs.readFile(file, (e2, buf) => {
      if (e2) { res.writeHead(500, baseHeaders()); return res.end(); }
      let out = buf;
      if (wantGz) {
        const key = file + ':' + st.mtimeMs;
        out = gzCache.get(key);
        if (!out) { out = zlib.gzipSync(buf); gzCache.set(key, out); }
        headers['Content-Encoding'] = 'gzip';
        headers.Vary = 'Accept-Encoding';
      }
      headers['Content-Length'] = out.length;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : out);
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error('request failed:', e.message);
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'server error' : e.message });
    else res.end();
  }
});
server.keepAliveTimeout = 65000;

store.init().then(() => {
  server.listen(PORT, () => {
    console.log('سجل الفصل يعمل على المنفذ ' + PORT + ' · التخزين: ' + store.kind);
    if (store.kind === 'file') console.log('تنبيه: بدون DATABASE_URL تُحفظ البيانات في ملف محلي فقط (للتجربة).');
  });
}).catch((e) => {
  console.error('تعذر الاتصال بقاعدة البيانات:', e.message);
  process.exit(1);
});
