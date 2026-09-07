# AWAL Minigames

Live, browser-based multiplayer ESL classroom games — Hangman, System Suspects,
and more — plus a full marketing site (pricing, about, login, terms) and a
product-led-growth guest onboarding flow.

## Project structure

This was rebuilt from a single-file prototype into real, separate pages with
shared CSS/JS — no build step, no framework, just plain HTML/CSS/JS that
deploys to Vercel with zero configuration.

```
.
├── index.html            # Home page + guest onboarding overlay + sign-up modal
├── games.html             # Game Library
├── hangman.html            # Hangman (setup / classroom room / live dashboard / solo play)
├── system-suspects.html    # System Suspects (Guess Who)
├── pricing.html
├── about.html
├── login.html               # Has its own compact header (no shared nav)
├── terms.html
├── styles.css                # Shared across every page
├── main.js                    # Shared: nav dropdown, FAQ/pricing/login/terms toggles,
│                                 GAME_LIBRARY data (single source of truth for game cards)
├── hangman.js                  # Only loaded on hangman.html
├── system-suspects.js           # Only loaded on system-suspects.html
├── guest-flow.js                 # Only loaded on index.html
└── vercel.json
```

## What changed from the single-file version

- **Real URLs.** `/pricing.html`, `/about.html` etc. are now actual pages —
  shareable, bookmarkable, and the browser back button works properly.
- **Better caching.** Editing a page's copy no longer forces visitors to
  re-download all the CSS/JS again, since those are separate cached files.
- **The old JS page-router is gone.** Navigation between pages is just plain
  `<a href="pricing.html">` links now instead of JavaScript intercepting
  clicks and toggling `display:none`.
- **The PLG guest flow stayed in-page.** "Try a Free Room Now" on the home
  page still opens as a full-screen overlay (guest lobby → room → sign-up)
  rather than becoming its own separate page, since it's a lightweight
  interactive widget, not something that needs its own URL.

## Known limitations (unchanged from before — read before demoing)

- **No backend.** Room codes/links, "student join," and the Hangman
  classroom dashboard are all simulated client-side (bots auto-play the
  student role) — there's no server or websocket layer for a real second
  device to connect through yet.
- **No persistence.** Refreshing a page resets its in-memory state.
- **AI word generation** in Hangman calls `api.anthropic.com` directly from
  the browser with no key wired up. It works in Claude's own sandbox and
  has an offline fallback word bank, but route this through your own
  backend before depending on it for real use — never expose API keys
  client-side in production.

## Deploy to Vercel via GitHub

```bash
cd awal-site
git init
git add .
git commit -m "Initial commit: AWAL Minigames (multi-page)"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/awal-minigames.git
git push -u origin main
```

Then import the repo at https://vercel.com/new — no build command or
output directory needs to be set, Vercel auto-detects this as static.

## Deploy directly from the CLI (skip GitHub)

```bash
npm i -g vercel
cd awal-site
vercel login
vercel --prod
```
