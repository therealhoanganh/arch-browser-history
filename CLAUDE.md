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
history at install, at browser start and hourly. Through the API a deletion also
leaves Google sync, which editing the file would not. `background.js` carries
`isAdult` copied with `toString()`, so the plugin and the extension cannot
disagree. The list is `sites.json`, rewritten when the adult settings change and
at startup. **He installs it once per browser by hand**: Developer mode, *Load
unpacked*, that folder. After a plugin version that changes `background.js`, the
extension needs its reload arrow pressed.

Trap: every vault with this plugin rewrites the one `sites.json` from its own
settings at startup. `TESTFIELD` has an empty *Sites* list, so opening it after
GENERALS narrows the extension to the generic words until GENERALS next starts.

## Things learned building it

- `obsidian eval` works only for a vault open in a window (`vault=TESTFIELD`); a
  new plugin folder needs `app.plugins.loadManifests()` before it can be enabled.
- Deleting a folder on disk under a running Obsidian leaves it in the vault's
  file list for a moment. `ensureFolder` asks the adapter (disk), because
  trusting the file list failed a whole update with `ENOENT`.

## Where things stand (edit in place)

- **0.1.0, not released, not on GitHub yet.** Runs in `TESTFIELD` (symlink):
  2026-09-25 the first run read 110,339 visits (Chrome, Brave, Safari) into
  23,056 lines over 109 days in 14 s, 9,104 adult visits left out; the import of
  the 114 old Ideaverse day notes kept 44,890 visits as 14,637 lines, 2,234 adult
  and two `data:image` junk lines left out, the originals untouched.
- Next, once he has looked at `TESTFIELD/Browses`: create the public repo,
  release 0.1.0, install in GENERALS, run the import there (the Ideaverse folder
  and, for the days Chrome has dropped since, `TESTFIELD/Browses`), and he loads
  the cleaner in Chrome and Brave.
- Not built: the PC's own browsers. They would be read by the same code if
  `automaticOn` named the PC, but two computers writing the same day notes would
  make Syncthing conflict files; that needs a design first.
