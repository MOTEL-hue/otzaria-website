/*
 * שכבת גישה לספרייה.
 *
 * בדמו הזה הנתונים נטענים מקובץ JSON סטטי (data/library.json).
 * בפריסה אמיתית, ההחלפה כאן היא מול /api/library ו-/api/search
 * שמוגשים ע"י השרת ב-server/, שמסתנכרן בפועל מול GitHub Releases
 * (ראו server/sync.js). שאר הקוד בצד הלקוח לא צריך להשתנות.
 */

const Library = (() => {
  let cache = null;

  async function load() {
    if (cache) return cache;
    const res = await fetch('data/library.json');
    cache = await res.json();
    return cache;
  }

  async function getBook(id) {
    const lib = await load();
    return lib.books[id] || null;
  }

  async function getCategories() {
    const lib = await load();
    return lib.categories;
  }

  // בונה regex שמתעלם מניקוד/טעמים בין האותיות, כי הטקסט המקורי
  // מנוקד (למשל "בְּרֵאשִׁית") בעוד שמשתמשים בד"כ מחפשים בלי ניקוד ("בראשית").
  const NIQQUD_RANGE = '\\u0591-\\u05C7';
  function buildFuzzyRegex(query) {
    const escaped = [...query].map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(escaped.join(`[${NIQQUD_RANGE}]*`), 'g');
  }

  // חיפוש טקסטואלי פשוט על פני כל הספרייה שנטענה.
  // בגרסה מלאה זה מוחלף בקריאת רשת ל-/api/search שמריצה אינדקס
  // מלא (למשל tantivy / SQLite FTS5) על כל ~7,000 הספרים.
  async function search(query) {
    if (!query || query.trim().length < 2) return [];
    const lib = await load();
    const q = query.trim();
    const regex = buildFuzzyRegex(q);
    const results = [];

    for (const bookId of Object.keys(lib.books)) {
      const book = lib.books[bookId];
      for (const section of book.sections) {
        if (regex.test(section.text)) {
          results.push({
            bookId,
            bookTitle: book.title,
            ref: section.ref,
            snippet: highlight(section.text, regex)
          });
        }
        regex.lastIndex = 0;
      }
    }
    return results;
  }

  function highlight(text, regex) {
    return text.replace(regex, m => `<mark>${m}</mark>`);
  }

  return { load, getBook, getCategories, search };
})();
