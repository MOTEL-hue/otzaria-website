async function renderCategories() {
  const el = document.getElementById('categories');
  const categories = await Library.getCategories();
  const lib = await Library.load();

  el.innerHTML = categories.map((cat, i) => {
    const bookLinks = cat.books.map(id => lib.books[id].title).join(', ');
    const first = cat.books[0];
    return `
      <a class="category" href="${first ? `reader.html?book=${first}` : '#'}">
        <div>
          <div class="num">${String(i + 1).padStart(2, '0')}</div>
          <h3>${cat.title}</h3>
          <p>${cat.description}</p>
        </div>
        <div class="count">${cat.books.length ? bookLinks : 'בקרוב בגרסת הדמו'}</div>
      </a>`;
  }).join('');
}

async function renderSyncStatus() {
  // בפריסה אמיתית: GET /api/sync/status (ראו server/sync.js)
  const el = document.getElementById('sync-text');
  try {
    const res = await fetch('/api/sync/status');
    if (!res.ok) throw new Error('no backend');
    const data = await res.json();
    el.textContent = `מסונכרן עם גרסה ${data.version} · ${data.bookCount} ספרים`;
  } catch (e) {
    el.textContent = 'מצב דמו — ללא חיבור לשרת סנכרון (ראו server/sync.js)';
  }
}

function wireSearch() {
  const input = document.getElementById('global-search');
  const panel = document.getElementById('search-panel');
  const results = document.getElementById('search-results');

  input.addEventListener('input', async () => {
    const hits = await Library.search(input.value);
    panel.classList.toggle('open', input.value.trim().length >= 2);
    results.innerHTML = hits.length
      ? hits.map(h => `
          <a class="search-result" href="reader.html?book=${h.bookId}">
            <div class="book">${h.bookTitle} · ${h.ref}</div>
            <div class="snippet">${h.snippet}</div>
          </a>`).join('')
      : '<div class="empty-commentary">אין תוצאות בספריית הדמו</div>';
  });

  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== input) {
      panel.classList.remove('open');
    }
  });
}

renderCategories();
renderSyncStatus();
wireSearch();
