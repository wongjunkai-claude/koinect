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

## Language & terminology standard

Vocabulary and phrasing follow **Singapore Protestant church usage**, and
Bible-related terms follow the **Chinese Union Version, Simplified (CUVS /
和合本)** — the translation most commonly used in Singapore churches. A few
examples already reflected in the lessons:

- **崇拜** (chóngbài) rather than 礼拜 for "worship service" — matches how
  Singapore church bulletins print "主日崇拜." (礼拜 is noted as a common
  colloquial alternative, especially in the phrase 做礼拜, "to attend church.")
- **恩典**, **讲道**, **祷告** — standard CUVS/Singapore-church terms for
  grace, sermon, and prayer.
- **弟兄 / 姊妹** — the common Singapore-church terms for a fellow male/female
  believer ("brother"/"sister" in Christ).
- **主日学** — the standard Singapore-church term for Sunday school.
- **平安** as a greeting, often short for 主内平安 ("peace in the Lord").

When adding new lessons, keep this standard: favor the term you'd actually
hear or read in a Singapore Protestant church bulletin or CUVS Bible reading,
and use the vocabulary `note` field to flag any regional/denominational
variation worth knowing.

## Sound

Correct answers, passing a lesson's quiz, and finishing a whole lesson each
play a short, calm chime — synthesized in the browser (Web Audio API), so
there are no audio files to download or cache. There's deliberately no sound
for a wrong answer; feedback is shown as text only, matching Koinect's
non-punitive design.

## Review & retry

Getting a question wrong doesn't stop the quiz — it quietly goes to the back
of the line and comes back up after the others. Each time you get the *same*
question wrong, that specific wrong option gets greyed out and can't be
picked again, so repeated attempts narrow the choices down. A lesson's quiz
only counts as passed once every question has been answered correctly at
least once.

## Home Dashboard

The Home screen adapts to where you are:

- **New user:** a plain "start your first lesson" card — no stats, no zeros.
- **Active learner:** a Continue card pulled straight from the next lesson's
  own scenario text, a streak pill (once it's more than 1 day — no fire
  emoji, per Koinect's calm design philosophy), a stats strip (lessons done,
  unique words met, current stage), and a "Today's Focus" row with two tiles:
  words due for review, and a reminder of last lesson's real-world challenge
  (dismissible once you've done it).
- **All caught up:** the Continue card offers to revisit a past lesson
  instead of leaving a dead end.

Lessons are grouped by stage (Connect / Belong / Grow / Serve) with a
completion count per stage. A stage with no lessons yet is shown honestly —
"Lessons for this stage are still being written" — rather than just missing.

## Daily Review (spaced repetition)

Finishing a lesson quietly schedules its vocabulary for review, starting the
next day. Koinect uses a simple 5-box Leitner schedule:

- Get a word right → the gap before its next review roughly doubles
  (1 → 2 → 4 → 7 → 14 days).
- Get it wrong → it resets to box 1 and comes back tomorrow.

The review session reuses the same gentle retry-with-elimination pattern as
lesson quizzes: a wrong guess doesn't end the session, it just goes to the
back of the queue and comes back around, with that specific wrong option
greyed out on the retry. Only your *first* attempt at each word feeds the
schedule — later retries in the same session are for reinforcement, not
re-scoring.
## Explore (reference glossary)

Some vocabulary doesn't naturally emerge from a conversation — Bible book
names, biblical people and places, festivals, and church roles are reference
knowledge, not dialogue practice. Rather than force these into lesson
dialogues, they live in a separate, searchable glossary (📖 icon on Home, or
the "Explore" card at the bottom of the lesson list).

- Organised into six categories: Names & Titles of God, Books of the Bible,
  Bible People, Bible Places, Festivals & Special Days, and Church Roles &
  Groups.
- Search works by Chinese, pinyin (no need to type tone marks), or English,
  and updates as you type.
- Entries that are also taught inside a lesson show a "Taught in Lesson N"
  link that jumps straight there — so the glossary can point back to real
  context instead of becoming just a word list.
- The glossary intentionally includes a few terms beyond what's taught in
  lessons (e.g. 出埃及记 Exodus, 彼得 Peter, 圣灵降临节 Pentecost) so it's a
  genuinely useful lookup tool, not just an index of lesson content.

Data lives in `data/reference.json` — add entries the same way you'd add a
lesson: copy an existing object, fill in `chinese`, `pinyin`, `english`,
`note`, and `taughtInLesson` (or `null` if it isn't taught anywhere yet).

## Cast & dialogue voices

Dialogues use a small recurring cast rather than generic labels like
"Leader" or "Friend" — Wei Ming, Hui Ling, Jia Hui, Kevin, Grace Lim, Pastor
Koh, Auntie Tan, Rachel, and Daniel. Names mix Chinese given names (the way
Singaporeans actually address each other), English first names common among
Singapore Christians, and honorifics like "Auntie" and "Pastor" for elders —
deliberately not mainland-style full pinyin names.

When you tap **Play Conversation**, each named character is assigned a
gender, and "You" is automatically given the opposite gender of whoever
else is in the scene, so a two-person dialogue has two distinct voices.
This depends on the device having more than one Chinese voice installed —
some browsers/OSes only ship a single Chinese voice, in which case there's
nothing to pick between and both roles will sound the same. Nothing breaks
either way; it just can't sound like two people if the device only offers
one voice to begin with.

## Bible Reading (Read tab)

A 📜 icon on Home (and a card on the lesson list) opens **Read**, which has
two parts:

**1. A curated reading plan** — 19 short, well-known passages (Genesis 1,
the Ten Commandments, Psalm 23, the Beatitudes, John 3:16, the Lord's
Prayer, etc.) with a progress bar, good as a starting point.

**2. The complete Bible, browsable** — all 66 books, every chapter (1,189
chapters, 31,100 verses), navigable Book → Chapter → verse-by-verse reader,
with Previous/Next chapter buttons for reading straight through, and its
own per-book progress ("Genesis · 3 of 50 chapters read"). This is the real
"read the Chinese Bible" experience — the curated list above is a taster,
not the whole thing.

Both share the same reader: verse-by-verse Chinese text with pinyin, audio
playback (Web Speech API), and a "Mark as Read" button.

**Source and licensing:** The text is the Chinese Union Version, Simplified
(和合本 / CUVS) — first published 1919, confirmed public domain (copyright
expired; see [Wikipedia: Chinese Union
Version](https://en.wikipedia.org/wiki/Chinese_Union_Version)). All 66
books were parsed directly from the
[seven1m/open-bibles](https://github.com/seven1m/open-bibles) repository's
`chi-cuv-simp.usfx.xml` — a source that explicitly labels each translation's
license per file (this one: Public Domain), rather than a source with a
blanket "all rights reserved" disclaimer covering many translations at once.
Pinyin for all 31,100 verses was generated automatically from that verified
Chinese text using the `pypinyin` library — a deterministic transliteration
tool, not a creative or copyrighted work.

**A practical note on size:** `data/bible-full.json` is about 8.5MB — small
for a modern app, but worth knowing about if you're watching total repo
size or mobile data usage on first install. It's fetched lazily (only when
someone actually opens "Browse the Bible," not at every app launch) and
cached by the service worker afterward, so it only costs bandwidth once.

## Vocabulary: New vs. Review

Each lesson's Vocabulary step labels every word **New** or **Review** —
Review means that word was already introduced in an earlier lesson.

This used to be mostly theoretical: an earlier version of this feature
found that although lessons' *dialogue* naturally reused earlier words all
the time (common connective vocabulary like 教会, 谢谢, 神, 一起, 祷告,
对), those reused words were never actually added to the *vocabulary list*
of the lessons reusing them — so the badge had almost nothing to show. An
audit of all 38 lessons found **142 such hidden reuse instances** across
the dialogues. Those have now all been formalized as explicit vocabulary
entries in the lessons that use them, so the New/Review distinction (and
therefore the spaced-repetition schedule) reflects what's actually in the
dialogue text, not just what was originally listed. Lesson 38, for example,
now correctly shows "5 new, 7 you've met before" instead of "12 new."

This is a real content audit fix, not a rewrite — no dialogue text changed,
no new Chinese was written or needed verification. It simply catalogues
prior-knowledge reuse that was already present but invisible. Real
Duolingo-style curriculum design — deliberately writing *new* dialogue that
reuses prior vocabulary as a designed prerequisite chain — remains a
separate, ongoing content-writing effort for future lessons, not something
this pass created retroactively.

## Adding more lessons

Open `data/lessons.json` and copy an existing lesson object. Each lesson needs:

```json
{
  "id": 11,
  "stage": "Grow",
  "title": "Lesson Title",
  "subtitle": "第十一课 · A short Chinese subtitle",
  "scenario": "One or two sentences describing the real church situation.",
  "dialogue": [ { "speaker": "...", "chinese": "...", "pinyin": "...", "english": "..." } ],
  "vocabulary": [ { "chinese": "...", "pinyin": "...", "english": "...", "note": "" } ],
  "quiz": [ { "question": "...", "options": ["...", "...", "..."], "answer": "..." } ],
  "challenge": "One practical thing to try this week."
}
```

`stage` must be one of `"Connect"`, `"Belong"`, `"Grow"`, or `"Serve"` —
it's what drives the journey bar and the grouped lesson list on Home.

Lessons unlock in order — a lesson becomes available once the previous one is
completed. Add as many as you like; there's no limit built into the app.

## Updating the app later

Because everything is cached by the service worker, if you change the code and
push an update, returning visitors' browsers will pick up the new files on
their *next* visit after the new version is cached in the background (a normal
PWA update pattern). Their saved lesson progress is untouched — it lives in
`localStorage`, completely separate from the cached app files.
