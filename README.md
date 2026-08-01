# Koinect — Learn Chinese for Church

A small, installable web app for learning Chinese phrases used in church life —
greetings, introductions, a church tour, and following along in a Sunday service.

No accounts, no backend, no build step. Progress is saved right in the browser,
so closing the app and coming back tomorrow picks up exactly where you left off.

## What's inside

```
index.html              the app shell
style.css               all styling (colors, type, layout)
app.js                  all app logic (lessons, quiz, progress saving)
manifest.json           makes the app installable on phones/desktops
sw.js                   service worker — caches everything for offline use
data/lessons.json       all lesson content (edit this to add/change lessons)
data/reference.json     Explore glossary (Bible books, people, places, terms)
data/bible-full.json    the complete 66-book Bible, verse by verse
data/highlights.json    the 5 fixed Key Highlights (Creed, Lord's Prayer, etc.)
data/basics.json        the 8-lesson Chinese Basics mini-course
data/proclaim.json      the 5-lesson Share Your Faith track
icons/                  app icons
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

## Progress safety across updates

Shipping updates to an app that stores everything in `localStorage` carries
a real risk: change the wrong thing, and existing users' progress silently
resets or breaks. This already happened once in this project — an early
lesson renumbering meant anyone who'd tested before that point had their
completed lessons stop being recognized. Three rules now guard against it
happening again, enforced with actual code, not just intention:

1. **`STORAGE_KEY` never changes.** It's the only pointer to a user's saved
   data — changing it orphans everything under the old key rather than
   migrating it.
2. **Lesson / Basics / Proclaim ids are never reordered or reused once
   shipped.** New content always gets the next free id in its own track.
   (This is the rule the earlier renumbering incident led directly to.)
3. **Any future change to progress's *shape*** — not just adding a new
   field, but changing what an existing field means — goes through
   `PROGRESS_SCHEMA_VERSION` and a real `migrateProgress()` function in
   `app.js`, not ad hoc handling.

Practically, this means: `loadProgress()` merges whatever's saved onto a
full set of defaults (so a field that didn't exist yet when someone last
used the app fills in safely instead of crashing), and nested objects like
`settings` merge one level deep too — so an old saved preference (e.g.
sound already turned off) survives a later update that adds a brand new
setting alongside it, rather than the whole object being silently
replaced. Verified directly: simulated a very early saved-progress shape
(missing every field added since — Basics, Proclaim, favorites, the
lesson-resume system, all of it) and confirmed it loads with zero data
loss and no crash, real device testing aside.

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

**On dialogue naturalness:** an earlier review pass fixed the handful of
lines the app's actual user personally caught as stiff or unnatural (see
git history / prior conversation), but explicitly left the other ~30
lessons unreviewed at the time. A second self-critical pass went back
through all 38 dialogues looking specifically for the same pattern flagged
before — lessons that read like catechism Q&A ("What is X? X is Y.") rather
than something two people would actually say. Most held up fine on
re-reading; **Lesson 18 (Salvation)** was the clearest remaining offender
and was rewritten to include a believer's realistic misconception ("don't
we need lots of good deeds first?") and a personal follow-up ("what if I
mess up, will God still forgive me?") rather than a flat definition-only
exchange — while keeping every vocabulary word and the exact sentence used
by Respond Practice's fill-in-blank exercise intact.

**The same honest limit still applies**: this catches structural/pattern
issues (catechetical cadence, unnatural questions) that a careful re-read
can find, not idiomatic word-choice naturalness a native Singaporean
Chinese-speaking churchgoer would catch instantly. That still needs a real
person's read, not more rounds of self-review.

## Sound

Correct answers, passing a lesson's quiz, and finishing a whole lesson each
play a short, calm chime — synthesized in the browser (Web Audio API), so
there are no audio files to download or cache. Wrong answers now play a
sound too — deliberately quiet and low, a neutral "not quite" rather than
a buzzer, and quieter than the correct sound. Feedback is always shown as
text too; the sound just reinforces it, never replaces it or feels like
punishment. Both sounds live in `AudioFX` in `app.js`.

## Review & retry

Getting a question wrong doesn't stop the quiz — it quietly goes to the back
of the line and comes back up after the others. Each time you get the *same*
question wrong, that specific wrong option gets greyed out and can't be
picked again, so repeated attempts narrow the choices down. A lesson's quiz
only counts as passed once every question has been answered correctly at
least once.

## Select, then confirm

Every quiz-style question in the app — the main lesson quiz, Respond
Practice, Scripture Reading Practice, Daily Review, Chinese Basics,
Share Your Faith, and the Basics placement test (7 places total) — uses
the same two-step interaction: tapping an option just *selects* it (a
highlighted state, distinct from correct/incorrect), and nothing is
graded until a separate "Confirm Answer" button is tapped. Selecting a
different option before confirming simply changes which one is
highlighted; nothing is locked in until Confirm. This lets you change
your mind before committing, rather than the previous behavior of
grading instantly on tap.

The Confirm button starts disabled and only enables once something is
selected. All 7 locations were restructured to share this exact pattern
consistently, each verified directly: selecting doesn't grade early,
changing the selection updates which option is highlighted, and
confirming triggers grading, sound, and the disabled/graded state exactly
once. One of the seven — the Scripture Reading Practice question — is a
special case worth knowing about: it's embedded inline on the lesson's
Challenge screen, which already has its own "Finish Lesson" button in the
sticky footer, so its Confirm button renders inline within the question
itself rather than in the footer, and confirming it doesn't touch or
replace the Finish Lesson button at all.

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

Some vocabulary doesn't naturally emerge from a conversation — biblical
people and places, festivals, and church roles are reference knowledge,
not dialogue practice. Rather than force these into lesson dialogues, they
live in a separate, searchable glossary — the 📖 Explore tab in the bottom
navigation.

- **Nine collapsible categories**, closed by default, each with an English
  and Chinese name: Names & Titles of God 神的名字与称号, Bible Characters
  圣经人物, Bible Places 圣经地名, Festivals & Special Days
  节期与特别日子, Biblical Groups & Peoples 圣经中的群体, Church Roles &
  Groups 教会角色与群体, Biblical Vocabulary 圣经词汇, Fruit of the Spirit
  圣灵的果子, and Biblical Grammar 圣经文法. Built with native
  `<details>`/`<summary>` — no custom JS needed for the expand/collapse
  behavior. (Books of the Bible was removed as its own category here,
  since the Read tab's book list — with its own icon per book — covers
  that better than a flat glossary entry could.)
- **All twelve disciples by name** — Simon Peter, Andrew, James (son of
  Zebedee), John, Philip, Bartholomew, Thomas, Matthew, James (son of
  Alphaeus), Thaddaeus, Simon the Zealot, and Judas Iscariot — pulled
  directly from the verified text of Matthew 10:2-4, not reconstructed
  from memory. Goliath (歌利亚) is in too, alongside the twelve — the kind
  of character taught from Sunday school onward.
- **神 shows both common terms** — 神 / 上帝 — since different Bible and
  church editions use one or the other; the definition is simply "God,"
  not a note about which translation convention it follows.
- **A broader Biblical Vocabulary set**: each of the nine Fruit of the
  Spirit terms individually (仁爱/喜乐/和平/忍耐/恩慈/良善/信实/温柔/节制)
  in their own category, plus core theological vocabulary that wasn't
  covered before — 十字架 (the Cross), 恩典 (grace), 救赎 (redemption),
  称义 (justification), 圣洁 (holiness), 天国 (the kingdom of heaven), and
  more.
- **Old Testament festivals** beyond Christmas/Easter/Pentecost: Passover
  (逾越节), the Feast of Unleavened Bread (除酵节), the Feast of Weeks
  (七七节 — the OT festival Pentecost descends from), the Feast of
  Tabernacles/Booths (住棚节), the Day of Atonement (赎罪日), and Purim
  (普珥日) — each term checked against real occurrences in Exodus,
  Leviticus, Deuteronomy, and Esther before being added.
- Search works by Chinese, pinyin (no need to type tone marks), or English,
  and updates as you type — search results show as a flat list regardless
  of category, not nested inside the collapsed accordion.
- Entries that are also taught inside a lesson show a "Taught in Lesson N"
  link that jumps straight there.

Data lives in `data/reference.json` — add entries the same way you'd add a
lesson: copy an existing object, fill in `chinese`, `pinyin`, `english`,
`note`, and `taughtInLesson` (or `null` if it isn't taught anywhere yet).
Each category also has a `nameZh` field for its Chinese header.

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
gender. Two things happen to make male and female characters sound
distinct:

1. If the device has more than one Chinese voice installed, Koinect tries
   to pick a different one for each gender.
2. **Pitch is also adjusted per gender** (male characters pitched down,
   female pitched up) — and this part works regardless of how many voices
   exist. This matters because **many devices only ship one Chinese voice
   at all** — iOS's default Mandarin voice, "Tingting," is female with no
   built-in male alternative unless someone manually downloads another
   voice in Settings. Relying on voice selection alone would mean every
   character sounds identical (and female) on exactly those devices, no
   matter how a character is labeled — which is what you'd hear if you
   tested this before the pitch adjustment was added. With pitch also in
   play, male and female characters sound different even on a single-voice
   device.

"You" is automatically given the opposite gender of whoever else is in the
scene, so a two-person dialogue always has two distinct-sounding voices.

## A Bible verse for every lesson

Each of the 38 lessons ends with one Bible verse chosen specifically for
what that lesson taught — not a generic highlight, a real thematic match.
A few examples: Lesson 8 ("Exchanging Contact Info") pairs with Proverbs
27:17, "as iron sharpens iron"; Lesson 15 ("When Someone is Sick") pairs
with James 5:14, about calling the church's elders to pray over the sick;
Lesson 36 ("Giving & Tithing") pairs with 2 Corinthians 9:7, "God loves a
cheerful giver" — which directly echoes that lesson's own vocabulary word
甘心乐意 ("willingly and cheerfully").

The verse appears at the very end — after the quiz, alongside the Weekly
Challenge, framed as "Carry This With You." It works as a closing thought
rather than an opening one: you've just practiced the vocabulary and
scenario, and the verse sends you off with something to actually reflect
on and take into the week, rather than being read once at the start and
forgotten by the time you finish.

All 38 verses were pulled directly from the same verified
`data/bible-full.json` used for the Read tab, not retyped or recalled from
memory. Each lesson's tagged verse lives in its `verse` field (`reference`,
`referenceEnglish`, `chinese`, `pinyin`).

## Bible Reading (Read tab)

The 📜 Read tab in the bottom navigation opens directly into the complete
Bible — all 66 books, every chapter (1,189 chapters, 31,100 verses),
navigable Book → Chapter → verse-by-verse reader, with Previous/Next
chapter buttons for reading straight through, and its own per-book progress
("Genesis · 3 of 50 chapters read"). The book list is grouped under
"Old Testament 旧约" and "New Testament 新约," and each book has its own
symbolic icon (🌱 for Genesis, 🎵 for Psalms, 👑 for Matthew, 🌟 for
Revelation, and so on) instead of one generic book emoji for all 66 —
`BOOK_ICONS` in `app.js`. These are original icon choices made for this
app, not a reproduction of any Bible publisher's copyrighted icon set.

An earlier version of this also had a separate curated list of 19
well-known passages sitting in front of the full Bible. That's been
removed — it added an extra screen and a "which one do I use" decision
without much benefit once the complete Bible was already one tap away.
Read now goes straight to the book list.

The reader itself: verse-by-verse Chinese text with pinyin, audio playback
(Web Speech API), and a "Mark as Read" button per chapter.

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
someone actually opens the Read tab, not at every app launch) and cached by
the service worker afterward, so it only costs bandwidth once.

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

The very first time the app opens, a modal requires entering a name before
continuing — "Input Name for this Learning Journey." This is mandatory,
not skippable: submitting empty or whitespace-only shows an inline error
and blocks continuing until a real name is entered. The name personalizes
greetings on Home ("Good morning, Rachel." instead of just "Good
morning."). This only appears once — stored as `nameOnboardingSeen` in
progress, so it won't reappear on later visits. Your name lives in
`progress.userName`, same local-only storage as everything else.

## Bottom navigation

Home, Favourites, Read, Explore, and Settings are the five persistent tabs,
shown as a fixed bottom bar on those top-level screens. Diving into
something specific — a lesson, a Bible chapter, a favourite verse's detail
view — switches to a focused "task mode" instead: the bottom bar
disappears and a back arrow takes its place, since at that point you're
drilling into one thing rather than switching between sections.

## Tablet & desktop layout

The app was built mobile-first and stayed genuinely mobile-only (a single
`max-width: 480px` column, no responsive breakpoints at all) through most
of this project — deliberate at the time, since it was being used inside
Claude's mobile app, but a real gap once used as an installed app on a
tablet or in a desktop browser. Three tiers now:

- **Mobile (default, unchanged):** 480px column, bottom tab bar. Nothing
  about the existing mobile experience changed.
- **Tablet (768px+):** a wider 600px column for more comfortable reading
  line-length. Bottom tab bar stays — many tablet-native apps (including
  most iPad apps) keep bottom tabs rather than switching to a sidebar at
  this size, and it avoids introducing a second nav paradigm at a size
  where either works fine.
- **Desktop (1100px+):** a 680px column, and the bottom bar becomes a
  left sidebar. The sidebar is positioned using `calc(50vw - ...)` math
  relative to the viewport center, landing in whatever space is already
  naturally empty beside the centered content column — deliberately
  chosen so the content itself never needs to shift, resize, or gain a
  margin to make room. Same `bottomNavHtml()` function and same 5 tabs;
  only the CSS changes between bottom-bar and sidebar presentation, no
  JS branching needed.

`.chapter-grid` (used for Bible chapter numbers) already used
`grid-template-columns: repeat(auto-fill, minmax(48px, 1fr))`, so it
automatically shows more columns as the container widens at each tier —
no changes needed there.

**An honest limitation:** this environment can't render real CSS layout
(no visual browser, no way to screenshot), so — same as the drag-reorder
feature that shipped, then got removed after real-device feedback showed
it didn't feel right — this was built using well-established, low-risk
responsive patterns rather than anything novel, and verified structurally
(the CSS is well-formed, targets classes that actually exist in the
rendered HTML, and the full lesson regression still passes), not visually.
Worth an actual look on a tablet and in a desktop browser before
considering this settled.

## Settings

⚙️ Settings (in the bottom nav) now houses what used to be a separate Help
screen, plus a real setting and a full progress dashboard:

- **My Progress** — before this existed, progress was scattered: Home
  showed main lesson progress, Basics and Proclaim each had their own list
  screen with their own count, Read had chapter progress buried in its own
  tab, and there was no single place to see everything. This is that
  single place: total lessons complete across all three tracks combined
  (main lessons + Basics + Proclaim, out of 51), a per-track breakdown
  with its own progress bar, Bible reading (chapters read out of 1,189,
  books fully complete out of 66), favourite verses saved, and vocabulary
  (unique words met, how many are in the spaced-repetition rotation, how
  many are due today). Tapping any stat card jumps straight to that
  section. Not a 6th bottom-nav tab — reached from Settings instead, to
  keep the already-full 5-tab bar from getting more crowded. Verified
  directly: fresh install shows 0 of 51 correctly, completing a lesson
  updates the dashboard's numbers immediately, and favoriting a verse or
  marking a chapter read does the same.
- **Sound Effects & Speech** — a single on/off toggle that mutes both the
  chime sounds (correct answer, lesson complete, etc.) and all spoken
  audio (Play Conversation, 🔊 buttons, everywhere). One switch rather than
  splitting into separate toggles, since most people either want audio or
  don't. Stored in `progress.settings.soundEnabled`.
- The app version number and the same "how Koinect works" explanations
  that used to live on the Help screen.

## Share Your Faith (sustained speech, not dialogue)

Every conversational lesson, every practice exercise in this app trades
turns between two people. But testifying, preaching, and sharing the
gospel are **monologues** — sustained speech with a beginning, middle, and
end, delivered *to* someone, not traded *with* them. Someone could finish
all 38 lessons and Chinese Basics and still never have practiced producing
four connected sentences in a row. This is a third, separate track built
specifically to close that gap:

1. **Discourse Markers for Speaking** — 首先/其次/最后, 换句话说, 总结来说,
   让我们一起, 不但...而且... — the connecting words a two-person dialogue
   never needed, but any structured talk does.
2. **Telling Your Story** — the universal three-act testimony shape
   (以前 / 后来 / 从此 — before / turning point / now), plus a **"Your
   Turn"** phase: a scaffold and a free-text space to actually draft your
   own testimony, saved locally (`progress.myTestimony`), never graded.
3. **The Gospel in Order** — a memorizable four-verse sequence (Romans
   3:23 → 6:23 → John 3:16 → Romans 10:9, sometimes called the "Romans
   Road"), practiced as one continuous flow with a "Play in Order" button,
   not as isolated verses.
4. **Answering Common Questions** — objections genuinely specific to
   Chinese-speaking contexts: family/identity ("we have our own beliefs"),
   family fear ("what will they think?"), "isn't this Western?",
   pluralism ("how do you know, with so many religions?"), and the
   ongoing practical tension of ancestor rituals for a new believer with a
   non-Christian family — not generic Western apologetics.
5. **Following a Sermon** — the bridge between one-verse Scripture Practice
   and the fully-unaided Bible: a real, connected passage at natural
   preaching length. Uses Peter's sermon at Pentecost (Acts 2:22-38) — the
   first Christian sermon ever preached, verified from the same Bible data
   as everywhere else, not invented "sermon-style" text.

Structurally, this shares Chinese Basics' guided, one-at-a-time explain
flow (intro → each point individually → examples/verse-sequence grouped
together → practice), extended with two Proclaim-specific pieces: a
connected verse sequence display (`isVerseSequence`, used for the Gospel
sequence and Peter's sermon) instead of a vocabulary grid, and — only for
"Telling Your Story" — an extra "Your Turn" step at the very end of the
explain flow, right before practice, holding the free-text testimony
scaffold. Progress tracks separately in `progress.proclaimCompleted`, with
the same step-level resume as Basics in `progress.proclaimLessonProgress`
(furthest explain-step reached, so leaving mid-lesson and reopening it
resumes at the exact same point) — discoverable from its own Home card,
alongside Basics, a third parallel track, not nested inside either of the
other two.

**A review pass on "Answering Common Questions":** this was flagged early
as the least-tested content in the app — designed reasoning from the
outside, not lived cross-cultural evangelism experience. A self-critical
review found two real gaps worth fixing without waiting for outside
input: the pluralism objection ("how do you know, with so many
religions?") had a point but no actual example modeling a response to
it — the other three objections did — so a genuine, experience-based
answer was added rather than a comparative-religion debate point. And the
"Western religion" response jumped straight to a historical fact, unlike
the family objection, which correctly led with empathy first; it now
leads the same way. A fifth point was also added: not just the one-time
fear of telling family, but the *recurring* practical question of what to
do during actual ancestor-ritual moments as an ongoing believer — framed
honestly as something to work through with a pastor or mentor who knows
the specific family, not a single correct rule. **A real bug caught while
making this edit**: appending the pluralism point without checking it
already existed created an exact duplicate, which would have shown the
same screen twice in the guided flow. Caught by testing the actual
click-through, not by reading the edit script.

## Chinese Basics (optional mini-course)

Every lesson shows pinyin with tone marks and uses grammar particles like
吗/的/了 constantly — but nothing in the app ever explained what a tone
*is*, how to read pinyin, or what those particles actually do. For someone
with real Chinese background, that's fine — Koinect was built to extend
existing foundations into church-specific vocabulary, not to re-teach
Mandarin from scratch. But for a genuine beginner, that gap makes the rest
of the app hard to access at all.

**Chinese Basics is a deliberately separate 8-lesson mini-course** covering
the real grammatical skeleton of Mandarin — not folded into the Connect →
Belong → Grow → Serve numbering, since that represents the church
participation journey, and this is a different, prerequisite axis
entirely:

1. **The Four Tones** — with real audio (via the same Web Speech API used
   everywhere else) demonstrating 妈/麻/马/骂
2. **Reading Pinyin** — the sounds that trip up English speakers: q, x,
   zh/ch/sh vs. z/c/s, ü
3. **Pronouns & 是 Sentences** — 我/你/他, "to be," negation
4. **Yes/No Questions & Question Words** — 吗, 谁/什么/哪里/为什么/怎么
5. **Numbers 0–100** — the actual counting system, not just memorized digits
6. **Measure Words** — 个/位/本/杯, a whole grammatical category English
   doesn't have
7. **的 (Possession) & Negation** — 不 vs. 没有, a classic beginner mix-up
8. **了 / 在 / 过** — completed action vs. ongoing vs. past experience

Each lesson follows a guided, one-at-a-time flow: **intro** → each teaching
point shown individually, one screen at a time, with its own "Next" → all
**examples grouped together** at the end (comparison value is high there —
e.g. seeing all four tone examples side by side) → **Practice** (multiple
choice questions, using the same retry-with-elimination pattern as the
main lessons — wrong answers get greyed out, not shamed). A progress bar
at the top tracks how far through the explain steps you are.

This wasn't the original design — the first version dumped the whole
explanation, every point, and all the examples onto one long scrolling
screen with a single "Practice" button at the bottom, which is closer to
a reference page than a guided lesson. Restructured after specific
feedback that it "felt like being handed a list of things to read," not
taught step by step.

**Resume works the same way the main 38 lessons do now.** Leaving a Basics
lesson mid-explanation and reopening it resumes at the exact point you
left, tracked in `progress.basicsLessonProgress` (furthest explain-step
reached) — not just "was this lesson finished or not." Home's Basics list
shows a distinct "in progress" state with a percentage, same as the main
lessons. Lessons unlock in order; full completion is tracked separately in
`progress.basicsCompleted`.

**Discoverability, not a gate:** a card on Home links to it ("New to
Chinese? Start with Basics" for new users, or a progress count once
started), but it never blocks access to Connect — someone who already has
these foundations can ignore it entirely.

**A real bug this caught (content):** Basics Lesson 2's practice question
about pronouncing ü used answer options containing literal quote marks
(`"ee" with rounded lips`), which silently broke the button's HTML
`data-opt` attribute when rendered — the embedded quote closed the
attribute early. Fixed with a proper `escapeAttr()` helper, applied
everywhere any quiz-style option gets rendered (5 places: the main quiz,
Respond Practice, Scripture Practice, Daily Review, and Basics) — not just
the one spot that happened to trigger it.

**A real bug this caught (progress):** after completing a Basics lesson,
its "in progress" tracking entry wasn't actually being removed from
storage. `markBasicsCompleted()` saves progress internally — but that save
ran *before* a later `delete progress.basicsLessonProgress[id]` line, so
the delete happened only in memory and was never persisted. Fixed by
saving again explicitly after the delete. The main 38 lessons' equivalent
function never had this bug (it deletes before its own save, correctly);
this only affected the newer Basics/Proclaim code. Verified clean across
all 8 Basics lessons and all 5 Proclaim lessons after the fix.

### Placement test

For anyone who already knows some Chinese, a "Take Placement Check" card
sits above the lesson list — 8 questions, one per Basics lesson, reusing
each lesson's own first practice question rather than authoring separate
diagnostic content. Single-attempt (no retry-until-correct — this is
diagnostic, not teaching). Get a question right and that lesson is marked
complete immediately, which also unlocks whatever comes next in the
sequence — verified with a scattered-correctness scenario (right, wrong,
wrong, right, wrong...) to confirm the unlock cascade correctly handles
gaps, not just a clean run from the start.

**A real bug this caught:** the placement test's "Cancel" and "Done"
buttons originally called `goBasics()`, which sets `location.hash` to
`#/basics` — but the hash was already `#/basics` the whole time (the test
flow renders in place, never actually navigating away). Setting a hash to
its current value doesn't fire `hashchange`, so nothing re-rendered;
clicking either button just left the stale results screen showing. Fixed
by calling `renderBasicsList()` directly instead of relying on routing for
what's actually an in-place state transition.

## Respond Practice

Every lesson's quiz tests word *recognition* — "what does this word mean."
That's different from testing whether someone can produce or pick an
*appropriate response* in a real exchange, which is what actually matters
for holding a conversation. Each lesson now has one Respond Practice
exercise (a new step between Quiz and Challenge), built from that lesson's
own real dialogue rather than invented content, in one of two forms:

- **Select the response** — shown a line from the dialogue (what the other
  person said), pick the appropriate reply from three options. The correct
  answer is the lesson's actual next line; the two wrong options are drawn
  from a small pool of deliberately unrelated phrases (e.g. "What time is
  it now?", "I don't like coffee") — obviously wrong regardless of the
  specific conversation, not a subtle grammatical distinction. Used in 21
  of the 38 lessons.
- **Fill in the blank** — a real sentence from the dialogue with one word
  blanked out, three word options to complete it. The two wrong options
  are other vocabulary from the *same* lesson, chosen so they don't fit
  the sentence grammatically (e.g. a noun where a verb is needed) — again,
  ruled out by pattern, not nuance. Used in the other 17 lessons.

This is single-attempt with immediate feedback and doesn't block finishing
the lesson — a practice rep, not a second gate alongside the vocabulary
quiz. Each lesson's exercise lives in its `respondPractice` field.

## Scripture Reading Practice

Being able to hold a conversation in Chinese and being able to *read the
Chinese Bible* are genuinely different skills — 和合本 (CUVS) uses literary,
early-20th-century Mandarin with classical connectives (乃, 惟, 凡, 若),
archaic vocabulary, and dense theological terms that never show up in
everyday speech or in this app's conversational dialogues. Finishing every
lesson here doesn't by itself teach someone to open Romans and understand
it on the page.

Each lesson's Challenge screen now closes with a **Scripture Reading
Practice** section, built directly from that lesson's own tagged verse (so
it always stays on-theme) rather than a separate, disconnected track:

- **Two literary/biblical-register vocabulary points**, genuinely present
  in that specific verse — not generic "Bible words," but the actual
  classical particles, archaic terms, or formal constructions found in the
  text. A few examples: Lesson 18 (Salvation) flags 本乎 and 乃是 — both
  built on the classical particle 乎/乃, never seen in spoken Mandarin;
  Lesson 37 (Discipling) flags that 教训 means "teaching" here, but in
  modern casual speech usually means "to scold someone" — a real register
  trap worth knowing.
- **One comprehension question** testing understanding of the verse
  itself — not the lesson's invented dialogue. Single-attempt, immediate
  feedback, doesn't block finishing the lesson (this is a bonus skill-
  building layer, not a new pass/fail gate).

Some vocabulary deliberately recurs across lessons on purpose — 凡事 (a
classical "every/all" construction) appears in Lessons 6, 12, and 35; 万族
and 万民 (both "all nations," same 万 + noun pattern) appear in Lessons 34
and 38 — so the classical grammar patterns themselves get spaced
repetition, the same way conversational vocabulary does elsewhere in the
app.

Each lesson's practice content lives in `verse.scriptureVocabulary` (an
array of 2 items) and `verse.scriptureQuestion` — both built from the
lesson's already-verified verse text, not written separately from it.

## Closing the vocabulary gap (data-driven)

Rather than guess what biblical vocabulary was missing, I computed real
word-frequency statistics across all 31,100 verses (using `jieba` for
Chinese word segmentation) and compared against every word already taught
anywhere in the app. The biggest finding: **耶和华 (the LORD / Yahweh)
appears 6,980 times — the single most common word in the entire Bible —
and wasn't in the glossary at all.** That's fixed now, along with several
other high-frequency names and terms the same analysis surfaced:

- **Names & Titles of God** gained 耶和华.
- **Bible People** gained standalone 耶稣, 基督, 大卫, and 雅各 — the last
  with an explicit note that 雅各 is *also* how "James" is rendered for two
  different New Testament disciples, so the same two characters mean a
  completely different historical figure depending on context.
- **Bible Places** gained 以色列 (the nation, distinct from 以色列人 "the
  Israelites") and 犹大 (Judah/Judea).
- Two new categories: **Biblical Vocabulary** (仆人, 子孙, 荣耀, 智慧) and
  **Biblical Grammar** (因为, 所以, 如此, 于是, 并且) — recurring
  literary connectives in the same spirit as Scripture Reading Practice.

## Favourites tab: Key Highlights, personalization, and sorting

⭐ Favourites is its own tab now (moved out of Read, which was getting
crowded with two different kinds of content). It has two parts:

**Key Highlights** — five fixed, pinned texts worth committing to
memory: the Apostles' Creed, the Lord's Prayer, the Great Commission, the
Great Commandment, and John 3:16. Not personalizable — they're permanent
reference texts, not personal favorites.

**Sourcing note:** four of the five are genuine Bible passages, pulled
directly from the same verified `bible-full.json` used everywhere else. The
Apostles' Creed is **not** Scripture, so it isn't in that file — it was
sourced separately and cross-checked against three independent Protestant
Chinese translations (Christian Reformed Church's official multilingual
page, CPRC, and faithchinesechurch.org), which converge closely. It uses
上帝 for God, as all three sources do, which differs from 神 used
elsewhere in this app's Bible text — both are standard, valid Chinese terms
for God from different Bible/confession editions, noted explicitly rather
than silently changed to match.

**My Favourite Verses** — every verse in the Bible chapter reader has a ☆
button; tapping it turns to ★ and adds that verse here immediately, no
separate save step. Unlike Key Highlights, these are personal and fully
customizable:

- **Icon and colour**: tap a favourite's icon to open a picker — 12 icon
  choices, 8 colours. Selecting either applies and saves immediately, no
  separate "save" step. The colour also tints the card's left border for
  quick visual scanning.
- **Sorting**: Date Added (chronological, the order you favorited them
  in), By Book (canonical Bible order, using `BIBLE_FULL`'s own book
  sequence), By Colour, By Icon, or A–Z. Every mode is a **computed
  display-only view** — none of them mutate the underlying stored order.

**Drag-to-reorder was built, tested, then removed.** The pointer-events
drag mechanism itself worked correctly in testing (confirmed the
reordering logic saved properly), but the actual felt experience on a
real device didn't work well enough to keep — a good example of why real
usage matters more than passing tests. Favorites are ordered purely by
when they were added now, with the other sort modes as alternatives.

Opening a favourite's detail view offers a "Remove from Favourites" button;
the five fixed Key Highlights don't have this, since they're permanent.
Favorites live in `progress.favoriteVerses`, each with `icon`, `color`,
and `bookId` (for sorting) alongside the verse data itself.

## Progress resumption — lessons and Bible reading both

**Lessons:** reopening an unfinished lesson resumes at the furthest step
you reached (scenario → dialogue → vocabulary → quiz → challenge), not
back at the beginning — tracked in `progress.lessonProgress`. This is
real across a full page reload, not just within one session. A lesson
already marked complete still restarts fresh from the scenario when
reopened, since that's a deliberate full review, not a resume. Home's
lesson list shows a distinct **"In Progress"** state (with a small
percentage bar) separate from Locked / Start / Completed, so it's always
clear which lessons are mid-way through.

**Bible reading:** scrolling through a chapter quietly tracks how far
you've gotten as a percentage (throttled, saved to
`progress.chapterPosition`), independent of the explicit "Mark as Read"
button. Reopening a partially-read chapter scrolls back to roughly that
position automatically. The chapter grid in the book browser shows
partially-read chapters with a dashed gold border (hover/long-press for
the exact percentage), distinct from the solid green of fully-read
chapters.

**A real bug this caught:** building the resume-position feature exposed
that opening a Bible chapter or book's chapter list *before* ever visiting
the Read tab in that session — e.g. a page refresh while already reading —
left the underlying Bible text never loaded, since only the Read tab
previously triggered fetching it. Both screens now independently ensure the
text is loaded before rendering, so this works regardless of entry point.

## Curriculum resequencing: checkpoints and a bridge lesson

The most valuable version of this idea — moving grammar earlier so it's
taught before content that needs it, e.g. 了/在/过 currently sitting in
Chinese Basics Lesson 8, after material that already assumed it — would
require reordering existing content, which directly conflicts with this
project's own rule against ever reordering shipped lesson ids (see
"Progress safety across updates"). That rule exists specifically to
protect real people's saved progress; it doesn't get overridden for a
good idea. What follows is what could be built safely instead — pure
addition, no reordering of anything already shipped.

**A structural fix first:** Basics and Proclaim originally unlocked by
raw id subtraction (`isBasicsUnlocked` checked `id - 1` directly), unlike
the main lessons, which unlock by array position
(`LESSONS[index - 1]`). That meant new content could only ever be
*appended* to the end of Basics/Proclaim, never inserted earlier in the
sequence where it might actually belong — which would have made a
"bridge lesson before the hard content" structurally impossible without
renumbering. Both were switched to array-position-based unlocking,
identical in behavior for all existing content (ids and positions
already matched 1:1), but now capable of having new lessons inserted
anywhere in the learning sequence using entirely new, never-reused ids.

**Four stage checkpoints**, one after each of Connect/Belong/Grow/Serve —
new lessons (ids 39–42, never reusing 1–38) built from real,
already-taught vocabulary pulled directly from that stage's own lessons,
not new content. Each is a natural "catching up with someone" capstone
scenario using the full lesson engine exactly like every other lesson
(scenario, dialogue, vocabulary, quiz, Respond Practice, challenge,
tagged verse) — so every taught word in a checkpoint automatically shows
a "Review" badge, not "New," since it was genuinely taught earlier.
Inserted into the `LESSONS` array at the correct pedagogical position
(right after their stage's last lesson, not appended at the very end),
which the array-position-based unlock logic honors automatically. Shown
with a 🎯 icon instead of a number on Home's lesson list and a
"Checkpoint" label instead of "Lesson N" inside the lesson itself, since
a badge jumping from "8" to "39" would otherwise look like a bug.

**One Proclaim bridge lesson**, "Linking Sentences Together" (id 6, but
positioned *first* in the array, before ids 1–5) — the missing stepping
stone between short dialogue exchanges and the bigger asks the rest of
Share Your Faith makes (discourse markers, a four-verse memorized
sequence, following a full sermon). Teaches the smaller, genuinely
underlying skill: saying two or three plain sentences aloud, connected
with 然后 or 因为...所以..., before adding anything more. Since the list
now shows a position-based display number (not the raw id) for exactly
this reason, it correctly shows as "1" despite its id being 6.

**Verified together**, not separately: completed all 42 main lessons
including all 4 checkpoints (confirmed all four ended up in
`completedLessons`), completed all 6 Proclaim lessons in their actual
unlock order starting with the bridge lesson, and confirmed My Progress's
dashboard totals updated correctly to reflect the new lesson counts (48
of 56 after that run) — not just that each new lesson works in isolation.

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
