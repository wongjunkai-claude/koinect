// ===== Koinect — app.js =====
// No frameworks, no build step. Progress is saved to localStorage so
// learners can close the app and continue tomorrow exactly where they left off.

const STORAGE_KEY = "koinect-progress-v1";
const app = document.getElementById("app");

let LESSONS = [];
let REFERENCE = []; // reference glossary categories, loaded at boot
let BIBLE_READINGS = []; // curated Bible reading plan, loaded at boot
let BIBLE_FULL = []; // complete 66-book Bible text, loaded lazily (large file)
let progress = loadProgress();

let bibleFullLoadPromise = null;
function ensureBibleFullLoaded() {
  if (BIBLE_FULL.length > 0) return Promise.resolve();
  if (!bibleFullLoadPromise) {
    bibleFullLoadPromise = fetch("data/bible-full.json")
      .then((res) => res.json())
      .then((data) => {
        BIBLE_FULL = data.books;
      });
  }
  return bibleFullLoadPromise;
}

// ---------- Sound engine ----------
// Small, calm synthesized tones — no audio files to fetch or cache.
// Every sound is a positive one; there is deliberately no "wrong answer" sound.
const AudioFX = (() => {
  let ctx = null;
  function getCtx() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, startTime, duration, gain = 0.16, type = "sine") {
    const audioCtx = getCtx();
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = audioCtx.currentTime + startTime;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
    g.gain.linearRampToValueAtTime(0, t0 + duration);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  return {
    // A single answer picked correctly — a soft two-note "ding".
    correct() {
      tone(880, 0, 0.12);
      tone(1175, 0.09, 0.16);
    },
    // A lesson's quiz/topic is fully passed (every question answered
    // correctly, including after review) — a gentle three-note rise.
    topicComplete() {
      tone(659, 0, 0.14);
      tone(784, 0.11, 0.14);
      tone(988, 0.22, 0.24);
    },
    // The whole lesson package is finished — a fuller four-note chime.
    lessonComplete() {
      tone(523, 0, 0.15);
      tone(659, 0.13, 0.15);
      tone(784, 0.26, 0.15);
      tone(1046, 0.39, 0.4);
    },
  };
})();

// ---------- Speech (text-to-speech playback) ----------
// Uses the browser's built-in Web Speech API — no audio files to fetch,
// download, or cache, so this keeps working fully offline.
const Speech = (() => {
  const supported = "speechSynthesis" in window;

  function speak(text, lang = "zh-CN", rate = 0.92, voice = null) {
    return new Promise((resolve) => {
      if (!supported) {
        resolve();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;
      if (voice) utterance.voice = voice;
      utterance.onend = resolve;
      utterance.onerror = resolve;
      window.speechSynthesis.speak(utterance);
    });
  }

  function stop() {
    if (supported) window.speechSynthesis.cancel();
  }

  // Voice lists load asynchronously on some browsers. Wait once at boot,
  // with a safety timeout, so getVoices() has data by the time we need it.
  function ready() {
    return new Promise((resolve) => {
      if (!supported) {
        resolve();
        return;
      }
      if (window.speechSynthesis.getVoices().length > 0) {
        resolve();
        return;
      }
      window.speechSynthesis.onvoiceschanged = () => resolve();
      setTimeout(resolve, 500); // don't block boot forever if it never fires
    });
  }

  return { supported, speak, stop, ready };
})();

// Recurring cast used across lesson dialogues, with an assigned gender so
// male and female characters can use different voices where the device
// offers more than one Chinese voice to choose from.
const CHARACTER_GENDER = {
  "Wei Ming": "male",
  "Kevin": "male",
  "Pastor Koh": "male",
  "Daniel": "male",
  "Hui Ling": "female",
  "Jia Hui": "female",
  "Grace Lim": "female",
  "Auntie Tan": "female",
  "Rachel": "female",
};

// Best-effort name hints for common Chinese TTS voices across platforms.
// This is inherently fragile (voice names vary by OS/browser), so it's a
// bonus heuristic, not something the feature depends on.
const FEMALE_VOICE_HINTS = ["ting-ting", "tingting", "mei-jia", "meijia", "sin-ji", "sinji", "yaoyao", "huihui", "xiaoxiao", "female", "女"];
const MALE_VOICE_HINTS = ["kangkang", "yunyang", "yunxi", "sangsang", "male", "男"];

function getChineseVoices() {
  if (!Speech.supported) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith("zh"));
}

// Picks one voice for "male" and one for "female" out of whatever Chinese
// voices this device/browser actually has. If only one Chinese voice exists,
// both roles fall back to that same voice — there's nothing else to pick
// from, so dialogue will sound like one voice regardless of character.
function pickVoicesByGender() {
  const voices = getChineseVoices();
  if (voices.length === 0) return { male: null, female: null };

  const matchesHint = (voice, hints) => hints.some((h) => voice.name.toLowerCase().includes(h));
  let male = voices.find((v) => matchesHint(v, MALE_VOICE_HINTS)) || null;
  let female = voices.find((v) => matchesHint(v, FEMALE_VOICE_HINTS)) || null;

  const remaining = voices.filter((v) => v !== male && v !== female);
  if (!male) male = remaining.shift() || voices[0];
  if (!female) female = remaining.shift() || voices[1] || voices[0];
  return { male, female };
}

function genderForSpeaker(speaker, lesson) {
  if (CHARACTER_GENDER[speaker]) return CHARACTER_GENDER[speaker];
  if (speaker === "You") {
    // Give "You" the opposite gender of whoever else is in the scene, so a
    // two-person dialogue always has two audibly distinct voices.
    const other = lesson.dialogue.find((l) => l.speaker !== "You");
    const otherGender = other ? CHARACTER_GENDER[other.speaker] || "male" : "female";
    return otherGender === "male" ? "female" : "male";
  }
  return "male"; // fallback for any unmapped name
}

let dialoguePlaying = false;

async function playDialogue(lesson) {
  if (!Speech.supported || dialoguePlaying) return;
  dialoguePlaying = true;
  const btn = app.querySelector("#play-dialogue-btn");
  if (btn) btn.textContent = "⏸ Stop";

  const voices = pickVoicesByGender();
  const lines = [...app.querySelectorAll(".dialogue-line")];
  for (let i = 0; i < lesson.dialogue.length; i++) {
    if (!dialoguePlaying) break; // stopped by the user mid-playback
    lines[i]?.classList.add("speaking");
    const gender = genderForSpeaker(lesson.dialogue[i].speaker, lesson);
    const voice = gender === "female" ? voices.female : voices.male;
    await Speech.speak(lesson.dialogue[i].chinese, "zh-CN", 0.92, voice);
    lines[i]?.classList.remove("speaking");
    await new Promise((r) => setTimeout(r, 200));
  }
  dialoguePlaying = false;
  const btnAfter = app.querySelector("#play-dialogue-btn");
  if (btnAfter) btnAfter.textContent = "▶ Play Conversation";
}

function stopDialogue() {
  dialoguePlaying = false;
  Speech.stop();
}

// ---------- Progress persistence ----------
function loadProgress() {
  const defaults = {
    completedLessons: [],
    lastVisitDate: null,
    streak: 0,
    vocabReview: {}, // chinese word -> { box: 1-5, nextReview: "YYYY-MM-DD" }
    dismissedChallenges: [], // lesson ids whose challenge card has been marked done
    completedReadings: [], // curated Bible reading plan ids marked as read
    readChapters: [], // "BOOKID-N" chapter keys marked as read in the full Bible browser
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      // Merge onto defaults so progress saved before a field existed (e.g. an
      // older version of the app) doesn't crash on a missing key.
      return { ...defaults, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn("Could not read saved progress, starting fresh.", e);
  }
  return defaults;
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (e) {
    console.warn("Could not save progress.", e);
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Runs once at boot. Keeps a simple day-streak: visiting on the day right
// after your last visit extends it, visiting the same day keeps it as-is,
// any other gap quietly resets to 1 — no warning, no guilt copy about it.
let previousVisitDate = null; // captured before updateStreak() overwrites it

function updateStreak() {
  const today = todayStr();
  previousVisitDate = progress.lastVisitDate;
  if (progress.lastVisitDate === today) return; // already counted today
  if (progress.lastVisitDate === addDays(today, -1)) {
    progress.streak = (progress.streak || 0) + 1;
  } else {
    progress.streak = 1;
  }
  progress.lastVisitDate = today;
  saveProgress();
}

// ---------- Vocabulary review (simple 5-box Leitner schedule) ----------
const REVIEW_INTERVALS = [1, 2, 4, 7, 14]; // days, indexed by box 1-5

let vocabIndex = new Map(); // chinese word -> vocabulary item (first lesson wins)
let firstTaughtIn = new Map(); // chinese word -> lesson id that first introduced it

function buildVocabIndex() {
  vocabIndex = new Map();
  firstTaughtIn = new Map();
  LESSONS.forEach((lesson) => {
    lesson.vocabulary.forEach((v) => {
      if (!vocabIndex.has(v.chinese)) {
        vocabIndex.set(v.chinese, v);
        firstTaughtIn.set(v.chinese, lesson.id);
      }
    });
  });
}

// A word counts as "review" in a lesson if it was already introduced by an
// earlier lesson — otherwise it's genuinely new here.
function isReviewWord(word, lesson) {
  const firstId = firstTaughtIn.get(word);
  return firstId !== undefined && firstId < lesson.id;
}

// Called when a lesson is completed — schedules any new words for review,
// starting tomorrow (no point re-testing what was just taught minutes ago).
function scheduleLessonVocabForReview(lesson) {
  lesson.vocabulary.forEach((v) => {
    if (!progress.vocabReview[v.chinese]) {
      progress.vocabReview[v.chinese] = { box: 1, nextReview: addDays(todayStr(), 1) };
    }
  });
  saveProgress();
}

function getWordsDueToday() {
  const today = todayStr();
  return Object.keys(progress.vocabReview)
    .filter((word) => progress.vocabReview[word].nextReview <= today)
    .map((word) => vocabIndex.get(word))
    .filter(Boolean); // guard against a word no longer present in content
}

function submitWordReview(word, gotItRight) {
  const entry = progress.vocabReview[word];
  if (!entry) return;
  if (gotItRight) {
    entry.box = Math.min(entry.box + 1, REVIEW_INTERVALS.length);
    entry.nextReview = addDays(todayStr(), REVIEW_INTERVALS[entry.box - 1]);
  } else {
    entry.box = 1;
    entry.nextReview = addDays(todayStr(), 1);
  }
  saveProgress();
}

function getUniqueWordsLearnedCount() {
  const words = new Set();
  LESSONS.filter((l) => isCompleted(l.id)).forEach((l) =>
    l.vocabulary.forEach((v) => words.add(v.chinese))
  );
  return words.size;
}

function getMostRecentChallenge() {
  const done = LESSONS.filter((l) => isCompleted(l.id));
  if (done.length === 0) return null;
  const lesson = done[done.length - 1];
  if (progress.dismissedChallenges.includes(lesson.id)) return null;
  return lesson;
}

function dismissChallenge(lessonId) {
  if (!progress.dismissedChallenges.includes(lessonId)) {
    progress.dismissedChallenges.push(lessonId);
    saveProgress();
  }
}

function isCompleted(id) {
  return progress.completedLessons.includes(id);
}

function isUnlocked(lesson, index) {
  if (index === 0) return true;
  return isCompleted(LESSONS[index - 1].id);
}

function markCompleted(id) {
  if (!isCompleted(id)) {
    progress.completedLessons.push(id);
    const lesson = LESSONS.find((l) => l.id === id);
    if (lesson) scheduleLessonVocabForReview(lesson);
    saveProgress();
  }
}

function nextLessonToDo() {
  const idx = LESSONS.findIndex((l, i) => isUnlocked(l, i) && !isCompleted(l.id));
  return idx === -1 ? null : LESSONS[idx];
}

// ---------- Utility ----------
function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Router ----------
function goHome() {
  location.hash = "#/home";
}
function goLesson(id) {
  location.hash = "#/lesson/" + id;
}

function goReview() {
  location.hash = "#/review";
}
function goExplore() {
  location.hash = "#/explore";
}
function goRead() {
  location.hash = "#/read";
}
function goReading(id) {
  location.hash = "#/read/" + id;
}
function goBibleBooks() {
  location.hash = "#/bible";
}
function goBibleChapters(bookId) {
  location.hash = "#/bible/" + bookId;
}
function goBibleChapter(bookId, chapterNum) {
  location.hash = "#/bible/" + bookId + "/" + chapterNum;
}

window.addEventListener("hashchange", route);

function route() {
  const hash = location.hash || "#/home";
  const lessonMatch = hash.match(/^#\/lesson\/(\d+)/);
  if (lessonMatch) {
    const lesson = LESSONS.find((l) => l.id === Number(lessonMatch[1]));
    if (lesson) {
      renderLesson(lesson);
      return;
    }
  }
  const readingMatch = hash.match(/^#\/read\/(.+)/);
  if (readingMatch) {
    const reading = BIBLE_READINGS.find((r) => r.id === readingMatch[1]);
    if (reading) {
      renderReadingDetail(reading);
      return;
    }
  }
  const bibleChapterMatch = hash.match(/^#\/bible\/([A-Z0-9]+)\/(\d+)/);
  if (bibleChapterMatch) {
    renderBibleChapter(bibleChapterMatch[1], Number(bibleChapterMatch[2]));
    return;
  }
  const bibleBookMatch = hash.match(/^#\/bible\/([A-Z0-9]+)/);
  if (bibleBookMatch) {
    renderBibleChapterList(bibleBookMatch[1]);
    return;
  }
  if (hash === "#/review") {
    renderReviewSession();
    return;
  }
  if (hash === "#/explore") {
    renderExplore();
    return;
  }
  if (hash === "#/read") {
    renderRead();
    return;
  }
  if (hash === "#/bible") {
    renderBibleBooks();
    return;
  }
  renderHome();
}

function getGreeting() {
  const doneCount = progress.completedLessons.length;
  const total = LESSONS.length;
  if (doneCount === 0) return "Welcome to Koinect.";
  if (doneCount >= total) return "You're all caught up.";

  const today = todayStr();
  const daysSinceLastVisit =
    previousVisitDate && previousVisitDate !== today
      ? Math.round((new Date(today) - new Date(previousVisitDate)) / 86400000)
      : 0;
  if (daysSinceLastVisit > 2) return "Welcome back.";

  const hour = new Date().getHours();
  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  return "Good evening.";
}

// ---------- Journey (per-stage progress) ----------
const STAGES = ["Connect", "Belong", "Grow", "Serve"];

function stageStatus() {
  // complete: every lesson in that stage is done.
  // current: the first stage (in order) that has lessons and isn't fully done.
  // empty: the stage has no lessons written yet — nothing to unlock, ever, yet.
  // upcoming: has lessons, but an earlier stage still needs finishing first.
  let currentAssigned = false;
  return STAGES.map((stageName) => {
    const lessonsInStage = LESSONS.filter((l) => l.stage === stageName);
    if (lessonsInStage.length === 0) return "empty";
    const allDone = lessonsInStage.every((l) => isCompleted(l.id));
    if (allDone) return "complete";
    if (!currentAssigned) {
      currentAssigned = true;
      return "current";
    }
    return "upcoming";
  });
}

// ---------- Home screen ----------
function renderHome() {
  stopDialogue();
  const total = LESSONS.length;
  const doneCount = progress.completedLessons.length;
  const next = nextLessonToDo();
  const wordsDue = getWordsDueToday();
  const challengeLesson = getMostRecentChallenge();

  app.innerHTML = "";
  app.appendChild(
    el(`
    <div>
      <div class="topbar">
        <div class="brand">
          <span class="brand-mark zh">语</span>
          <span>Koinect</span>
        </div>
        <div class="topbar-actions">
          <button class="icon-btn" id="read-nav-btn" aria-label="Read the Bible">📜</button>
          <button class="icon-btn" id="explore-nav-btn" aria-label="Explore reference glossary">📖</button>
          ${
            progress.streak > 1
              ? `<span class="streak-pill" aria-label="${progress.streak} day streak">${progress.streak} day streak</span>`
              : ""
          }
        </div>
      </div>

      <div class="journey">
        <h2>Your Journey</h2>
        <div class="journey-path">
          ${(() => {
            const statuses = stageStatus();
            return STAGES.map((stage, i) => {
              const status = statuses[i];
              const dotContent = status === "complete" ? "✓" : i + 1;
              const cls =
                status === "complete"
                  ? "complete"
                  : status === "current"
                  ? "current"
                  : status === "empty"
                  ? "not-ready"
                  : "";
              return `<div class="stone ${cls}">
                <div class="stone-dot">${dotContent}</div>
                <div class="stone-label">${stage}</div>
              </div>`;
            }).join("");
          })()}
        </div>
      </div>

      <main class="screen">
        <p class="greeting">${getGreeting()}</p>

        <div class="card continue-card" style="margin-bottom:20px;" id="continue-card"></div>

        <div class="focus-row" id="focus-row"></div>

        ${
          doneCount > 0
            ? `<div class="stats-strip">
                <div class="stat"><div class="stat-num">${doneCount}<span class="stat-den">/${total}</span></div><div class="stat-label">Lessons</div></div>
                <div class="stat"><div class="stat-num">${getUniqueWordsLearnedCount()}</div><div class="stat-label">Words met</div></div>
                <div class="stat"><div class="stat-num zh">${STAGES[stageStatus().findIndex((s) => s === "current")] ?? "—"}</div><div class="stat-label">Current stage</div></div>
              </div>`
            : ""
        }

        <h3 style="margin:24px 0 12px;">All Lessons</h3>
        <div id="lesson-groups"></div>

        <div class="card explore-card" id="read-card">
          <p class="eyebrow">Bible Reading</p>
          <h3 style="margin:6px 0 4px;">Read the Chinese Bible</h3>
          <p class="muted" style="margin-bottom:12px;">${
            progress.completedReadings.length > 0
              ? `${progress.completedReadings.length} of ${BIBLE_READINGS.length} passages read so far.`
              : "Start with a short, well-known passage."
          }</p>
          <button class="btn btn-secondary btn-block" id="read-card-btn">Open Read</button>
        </div>

        <div class="card explore-card" id="explore-card">
          <p class="eyebrow">Reference</p>
          <h3 style="margin:6px 0 4px;">Explore Bible names, places & terms</h3>
          <p class="muted" style="margin-bottom:12px;">Look up Bible books, biblical people, places, festivals, and church terms any time.</p>
          <button class="btn btn-secondary btn-block" id="explore-card-btn">Open Explore</button>
        </div>
      </main>
    </div>
  `)
  );

  app.querySelector("#explore-nav-btn")?.addEventListener("click", goExplore);
  app.querySelector("#explore-card-btn")?.addEventListener("click", goExplore);
  app.querySelector("#read-nav-btn")?.addEventListener("click", goRead);
  app.querySelector("#read-card-btn")?.addEventListener("click", goRead);

  // --- Continue card (three variants) ---
  const continueCard = app.querySelector("#continue-card");
  if (doneCount === 0) {
    continueCard.innerHTML = `
      <p class="eyebrow">Get started</p>
      <h2 style="margin:6px 0 4px;">Start your first lesson</h2>
      <p class="muted" style="margin-bottom:16px;">Lesson 1 · ${LESSONS[0]?.title ?? ""}</p>
      <button class="btn btn-primary" id="continue-btn">Start Lesson ${LESSONS[0]?.id ?? 1}</button>
    `;
  } else if (next) {
    continueCard.innerHTML = `
      <p class="eyebrow">Continue learning</p>
      <h2 style="margin:6px 0 4px;">Lesson ${next.id} · ${next.title}</h2>
      <p class="muted" style="margin-bottom:16px;">${next.scenario}</p>
      <button class="btn btn-primary" id="continue-btn">Continue Lesson ${next.id}</button>
    `;
  } else {
    continueCard.innerHTML = `
      <p class="eyebrow">Nicely done</p>
      <h2 style="margin:6px 0 4px;">You've completed every lesson we have so far</h2>
      <p class="muted" style="margin-bottom:16px;">More lessons for Grow and Serve are on the way.</p>
      <button class="btn btn-secondary" id="revisit-btn">Review a past lesson</button>
    `;
  }
  app.querySelector("#continue-btn")?.addEventListener("click", () =>
    goLesson(doneCount === 0 ? LESSONS[0].id : next.id)
  );
  app.querySelector("#revisit-btn")?.addEventListener("click", () => goLesson(LESSONS[0].id));

  // --- Today's Focus row ---
  const focusRow = app.querySelector("#focus-row");
  const reviewTile = `
    <div class="focus-tile">
      <p class="eyebrow">Words to review</p>
      ${
        wordsDue.length > 0
          ? `<h3>${wordsDue.length} word${wordsDue.length > 1 ? "s" : ""} due today</h3>
             <button class="btn btn-secondary btn-block" id="review-btn">Review Now</button>`
          : `<h3>All caught up</h3><p class="muted">Nothing due for review today.</p>`
      }
    </div>`;
  const challengeTile = challengeLesson
    ? `
    <div class="focus-tile">
      <p class="eyebrow">This Week's Challenge</p>
      <h3 style="font-size:0.95rem;font-weight:500;line-height:1.4;">${challengeLesson.challenge}</h3>
      <button class="btn btn-secondary btn-block" id="dismiss-challenge-btn">Done</button>
    </div>`
    : "";
  focusRow.innerHTML = reviewTile + challengeTile;
  app.querySelector("#review-btn")?.addEventListener("click", goReview);
  app.querySelector("#dismiss-challenge-btn")?.addEventListener("click", () => {
    dismissChallenge(challengeLesson.id);
    renderHome();
  });

  // --- Lesson list, grouped by stage ---
  const groups = app.querySelector("#lesson-groups");
  STAGES.forEach((stageName) => {
    const lessonsInStage = LESSONS.filter((l) => l.stage === stageName);
    const group = document.createElement("div");
    group.className = "stage-group";
    if (lessonsInStage.length === 0) {
      group.innerHTML = `
        <p class="stage-heading">${stageName}</p>
        <p class="muted stage-empty-note">Lessons for this stage are still being written.</p>
      `;
      groups.appendChild(group);
      return;
    }
    const doneInStage = lessonsInStage.filter((l) => isCompleted(l.id)).length;
    group.innerHTML = `<p class="stage-heading">${stageName} — ${doneInStage} of ${lessonsInStage.length} complete</p>`;
    const list = document.createElement("div");
    list.className = "lesson-list";
    lessonsInStage.forEach((lesson) => {
      const i = LESSONS.indexOf(lesson);
      const unlocked = isUnlocked(lesson, i);
      const done = isCompleted(lesson.id);
      const btn = el(`
        <button class="lesson-card ${done ? "done" : ""}" ${unlocked ? "" : "disabled"}>
          <div class="lesson-num">${done ? "✓" : lesson.id}</div>
          <div class="lesson-info">
            <h3>${lesson.title}</h3>
            <p class="zh">${lesson.subtitle}</p>
          </div>
          <div class="lesson-status">${done ? "Completed" : unlocked ? "Start" : "Locked"}</div>
        </button>
      `);
      if (unlocked) btn.addEventListener("click", () => goLesson(lesson.id));
      list.appendChild(btn);
    });
    group.appendChild(list);
    groups.appendChild(group);
  });
}

// ---------- Lesson screen ----------
const STEPS = ["scenario", "dialogue", "vocabulary", "quiz", "challenge"];

function renderLesson(lesson) {
  const quizOrder = shuffle(lesson.quiz);
  const state = {
    stepIndex: 0,
    quizOrder, // fixed reference list, defines stable question numbering
    quizNumbering: new Map(quizOrder.map((q, i) => [q, i + 1])),
    quizQueue: [...quizOrder], // working queue: wrong answers get re-queued to the back
    quizResolved: new Set(), // question objects answered correctly at least once
    quizWrongOptions: new Map(), // question object -> Set of eliminated wrong options
  };
  renderLessonStep(lesson, state);
}

function lessonProgressPct(state) {
  // Treat quiz as its own sub-progress within the overall step bar.
  const stepWeight = 100 / STEPS.length;
  const stepBase = state.stepIndex * stepWeight;
  if (STEPS[state.stepIndex] === "quiz") {
    const quizPct = (state.quizResolved.size / state.quizOrder.length) * stepWeight;
    return Math.min(100, stepBase + quizPct);
  }
  return stepBase;
}

function renderLessonShell(lesson, state, bodyHtml) {
  stopDialogue();
  app.innerHTML = "";
  const pct = lessonProgressPct(state);
  const wrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Back to home">←</button>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
      <main class="screen" id="lesson-body"></main>
    </div>
  `);
  app.appendChild(wrapper);
  app.querySelector("#back-btn").addEventListener("click", goHome);
  // bodyHtml may contain multiple top-level elements (content + sticky footer),
  // so set innerHTML directly rather than using el(), which only returns
  // a single first element and would silently drop the footer/button.
  app.querySelector("#lesson-body").innerHTML = bodyHtml;
}

function renderLessonStep(lesson, state) {
  const step = STEPS[state.stepIndex];

  if (step === "scenario") {
    renderLessonShell(
      lesson,
      state,
      `
      <div class="step-section">
        <p class="eyebrow step-eyebrow">Lesson ${lesson.id} · ${lesson.title}</p>
        <h1 class="zh">${lesson.subtitle}</h1>
        <p class="scenario-text">${lesson.scenario}</p>
      </div>
      <div class="sticky-footer">
        <button class="btn btn-primary" id="next-btn">Start Lesson</button>
      </div>
    `
    );
  }

  if (step === "dialogue") {
    renderLessonShell(
      lesson,
      state,
      `
      <div class="step-section">
        <p class="eyebrow step-eyebrow">Dialogue</p>
        ${
          Speech.supported
            ? `<button class="btn btn-secondary" id="play-dialogue-btn" style="margin-bottom:20px;">▶ Play Conversation</button>`
            : `<p class="muted" style="margin-bottom:20px;">Audio playback isn't supported in this browser.</p>`
        }
        ${lesson.dialogue
          .map(
            (line) => `
          <div class="dialogue-line ${line.speaker === "You" ? "you" : ""}">
            <div class="dialogue-speaker">${line.speaker}</div>
            <div class="dialogue-bubble">
              <div class="zh">${line.chinese}</div>
              <div class="pinyin">${line.pinyin}</div>
              <div class="en">${line.english}</div>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
      <div class="sticky-footer">
        <button class="btn btn-primary" id="next-btn">Continue</button>
      </div>
    `
    );
    const playBtn = app.querySelector("#play-dialogue-btn");
    if (playBtn) {
      playBtn.addEventListener("click", () => {
        if (dialoguePlaying) {
          stopDialogue();
          playBtn.textContent = "▶ Play Conversation";
        } else {
          playDialogue(lesson);
        }
      });
    }
  }

  if (step === "vocabulary") {
    const newCount = lesson.vocabulary.filter((v) => !isReviewWord(v.chinese, lesson)).length;
    const reviewCount = lesson.vocabulary.length - newCount;
    renderLessonShell(
      lesson,
      state,
      `
      <div class="step-section">
        <p class="eyebrow step-eyebrow">Words in This Lesson</p>
        <p class="muted" style="margin-bottom:16px;">
          ${newCount} new${reviewCount > 0 ? `, ${reviewCount} you've met before` : ""}
        </p>
        <div class="vocab-grid">
          ${lesson.vocabulary
            .map((v) => {
              const isReview = isReviewWord(v.chinese, lesson);
              return `
            <div class="vocab-card">
              <div class="vocab-top">
                <span class="zh">${v.chinese}</span>
                <span class="vocab-pinyin">${v.pinyin}</span>
                <span class="vocab-badge ${isReview ? "review" : "new"}">${isReview ? "Review" : "New"}</span>
              </div>
              <div class="vocab-en">${v.english}</div>
              ${v.note ? `<div class="vocab-note">${v.note}</div>` : ""}
            </div>
          `;
            })
            .join("")}
        </div>
      </div>
      <div class="sticky-footer">
        <button class="btn btn-primary" id="next-btn">Practice</button>
      </div>
    `
    );
  }

  if (step === "quiz") {
    renderQuizQuestion(lesson, state);
  }

  if (step === "challenge") {
    const mistakesReviewed = state.quizWrongOptions.size;
    renderLessonShell(
      lesson,
      state,
      `
      <div class="step-section">
        <p class="eyebrow step-eyebrow">Topic Passed</p>
        <h2 style="margin:8px 0 4px;">You got every question right!</h2>
        ${
          mistakesReviewed > 0
            ? `<p class="muted">Nice persistence — you worked through ${mistakesReviewed} question${
                mistakesReviewed > 1 ? "s" : ""
              } a second time to get there.</p>`
            : `<p class="muted">First try, all correct. Well done.</p>`
        }
        <div class="challenge-box">
          <p class="eyebrow">This Week's Challenge</p>
          <p>${lesson.challenge}</p>
        </div>
      </div>
      <div class="sticky-footer">
        <button class="btn btn-primary" id="finish-btn">Finish Lesson</button>
      </div>
    `
    );
    app
      .querySelector("#finish-btn")
      .addEventListener("click", () => {
        markCompleted(lesson.id);
        AudioFX.lessonComplete();
        renderLessonComplete(lesson);
      });
    return;
  }

  const nextBtn = app.querySelector("#next-btn");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      state.stepIndex++;
      renderLessonStep(lesson, state);
    });
  }
}

function renderQuizQuestion(lesson, state) {
  // Once the queue is empty, every question has been answered correctly
  // at least once — the topic is passed.
  if (state.quizQueue.length === 0) {
    AudioFX.topicComplete();
    state.stepIndex++;
    renderLessonStep(lesson, state);
    return;
  }

  const q = state.quizQueue[0];
  const isReview = state.quizWrongOptions.has(q);
  const eliminated = state.quizWrongOptions.get(q) || new Set();
  const options = shuffle(q.options);

  renderLessonShell(
    lesson,
    state,
    `
    <div class="step-section">
      <p class="eyebrow step-eyebrow">${
        isReview
          ? "Let's try that one again"
          : `Question ${state.quizNumbering.get(q)} of ${state.quizOrder.length}`
      }</p>
      <div class="quiz-question">
        <h2>${q.question} ${
      Speech.supported
        ? `<button class="icon-btn" id="read-question-btn" aria-label="Read question aloud" style="font-size:1.1rem;vertical-align:middle;">🔊</button>`
        : ""
    }</h2>
      </div>
      <div class="quiz-options" id="quiz-options">
        ${options
          .map((opt) => {
            const isEliminated = eliminated.has(opt);
            return `<div class="option-row">
              <button class="option-btn zh${
                isEliminated ? " eliminated" : ""
              }" data-opt="${opt}" ${isEliminated ? "disabled" : ""}>${opt}</button>
              ${
                Speech.supported
                  ? `<button class="icon-btn option-speak-btn" data-speak="${opt}" aria-label="Read this option aloud">🔊</button>`
                  : ""
              }
            </div>`;
          })
          .join("")}
      </div>
      <p class="feedback-text" id="feedback" aria-live="polite"></p>
    </div>
    <div class="sticky-footer" id="quiz-footer"></div>
  `
  );

  const readQuestionBtn = app.querySelector("#read-question-btn");
  if (readQuestionBtn) {
    readQuestionBtn.addEventListener("click", () => Speech.speak(q.question, "en-US"));
  }
  app.querySelectorAll(".option-speak-btn").forEach((btn) => {
    btn.addEventListener("click", () => Speech.speak(btn.dataset.speak, "zh-CN"));
  });

  const optionButtons = [...app.querySelectorAll(".option-btn:not(.eliminated)")];
  const feedback = app.querySelector("#feedback");
  const footer = app.querySelector("#quiz-footer");

  optionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const chosen = btn.dataset.opt;
      const isRight = chosen === q.answer;

      optionButtons.forEach((b) => {
        b.disabled = true;
        if (isRight && b.dataset.opt === q.answer) b.classList.add("correct");
        else if (!isRight && b === btn) b.classList.add("incorrect");
      });

      if (isRight) {
        AudioFX.correct();
        feedback.textContent = "Correct!";
        feedback.classList.add("correct");
        state.quizResolved.add(q);
        state.quizQueue.shift(); // done with this question
      } else {
        feedback.textContent = "Not quite — give it another try.";
        feedback.classList.add("incorrect");
        if (!state.quizWrongOptions.has(q)) state.quizWrongOptions.set(q, new Set());
        state.quizWrongOptions.get(q).add(chosen);
        state.quizQueue.shift();
        state.quizQueue.push(q); // send it to the back for a later retry
      }

      footer.innerHTML = `<button class="btn btn-primary" id="quiz-next-btn">Continue</button>`;
      app.querySelector("#quiz-next-btn").addEventListener("click", () => {
        renderQuizQuestion(lesson, state);
      });
    });
  });
}

// ---------- Daily Review ----------
function buildReviewOptions(word) {
  const pool = [...vocabIndex.values()].filter(
    (v) => v.chinese !== word.chinese && v.english !== word.english
  );
  const distractors = shuffle(pool)
    .slice(0, 2)
    .map((v) => v.english);
  return shuffle([word.english, ...distractors]);
}

function renderReviewSession() {
  stopDialogue();
  const words = shuffle(getWordsDueToday());
  if (words.length === 0) {
    goHome();
    return;
  }
  const state = {
    queue: words,
    total: words.length,
    numbering: new Map(words.map((w, i) => [w, i + 1])),
    resolved: new Set(),
    wrongOptions: new Map(),
    recorded: new Set(), // words whose first-attempt outcome has already been scored
  };
  renderReviewWord(state);
}

function renderReviewWord(state) {
  if (state.queue.length === 0) {
    AudioFX.topicComplete();
    renderReviewComplete(state);
    return;
  }

  const word = state.queue[0];
  const isRetry = state.wrongOptions.has(word);
  const eliminated = state.wrongOptions.get(word) || new Set();
  const options = buildReviewOptions(word);
  const pct = (state.resolved.size / state.total) * 100;

  app.innerHTML = "";
  const wrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Back to home">←</button>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
      <main class="screen" id="review-body"></main>
    </div>
  `);
  app.appendChild(wrapper);
  app.querySelector("#back-btn").addEventListener("click", goHome);

  app.querySelector("#review-body").innerHTML = `
    <div class="step-section">
      <p class="eyebrow step-eyebrow">${
        isRetry ? "Let's try that one again" : `Word ${state.numbering.get(word)} of ${state.total}`
      }</p>
      <div class="review-word-card">
        <div class="zh review-word-zh">${word.chinese}</div>
        <div class="pinyin">${word.pinyin}</div>
        ${
          Speech.supported
            ? `<button class="icon-btn" id="read-word-btn" aria-label="Hear this word">🔊</button>`
            : ""
        }
      </div>
      <p class="muted" style="margin:16px 0 8px;">What does this mean?</p>
      <div class="quiz-options" id="review-options">
        ${options
          .map((opt) => {
            const isEliminated = eliminated.has(opt);
            return `<button class="option-btn${isEliminated ? " eliminated" : ""}" data-opt="${opt}" ${
              isEliminated ? "disabled" : ""
            }>${opt}</button>`;
          })
          .join("")}
      </div>
      <p class="feedback-text" id="feedback" aria-live="polite"></p>
    </div>
    <div class="sticky-footer" id="review-footer"></div>
  `;

  app
    .querySelector("#read-word-btn")
    ?.addEventListener("click", () => Speech.speak(word.chinese, "zh-CN"));

  const optionButtons = [...app.querySelectorAll(".option-btn:not(.eliminated)")];
  const feedback = app.querySelector("#feedback");
  const footer = app.querySelector("#review-footer");

  optionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const chosen = btn.dataset.opt;
      const isRight = chosen === word.english;

      optionButtons.forEach((b) => {
        b.disabled = true;
        if (isRight && b.dataset.opt === word.english) b.classList.add("correct");
        else if (!isRight && b === btn) b.classList.add("incorrect");
      });

      // Only the first attempt at a word feeds the spaced-repetition schedule —
      // later retries in this same session are for reinforcement, not scoring.
      if (!state.recorded.has(word)) {
        submitWordReview(word.chinese, isRight);
        state.recorded.add(word);
      }

      if (isRight) {
        AudioFX.correct();
        feedback.textContent = "Correct!";
        feedback.classList.add("correct");
        state.resolved.add(word);
        state.queue.shift();
      } else {
        feedback.textContent = "Not quite — give it another try.";
        feedback.classList.add("incorrect");
        if (!state.wrongOptions.has(word)) state.wrongOptions.set(word, new Set());
        state.wrongOptions.get(word).add(chosen);
        state.queue.shift();
        state.queue.push(word);
      }

      footer.innerHTML = `<button class="btn btn-primary" id="review-next-btn">Continue</button>`;
      app.querySelector("#review-next-btn").addEventListener("click", () => renderReviewWord(state));
    });
  });
}

function renderReviewComplete(state) {
  app.innerHTML = "";
  app.appendChild(
    el(`
    <main class="screen complete-screen">
      <div class="complete-badge">✓</div>
      <h1>Review Complete</h1>
      <p class="muted" style="margin:12px 0 32px;">
        You reviewed ${state.total} word${state.total > 1 ? "s" : ""}. Well done.
      </p>
      <button class="btn btn-primary" id="home-btn">Back to Home</button>
    </main>
  `)
  );
  app.querySelector("#home-btn").addEventListener("click", goHome);
}

// ---------- Explore (reference glossary) ----------
function renderExplore(query = "") {
  stopDialogue();
  app.innerHTML = "";
  const wrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Back to home">←</button>
        <h2 style="margin:0;font-size:1.1rem;">Explore</h2>
      </div>
      <main class="screen" id="explore-body"></main>
    </div>
  `);
  app.appendChild(wrapper);
  app.querySelector("#back-btn").addEventListener("click", goHome);

  const body = app.querySelector("#explore-body");
  body.innerHTML = `
    <p class="muted" style="margin-bottom:16px;">
      Bible books, people, places, festivals, and church terms — for quick lookup any time.
    </p>
    <input type="text" id="explore-search" class="explore-search" placeholder="Search by Chinese, pinyin, or English…" value="${query}">
    <div id="explore-results"></div>
  `;

  const searchInput = body.querySelector("#explore-search");
  const resultsEl = body.querySelector("#explore-results");

  function renderResults(q) {
    const term = q.trim().toLowerCase();
    if (!term) {
      resultsEl.innerHTML = REFERENCE.map(renderCategorySection).join("");
    } else {
      const matches = [];
      REFERENCE.forEach((cat) => {
        cat.entries.forEach((entry) => {
          const haystack = stripTones(
            `${entry.chinese} ${entry.pinyin} ${entry.english}`.toLowerCase()
          );
          if (haystack.includes(stripTones(term))) matches.push({ ...entry, category: cat.name });
        });
      });
      resultsEl.innerHTML =
        matches.length > 0
          ? `<div class="stage-group"><p class="stage-heading">${matches.length} result${
              matches.length > 1 ? "s" : ""
            }</p>${matches.map((e) => renderEntryCard(e, e.category)).join("")}</div>`
          : `<div class="empty-state"><h3>No matches</h3><p class="muted">Try a different word or spelling.</p></div>`;
    }
    wireEntryButtons(resultsEl);
  }

  searchInput.addEventListener("input", () => renderResults(searchInput.value));
  renderResults(query);
}

function stripTones(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function renderCategorySection(cat) {
  return `
    <div class="stage-group">
      <p class="stage-heading">${cat.name}</p>
      ${cat.entries.map((e) => renderEntryCard(e)).join("")}
    </div>
  `;
}

function renderEntryCard(entry, categoryLabel) {
  return `
    <div class="vocab-card reference-card">
      <div class="vocab-top">
        <span class="zh">${entry.chinese}</span>
        <span class="vocab-pinyin">${entry.pinyin}</span>
        ${
          Speech.supported
            ? `<button class="icon-btn ref-speak-btn" data-speak="${entry.chinese}" aria-label="Hear this word">🔊</button>`
            : ""
        }
      </div>
      <div class="vocab-en">${entry.english}</div>
      ${categoryLabel ? `<div class="vocab-note">${categoryLabel}</div>` : ""}
      ${entry.note ? `<div class="vocab-note">${entry.note}</div>` : ""}
      ${
        entry.taughtInLesson
          ? `<button class="ref-lesson-link" data-lesson="${entry.taughtInLesson}">Taught in Lesson ${entry.taughtInLesson} →</button>`
          : ""
      }
    </div>
  `;
}

function wireEntryButtons(container) {
  container.querySelectorAll(".ref-speak-btn").forEach((btn) => {
    btn.addEventListener("click", () => Speech.speak(btn.dataset.speak, "zh-CN"));
  });
  container.querySelectorAll(".ref-lesson-link").forEach((btn) => {
    btn.addEventListener("click", () => goLesson(Number(btn.dataset.lesson)));
  });
}

// ---------- Read (Bible reading plan) ----------
function isReadingCompleted(id) {
  return progress.completedReadings.includes(id);
}

function markReadingCompleted(id) {
  if (!isReadingCompleted(id)) {
    progress.completedReadings.push(id);
    saveProgress();
  }
}

function chapterKey(bookId, chapterNum) {
  return bookId + "-" + chapterNum;
}
function isChapterRead(bookId, chapterNum) {
  return progress.readChapters.includes(chapterKey(bookId, chapterNum));
}
function markChapterRead(bookId, chapterNum) {
  const key = chapterKey(bookId, chapterNum);
  if (!progress.readChapters.includes(key)) {
    progress.readChapters.push(key);
    saveProgress();
  }
}
function chaptersReadInBook(book) {
  return book.chapters.filter((_, i) => isChapterRead(book.id, i + 1)).length;
}

function renderRead() {
  stopDialogue();
  app.innerHTML = "";
  const total = BIBLE_READINGS.length;
  const doneCount = progress.completedReadings.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const wrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Back to home">←</button>
        <h2 style="margin:0;font-size:1.1rem;">Read</h2>
      </div>
      <main class="screen" id="read-body"></main>
    </div>
  `);
  app.appendChild(wrapper);
  app.querySelector("#back-btn").addEventListener("click", goHome);

  const body = app.querySelector("#read-body");
  body.innerHTML = `
    <p class="muted" style="margin-bottom:16px;">
      Read short passages of Scripture in Chinese, one at a time, at your own pace.
    </p>
    <div class="card" style="margin-bottom:20px;">
      <p class="eyebrow">Reading Progress</p>
      <h3 style="margin:6px 0 10px;">${doneCount} of ${total} passages read</h3>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="lesson-list" id="reading-list"></div>

    <div class="card explore-card" id="browse-bible-card" style="margin-top:20px;">
      <p class="eyebrow">Full Bible</p>
      <h3 style="margin:6px 0 4px;">Browse all 66 books</h3>
      <p class="muted" style="margin-bottom:12px;">Read any book and chapter, at your own pace — not just the reading plan above.</p>
      <button class="btn btn-secondary btn-block" id="browse-bible-btn">Browse the Bible</button>
    </div>
  `;
  body.querySelector("#browse-bible-btn").addEventListener("click", goBibleBooks);

  const list = body.querySelector("#reading-list");
  BIBLE_READINGS.forEach((reading) => {
    const done = isReadingCompleted(reading.id);
    const card = el(`
      <button class="lesson-card ${done ? "done" : ""}">
        <div class="lesson-num">${done ? "✓" : "📖"}</div>
        <div class="lesson-info">
          <h3>${reading.title}</h3>
          <p class="zh">${reading.reference}</p>
        </div>
        <div class="lesson-status">${done ? "Read" : "Open"}</div>
      </button>
    `);
    card.addEventListener("click", () => goReading(reading.id));
    list.appendChild(card);
  });
}

function renderReadingDetail(reading) {
  stopDialogue();
  app.innerHTML = "";
  const wrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Back to Read">←</button>
        <h2 style="margin:0;font-size:1.1rem;">${reading.reference}</h2>
      </div>
      <main class="screen" id="reading-body"></main>
    </div>
  `);
  app.appendChild(wrapper);
  app.querySelector("#back-btn").addEventListener("click", goRead);

  const body = app.querySelector("#reading-body");
  body.innerHTML = `
    <div class="step-section">
      <p class="eyebrow step-eyebrow">${reading.referenceEnglish}</p>
      <h1 style="margin-bottom:16px;">${reading.title}</h1>
      ${
        Speech.supported
          ? `<button class="btn btn-secondary" id="play-reading-btn" style="margin-bottom:20px;">▶ Play Passage</button>`
          : ""
      }
      <div id="verse-list">
        ${reading.verses
          .map(
            (v) => `
          <div class="scripture-block" data-verse="${v.number}">
            <span class="verse-number">${v.number}</span>
            <div class="zh scripture-text">${v.chinese}</div>
            <div class="pinyin">${v.pinyin}</div>
          </div>
        `
          )
          .join("")}
      </div>
      <p class="muted" style="margin-top:20px;">${reading.gloss}</p>
    </div>
    <div class="sticky-footer">
      <button class="btn btn-primary" id="mark-read-btn">${
        isReadingCompleted(reading.id) ? "Marked as Read ✓" : "Mark as Read"
      }</button>
    </div>
  `;

  const playBtn = body.querySelector("#play-reading-btn");
  if (playBtn) {
    playBtn.addEventListener("click", async () => {
      if (dialoguePlaying) {
        stopDialogue();
        playBtn.textContent = "▶ Play Passage";
        return;
      }
      dialoguePlaying = true;
      playBtn.textContent = "⏸ Stop";
      const blocks = [...body.querySelectorAll(".scripture-block")];
      for (const verse of reading.verses) {
        if (!dialoguePlaying) break;
        const block = blocks.find((b) => b.dataset.verse === String(verse.number));
        block?.classList.add("speaking");
        await Speech.speak(verse.chinese, "zh-CN");
        block?.classList.remove("speaking");
        await new Promise((r) => setTimeout(r, 250));
      }
      dialoguePlaying = false;
      playBtn.textContent = "▶ Play Passage";
    });
  }

  const markBtn = body.querySelector("#mark-read-btn");
  markBtn.addEventListener("click", () => {
    markReadingCompleted(reading.id);
    markBtn.textContent = "Marked as Read ✓";
  });
}

// ---------- Browse Full Bible (all 66 books) ----------
async function renderBibleBooks() {
  stopDialogue();
  app.innerHTML = "";
  const wrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Back to Read">←</button>
        <h2 style="margin:0;font-size:1.1rem;">Browse the Bible</h2>
      </div>
      <main class="screen" id="bible-body">
        <p class="muted" style="padding:16px 0;">Loading the Bible text…</p>
      </main>
    </div>
  `);
  app.appendChild(wrapper);
  app.querySelector("#back-btn").addEventListener("click", goRead);

  await ensureBibleFullLoaded();
  if (location.hash !== "#/bible") return; // user navigated away while loading

  const body = app.querySelector("#bible-body");
  const oldTestament = BIBLE_FULL.slice(0, 39);
  const newTestament = BIBLE_FULL.slice(39);

  function renderBookGroup(title, books) {
    return `
      <div class="stage-group">
        <p class="stage-heading">${title}</p>
        <div class="lesson-list">
          ${books
            .map((b) => {
              const readCount = chaptersReadInBook(b);
              const done = readCount === b.chapters.length;
              return `
              <button class="lesson-card ${done ? "done" : ""}" data-book="${b.id}">
                <div class="lesson-num">${done ? "✓" : "📖"}</div>
                <div class="lesson-info">
                  <h3>${b.name}</h3>
                  <p class="zh">${b.nameEnglish} · ${b.chapters.length} chapters</p>
                </div>
                <div class="lesson-status">${readCount}/${b.chapters.length}</div>
              </button>
            `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  body.innerHTML =
    renderBookGroup("Old Testament", oldTestament) + renderBookGroup("New Testament", newTestament);

  body.querySelectorAll("[data-book]").forEach((btn) => {
    btn.addEventListener("click", () => goBibleChapters(btn.dataset.book));
  });
}

function renderBibleChapterList(bookId) {
  stopDialogue();
  const book = BIBLE_FULL.find((b) => b.id === bookId);
  if (!book) {
    goBibleBooks();
    return;
  }
  app.innerHTML = "";
  const wrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Back to books">←</button>
        <h2 style="margin:0;font-size:1.1rem;">${book.name}</h2>
      </div>
      <main class="screen" id="chapters-body"></main>
    </div>
  `);
  app.appendChild(wrapper);
  app.querySelector("#back-btn").addEventListener("click", goBibleBooks);

  const readCount = chaptersReadInBook(book);
  const body = app.querySelector("#chapters-body");
  body.innerHTML = `
    <p class="muted" style="margin-bottom:16px;">${book.nameEnglish} · ${readCount} of ${book.chapters.length} chapters read</p>
    <div class="chapter-grid" id="chapter-grid"></div>
  `;
  const grid = body.querySelector("#chapter-grid");
  book.chapters.forEach((_, i) => {
    const chapterNum = i + 1;
    const done = isChapterRead(bookId, chapterNum);
    const btn = el(`<button class="chapter-tile ${done ? "done" : ""}">${chapterNum}</button>`);
    btn.addEventListener("click", () => goBibleChapter(bookId, chapterNum));
    grid.appendChild(btn);
  });
}

function renderBibleChapter(bookId, chapterNum) {
  stopDialogue();
  const book = BIBLE_FULL.find((b) => b.id === bookId);
  if (!book || !book.chapters[chapterNum - 1]) {
    goBibleBooks();
    return;
  }
  const verses = book.chapters[chapterNum - 1];
  const totalChapters = book.chapters.length;

  app.innerHTML = "";
  const wrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Back to chapter list">←</button>
        <h2 style="margin:0;font-size:1.1rem;">${book.name} ${chapterNum}</h2>
      </div>
      <main class="screen" id="chapter-body"></main>
    </div>
  `);
  app.appendChild(wrapper);
  app.querySelector("#back-btn").addEventListener("click", () => goBibleChapters(bookId));

  const body = app.querySelector("#chapter-body");
  body.innerHTML = `
    <div class="step-section">
      ${
        Speech.supported
          ? `<button class="btn btn-secondary" id="play-reading-btn" style="margin-bottom:20px;">▶ Play Chapter</button>`
          : ""
      }
      <div id="verse-list">
        ${verses
          .map(
            (v) => `
          <div class="scripture-block" data-verse="${v.n}">
            <span class="verse-number">${v.n}</span>
            <div class="zh scripture-text">${v.c}</div>
            <div class="pinyin">${v.p}</div>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
    <div class="sticky-footer chapter-nav-footer">
      <button class="btn btn-secondary" id="prev-chapter-btn" ${chapterNum <= 1 ? "disabled" : ""}>← Ch. ${chapterNum - 1}</button>
      <button class="btn btn-primary" id="mark-chapter-btn">${
        isChapterRead(bookId, chapterNum) ? "Read ✓" : "Mark as Read"
      }</button>
      <button class="btn btn-secondary" id="next-chapter-btn" ${chapterNum >= totalChapters ? "disabled" : ""}>Ch. ${chapterNum + 1} →</button>
    </div>
  `;

  const playBtn = body.querySelector("#play-reading-btn");
  if (playBtn) {
    playBtn.addEventListener("click", async () => {
      if (dialoguePlaying) {
        stopDialogue();
        playBtn.textContent = "▶ Play Chapter";
        return;
      }
      dialoguePlaying = true;
      playBtn.textContent = "⏸ Stop";
      const blocks = [...body.querySelectorAll(".scripture-block")];
      for (const verse of verses) {
        if (!dialoguePlaying) break;
        const block = blocks.find((b) => b.dataset.verse === String(verse.n));
        block?.classList.add("speaking");
        await Speech.speak(verse.c, "zh-CN");
        block?.classList.remove("speaking");
        await new Promise((r) => setTimeout(r, 200));
      }
      dialoguePlaying = false;
      playBtn.textContent = "▶ Play Chapter";
    });
  }

  body.querySelector("#mark-chapter-btn").addEventListener("click", (e) => {
    markChapterRead(bookId, chapterNum);
    e.target.textContent = "Read ✓";
  });
  body.querySelector("#prev-chapter-btn")?.addEventListener("click", () => {
    if (chapterNum > 1) goBibleChapter(bookId, chapterNum - 1);
  });
  body.querySelector("#next-chapter-btn")?.addEventListener("click", () => {
    if (chapterNum < totalChapters) goBibleChapter(bookId, chapterNum + 1);
  });
}

function renderLessonComplete(lesson) {
  stopDialogue();
  app.innerHTML = "";
  app.appendChild(
    el(`
    <main class="screen complete-screen">
      <div class="complete-badge">✓</div>
      <h1>Lesson Complete</h1>
      <p class="muted" style="margin:12px 0 32px;">
        You finished "${lesson.title}." Well done.
      </p>
      <button class="btn btn-primary" id="home-btn">Back to Home</button>
    </main>
  `)
  );
  app.querySelector("#home-btn").addEventListener("click", goHome);
}

// ---------- Boot ----------
async function boot() {
  try {
    const [lessonsRes, referenceRes, readingRes] = await Promise.all([
      fetch("data/lessons.json"),
      fetch("data/reference.json"),
      fetch("data/bible-reading.json"),
    ]);
    const data = await lessonsRes.json();
    LESSONS = data.lessons;
    REFERENCE = (await referenceRes.json()).categories;
    BIBLE_READINGS = (await readingRes.json()).readings;
    buildVocabIndex();
    updateStreak();
    await Speech.ready();
    route();
  } catch (e) {
    app.innerHTML = `
      <main class="screen empty-state">
        <h3>We couldn't load your lessons</h3>
        <p class="muted">Please check your connection and reload the app.</p>
      </main>`;
    console.error(e);
  }
}

boot();

// ---------- Service worker registration ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => {
      console.warn("Service worker registration failed:", e);
    });
  });
}
