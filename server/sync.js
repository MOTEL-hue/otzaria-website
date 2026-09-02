/*
 * sync.js — סנכרון ספרייה מול GitHub Releases.
 *
 * זהו יישום אמיתי (לא מדומה) של הדפוס שמתואר ב-README/Wiki של אוצריא:
 * ריפו אחד (SeforimLibrary / otzaria-library) מפרסם release חדש בכל
 * עדכון ספרייה, כולל:
 *   - seforim.db.zst              — מסד נתונים מלא (SQLite דחוס)
 *   - patch-v<OLD>-v<NEW>.db.zst  — דלתא בין שתי גרסאות (קטן וממוקד)
 * וריפו שני (otzaria_library_updater) הוא הצרכן: בודק גרסה מקומית מול
 * הגרסה האחרונה, ומוריד דלתא אם קיימת, אחרת DB מלא.
 *
 * הקובץ הזה מיישם את אותו זרימת-עבודה בצד ה-Node. כמה הערות כנות:
 *
 *  1. פענוח zstd: Node אין לו דחיסת zstd מובנית. הקוד כאן קורא ל-
 *     בינארי `zstd` דרך שורת פקודה (npm i -g zstd, או apt install zstd).
 *     זה בכוונה — ספריות zstd טהורות ל-JS פחות אמינות למסדי נתונים
 *     בגודל גיגה-בייטים.
 *  2. GitHub מגביל בקשות אנונימיות ל-60/שעה. להרצה רצינית, הגדירו
 *     GITHUB_TOKEN בסביבה (ייכנס אוטומטית ל-Authorization header).
 *  3. הקוד הזה *לא* מפרק את ה-SQLite לספרים בודדים — זה הצעד הבא
 *     (require('better-sqlite3') ולקרוא את הטבלאות; מבנה הטבלאות
 *     תלוי בסכמה של SeforimLibrary ודורש בדיקה מול המקור בפועל
 *     לפני מימוש, כי הוא יכול להשתנות בין גרסאות).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const REPO = process.env.LIBRARY_REPO || 'Sivan22/otzaria-library';
const STATE_FILE = path.join(__dirname, 'sync-state.json');
const DOWNLOAD_DIR = path.join(__dirname, 'library-downloads');

function readState() {
  if (!fs.existsSync(STATE_FILE)) {
    return { version: null, bookCount: 0, lastSync: null };
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function githubApiGet(pathname) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: pathname,
      headers: {
        'User-Agent': 'otzaria-web-sync',
        Accept: 'application/vnd.github+json',
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
      }
    };
    https.get(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`GitHub API ${res.statusCode}: ${body}`));
        }
        resolve(JSON.parse(body));
      });
    }).on('error', reject);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, { headers: { 'User-Agent': 'otzaria-web-sync' } }, (res) => {
      // GitHub release assets 302-redirect to S3 — follow once.
      if (res.statusCode === 302 || res.statusCode === 301) {
        return downloadFile(res.headers.location, destPath).then(resolve, reject);
      }
      if (res.statusCode >= 400) {
        return reject(new Error(`download failed: ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

async function getLatestRelease() {
  return githubApiGet(`/repos/${REPO}/releases/latest`);
}

async function getSyncStatus() {
  const state = readState();
  let remoteVersion = null;
  try {
    const release = await getLatestRelease();
    remoteVersion = release.tag_name;
  } catch (e) {
    // אין רשת/הוגבל הקצב — נחזיר את המצב המקומי בלבד
  }

  return {
    version: state.version || 'לא מסונכרן',
    bookCount: state.bookCount || 0,
    lastSync: state.lastSync,
    remoteVersion,
    updateAvailable: remoteVersion ? remoteVersion !== state.version : false
  };
}

async function runSync() {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const state = readState();
  const release = await getLatestRelease();
  const remoteVersion = release.tag_name;

  if (remoteVersion === state.version) {
    return { status: 'up-to-date', version: state.version };
  }

  const assets = release.assets || [];
  const deltaAsset = state.version
    ? assets.find(a => a.name === `patch-${state.version}-${remoteVersion}.db.zst`)
    : null;
  const fullAsset = assets.find(a => a.name === 'seforim.db.zst');

  const chosen = deltaAsset || fullAsset;
  if (!chosen) {
    throw new Error(`no usable asset found in release ${remoteVersion}`);
  }

  const destPath = path.join(DOWNLOAD_DIR, chosen.name);
  await downloadFile(chosen.browser_download_url, destPath);

  // פענוח zstd -> .db. דורש בינארי zstd מותקן על השרת.
  const dbPath = destPath.replace(/\.zst$/, '');
  try {
    execSync(`zstd -d -f "${destPath}" -o "${dbPath}"`);
  } catch (e) {
    throw new Error(
      `הורדה הצליחה אך פענוח zstd נכשל — ודאו ש-zstd מותקן (apt install zstd). ${e.message}`
    );
  }

  // TODO (הצעד הבא): לפתוח את dbPath עם better-sqlite3, ולעדכן/למזג
  // אל ה-DB התפעולי (או לייצא ל-JSON/Postgres, לפי ארכיטקטורת ה-API).
  // מוגדר בכוונה כשלב נפרד, כי מבנה הטבלאות תלוי בגרסת SeforimLibrary.

  const newState = {
    version: remoteVersion,
    bookCount: state.bookCount, // יעודכן בפועל אחרי שלב הטעינה ל-DB
    lastSync: new Date().toISOString()
  };
  writeState(newState);

  return { status: deltaAsset ? 'updated-via-delta' : 'updated-via-full-db', ...newState };
}

module.exports = { getSyncStatus, runSync };
