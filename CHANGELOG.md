# Changelog

Dated entries, newest last: what changed, what prompted it, and his words where
he gave them.

## 2026-09-25 — 0.1.0, built

His request: *"So in the past, I use Browser History in Ideaverse vault, the
history notes are stored here: /Users/hoanganh/Downloads/Archive/Ideaverse/Vault/y Browses.
The problem with the plugin is it lacks auto-setup function so the setting
doesn't work anymore after few months, so I want to have that function in our
plugin. Other function I want to have is auto filtered out url, redundant or
repeated ones, example is hentairead.com, it was added link each times I scroll
to new panel so there were a lots of repeated urls. Also auto-load feature to so
I don't have to manually click update. If possible, auto delete audult sites in
my web browser too, that would be nice, so I don't have to delete entire
history. And it will be used and stored in GENERALS vault but could test it at
TESTFIELD first."*

What was found before designing (also in `᭄᭡ CHAOS/CHAOS Plans.md`, *2. ARCH
Browser History*):

- The old plugin's `data.json` pointed at `Chrome/Profile 1/History`; Chrome now
  has only `Default`. His June note shows the path was once under `/Users/anh`.
- Chrome keeps 90 days; the old notes end 2026-06-25 and Chrome starts
  2026-06-27, so 2026-06-26 is gone.
- Brave holds 53,850 visits from 2026-06-09 to 2026-09-07.
- Chrome locks its database while running, so the plugin cannot delete from it.

His decisions on the plan: adult visits **dropped entirely**; **every browser
found** is read; the old Ideaverse notes **imported, cleaned**; the repository
**public** with his site list kept in settings.

Built: automatic discovery of every browser profile, startup + 10-minute
updates on the `automaticOn` computer, repeats folded by site and title with a
count, tracking parameters and noise pages dropped, `#` escaped in titles,
merged day notes, the import command, the *Find more in my history* helper, and
the browser cleaner extension. Tested in `TESTFIELD`; figures in `CLAUDE.md`,
*Where things stand*.

## 2026-09-25 — 0.1.0 released, installed in GENERALS

He looked at `TESTFIELD/Browses` (*"looks good"*) and said go. Public repository created,
0.1.0 released, installed through BRAT in GENERALS, the Ideaverse notes imported there, the
cleaner extension written. He asked how the tags stopped leaking, with the example
`Thanh cỏ mèo catnip \#review \#catnip …`: the backslash escape, checked in Obsidian's own
index (0 tags across 206 day notes, `#catnip` absent from the tag list).


## 2026-09-25 — 0.1.1, the extension's list follows one vault

Found while installing: every vault with the plugin rewrote the extension's `sites.json` at
startup, so TESTFIELD (empty *Sites* list) would have replaced the sites he adds in
GENERALS. The list now records its vault, and only that vault updates it by itself.

## 2026-09-25 — 0.1.2, the sweep searches by word, and the site list cannot be closed unsaved

He loaded the extension in Chrome and reported *"Add ticked sites"*, but nothing had been
saved in any vault (GENERALS, TESTFIELD, the PC's copy); the button itself was tested and
works, so the list was most likely closed without the press, the button then sitting below
fifty rows. It now sits above the list too, and closing with sites ticked but not added
says so. *Find* also announces itself, since it pauses Obsidian for about three seconds.

The extension's first sweep took Chrome from 1,496 matching addresses to 275 and stopped
there, with 270 of them ordinary visits it should have found. Its sweep (extension 1.1.0)
now also runs Chrome's own history search for each word and site, which matches address and
title, instead of trusting the whole-history listing alone.

## 2026-09-25 — 0.1.3, adding a site clears it from the notes already written

He added his sites (*"I think I didn't click the button before so it wasn't saved"*): 40
went in. The day notes already in GENERALS still held 550 lines from them in 36 notes,
because the filter only met new visits. Since his decision was that adult visits are written
nowhere, adding sites (or editing *Words* / *Sites*) now removes their lines from every day
note, and a command does the same by hand. Checked on a copy first: exactly those 550 lines
went and every other line came out byte for byte the same.

## 2026-09-25 — 0.1.4, the sweep asks day by day and repeats until clean

After he reloaded the extension (1.1.0), Chrome went from 1,037 visits to his listed sites to
283 and held there for three samples 20 seconds apart. What was left were ordinary pages on
listed sites (`f95zone.to/threads/…`, `tubepornstars.com`), so neither the whole-history
request nor the word searches were returning them, or the service worker stopped part way;
from outside Chrome the two cannot be told apart. Extension 1.2.0 asks the history one day
at a time for 120 days, then by word, and while a sweep still deletes something it runs
again in 5 minutes instead of an hour.

## 2026-09-25 — 0.1.5, the plugin hands the extension the addresses it cannot see

The day-by-day sweep (1.2.0) also stopped at 283. Their flags in Chrome's database explained
it: 281 of the 283 visits are redirect steps (no chain-end flag), which Chrome keeps but
hides from its history page and from extensions, so no search could ever return them.
The plugin reads the database directly, so after each update it now lists the adult
addresses still in each Chromium history and writes them into `sites.json`; extension 1.3.0
deletes each by address, which Chrome allows for hidden entries too.

## 2026-09-25 — 0.1.6, each browser gets only its own addresses

0.1.5's first hand-over held 2,764 addresses, not about 270: Brave's were in it too, and
the extension in Chrome would have deleted those for nothing on every sweep and, counting
them, repeated every 5 minutes for ever. The list is now grouped by browser, the extension
(1.4.0) takes its own browser's part (Brave is told apart by `navigator.brave`), and
deletions by address no longer count toward the 5-minute repeat. Fixed before he reloaded,
so one reload covers it.

## 2026-09-27 — 0.1.7, Title Case and Obsidian's own headings

From the web-design-guidelines review of 2026-09-27 (`~/Documents/ARCH UI Review.md`), whose
whole list he approved: *"Yes, proceed on."* Every label is in Title Case, Chicago style, as
in ARCH Images Plus 0.7.6: his preference, *"Actually, I much prefer Title Case."* The
settings headings are Obsidian's own (`setHeading`) rather than plain `h3` text, which looked
different from the other ARCH plugins, and the three popups' titles are real titles. The
cleaner popup's *Show in Finder* button reads *Show in Files* on the PC (*Show in Explorer*
on Windows), since only the Mac has a Finder. No spell-check underlines in the settings or
the import folder box, whose fields hold paths, patterns and site lists.

## 2026-09-27 — 0.1.8, lists behind Manage…, no loose paragraphs

After the Title Case releases he asked: *"Did you work on UI of the plugins like button structures or something? Like in Arch YT Playlist, the toggle list to paste youtube channel links in is quite ugly."* The review had used a checklist (wording, keyboard, focus) that never judged layout. Shown three layouts, he chose a *Manage…* button opening a popup, the way Obsidian's own *Excluded files* setting works, and chose it for every list of that kind. Here that meant the four lists, *Pages to Skip*, *Tracking Parameters to Remove*,
*Words* and *Sites*: each was a narrow six-line box beside its description, wrapping lines
mid-word ("accounts.goog / le.*"). Each is now a card with its count and *Manage…*. The popup (`ListModal`, the same class in YT Playlists, X Twitter, After Clipping and Browser History) has a large box, a live count as you type, and *Cancel* and *Save*; only *Cancel* throws an edit away, since a long paste lost to Escape is worse than a save not asked for. Tried in TESTFIELD: the count, Cancel leaving the list alone, and Escape keeping an edit.
The two paragraphs under *Browsers Found on This Computer* and *Adult Sites* are those
headings' own descriptions, and two labels passed through a helper, which 0.1.7's Title
Case missed, are fixed: *Pages to Skip*, *Tracking Parameters to Remove*, *Show Steps*.

## 2026-09-28 — Found: the PC merged its Chrome history into the same day notes, doubling visit counts

Found while clearing Syncthing conflict copies in GENERALS, at his request (*"Fix it for me"*).
No code changed yet. On 2026-09-27 the plugin's synced `automaticOn` had been `*`, so the PC's copy
ran too: the settings file's conflict copy from 15:32 that day holds a `readUpTo` cursor for
`hoanganh-ubuntu`. The PC's Chrome shares history with the Mac's through Chrome sync, so every visit
of its 90 days was merged a second time. Measured against GENERALS's last commit of each note (the
Mac's 08:13 commit on 2026-09-27): all 90 day notes from 2026-06-29 to 2026-09-26 carry about ×1.5
to ×2 the visits on the same lines, with 49 new lines (Google, Spotify, Gmail, Twitch, Shopee,
Firefox pages), apparently visits only the PC had. The 26th went from matching its 22:30 copy at the
08:13 commit to ×1.98 in the note written at 13:12. `automaticOn` is back to `Hoangs-MacBook-Pro`,
so it has stopped. **The same conflict lost his last adult-list entry**: the conflict copy's
*Sites* ends with `f95zone.to`, the kept settings do not; no day note names f95zone yet. Who set `*`
is not on record; that setting is the one this file's *Not built: the PC's own browsers* says
needs a design first. The repair (counts back to the committed values, the PC-only lines kept, the
three addresses found only in the day-note conflict copies added, `f95zone.to` restored) waits for
his go-ahead; `backup-strategy/CHANGELOG.md`, 2026-09-28, has the rest of that session.

## 2026-09-28 — The day notes repaired, `f95zone.to` back on *Sites*

At his word (*"Yes. go ahead"*). Obsidian was quit on both computers first, since the plugin holds
its settings in memory. `f95zone.to` was appended to *Sites* in `data.json`, where the conflict copy
had it; no day note names f95zone, so nothing needed removing. The notes were repaired on the Mac with
the plugin's own `parseDayNote`, `mergeVisits` and `renderDayNote` (from `lib/clean.js`), after checking
that they re-render all 92 notes byte for byte: for 29 June to 26 September, each line found in
GENERALS's last commit of the note got that commit's count, time, address and title back, and the lines
only the PC had added (about 50, a few a day) were kept. 91 notes changed, the visits recorded fell from
133,425 to 86,854, and every one of the 90 past days now matches its committed counts. The 27th and 28th
were checked against a copy of the Mac's Chrome history up to the plugin's cursor (visit 69588) and were
not inflated; their only differences were Cloudflare check pages ("Verify You're Human", "Just a
moment…") whose title Chrome replaces after the check, so a recount from Chrome cannot place them, and
their counts were left as written. The two addresses found only in the 27th's conflict copy (an X post
and `x.com`) were merged into it; the 26th's one (a Spotify playlist) already had a line under the same
site and title. The three conflict copies were then deleted. The notes as they were before the repair
were copied to the PC session's scratchpad, which does not outlive the session; GENERALS's git holds the
committed versions. Not committed in GENERALS, which waits for its large files to move to 4T-HDD.
