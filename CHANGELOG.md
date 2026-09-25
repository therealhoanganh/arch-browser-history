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

