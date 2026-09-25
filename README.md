# ARCH Browser History

An Obsidian plugin that writes your browser history into one note per day, on
its own.

- **Finds your browsers itself.** Chrome, Brave, Edge, Arc, Vivaldi, Opera,
  Chromium, Firefox, Zen and Safari, every profile, looked up again on every run.
  There is no database path to set, so a renamed profile or a new computer does
  not break it.
- **Updates by itself** when Obsidian starts and every 10 minutes. Browsers
  forget old history (Chrome after 90 days); the notes keep it.
- **One line per page, not per visit.** Repeated visits to a page on the same day
  fold into one line with a count: `- 22:09 [Page title](https://…) ×12`.
- **Clean links.** Tracking parameters (`utm_*`, `gclid`, …) are removed, and
  redirects, consent pages and the browser's own pages are left out.
- **No stray tags.** A `#word` in a page title is escaped, so it never becomes a
  tag in your vault.
- **Adult sites left out**, by a list of words and a list of sites you control.
  A helper finds candidates in your history for you to confirm.
- **Browser cleaner.** An optional small extension for Chrome and Brave, written
  by the plugin, that deletes adult visits from the browser's own history as they
  happen.
- **Imports** day notes written by the community Browser History plugin.

Day notes go to `Browses/YYYY-MM/+ YYYY-MM-DD.md` by default; the folder and file
name format are settings. Desktop only.

## Install

Through [BRAT](https://github.com/TfTHacker/obsidian42-brat): add
`therealhoanganh/arch-browser-history`.

## The browser cleaner

Run *Install or update the browser cleaner extension*, then in Chrome
(`chrome://extensions`) or Brave (`brave://extensions`) turn on Developer mode,
click *Load unpacked* and choose the folder the plugin shows.
