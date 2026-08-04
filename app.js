// ===== Koinect — app.js =====
// No frameworks, no build step. Progress is saved to localStorage so
// learners can close the app and continue tomorrow exactly where they left off.

// Bump this whenever a notable change ships — shown on the Help screen so
// anyone reporting a bug can say which version they're on.
const APP_VERSION = "1.8.1";

// NEVER change this — it's the only pointer to every existing user's saved
// progress. Changing it orphans all prior data instead of migrating it.
const STORAGE_KEY = "koinect-progress-v1";

// See the big comment above loadProgress() for what this protects.
const PROGRESS_SCHEMA_VERSION = 1;
const app = document.getElementById("app");

let LESSONS = [];
let REFERENCE = []; // reference glossary categories, loaded at boot
let BIBLE_FULL = []; // complete 66-book Bible text, loaded lazily (large file)

// One symbolic icon per book, for the Read tab's book list. These are my
// own thematic choices (not a reproduction of any publisher's copyrighted
// icon artwork, which I have no access to and shouldn't copy).
const BOOK_ICONS = {
  GEN: "🌱", EXO: "🔥", LEV: "🕯️", NUM: "🔢", DEU: "📜",
  JOS: "⚔️", JDG: "🛡️", RUT: "🌾", "1SA": "👑", "2SA": "👑",
  "1KI": "🏛️", "2KI": "🏛️", "1CH": "📖", "2CH": "📖", EZR: "🧱",
  NEH: "🧱", EST: "👸", JOB: "🌪️", PSA: "🎵", PRO: "🦉",
  ECC: "⏳", SNG: "🌹", ISA: "🌟", JER: "😢", LAM: "😭",
  EZK: "👁️", DAN: "🦁", HOS: "💔", JOL: "🦗", AMO: "⚖️",
  OBA: "🏔️", JON: "🐋", MIC: "⚖️", NAM: "🦁", HAB: "❓",
  ZEP: "📯", HAG: "🏗️", ZEC: "🕊️", MAL: "🔥",
  MAT: "👑", MRK: "⚡", LUK: "❤️", JHN: "💡", ACT: "🔥",
  ROM: "⚖️", "1CO": "✝️", "2CO": "✝️", GAL: "🔓", EPH: "🏛️",
  PHP: "😊", COL: "👑", "1TH": "⏰", "2TH": "⏰", "1TI": "📋",
  "2TI": "📋", TIT: "📋", PHM: "🤝", HEB: "✝️", JAS: "🛠️",
  "1PE": "👑", "2PE": "⚠️", "1JN": "❤️", "2JN": "✉️", "3JN": "✉️",
  JUD: "⚠️", REV: "🌟",
};

// Options offered in the favorite-verse icon/color picker.
const FAVORITE_ICON_OPTIONS = ["⭐", "❤️", "🙏", "✝️", "🕊️", "💡", "🔥", "☀️", "💎", "🎯", "📌", "🌟"];
const FAVORITE_COLOR_OPTIONS = [
  "#D9A441", // gold (default)
  "#C1554A", // red
  "#D98A3D", // orange
  "#8FA35E", // green
  "#4E7DA6", // blue
  "#8067B0", // purple
  "#C97AA0", // pink
  "#6B7280", // gray
];

let HIGHLIGHTS = []; // fixed Key Highlights (Creed, Lord's Prayer, etc.), loaded at boot
let BASICS = []; // Chinese Basics mini-course, loaded at boot
let PROCLAIM = []; // Share Your Faith / Proclaim track, loaded at boot
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
    if (!isSoundEnabled()) return;
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
    // A single answer picked incorrectly — quiet and low, a gentle "not
    // quite" rather than a buzzer. Deliberately understated: the goal is a
    // neutral acknowledgment, never something that feels like punishment.
    incorrect() {
      tone(330, 0, 0.11, 0.09);
      tone(294, 0.09, 0.14, 0.09);
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

  function speak(text, lang = "zh-CN", rate = 0.92, voice = null, pitch = 1.0) {
    return new Promise((resolve) => {
      if (!supported || !isSoundEnabled()) {
        resolve();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;
      utterance.pitch = pitch;
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

// Chinese-character form of each cast member's name, shown alongside the
// English spelling in dialogue speaker labels (e.g. "慧玲 Hui Ling"). Purely
// a display concern — CHARACTER_GENDER and everywhere else still key off
// the plain English speaker string, so this doesn't touch voice logic.
const CHARACTER_CHINESE_NAME = {
  "Wei Ming": "伟明",
  "Hui Ling": "慧玲",
  "Jia Hui": "嘉慧",
  "Kevin": "家豪",
  "Grace Lim": "林嘉恩",
  "Pastor Koh": "高牧师",
  "Auntie Tan": "陈阿姨",
  "Rachel": "瑞秋",
  "Daniel": "丹尼尔",
};

function displaySpeakerName(speaker) {
  const chinese = CHARACTER_CHINESE_NAME[speaker];
  return chinese ? `<span class="zh">${chinese}</span> ${speaker}` : speaker;
}

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

// Many devices only ship ONE Chinese voice (e.g. iOS's default Mandarin
// voice, "Tingting," is female with no built-in male alternative) — so
// picking a different *voice* per gender often has nothing to pick from.
// Pitch works regardless: it audibly separates speakers even when every
// line uses the exact same underlying voice.
const GENDER_PITCH = { male: 0.82, female: 1.15 };

function pitchForSpeaker(speaker, lesson) {
  if (speaker === "Narrator") return 1.0;
  return GENDER_PITCH[genderForSpeaker(speaker, lesson)];
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
    const speaker = lesson.dialogue[i].speaker;
    const gender = genderForSpeaker(speaker, lesson);
    const voice = gender === "female" ? voices.female : voices.male;
    const pitch = pitchForSpeaker(speaker, lesson);
    await Speech.speak(lesson.dialogue[i].chinese, "zh-CN", 0.92, voice, pitch);
    lines[i]?.classList.remove("speaking");
    await new Promise((r) => setTimeout(r, 200));
  }
  dialoguePlaying = false;
  const btnAfter = app.querySelector("#play-dialogue-btn");
  if (btnAfter) btnAfter.textContent = "▶ Play Conversation";
}

let activeScrollHandler = null;
function clearScrollTracking() {
  if (activeScrollHandler) {
    window.removeEventListener("scroll", activeScrollHandler);
    activeScrollHandler = null;
  }
}

function stopDialogue() {
  dialoguePlaying = false;
  Speech.stop();
  clearScrollTracking(); // called on every screen change, so this always runs too
}

// ---------- Progress persistence ----------
//
// THREE HARD RULES that protect existing users' progress across updates.
// Breaking any of these silently resets or corrupts real people's saved
// progress — it already happened once in this project (see rule 2).
//
// 1. STORAGE_KEY must never change. It's the only pointer to a user's
//    data; changing it orphans everything under the old key.
// 2. Lesson / Basics / Proclaim ids must never be reordered or reused
//    once shipped. New content gets the next free id in its own track —
//    never renumber existing ones. (This project's lesson ids WERE
//    cleaned up once, before this rule was written down — anyone who had
//    tested before that point lost lesson-completion tracking. Never again.)
// 3. Any future change to progress's *shape* (not just adding a new
//    field, but changing what an existing field means or how it's
//    structured) must go through PROGRESS_SCHEMA_VERSION + migrateProgress()
//    below, not ad hoc handling. (Declared near the top of the file,
//    above, since loadProgress() runs at module load time — before this
//    point in the file would even execute.)

function migrateProgress(p) {
  // No migrations exist yet — this is a deliberate no-op scaffold. If a
  // future change ever needs one, add `if (p.schemaVersion < N) { ... }`
  // blocks here, then bump PROGRESS_SCHEMA_VERSION. Never rewrite old
  // fields directly in loadProgress() itself.
  p.schemaVersion = PROGRESS_SCHEMA_VERSION;
  return p;
}

function loadProgress() {
  const defaults = {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    completedLessons: [],
    lastVisitDate: null,
    streak: 0,
    vocabReview: {}, // chinese word -> { box: 1-5, nextReview: "YYYY-MM-DD" }
    dismissedChallenges: [], // lesson ids whose challenge card has been marked done
    readChapters: [], // "BOOKID-N" chapter keys marked fully read in the full Bible browser
    chapterPosition: {}, // "BOOKID-N" -> { verseIndex, percent } — last reading position, even if not marked "read"
    favoriteVerses: [], // { id, reference, referenceEnglish, verses: [...], icon, color } added from the Bible reader
    favoritesSortMode: "manual", // "manual" | "color" | "book" | "icon" | "alphabetical"
    lessonProgress: {}, // lessonId -> furthest step index reached (for resuming mid-lesson)
    basicsCompleted: [], // ids of completed Chinese Basics mini-course lessons
    basicsLessonProgress: {}, // basics lesson id -> furthest explain-step reached (for resuming mid-lesson)
    proclaimCompleted: [], // ids of completed Share Your Faith lessons
    proclaimLessonProgress: {}, // proclaim lesson id -> furthest explain-step reached (for resuming mid-lesson)
    myTestimony: "", // free-text testimony draft from the Telling Your Story lesson
    userName: null, // name entered on first launch, or null if skipped
    nameOnboardingSeen: false, // whether the name prompt has been shown/dismissed
    settings: { soundEnabled: true }, // master toggle for chimes + spoken audio
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      // Merge onto defaults so progress saved before a field existed (e.g. an
      // older version of the app) doesn't crash on a missing key. Nested
      // objects are merged one level deep too — otherwise old saved data
      // with a "settings" object would silently drop any new setting added
      // in a later update, since a shallow spread takes the old object whole.
      const saved = JSON.parse(raw);
      const merged = { ...defaults, ...saved, settings: { ...defaults.settings, ...(saved.settings || {}) } };
      return migrateProgress(merged);
    }
  } catch (e) {
    console.warn("Could not read saved progress, starting fresh.", e);
  }
  return migrateProgress(defaults);
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
    delete progress.lessonProgress[id]; // no longer "in progress" once done
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

// Escapes a string for safe use inside an HTML attribute (e.g. data-opt="...").
// Without this, option text containing a literal " (like an option explaining
// how to pronounce ü) would prematurely close the attribute and corrupt the
// rendered button — a real bug this caught in Chinese Basics Lesson 2.
function escapeAttr(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
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
function goFavorites() {
  location.hash = "#/favorites";
}
function goSettings() {
  location.hash = "#/settings";
}
function goProgress() {
  location.hash = "#/progress";
}
function goBibleChapters(bookId) {
  location.hash = "#/bible/" + bookId;
}
function goBibleChapter(bookId, chapterNum) {
  location.hash = "#/bible/" + bookId + "/" + chapterNum;
}
function goHighlight(id) {
  location.hash = "#/highlight/" + id;
}
function goBasics() {
  location.hash = "#/basics";
}
function goBasicsLesson(id) {
  location.hash = "#/basics/" + id;
}
function goProclaim() {
  location.hash = "#/proclaim";
}
function goProclaimLesson(id) {
  location.hash = "#/proclaim/" + id;
}

// ---------- Bottom navigation (persistent tab bar) ----------
const BOTTOM_NAV_TABS = [
  { id: "home", icon: "🏠", label: "Home", go: goHome },
  { id: "favorites", icon: "⭐", label: "Favourites", go: goFavorites },
  { id: "read", icon: "📜", label: "Read", go: goRead },
  { id: "explore", icon: "📖", label: "Explore", go: goExplore },
  { id: "settings", icon: "⚙️", label: "Settings", go: goSettings },
];

function bottomNavHtml(activeId) {
  return `
    <nav class="bottom-nav">
      ${BOTTOM_NAV_TABS.map(
        (tab) => `
        <button class="bottom-nav-tab ${tab.id === activeId ? "active" : ""}" data-tab="${tab.id}">
          <span class="bottom-nav-icon">${tab.icon}</span>
          <span class="bottom-nav-label">${tab.label}</span>
        </button>
      `
      ).join("")}
    </nav>
  `;
}

function wireBottomNav(container) {
  container.querySelectorAll(".bottom-nav-tab").forEach((btn) => {
    const tab = BOTTOM_NAV_TABS.find((t) => t.id === btn.dataset.tab);
    btn.addEventListener("click", () => tab.go());
  });
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
  const highlightMatch = hash.match(/^#\/highlight\/(.+)/);
  if (highlightMatch) {
    renderHighlightDetail(highlightMatch[1]);
    return;
  }
  const basicsLessonMatch = hash.match(/^#\/basics\/(\d+)/);
  if (basicsLessonMatch) {
    renderBasicsLesson(Number(basicsLessonMatch[1]));
    return;
  }
  if (hash === "#/basics") {
    renderBasicsList();
    return;
  }
  const proclaimLessonMatch = hash.match(/^#\/proclaim\/(\d+)/);
  if (proclaimLessonMatch) {
    renderProclaimLesson(Number(proclaimLessonMatch[1]));
    return;
  }
  if (hash === "#/proclaim") {
    renderProclaimList();
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
  if (hash === "#/favorites") {
    renderFavorites();
    return;
  }
  if (hash === "#/settings") {
    renderSettings();
    return;
  }
  if (hash === "#/progress") {
    renderProgressDashboard();
    return;
  }
  renderHome();
}

function getGreeting() {
  const doneCount = progress.completedLessons.length;
  const total = LESSONS.length;
  const namePart = progress.userName ? `, ${progress.userName}` : "";

  if (doneCount === 0) return `Welcome to Koinect${namePart}.`;
  if (doneCount >= total) return `You're all caught up${namePart}.`;

  const today = todayStr();
  const daysSinceLastVisit =
    previousVisitDate && previousVisitDate !== today
      ? Math.round((new Date(today) - new Date(previousVisitDate)) / 86400000)
      : 0;
  if (daysSinceLastVisit > 2) return `Welcome back${namePart}.`;

  const hour = new Date().getHours();
  if (hour < 12) return `Good morning${namePart}.`;
  if (hour < 18) return `Good afternoon${namePart}.`;
  return `Good evening${namePart}.`;
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
    <div class="has-bottom-nav">
      <div class="topbar">
        <div class="brand">
          <span class="brand-mark zh">语</span>
          <span>Koinect</span>
        </div>
        ${
          progress.streak > 1
            ? `<span class="streak-pill" aria-label="${progress.streak} day streak">${progress.streak} day streak</span>`
            : ""
        }
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

        <div class="card explore-card" id="basics-card" style="margin-top:20px;">
          <p class="eyebrow">Optional Primer</p>
          <h3 style="margin:6px 0 4px;">${
            progress.basicsCompleted.length > 0
              ? `Chinese Basics — ${progress.basicsCompleted.length} of ${BASICS.length} complete`
              : "New to Chinese? Start with Basics"
          }</h3>
          <p class="muted" style="margin-bottom:12px;">Tones, pinyin, and the core grammar patterns behind every lesson — a short, optional primer if you're just starting out with Mandarin.</p>
          <button class="btn btn-secondary btn-block" id="basics-card-btn">Open Chinese Basics</button>
        </div>

        <div class="card explore-card" id="proclaim-card" style="margin-top:12px;">
          <p class="eyebrow">Beyond Conversation</p>
          <h3 style="margin:6px 0 4px;">${
            progress.proclaimCompleted.length > 0
              ? `Share Your Faith — ${progress.proclaimCompleted.length} of ${PROCLAIM.length} complete`
              : "Ready to testify, preach, or share the gospel?"
          }</h3>
          <p class="muted" style="margin-bottom:12px;">Sustained speech, not dialogue — your own testimony, a memorable gospel sequence, real objections, and following a full sermon.</p>
          <button class="btn btn-secondary btn-block" id="proclaim-card-btn">Open Share Your Faith</button>
        </div>

        <h3 style="margin:24px 0 12px;">All Lessons</h3>
        <div id="lesson-groups"></div>
      </main>
      ${bottomNavHtml("home")}
    </div>
  `)
  );
  wireBottomNav(app);
  app.querySelector("#basics-card-btn").addEventListener("click", goBasics);
  app.querySelector("#proclaim-card-btn").addEventListener("click", goProclaim);

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
      const inProgress = isLessonInProgress(lesson.id);
      const pct = inProgress ? Math.round(((progress.lessonProgress[lesson.id] || 0) / STEPS.length) * 100) : 0;
      const btn = el(`
        <button class="lesson-card ${done ? "done" : ""} ${inProgress ? "in-progress" : ""}" ${unlocked ? "" : "disabled"}>
          <div class="lesson-num">${done ? "✓" : lesson.isCheckpoint ? "🎯" : lesson.id}</div>
          <div class="lesson-info">
            <h3>${lesson.title}</h3>
            <p class="zh">${lesson.subtitle}</p>
            ${inProgress ? `<div class="progress-track" style="margin-top:6px;"><div class="progress-fill" style="width:${pct}%"></div></div>` : ""}
          </div>
          <div class="lesson-status">${done ? "Completed" : inProgress ? "Continue" : unlocked ? "Start" : "Locked"}</div>
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
const STEPS = ["scenario", "dialogue", "vocabulary", "quiz", "respond", "challenge"];

function renderLesson(lesson) {
  const quizOrder = shuffle(lesson.quiz);
  // Resume mid-lesson if there's saved progress and it isn't already
  // completed (a completed lesson reopened is a deliberate full review).
  const resumeStep = isCompleted(lesson.id) ? 0 : progress.lessonProgress[lesson.id] || 0;
  const state = {
    stepIndex: Math.min(resumeStep, STEPS.length - 1),
    quizOrder, // fixed reference list, defines stable question numbering
    quizNumbering: new Map(quizOrder.map((q, i) => [q, i + 1])),
    quizQueue: [...quizOrder], // working queue: wrong answers get re-queued to the back
    quizResolved: new Set(), // question objects answered correctly at least once
    quizWrongOptions: new Map(), // question object -> Set of eliminated wrong options
  };
  renderLessonStep(lesson, state);
}

// Records how far into a lesson the learner has gotten, so reopening it
// later resumes there instead of restarting from the scenario every time.
function saveLessonStepProgress(lessonId, stepIndex) {
  const existing = progress.lessonProgress[lessonId] || 0;
  if (stepIndex > existing) {
    progress.lessonProgress[lessonId] = stepIndex;
    saveProgress();
  }
}

function isLessonInProgress(lessonId) {
  return !isCompleted(lessonId) && (progress.lessonProgress[lessonId] || 0) > 0;
}

// ---------- Chinese Basics (separate, optional mini-course) ----------
function isBasicsCompleted(id) {
  return progress.basicsCompleted.includes(id);
}
function markBasicsCompleted(id) {
  if (!isBasicsCompleted(id)) {
    progress.basicsCompleted.push(id);
    saveProgress();
  }
}
function isBasicsUnlocked(id) {
  const index = BASICS.findIndex((b) => b.id === id);
  if (index === 0) return true;
  return isBasicsCompleted(BASICS[index - 1].id);
}
function basicsExplainStepCount(b) {
  return b.points.length + 2; // intro (0) + one per point + examples (last)
}
function saveBasicsStepProgress(lessonId, step) {
  const existing = progress.basicsLessonProgress[lessonId] || 0;
  if (step > existing) {
    progress.basicsLessonProgress[lessonId] = step;
    saveProgress();
  }
}
function isBasicsInProgress(lessonId) {
  return !isBasicsCompleted(lessonId) && (progress.basicsLessonProgress[lessonId] || 0) > 0;
}

// ---------- Share Your Faith / Proclaim (separate track, monologue-focused) ----------
function isProclaimCompleted(id) {
  return progress.proclaimCompleted.includes(id);
}
function markProclaimCompleted(id) {
  if (!isProclaimCompleted(id)) {
    progress.proclaimCompleted.push(id);
    saveProgress();
  }
}
function isProclaimUnlocked(id) {
  const index = PROCLAIM.findIndex((p) => p.id === id);
  if (index === 0) return true;
  return isProclaimCompleted(PROCLAIM[index - 1].id);
}
function proclaimExplainStepCount(p) {
  // intro + one per point + examples/sequence + (yourTurn, only for lesson 2)
  return p.points.length + 2 + (p.yourTurn ? 1 : 0);
}
function saveProclaimStepProgress(lessonId, step) {
  const existing = progress.proclaimLessonProgress[lessonId] || 0;
  if (step > existing) {
    progress.proclaimLessonProgress[lessonId] = step;
    saveProgress();
  }
}
function isProclaimInProgress(lessonId) {
  return !isProclaimCompleted(lessonId) && (progress.proclaimLessonProgress[lessonId] || 0) > 0;
}
function saveMyTestimony(text) {
  progress.myTestimony = text.slice(0, 2000);
  saveProgress();
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
  saveLessonStepProgress(lesson.id, state.stepIndex);

  if (step === "scenario") {
    renderLessonShell(
      lesson,
      state,
      `
      <div class="step-section">
        <p class="eyebrow step-eyebrow">${lesson.isCheckpoint ? "Checkpoint" : "Lesson " + lesson.id} · ${lesson.title}</p>
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
          .map((line) =>
            line.speaker === "Narrator"
              ? `
          <div class="dialogue-line narrator">
            <div class="narrator-caption">
              <div class="zh">${line.chinese}</div>
              <div class="pinyin">${line.pinyin}</div>
              <div class="en">${line.english}</div>
            </div>
          </div>
        `
              : `
          <div class="dialogue-line ${line.speaker === "You" ? "you" : ""}">
            <div class="dialogue-speaker">${displaySpeakerName(line.speaker)}</div>
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

  if (step === "respond") {
    renderRespondStep(lesson, state);
    return;
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
        ${
          lesson.verse
            ? `<p class="eyebrow" style="margin:20px 0 8px;">Carry This With You</p>
              <div class="scripture-block lesson-verse">
                <p class="eyebrow" style="margin-bottom:6px;">${lesson.verse.reference} <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0;">· ${lesson.verse.referenceEnglish}</span></p>
                <div class="zh scripture-text">${lesson.verse.chinese}</div>
                <div class="pinyin">${lesson.verse.pinyin}</div>
                ${
                  Speech.supported
                    ? `<button class="icon-btn" id="play-verse-btn" aria-label="Hear this verse" style="margin-top:8px;">🔊</button>`
                    : ""
                }
              </div>`
            : ""
        }
        ${
          lesson.verse?.scriptureVocabulary
            ? `<p class="eyebrow" style="margin:20px 0 8px;">Understanding the Verse</p>
              <p class="muted" style="margin-bottom:12px;">Chinese Bible text uses words and patterns you won't hear in everyday conversation. Here are two from this verse:</p>
              <div class="vocab-grid">
                ${lesson.verse.scriptureVocabulary
                  .map(
                    (v) => `
                  <div class="vocab-card">
                    <div class="vocab-top">
                      <span class="zh">${v.chinese}</span>
                      <span class="vocab-pinyin">${v.pinyin}</span>
                      <span class="vocab-badge new" style="background:#EFF4F8;color:var(--color-primary);border-color:#D9E4EC;">Biblical</span>
                    </div>
                    <div class="vocab-en">${v.english}</div>
                    <div class="vocab-note">${v.note}</div>
                  </div>
                `
                  )
                  .join("")}
              </div>
              <div class="quiz-question" style="margin-top:16px;">
                <p style="font-weight:600;margin-bottom:10px;">${lesson.verse.scriptureQuestion.question}</p>
                <div class="quiz-options" id="scripture-quiz-options">
                  ${lesson.verse.scriptureQuestion.options
                    .map((opt) => `<button class="option-btn" data-opt="${escapeAttr(opt)}">${opt}</button>`)
                    .join("")}
                </div>
                <p class="feedback-text" id="scripture-feedback" aria-live="polite"></p>
                <div id="scripture-confirm-row" style="margin-top:8px;"></div>
              </div>`
            : ""
        }
      </div>
      <div class="sticky-footer">
        <button class="btn btn-primary" id="finish-btn">Finish Lesson</button>
      </div>
    `
    );
    if (lesson.verse) {
      app
        .querySelector("#play-verse-btn")
        ?.addEventListener("click", () => Speech.speak(lesson.verse.chinese, "zh-CN"));
    }
    if (lesson.verse?.scriptureQuestion) {
      const sq = lesson.verse.scriptureQuestion;
      const sqButtons = [...app.querySelectorAll("#scripture-quiz-options .option-btn")];
      const sqFeedback = app.querySelector("#scripture-feedback");
      const sqConfirmRow = app.querySelector("#scripture-confirm-row");
      let sqSelected = null;

      function renderSqConfirmBtn() {
        sqConfirmRow.innerHTML = `<button class="btn btn-secondary" id="scripture-confirm-btn" ${
          sqSelected ? "" : "disabled"
        }>Confirm Answer</button>`;
        sqConfirmRow.querySelector("#scripture-confirm-btn").addEventListener("click", confirmSqAnswer);
      }

      sqButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          sqSelected = btn.dataset.opt;
          sqButtons.forEach((b) => b.classList.toggle("selected", b.dataset.opt === sqSelected));
          renderSqConfirmBtn();
        });
      });
      renderSqConfirmBtn();

      function confirmSqAnswer() {
        const isRight = sqSelected === sq.answer;
        sqButtons.forEach((b) => {
          b.disabled = true;
          b.classList.remove("selected");
          if (b.dataset.opt === sq.answer) b.classList.add("correct");
          else if (b.dataset.opt === sqSelected) b.classList.add("incorrect");
        });
        if (isRight) AudioFX.correct();
        else AudioFX.incorrect();
        sqFeedback.textContent = isRight ? "Correct!" : `Not quite — the answer is "${sq.answer}."`;
        sqFeedback.classList.add(isRight ? "correct" : "incorrect");
        sqConfirmRow.innerHTML = "";
      }
    }
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
              }" data-opt="${escapeAttr(opt)}" ${isEliminated ? "disabled" : ""}>${opt}</button>
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
  let selected = null;

  function renderConfirmBtn() {
    footer.innerHTML = `<button class="btn btn-primary" id="quiz-confirm-btn" ${selected ? "" : "disabled"}>Confirm Answer</button>`;
    footer.querySelector("#quiz-confirm-btn").addEventListener("click", confirmAnswer);
  }

  optionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      selected = btn.dataset.opt;
      optionButtons.forEach((b) => b.classList.toggle("selected", b.dataset.opt === selected));
      renderConfirmBtn();
    });
  });
  renderConfirmBtn();

  function confirmAnswer() {
    const chosen = selected;
    const isRight = chosen === q.answer;

    optionButtons.forEach((b) => {
      b.disabled = true;
      b.classList.remove("selected");
      if (isRight && b.dataset.opt === q.answer) b.classList.add("correct");
      else if (!isRight && b.dataset.opt === chosen) b.classList.add("incorrect");
    });

    if (isRight) {
      AudioFX.correct();
      feedback.textContent = "Correct!";
      feedback.classList.add("correct");
      state.quizResolved.add(q);
      state.quizQueue.shift(); // done with this question
    } else {
      AudioFX.incorrect();
      feedback.textContent = "Not quite — give it another try.";
      feedback.classList.add("incorrect");
      if (!state.quizWrongOptions.has(q)) state.quizWrongOptions.set(q, new Set());
      state.quizWrongOptions.get(q).add(chosen);
      state.quizQueue.shift();
      state.quizQueue.push(q); // send it to the back for a later retry
    }

    footer.innerHTML = `<button class="btn btn-primary" id="quiz-next-btn">Continue</button>`;
    footer.querySelector("#quiz-next-btn").addEventListener("click", () => {
      renderQuizQuestion(lesson, state);
    });
  }
}

// ---------- Respond Practice ----------
// Tests picking/producing an appropriate response, not just word recognition.
// Single-attempt with clear feedback — a practice step, not a hard gate.
function renderRespondStep(lesson, state) {
  const rp = lesson.respondPractice;
  if (!rp) {
    // No practice authored for this lesson — skip straight to the challenge.
    state.stepIndex++;
    renderLessonStep(lesson, state);
    return;
  }

  const isFillBlank = rp.type === "fill-in-blank";
  const options = shuffle(rp.options);

  renderLessonShell(
    lesson,
    state,
    `
    <div class="step-section">
      <p class="eyebrow step-eyebrow">${isFillBlank ? "Complete the Sentence" : "Choose the Right Response"}</p>
      ${
        isFillBlank
          ? `<h2 class="zh" style="margin:8px 0 4px;font-size:1.3rem;">${rp.template}</h2>
             <p class="muted" style="margin-bottom:16px;">${rp.englishHint}</p>`
          : `<div class="dialogue-bubble" style="margin-bottom:16px;">
               <div class="zh" style="font-size:1.1rem;">${rp.prompt.chinese}</div>
               <div class="pinyin">${rp.prompt.pinyin}</div>
               <div class="en">${rp.prompt.english}</div>
             </div>
             <p class="muted" style="margin-bottom:12px;">How would you respond?</p>`
      }
      <div class="quiz-options" id="respond-options">
        ${options
          .map((opt) => {
            const label = isFillBlank ? opt : opt.chinese;
            const value = isFillBlank ? opt : opt.chinese;
            return `<button class="option-btn zh" data-opt="${escapeAttr(value)}">${label}</button>`;
          })
          .join("")}
      </div>
      <p class="feedback-text" id="respond-feedback" aria-live="polite"></p>
    </div>
    <div class="sticky-footer" id="respond-footer"></div>
  `
  );

  const optionButtons = [...app.querySelectorAll("#respond-options .option-btn")];
  const feedback = app.querySelector("#respond-feedback");
  const footer = app.querySelector("#respond-footer");
  let selected = null;

  function renderConfirmBtn() {
    footer.innerHTML = `<button class="btn btn-primary" id="respond-confirm-btn" ${selected ? "" : "disabled"}>Confirm Answer</button>`;
    footer.querySelector("#respond-confirm-btn").addEventListener("click", confirmAnswer);
  }

  optionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      selected = btn.dataset.opt;
      optionButtons.forEach((b) => b.classList.toggle("selected", b.dataset.opt === selected));
      renderConfirmBtn();
    });
  });
  renderConfirmBtn();

  function confirmAnswer() {
    const isRight = selected === rp.answer;
    optionButtons.forEach((b) => {
      b.disabled = true;
      b.classList.remove("selected");
      if (b.dataset.opt === rp.answer) b.classList.add("correct");
      else if (b.dataset.opt === selected) b.classList.add("incorrect");
    });
    if (isRight) {
      AudioFX.correct();
      feedback.textContent = "Correct!";
      feedback.classList.add("correct");
    } else {
      AudioFX.incorrect();
      feedback.textContent = `Not quite — the best response is "${rp.answer}."`;
      feedback.classList.add("incorrect");
    }
    footer.innerHTML = `<button class="btn btn-primary" id="respond-next-btn">Continue</button>`;
    footer.querySelector("#respond-next-btn").addEventListener("click", () => {
      state.stepIndex++;
      renderLessonStep(lesson, state);
    });
  }
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
            return `<button class="option-btn${isEliminated ? " eliminated" : ""}" data-opt="${escapeAttr(opt)}" ${
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
  let selected = null;

  function renderConfirmBtn() {
    footer.innerHTML = `<button class="btn btn-primary" id="review-confirm-btn" ${selected ? "" : "disabled"}>Confirm Answer</button>`;
    footer.querySelector("#review-confirm-btn").addEventListener("click", confirmAnswer);
  }

  optionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      selected = btn.dataset.opt;
      optionButtons.forEach((b) => b.classList.toggle("selected", b.dataset.opt === selected));
      renderConfirmBtn();
    });
  });
  renderConfirmBtn();

  function confirmAnswer() {
    const chosen = selected;
    const isRight = chosen === word.english;

    optionButtons.forEach((b) => {
      b.disabled = true;
      b.classList.remove("selected");
      if (isRight && b.dataset.opt === word.english) b.classList.add("correct");
      else if (!isRight && b.dataset.opt === chosen) b.classList.add("incorrect");
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
      AudioFX.incorrect();
      feedback.textContent = "Not quite — give it another try.";
      feedback.classList.add("incorrect");
      if (!state.wrongOptions.has(word)) state.wrongOptions.set(word, new Set());
      state.wrongOptions.get(word).add(chosen);
      state.queue.shift();
      state.queue.push(word);
    }

    footer.innerHTML = `<button class="btn btn-primary" id="review-next-btn">Continue</button>`;
    footer.querySelector("#review-next-btn").addEventListener("click", () => renderReviewWord(state));
  }
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
    <div class="has-bottom-nav">
      <div class="topbar">
        <div class="brand"><span>Explore</span></div>
      </div>
      <main class="screen" id="explore-body"></main>
      ${bottomNavHtml("explore")}
    </div>
  `);
  app.appendChild(wrapper);
  wireBottomNav(app);

  const body = app.querySelector("#explore-body");
  body.innerHTML = `
    <p class="muted" style="margin-bottom:16px;">
      Bible characters, places, festivals, and church terms — for quick lookup any time. Tap a category to open it.
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
    <details class="explore-category">
      <summary class="stage-heading">${cat.name}${
    cat.nameZh ? ` <span class="zh category-zh">${cat.nameZh}</span>` : ""
  } <span class="category-count">(${cat.entries.length})</span></summary>
      <div class="explore-category-content">
        ${cat.entries.map((e) => renderEntryCard(e)).join("")}
      </div>
    </details>
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

// ---------- Read (Bible browser) ----------
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

// Granular position within a chapter — a percentage of how far the learner
// has scrolled, so reopening a partially-read chapter resumes near where
// they left off instead of always starting at verse 1.
function getChapterPercent(bookId, chapterNum) {
  if (isChapterRead(bookId, chapterNum)) return 100;
  return progress.chapterPosition[chapterKey(bookId, chapterNum)] || 0;
}
function saveChapterPercent(bookId, chapterNum, percent) {
  const key = chapterKey(bookId, chapterNum);
  const existing = progress.chapterPosition[key] || 0;
  if (percent > existing) {
    progress.chapterPosition[key] = percent;
    saveProgress();
  }
}

// ---------- Favorite verses (feed into Key Highlights) ----------
function verseFavoriteId(bookId, chapterNum, verseNum) {
  return `${bookId}-${chapterNum}-${verseNum}`;
}
function isVerseFavorited(bookId, chapterNum, verseNum) {
  return progress.favoriteVerses.some((f) => f.id === verseFavoriteId(bookId, chapterNum, verseNum));
}
function toggleFavoriteVerse(book, chapterNum, verse) {
  const id = verseFavoriteId(book.id, chapterNum, verse.n);
  const idx = progress.favoriteVerses.findIndex((f) => f.id === id);
  if (idx >= 0) {
    progress.favoriteVerses.splice(idx, 1);
  } else {
    progress.favoriteVerses.push({
      id,
      bookId: book.id, // used for "sort by book"
      reference: `${book.name} ${chapterNum}:${verse.n}`,
      referenceEnglish: `${book.nameEnglish} ${chapterNum}:${verse.n}`,
      verses: [{ number: verse.n, chinese: verse.c, pinyin: verse.p }],
      icon: "⭐",
      color: "#D9A441",
    });
  }
  saveProgress();
  return idx < 0; // true if it was just added
}

function setFavoriteIcon(id, icon) {
  const f = progress.favoriteVerses.find((x) => x.id === id);
  if (f) {
    f.icon = icon;
    saveProgress();
  }
}
function setFavoriteColor(id, color) {
  const f = progress.favoriteVerses.find((x) => x.id === id);
  if (f) {
    f.color = color;
    saveProgress();
  }
}
function setFavoritesSortMode(mode) {
  progress.favoritesSortMode = mode;
  saveProgress();
}
function bookOrderIndex(bookId) {
  const i = BIBLE_FULL.findIndex((b) => b.id === bookId);
  return i === -1 ? 999 : i;
}
// Returns a sorted COPY for display — never mutates the stored (manual)
// order, so switching back to "manual" always restores the true order the
// learner last arranged by hand.
function sortedFavorites() {
  const list = [...progress.favoriteVerses];
  switch (progress.favoritesSortMode) {
    case "color":
      return list.sort((a, b) => (a.color || "").localeCompare(b.color || ""));
    case "book":
      return list.sort((a, b) => bookOrderIndex(a.bookId) - bookOrderIndex(b.bookId));
    case "icon":
      return list.sort((a, b) => (a.icon || "").localeCompare(b.icon || ""));
    case "alphabetical":
      return list.sort((a, b) => a.referenceEnglish.localeCompare(b.referenceEnglish));
    default:
      return list; // "manual" — stored order as-is
  }
}

// ---------- Help / About ----------
function isSoundEnabled() {
  return progress.settings?.soundEnabled !== false;
}

function toggleSound() {
  progress.settings = progress.settings || {};
  progress.settings.soundEnabled = !isSoundEnabled();
  saveProgress();
}

function renderSettings() {
  stopDialogue();
  app.innerHTML = "";
  const wrapper = el(`
    <div class="has-bottom-nav">
      <div class="topbar">
        <div class="brand"><span>Settings</span></div>
      </div>
      <main class="screen" id="settings-body"></main>
      ${bottomNavHtml("settings")}
    </div>
  `);
  app.appendChild(wrapper);
  wireBottomNav(app);

  const body = app.querySelector("#settings-body");
  body.innerHTML = `
    <div class="stage-group">
      <p class="stage-heading">Progress</p>
      <button class="lesson-card" id="my-progress-btn">
        <div class="lesson-num">📊</div>
        <div class="lesson-info">
          <h3>My Progress</h3>
          <p class="zh" style="font-family:var(--font-ui);">Everything in one place — lessons, Basics, Share Your Faith, Bible reading, and more</p>
        </div>
        <div class="lesson-status">Open</div>
      </button>
    </div>

    <div class="stage-group">
      <p class="stage-heading">Sound</p>
      <button class="lesson-card" id="sound-toggle-btn">
        <div class="lesson-num">${isSoundEnabled() ? "🔊" : "🔇"}</div>
        <div class="lesson-info">
          <h3>Sound Effects & Speech</h3>
          <p class="zh" style="font-family:var(--font-ui);">Chimes, and spoken audio throughout the app</p>
        </div>
        <div class="lesson-status">${isSoundEnabled() ? "On" : "Off"}</div>
      </button>
    </div>

    <div class="card" style="text-align:center;margin:20px 0;">
      <span class="brand-mark zh" style="display:inline-flex;width:44px;height:44px;font-size:1.3rem;margin-bottom:10px;">语</span>
      <h2 style="margin:0 0 4px;">Koinect</h2>
      <p class="muted">Version ${APP_VERSION}</p>
    </div>

    <div class="stage-group">
      <p class="stage-heading">How Koinect Works</p>
      <div class="help-item">
        <h3>Lessons</h3>
        <p class="muted">Each lesson walks through a real church scenario — a scenario, a dialogue, vocabulary, a quiz, and a real-world challenge. Lessons unlock in order as you complete them.</p>
      </div>
      <div class="help-item">
        <h3>Sound</h3>
        <p class="muted">Tap 🔊 on any word, or "Play Conversation" on a dialogue, to hear it spoken aloud. This uses your device's built-in Chinese voice — if a lesson stays silent, your browser may not have one installed.</p>
      </div>
      <div class="help-item">
        <h3>Daily Review</h3>
        <p class="muted">Finishing a lesson schedules its vocabulary for spaced review. Check Home for words due today.</p>
      </div>
      <div class="help-item">
        <h3>Explore & Read</h3>
        <p class="muted">📖 Explore is a searchable glossary of Bible books, people, places, and church terms. 📜 Read has a short curated passage list, plus the complete Bible (all 66 books) to browse chapter by chapter.</p>
      </div>
      <div class="help-item">
        <h3>Your progress</h3>
        <p class="muted">Everything is saved on this device only — no account, no login, nothing sent anywhere. Progress persists across visits, but won't sync to another device or browser, and clearing your browser's site data will reset it.</p>
      </div>
    </div>
  `;

  body.querySelector("#sound-toggle-btn").addEventListener("click", () => {
    toggleSound();
    renderSettings();
  });
  body.querySelector("#my-progress-btn").addEventListener("click", goProgress);
}

// ---------- My Progress (unified dashboard) ----------
async function renderProgressDashboard() {
  stopDialogue();
  app.innerHTML = "";
  const wrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Back to Settings">←</button>
        <h2 style="margin:0;font-size:1.1rem;">My Progress</h2>
      </div>
      <main class="screen" id="progress-body">
        <p class="muted" style="padding:16px 0;">Loading…</p>
      </main>
    </div>
  `);
  app.appendChild(wrapper);
  app.querySelector("#back-btn").addEventListener("click", goSettings);

  await ensureBibleFullLoaded();
  if (location.hash !== "#/progress") return; // navigated away while loading

  const body = app.querySelector("#progress-body");

  const lessonsDone = progress.completedLessons.length;
  const basicsDone = progress.basicsCompleted.length;
  const proclaimDone = progress.proclaimCompleted.length;
  const totalLessons = LESSONS.length + BASICS.length + PROCLAIM.length;
  const totalDone = lessonsDone + basicsDone + proclaimDone;

  const totalChapters = BIBLE_FULL.reduce((sum, b) => sum + b.chapters.length, 0);
  const chaptersRead = progress.readChapters.length;
  const booksFullyRead = BIBLE_FULL.filter((b) => chaptersReadInBook(b) === b.chapters.length).length;

  const wordsLearned = getUniqueWordsLearnedCount();
  const wordsInRotation = Object.keys(progress.vocabReview).length;
  const wordsDueToday = getWordsDueToday().length;

  function statCard(icon, title, subtitle, pct, actionLabel, action) {
    return `
      <button class="lesson-card" data-action="${action}">
        <div class="lesson-num">${icon}</div>
        <div class="lesson-info">
          <h3>${title}</h3>
          <p class="zh" style="font-family:var(--font-ui);">${subtitle}</p>
          ${pct !== null ? `<div class="progress-track" style="margin-top:6px;"><div class="progress-fill" style="width:${pct}%"></div></div>` : ""}
        </div>
        <div class="lesson-status">${actionLabel}</div>
      </button>
    `;
  }

  body.innerHTML = `
    <div class="card" style="text-align:center;margin-bottom:20px;">
      <p class="eyebrow">Overall</p>
      <h2 style="margin:6px 0 4px;">${totalDone} of ${totalLessons} lessons complete</h2>
      ${progress.streak > 1 ? `<p class="muted">${progress.streak} day streak</p>` : ""}
      <div class="progress-track" style="margin-top:10px;"><div class="progress-fill" style="width:${Math.round(
        (totalDone / totalLessons) * 100
      )}%"></div></div>
    </div>

    <div class="stage-group">
      <p class="stage-heading">Learning Tracks</p>
      <div class="lesson-list">
        ${statCard(
          "📖",
          "Main Lessons",
          `Connect, Belong, Grow, Serve — ${lessonsDone} of ${LESSONS.length}`,
          Math.round((lessonsDone / LESSONS.length) * 100),
          "View",
          "home"
        )}
        ${statCard(
          "🔤",
          "Chinese Basics",
          `${basicsDone} of ${BASICS.length} complete`,
          Math.round((basicsDone / BASICS.length) * 100),
          "View",
          "basics"
        )}
        ${statCard(
          "🗣️",
          "Share Your Faith",
          `${proclaimDone} of ${PROCLAIM.length} complete`,
          Math.round((proclaimDone / PROCLAIM.length) * 100),
          "View",
          "proclaim"
        )}
      </div>
    </div>

    <div class="stage-group">
      <p class="stage-heading">Bible Reading</p>
      <div class="lesson-list">
        ${statCard(
          "📜",
          "Chapters Read",
          `${chaptersRead} of ${totalChapters} chapters · ${booksFullyRead} of 66 books complete`,
          Math.round((chaptersRead / totalChapters) * 100),
          "View",
          "read"
        )}
        ${statCard("⭐", "Favourite Verses", `${progress.favoriteVerses.length} saved`, null, "View", "favorites")}
      </div>
    </div>

    <div class="stage-group">
      <p class="stage-heading">Vocabulary</p>
      <div class="lesson-list">
        <div class="lesson-card" style="cursor:default;">
          <div class="lesson-num">🧠</div>
          <div class="lesson-info">
            <h3>${wordsLearned} words met</h3>
            <p class="zh" style="font-family:var(--font-ui);">${wordsInRotation} in your review rotation · ${wordsDueToday} due today</p>
          </div>
        </div>
      </div>
    </div>
  `;

  body.querySelectorAll("[data-action]").forEach((btn) => {
    const dest = btn.dataset.action;
    const goMap = { home: goHome, basics: goBasics, proclaim: goProclaim, read: goRead, favorites: goFavorites };
    btn.addEventListener("click", () => goMap[dest]?.());
  });
}

async function renderRead() {
  stopDialogue();
  app.innerHTML = "";
  const wrapper = el(`
    <div class="has-bottom-nav">
      <div class="topbar">
        <div class="brand"><span>Read</span></div>
      </div>
      <main class="screen" id="read-body">
        <p class="muted" style="padding:16px 0;">Loading the Bible text…</p>
      </main>
      ${bottomNavHtml("read")}
    </div>
  `);
  app.appendChild(wrapper);
  wireBottomNav(app);

  await ensureBibleFullLoaded();
  if (location.hash !== "#/read") return; // user navigated away while loading

  const body = app.querySelector("#read-body");
  const oldTestament = BIBLE_FULL.slice(0, 39);
  const newTestament = BIBLE_FULL.slice(39);
  const totalChapters = BIBLE_FULL.reduce((sum, b) => sum + b.chapters.length, 0);
  const doneChapters = progress.readChapters.length;
  const pct = totalChapters > 0 ? Math.round((doneChapters / totalChapters) * 100) : 0;

  function renderBookGroup(title, titleZh, books) {
    return `
      <div class="stage-group">
        <p class="stage-heading">${title} <span class="zh category-zh">${titleZh}</span></p>
        <div class="lesson-list">
          ${books
            .map((b) => {
              const readCount = chaptersReadInBook(b);
              const done = readCount === b.chapters.length;
              return `
              <button class="lesson-card ${done ? "done" : ""}" data-book="${b.id}">
                <div class="lesson-num">${done ? "✓" : BOOK_ICONS[b.id] || "📖"}</div>
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

  body.innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <p class="eyebrow">Reading Progress</p>
      <h3 style="margin:6px 0 10px;">${doneChapters} of ${totalChapters} chapters read</h3>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>

    ${renderBookGroup("Old Testament", "旧约", oldTestament)}
    ${renderBookGroup("New Testament", "新约", newTestament)}
  `;
  body.querySelectorAll("[data-book]").forEach((btn) => {
    btn.addEventListener("click", () => goBibleChapters(btn.dataset.book));
  });
}

async function renderBibleChapterList(bookId) {
  stopDialogue();
  app.innerHTML = "";
  const wrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Back to books">←</button>
        <h2 style="margin:0;font-size:1.1rem;">Loading…</h2>
      </div>
      <main class="screen" id="chapters-body"></main>
    </div>
  `);
  app.appendChild(wrapper);
  app.querySelector("#back-btn").addEventListener("click", goRead);

  await ensureBibleFullLoaded();
  if (location.hash !== "#/bible/" + bookId) return; // navigated elsewhere while loading

  const book = BIBLE_FULL.find((b) => b.id === bookId);
  if (!book) {
    goRead();
    return;
  }
  app.querySelector("h2").textContent = book.name;

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
    const percent = getChapterPercent(bookId, chapterNum);
    const inProgress = !done && percent > 0;
    const btn = el(
      `<button class="chapter-tile ${done ? "done" : ""} ${inProgress ? "in-progress" : ""}" title="${
        inProgress ? percent + "% read" : ""
      }">${chapterNum}</button>`
    );
    btn.addEventListener("click", () => goBibleChapter(bookId, chapterNum));
    grid.appendChild(btn);
  });
}

// ---------- Favourites tab ----------
const FAVORITES_SORT_OPTIONS = [
  { mode: "manual", label: "Date Added" },
  { mode: "book", label: "By Book" },
  { mode: "color", label: "By Colour" },
  { mode: "icon", label: "By Icon" },
  { mode: "alphabetical", label: "A–Z" },
];

function renderFavorites() {
  stopDialogue();
  app.innerHTML = "";
  const wrapper = el(`
    <div class="has-bottom-nav">
      <div class="topbar">
        <div class="brand"><span>Favourites</span></div>
      </div>
      <main class="screen" id="favorites-body"></main>
      ${bottomNavHtml("favorites")}
    </div>
  `);
  app.appendChild(wrapper);
  wireBottomNav(app);
  renderFavoritesBody();
}

function renderFavoritesBody() {
  const body = app.querySelector("#favorites-body");
  const mode = progress.favoritesSortMode;
  const favorites = sortedFavorites();

  body.innerHTML = `
    <div class="stage-group">
      <p class="stage-heading">Key Highlights</p>
      <p class="muted" style="margin-bottom:10px;">Foundational texts worth committing to memory.</p>
      <div class="lesson-list">
        ${HIGHLIGHTS.map(
          (h) => `
          <button class="lesson-card" data-highlight="${h.id}">
            <div class="lesson-num">📌</div>
            <div class="lesson-info">
              <h3>${h.referenceEnglish}</h3>
              <p class="zh">${h.reference}</p>
            </div>
            <div class="lesson-status">Open</div>
          </button>
        `
        ).join("")}
      </div>
    </div>

    <div class="stage-group">
      <p class="stage-heading">My Favourite Verses</p>
      ${
        favorites.length > 0
          ? `<div class="sort-row" id="favorites-sort-row">
              ${FAVORITES_SORT_OPTIONS.map(
                (o) => `<button class="sort-btn ${o.mode === mode ? "active" : ""}" data-sort="${o.mode}">${o.label}</button>`
              ).join("")}
            </div>`
          : ""
      }
      <div class="lesson-list" id="favorites-list">
        ${
          favorites.length === 0
            ? `<p class="muted" style="font-size:0.85rem;">Tap ☆ next to any verse while reading to add your own favorites here.</p>`
            : favorites
                .map(
                  (f) => `
              <div class="lesson-card favorite-card" data-fav-id="${f.id}" style="border-left:4px solid ${f.color}">
                <button class="favorite-icon-btn" data-icon-for="${f.id}" aria-label="Change icon or colour" style="color:${f.color}">${f.icon}</button>
                <button class="favorite-open-btn" data-highlight="${f.id}">
                  <div class="lesson-info">
                    <h3>${f.referenceEnglish}</h3>
                    <p class="zh">${f.reference}</p>
                  </div>
                </button>
              </div>
            `
                )
                .join("")
        }
      </div>
    </div>
  `;

  body.querySelectorAll("[data-highlight]").forEach((btn) => {
    btn.addEventListener("click", () => goHighlight(btn.dataset.highlight));
  });
  body.querySelectorAll(".favorite-open-btn").forEach((btn) => {
    btn.addEventListener("click", () => goHighlight(btn.dataset.highlight));
  });
  body.querySelectorAll(".favorite-icon-btn").forEach((btn) => {
    btn.addEventListener("click", () => renderFavoriteIconPicker(btn.dataset.iconFor));
  });
  body.querySelector("#favorites-sort-row")?.querySelectorAll(".sort-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setFavoritesSortMode(btn.dataset.sort);
      renderFavoritesBody();
    });
  });

}

function renderFavoriteIconPicker(favoriteId) {
  const fav = progress.favoriteVerses.find((f) => f.id === favoriteId);
  if (!fav) return;
  const overlay = el(`
    <div class="modal-overlay" id="icon-picker-overlay">
      <div class="modal-card" style="text-align:left;">
        <h2 style="margin-bottom:4px;text-align:center;">Personalise</h2>
        <p class="muted" style="margin-bottom:16px;text-align:center;">${fav.referenceEnglish}</p>
        <p class="eyebrow" style="margin-bottom:8px;">Icon</p>
        <div class="picker-grid" id="icon-grid">
          ${FAVORITE_ICON_OPTIONS.map(
            (i) => `<button class="picker-swatch ${i === fav.icon ? "selected" : ""}" data-icon="${i}">${i}</button>`
          ).join("")}
        </div>
        <p class="eyebrow" style="margin:16px 0 8px;">Colour</p>
        <div class="picker-grid" id="color-grid">
          ${FAVORITE_COLOR_OPTIONS.map(
            (c) =>
              `<button class="picker-swatch color-swatch ${c === fav.color ? "selected" : ""}" data-color="${c}" style="background:${c}"></button>`
          ).join("")}
        </div>
        <button class="btn btn-primary" id="icon-picker-done-btn" style="margin-top:20px;">Done</button>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);

  overlay.querySelectorAll("#icon-grid .picker-swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      setFavoriteIcon(favoriteId, btn.dataset.icon);
      overlay.querySelectorAll("#icon-grid .picker-swatch").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });
  overlay.querySelectorAll("#color-grid .picker-swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      setFavoriteColor(favoriteId, btn.dataset.color);
      overlay.querySelectorAll("#color-grid .picker-swatch").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });
  overlay.querySelector("#icon-picker-done-btn").addEventListener("click", () => {
    overlay.remove();
    renderFavoritesBody();
  });
}

function renderHighlightDetail(id) {
  stopDialogue();
  const fixed = HIGHLIGHTS.find((h) => h.id === id);
  const favorite = progress.favoriteVerses.find((f) => f.id === id);
  const item = fixed || favorite;
  if (!item) {
    goFavorites();
    return;
  }

  app.innerHTML = "";
  const wrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Back to Favourites">←</button>
        <h2 style="margin:0;font-size:1.1rem;">${item.reference}</h2>
      </div>
      <main class="screen" id="highlight-body"></main>
    </div>
  `);
  app.appendChild(wrapper);
  app.querySelector("#back-btn").addEventListener("click", goFavorites);

  const body = app.querySelector("#highlight-body");
  body.innerHTML = `
    <div class="step-section">
      <p class="eyebrow step-eyebrow">${item.referenceEnglish}</p>
      ${item.note ? `<p class="muted" style="margin-bottom:16px;">${item.note}</p>` : ""}
      ${
        Speech.supported
          ? `<button class="btn btn-secondary" id="play-highlight-btn" style="margin-bottom:20px;">▶ Play</button>`
          : ""
      }
      <div id="highlight-verse-list">
        ${item.verses
          .map(
            (v) => `
          <div class="scripture-block" data-verse="${v.number}">
            ${item.verses.length > 1 ? `<span class="verse-number">${v.number}</span>` : ""}
            <div class="zh scripture-text">${v.chinese}</div>
            <div class="pinyin">${v.pinyin}</div>
          </div>
        `
          )
          .join("")}
      </div>
      ${
        !fixed
          ? `<button class="btn btn-secondary btn-block" id="unfavorite-btn" style="margin-top:16px;">★ Remove from Favourites</button>`
          : ""
      }
    </div>
  `;

  const playBtn = body.querySelector("#play-highlight-btn");
  if (playBtn) {
    playBtn.addEventListener("click", async () => {
      if (dialoguePlaying) {
        stopDialogue();
        playBtn.textContent = "▶ Play";
        return;
      }
      dialoguePlaying = true;
      playBtn.textContent = "⏸ Stop";
      const blocks = [...body.querySelectorAll(".scripture-block")];
      for (const v of item.verses) {
        if (!dialoguePlaying) break;
        const block = blocks.find((b) => b.dataset.verse === String(v.number));
        block?.classList.add("speaking");
        await Speech.speak(v.chinese, "zh-CN");
        block?.classList.remove("speaking");
        await new Promise((r) => setTimeout(r, 250));
      }
      dialoguePlaying = false;
      playBtn.textContent = "▶ Play";
    });
  }

  body.querySelector("#unfavorite-btn")?.addEventListener("click", () => {
    const idx = progress.favoriteVerses.findIndex((f) => f.id === id);
    if (idx >= 0) {
      progress.favoriteVerses.splice(idx, 1);
      saveProgress();
    }
    goFavorites();
  });
}

async function renderBibleChapter(bookId, chapterNum) {
  stopDialogue();
  app.innerHTML = "";
  const loadingWrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Back to chapter list">←</button>
        <h2 style="margin:0;font-size:1.1rem;">Loading…</h2>
      </div>
      <main class="screen" id="chapter-body"></main>
    </div>
  `);
  app.appendChild(loadingWrapper);
  app.querySelector("#back-btn").addEventListener("click", () => goBibleChapters(bookId));

  await ensureBibleFullLoaded();
  const expectedHash = "#/bible/" + bookId + "/" + chapterNum;
  if (location.hash !== expectedHash) return; // navigated elsewhere while loading

  const book = BIBLE_FULL.find((b) => b.id === bookId);
  if (!book || !book.chapters[chapterNum - 1]) {
    goRead();
    return;
  }
  const verses = book.chapters[chapterNum - 1];
  const totalChapters = book.chapters.length;
  app.querySelector("h2").textContent = `${book.name} ${chapterNum}`;

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
          <div class="scripture-block has-favorite" data-verse="${v.n}">
            <span class="verse-number">${v.n}</span>
            <button class="icon-btn favorite-btn ${isVerseFavorited(bookId, chapterNum, v.n) ? "favorited" : ""}" data-verse-num="${v.n}" aria-label="Favorite this verse">${isVerseFavorited(bookId, chapterNum, v.n) ? "★" : "☆"}</button>
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

  body.querySelectorAll(".favorite-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const verseNum = Number(btn.dataset.verseNum);
      const verse = verses.find((v) => v.n === verseNum);
      const nowFavorited = toggleFavoriteVerse(book, chapterNum, verse);
      btn.textContent = nowFavorited ? "★" : "☆";
      btn.classList.toggle("favorited", nowFavorited);
    });
  });

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

  // --- Granular reading position: track scroll %, resume near it next time ---
  if (!isChapterRead(bookId, chapterNum)) {
    let saveTimer = null;
    activeScrollHandler = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const percent = scrollable > 0 ? Math.round((window.scrollY / scrollable) * 100) : 0;
        saveChapterPercent(bookId, chapterNum, Math.min(percent, 99)); // 100% is reserved for "Mark as Read"
      }, 400);
    };
    window.addEventListener("scroll", activeScrollHandler);

    const savedPercent = getChapterPercent(bookId, chapterNum);
    if (savedPercent > 0) {
      requestAnimationFrame(() => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        if (scrollable > 0) window.scrollTo(0, (savedPercent / 100) * scrollable);
      });
    }
  }
}

// ---------- Chinese Basics (list + lesson) ----------
function renderBasicsList() {
  stopDialogue();
  app.innerHTML = "";
  const wrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Back to home">←</button>
        <h2 style="margin:0;font-size:1.1rem;">Chinese Basics</h2>
      </div>
      <main class="screen" id="basics-body"></main>
    </div>
  `);
  app.appendChild(wrapper);
  app.querySelector("#back-btn").addEventListener("click", goHome);

  const doneCount = progress.basicsCompleted.length;
  const pct = Math.round((doneCount / BASICS.length) * 100);
  const body = app.querySelector("#basics-body");
  body.innerHTML = `
    <p class="muted" style="margin-bottom:16px;">
      A short, optional primer for anyone brand new to Mandarin — tones, pinyin, and the core grammar patterns
      that show up in every lesson. If you already have these foundations, feel free to skip straight to the
      main lessons on Home.
    </p>
    <div class="card" style="margin-bottom:16px;">
      <p class="eyebrow">Basics Progress</p>
      <h3 style="margin:6px 0 10px;">${doneCount} of ${BASICS.length} complete</h3>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="card explore-card" id="placement-test-card" style="margin-bottom:20px;">
      <p class="eyebrow">Already know some Chinese?</p>
      <h3 style="margin:6px 0 4px;">Take a quick placement check</h3>
      <p class="muted" style="margin-bottom:12px;">8 questions, one per lesson below. Get a question right and that lesson is marked complete — so you only spend time on what's actually new to you.</p>
      <button class="btn btn-secondary btn-block" id="placement-test-btn">Start Placement Check</button>
    </div>
    <div class="lesson-list" id="basics-list"></div>
  `;
  body.querySelector("#placement-test-btn").addEventListener("click", () => renderBasicsPlacementTest());

  const list = body.querySelector("#basics-list");
  BASICS.forEach((b) => {
    const done = isBasicsCompleted(b.id);
    const unlocked = isBasicsUnlocked(b.id);
    const inProgress = isBasicsInProgress(b.id);
    const pct = inProgress
      ? Math.round(((progress.basicsLessonProgress[b.id] || 0) / basicsExplainStepCount(b)) * 100)
      : 0;
    const btn = el(`
      <button class="lesson-card ${done ? "done" : ""} ${inProgress ? "in-progress" : ""}" ${unlocked ? "" : "disabled"}>
        <div class="lesson-num">${done ? "✓" : b.id}</div>
        <div class="lesson-info">
          <h3>${b.title}</h3>
          <p class="zh">${b.subtitle}</p>
          ${inProgress ? `<div class="progress-track" style="margin-top:6px;"><div class="progress-fill" style="width:${pct}%"></div></div>` : ""}
        </div>
        <div class="lesson-status">${done ? "Completed" : inProgress ? "Continue" : unlocked ? "Start" : "Locked"}</div>
      </button>
    `);
    if (unlocked) btn.addEventListener("click", () => goBasicsLesson(b.id));
    list.appendChild(btn);
  });
}

// ---------- Basics placement test ----------
// Diagnostic only, not a teaching moment: single-attempt questions, no
// retry loop. Reuses each lesson's own first practice question rather
// than authoring separate diagnostic content.
function renderBasicsPlacementTest() {
  stopDialogue();
  const questions = BASICS.map((b) => ({ lessonId: b.id, lessonTitle: b.title, ...b.practice[0] }));
  renderPlacementQuestion(questions, { index: 0, results: {} });
}

function renderPlacementQuestion(questions, state) {
  if (state.index >= questions.length) {
    renderPlacementResults(questions, state);
    return;
  }
  const q = questions[state.index];
  const options = shuffle(q.options);

  app.innerHTML = "";
  const wrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Cancel placement check">←</button>
        <div class="progress-track"><div class="progress-fill" style="width:${Math.round(
          (state.index / questions.length) * 100
        )}%"></div></div>
      </div>
      <main class="screen" id="placement-body"></main>
    </div>
  `);
  app.appendChild(wrapper);
  app.querySelector("#back-btn").addEventListener("click", renderBasicsList);

  const body = app.querySelector("#placement-body");
  body.innerHTML = `
    <div class="step-section">
      <p class="eyebrow step-eyebrow">Question ${state.index + 1} of ${questions.length} · ${q.lessonTitle}</p>
      <h2 style="margin-bottom:16px;">${q.question}</h2>
      <div class="quiz-options" id="placement-options">
        ${options
          .map((opt) => `<button class="option-btn zh" data-opt="${escapeAttr(opt)}">${opt}</button>`)
          .join("")}
      </div>
      <p class="feedback-text" id="placement-feedback" aria-live="polite"></p>
    </div>
    <div class="sticky-footer" id="placement-footer"></div>
  `;
  const buttons = [...body.querySelectorAll(".option-btn")];
  const feedback = body.querySelector("#placement-feedback");
  const footer = body.querySelector("#placement-footer");
  let selected = null;

  function renderConfirmBtn() {
    footer.innerHTML = `<button class="btn btn-primary" id="placement-confirm-btn" ${selected ? "" : "disabled"}>Confirm Answer</button>`;
    footer.querySelector("#placement-confirm-btn").addEventListener("click", confirmAnswer);
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      selected = btn.dataset.opt;
      buttons.forEach((b) => b.classList.toggle("selected", b.dataset.opt === selected));
      renderConfirmBtn();
    });
  });
  renderConfirmBtn();

  function confirmAnswer() {
    const isRight = selected === q.answer;
    buttons.forEach((b) => {
      b.disabled = true;
      b.classList.remove("selected");
      if (b.dataset.opt === q.answer) b.classList.add("correct");
      else if (b.dataset.opt === selected) b.classList.add("incorrect");
    });
    if (isRight) AudioFX.correct();
    else AudioFX.incorrect();
    feedback.textContent = isRight ? "Correct!" : `The answer was "${q.answer}."`;
    feedback.classList.add(isRight ? "correct" : "incorrect");
    state.results[q.lessonId] = isRight;

    footer.innerHTML = `<button class="btn btn-primary" id="placement-next-btn">${
      state.index + 1 < questions.length ? "Next" : "See Results"
    }</button>`;
    footer.querySelector("#placement-next-btn").addEventListener("click", () => {
      state.index++;
      renderPlacementQuestion(questions, state);
    });
  }
}

function renderPlacementResults(questions, state) {
  const known = questions.filter((q) => state.results[q.lessonId]);
  const stillNew = questions.filter((q) => !state.results[q.lessonId]);
  known.forEach((q) => markBasicsCompleted(q.lessonId));

  app.innerHTML = "";
  app.appendChild(
    el(`
    <main class="screen complete-screen">
      <div class="complete-badge">✓</div>
      <h1>Placement Check Done</h1>
      <p class="muted" style="margin:12px 0 20px;">
        ${
          known.length > 0
            ? `${known.length} of ${questions.length} lesson${
                known.length > 1 ? "s" : ""
              } marked complete — you already know that material.`
            : "Looks like these will all be genuinely new to you — that's exactly what Basics is for."
        }
      </p>
      ${
        stillNew.length > 0
          ? `<p class="muted" style="margin-bottom:32px;">Still worth going through: ${stillNew
              .map((q) => q.lessonTitle)
              .join(", ")}.</p>`
          : `<p class="muted" style="margin-bottom:32px;">You're set — head back to Home whenever you're ready.</p>`
      }
      <button class="btn btn-primary" id="placement-done-btn">Back to Basics</button>
    </main>
  `)
  );
  app.querySelector("#placement-done-btn").addEventListener("click", renderBasicsList);
}

function renderBasicsLesson(id) {
  stopDialogue();
  const b = BASICS.find((x) => x.id === id);
  if (!b) {
    goBasics();
    return;
  }
  const totalExplainSteps = basicsExplainStepCount(b);
  const savedStep = isBasicsCompleted(id) ? 0 : progress.basicsLessonProgress[id] || 0;
  let state;
  if (savedStep >= totalExplainSteps) {
    const queue = shuffle(b.practice);
    state = {
      phase: "practice",
      queue,
      numbering: new Map(queue.map((q, i) => [q, i + 1])),
      resolved: new Set(),
      wrongOptions: new Map(),
    };
  } else {
    state = { phase: "explain", explainStep: savedStep };
  }
  renderBasicsPhase(b, state);
}

function renderBasicsPhase(b, state) {
  if (state.phase === "explain") {
    saveBasicsStepProgress(b.id, state.explainStep);
    renderBasicsExplainStep(b, state);
    return;
  }

  if (state.phase === "practice") {
    saveBasicsStepProgress(b.id, basicsExplainStepCount(b)); // explain fully done
    renderBasicsPracticeQuestion(b, state);
    return;
  }

  // phase === "done"
  markBasicsCompleted(b.id);
  delete progress.basicsLessonProgress[b.id]; // no longer "in progress" once done
  saveProgress(); // markBasicsCompleted already saved, but before this delete — save again
  AudioFX.lessonComplete();
  app.innerHTML = "";
  app.appendChild(
    el(`
    <main class="screen complete-screen">
      <div class="complete-badge">✓</div>
      <h1>${b.title} — Done</h1>
      <p class="muted" style="margin:12px 0 32px;">Nicely done. On to the next one whenever you're ready.</p>
      <button class="btn btn-primary" id="basics-home-btn">Back to Basics</button>
    </main>
  `)
  );
  app.querySelector("#basics-home-btn").addEventListener("click", goBasics);
}

// One point at a time: intro, then each of b.points individually, then all
// examples together (comparison value is high there — e.g. seeing all four
// tone examples side by side). This is the guided version of what used to
// be a single long scrolling screen with everything dumped at once.
function renderBasicsExplainStep(b, state) {
  const total = basicsExplainStepCount(b);
  const step = state.explainStep;

  app.innerHTML = "";
  const wrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Back to Basics">←</button>
        <div class="progress-track"><div class="progress-fill" style="width:${Math.round((step / total) * 100)}%"></div></div>
      </div>
      <main class="screen" id="basics-explain-body"></main>
    </div>
  `);
  app.appendChild(wrapper);
  app.querySelector("#back-btn").addEventListener("click", goBasics);

  const body = app.querySelector("#basics-explain-body");
  const isIntro = step === 0;
  const isExamples = step === total - 1;
  const pointIndex = step - 1; // only meaningful when neither isIntro nor isExamples

  let contentHtml, nextLabel;
  if (isIntro) {
    contentHtml = `
      <p class="eyebrow step-eyebrow">${b.subtitle}</p>
      <p class="scenario-text">${b.explanation}</p>
    `;
    nextLabel = "Start";
  } else if (isExamples) {
    contentHtml = `
      <p class="eyebrow step-eyebrow">Examples</p>
      <div class="vocab-grid">
        ${b.examples
          .map(
            (ex) => `
          <div class="vocab-card">
            <div class="vocab-top">
              <span class="zh">${ex.chinese}</span>
              <span class="vocab-pinyin">${ex.pinyin}</span>
              ${
                Speech.supported
                  ? `<button class="icon-btn option-speak-btn" data-speak="${escapeAttr(ex.chinese)}" aria-label="Hear this">🔊</button>`
                  : ""
              }
            </div>
            <div class="vocab-en">${ex.english}</div>
            ${ex.note ? `<div class="vocab-note">${ex.note}</div>` : ""}
          </div>
        `
          )
          .join("")}
      </div>
    `;
    nextLabel = "Practice";
  } else {
    const p = b.points[pointIndex];
    contentHtml = `
      <p class="eyebrow step-eyebrow">${b.subtitle} · ${pointIndex + 1} of ${b.points.length}</p>
      <div class="help-item">
        <h3 style="font-size:1.15rem;">${p.label}</h3>
        <p class="muted" style="font-size:1rem;">${p.detail}</p>
      </div>
    `;
    nextLabel = "Next";
  }

  body.innerHTML = `
    <div class="step-section">${contentHtml}</div>
    <div class="sticky-footer">
      <button class="btn btn-primary" id="basics-explain-next-btn">${nextLabel}</button>
    </div>
  `;
  body.querySelectorAll(".option-speak-btn").forEach((btn) => {
    btn.addEventListener("click", () => Speech.speak(btn.dataset.speak, "zh-CN"));
  });
  body.querySelector("#basics-explain-next-btn").addEventListener("click", () => {
    if (isExamples) {
      const queue = shuffle(b.practice);
      state.phase = "practice";
      state.queue = queue;
      state.numbering = new Map(queue.map((q, i) => [q, i + 1]));
      state.resolved = new Set();
      state.wrongOptions = new Map();
    } else {
      state.explainStep++;
    }
    renderBasicsPhase(b, state);
  });
}

function renderBasicsPracticeQuestion(b, state) {
  if (state.queue.length === 0) {
    state.phase = "done";
    renderBasicsPhase(b, state);
    return;
  }
  const q = state.queue[0];
  const isReview = state.wrongOptions.has(q);
  const eliminated = state.wrongOptions.get(q) || new Set();
  const options = shuffle(q.options);

  app.innerHTML = "";
  const wrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Back to Basics">←</button>
        <div class="progress-track"><div class="progress-fill" style="width:${Math.round(
          (state.resolved.size / state.numbering.size) * 100
        )}%"></div></div>
      </div>
      <main class="screen" id="basics-practice-body"></main>
    </div>
  `);
  app.appendChild(wrapper);
  app.querySelector("#back-btn").addEventListener("click", goBasics);

  const body = app.querySelector("#basics-practice-body");
  body.innerHTML = `
    <div class="step-section">
      <p class="eyebrow step-eyebrow">${
        isReview ? "Let's try that one again" : `Question ${state.numbering.get(q)} of ${state.numbering.size}`
      }</p>
      <h2 style="margin-bottom:16px;">${q.question}</h2>
      <div class="quiz-options" id="basics-options">
        ${options
          .map((opt) => {
            const isEliminated = eliminated.has(opt);
            return `<button class="option-btn zh${isEliminated ? " eliminated" : ""}" data-opt="${escapeAttr(opt)}" ${
              isEliminated ? "disabled" : ""
            }>${opt}</button>`;
          })
          .join("")}
      </div>
      <p class="feedback-text" id="basics-feedback" aria-live="polite"></p>
    </div>
    <div class="sticky-footer" id="basics-footer"></div>
  `;

  const optionButtons = [...body.querySelectorAll(".option-btn:not(.eliminated)")];
  const feedback = body.querySelector("#basics-feedback");
  const footer = body.querySelector("#basics-footer");
  let selected = null;

  function renderConfirmBtn() {
    footer.innerHTML = `<button class="btn btn-primary" id="basics-confirm-btn" ${selected ? "" : "disabled"}>Confirm Answer</button>`;
    footer.querySelector("#basics-confirm-btn").addEventListener("click", confirmAnswer);
  }

  optionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      selected = btn.dataset.opt;
      optionButtons.forEach((b) => b.classList.toggle("selected", b.dataset.opt === selected));
      renderConfirmBtn();
    });
  });
  renderConfirmBtn();

  function confirmAnswer() {
    const isRight = selected === q.answer;
    optionButtons.forEach((b) => {
      b.disabled = true;
      b.classList.remove("selected");
      if (isRight && b.dataset.opt === q.answer) b.classList.add("correct");
      else if (!isRight && b.dataset.opt === selected) b.classList.add("incorrect");
    });
    if (isRight) {
      AudioFX.correct();
      feedback.textContent = "Correct!";
      feedback.classList.add("correct");
      state.resolved.add(q);
      state.queue.shift();
    } else {
      AudioFX.incorrect();
      feedback.textContent = "Not quite — give it another try.";
      feedback.classList.add("incorrect");
      if (!state.wrongOptions.has(q)) state.wrongOptions.set(q, new Set());
      state.wrongOptions.get(q).add(selected);
      state.queue.shift();
      state.queue.push(q);
    }
    footer.innerHTML = `<button class="btn btn-primary" id="basics-next-btn">Continue</button>`;
    footer.querySelector("#basics-next-btn").addEventListener("click", () => {
      renderBasicsPracticeQuestion(b, state);
    });
  }
}

// ---------- Share Your Faith / Proclaim (list + lesson) ----------
function renderProclaimList() {
  stopDialogue();
  app.innerHTML = "";
  const wrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Back to home">←</button>
        <h2 style="margin:0;font-size:1.1rem;">Share Your Faith</h2>
      </div>
      <main class="screen" id="proclaim-body"></main>
    </div>
  `);
  app.appendChild(wrapper);
  app.querySelector("#back-btn").addEventListener("click", goHome);

  const doneCount = progress.proclaimCompleted.length;
  const pct = Math.round((doneCount / PROCLAIM.length) * 100);
  const body = app.querySelector("#proclaim-body");
  body.innerHTML = `
    <p class="muted" style="margin-bottom:16px;">
      Conversations trade turns — testifying, preaching, and sharing the gospel don't. This is about producing
      sustained speech: your own testimony, a memorable gospel sequence, real objections you'll actually hear,
      and following a real sermon at natural length.
    </p>
    <div class="card" style="margin-bottom:20px;">
      <p class="eyebrow">Progress</p>
      <h3 style="margin:6px 0 10px;">${doneCount} of ${PROCLAIM.length} complete</h3>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="lesson-list" id="proclaim-list"></div>
  `;

  const list = body.querySelector("#proclaim-list");
  PROCLAIM.forEach((p) => {
    const done = isProclaimCompleted(p.id);
    const unlocked = isProclaimUnlocked(p.id);
    const inProgress = isProclaimInProgress(p.id);
    const pct = inProgress
      ? Math.round(((progress.proclaimLessonProgress[p.id] || 0) / proclaimExplainStepCount(p)) * 100)
      : 0;
    const btn = el(`
      <button class="lesson-card ${done ? "done" : ""} ${inProgress ? "in-progress" : ""}" ${unlocked ? "" : "disabled"}>
        <div class="lesson-num">${done ? "✓" : PROCLAIM.indexOf(p) + 1}</div>
        <div class="lesson-info">
          <h3>${p.title}</h3>
          <p class="zh">${p.subtitle}</p>
          ${inProgress ? `<div class="progress-track" style="margin-top:6px;"><div class="progress-fill" style="width:${pct}%"></div></div>` : ""}
        </div>
        <div class="lesson-status">${done ? "Completed" : inProgress ? "Continue" : unlocked ? "Start" : "Locked"}</div>
      </button>
    `);
    if (unlocked) btn.addEventListener("click", () => goProclaimLesson(p.id));
    list.appendChild(btn);
  });
}

function renderProclaimLesson(id) {
  stopDialogue();
  const p = PROCLAIM.find((x) => x.id === id);
  if (!p) {
    goProclaim();
    return;
  }
  const total = proclaimExplainStepCount(p);
  const savedStep = isProclaimCompleted(id) ? 0 : progress.proclaimLessonProgress[id] || 0;
  let state;
  if (savedStep >= total) {
    const queue = shuffle(p.practice);
    state = {
      phase: "practice",
      queue,
      numbering: new Map(queue.map((q, i) => [q, i + 1])),
      resolved: new Set(),
      wrongOptions: new Map(),
    };
  } else {
    state = { phase: "explain", explainStep: savedStep };
  }
  renderProclaimPhase(p, state);
}

function renderProclaimPhase(p, state) {
  if (state.phase === "explain") {
    saveProclaimStepProgress(p.id, state.explainStep);
    renderProclaimExplainStep(p, state);
    return;
  }

  if (state.phase === "practice") {
    saveProclaimStepProgress(p.id, proclaimExplainStepCount(p)); // explain fully done
    renderProclaimPracticeQuestion(p, state);
    return;
  }

  // phase === "done"
  markProclaimCompleted(p.id);
  delete progress.proclaimLessonProgress[p.id]; // no longer "in progress" once done
  saveProgress(); // markProclaimCompleted already saved, but before this delete — save again
  AudioFX.lessonComplete();
  app.innerHTML = "";
  app.appendChild(
    el(`
    <main class="screen complete-screen">
      <div class="complete-badge">✓</div>
      <h1>${p.title} — Done</h1>
      <p class="muted" style="margin:12px 0 32px;">Well done. On to the next one whenever you're ready.</p>
      <button class="btn btn-primary" id="proclaim-home-btn">Back to Share Your Faith</button>
    </main>
  `)
  );
  app.querySelector("#proclaim-home-btn").addEventListener("click", goProclaim);
}

// Guided, one step at a time: intro, then each point individually, then
// examples/verse-sequence, then (lesson 2 only) the free-text "Your Turn"
// reflection — before finally moving into practice questions.
function renderProclaimExplainStep(p, state) {
  const total = proclaimExplainStepCount(p);
  const step = state.explainStep;
  const contentStepIndex = p.yourTurn ? total - 2 : total - 1; // examples/sequence step
  const isIntro = step === 0;
  const isExamples = step === contentStepIndex;
  const isYourTurn = !!p.yourTurn && step === total - 1;
  const pointIndex = step - 1;

  app.innerHTML = "";
  const wrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Back to Share Your Faith">←</button>
        <div class="progress-track"><div class="progress-fill" style="width:${Math.round((step / total) * 100)}%"></div></div>
      </div>
      <main class="screen" id="proclaim-explain-body"></main>
    </div>
  `);
  app.appendChild(wrapper);
  app.querySelector("#back-btn").addEventListener("click", goProclaim);
  const body = app.querySelector("#proclaim-explain-body");

  if (isIntro) {
    body.innerHTML = `
      <div class="step-section">
        <p class="eyebrow step-eyebrow">${p.subtitle}</p>
        <p class="scenario-text">${p.explanation}</p>
      </div>
      <div class="sticky-footer">
        <button class="btn btn-primary" id="proclaim-explain-next-btn">Start</button>
      </div>
    `;
  } else if (isYourTurn) {
    body.innerHTML = `
      <div class="step-section">
        <p class="eyebrow step-eyebrow">Your Turn</p>
        <p class="muted" style="margin-bottom:16px;">${p.yourTurn.prompt}</p>
        <div class="card" style="margin-bottom:16px;">
          <p class="eyebrow" style="margin-bottom:8px;">Scaffold</p>
          <p class="zh muted" style="white-space:pre-line;line-height:1.8;">${p.yourTurn.scaffold}</p>
        </div>
        <textarea id="testimony-textarea" class="explore-search" style="width:100%;min-height:140px;text-align:left;resize:vertical;" placeholder="Write in Chinese, pinyin, or English — whatever helps you think it through.">${progress.myTestimony || ""}</textarea>
        <p class="muted" style="font-size:0.8rem;margin-top:6px;">Saved automatically on this device. Not graded — just yours.</p>
      </div>
      <div class="sticky-footer">
        <button class="btn btn-primary" id="proclaim-explain-next-btn">Continue to Practice</button>
      </div>
    `;
    const textarea = body.querySelector("#testimony-textarea");
    textarea.addEventListener("input", () => saveMyTestimony(textarea.value));
  } else if (isExamples) {
    const examplesHtml = p.isVerseSequence
      ? `<div id="verse-list">
          ${p.examples
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
        ${
          Speech.supported
            ? `<button class="btn btn-secondary" id="play-sequence-btn" style="margin-top:12px;">▶ Play in Order</button>`
            : ""
        }`
      : `<div class="vocab-grid">
          ${p.examples
            .map(
              (ex) => `
            <div class="vocab-card">
              <div class="vocab-top">
                <span class="zh">${ex.chinese}</span>
                <span class="vocab-pinyin">${ex.pinyin}</span>
                ${
                  Speech.supported
                    ? `<button class="icon-btn option-speak-btn" data-speak="${escapeAttr(ex.chinese)}" aria-label="Hear this">🔊</button>`
                    : ""
                }
              </div>
              <div class="vocab-en">${ex.english}</div>
              ${ex.note ? `<div class="vocab-note">${ex.note}</div>` : ""}
            </div>
          `
            )
            .join("")}
        </div>`;
    body.innerHTML = `
      <div class="step-section">
        <p class="eyebrow step-eyebrow">${p.isVerseSequence ? "The Sequence" : "Examples"}</p>
        ${examplesHtml}
      </div>
      <div class="sticky-footer">
        <button class="btn btn-primary" id="proclaim-explain-next-btn">${p.yourTurn ? "Your Turn" : "Practice"}</button>
      </div>
    `;
    body.querySelectorAll(".option-speak-btn").forEach((btn) => {
      btn.addEventListener("click", () => Speech.speak(btn.dataset.speak, "zh-CN"));
    });
    const playSeqBtn = body.querySelector("#play-sequence-btn");
    if (playSeqBtn) {
      playSeqBtn.addEventListener("click", async () => {
        if (dialoguePlaying) {
          stopDialogue();
          playSeqBtn.textContent = "▶ Play in Order";
          return;
        }
        dialoguePlaying = true;
        playSeqBtn.textContent = "⏸ Stop";
        const blocks = [...body.querySelectorAll(".scripture-block")];
        for (const v of p.examples) {
          if (!dialoguePlaying) break;
          const block = blocks.find((b) => b.dataset.verse === String(v.number));
          block?.classList.add("speaking");
          await Speech.speak(v.chinese, "zh-CN");
          block?.classList.remove("speaking");
          await new Promise((r) => setTimeout(r, 250));
        }
        dialoguePlaying = false;
        playSeqBtn.textContent = "▶ Play in Order";
      });
    }
  } else {
    const pt = p.points[pointIndex];
    body.innerHTML = `
      <div class="step-section">
        <p class="eyebrow step-eyebrow">${p.subtitle} · ${pointIndex + 1} of ${p.points.length}</p>
        <div class="help-item">
          <h3 style="font-size:1.15rem;">${pt.label}</h3>
          <p class="muted" style="font-size:1rem;">${pt.detail}</p>
        </div>
      </div>
      <div class="sticky-footer">
        <button class="btn btn-primary" id="proclaim-explain-next-btn">Next</button>
      </div>
    `;
  }

  body.querySelector("#proclaim-explain-next-btn").addEventListener("click", () => {
    const isLastExplainStep = isYourTurn || (isExamples && !p.yourTurn);
    if (isLastExplainStep) {
      const queue = shuffle(p.practice);
      state.phase = "practice";
      state.queue = queue;
      state.numbering = new Map(queue.map((q, i) => [q, i + 1]));
      state.resolved = new Set();
      state.wrongOptions = new Map();
    } else {
      state.explainStep++;
    }
    renderProclaimPhase(p, state);
  });
}


function renderProclaimPracticeQuestion(p, state) {
  if (state.queue.length === 0) {
    state.phase = "done";
    renderProclaimPhase(p, state);
    return;
  }
  const q = state.queue[0];
  const isReview = state.wrongOptions.has(q);
  const eliminated = state.wrongOptions.get(q) || new Set();
  const options = shuffle(q.options);

  app.innerHTML = "";
  const wrapper = el(`
    <div>
      <div class="lesson-header">
        <button class="icon-btn" id="back-btn" aria-label="Back to Share Your Faith">←</button>
        <div class="progress-track"><div class="progress-fill" style="width:${Math.round(
          (state.resolved.size / state.numbering.size) * 100
        )}%"></div></div>
      </div>
      <main class="screen" id="proclaim-practice-body"></main>
    </div>
  `);
  app.appendChild(wrapper);
  app.querySelector("#back-btn").addEventListener("click", goProclaim);

  const body = app.querySelector("#proclaim-practice-body");
  body.innerHTML = `
    <div class="step-section">
      <p class="eyebrow step-eyebrow">${
        isReview ? "Let's try that one again" : `Question ${state.numbering.get(q)} of ${state.numbering.size}`
      }</p>
      <h2 style="margin-bottom:16px;">${q.question}</h2>
      <div class="quiz-options" id="proclaim-options">
        ${options
          .map((opt) => {
            const isEliminated = eliminated.has(opt);
            return `<button class="option-btn zh${isEliminated ? " eliminated" : ""}" data-opt="${escapeAttr(
              opt
            )}" ${isEliminated ? "disabled" : ""}>${opt}</button>`;
          })
          .join("")}
      </div>
      <p class="feedback-text" id="proclaim-feedback" aria-live="polite"></p>
    </div>
    <div class="sticky-footer" id="proclaim-footer"></div>
  `;

  const optionButtons = [...body.querySelectorAll(".option-btn:not(.eliminated)")];
  const feedback = body.querySelector("#proclaim-feedback");
  const footer = body.querySelector("#proclaim-footer");
  let selected = null;

  function renderConfirmBtn() {
    footer.innerHTML = `<button class="btn btn-primary" id="proclaim-confirm-btn" ${selected ? "" : "disabled"}>Confirm Answer</button>`;
    footer.querySelector("#proclaim-confirm-btn").addEventListener("click", confirmAnswer);
  }

  optionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      selected = btn.dataset.opt;
      optionButtons.forEach((b) => b.classList.toggle("selected", b.dataset.opt === selected));
      renderConfirmBtn();
    });
  });
  renderConfirmBtn();

  function confirmAnswer() {
    const isRight = selected === q.answer;
    optionButtons.forEach((b) => {
      b.disabled = true;
      b.classList.remove("selected");
      if (isRight && b.dataset.opt === q.answer) b.classList.add("correct");
      else if (!isRight && b.dataset.opt === selected) b.classList.add("incorrect");
    });
    if (isRight) {
      AudioFX.correct();
      feedback.textContent = "Correct!";
      feedback.classList.add("correct");
      state.resolved.add(q);
      state.queue.shift();
    } else {
      AudioFX.incorrect();
      feedback.textContent = "Not quite — give it another try.";
      feedback.classList.add("incorrect");
      if (!state.wrongOptions.has(q)) state.wrongOptions.set(q, new Set());
      state.wrongOptions.get(q).add(selected);
      state.queue.shift();
      state.queue.push(q);
    }
    footer.innerHTML = `<button class="btn btn-primary" id="proclaim-next-btn">Continue</button>`;
    footer.querySelector("#proclaim-next-btn").addEventListener("click", () => {
      renderProclaimPracticeQuestion(p, state);
    });
  }
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
// ---------- First-launch name modal ----------
function renderNameModal(onDone) {
  const overlay = el(`
    <div class="modal-overlay" id="name-modal-overlay">
      <div class="modal-card">
        <span class="brand-mark zh" style="display:inline-flex;width:44px;height:44px;font-size:1.3rem;margin-bottom:14px;">语</span>
        <h2 style="margin-bottom:6px;">Welcome to Koinect</h2>
        <p class="muted" style="margin-bottom:20px;">Input Name for this Learning Journey</p>
        <input type="text" id="name-modal-input" class="explore-search" style="margin-bottom:8px;text-align:center;" placeholder="Your name" maxlength="40">
        <p class="feedback-text incorrect" id="name-modal-error" style="min-height:1.2em;margin-bottom:8px;"></p>
        <button class="btn btn-primary" id="name-modal-start-btn">Start My Journey</button>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);

  const input = overlay.querySelector("#name-modal-input");
  const error = overlay.querySelector("#name-modal-error");
  input.focus();

  function attemptFinish() {
    const name = input.value.trim();
    if (!name) {
      error.textContent = "Please enter a name to continue.";
      input.focus();
      return;
    }
    progress.userName = name.slice(0, 40);
    progress.nameOnboardingSeen = true;
    saveProgress();
    overlay.remove();
    onDone();
  }

  overlay.querySelector("#name-modal-start-btn").addEventListener("click", attemptFinish);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") attemptFinish();
  });
  input.addEventListener("input", () => {
    if (error.textContent) error.textContent = "";
  });
}

async function boot() {
  try {
    const [lessonsRes, referenceRes, highlightsRes, basicsRes, proclaimRes] = await Promise.all([
      fetch("data/lessons.json"),
      fetch("data/reference.json"),
      fetch("data/highlights.json"),
      fetch("data/basics.json"),
      fetch("data/proclaim.json"),
    ]);
    const data = await lessonsRes.json();
    LESSONS = data.lessons;
    REFERENCE = (await referenceRes.json()).categories;
    HIGHLIGHTS = (await highlightsRes.json()).highlights;
    BASICS = (await basicsRes.json()).basics;
    PROCLAIM = (await proclaimRes.json()).proclaim;
    buildVocabIndex();
    updateStreak();
    await Speech.ready();
    if (!progress.nameOnboardingSeen) {
      renderNameModal(() => route());
    } else {
      route();
    }
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
