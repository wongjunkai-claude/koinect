// ===== Koinect — app.js =====
// No frameworks, no build step. Progress is saved to localStorage so
// learners can close the app and continue tomorrow exactly where they left off.

const STORAGE_KEY = "koinect-progress-v1";
const app = document.getElementById("app");

let LESSONS = [];
let progress = loadProgress();

// ---------- Progress persistence ----------
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Could not read saved progress, starting fresh.", e);
  }
  return { completedLessons: [] };
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (e) {
    console.warn("Could not save progress.", e);
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
  renderHome();
}

// ---------- Home screen ----------
function renderHome() {
  const total = LESSONS.length;
  const doneCount = progress.completedLessons.length;
  const next = nextLessonToDo();

  app.innerHTML = "";
  app.appendChild(
    el(`
    <div>
      <div class="topbar">
        <div class="brand">
          <span class="brand-mark zh">语</span>
          <span>Koinect</span>
        </div>
      </div>

      <div class="journey">
        <h2>Your Journey</h2>
        <div class="journey-path">
          ${["Connect", "Belong", "Grow", "Serve"]
            .map((stage, i) => {
              const state =
                i === 0
                  ? doneCount >= total
                    ? "complete"
                    : "current"
                  : "";
              const dotContent = state === "complete" ? "✓" : i + 1;
              return `<div class="stone ${state}">
                <div class="stone-dot">${dotContent}</div>
                <div class="stone-label">${stage}</div>
              </div>`;
            })
            .join("")}
        </div>
      </div>

      <main class="screen">
        <div class="card" style="margin-bottom:24px;">
          <p class="eyebrow">${doneCount} of ${total} lessons complete</p>
          <h2 style="margin:6px 0 4px;">${
            next ? "Continue learning" : "You've completed every lesson!"
          }</h2>
          <p class="muted" style="margin-bottom:16px;">
            ${
              next
                ? "Lesson " + next.id + " · " + next.title
                : "Come back soon for more lessons."
            }
          </p>
          ${
            next
              ? `<button class="btn btn-primary" id="continue-btn">Continue Lesson ${next.id}</button>`
              : ""
          }
        </div>

        <h3 style="margin-bottom:12px;">All Lessons</h3>
        <div class="lesson-list" id="lesson-list"></div>
      </main>
    </div>
  `)
  );

  const list = app.querySelector("#lesson-list");
  LESSONS.forEach((lesson, i) => {
    const unlocked = isUnlocked(lesson, i);
    const done = isCompleted(lesson.id);
    const btn = el(`
      <button class="lesson-card ${done ? "done" : ""}" ${
      unlocked ? "" : "disabled"
    }>
        <div class="lesson-num">${done ? "✓" : lesson.id}</div>
        <div class="lesson-info">
          <h3>${lesson.title}</h3>
          <p class="zh">${lesson.subtitle}</p>
        </div>
        <div class="lesson-status">${
          done ? "Completed" : unlocked ? "Start" : "Locked"
        }</div>
      </button>
    `);
    if (unlocked) {
      btn.addEventListener("click", () => goLesson(lesson.id));
    }
    list.appendChild(btn);
  });

  const continueBtn = app.querySelector("#continue-btn");
  if (continueBtn) continueBtn.addEventListener("click", () => goLesson(next.id));
}

// ---------- Lesson screen ----------
const STEPS = ["scenario", "dialogue", "vocabulary", "quiz", "challenge"];

function renderLesson(lesson) {
  const state = {
    stepIndex: 0,
    quizIndex: 0,
    quizCorrect: 0,
    quizOrder: shuffle(lesson.quiz),
  };
  renderLessonStep(lesson, state);
}

function lessonProgressPct(state) {
  // Treat quiz as its own sub-progress within the overall step bar.
  const stepWeight = 100 / STEPS.length;
  const stepBase = state.stepIndex * stepWeight;
  if (STEPS[state.stepIndex] === "quiz") {
    const quizPct = (state.quizIndex / state.quizOrder.length) * stepWeight;
    return Math.min(100, stepBase + quizPct);
  }
  return stepBase;
}

function renderLessonShell(lesson, state, bodyHtml) {
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
  app.querySelector("#lesson-body").appendChild(el(bodyHtml));
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
    renderLessonShell(
      lesson,
      state,
      `
      <div class="step-section">
        <p class="eyebrow step-eyebrow">Well done</p>
        <h2 style="margin:8px 0 4px;">You scored ${state.quizCorrect} / ${state.quizOrder.length}</h2>
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
  if (state.quizIndex >= state.quizOrder.length) {
    state.stepIndex++;
    renderLessonStep(lesson, state);
    return;
  }
  const q = state.quizOrder[state.quizIndex];
  const options = shuffle(q.options);

  renderLessonShell(
    lesson,
    state,
    `
    <div class="step-section">
      <p class="eyebrow step-eyebrow">Question ${state.quizIndex + 1} of ${state.quizOrder.length}</p>
      <div class="quiz-question">
        <h2>${q.question}</h2>
      </div>
      <div class="quiz-options" id="quiz-options">
        ${options
          .map((opt) => `<button class="option-btn zh" data-opt="${opt}">${opt}</button>`)
          .join("")}
      </div>
      <p class="feedback-text" id="feedback" aria-live="polite"></p>
    </div>
    <div class="sticky-footer" id="quiz-footer"></div>
  `
  );

  const optionButtons = [...app.querySelectorAll(".option-btn")];
  const feedback = app.querySelector("#feedback");
  const footer = app.querySelector("#quiz-footer");

  optionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const chosen = btn.dataset.opt;
      const isRight = chosen === q.answer;
      optionButtons.forEach((b) => {
        b.disabled = true;
        if (b.dataset.opt === q.answer) b.classList.add("correct");
        else if (b === btn) b.classList.add("incorrect");
      });
      feedback.textContent = isRight
        ? "Correct!"
        : `Not quite — the answer is ${q.answer}.`;
      feedback.classList.add(isRight ? "correct" : "incorrect");
      if (isRight) state.quizCorrect++;

      footer.innerHTML = `<button class="btn btn-primary" id="quiz-next-btn">Continue</button>`;
      app.querySelector("#quiz-next-btn").addEventListener("click", () => {
        state.quizIndex++;
        renderQuizQuestion(lesson, state);
      });
    });
  });
}

function renderLessonComplete(lesson) {
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
