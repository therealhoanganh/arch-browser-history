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

const VERSION = '1.1.0';

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

// Two passes: the whole history, and Chrome's own search for each word and
// site, which matches address and title. On 2026-09-25 the first sweep left
// 270 matching visits behind, so the whole-history listing alone is not trusted.
async function sweep() {
  const l = await load();
  const seen = new Set();
  let n = 0;
  const pass = async (text) => {
    const items = await chrome.history.search({ text, startTime: 0, maxResults: 1000000 });
    for (const item of items) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      if (isAdult(item.url, l.words, l.sites)) { await chrome.history.deleteUrl({ url: item.url }); n++; }
    }
  };
  await pass('');
  for (const t of l.words.concat(l.sites)) await pass(String(t).replace(/^www\./, '').split('/')[0]);
  console.log('[arch-browser-cleaner] swept ' + seen.size + ' addresses, deleted ' + n);
}

chrome.history.onVisited.addListener(async (item) => {
  const l = lists || await load();
  if (isAdult(item.url, l.words, l.sites)) chrome.history.deleteUrl({ url: item.url });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('sweep', { periodInMinutes: 60 });
  sweep();
});
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
function writeCleaner(settings, folder = cleanerFolder(), vault = '') {
  fs.mkdirSync(folder, { recursive: true });
  const changed = [];
  if (writeFileIfChanged(path.join(folder, 'manifest.json'), JSON.stringify(MANIFEST, null, 2) + '\n')) changed.push('manifest.json');
  if (writeFileIfChanged(path.join(folder, 'background.js'), background())) changed.push('background.js');
  if (writeSites(settings, folder, vault)) changed.push('sites.json');
  return changed;
}

// The vault whose settings the list came from. One extension serves every
// vault with this plugin, and TESTFIELD's empty Sites list would otherwise
// replace GENERALS' list each time TESTFIELD started.
function sitesOwner(folder = cleanerFolder()) {
  try { return JSON.parse(fs.readFileSync(path.join(folder, 'sites.json'), 'utf8')).vault || ''; } catch (_) { return ''; }
}

// Only the list; called whenever the adult settings change.
function writeSites(settings, folder = cleanerFolder(), vault = '') {
  if (!fs.existsSync(path.join(folder, 'manifest.json'))) return false;
  const sites = { vault, words: lines(settings.adultWords), sites: lines(settings.adultSites) };
  return writeFileIfChanged(path.join(folder, 'sites.json'), JSON.stringify(sites, null, 2) + '\n');
}

module.exports = { cleanerFolder, writeCleaner, writeSites, sitesOwner };
