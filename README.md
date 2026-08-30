# AWAL Minigames

Live, browser-based multiplayer ESL classroom games — Hangman, System Suspects,
and more — plus a full marketing site (pricing, about, login, terms) and a
product-led-growth guest onboarding flow.

## Project structure

This is a **single-file static site**. `index.html` contains all pages
(Home, Game Library, Hangman, System Suspects, Pricing, About, Login, Terms,
Guest Room flow) as one HTML document with client-side JavaScript routing —
there is no build step, no framework, and no backend.

```
.
├── index.html       # the entire site
├── vercel.json       # static deployment config
└── .gitignore
```

## Known limitations (read before demoing to anyone)

- **No backend.** Room codes/links, the "student join" flow, and the Hangman
  classroom dashboard are all simulated client-side (bots auto-play the
  student role) since there is no server or websocket layer for a real
  second device to connect through.
- **No persistence.** Refreshing the page resets all in-memory state
  (guest sessions, game progress, "signed up" status).
- **AI word generation** (Hangman's "AI topic generator" option) calls
  `https://api.anthropic.com/v1/messages` directly from the browser. This
  works in Claude's own sandboxed preview environment but will likely fail
  once deployed elsewhere, since there's no API key wired up and this
  pattern should never be used in production (never expose API keys
  client-side). It has a built-in offline fallback word bank so the demo
  doesn't break, but you'll want to replace this with your own backend
  proxy endpoint before relying on it for real use.

## Deploy to Vercel via GitHub (recommended)

1. **Push this folder to a new GitHub repository:**

   ```bash
   cd awal-minigames
   git init
   git add .
   git commit -m "Initial commit: AWAL Minigames site"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/awal-minigames.git
   git push -u origin main
   ```

   (Create the empty repo first at https://github.com/new — don't
   initialize it with a README/license, so there's no merge conflict with
   the push above.)

2. **Import into Vercel:**
   - Go to https://vercel.com/new
   - Select "Import Git Repository" and choose the repo you just pushed
   - Vercel auto-detects this as a static site — no build command or
     output directory needs to be set
   - Click **Deploy**

3. **Done.** Every future `git push` to `main` will automatically
   redeploy. Vercel gives you a `*.vercel.app` URL immediately, and you
   can attach a custom domain from the project's Settings → Domains tab.

## Alternative: deploy directly from the CLI (skip GitHub)

```bash
npm i -g vercel
cd awal-minigames
vercel login
vercel --prod
```

This deploys straight from your machine without a GitHub repo, though you
lose automatic redeploy-on-push.
