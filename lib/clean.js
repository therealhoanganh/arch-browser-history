'use strict';

// Everything between "a visit the browser recorded" and "a line in a day note":
// what is dropped, how an address is cleaned, how repeats fold into one line,
// and how a day note is read back and merged so no line already written is lost.

// ---------------------------------------------------------------- defaults

// Pages that are not places someone went: redirects, consent walls, the
// browser's own screens. One per line, "host/path-prefix", * matches within a
// host part ("google.*" is every Google country domain). www. is ignored.
const DEFAULT_SKIP = [
  'google.*/aclk',
  'google.*/sorry',
  'google.*/url',
  'accounts.google.*',
  'consent.google.*',
  'consent.youtube.com',
  'accounts.youtube.com',
  'googleadservices.com',
  'doubleclick.net',
  'cm.bilibili.com',
  'ext-twitch.tv',
].join('\n');

// Query parameters that only say where a click came from.
const DEFAULT_TRACKING = [
  'utm_*', 'gclid', 'gbraid', 'wbraid', 'gad_source', 'gad_campaignid', 'dclid', 'fbclid',
  'igsh', 'igshid', 'mc_cid', 'mc_eid', 'msclkid', 'yclid', '_hsenc', '_hsmi', 'ref_src',
  'sp_atk', 'xptdk', 'si', 'feature', 'pp', 'ved', 'ei', 'sxsrf', 'sca_esv',
  'spm_id_from', 'from_spmid', 'vd_source', 'trackid', 'track_id', 'share_source', 'share_medium',
].join('\n');

// Generic words, matched inside a site's address and inside a search. His own
// list of sites lives in the vault's settings, never in this public code.
const DEFAULT_ADULT_WORDS = [
  'porn', 'hentai', 'xxx', 'xvideo', 'xnxx', 'xhamster', 'rule34', 'nsfw',
  'f95zone', 'spankbang', 'redtube', 'youporn', 'brazzers', 'chaturbate',
  'stripchat', 'onlyfans', 'fansly', 'fancentro', 'hstream', 'playvids', 'missav', 'javhd',
  'erome', 'tnaflix', 'faphouse',
].join('\n');

// Not places on the web at all.
const INTERNAL_SCHEMES = /^(chrome|chrome-extension|chrome-search|chrome-untrusted|brave|edge|vivaldi|opera|arc|about|devtools|view-source|data|blob|javascript|moz-extension|safari-web-extension|favorites|file):/i;

// ---------------------------------------------------------------- lists

function lines(text) {
  return String(text || '').split(/[\n,]/).map((s) => s.trim()).filter((s) => s && !s.startsWith('//'));
}

function hostOf(u) { return u.hostname.toLowerCase().replace(/^www\./, ''); }

// "google.*/aclk" -> matches host "google.com.vn" + path "/aclk..."
function compileSkip(text) {
  return lines(text).map((p) => {
    const slash = p.indexOf('/');
    const host = (slash < 0 ? p : p.slice(0, slash)).toLowerCase().replace(/^www\./, '');
    const pathPrefix = slash < 0 ? '' : p.slice(slash);
    const re = new RegExp('^([^/]*\\.)?' + host.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
    return { re, pathPrefix };
  });
}

function compileTracking(text) {
  const exact = new Set();
  const prefixes = [];
  for (const k of lines(text)) (k.endsWith('*') ? prefixes.push(k.slice(0, -1)) : exact.add(k));
  return (key) => exact.has(key) || prefixes.some((p) => key.startsWith(p));
}

// Written as one self-contained function on purpose: the browser cleaner
// extension carries a copy of it (made with toString), so the plugin and the
// extension can never disagree about what counts as an adult site.
function isAdult(url, words, sites) {
  var u;
  try { u = new URL(url); } catch (e) { return false; }
  var host = u.hostname.toLowerCase().replace(/^www\./, '');
  var pathname = u.pathname.toLowerCase();
  for (var i = 0; i < sites.length; i++) {
    var s = String(sites[i]).toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
    var slash = s.indexOf('/');
    var sh = slash < 0 ? s : s.slice(0, slash);
    var sp = slash < 0 ? '' : s.slice(slash);
    if ((host === sh || host.slice(-(sh.length + 1)) === '.' + sh) && pathname.indexOf(sp) === 0) return true;
  }
  var search = (u.searchParams.get('q') || u.searchParams.get('search_query') || u.searchParams.get('p') || '').toLowerCase();
  for (var j = 0; j < words.length; j++) {
    var w = String(words[j]).toLowerCase();
    if (!w) continue;
    if (host.indexOf(w) >= 0 || (search && search.indexOf(w) >= 0)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- one visit

function makeFilter(settings) {
  const skip = compileSkip(settings.skipPages);
  const tracking = compileTracking(settings.trackingParams);
  const words = lines(settings.adultWords);
  const sites = lines(settings.adultSites);

  // Returns { drop: 'internal' | 'skip' | 'adult' } or { url } with the address cleaned.
  return function judge(rawUrl) {
    if (!rawUrl || INTERNAL_SCHEMES.test(rawUrl)) return { drop: 'internal' };
    if (isAdult(rawUrl, words, sites)) return { drop: 'adult' };
    let u;
    try { u = new URL(rawUrl); } catch (_) { return { url: rawUrl }; }
    if (!/^https?:$/.test(u.protocol)) return { url: rawUrl };
    const host = hostOf(u);
    if (skip.some((s) => s.re.test(host) && u.pathname.startsWith(s.pathPrefix || '/'))) return { drop: 'skip' };
    // A Google search is its query; the other twenty parameters only describe
    // the browser window it was typed into.
    if (/^google\.[a-z.]+$/.test(host) && u.pathname === '/search') {
      for (const k of [...u.searchParams.keys()]) if (!['q', 'tbm', 'udm'].includes(k)) u.searchParams.delete(k);
    } else {
      for (const k of [...u.searchParams.keys()]) if (tracking(k)) u.searchParams.delete(k);
    }
    return { url: u.toString().replace(/\?$/, '') };
  };
}

// ---------------------------------------------------------------- lines

const MAX_TITLE = 200;

// A title is written as markdown link text. Escaped:
//   #  -- a "#word" in a page title becomes a tag in Obsidian; his reason for
//         hiding the old day notes from search was "the tags in link title
//         pollute your tags"
//   [ ] -- "[Hàng Chính Hãng] Xe Đạp…" opened a wikilink
//   $   -- two prices in one title rendered as maths
//   \   -- so the escapes above stay unambiguous
function escapeTitle(t) { return t.replace(/([\\[\]#$])/g, '\\$1'); }
function unescapeTitle(t) { return t.replace(/\\([\\[\]#$])/g, '$1'); }

// "(14) TenZ - Twitch": the unread count some sites put in front of the title
// changes from visit to visit and would keep repeats apart.
function displayTitle(title, url) {
  let t = String(title || '').replace(/\s+/g, ' ').trim().replace(/^\(\d+\+?\)\s+/, '') || url;
  if (t.length > MAX_TITLE) t = t.slice(0, MAX_TITLE - 1).trimEnd() + '…';
  return t;
}

// Parentheses and spaces would end a markdown link early.
function linkUrl(url) { return url.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29'); }

// Repeats fold by site and page title within a day, not by address: the pages
// of one gallery, one Shopee product opened from five ads, one Google search
// reloaded -- each has one title while the address changes every time.
//
// The key is built from the title as written (shortened, or the address when
// there is no title), so a line read back from a note matches later visits.
function groupKey(url, title) {
  let host = '';
  try { host = hostOf(new URL(url)); } catch (_) {}
  return `${host}\u0001${displayTitle(title, url)}`;
}

// "- 22:09 [title](url) ×65". Old notes from the community plugin have the same
// shape without the count and with titles unescaped; both parse here. A line
// he highlighted by hand ("- ==21:09 [...]", two in the June notes) keeps its
// mark.
const LINE = /^- (==)?(\d{1,2}):(\d{2}) \[(.*)\]\((\S*)\)(?: ×(\d+))?(==)?\s*$/;

function parseDayNote(text, dayStartMs) {
  const head = [];
  const entries = [];
  for (const line of String(text || '').split('\n')) {
    const m = LINE.exec(line);
    if (!m) {
      if (!entries.length) head.push(line);
      else if (line.trim()) head.push(line); // a line of his own among the entries: kept, above the list
      continue;
    }
    const title = unescapeTitle(m[4]);
    const url = m[5].replace(/%28/g, '(').replace(/%29/g, ')').replace(/%20/g, ' ');
    const ms = dayStartMs + (Number(m[2]) * 60 + Number(m[3])) * 60000;
    entries.push({ ms, url, title, count: Number(m[6] || 1), key: groupKey(url, title), mark: m[1] || m[7] || '' });
  }
  while (head.length && !head[head.length - 1].trim()) head.pop();
  return { head, entries };
}

// Adds visits to a day's entries. A repeat raises the count, and the line
// keeps the earliest time and that visit's address.
function mergeVisits(entries, visits) {
  const byKey = new Map(entries.map((e) => [e.key, e]));
  let added = 0;
  for (const v of visits) {
    const key = groupKey(v.url, v.title);
    const e = byKey.get(key);
    const n = v.count || 1;
    if (e) {
      e.count += n;
      if (v.ms < e.ms) { e.ms = v.ms; e.url = v.url; if (v.title) e.title = v.title; }
      if (v.mark) e.mark = v.mark;
    } else {
      const fresh = { ms: v.ms, url: v.url, title: v.title, count: n, key, mark: v.mark || '' };
      byKey.set(key, fresh);
      entries.push(fresh);
      added++;
    }
  }
  return added;
}

function renderDayNote(head, entries, formatTime) {
  const sorted = entries.slice().sort((a, b) => b.ms - a.ms);
  const body = sorted.map((e) =>
    `- ${e.mark ? '==' : ''}${formatTime(e.ms)} [${escapeTitle(displayTitle(e.title, e.url))}](${linkUrl(e.url)})${e.count > 1 ? ` ×${e.count}` : ''}${e.mark ? '==' : ''}`);
  return (head.length ? head.join('\n') + '\n\n' : '') + body.join('\n') + '\n';
}

module.exports = {
  DEFAULT_SKIP, DEFAULT_TRACKING, DEFAULT_ADULT_WORDS,
  lines, isAdult, makeFilter,
  escapeTitle, unescapeTitle, displayTitle, groupKey,
  parseDayNote, mergeVisits, renderDayNote,
};
