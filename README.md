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
dialogues, they live in a separate, searchable glossary — the 📖 Explore
tab in the bottom navigation.

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
"Leader" or "Friend" — each shown as Chinese characters plus English
spelling together (e.g. "慧玲 Hui Ling"), so every appearance reinforces
name recognition in both forms:

- 伟明 Wei Ming
- 慧玲 Hui Ling
- 嘉慧 Jia Hui
- 家豪 Kevin
- 林嘉恩 Grace Lim
- 高牧师 Pastor Koh
- 陈阿姨 Auntie Tan
- 瑞秋 Rachel
- 丹尼尔 Daniel

Names mix Chinese given names (the way Singaporeans actually address each
other), English first names common among Singapore Christians, and
honorifics like "Auntie" and "Pastor" for elders — deliberately not
mainland-style full pinyin names. The Chinese-character mapping lives in
`CHARACTER_CHINESE_NAME` in `app.js`, purely a display concern — the voice
gender logic (`CHARACTER_GENDER`) still keys off the plain English label,
so adding a name here never affects the audio.

When you tap **Play Conversation**, each named character is assigned a
gender, and "You" is automatically given the opposite gender of whoever
else is in the scene, so a two-person dialogue has two distinct voices.
This depends on the device having more than one Chinese voice installed —
some browsers/OSes only ship a single Chinese voice, in which case there's
nothing to pick between and both roles will sound the same. Nothing breaks
either way; it just can't sound like two people if the device only offers
one voice to begin with.

## A Bible verse for every lesson

Each of the 38 lessons now opens with one Bible verse chosen specifically
for what that lesson teaches — not a generic highlight, a real thematic
match. A few examples: Lesson 8 ("Exchanging Contact Info") pairs with
Proverbs 27:17, "as iron sharpens iron"; Lesson 15 ("When Someone is Sick")
pairs with James 5:14, about calling the church's elders to pray over the
sick; Lesson 36 ("Giving & Tithing") pairs with 2 Corinthians 9:7, "God
loves a cheerful giver" — which directly echoes that lesson's own
vocabulary word 甘心乐意 ("willingly and cheerfully").

The verse shows on the first screen of the lesson, right after the
scenario — verse-by-verse Chinese text with pinyin (same `scripture-block`
styling used in Read), and a 🔊 to hear it spoken. All 38 verses were pulled
directly from the same verified `data/bible-full.json` used for the Read
tab, not retyped or recalled from memory, so they carry the same sourcing
guarantees documented above.

Each lesson's tagged verse lives in its `verse` field (`reference`,
`referenceEnglish`, `chinese`, `pinyin`) — same shape as a Read tab passage,
just singular and lesson-scoped.

## Bible Reading (Read tab)

The 📜 Read tab in the bottom navigation has two parts:

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

## Every taught word actually appears in its lesson

Each lesson's vocabulary list is meant to reflect words genuinely used in
that lesson's dialogue — not just a word bank sitting alongside it. An
audit found 9 lessons where a taught word never actually appeared in the
spoken lines (e.g. Lesson 33 taught 传福音, "to share the Gospel," but
nobody in the conversation ever says it — which makes sense, since it's an
awkward thing to say about yourself mid-conversation). All 9 are fixed now,
two different ways depending on the word:

- **Small wording tweaks**, where the word just needed the right verb tense
  or phrasing to appear exactly as taught (e.g. Lesson 21's "我信了主"
  became "我决定信主" so 信主 appears as its own unit; Lesson 31's "我来带
  查经" became "我来带领查经" to use the full taught verb 带领).
- **A narrator line**, for words that are inherently *about* a
  conversation rather than something said *within* one — 传福音 (to
  evangelize) and 邀请 (to invite) are things you'd describe someone doing,
  not things you'd say aloud to them. These lessons now open with a short
  italicized, third-person scene-setter above the dialogue (e.g. "大卫今天
  约了Daniel，要向他传福音" — "David arranged to meet Daniel today,
  planning to share the Gospel with him"), read aloud as part of "Play
  Conversation" like any other line, but visually distinct — no speech
  bubble, no speaker name, just italic caption text.

To add a narrator line to a future lesson, give it `"speaker": "Narrator"`
in the dialogue array — the app renders it as scene-setting text
automatically rather than a spoken bubble.

## Lesson numbering

Lessons are numbered in clean, sequential stage blocks: Connect 1–8, Belong
9–16, Grow 17–28, Serve 29–38. Earlier on, lessons got their ids in the
order they were written rather than the order they appear in the app, so a
lesson like "Christmas at Church" (Belong) ended up sitting between two
Grow-stage lessons in the numbering — confusing if you ever looked at the
raw data or wondered why "Lesson 24" wasn't where you expected. That's
fixed now; the id order matches the actual learner path.

If you add a new lesson, give it the next free id *within its stage's
block* to keep this clean — e.g. a new Connect lesson should be inserted
before Belong's first id (9), which means shifting every later id up by
one. It's a bit of manual bookkeeping, but keeps `id` a meaningful "lesson
number" rather than just an arbitrary key.

**Note on existing saved progress:** if anyone tested an earlier version
of this app before the renumbering, their browser's saved progress refers
to the *old* lesson ids. After this update, their previously-completed
lessons won't be recognized as complete (harmless — nothing crashes, it
just looks like starting over). This is a one-time consequence of the
renumbering, not an ongoing concern.

## First launch: name prompt

The very first time the app opens, a short modal asks you to "Input Name
for this Learning Journey." Entering a name personalizes greetings on Home
("Good morning, Rachel." instead of just "Good morning."); tapping "Skip
for now" is equally valid and just uses the generic greeting instead.
Either way, this only appears once — stored as `nameOnboardingSeen` in
progress, so it won't nag on later visits. Your name lives in
`progress.userName`, same local-only storage as everything else.

## Bottom navigation

Home, Read, Explore, and Settings are the four persistent tabs, shown as a
fixed bottom bar on those four top-level screens. Diving into something
specific — a lesson, a single Bible reading, a Bible chapter, a review
session — switches to a focused "task mode" instead: the bottom bar
disappears and a back arrow takes its place, since at that point you're
drilling into one thing rather than switching between sections.

## Settings

⚙️ Settings (in the bottom nav) now houses what used to be a separate Help
screen, plus a real setting:

- **Sound Effects & Speech** — a single on/off toggle that mutes both the
  chime sounds (correct answer, lesson complete, etc.) and all spoken
  audio (Play Conversation, 🔊 buttons, everywhere). One switch rather than
  splitting into separate toggles, since most people either want audio or
  don't. Stored in `progress.settings.soundEnabled`.
- The app version number and the same "how Koinect works" explanations
  that used to live on the Help screen.

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
