# Working notes for ARCH Browser History

Writes the browser history of this computer into one note per day, by itself.
Replaces the community plugin **Browser History** (noy4, 1.1.1), which Hoang Anh
used from 31 May 2026 in the Ideaverse vault and which stopped working because
its one saved path went stale. His request, 2026-09-25, is in `CHANGELOG.md`.
It lives in **GENERALS**; `TESTFIELD` has it through the usual symlink.

**This file holds the rules and the current state; the history is in
`CHANGELOG.md`.** The family rules in `~/Documents/CLAUDE.md` apply (plain
commits, no AI attribution, `automaticOn`, logging always on, nothing in `lib/`
requires `obsidian`).

## What it does, and why each part is there

- **No stored browser path.** `lib/browsers.js` looks for every Chromium browser
  (Chrome, Brave, Edge, Arc, Vivaldi, Opera, Chromium, Helium), every Firefox and
  Zen profile, and Safari, on macOS and Linux, **on every run**. A source is known
  by `Browser/ProfileFolder` (`Chrome/Default`), never by path. The old plugin's
  path broke twice: `/Users/anh/…` became `/Users/hoanganh/…`, and Chrome's
  `Profile 1` became `Default`.
- **Reads a copy.** A running Chrome locks `History` (`database is locked`), so
  the file and its `-journal`/`-wal`/`-shm` side files are copied to a temp
  folder first. Firefox and Safari keep recent visits in `-wal`.
- **`node:sqlite`, no bundled SQLite.** Obsidian 1.x on Electron 43 has Node
  24.18, where `require('node:sqlite')` works (tested in the running app,
  2026-09-25). The old plugin shipped sql.js at 944 KB; this build is ~48 KB. If
  an older Obsidian lacks it, `query()` falls back to the `sqlite3` program
  (always on macOS; on Ubuntu `apt install sqlite3`).
- **Times are converted in SQL.** Chrome counts microseconds from 1601, which is
  above `Number.MAX_SAFE_INTEGER`; dividing in the query keeps it exact.
- **Cursor per computer, per source**: `readUpTo[computer][sourceId] = {id, ms}`,
  the last visit written. Moves only after the notes are written. If the
  browser's largest visit id is below the cursor, its database was rebuilt and
  reading falls back to time.
- **Updates by itself**: at startup and every `intervalMinutes` (10), only on the
  `automaticOn` computer, and skips a browser whose file has not changed since the
  last read. Chrome keeps **90 days** (its oldest visit on 2026-09-25 was
  2026-06-27), so a written note is soon the only copy.
- **Repeats fold by site + page title within a day**, not by address, with a
  `×N` count and the earliest time and address kept. His example was hentairead,
  whose reader pages share one title while the address changes page by page;
  the same holds for Shopee products opened from ads and reloaded Google
  searches. Measured on Chrome: 56,520 visits → about 20,000 lines. A leading
  unread count (`(14) TenZ - Twitch`) is stripped so it does not keep repeats
  apart. Cost, accepted: two different pages with the same generic title on one
  site in one day (several ChatGPT chats still titled "ChatGPT") share a line.
- **Cleaning**: browser pages (`chrome://`, extensions, `file:`) are dropped; the
  *Pages to skip* list drops redirects and consent pages; tracking parameters
  are removed; a Google search keeps only `q`, `tbm`, `udm`.
- **`#`, `[`, `]`, `$` and `\` in titles are escaped.** His reason for hiding the
  old day notes from search was *"the tags in link title pollute your tags"*;
  with `\#` they no longer can, so the folder need not be excluded.
- **Adult visits are dropped entirely** (his decision), matched by the *Words*
  (inside the site's address, or inside a search) and his *Sites* list. The
  words in the code are generic platform names; **his own site list lives only
  in the vault's settings**, because the repository is public (his decision, so
  BRAT can install it). *Find more in my history* lists sites whose page titles
  use the words, ticked when half their pages do; he confirms each.
- **A change to the adult list reaches old notes too.** Adding sites, or editing
  *Words* / *Sites* (after a 3-second pause in typing), removes matching lines
  from every day note in the day-note folder; the command *Remove adult sites
  from the day notes already written* does it by hand. GENERALS' git history is
  where a wrongly removed line comes back from.
- **Day notes are merged, never regenerated.** A note is parsed back
  (`parseDayNote`), new visits merged, and written again, so lines Chrome has
  forgotten, imported lines and a highlight he added (`- ==21:09 […]==`) survive.
  A line of his own that is not a history line is kept above the list.
- **No frontmatter**, like the old notes. That is also why ARCH After Clipping,
  which watches every folder in GENERALS, leaves them alone: it acts on a URL in
  frontmatter only. **Adding a `url` property to day notes would set After
  Clipping on every one of them.**
- **Folder setting**: the family's shape with the core Daily notes folder as the
  anchor for *same* and *subfolder*; there is no plugin-specific fifth mode.
  File name format defaults to his `YYYY-MM/[+] YYYY-MM-DD`.
- **Default lists are saved as `null`** while they equal the code's default, so a
  better default in a later version reaches every vault where he never edited it.

## The browser cleaner

`lib/cleaner.js` writes a Manifest V3 extension to
`~/Library/Application Support/ARCH Browser Cleaner` (Linux:
`~/.local/share/arch-browser-cleaner`). A fixed folder outside the vaults,
because a browser loads an unpacked extension by path, and a path that moved
with a vault would break it the way the old plugin's setting broke. It deletes
adult visits through `chrome.history` as they happen (`onVisited`) and sweeps all
history at install and browser start, then hourly, or every 5 minutes while a
sweep still finds something. A sweep asks one day at a time (120 days) and then
Chrome's search for each word and site: two sweeps that asked for everything in
one request stopped with hundreds left. What neither reaches are **redirect
steps**: visits without Chrome's chain-end flag, kept in the database but hidden
from the history page and from extensions (281 of the 283 left). So after each
update the plugin lists the adult addresses still in each Chromium database
(`listUrls`) into `sites.json` as `urls`, and the sweep deletes them by address. Through the API a deletion also
leaves Google sync, which editing the file would not. `background.js` carries
`isAdult` copied with `toString()`, so the plugin and the extension cannot
disagree. The list is `sites.json`, rewritten when the adult settings change and
at startup. **He installs it once per browser by hand**: Developer mode, *Load
unpacked*, that folder. After a plugin version that changes `background.js`, the
extension needs its reload arrow pressed.

One extension serves every vault with the plugin, so `sites.json` records the
vault it came from (`vault`), and only that vault rewrites it by itself;
installing from another vault switches it. Before 0.1.1 every vault rewrote it at
startup, and `TESTFIELD`'s empty *Sites* list would have replaced GENERALS'.

## Things learned building it

- `obsidian eval` works only for a vault open in a window (`vault=TESTFIELD`); a
  new plugin folder needs `app.plugins.loadManifests()` before it can be enabled.
  A long eval (one that runs *Find*, or BRAT's `updatePlugin`) outlives the CLI's
  wait and can leave later evals to that vault hanging; `obsidian plugin:reload
  id=…` still works then.
- Deleting a folder on disk under a running Obsidian leaves it in the vault's
  file list for a moment. `ensureFolder` asks the adapter (disk), because
  trusting the file list failed a whole update with `ENOENT`.

## Where things stand (edit in place)

- **0.1.0 released** (2026-09-25) and installed through BRAT in **GENERALS**, which
  has `Browses/` with 219 day notes: the browsers from 9 June (Chrome from
  27 June) and the 114 old Ideaverse notes, imported with 44,859 visits kept and
  2,265 adult left out. Still runs in `TESTFIELD` too (symlink); its
  `Browses/` is test output, and was checked to hold nothing GENERALS lacks.
- **0.1.3 in GENERALS** (copied in by hand, as 0.1.2: BRAT's `updatePlugin`
  through `obsidian eval` hung). His **40 sites** are in the *Sites* list,
  among them broad ones he ticked himself: `itch.io`, `vk.com`, `vk.ru`,
  `vkvideo.ru`, `feedspot.com`, `link.me`, `recoverylighthouse.com`. 550 lines
  from them were removed from 36 day notes (GENERALS commit of 2026-09-25).
- The browser cleaner is loaded in **Chrome** (not Brave yet), still as 1.0.0
  until its reload arrow is pressed; Chrome held 1,037 visits to listed sites at
  17:11. 1.1.0 (word-by-word sweep) is on disk.
- Not built: the PC's own browsers. They would be read by the same code if
  `automaticOn` named the PC, but two computers writing the same day notes would
  make Syncthing conflict files; that needs a design first.
