// ===== Koinect — app.js =====
// No frameworks, no build step. Progress is saved to localStorage so
// learners can close the app and continue tomorrow exactly where they left off.

const STORAGE_KEY = "koinect-progress-v1";
const app = document.getElementById("app");

let LESSONS = [];
let progress = loadProgress();

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

  function speak(text, lang = "zh-CN", rate = 0.92) {
    return new Promise((resolve) => {
      if (!supported) {
        resolve();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;
      utterance.onend = resolve;
      utterance.onerror = resolve;
      window.speechSynthesis.speak(utterance);
    });
  }

  function stop() {
    if (supported) window.speechSynthesis.cancel();
  }

  return { supported, speak, stop };
})();

let dialoguePlaying = false;

async function playDialogue(lesson) {
  if (!Speech.supported || dialoguePlaying) return;
  dialoguePlaying = true;
  const btn = app.querySelector("#play-dialogue-btn");
  if (btn) btn.textContent = "⏸ Stop";

  const lines = [...app.querySelectorAll(".dialogue-line")];
  for (let i = 0; i < lesson.dialogue.length; i++) {
    if (!dialoguePlaying) break; // stopped by the user mid-playback
    lines[i]?.classList.add("speaking");
    await Speech.speak(lesson.dialogue[i].chinese, "zh-CN");
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
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Could not read saved progress, starting fresh.", e);
  }
  return {
    completedLessons: [],
    lastVisitDate: null,
    streak: 0,
    vocabReview: {}, // chinese word -> { box: 1-5, nextReview: "YYYY-MM-DD" }
    dismissedChallenges: [], // lesson ids whose challenge card has been marked done
  };
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

function buildVocabIndex() {
  vocabIndex = new Map();
  LESSONS.forEach((lesson) => {
    lesson.vocabulary.forEach((v) => {
      if (!vocabIndex.has(v.chinese)) vocabIndex.set(v.chinese, v);
    });
  });
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
  if (hash === "#/review") {
    renderReviewSession();
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

        <h3 style="margin:24px 0 12px;">All Lessons</h3>
        <div id="lesson-groups"></div>
      </main>
    </div>
  `)
  );

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
    renderLessonShell(
      lesson,
      state,
      `
      <div class="step-section">
        <p class="eyebrow step-eyebrow">New Words</p>
        <div class="vocab-grid">
          ${lesson.vocabulary
            .map(
              (v) => `
            <div class="vocab-card">
              <div class="vocab-top">
                <span class="zh">${v.chinese}</span>
                <span class="vocab-pinyin">${v.pinyin}</span>
              </div>
              <div class="vocab-en">${v.english}</div>
              ${v.note ? `<div class="vocab-note">${v.note}</div>` : ""}
            </div>
          `
            )
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
    const res = await fetch("data/lessons.json");
    const data = await res.json();
    LESSONS = data.lessons;
    buildVocabIndex();
    updateStreak();
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
