'use strict';

// Finds every browser history database on this computer, fresh on every run,
// and reads the visits newer than a cursor.
//
// Why nothing here is stored as a path: the community Browser History plugin
// kept one fixed path to Chrome's History file, and it broke twice in four
// months -- once when the Mac's user folder changed from /Users/anh to
// /Users/hoanganh, once when Chrome's "Profile 1" was replaced by "Default".
// A source is therefore identified by browser and profile folder
// ("Chrome/Default"), and its file is looked up again each time.

const fs = require('fs');
const os = require('os');
const path = require('path');

// [browser, folder under ~/Library/Application Support (macOS), folder under ~ (Linux)]
const CHROMIUM = [
  ['Chrome', 'Google/Chrome', '.config/google-chrome'],
  ['Chrome Beta', 'Google/Chrome Beta', '.config/google-chrome-beta'],
  ['Chromium', 'Chromium', '.config/chromium'],
  ['Chromium', null, 'snap/chromium/common/chromium'],
  ['Brave', 'BraveSoftware/Brave-Browser', '.config/BraveSoftware/Brave-Browser'],
  ['Edge', 'Microsoft Edge', '.config/microsoft-edge'],
  ['Vivaldi', 'Vivaldi', '.config/vivaldi'],
  ['Opera', 'com.operasoftware.Opera', '.config/opera'],
  ['Arc', 'Arc/User Data', null],
  ['Helium', 'net.imput.helium', null],
];

const FIREFOX = [
  // [browser, macOS folder under Application Support, Linux folder under ~]
  ['Firefox', 'Firefox/Profiles', '.mozilla/firefox'],
  ['Firefox', null, 'snap/firefox/common/.mozilla/firefox'],
  ['Zen', 'zen/Profiles', '.zen'],
];

// Profile folders that hold no one's browsing.
const SKIP_PROFILES = new Set(['System Profile', 'Guest Profile']);

function exists(p) {
  try { fs.statSync(p); return true; } catch (_) { return false; }
}

function findBrowsers(home = os.homedir(), platform = process.platform) {
  const mac = platform === 'darwin';
  const support = path.join(home, 'Library', 'Application Support');
  const found = [];

  for (const [browser, macDir, linuxDir] of CHROMIUM) {
    const rel = mac ? macDir : linuxDir;
    if (!rel) continue;
    const root = mac ? path.join(support, rel) : path.join(home, rel);
    if (!exists(root)) continue;
    // Chrome writes the names people gave their profiles into Local State.
    let names = {};
    try {
      const state = JSON.parse(fs.readFileSync(path.join(root, 'Local State'), 'utf8'));
      for (const [dir, info] of Object.entries((state.profile && state.profile.info_cache) || {})) {
        if (info && info.name) names[dir] = info.name;
      }
    } catch (_) { /* no Local State: folder names will do */ }
    // Opera keeps a single profile in the root folder itself.
    const dirs = exists(path.join(root, 'History')) ? [''] : [];
    try {
      for (const d of fs.readdirSync(root)) {
        if (SKIP_PROFILES.has(d)) continue;
        if (exists(path.join(root, d, 'History'))) dirs.push(d);
      }
    } catch (_) {}
    for (const d of dirs) {
      found.push({
        id: `${browser}/${d || 'Default'}`,
        browser,
        profile: names[d] || d || 'Default',
        kind: 'chromium',
        file: path.join(root, d, 'History'),
      });
    }
  }

  for (const [browser, macDir, linuxDir] of FIREFOX) {
    const rel = mac ? macDir : linuxDir;
    if (!rel) continue;
    const root = mac ? path.join(support, rel) : path.join(home, rel);
    let dirs = [];
    try { dirs = fs.readdirSync(root); } catch (_) { continue; }
    for (const d of dirs) {
      const file = path.join(root, d, 'places.sqlite');
      if (!exists(file)) continue;
      // Profile folders are "<random>.<name>"; the name is the readable part.
      found.push({ id: `${browser}/${d}`, browser, profile: d.replace(/^[^.]*\./, ''), kind: 'firefox', file });
    }
  }

  if (mac) {
    const file = path.join(home, 'Library', 'Safari', 'History.db');
    if (exists(file)) found.push({ id: 'Safari/Default', browser: 'Safari', profile: 'Default', kind: 'safari', file });
  }
  return found;
}

// Each query returns id, ms (Unix milliseconds, local time applied later),
// url, title, for visits with id above the cursor. Chrome counts microseconds
// from 1601 and Safari seconds from 2001; the conversion happens in SQL because
// Chrome's raw value is larger than a JavaScript number holds exactly.
const QUERIES = {
  chromium: {
    maxId: 'SELECT max(id) AS n FROM visits',
    visits: `SELECT v.id AS id, (v.visit_time / 1000 - 11644473600000) AS ms, u.url AS url, u.title AS title
             FROM visits v JOIN urls u ON u.id = v.url
             WHERE v.id > ? AND (v.visit_time / 1000 - 11644473600000) > ? ORDER BY v.id`,
  },
  firefox: {
    maxId: 'SELECT max(id) AS n FROM moz_historyvisits',
    visits: `SELECT v.id AS id, (v.visit_date / 1000) AS ms, p.url AS url, p.title AS title
             FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id
             WHERE v.id > ? AND (v.visit_date / 1000) > ? ORDER BY v.id`,
  },
  safari: {
    maxId: 'SELECT max(id) AS n FROM history_visits',
    visits: `SELECT v.id AS id, CAST((v.visit_time + 978307200) * 1000 AS INTEGER) AS ms, i.url AS url, v.title AS title
             FROM history_visits v JOIN history_items i ON i.id = v.history_item
             WHERE v.id > ? AND CAST((v.visit_time + 978307200) * 1000 AS INTEGER) > ? ORDER BY v.id`,
  },
};

// A running browser holds its database locked, so it is copied first, with
// its -journal / -wal side files, which carry writes not yet in the main file
// (Firefox and Safari keep recent visits in the -wal file for a while).
function copyDatabase(file) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-browser-history-'));
  const copy = path.join(dir, 'history.sqlite');
  fs.copyFileSync(file, copy);
  for (const side of ['-wal', '-journal', '-shm']) {
    if (exists(file + side)) fs.copyFileSync(file + side, copy + side);
  }
  return { dir, copy };
}

function query(copy, sql, params) {
  let sqlite = null;
  try { sqlite = require('node:sqlite'); } catch (_) { /* older Obsidian: fall back to the sqlite3 program */ }
  if (sqlite) {
    const db = new sqlite.DatabaseSync(copy);
    try { return db.prepare(sql).all(...params); } finally { db.close(); }
  }
  // Every parameter is an integer, so inlining them is safe.
  let i = 0;
  const inlined = sql.replace(/\?/g, () => String(Math.floor(Number(params[i++]) || 0)));
  const out = require('child_process').execFileSync('sqlite3', ['-json', copy, inlined], {
    encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024,
  });
  return out.trim() ? JSON.parse(out) : [];
}

// cursor: { id, ms } -- the last visit read. If the browser's largest visit id
// is below the cursor, its database was rebuilt (a reset profile, a reinstall)
// and ids started over, so reading falls back to time alone.
function readVisits(source, cursor = { id: 0, ms: 0 }) {
  const q = QUERIES[source.kind];
  const { dir, copy } = copyDatabase(source.file);
  try {
    const top = query(copy, q.maxId, [])[0];
    const maxId = Number((top && top.n) || 0);
    const rebuilt = maxId < (cursor.id || 0);
    const fromId = rebuilt ? 0 : (cursor.id || 0);
    const rows = query(copy, q.visits, [fromId, rebuilt ? (cursor.ms || 0) : 0]);
    const visits = rows.map((r) => ({ id: Number(r.id), ms: Number(r.ms), url: String(r.url || ''), title: String(r.title || '') }));
    const last = visits[visits.length - 1];
    return {
      visits,
      rebuilt,
      cursor: last ? { id: last.id, ms: last.ms } : { id: rebuilt ? maxId : (cursor.id || 0), ms: cursor.ms || 0 },
    };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = { findBrowsers, readVisits };
