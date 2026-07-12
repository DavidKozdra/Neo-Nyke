// Local-only static server and filesystem bridge for the in-game sprite editor.
// This deliberately does not live in the deployed Cloudflare Worker: Workers
// cannot (and should not) write to a developer's checkout.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HOST = process.env.EDITOR_HOST || '127.0.0.1';
const PORT = Number(process.env.EDITOR_PORT || 5173);
const EDITABLE_FILES = new Set([
  'assets/sprites/combatants.js',
  'assets/sprites/environment.js',
  'assets/sprites/icons.js',
  'js/draw/character-sheets.js',
]);
const EDITABLE_IMAGE_DIRS = ['assets/sprites/chars/', 'assets/sprites/env/'];
const MIME = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
};

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function normalizeEditablePath(input) {
  const relative = String(input || '').replaceAll('\\', '/').replace(/^\/+/, '');
  if (!relative || relative.includes('\0')) return null;
  const absolute = path.resolve(ROOT, relative);
  if (absolute !== ROOT && !absolute.startsWith(`${ROOT}${path.sep}`)) return null;
  const normalized = path.relative(ROOT, absolute).replaceAll(path.sep, '/');
  const isImage = EDITABLE_IMAGE_DIRS.some(dir => normalized.startsWith(dir)) && /\.png$/i.test(normalized);
  return EDITABLE_FILES.has(normalized) || isImage ? { absolute, relative: normalized } : null;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw new Error('Request is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handleEditorApi(req, res, pathname) {
  if (pathname === '/api/editor/status' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, root: ROOT });
  }
  if (pathname !== '/api/editor/file' || req.method !== 'PUT') return false;
  try {
    const body = JSON.parse(await readBody(req));
    const target = normalizeEditablePath(body.path);
    if (!target) return sendJson(res, 403, { error: 'That path is not editable by the sprite editor.' });
    if (body.encoding !== 'utf8' && body.encoding !== 'base64') {
      return sendJson(res, 400, { error: 'encoding must be utf8 or base64' });
    }
    const data = Buffer.from(String(body.content || ''), body.encoding);
    await fs.mkdir(path.dirname(target.absolute), { recursive: true });
    await fs.writeFile(target.absolute, data);
    return sendJson(res, 200, { ok: true, path: target.relative, bytes: data.length });
  } catch (error) {
    return sendJson(res, error.message === 'Request is too large' ? 413 : 400, { error: error.message });
  }
}

async function serveStatic(res, pathname) {
  let relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!relative) relative = 'editor.html';
  const absolute = path.resolve(ROOT, relative);
  if (absolute !== ROOT && !absolute.startsWith(`${ROOT}${path.sep}`)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  try {
    const stat = await fs.stat(absolute);
    const file = stat.isDirectory() ? path.join(absolute, 'index.html') : absolute;
    const data = await fs.readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const handled = await handleEditorApi(req, res, url.pathname);
  if (handled !== false) return;
  await serveStatic(res, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`NeoNyke sprite editor: http://${HOST}:${PORT}/editor.html`);
  console.log(`Writable project root: ${ROOT}`);
});
