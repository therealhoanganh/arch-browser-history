'use strict';

// The browser cleaner: a small extension for Chrome, Brave and the other
// Chromium browsers that deletes visits to adult sites from the browser's own
// history. The plugin cannot do this itself -- a running browser holds its
// History database locked (measured: "database is locked") -- and deleting
// through the browser's history API also removes the visit from Google sync,
// which editing the file would not.
//
// The plugin writes the extension's files, so a BRAT release (main.js and
// manifest.json only) still carries it. They go to a fixed folder outside any
// vault, because the browser loads an unpacked extension by path: if that path
// moved with a vault rename, the extension would stop loading -- the same way
// the old plugin's setting died.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { isAdult, lines } = require('./clean.js');

const VERSION = '1.4.0';

function cleanerFolder(home = os.homedir(), platform = process.platform) {
  return platform === 'darwin'
    ? path.join(home, 'Library', 'Application Support', 'ARCH Browser Cleaner')
    : path.join(home, '.local', 'share', 'arch-browser-cleaner');
}

const MANIFEST = {
  manifest_version: 3,
  name: 'ARCH Browser Cleaner',
  version: VERSION,
  description: 'Deletes visits to adult sites from this browser\'s history as they happen, and sweeps what is already there every hour. Written by the Obsidian plugin ARCH Browser History.',
  permissions: ['history', 'alarms'],
  background: { service_worker: 'background.js' },
};

function background() {
  return `// Written by ARCH Browser History. Edits here are overwritten; change the
// adult site list in the plugin's settings instead, which rewrites sites.json.
'use strict';

const isAdult = ${isAdult.toString()};

let lists = null;

async function load() {
  const r = await fetch(chrome.runtime.getURL('sites.json'), { cache: 'no-store' });
  lists = await r.json();
  return lists;
}

// A sweep asks the history one day at a time, then Chrome's own search for each
// word and site (which matches address and title). On 2026-09-25 two sweeps
// that asked for the whole history in one request each stopped with a few
// hundred matching visits left, still findable by day, so no single request
// is trusted to return everything. While a sweep still finds something it
// runs again in 5 minutes, so one that was cut off picks up again; once clean,
// hourly.
const DAY = 24 * 60 * 60 * 1000;

// Named as the plugin names browsers (lib/browsers.js).
function thisBrowser() {
  const ua = navigator.userAgent;
  if (navigator.brave) return 'Brave';
  if (ua.indexOf('Edg/') >= 0) return 'Edge';
  if (ua.indexOf('OPR/') >= 0) return 'Opera';
  if (ua.indexOf('Vivaldi') >= 0) return 'Vivaldi';
  return 'Chrome';
}

async function sweep() {
  const l = await load();
  const seen = new Set();
  let n = 0;
  const take = async (query) => {
    const items = await chrome.history.search(Object.assign({ text: '', startTime: 0, maxResults: 100000 }, query));
    for (const item of items) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      if (isAdult(item.url, l.words, l.sites)) { await chrome.history.deleteUrl({ url: item.url }); n++; }
    }
  };
  const now = Date.now();
  for (let end = now + DAY; end > now - 120 * DAY; end -= DAY) await take({ startTime: end - DAY, endTime: end });
  for (const t of l.words.concat(l.sites)) await take({ text: String(t).replace(/^www\\./, '').split('/')[0] });
  // Addresses the plugin found in the database that no search returns
  // (redirect steps). Deleting by address works for them.
  // Only this browser's list: the plugin reads every browser, and deleting
  // Brave's addresses in Chrome would do nothing each sweep. These do not count
  // toward the 5-minute repeat: the plugin drops an address from the list once
  // the browser no longer holds it.
  const mine = (l.urls && l.urls[thisBrowser()]) || [];
  let byName = 0;
  for (const url of mine) {
    if (seen.has(url) || !isAdult(url, l.words, l.sites)) continue;
    seen.add(url);
    await chrome.history.deleteUrl({ url });
    byName++;
  }
  chrome.alarms.create('sweep', { periodInMinutes: n ? 5 : 60 });
  console.log('[arch-browser-cleaner] swept ' + seen.size + ' addresses, deleted ' + n + ' found by search and ' + byName + ' by address' + (n ? '; again in 5 minutes' : ''));
}

chrome.history.onVisited.addListener(async (item) => {
  const l = lists || await load();
  if (isAdult(item.url, l.words, l.sites)) chrome.history.deleteUrl({ url: item.url });
});

chrome.runtime.onInstalled.addListener(sweep);
chrome.runtime.onStartup.addListener(sweep);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'sweep') sweep(); });
`;
}

function writeFileIfChanged(file, text) {
  try { if (fs.readFileSync(file, 'utf8') === text) return false; } catch (_) {}
  fs.writeFileSync(file, text);
  return true;
}

// Writes or refreshes the extension. Returns what changed, for the log.
function writeCleaner(settings, folder = cleanerFolder(), vault = '', urls = null) {
  fs.mkdirSync(folder, { recursive: true });
  const changed = [];
  if (writeFileIfChanged(path.join(folder, 'manifest.json'), JSON.stringify(MANIFEST, null, 2) + '\n')) changed.push('manifest.json');
  if (writeFileIfChanged(path.join(folder, 'background.js'), background())) changed.push('background.js');
  if (writeSites(settings, folder, vault, urls)) changed.push('sites.json');
  return changed;
}

// The vault whose settings the list came from. One extension serves every
// vault with this plugin, and TESTFIELD's empty Sites list would otherwise
// replace GENERALS' list each time TESTFIELD started.
function sitesOwner(folder = cleanerFolder()) {
  try { return JSON.parse(fs.readFileSync(path.join(folder, 'sites.json'), 'utf8')).vault || ''; } catch (_) { return ''; }
}

// Only the list; called whenever the adult settings change.
// urls: { Chrome: [...], Brave: [...] }, adult addresses the plugin found in
// each browser's database, for the extension to delete by name (see listUrls
// in browsers.js). null keeps the ones already in the file.
function writeSites(settings, folder = cleanerFolder(), vault = '', urls = null) {
  if (!fs.existsSync(path.join(folder, 'manifest.json'))) return false;
  if (urls === null) {
    try { urls = JSON.parse(fs.readFileSync(path.join(folder, 'sites.json'), 'utf8')).urls || {}; } catch (_) { urls = {}; }
    if (Array.isArray(urls)) urls = {};
  }
  const sites = { vault, words: lines(settings.adultWords), sites: lines(settings.adultSites), urls };
  return writeFileIfChanged(path.join(folder, 'sites.json'), JSON.stringify(sites, null, 2) + '\n');
}

module.exports = { cleanerFolder, writeCleaner, writeSites, sitesOwner };
