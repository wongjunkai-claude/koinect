# Koinect — Learn Chinese for Church

A small, installable web app for learning Chinese phrases used in church life —
greetings, introductions, a church tour, and following along in a Sunday service.

No accounts, no backend, no build step. Progress is saved right in the browser,
so closing the app and coming back tomorrow picks up exactly where you left off.

## What's inside

```
index.html        the app shell
style.css         all styling (colors, type, layout)
app.js            all app logic (lessons, quiz, progress saving)
manifest.json     makes the app installable on phones/desktops
sw.js             service worker — caches everything for offline use
data/lessons.json all lesson content (edit this to add/change lessons)
icons/            app icons
```

## Try it locally

Browsers block `fetch()` on files opened directly (`file://`), so run a tiny local server:

```bash
# from inside the koinect folder
python3 -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

## Deploy to GitHub Pages (free hosting)

1. Create a new GitHub repository (e.g. `koinect`).
2. Push this folder's contents to the repository's `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Initial Koinect app"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/koinect.git
   git push -u origin main
   ```
3. In the repo, go to **Settings → Pages**.
4. Under "Build and deployment", set **Source** to `Deploy from a branch`,
   branch `main`, folder `/ (root)`. Save.
5. Wait a minute, then visit `https://YOUR-USERNAME.github.io/koinect/`.

That's it — no build step, no server to maintain.

## Installing it like an app

Once it's live on GitHub Pages (or any HTTPS host), visiting the site on a
phone will offer an **"Add to Home Screen"** / **"Install"** prompt (or it's
in the browser's menu). After installing, it opens full-screen and works with
no internet connection.

## How progress is saved

Progress is stored in the browser's `localStorage`, scoped to the site's URL.
That means:

- Closing the tab/app and returning later keeps your progress. ✅
- It's per-device, per-browser — there's no login and nothing syncs between
  devices. If you clear your browser's site data, progress resets.
- Nothing is ever sent to a server. It all stays on the learner's device.

## Adding more lessons

Open `data/lessons.json` and copy an existing lesson object. Each lesson needs:

```json
{
  "id": 6,
  "title": "Lesson Title",
  "subtitle": "第六课 · A short Chinese subtitle",
  "scenario": "One or two sentences describing the real church situation.",
  "dialogue": [ { "speaker": "...", "chinese": "...", "pinyin": "...", "english": "..." } ],
  "vocabulary": [ { "chinese": "...", "pinyin": "...", "english": "...", "note": "" } ],
  "quiz": [ { "question": "...", "options": ["...", "...", "..."], "answer": "..." } ],
  "challenge": "One practical thing to try this week."
}
```

Lessons unlock in order — a lesson becomes available once the previous one is
completed. Add as many as you like; there's no limit built into the app.

## Updating the app later

Because everything is cached by the service worker, if you change the code and
push an update, returning visitors' browsers will pick up the new files on
their *next* visit after the new version is cached in the background (a normal
PWA update pattern). Their saved lesson progress is untouched — it lives in
`localStorage`, completely separate from the cached app files.
