const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const PROGRESS_FILE = path.join(__dirname, 'progress.json');
const MAX_BODY = 1024 * 1024; // 1MB limit

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
};

function defaultProgress() {
  return { answered: {}, wrongIds: [], favIds: [], tagIds: {}, dailyStats: {}, positions: {} };
}

if (!fs.existsSync(PROGRESS_FILE)) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(defaultProgress(), null, 2));
}

function readProgress() {
  try {
    const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    // Validate shape; repair if corrupt
    if (typeof data !== 'object' || data === null) throw new Error('invalid');
    return {
      answered: typeof data.answered === 'object' && data.answered !== null ? data.answered : {},
      wrongIds: Array.isArray(data.wrongIds) ? data.wrongIds : [],
      favIds: Array.isArray(data.favIds) ? data.favIds : [],
      tagIds: typeof data.tagIds === 'object' && data.tagIds !== null ? data.tagIds : {},
      dailyStats: typeof data.dailyStats === 'object' && data.dailyStats !== null ? data.dailyStats : {},
      positions: typeof data.positions === 'object' && data.positions !== null ? data.positions : {},
    };
  } catch {
    const def = defaultProgress();
    try { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(def, null, 2)); } catch {}
    return def;
  }
}

function validateProgress(data) {
  const valid = {};
  if (typeof data.answered === 'object' && data.answered !== null) valid.answered = data.answered;
  if (Array.isArray(data.wrongIds)) valid.wrongIds = data.wrongIds;
  if (Array.isArray(data.favIds)) valid.favIds = data.favIds;
  if (typeof data.tagIds === 'object' && data.tagIds !== null) valid.tagIds = data.tagIds;
  if (typeof data.dailyStats === 'object' && data.dailyStats !== null) valid.dailyStats = data.dailyStats;
  if (typeof data.positions === 'object' && data.positions !== null) valid.positions = data.positions;
  return { ...defaultProgress(), ...valid };
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/progress' && req.method === 'GET') {
    const data = readProgress();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

  if (req.url === '/api/progress' && req.method === 'POST') {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { res.writeHead(413); res.end('Too large'); req.destroy(); return; }
      body += chunk;
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const validated = validateProgress(data);
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(validated, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid json' }));
      }
    });
    return;
  }

  // Static files
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.resolve(path.join(__dirname, urlPath));
  // Path traversal guard
  if (!filePath.startsWith(path.resolve(__dirname))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  const ext = path.extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const headers = { 'Content-Type': mime };
    if (ext === '.html') {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Progress saved to: ${PROGRESS_FILE}`);
});
