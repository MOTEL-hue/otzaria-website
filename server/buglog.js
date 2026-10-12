'use strict';

// Lightweight process-local error logger: bounded memory, deduplication, no request bodies.
const recent = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_KEYS = 200;

function record(type, message, context = {}) {
  const now = Date.now();
  for (const [key, time] of recent) {
    if (now - time >= WINDOW_MS) recent.delete(key);
  }
  const safe = {
    project: 'otzaria-website',
    type: String(type).slice(0, 40),
    message: String(message || 'Unknown error').replace(/https?:\/\/[^\s?]+\?[^\s]+/g, '[url]').slice(0, 240),
    path: String(context.path || '').split('?')[0].slice(0, 180),
    status: Number(context.status) || undefined,
    time: new Date(now).toISOString()
  };
  const key = JSON.stringify(safe);
  if (recent.has(key)) return;
  if (recent.size >= MAX_KEYS) recent.delete(recent.keys().next().value);
  recent.set(key, now);
  console.error('[bug-monitor]', JSON.stringify(safe));
}

function middleware(req, res, next) {
  res.on('finish', () => {
    if (res.statusCode >= 500) {
      record('http_5xx', 'HTTP ' + res.statusCode, { path: req.path, status: res.statusCode });
    }
  });
  next();
}

module.exports = { middleware, record };
