const params = new URLSearchParams(location.search);
const bookId = params.get('book') || 'bereshit';

const paneMain = document.getElementById('pane-main');
const paneCommentary = document.getElementById('pane-commentary');
const btnSync = document.getElementById('btn-sync-scroll');
const btnBookmark = document.getElementById('btn-bookmark');
const btnSearchToggle = document.getElementById('btn-search-toggle');
const searchPanel = document.getElementById('search-panel');
const searchResults = document.getElementById('search-results');

let syncEnabled = true;
let isSyncing = false; // guards against feedback loop between the two scroll listeners

async function init() {
  const book = await Library.getBook(bookId);
  if (!book) {
    document.getElementById('book-title').textContent = 'הספר לא נמצא בספריית הדמו';
    return;
  }

  document.getElementById('book-title').textContent = book.title;
  document.getElementById('book-sub').textContent =
    book.commentators.length ? `עם ${book.commentators.length} מפרשים` : 'ללא מפרשים בדמו זה';

  paneMain.innerHTML = book.sections.map((s, i) => `
    <div class="section" data-i="${i}" id="main-${i}">
      <div class="ref">${s.ref}</div>
      <div class="text">${s.text}</div>
    </div>`).join('');

  paneCommentary.innerHTML = book.sections.map((s, i) => {
    const firstCommentator = book.commentators[0];
    const c = s.commentary && firstCommentator ? s.commentary[firstCommentator] : null;
    return `
      <div class="section" data-i="${i}" id="comm-${i}">
        <div class="ref">${s.ref}</div>
        ${c ? `<div class="text">${c}</div>` : `<div class="empty-commentary">אין פירוש זמין בדמו לקטע זה</div>`}
      </div>`;
  }).join('');

  wireScrollSync();
  wireActiveHighlight(book);
  restoreBookmarkPrompt();
}

function wireScrollSync() {
  paneMain.addEventListener('scroll', () => mirrorScroll(paneMain, paneCommentary));
  paneCommentary.addEventListener('scroll', () => mirrorScroll(paneCommentary, paneMain));
}

function mirrorScroll(source, target) {
  if (!syncEnabled || isSyncing) return;
  isSyncing = true;
  const ratio = source.scrollTop / (source.scrollHeight - source.clientHeight || 1);
  target.scrollTop = ratio * (target.scrollHeight - target.clientHeight);
  requestAnimationFrame(() => { isSyncing = false; });
}

function wireActiveHighlight(book) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const i = entry.target.dataset.i;
        document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
        document.getElementById(`main-${i}`)?.classList.add('active');
        document.getElementById(`comm-${i}`)?.classList.add('active');
      }
    });
  }, { root: paneMain, threshold: 0.6 });

  paneMain.querySelectorAll('.section').forEach(el => observer.observe(el));
}

btnSync.addEventListener('click', () => {
  syncEnabled = !syncEnabled;
  btnSync.classList.toggle('active', syncEnabled);
});

btnBookmark.addEventListener('click', () => {
  const key = `otzaria-bookmark-${bookId}`;
  localStorage.setItem(key, JSON.stringify({ scrollTop: paneMain.scrollTop, ts: Date.now() }));
  btnBookmark.textContent = 'נשמר ✓';
  setTimeout(() => { btnBookmark.textContent = 'סמן מקום'; }, 1500);
});

function restoreBookmarkPrompt() {
  const key = `otzaria-bookmark-${bookId}`;
  const saved = localStorage.getItem(key);
  if (!saved) return;
  const { scrollTop } = JSON.parse(saved);
  if (confirm('נמצאה סימניה שמורה לספר זה. לחזור למקום האחרון?')) {
    paneMain.scrollTop = scrollTop;
  }
}

btnSearchToggle.addEventListener('click', () => {
  searchPanel.classList.toggle('open');
});

// חיפוש בתוך פאנל הקריאה (מוצג כשלוחצים "חיפוש")
searchPanel.insertAdjacentHTML('afterbegin', `
  <input id="reader-search-input" type="text" placeholder="חפש…"
    style="width:100%;padding:8px 10px;margin-bottom:14px;border:1px solid var(--parchment-line);border-radius:3px;font-family:var(--sans)">
`);
document.getElementById('reader-search-input').addEventListener('input', async (e) => {
  const hits = await Library.search(e.target.value);
  searchResults.innerHTML = hits.length
    ? hits.map(h => `
        <a class="search-result" href="reader.html?book=${h.bookId}">
          <div class="book">${h.bookTitle} · ${h.ref}</div>
          <div class="snippet">${h.snippet}</div>
        </a>`).join('')
    : '<div class="empty-commentary">אין תוצאות</div>';
});

init();
