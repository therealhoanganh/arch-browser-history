'use strict';

const { Plugin, PluginSettingTab, Setting, Notice, Modal, TFile, normalizePath, moment } = require('obsidian');
const path = require('path');
const fs = require('fs');
const os = require('os');

/* ---------------- one computer does the automatic work ---------------- */

// Since 2026-09-25 the vaults are mirrored between the Mac and an Ubuntu PC by
// Syncthing. A note written on one machine arrives on the other as a new file,
// so with Obsidian open on both, both would process it: two downloads, two
// conversions, conflict files. The setting automaticOn names the one computer
// that runs the automatic work; the settings file syncs, so both machines read
// the same answer. Commands and menus run anywhere. Shared with ARCH After
// Clipping, copied word for word.
//
// The name is macOS's Local Hostname there, because the kernel hostname can
// change with the network; elsewhere os.hostname().
function computerName() {
  if (process.platform === 'darwin') {
    try {
      const n = require('child_process')
        .execFileSync('/usr/sbin/scutil', ['--get', 'LocalHostName'], { encoding: 'utf8', timeout: 3000 })
        .trim();
      if (n) return n;
    } catch (_) {}
  }
  return os.hostname().replace(/\.local$/, '');
}

// automaticOn: '' is unclaimed (the first computer to load this version claims
// it), '*' is every computer, anything else one computer's name.
function automaticRunsHere(settings, here) {
  const a = String(settings.automaticOn || '');
  return !a || a === '*' || a === here;
}

/* ---------------- settings ---------------- */

const DEFAULT_SETTINGS = {
  // Where day notes go. The family's folder shape; the anchor for "same" and
  // "subfolder" is the folder the core Daily notes plugin writes to, since
  // these are day notes too.
  folderMode: 'specified',   // vault | same | subfolder | specified
  folder: 'Browses',
  subfolderName: 'Browses',
  // His format from the community plugin: a folder per month, and a file per
  // day whose name starts with "+" so it is told apart from a daily note.
  fileNameFormat: 'YYYY-MM/[+] YYYY-MM-DD',

  autoUpdate: true,
  intervalMinutes: 10,
  automaticOn: '',

  disabledBrowsers: [],      // source ids, "Chrome/Default"
  skipPages: null,           // filled from lib defaults on load
  trackingParams: null,
  adultWords: null,
  adultSites: '',

  // Per computer, per source: the last visit written, { id, ms }. Each
  // computer reads its own browsers, so cursors never mix between machines.
  readUpTo: {},
};

class ArchBrowserHistory extends Plugin {
  async onload() {
    this.computer = computerName();
    await this.loadSettings();
    this.running = false;
    this.lastMtime = {};

    this.addCommand({ id: 'update-now', name: 'Update browser history now', callback: () => this.update('command') });
    this.addCommand({ id: 'import-old-notes', name: 'Import day notes from the old Browser History plugin', callback: () => new ImportModal(this.app, this).open() });
    this.addCommand({ id: 'purge-adult', name: 'Remove adult sites from the day notes already written', callback: () => this.purgeAdultFromNotes('command') });
    this.addCommand({ id: 'install-cleaner', name: 'Install or update the browser cleaner extension', callback: () => this.installCleaner() });

    this.addSettingTab(new ArchBrowserHistorySettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.refreshCleanerList();
      this.autoUpdate('startup');
      this.restartTimer();
    });
    this.log('loaded', this.manifest.version, 'on', this.computer);
  }

  onunload() { if (this.timer) window.clearInterval(this.timer); }

  restartTimer() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    const minutes = Math.max(1, Number(this.settings.intervalMinutes) || 10);
    this.timer = window.setInterval(() => this.autoUpdate('timer'), minutes * 60000);
    this.registerInterval(this.timer);
  }

  autoUpdate(reason) {
    if (!this.settings.autoUpdate) return;
    if (!automaticRunsHere(this.settings, this.computer)) {
      if (reason === 'startup') this.log(`automatic update runs on ${this.settings.automaticOn}, not here (${this.computer})`);
      return;
    }
    this.update(reason);
  }

  /* ---------------- lib loading ---------------- */

  // Takes the bundle when built, falls back to disk so the repo runs unbuilt.
  lib() {
    if (this._lib) return this._lib;
    if (typeof ARCH_LIB !== 'undefined') { this._lib = ARCH_LIB; return this._lib; }
    const dir = path.join(this.vaultRoot(), this.app.vault.configDir, 'plugins', this.manifest.id, 'lib');
    this.dropLibFromRequireCache(dir);
    this._lib = require(path.join(dir, 'index.js'));
    return this._lib;
  }

  // A reloaded plugin would otherwise keep running the old lib/. Node caches a
  // module under its real path, and the plugin folder is a symlink into the
  // repo during development, so both paths are matched; and the require handed
  // to a plugin is Obsidian's wrapper, whose .cache is not Node's -- Electron's
  // real one is window.require. Both traps are ARCH Recreations' findings.
  dropLibFromRequireCache(dir) {
    const cache = (typeof window !== 'undefined' && window.require && window.require.cache) || require.cache || {};
    const roots = [dir];
    try { roots.push(fs.realpathSync(dir)); } catch (_) {}
    let dropped = 0;
    for (const key of Object.keys(cache)) {
      if (roots.some((root) => key.startsWith(root + path.sep))) { delete cache[key]; dropped++; }
    }
    if (dropped) this.log(`reloaded ${dropped} lib module(s) from disk`);
  }

  vaultRoot() { return this.app.vault.adapter.getBasePath(); }
  log(...a) { console.log('[arch-browser-history]', ...a); }

  /* ---------------- reading the browsers ---------------- */

  sources() {
    return this.lib().findBrowsers();
  }

  cursorsHere() {
    if (!this.settings.readUpTo[this.computer]) this.settings.readUpTo[this.computer] = {};
    return this.settings.readUpTo[this.computer];
  }

  async update(reason) {
    if (this.running) { this.log(`update (${reason}) skipped: one is already running`); return; }
    this.running = true;
    const started = Date.now();
    try {
      const L = this.lib();
      const judge = L.makeFilter(this.settings);
      const cursors = this.cursorsHere();
      const found = this.sources();
      const disabled = new Set(this.settings.disabledBrowsers);
      const byDay = new Map();
      const newCursors = {};
      const dropped = { internal: 0, skip: 0, adult: 0 };
      let read = 0;

      for (const src of found) {
        if (disabled.has(src.id)) continue;
        let mtime = 0;
        try { mtime = fs.statSync(src.file).mtimeMs; } catch (_) {}
        // Unchanged since the last read in this session: nothing new to find.
        if (reason !== 'command' && this.lastMtime[src.id] === mtime) continue;
        let result;
        try {
          result = L.readVisits(src, cursors[src.id]);
        } catch (e) {
          // Safari's history needs Full Disk Access for Obsidian; say so once.
          this.log(`could not read ${src.id} (${src.file}): ${e.message}`);
          continue;
        }
        this.lastMtime[src.id] = mtime;
        if (result.rebuilt) this.log(`${src.id}: its database was rebuilt (ids restarted), reading by time from ${new Date(cursors[src.id].ms).toISOString()}`);
        newCursors[src.id] = result.cursor;
        read += result.visits.length;
        if (result.visits.length) this.log(`${src.id} (${src.profile}): ${result.visits.length} new visits`);
        for (const v of result.visits) {
          const j = judge(v.url);
          if (j.drop) { dropped[j.drop]++; continue; }
          const day = moment(v.ms).format('YYYY-MM-DD');
          if (!byDay.has(day)) byDay.set(day, []);
          byDay.get(day).push({ ms: v.ms, url: j.url, title: v.title });
        }
      }

      const written = await this.writeDays(byDay);
      // Cursors move only after the notes are written, so a failed write is
      // read again next time rather than lost.
      Object.assign(cursors, newCursors);
      await this.saveSettings();
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      if (read || reason === 'command') {
        this.log(`update (${reason}) done in ${secs}s: ${read} visits read, ${dropped.adult} adult, ${dropped.skip} skipped pages, ${dropped.internal} browser pages dropped; ${written.lines} new lines in ${written.days} day notes`);
      }
      if (reason === 'command') new Notice(`Browser history: ${written.lines} new lines in ${written.days} day notes (${dropped.adult} adult visits left out).`);
    } catch (e) {
      this.log('update failed:', e);
      new Notice(`Browser history update failed: ${e.message}`);
    } finally {
      this.running = false;
    }
  }

  /* ---------------- day notes ---------------- */

  dayFolder() {
    const s = this.settings;
    const daily = this.dailyNotesFolder();
    switch (s.folderMode) {
      case 'vault': return '';
      case 'same': return daily;
      case 'subfolder': return [daily, s.subfolderName || 'Browses'].filter(Boolean).join('/');
      default: return s.folder || '';
    }
  }

  dailyNotesFolder() {
    try {
      const daily = this.app.internalPlugins.getPluginById('daily-notes');
      return (daily && daily.instance && daily.instance.options && daily.instance.options.folder) || '';
    } catch (_) { return ''; }
  }

  dayPath(day) {
    const name = moment(day, 'YYYY-MM-DD').format(this.settings.fileNameFormat || 'YYYY-MM-DD');
    return normalizePath([this.dayFolder(), name + '.md'].filter(Boolean).join('/'));
  }

  // Asks the disk, not Obsidian's file list: a folder deleted outside Obsidian
  // stays in that list for a moment, and trusting it failed a whole update.
  async ensureFolder(folder) {
    if (!folder || await this.app.vault.adapter.exists(folder)) return;
    await this.ensureFolder(folder.split('/').slice(0, -1).join('/'));
    try { await this.app.vault.adapter.mkdir(folder); } catch (_) { /* created meanwhile */ }
  }

  // Merges visits into each day's note. What a note already holds is read back
  // and kept: lines Chrome has since forgotten (it keeps 90 days), lines
  // imported from the old plugin, a highlight he added by hand.
  async writeDays(byDay) {
    const L = this.lib();
    let days = 0;
    let lines = 0;
    for (const day of [...byDay.keys()].sort()) {
      const file = this.dayPath(day);
      const dayStart = moment(day, 'YYYY-MM-DD').startOf('day').valueOf();
      const existing = this.app.vault.getAbstractFileByPath(file);
      const text = existing instanceof TFile ? await this.app.vault.read(existing) : '';
      const { head, entries } = L.parseDayNote(text, dayStart);
      const before = entries.reduce((n, e) => n + e.count, 0);
      const added = L.mergeVisits(entries, byDay.get(day));
      const after = entries.reduce((n, e) => n + e.count, 0);
      if (after === before) continue;
      const out = L.renderDayNote(head, entries, (ms) => moment(ms).format('HH:mm'));
      if (existing instanceof TFile) {
        await this.app.vault.modify(existing, out);
      } else {
        await this.ensureFolder(file.split('/').slice(0, -1).join('/'));
        await this.app.vault.create(file, out);
      }
      days++;
      lines += added;
    }
    return { days, lines };
  }

  /* ---------------- importing the old plugin's notes ---------------- */

  // Reads day notes written by the community Browser History plugin (or by this
  // one) from any folder on disk, and merges them in with the same filters: the
  // adult visits, noise pages and repeats are dropped exactly as for a browser.
  // The folder read from is never changed.
  async importFolder(folder) {
    if (this.running) { new Notice('An update is running; try the import again in a moment.'); return; }
    this.running = true;
    try { await this.importFolderNow(folder); } finally { this.running = false; }
  }

  async importFolderNow(folder) {
    const L = this.lib();
    const judge = L.makeFilter(this.settings);
    const files = [];
    const walk = (dir) => {
      for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) walk(p);
        else if (d.name.endsWith('.md')) files.push(p);
      }
    };
    walk(folder);
    const byDay = new Map();
    const dropped = { internal: 0, skip: 0, adult: 0 };
    let visits = 0;
    let unread = 0;
    let noDate = 0;
    for (const file of files) {
      const m = /(\d{4})-(\d{2})-(\d{2})/.exec(path.basename(file));
      if (!m) { noDate++; this.log('import: no date in the file name, skipped:', file); continue; }
      const day = `${m[1]}-${m[2]}-${m[3]}`;
      const dayStart = moment(day, 'YYYY-MM-DD').startOf('day').valueOf();
      const { head, entries } = L.parseDayNote(fs.readFileSync(file, 'utf8'), dayStart);
      const stray = head.filter((l) => l.trim());
      if (stray.length) {
        unread += stray.length;
        for (const l of stray) this.log(`import: not a history line, left out (${path.basename(file)}):`, l.slice(0, 160));
      }
      for (const e of entries) {
        const j = judge(e.url);
        if (j.drop) { dropped[j.drop] += e.count; continue; }
        visits += e.count;
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day).push({ ms: e.ms, url: j.url, title: e.title, count: e.count, mark: e.mark });
      }
    }
    const written = await this.writeDays(byDay);
    const summary = `imported ${files.length - noDate} day notes from ${folder}: ${visits} visits kept, ${dropped.adult} adult, ${dropped.skip} skipped pages, ${dropped.internal} browser pages dropped, ${unread} lines that were not history left out; ${written.lines} new lines in ${written.days} day notes`;
    this.log(summary);
    new Notice(`Browser history: ${summary}.`, 15000);
  }

  /* ---------------- adult lines already written ---------------- */

  // His decision was that adult visits are written nowhere. A site added to the
  // list later still sits in the day notes written before (550 lines in 36 notes
  // when his first 40 sites went in), so a change to the list also clears them
  // from every day note in the day-note folder.
  async purgeAdultFromNotes(reason) {
    if (this.running) { this.purgeAgain = true; return; }
    this.running = true;
    try {
      const L = this.lib();
      const words = L.lines(this.settings.adultWords);
      const sites = L.lines(this.settings.adultSites);
      const root = this.dayFolder();
      const files = this.app.vault.getMarkdownFiles().filter((f) => !root || f.path.startsWith(root + '/'));
      let removed = 0;
      let notes = 0;
      for (const f of files) {
        const text = await this.app.vault.read(f);
        const { head, entries } = L.parseDayNote(text, 0);
        if (!entries.length) continue;
        const keep = entries.filter((e) => !L.isAdult(e.url, words, sites));
        if (keep.length === entries.length) continue;
        removed += entries.length - keep.length;
        notes++;
        // Times are re-rendered from each entry's own clock time, so the day's
        // start does not matter here.
        await this.app.vault.modify(f, L.renderDayNote(head, keep, (ms) => moment.utc(ms).format('HH:mm')));
      }
      this.log(`adult lines removed from day notes (${reason}): ${removed} lines in ${notes} notes`);
      if (removed) new Notice(`Browser history: ${removed} adult lines removed from ${notes} day notes.`);
    } finally {
      this.running = false;
      if (this.purgeAgain) { this.purgeAgain = false; this.purgeAdultFromNotes('list changed during the last pass'); }
    }
  }

  // Typing in the Words or Sites box saves on every key; the pass waits for a
  // pause so it runs once per edit rather than once per letter.
  schedulePurge() {
    if (this.purgeTimer) window.clearTimeout(this.purgeTimer);
    this.purgeTimer = window.setTimeout(() => this.purgeAdultFromNotes('adult list edited'), 3000);
  }

  /* ---------------- the browser cleaner ---------------- */

  cleanerFolder() { return this.lib().cleanerFolder(); }
  cleanerInstalled() { return fs.existsSync(path.join(this.cleanerFolder(), 'manifest.json')); }

  installCleaner() {
    // Installing from a vault makes it the one whose list the extension follows.
    const changed = this.lib().writeCleaner(this.settings, this.cleanerFolder(), this.app.vault.getName());
    this.log('browser cleaner written to', this.cleanerFolder(), changed.length ? `(${changed.join(', ')})` : '(already current)');
    new CleanerModal(this.app, this).open();
  }

  // The extension reads its list from sites.json; rewritten whenever the adult
  // settings change, and at startup so a list edited on the other computer
  // reaches this one's browser.
  refreshCleanerList() {
    try {
      if (!this.cleanerInstalled()) return;
      const owner = this.lib().sitesOwner();
      if (owner && owner !== this.app.vault.getName()) {
        this.log(`browser cleaner follows the ${owner} vault's list; not changed from here (install it from this vault to switch)`);
        return;
      }
      // Rewrites background.js too when a new plugin version changed it.
      const changed = this.lib().writeCleaner(this.settings, this.lib().cleanerFolder(), this.app.vault.getName());
      if (changed.length) this.log('browser cleaner updated:', changed.join(', '), changed.some((c) => c !== 'sites.json') ? '-- reload it on the browser\'s extensions page' : '');
    } catch (e) {
      this.log('could not update the browser cleaner:', e.message);
    }
  }

  // Sites in his history whose page titles use the adult words but whose
  // address does not, grouped by domain, for him to confirm in the settings.
  findAdultCandidates() {
    const L = this.lib();
    const words = L.lines(this.settings.adultWords).map((w) => w.toLowerCase());
    const judge = L.makeFilter(this.settings);
    const stats = new Map();
    for (const src of this.sources()) {
      let visits = [];
      try { visits = L.readVisits(src).visits; } catch (_) { continue; }
      for (const v of visits) {
        if (judge(v.url).drop) continue;
        let host;
        try { host = new URL(v.url).hostname.toLowerCase().replace(/^www\./, ''); } catch (_) { continue; }
        const domain = host.split('.').slice(-2).join('.');
        const t = v.title.toLowerCase();
        const hit = words.some((w) => t.includes(w));
        const s = stats.get(domain) || { domain, visits: 0, hits: 0, example: '' };
        s.visits++;
        if (hit) { s.hits++; if (!s.example) s.example = v.title; }
        stats.set(domain, s);
      }
    }
    return [...stats.values()].filter((s) => s.hits).sort((a, b) => b.hits / b.visits - a.hits / a.visits || b.hits - a.hits);
  }

  /* ---------------- settings ---------------- */

  async loadSettings() {
    const L = this.lib();
    const saved = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    if (this.settings.skipPages == null) this.settings.skipPages = L.DEFAULT_SKIP;
    if (this.settings.trackingParams == null) this.settings.trackingParams = L.DEFAULT_TRACKING;
    if (this.settings.adultWords == null) this.settings.adultWords = L.DEFAULT_ADULT_WORDS;
    if (!this.settings.readUpTo) this.settings.readUpTo = {};
    // An unclaimed vault is claimed by the first computer to load the plugin,
    // so two computers never write the same day notes at once.
    if (!this.settings.automaticOn) {
      this.settings.automaticOn = this.computer;
      await this.saveSettings();
      this.log('automatic update claimed for this computer:', this.computer);
    }
  }

  // A list still equal to the plugin's default is saved as null, so a better
  // default in a later version reaches every vault where he never edited it.
  async saveSettings() {
    const L = this.lib();
    const out = Object.assign({}, this.settings);
    if (out.skipPages === L.DEFAULT_SKIP) out.skipPages = null;
    if (out.trackingParams === L.DEFAULT_TRACKING) out.trackingParams = null;
    if (out.adultWords === L.DEFAULT_ADULT_WORDS) out.adultWords = null;
    await this.saveData(out);
  }

  // The settings file changed on disk under a running Obsidian: with the vaults
  // mirrored, an edit made on the other computer. Without reloading, the next
  // save here would write the old settings back over it.
  async onExternalSettingsChange() {
    await this.loadSettings();
    this.restartTimer();
    this.refreshCleanerList();
    this.log('settings changed on disk (the other computer?), reloaded; automatic update runs on', this.settings.automaticOn);
  }
}

/* ---------------- modals ---------------- */

class ImportModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Import old browser history notes' });
    contentEl.createEl('p', { text: 'The folder that holds the day notes, as a full path on this computer. Month subfolders are read too. The notes there are only read, never changed. Adult sites, noise pages and repeats are left out the same way as for a browser, and lines already in a day note here are kept.' });
    let value = '';
    new Setting(contentEl).setName('Folder').addText((t) => {
      t.inputEl.style.width = '100%';
      t.setPlaceholder('/Users/…/Browses').onChange((v) => { value = v.trim(); });
    });
    new Setting(contentEl).addButton((b) => b.setButtonText('Import').setCta().onClick(async () => {
      if (!value || !fs.existsSync(value)) { new Notice('That folder does not exist.'); return; }
      this.close();
      await this.plugin.importFolder(value);
    }));
  }
  onClose() { this.contentEl.empty(); }
}

class CleanerModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; }
  onOpen() {
    const { contentEl } = this;
    const folder = this.plugin.cleanerFolder();
    contentEl.createEl('h3', { text: 'Browser cleaner' });
    contentEl.createEl('p', { text: 'The extension is written. It deletes visits to adult sites from the browser\'s history as they happen, and once an hour sweeps what is already there. To load it, once per browser (Chrome, Brave):' });
    const ol = contentEl.createEl('ol');
    ol.createEl('li', { text: 'Open the extensions page: chrome://extensions in Chrome, brave://extensions in Brave.' });
    ol.createEl('li', { text: 'Turn on Developer mode (top right).' });
    ol.createEl('li', { text: 'Click "Load unpacked" and choose this folder:' });
    const code = contentEl.createEl('pre');
    code.setText(folder);
    contentEl.createEl('p', { text: 'Changes to the adult site list reach the extension by themselves. After a new version of this plugin, press the extension\'s reload arrow on that page.' });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Copy folder path').onClick(() => { navigator.clipboard.writeText(folder); new Notice('Copied.'); }))
      .addButton((b) => b.setButtonText('Show in Finder').onClick(() => { require('electron').shell.openPath(folder); }));
  }
  onClose() { this.contentEl.empty(); }
}

class CandidatesModal extends Modal {
  constructor(app, plugin, candidates, onDone) { super(app); this.plugin = plugin; this.candidates = candidates; this.onDone = onDone; }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Sites that look adult' });
    contentEl.createEl('p', { text: 'Sites in the browser history whose page titles use the adult words but whose address does not. Ticked: most of their pages match. Tick the ones to add; they are then left out of the notes and deleted from the browser.' });
    const chosen = new Set();
    this.chosen = chosen;
    // The button is at the top as well: under fifty rows it was out of sight,
    // and on 2026-09-25 a first try closed the list without anything saved.
    const addRow = new Setting(contentEl);
    for (const c of this.candidates.slice(0, 60)) {
      const share = c.hits / c.visits;
      if (share >= 0.5) chosen.add(c.domain);
      new Setting(contentEl)
        .setName(`${c.domain} — ${c.hits} of ${c.visits} pages`)
        .setDesc(c.example.slice(0, 120))
        .addToggle((t) => t.setValue(share >= 0.5).onChange((v) => (v ? chosen.add(c.domain) : chosen.delete(c.domain))));
    }
    const add = async () => {
      const s = this.plugin.settings;
      const have = new Set(this.plugin.lib().lines(s.adultSites));
      const add = [...chosen].filter((d) => !have.has(d));
      s.adultSites = [s.adultSites.trim(), ...add].filter(Boolean).join('\n');
      await this.plugin.saveSettings();
      this.plugin.refreshCleanerList();
      this.plugin.log('adult sites added:', add.join(', ') || '(none)');
      if (add.length) this.plugin.purgeAdultFromNotes('sites added');
      new Notice(`Adult sites added: ${add.length}.`);
      this.saved = true;
      this.close();
      this.onDone();
    };
    addRow.addButton((b) => b.setButtonText('Add ticked sites').setCta().onClick(add));
    new Setting(contentEl).addButton((b) => b.setButtonText('Add ticked sites').setCta().onClick(add));
  }
  onClose() {
    this.contentEl.empty();
    if (!this.saved && this.chosen && this.chosen.size) {
      new Notice(`Nothing was added: the list closed before "Add ticked sites" was pressed (${this.chosen.size} ticked).`, 10000);
      this.plugin.log('adult sites list closed without adding;', this.chosen.size, 'were ticked');
    }
  }
}

/* ---------------- settings tab ---------------- */

class ArchBrowserHistorySettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }

  display() {
    const { containerEl } = this;
    const p = this.plugin;
    const s = p.settings;
    const save = async () => { await p.saveSettings(); };
    containerEl.empty();

    containerEl.createEl('h3', { text: 'Day notes' });

    new Setting(containerEl)
      .setName('Where day notes go')
      .setDesc('"Same" and "subfolder" are relative to the folder the core Daily notes plugin writes to.')
      .addDropdown((d) => d
        .addOption('vault', 'Vault root')
        .addOption('same', 'Same folder as daily notes')
        .addOption('subfolder', 'Subfolder of the daily notes folder')
        .addOption('specified', 'A folder specified below')
        .setValue(s.folderMode)
        .onChange(async (v) => { s.folderMode = v; await save(); this.display(); }));
    if (s.folderMode === 'specified') {
      new Setting(containerEl).setName('Folder').addText((t) => t.setValue(s.folder).onChange(async (v) => { s.folder = v.trim(); await save(); }));
    }
    if (s.folderMode === 'subfolder') {
      new Setting(containerEl).setName('Subfolder name').addText((t) => t.setValue(s.subfolderName).onChange(async (v) => { s.subfolderName = v.trim(); await save(); }));
    }
    new Setting(containerEl)
      .setName('File name format')
      .setDesc(`Moment.js format; a / makes a folder. Today's note: ${p.dayPath(moment().format('YYYY-MM-DD'))}`)
      .addText((t) => t.setValue(s.fileNameFormat).onChange(async (v) => { s.fileNameFormat = v; await save(); }));

    containerEl.createEl('h3', { text: 'Updating' });

    new Setting(containerEl)
      .setName('Update automatically')
      .setDesc('When Obsidian starts, then on a timer. Browsers forget old history (Chrome keeps 90 days), so a note written today is the only copy later.')
      .addToggle((t) => t.setValue(s.autoUpdate).onChange(async (v) => { s.autoUpdate = v; await save(); }));
    new Setting(containerEl)
      .setName('Every how many minutes')
      .addText((t) => t.setValue(String(s.intervalMinutes)).onChange(async (v) => {
        const n = Math.max(1, parseInt(v, 10) || 10);
        s.intervalMinutes = n; await save(); p.restartTimer();
      }));
    const here = p.computer;
    const cur = s.automaticOn || here;
    new Setting(containerEl)
      .setName('Automatic update runs on')
      .setDesc('The one computer that writes day notes by itself. The vaults are mirrored between computers; two writing the same day note at once would make conflict files. The commands work on every computer. ' + `This computer is ${here}.`)
      .addDropdown((d) => {
        d.addOption(here, `${here} (this computer)`);
        if (cur !== here && cur !== '*') d.addOption(cur, cur);
        d.addOption('*', 'Every computer');
        d.setValue(cur).onChange(async (v) => { s.automaticOn = v; await save(); });
      });
    new Setting(containerEl)
      .setName('Update now')
      .addButton((b) => b.setButtonText('Update').onClick(() => p.update('command')));

    containerEl.createEl('h3', { text: 'Browsers found on this computer' });
    containerEl.createEl('p', { cls: 'setting-item-description', text: 'Looked for again every time, so a renamed profile or a new browser is picked up without any setting. Turn one off to leave it out.' });
    const cursors = p.cursorsHere();
    const found = p.sources();
    if (!found.length) containerEl.createEl('p', { text: 'No browser history found.' });
    for (const src of found) {
      const c = cursors[src.id];
      const last = c && c.ms ? `read up to ${moment(c.ms).format('YYYY-MM-DD HH:mm')}` : 'not read yet';
      new Setting(containerEl)
        .setName(`${src.browser} — ${src.profile}`)
        .setDesc(`${last}. ${src.file}`)
        .addToggle((t) => t.setValue(!s.disabledBrowsers.includes(src.id)).onChange(async (v) => {
          s.disabledBrowsers = s.disabledBrowsers.filter((x) => x !== src.id);
          if (!v) s.disabledBrowsers.push(src.id);
          await save();
        }));
    }

    containerEl.createEl('h3', { text: 'Filtering' });

    this.textArea(containerEl, 'Pages to skip',
      'Redirects and consent pages that are not places you went. One per line: site/path-start. * matches any part of a site name, so google.* is every Google domain.',
      'skipPages');
    this.textArea(containerEl, 'Tracking parameters to remove',
      'Parts of an address that only say where a click came from. utm_* removes every parameter starting with utm_.',
      'trackingParams');

    containerEl.createEl('h3', { text: 'Adult sites' });
    containerEl.createEl('p', { cls: 'setting-item-description', text: 'Visits to these are never written to a note, and the browser cleaner deletes them from the browser.' });
    this.textArea(containerEl, 'Words',
      'A site whose address contains one of these, or a search for one of them, counts as adult.',
      'adultWords', () => { p.refreshCleanerList(); p.schedulePurge(); });
    this.textArea(containerEl, 'Sites',
      'Sites to treat as adult whatever their address says, one per line (example.com, or example.com/path). Stays in this vault\'s settings.',
      'adultSites', () => { p.refreshCleanerList(); p.schedulePurge(); });
    new Setting(containerEl)
      .setName('Find more in my history')
      .setDesc('Lists sites whose page titles use the words above, to add with a tick.')
      .addButton((b) => b.setButtonText('Find').onClick(async () => {
        // Reading every visit takes a few seconds with Obsidian paused; say so first.
        new Notice('Reading the browser history…');
        await new Promise((r) => setTimeout(r, 50));
        const c = p.findAdultCandidates();
        if (!c.length) { new Notice('Nothing found.'); return; }
        new CandidatesModal(this.app, p, c, () => this.display()).open();
      }));
    new Setting(containerEl)
      .setName('Browser cleaner extension')
      .setDesc(p.cleanerInstalled()
        ? `Written to ${p.cleanerFolder()}. Its list follows these settings.`
        : 'Not written yet. It deletes adult visits from Chrome or Brave itself; the plugin cannot, because a running browser locks its history.')
      .addButton((b) => b.setButtonText(p.cleanerInstalled() ? 'Show steps' : 'Install').onClick(() => { p.installCleaner(); this.display(); }));

    containerEl.createEl('h3', { text: 'Old notes' });
    new Setting(containerEl)
      .setName('Import day notes from the old Browser History plugin')
      .setDesc('Merged in with the same filters; the old notes are only read.')
      .addButton((b) => b.setButtonText('Import…').onClick(() => new ImportModal(this.app, p).open()));
  }

  textArea(containerEl, name, desc, key, after) {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addTextArea((t) => {
        t.inputEl.rows = 6;
        t.inputEl.style.width = '100%';
        t.setValue(this.plugin.settings[key] || '').onChange(async (v) => {
          this.plugin.settings[key] = v;
          await this.plugin.saveSettings();
          if (after) after();
        });
      });
  }
}

module.exports = ArchBrowserHistory;
