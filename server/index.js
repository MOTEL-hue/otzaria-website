const express = require('express');
const path = require('path');
const fs = require('fs');
const { getSyncStatus, runSync } = require('./sync');

const app = express();

// יומן תקלות חסכוני: פרטים טכניים בלבד, בלי שאילתות או גוף בקשה.
function logBug(kind, error, req) {
  const safePath = (req && req.path ? req.path : "/").slice(0, 160);
  const message = String(error && error.message ? error.message : error || "שגיאה לא ידועה")
    .replace(/https?:\/\/\S+/g, "[כתובת]")
    .replace(/(token|secret|password|authorization|cookie)=([^&\s]+)/ig, "$1=[הוסתר]")
    .slice(0, 240);
  console.error(JSON.stringify({
    מערכת: "אוצריא",
    סוג: String(kind || "שגיאת שרת").slice(0, 40),
    נתיב: safePath,
    הודעה: message,
    זמן: new Date().toISOString()
  }));
}

const PORT = process.env.PORT || 3000;
const DATA_PATH = path.join(__dirname, '..', 'public', 'data', 'library.json');

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

function loadLibrary() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
}

// GET /api/library — full catalog (categories + books).
// בפריסה אמיתית זה נטען מ-SQLite (seforim.db) ולא מקובץ JSON יחיד.
app.get('/api/library', (req, res) => {
  res.json(loadLibrary());
});

// חיפוש שמתעלם מניקוד/טעמים בין האותיות (הטקסט מנוקד, שאילתת המשתמש בד"כ לא).
const NIQQUD_RANGE = '\\u0591-\\u05C7';
function buildFuzzyRegex(query) {
  const escaped = [...query].map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(escaped.join(`[${NIQQUD_RANGE}]*`));
}

// GET /api/search?q=... — חיפוש טקסטואלי.
// כרגע: סריקה נאיבית על ה-JSON, כמו בצד הלקוח.
// בפריסה אמיתית: שאילתת FTS5 / tantivy מול אינדקס מלא של הספרייה.
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);

  const regex = buildFuzzyRegex(q);
  const lib = loadLibrary();
  const results = [];
  for (const bookId of Object.keys(lib.books)) {
    const book = lib.books[bookId];
    for (const section of book.sections) {
      if (regex.test(section.text)) {
        results.push({ bookId, bookTitle: book.title, ref: section.ref, snippet: section.text });
      }
    }
  }
  res.json(results);
});

// GET /api/sync/status — גרסת ספרייה נוכחית + האם קיים עדכון.
app.get('/api/sync/status', async (req, res) => {
  try {
    const status = await getSyncStatus();
    res.json(status);
  } catch (e) {
    res.status(503).json({ error: 'sync backend unavailable', detail: e.message });
  }
});

// POST /api/sync/run — מפעיל עדכון ספרייה (delta אם אפשר, אחרת מלא).
app.post('/api/sync/run', async (req, res) => {
  try {
    const result = await runSync();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'sync failed', detail: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`otzaria-web listening on http://localhost:${PORT}`);
});
