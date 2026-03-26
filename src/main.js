import "mathlive";

import {
  astToLatex,
  astToNotationText,
  evaluateAgainstTruthTable,
  extractVariables,
  gateCountAst,
  parseBooleanExpression,
  randomChallenge,
} from "./booleanEngine.js";

const WORKSHEET_QUESTION_COUNT = 10;
const DEFAULT_WORKSHEET_TITLE = "Boolinator Worksheet";
const JSPDF_MODULE_URL = "https://esm.sh/jspdf@2.5.2?bundle";
const HTML2CANVAS_MODULE_URL = "https://esm.sh/html2canvas@1.4.1?bundle";
const VIEWPORT_SYNC_DELAYS_MS = [50, 150, 300, 500, 800, 1200];
const VIEWPORT_RESIZE_THRESHOLD_PX = 30;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js", {
        updateViaCache: "none",
      });

      // Proactively check for updates on each app load.
      await registration.update().catch(() => {});

      const activateWaitingWorker = () => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      };

      activateWaitingWorker();

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) {
          return;
        }

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            activateWaitingWorker();
          }
        });
      });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        window.location.reload();
      }, { once: true });

      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          registration.update().catch(() => {});
        }
      });
    } catch (error) {
      console.error("Service worker registration failed", error);
    }
  });
}

const root = document.querySelector("#app");

root.innerHTML = `
  <main class="shell">
    <header class="hero panel">
      <img
        class="hero-logo hero-logo-dark"
        src="./images/theBoolinator.png"
        alt="Boolinator"
        decoding="async"
      />
      <div class="hero-copy">
        <h1>Boolinator</h1>
      </div>
      <div class="hero-controls">
        <button id="themeToggle" class="mode-toggle" type="button" aria-label="Toggle theme mode">
          <span class="theme-dark">Dark</span>
          <span class="mode-divider">|</span>
          <span class="theme-light">Light</span>
        </button>
        <button id="notationToggle" class="mode-toggle" type="button" aria-label="Toggle notation mode" title="Switch notation to match exam board style (AQA or OCR)">
          <span class="mode-ocr">OCR</span>
          <span class="mode-divider">|</span>
          <span class="mode-aqa">AQA</span>
        </button>
        <button id="difficultyToggle" class="mode-toggle" type="button" aria-label="Toggle question difficulty" title="Switch generated question difficulty (Advanced or Standard)">
          <span class="mode-hard"><span class="diff-label-full">Advanced</span><span class="diff-label-short">Adv</span></span>
          <span class="mode-divider">|</span>
          <span class="mode-easy"><span class="diff-label-full">Standard</span><span class="diff-label-short">Std</span></span>
        </button>
      </div>
    </header>

    <section class="panel challenge">
      <div class="tile-head">
        <h2><span class="challenge-title-full">Simplify the following Boolean expression</span><span class="challenge-title-short">Simplify</span></h2>
        <div class="tile-actions">
          <button id="worksheetBtn" class="ghost-btn" type="button" title="Generate a worksheet with 10 random questions and answers.">Generate Worksheet</button>
          <button id="newChallengeBtn" class="ghost-btn">New Question</button>
        </div>
      </div>
      <math-field id="challengeField" read-only></math-field>
      <div class="metrics">
        <span id="minimalGateCount"></span>
      </div>
      <div id="submissionHistory" class="submission-history hidden" aria-live="polite"></div>
    </section>

    <section class="panel answer">
      <div class="tile-head answer-head">
        <h2>Enter your next equivalent step</h2>
      </div>
      <p id="notationHelp" class="notation-help"></p>
      <div class="answer-field-wrapper">
        <math-field id="answerField" default-mode="math"></math-field>
        <div id="aqaHint" class="aqa-hint hidden">Press <kbd>&#92;</kbd> to toggle NOTs</div>
      </div>
      <div id="touchKeypad" class="touch-keypad hidden" aria-label="Boolean keypad"></div>
      <div class="actions">
        <div class="actions-left">
          <button id="touchUnwrapCycleBtn" class="ghost-btn touch-unwrap-btn hidden" type="button" title="Highlight the next NOT toggle target in AQA mode.">Cycle</button>
          <button id="touchUnwrapConfirmBtn" class="ghost-btn touch-unwrap-btn hidden" type="button" title="Apply NOT toggle to the currently highlighted target in AQA mode."><span class="overbar-symbol">Toggle</span></button>
        </div>
        <div class="actions-right">
          <button id="resetBtn" class="ghost-btn" title="Reset input to your latest equivalent step, or the original question if no steps exist.">Reset</button>
          <button id="hintBtn" class="ghost-btn" title="Show a hint for the next simplification move.">Hint</button>
          <button id="inputHelpBtn" class="ghost-btn" type="button" title="Open typing help for AQA and OCR symbols and key shortcuts.">Input Help</button>
          <button id="checkBtn" class="primary-btn" title="Check whether your current step is equivalent and uses fewer gates.">Submit</button>
        </div>
      </div>
      <p id="feedbackSummary">Enter an expression and press Submit.</p>
      <div id="feedbackDetails" class="feedback-details"></div>
      <div id="hintArea" class="hint-area hidden">
        <p>Hint</p>
        <math-field id="hintField" read-only></math-field>
        <p id="hintText" class="hint-text"></p>
      </div>
      <p id="inputTip" class="notation-help"></p>
    </section>

    <p class="copyright">&copy; 2026 Neil Kendall</p>
    <p class="more-link">More @ <a href="https://www.korovatron.co.uk" target="_blank" rel="noopener noreferrer">www.korovatron.co.uk</a></p>
  </main>

  <div id="inputHelpModal" class="input-help-modal hidden" role="dialog" aria-modal="true" aria-labelledby="inputHelpTitle">
    <div class="input-help-dialog" role="document">
      <button id="closeInputHelpBtn" class="input-help-close" type="button" aria-label="Close input help">X</button>
      <h3 id="inputHelpTitle">How to type expressions</h3>
      <div id="inputHelpContent" class="input-help-content"></div>
    </div>
  </div>

  <div id="worksheetModal" class="input-help-modal hidden" role="dialog" aria-modal="true" aria-labelledby="worksheetTitle">
    <div class="input-help-dialog worksheet-dialog" role="document">
      <button id="closeWorksheetBtn" class="input-help-close" type="button" aria-label="Close worksheet generator">X</button>
      <h3 id="worksheetTitle">Generate PDF Worksheet</h3>
      <div class="worksheet-modal-copy">
        <p>Generate a worksheet of 10 random questions with answers.</p>
      </div>
      <div class="control-row">
        <label for="worksheetTitleInput">Worksheet title</label>
        <input id="worksheetTitleInput" class="worksheet-title-input" type="text" value="Boolinator Worksheet" maxlength="120" />
      </div>
      <div class="control-row">
        <label for="worksheetNotation">Worksheet notation</label>
        <select id="worksheetNotation">
          <option value="logic">OCR</option>
          <option value="aqa">AQA</option>
        </select>
      </div>
      <div class="control-row">
        <label for="worksheetDifficulty">Worksheet difficulty</label>
        <select id="worksheetDifficulty">
          <option value="easy">Standard</option>
          <option value="mixed">Mixed</option>
          <option value="hard">Advanced</option>
        </select>
      </div>
      <p id="worksheetStatus" class="worksheet-status" aria-live="polite"></p>
      <div class="actions worksheet-actions">
        <button id="worksheetGenerateBtn" class="ghost-btn" type="button">Generate Worksheet</button>
      </div>
    </div>
  </div>

  <div id="worksheetRenderRoot" class="worksheet-render-root" aria-hidden="true"></div>
`;

const themeToggle = document.querySelector("#themeToggle");
const notationToggle = document.querySelector("#notationToggle");
const difficultyToggle = document.querySelector("#difficultyToggle");
const notationHelp = document.querySelector("#notationHelp");
const challengeField = document.querySelector("#challengeField");
const answerPanel = document.querySelector(".panel.answer");
const answerField = document.querySelector("#answerField");
const touchKeypad = document.querySelector("#touchKeypad");
const inputTip = document.querySelector("#inputTip");
const feedbackSummary = document.querySelector("#feedbackSummary");
const feedbackDetails = document.querySelector("#feedbackDetails");
const minimalGateCount = document.querySelector("#minimalGateCount");
const hintArea = document.querySelector("#hintArea");
const hintField = document.querySelector("#hintField");
const hintText = document.querySelector("#hintText");
const submissionHistory = document.querySelector("#submissionHistory");
const inputHelpBtn = document.querySelector("#inputHelpBtn");
const inputHelpModal = document.querySelector("#inputHelpModal");
const inputHelpContent = document.querySelector("#inputHelpContent");
const closeInputHelpBtn = document.querySelector("#closeInputHelpBtn");
const worksheetBtn = document.querySelector("#worksheetBtn");
const worksheetModal = document.querySelector("#worksheetModal");
const worksheetTitleInput = document.querySelector("#worksheetTitleInput");
const worksheetNotation = document.querySelector("#worksheetNotation");
const worksheetDifficulty = document.querySelector("#worksheetDifficulty");
const worksheetStatus = document.querySelector("#worksheetStatus");
const worksheetGenerateBtn = document.querySelector("#worksheetGenerateBtn");
const closeWorksheetBtn = document.querySelector("#closeWorksheetBtn");
const worksheetRenderRoot = document.querySelector("#worksheetRenderRoot");
const touchUnwrapCycleBtn = document.querySelector("#touchUnwrapCycleBtn");
const touchUnwrapConfirmBtn = document.querySelector("#touchUnwrapConfirmBtn");
const aqaHint = document.querySelector("#aqaHint");
let isTouchDevice = detectTouchDevice();

const state = {
  themeId: "dark",
  notationId: "aqa",
  difficultyId: "hard",
  worksheetDifficultyId: "mixed",
  challenge: null,
  solved: false,
  bestEquivalent: null,
  equivalentSubmissions: [],
  pendingTemplateExit: false,
  worksheetGenerating: false,
  unwrapCandidates: [],
  unwrapCandidateIndex: -1,
  unwrapTimeoutId: null,
  unwrapSource: "",
  unwrapFeedbackSnapshot: null,
  unwrapSelectionSnapshot: null,
  suppressAnswerInputHandler: false,
};

let _originalKeybindings = null;
let lastOutsideBlurTimestamp = 0;
let viewportSyncTimeoutIds = [];
let lastKnownViewportHeight = 0;

function isIOSDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const isIOSUA = /iPad|iPhone|iPod/.test(ua);
  const isIPadOSDesktopUA = platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isIOSUA || isIPadOSDesktopUA;
}

function isStandalonePwa() {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches
    || window.matchMedia?.("(display-mode: fullscreen)")?.matches
    || window.navigator.standalone,
  );
}

function isPortraitOrientation() {
  if (typeof window === "undefined") {
    return true;
  }

  if (window.matchMedia?.("(orientation: portrait)")?.matches) {
    return true;
  }

  return window.innerHeight >= window.innerWidth;
}

function readSafeAreaInset(variableName) {
  if (typeof window === "undefined") {
    return 0;
  }

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variableName)
    .trim();
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function computeActualViewportHeight() {
  let viewportHeight = window.visualViewport?.height
    ?? window.innerHeight
    ?? document.documentElement.clientHeight
    ?? 0;

  if (!isIOSDevice() || !isStandalonePwa() || !isPortraitOrientation()) {
    return viewportHeight;
  }

  const safeAreaTop = readSafeAreaInset("--safe-area-top");
  const screenPortraitHeight = Math.max(window.screen?.height ?? 0, window.screen?.width ?? 0);
  const difference = screenPortraitHeight - viewportHeight;

  if (difference > 15 && safeAreaTop > 0) {
    viewportHeight += safeAreaTop;
  }

  return viewportHeight;
}

function applyActualViewportHeight() {
  if (typeof document === "undefined") {
    return;
  }

  const actualHeight = Math.max(0, Math.round(computeActualViewportHeight()));
  document.documentElement.style.setProperty("--actual-vh", `${actualHeight}px`);

  if (lastKnownViewportHeight > 0 && Math.abs(actualHeight - lastKnownViewportHeight) > VIEWPORT_RESIZE_THRESHOLD_PX) {
    window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 50);
  }

  lastKnownViewportHeight = actualHeight;
}

function scheduleViewportHeightStabilization() {
  for (const timeoutId of viewportSyncTimeoutIds) {
    clearTimeout(timeoutId);
  }
  viewportSyncTimeoutIds = [];

  applyActualViewportHeight();

  VIEWPORT_SYNC_DELAYS_MS.forEach((delay, index) => {
    const timeoutId = window.setTimeout(() => {
      applyActualViewportHeight();

      if (index === VIEWPORT_SYNC_DELAYS_MS.length - 1) {
        window.dispatchEvent(new Event("resize"));
      }
    }, delay);

    viewportSyncTimeoutIds.push(timeoutId);
  });
}

function initializeViewportHeightManagement() {
  scheduleViewportHeightStabilization();

  window.addEventListener("resize", applyActualViewportHeight);
  window.addEventListener("orientationchange", () => {
    window.setTimeout(applyActualViewportHeight, 100);
    window.setTimeout(applyActualViewportHeight, 300);
  });
  window.addEventListener("pageshow", scheduleViewportHeightStabilization);

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", applyActualViewportHeight);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void document.body.offsetHeight;
      window.setTimeout(applyActualViewportHeight, 50);
      window.setTimeout(applyActualViewportHeight, 200);
    }
  });
}

function setupIOSRubberBandSuppression() {
  if (!isIOSDevice()) {
    return;
  }

  const pageCanScroll = () => {
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    return (scrollHeight - viewportHeight) > 1;
  };

  window.addEventListener("touchmove", (event) => {
    // Keep gestures like pinch untouched.
    if (event.touches && event.touches.length > 1) {
      return;
    }

    if (pageCanScroll()) {
      return;
    }

    event.preventDefault();
  }, { passive: false, capture: true });
}

function resetAppScrollToTop() {
  const applyReset = () => {
    if (root) {
      root.scrollTop = 0;
      root.scrollLeft = 0;
      try {
        root.scrollTo({ top: 0, left: 0, behavior: "auto" });
      } catch {
        // Older browsers may not support options object.
        root.scrollTo(0, 0);
      }
    }

    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
  };

  applyReset();
  requestAnimationFrame(applyReset);
  setTimeout(applyReset, 40);
}


function hasMathLiveAnswerFocus() {
  return Boolean(answerField?.hasFocus && answerField.hasFocus());
}

function shouldUseCustomTouchKeypad() {
  return detectTouchDevice();
}

function forceAnswerFieldBlurReset() {
  const blurOnce = () => {
    try {
      answerField.blur();
    } catch {
      // Ignore platform-specific blur failures.
    }
  };

  blurOnce();
  requestAnimationFrame(blurOnce);
  setTimeout(blurOnce, 40);
}

initializeTheme();
initializeNotation();
initializeDifficulty();
initializeWorksheetDifficulty();
initializeViewportHeightManagement();
setupMathFields();
setupIOSRubberBandSuppression();
renderThemeToggle();
renderNotationToggle();
renderDifficultyToggle();
bindEvents();
startNewChallenge({ isInitialLoad: true });

function initializeTheme() {
  try {
    const storedTheme = window.localStorage.getItem("boolinator-theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      state.themeId = storedTheme;
    }
  } catch {
    // LocalStorage can be unavailable; default to dark.
  }

  applyTheme();
}

function initializeNotation() {
  try {
    const storedNotation = window.localStorage.getItem("boolinator-notation");
    if (storedNotation === "aqa" || storedNotation === "logic") {
      state.notationId = storedNotation;
    }
  } catch {
    // LocalStorage can be unavailable; default to AQA.
  }
}

function initializeDifficulty() {
  try {
    const storedDifficulty = window.localStorage.getItem("boolinator-difficulty");
    if (storedDifficulty === "easy" || storedDifficulty === "hard") {
      state.difficultyId = storedDifficulty;
    }
  } catch {
    // LocalStorage can be unavailable; default to hard.
  }
}

function initializeWorksheetDifficulty() {
  try {
    const storedDifficulty = window.localStorage.getItem("boolinator-worksheet-difficulty");
    if (storedDifficulty === "easy" || storedDifficulty === "mixed" || storedDifficulty === "hard") {
      state.worksheetDifficultyId = storedDifficulty;
    }
  } catch {
    // LocalStorage can be unavailable; default to mixed.
  }
}

function applyTheme() {
  document.body.setAttribute("data-theme", state.themeId);
}

function setupMathFields() {
  isTouchDevice = detectTouchDevice();
  renderInputHelpButtonVisibility();
  renderInputHelpModalContent();

  challengeField.mathVirtualKeyboardPolicy = "manual";
  hintField.mathVirtualKeyboardPolicy = "manual";
  answerField.defaultMode = "math";
  answerField.setAttribute("default-mode", "math");
  answerField.mathVirtualKeyboardPolicy = "manual";
  answerField.setAttribute("math-virtual-keyboard-policy", "manual");
  answerField.setAttribute("virtual-keyboard-mode", "manual");

  disableMathFieldContextMenu(challengeField);
  disableMathFieldContextMenu(answerField);
  disableMathFieldContextMenu(hintField);
  makeReadonlyMathFieldUnfocusable(challengeField);
  makeReadonlyMathFieldUnfocusable(hintField);

  notationHelp.classList.add("hidden");
  inputTip.classList.add("hidden");

  applyAnswerKeybindings();
  renderTouchKeypad();
  renderTouchUnwrapActionButtons();
  renderAqaHint();
  bindTouchKeypadEvents();
  applyAdaptiveMathFieldScale(answerField, getFieldValue(answerField), "answer");
}

function renderTouchUnwrapActionButtons() {
  const showButtons = shouldUseCustomTouchKeypad() && state.notationId === "aqa";
  const active = isUnwrapModeActive();

  if (touchUnwrapCycleBtn) {
    touchUnwrapCycleBtn.classList.toggle("hidden", !showButtons);
    touchUnwrapCycleBtn.classList.toggle("touch-unwrap-btn-active", active);
    touchUnwrapCycleBtn.setAttribute("aria-pressed", active ? "true" : "false");
  }

  if (touchUnwrapConfirmBtn) {
    touchUnwrapConfirmBtn.classList.toggle("hidden", !showButtons);
    touchUnwrapConfirmBtn.classList.toggle("touch-unwrap-btn-active", active);
    touchUnwrapConfirmBtn.disabled = !showButtons || !active;
  }
}

function renderAqaHint() {
  const showHint = state.notationId === "aqa" && !isTouchDevice;

  if (aqaHint) {
    aqaHint.classList.toggle("hidden", !showHint);
  }
}

function handleTouchUnwrapCycle() {
  if (state.notationId !== "aqa") {
    return;
  }

  try {
    answerField.focus({ preventScroll: true });
  } catch {
    answerField.focus();
  }

  if (!cycleUnwrapCandidate()) {
    setFeedback(
      "This expression has no NOT toggle targets right now.",
      "info",
      [],
    );
  }
}

function handleTouchUnwrapConfirm() {
  if (state.notationId !== "aqa" || !isUnwrapModeActive()) {
    return;
  }

  try {
    answerField.focus({ preventScroll: true });
  } catch {
    answerField.focus();
  }

  if (!confirmUnwrapCandidate()) {
    setFeedback("Could not toggle NOT on the selected target.", "warn", []);
  }
}

function getTouchKeypadLayout() {
  const isLogic = state.notationId === "logic";
  return [
    { action: "A", label: "A" },
    { action: "B", label: "B" },
    { action: "C", label: "C" },
    { action: "D", label: "D" },
    { action: "ZERO", label: "0" },
    { action: "ONE", label: "1" },
    { action: "AND", label: isLogic ? "∧" : "." },
    { action: "OR", label: isLogic ? "∨" : "+" },
    { action: "NOT", label: isLogic ? "¬" : "NOT" },
    { action: "LPAREN", label: "(" },
    { action: "RPAREN", label: ")" },
    { action: "LEFT", label: "◀", kind: "action" },
    { action: "RIGHT", label: "▶", kind: "action" },
    { action: "BACKSPACE", label: "⌫", kind: "action" },
  ];
}

function renderTouchKeypad() {
  if (!touchKeypad) {
    return;
  }

  if (!shouldUseCustomTouchKeypad()) {
    touchKeypad.classList.add("hidden");
    touchKeypad.innerHTML = "";
    renderTouchUnwrapActionButtons();
    return;
  }

  const keys = getTouchKeypadLayout();
  touchKeypad.innerHTML = keys
    .map((key) => `<button type="button" class="touch-key${key.kind === "action" ? " touch-key--action" : ""}" data-touch-key="${key.action}">${key.label}</button>`)
    .join("");
  touchKeypad.classList.remove("hidden");
  renderTouchUnwrapActionButtons();
}

function runTouchKeypadAction(action) {
  if (!action || !answerField) {
    return;
  }

  if (isUnwrapModeActive()) {
    cancelUnwrapMode({ restoreFeedback: true, restoreSelection: true });
  }

  try {
    answerField.focus({ preventScroll: true });
  } catch {
    answerField.focus();
  }

  const isLogic = state.notationId === "logic";

  switch (action) {
    case "A":
    case "B":
    case "C":
    case "D":
      insertAqaAwareToken(action);
      break;
    case "ZERO":
      insertAqaAwareToken("0");
      break;
    case "ONE":
      insertAqaAwareToken("1");
      break;
    case "AND":
      insertIntoAnswer(isLogic ? "∧" : ".");
      break;
    case "OR":
      insertIntoAnswer(isLogic ? "∨" : "+");
      break;
    case "NOT":
      if (isLogic) {
        insertIntoAnswer("\\lnot\\,");
      } else {
        insertOverbarPlaceholder();
      }
      break;
    case "LPAREN":
      insertIntoAnswer("(");
      break;
    case "RPAREN":
      insertIntoAnswer(")");
      break;
    case "LEFT":
      if (state.notationId === "aqa") {
        smartNavigateAnswerField("moveToPreviousChar");
      } else {
        answerField.executeCommand?.("moveToPreviousChar");
      }
      break;
    case "RIGHT":
      if (state.notationId === "aqa") {
        smartNavigateAnswerField("moveToNextChar");
      } else {
        answerField.executeCommand?.("moveToNextChar");
      }
      break;
    case "BACKSPACE":
      answerField.executeCommand?.("deleteBackward");
      break;
    default:
      break;
  }
}

function bindTouchKeypadEvents() {
  if (!touchKeypad || touchKeypad.dataset.bound === "1") {
    return;
  }

  touchKeypad.addEventListener("pointerdown", (event) => {
    const button = event.target.closest(".touch-key");
    if (!button) {
      return;
    }

    event.preventDefault();
    runTouchKeypadAction(button.getAttribute("data-touch-key"));
  });

  touchKeypad.dataset.bound = "1";
}

function makeReadonlyMathFieldUnfocusable(field) {
  if (!field || !field.hasAttribute("read-only")) {
    return;
  }

  // Keep readonly MathLive fields out of tab/focus flow on touch devices and PWA.
  field.setAttribute("tabindex", "-1");

  // If a readonly field is focused by the browser/MathLive internals, blur it.
  field.addEventListener("focusin", () => {
    if (field.hasFocus && field.hasFocus()) {
      field.blur();
    }
  });

  // Prevent readonly fields from grabbing focus/caret on taps.
  field.addEventListener("pointerdown", (event) => {
    event.preventDefault();
  }, true);
}

function disableMathFieldContextMenu(field) {
  if ("menuItems" in field) {
    try {
      field.menuItems = [];
    } catch {
      // Some MathLive instances throw before mount; safe to skip.
    }
  }

  field.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  }, true);

  field.addEventListener("mousedown", (event) => {
    if (event.button !== 2) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  }, true);

  field.addEventListener("pointerdown", (event) => {
    if (event.button !== 2) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  }, true);
}

function applyAnswerKeybindings() {
  if (_originalKeybindings === null) {
    _originalKeybindings = answerField.keybindings;
  }

  const suppressed = new Set([
    "^",
    "6",
    "v",
    "shift-v",
    "a",
    "shift-a",
    "b",
    "shift-b",
    "c",
    "shift-c",
    "d",
    "shift-d",
  ]);

  answerField.keybindings = [
    ..._originalKeybindings.filter((b) => !suppressed.has(b.key)),
  ];
}

function renderNotationToggle() {
  notationToggle.classList.toggle("mode-aqa-active", state.notationId === "aqa");
  notationToggle.classList.toggle("mode-ocr-active", state.notationId === "logic");
}

function renderDifficultyToggle() {
  difficultyToggle.classList.toggle("mode-easy-active", state.difficultyId === "easy");
  difficultyToggle.classList.toggle("mode-hard-active", state.difficultyId === "hard");
}

function renderThemeToggle() {
  themeToggle.classList.toggle("theme-dark-active", state.themeId === "dark");
  themeToggle.classList.toggle("theme-light-active", state.themeId === "light");
}

function latestResetExpression() {
  const lastEquivalent = state.equivalentSubmissions[state.equivalentSubmissions.length - 1];
  if (lastEquivalent) {
    return formatAstForAnswerField(lastEquivalent);
  }

  if (state.challenge?.initialAst) {
    return formatAstForAnswerField(state.challenge.initialAst);
  }

  return "";
}

function bindEvents() {
  themeToggle.addEventListener("click", () => {
    state.themeId = state.themeId === "dark" ? "light" : "dark";
    applyTheme();
    renderThemeToggle();
    // Close keyboard on theme toggle
    if (answerField.hasFocus && answerField.hasFocus()) {
      answerField.blur();
    }

    try {
      window.localStorage.setItem("boolinator-theme", state.themeId);
    } catch {
      // Ignore if storage is blocked.
    }
  });

  notationToggle.addEventListener("click", () => {
    cancelUnwrapMode();
    state.notationId = state.notationId === "aqa" ? "logic" : "aqa";
    renderNotationToggle();
    // Close keyboard on notation toggle
    if (answerField.hasFocus && answerField.hasFocus()) {
      answerField.blur();
    }

    try {
      window.localStorage.setItem("boolinator-notation", state.notationId);
    } catch {
      // Ignore if storage is blocked.
    }

    applyNotationMode();
  });

  difficultyToggle.addEventListener("click", () => {
    state.difficultyId = state.difficultyId === "hard" ? "easy" : "hard";
    renderDifficultyToggle();

    try {
      window.localStorage.setItem("boolinator-difficulty", state.difficultyId);
    } catch {
      // Ignore if storage is blocked.
    }

    startNewChallenge();
  });

  const applyNotationMode = () => {
    renderNotationMeta();
    renderChallengeExpression();
    renderSubmissionHistory();
    renderHint();
    renderTip();
    renderInputHelpModalContent();
    retranslateAnswerField();
    applyAnswerKeybindings();
    renderTouchKeypad();
    renderTouchUnwrapActionButtons();
    renderAqaHint();
  };

  document.querySelector("#newChallengeBtn").addEventListener("click", () => {
    startNewChallenge();
  });

  document.querySelector("#resetBtn").addEventListener("click", () => {
    cancelUnwrapMode();
    const resetExpression = latestResetExpression();
    setFieldValue(answerField, resetExpression);

    if (state.equivalentSubmissions.length > 0) {
      setFeedback("Input reset to your latest equivalent step.", "info", []);
    } else {
      setFeedback("Input reset to the challenge expression.", "info", []);
    }

    try {
      answerField.focus({ preventScroll: true });
    } catch {
      answerField.focus();
    }
  });

  document.querySelector("#checkBtn").addEventListener("click", () => {
    cancelUnwrapMode();
    checkAnswer();
    forceAnswerFieldBlurReset();
    answerField.classList.remove("answer-field-focused");
  });

  document.querySelector("#hintBtn").addEventListener("click", () => {
    cancelUnwrapMode();
    hintArea.classList.remove("hidden");
    renderHint();
  });

  touchUnwrapCycleBtn?.addEventListener("click", () => {
    handleTouchUnwrapCycle();
  });

  touchUnwrapConfirmBtn?.addEventListener("click", () => {
    handleTouchUnwrapConfirm();
  });

  inputHelpBtn?.addEventListener("click", () => {
    openInputHelpModal();
  });

  closeInputHelpBtn?.addEventListener("click", () => {
    closeInputHelpModal();
  });

  inputHelpModal?.addEventListener("click", (event) => {
    if (event.target === inputHelpModal) {
      closeInputHelpModal();
    }
  });

  worksheetBtn?.addEventListener("click", () => {
    openWorksheetModal();
  });

  worksheetGenerateBtn?.addEventListener("click", () => {
    void generateWorksheetPdf();
  });

  worksheetDifficulty?.addEventListener("change", () => {
    if (worksheetDifficulty.value === "easy" || worksheetDifficulty.value === "hard" || worksheetDifficulty.value === "mixed") {
      state.worksheetDifficultyId = worksheetDifficulty.value;
    } else {
      state.worksheetDifficultyId = "mixed";
    }
    try {
      window.localStorage.setItem("boolinator-worksheet-difficulty", state.worksheetDifficultyId);
    } catch {
      // Ignore if storage is blocked.
    }
  });

  closeWorksheetBtn?.addEventListener("click", () => {
    closeWorksheetModal();
  });

  worksheetModal?.addEventListener("click", (event) => {
    if (event.target === worksheetModal) {
      closeWorksheetModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (worksheetModal && !worksheetModal.classList.contains("hidden")) {
      closeWorksheetModal();
      return;
    }

    if (inputHelpModal && !inputHelpModal.classList.contains("hidden")) {
      closeInputHelpModal();
    }
  });

  document.addEventListener("copy", handleClipboardEvent, true);
  document.addEventListener("cut", handleClipboardEvent, true);

  answerField.addEventListener("keydown", handleAnswerFieldKeydown, true);
  answerField.addEventListener("blur", () => {
    answerField.classList.remove("answer-field-focused");
  });

  answerField.addEventListener("focusin", () => {
    answerField.classList.add("answer-field-focused");
  });

  answerField.addEventListener("input", () => {
    if (!state.suppressAnswerInputHandler) {
      cancelUnwrapMode({ restoreFeedback: true, restoreSelection: true });
    }
    applyAdaptiveMathFieldScale(answerField, getFieldValue(answerField), "answer");
  });

  const ensureAnswerTapFocus = () => {
    try {
      answerField.focus({ preventScroll: true });
    } catch {
      answerField.focus();
    }
  };

  answerField.addEventListener("pointerdown", ensureAnswerTapFocus, true);
  if (!window.PointerEvent) {
    answerField.addEventListener("touchstart", ensureAnswerTapFocus, true);
  }

  const blurOnOutsideInteraction = (event) => {
    if (!hasMathLiveAnswerFocus()) {
      return;
    }

    if (isEventInsideAnswerFieldOrKeyboard(event)) {
      return;
    }

    const now = performance.now();
    if (now - lastOutsideBlurTimestamp < 120) {
      return;
    }
    lastOutsideBlurTimestamp = now;

    forceAnswerFieldBlurReset();
    answerField.classList.remove("answer-field-focused");
  };

  document.addEventListener("mouseup", blurOnOutsideInteraction, true);
  document.addEventListener("touchend", blurOnOutsideInteraction, true);
  document.addEventListener("click", blurOnOutsideInteraction, true);

  window.addEventListener("resize", () => {
    refreshAdaptiveMathFieldSizes();
  });
}

function isEventInsideAnswerFieldOrKeyboard(event) {
  const target = event.target;
  if (target === answerField) {
    return true;
  }

  if (target instanceof Element) {
    const targetClassName = typeof target.className === "string" ? target.className : "";
    if (targetClassName.includes("MLK__") || targetClassName.includes("ML__")) {
      return true;
    }
  }

  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  if (path.includes(answerField)) {
    return true;
  }

  for (const node of path) {
    if (!(node instanceof Element)) {
      continue;
    }

    const root = node.getRootNode?.();
    if (root && root.host === answerField) {
      return true;
    }

    const className = typeof node.className === "string" ? node.className : "";
    if (className.includes("MLK__") || className.includes("ML__")) {
      return true;
    }

    if (node.closest?.("#answerField, #touchKeypad, .ML__keyboard, .ML__keyboard-container, .ML__virtual-keyboard, .MLK__plate, .MLK__backdrop")) {
      return true;
    }
  }

  return false;
}

function handleClipboardEvent(event) {
  if (isClipboardEventAllowed(event)) {
    return;
  }

  event.preventDefault();
}

function isClipboardEventAllowed(event) {
  if (isWithinCopyAllowedArea(event.target)) {
    return true;
  }

  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed) {
    return false;
  }

  return (
    isWithinCopyAllowedArea(selection.anchorNode)
    && isWithinCopyAllowedArea(selection.focusNode)
  );
}

function isWithinCopyAllowedArea(node) {
  const element = node instanceof Element ? node : node?.parentElement;
  if (!element) {
    return false;
  }

  return Boolean(element.closest("#challengeField, #answerField, #submissionHistory"));
}

function handleAnswerFieldKeydown(event) {
  const key = event.key;
  const hasModifier = event.ctrlKey || event.metaKey || event.altKey;

  if (!hasModifier && key === "\\" && state.notationId === "aqa") {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    if (!cycleUnwrapCandidate()) {
      setFeedback(
        "This expression has no NOT toggle targets right now.",
        "info",
        [],
      );
    }
    return;
  }

  if (!hasModifier && key === "Enter" && isUnwrapModeActive()) {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    if (!confirmUnwrapCandidate()) {
      setFeedback("Could not toggle NOT on the selected target.", "warn", []);
    }
    return;
  }

  if (!hasModifier && key === "Escape" && isUnwrapModeActive()) {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    cancelUnwrapMode({ restoreFeedback: true, restoreSelection: true });
    return;
  }

  if (isUnwrapModeActive() && key !== "Shift") {
    cancelUnwrapMode({ restoreFeedback: true, restoreSelection: true });
  }

  if (hasModifier) {
    return;
  }

  const isLogic = state.notationId === "logic";
  const hasSelection = fieldHasSelection(answerField);

  if (!isLogic && (key === "Backspace" || key === "Delete") && hasSelection) {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    deferAnswerMutation(() => {
      const deleteCommand = key === "Backspace" ? "deleteBackward" : "deleteForward";
      if (typeof answerField.executeCommand === "function") {
        answerField.executeCommand(deleteCommand);
        // Mark for one-time escape before the next inserted token.
        state.pendingTemplateExit = true;
      }
      answerField.focus({ preventScroll: true });
    });
    return;
  }

  // Smart LEFT/RIGHT navigation in AQA mode to skip phantom parentheses
  if ((key === "ArrowLeft" || key === "ArrowRight") && state.notationId === "aqa") {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    deferAnswerMutation(() => {
      smartNavigateAnswerField(key === "ArrowLeft" ? "moveToPreviousChar" : "moveToNextChar");
    });
    return;
  }

  const passthroughKeys = new Set([
    "Backspace",
    "Delete",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
    "Tab",
    "Enter",
    "Escape",
  ]);

  if (passthroughKeys.has(key)) {
    return;
  }

  if (key === "^" || key === "6") {
    if (isLogic) {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      deferAnswerMutation(() => insertIntoAnswer("∧"));
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    return;
  }

  if (key === "-" || key === "_" || key === "`" || key === "¬") {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    if (isLogic) {
      deferAnswerMutation(() => insertIntoAnswer("\\lnot\\,"));
    } else {
      deferAnswerMutation(() => insertOverbarPlaceholder());
    }
    return;
  }

  if (/^[0-9]$/.test(key)) {
    if (key === "0" || key === "1") {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      deferAnswerMutation(() => insertAqaAwareToken(key));
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    return;
  }

  if (!/^[a-zA-Z]$/.test(key)) {
    if (key === "=" && state.notationId === "aqa") {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      deferAnswerMutation(() => insertAqaAwareToken("+"));
      return;
    }

    if ((key === "." || key === ">") && state.notationId === "aqa") {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      deferAnswerMutation(() => insertAqaAwareToken("."));
      return;
    }

    if (key.length === 1) {
      const allowedSymbols = isLogic
        ? new Set(["(", ")", "∨", "∧", "¬"])
        : new Set(["(", ")", "+", "."]);

      if (allowedSymbols.has(key)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    }
    return;
  }

  const upper = key.toUpperCase();
  if (["A", "B", "C", "D"].includes(upper)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    deferAnswerMutation(() => insertAqaAwareToken(upper));
    return;
  }

  if (isLogic && upper === "V") {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    deferAnswerMutation(() => insertIntoAnswer("∨"));
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  event.stopPropagation();
}

function deferAnswerMutation(action) {
  setTimeout(() => {
    action();
  }, 0);
}

/**
 * Smart cursor navigation for AQA mode: navigate the SEMANTIC structure, not the rendering.
 */
function smartNavigateAnswerField(moveCommand) {
  if (typeof answerField.executeCommand !== "function") {
    return;
  }

  if (typeof answerField.position !== "number") {
    // Fallback for environments where MathLive offset API is unavailable.
    answerField.executeCommand(moveCommand);
    return;
  }

  const direction = moveCommand === "moveToPreviousChar" ? -1 : 1;
  const lookup = buildSemanticOffsetLookup();
  if (!lookup) {
    answerField.executeCommand(moveCommand);
    return;
  }

  const currentOffset = Math.max(0, Math.min(lookup.maxOffset, Number(answerField.position) || 0));
  const currentSemanticOffset = lookup.semanticByOffset[currentOffset] ?? 0;
  const targetSemanticOffset = Math.max(
    0,
    Math.min(lookup.maxSemanticOffset, currentSemanticOffset + direction),
  );

  if (targetSemanticOffset === currentSemanticOffset) {
    return;
  }

  let targetOffset;
  if (direction > 0) {
    if (lookup.firstExact[targetSemanticOffset] !== -1) {
      targetOffset = lookup.firstExact[targetSemanticOffset];
    } else {
      const nextReachable = lookup.firstOffsetAtOrAfter[targetSemanticOffset];
      targetOffset = Math.max(currentOffset + 1, nextReachable - 1);
    }
  } else if (lookup.lastExact[targetSemanticOffset] !== -1) {
    targetOffset = lookup.lastExact[targetSemanticOffset];
  } else {
    const prevReachable = lookup.lastOffsetAtOrBefore[targetSemanticOffset];
    targetOffset = Math.min(currentOffset - 1, prevReachable + 1);
  }

  targetOffset = Math.max(0, Math.min(lookup.maxOffset, targetOffset));

  if (typeof targetOffset === "number" && targetOffset !== currentOffset) {
    answerField.position = targetOffset;
  } else {
    answerField.executeCommand(moveCommand);
  }
}

function buildSemanticOffsetLookup() {
  if (typeof answerField.getValue !== "function") {
    return null;
  }

  const maxOffset = typeof answerField.lastOffset === "number"
    ? answerField.lastOffset
    : Math.max(0, Number(answerField.position) || 0);

  const semanticByOffset = new Array(maxOffset + 1);
  for (let offset = 0; offset <= maxOffset; offset += 1) {
    semanticByOffset[offset] = getSemanticOffsetAt(offset);
  }

  const maxSemanticOffset = semanticByOffset[maxOffset] || 0;
  const firstExact = new Array(maxSemanticOffset + 1).fill(-1);
  const lastExact = new Array(maxSemanticOffset + 1).fill(-1);

  for (let offset = 0; offset <= maxOffset; offset += 1) {
    const semanticOffset = semanticByOffset[offset];
    if (semanticOffset >= 0 && semanticOffset <= maxSemanticOffset) {
      if (firstExact[semanticOffset] === -1) {
        firstExact[semanticOffset] = offset;
      }
      lastExact[semanticOffset] = offset;
    }
  }

  const firstOffsetAtOrAfter = new Array(maxSemanticOffset + 1).fill(maxOffset);
  const lastOffsetAtOrBefore = new Array(maxSemanticOffset + 1).fill(0);

  if (maxSemanticOffset >= 0) {
    firstOffsetAtOrAfter[maxSemanticOffset] = firstExact[maxSemanticOffset] !== -1
      ? firstExact[maxSemanticOffset]
      : maxOffset;
    for (let s = maxSemanticOffset - 1; s >= 0; s -= 1) {
      firstOffsetAtOrAfter[s] = firstExact[s] !== -1
        ? firstExact[s]
        : firstOffsetAtOrAfter[s + 1];
    }

    lastOffsetAtOrBefore[0] = lastExact[0] !== -1 ? lastExact[0] : 0;
    for (let s = 1; s <= maxSemanticOffset; s += 1) {
      lastOffsetAtOrBefore[s] = lastExact[s] !== -1
        ? lastExact[s]
        : lastOffsetAtOrBefore[s - 1];
    }
  }

  return {
    maxOffset,
    semanticByOffset,
    maxSemanticOffset,
    firstExact,
    lastExact,
    firstOffsetAtOrAfter,
    lastOffsetAtOrBefore,
  };
}

/**
 * Project a LaTeX prefix to semantic navigation symbols.
 * Keep only tokens the student conceptually navigates through:
 * variables/constants, +, and .
 * Parentheses are treated as structural grouping boundaries.
 */
function projectLatexToSemantic(latex) {
  return String(latex)
    // spacing + layout directives
    .replace(/\\,/g, "")
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    // overbar wrapper command name
    .replace(/\\overline/g, "")
    // grouping braces are structural only
    .replace(/[{}]/g, "")
    // keep only semantic navigation symbols
    .replace(/[^A-D01+.]/g, "");
}

/**
 * Semantic cursor offset up to a concrete MathLive offset.
 */
function getSemanticOffsetAt(offset) {
  if (typeof answerField.getValue !== "function") {
    return 0;
  }

  const safeOffset = Math.max(0, Number(offset) || 0);
  const prefixLatex = answerField.getValue(0, safeOffset, "latex");
  return projectLatexToSemantic(prefixLatex).length;
}

function exitPlaceholderContext(field) {
  if (typeof field.executeCommand !== "function") {
    return;
  }

  for (let step = 0; step < 8; step += 1) {
    const moved = field.executeCommand("moveToNextPlaceholder");
    if (!moved) {
      break;
    }
  }
}

function insertAqaAwareToken(content) {
  if (state.notationId === "aqa" && state.pendingTemplateExit) {
    exitPlaceholderContext(answerField);
    state.pendingTemplateExit = false;
  }

  insertIntoAnswer(content);
}

function detectTouchDevice() {
  if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) {
    return true;
  }

  if (typeof window !== "undefined") {
    if ("ontouchstart" in window) {
      return true;
    }

    if (typeof window.matchMedia === "function") {
      return window.matchMedia("(pointer: coarse)").matches
        || window.matchMedia("(any-pointer: coarse)").matches
        || window.matchMedia("(hover: none)").matches
        || window.matchMedia("(any-hover: none)").matches;
    }
  }

  return false;
}

function renderInputHelpButtonVisibility() {
  if (!inputHelpBtn) {
    return;
  }

  const hideOnTouch = detectTouchDevice();
  inputHelpBtn.classList.toggle("hidden", hideOnTouch);
}

function renderInputHelpModalContent() {
  if (!inputHelpContent) {
    return;
  }

  inputHelpContent.innerHTML = `
    <p>Available variables: <strong>A, B, C, D</strong>. Use brackets <strong>( )</strong> to group terms.</p>

    <h4>AQA input</h4>
    <table class="input-help-table" aria-label="AQA typing guide">
      <thead>
        <tr><th>Symbol</th><th>Meaning</th><th>Key to press</th></tr>
      </thead>
      <tbody>
        <tr><td><code>.</code></td><td>AND</td><td>Press <span class="key-chip">.</span> or <span class="key-chip">&gt;</span> (same key)</td></tr>
        <tr><td><code>+</code></td><td>OR</td><td>Press <span class="key-chip">+</span> or <span class="key-chip">=</span> (same key)</td></tr>
        <tr><td><span class="overbar-symbol">A</span></td><td>NOT</td><td>Press <span class="key-chip">-</span></td></tr>
        <tr><td colspan="3">To toggle NOT gates: press <span class="key-chip">&#92;</span> to cycle through existing NOTs and other groups, then press <span class="key-chip">Enter</span>. If the target already has NOT, it is removed; otherwise NOT is added. Press <span class="key-chip">Esc</span> to cancel, or wait for timeout.</td></tr>
      </tbody>
    </table>

    <h4>OCR input</h4>
    <table class="input-help-table" aria-label="OCR typing guide">
      <thead>
        <tr><th>Symbol</th><th>Meaning</th><th>Key to press</th></tr>
      </thead>
      <tbody>
        <tr><td><code>∧</code></td><td>AND</td><td>Press <span class="key-chip">6</span> (the <span class="key-chip">^</span> key)</td></tr>
        <tr><td><code>∨</code></td><td>OR</td><td>Press <span class="key-chip">V</span></td></tr>
        <tr><td><code>¬</code></td><td>NOT</td><td>Press <span class="key-chip">-</span> (alternative: key left of <span class="key-chip">1</span>)</td></tr>
      </tbody>
    </table>
  `;
}

function openInputHelpModal() {
  if (!inputHelpModal) {
    return;
  }

  closeWorksheetModal({ preserveStatus: true });
  renderInputHelpModalContent();
  inputHelpModal.classList.remove("hidden");
  syncModalBodyState();
}

function closeInputHelpModal() {
  if (!inputHelpModal) {
    return;
  }

  inputHelpModal.classList.add("hidden");
  syncModalBodyState();
}

function openWorksheetModal() {
  if (!worksheetModal) {
    return;
  }

  closeInputHelpModal();
  if (worksheetTitleInput) {
    worksheetTitleInput.value = normalizeWorksheetTitle(worksheetTitleInput.value);
  }
  if (worksheetNotation) {
    worksheetNotation.value = state.notationId;
  }
  if (worksheetDifficulty) {
    worksheetDifficulty.value = state.worksheetDifficultyId;
  }
  setWorksheetStatus("", "neutral");
  renderWorksheetModalState();
  worksheetModal.classList.remove("hidden");
  syncModalBodyState();
}

function closeWorksheetModal(options = {}) {
  if (!worksheetModal || state.worksheetGenerating) {
    return;
  }

  worksheetModal.classList.add("hidden");
  if (!options.preserveStatus) {
    setWorksheetStatus("", "neutral");
  }
  syncModalBodyState();
}

function syncModalBodyState() {
  const hasOpenModal = [inputHelpModal, worksheetModal].some(
    (modal) => modal && !modal.classList.contains("hidden"),
  );
  document.body.classList.toggle("modal-open", hasOpenModal);
}

function renderWorksheetModalState() {
  if (!worksheetGenerateBtn || !worksheetNotation || !worksheetTitleInput) {
    return;
  }

  worksheetGenerateBtn.disabled = state.worksheetGenerating;
  worksheetNotation.disabled = state.worksheetGenerating;
  if (worksheetDifficulty) {
    worksheetDifficulty.disabled = state.worksheetGenerating;
  }
  worksheetTitleInput.disabled = state.worksheetGenerating;
  worksheetGenerateBtn.textContent = state.worksheetGenerating
    ? "Generating PDF..."
    : "Generate Worksheet";
}

function setWorksheetStatus(message, tone) {
  if (!worksheetStatus) {
    return;
  }

  worksheetStatus.textContent = message;
  worksheetStatus.className = `worksheet-status ${toneClass(tone)}`;
}

async function generateWorksheetPdf() {
  if (state.worksheetGenerating) {
    return;
  }

  const notationId = worksheetNotation?.value === "logic" ? "logic" : "aqa";
  const worksheetDifficultyId = worksheetDifficulty?.value === "easy" || worksheetDifficulty?.value === "hard" || worksheetDifficulty?.value === "mixed"
    ? worksheetDifficulty.value
    : "mixed";
  const worksheetTitle = normalizeWorksheetTitle(worksheetTitleInput?.value);
  state.worksheetDifficultyId = worksheetDifficultyId;
  if (worksheetTitleInput) {
    worksheetTitleInput.value = worksheetTitle;
  }
  state.worksheetGenerating = true;
  renderWorksheetModalState();
  setWorksheetStatus("Generating fresh questions...", "info");

  try {
    const worksheetItems = buildWorksheetItems(WORKSHEET_QUESTION_COUNT, notationId, worksheetDifficultyId);
    setWorksheetStatus("Rendering the PDF pages...", "info");
    const pdf = await renderWorksheetPdfDocument(worksheetItems, notationId, worksheetTitle);
    const filename = buildWorksheetFilename(notationId, worksheetTitle);
    pdf.save(filename);
    setWorksheetStatus(`Downloaded ${filename}`, "success");
  } catch (error) {
    console.error("Worksheet PDF generation failed", error);
    const message = error instanceof Error
      ? error.message
      : "Could not generate the worksheet PDF.";
    setWorksheetStatus(message, "error");
  } finally {
    clearWorksheetRenderRoot();
    state.worksheetGenerating = false;
    renderWorksheetModalState();
  }
}

function buildWorksheetItems(count, notationId, difficultyId = "hard") {
  if (difficultyId === "mixed") {
    return buildMixedWorksheetItems(count, notationId);
  }

  const items = [];
  const seenQuestions = new Set();
  const maxAttempts = count * 30;
  let attempts = 0;

  while (items.length < count && attempts < maxAttempts) {
    attempts += 1;
    let challenge = null;
    try {
      challenge = generateChallengeWithRetry(2, difficultyId);
    } catch {
      continue;
    }

    const questionText = astToNotationText(challenge.initialAst, notationId);
    if (seenQuestions.has(questionText)) {
      continue;
    }

    seenQuestions.add(questionText);
    items.push({
      number: items.length + 1,
      questionAst: challenge.initialAst,
      answerAst: challenge.minimalAst,
      targetGateCount: challenge.minimalGateCount,
    });
  }

  if (items.length < count) {
    throw new Error("Could not generate enough distinct worksheet questions. Please try again.");
  }

  return items;
}

function buildMixedWorksheetItems(count, notationId) {
  const easierCount = Math.min(5, count);
  const advancedCount = Math.max(0, count - easierCount);
  const items = [];
  const seenQuestions = new Set();

  appendWorksheetItemsByDifficulty(items, seenQuestions, easierCount, notationId, "easy");
  appendWorksheetItemsByDifficulty(items, seenQuestions, advancedCount, notationId, "hard");

  return items;
}

function appendWorksheetItemsByDifficulty(items, seenQuestions, amount, notationId, difficultyId) {
  const maxAttempts = Math.max(amount * 35, 35);
  let attempts = 0;

  while (amount > 0 && attempts < maxAttempts) {
    attempts += 1;
    let challenge = null;
    try {
      challenge = generateChallengeWithRetry(2, difficultyId);
    } catch {
      continue;
    }

    const questionText = astToNotationText(challenge.initialAst, notationId);
    if (seenQuestions.has(questionText)) {
      continue;
    }

    seenQuestions.add(questionText);
    items.push({
      number: items.length + 1,
      questionAst: challenge.initialAst,
      answerAst: challenge.minimalAst,
      targetGateCount: challenge.minimalGateCount,
    });
    amount -= 1;
  }

  if (amount > 0) {
    throw new Error("Could not generate enough distinct worksheet questions. Please try again.");
  }
}

function generateChallengeWithRetry(maxRetries = 1, difficultyId = state.difficultyId) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return randomChallenge({ difficulty: difficultyId });
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("Could not build a non-trivial challenge. Try again.");
}

async function renderWorksheetPdfDocument(items, notationId, worksheetTitle) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import(JSPDF_MODULE_URL),
    import(HTML2CANVAS_MODULE_URL),
  ]);

  const pages = renderWorksheetPages(items, notationId, worksheetTitle);
  worksheetRenderRoot?.classList.add("is-capturing");

  try {
    await waitForWorksheetRender();
    fitWorksheetPages(pages);

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
      compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    for (let index = 0; index < pages.length; index += 1) {
      if (index > 0) {
        pdf.addPage("a4", "portrait");
      }

      const canvas = await html2canvas(pages[index], {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const imageData = canvas.toDataURL("image/jpeg", 0.92);
      pdf.addImage(imageData, "JPEG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
    }

    return pdf;
  } finally {
    worksheetRenderRoot?.classList.remove("is-capturing");
  }
}

function renderWorksheetPages(items, notationId, worksheetTitle) {
  if (!worksheetRenderRoot) {
    throw new Error("Worksheet render surface is not available.");
  }

  clearWorksheetRenderRoot();
  const normalizedTitle = normalizeWorksheetTitle(worksheetTitle);

  const wrapper = document.createElement("div");
  wrapper.className = "worksheet-doc";
  wrapper.appendChild(createWorksheetPage({
    title: normalizedTitle,
    subtitle: "Simplify each Boolean expression to its minimal form.",
    notationId,
    items,
    itemKey: "questionAst",
  }));
  wrapper.appendChild(createWorksheetPage({
    title: `${normalizedTitle} Answers`,
    subtitle: "Final answers for the worksheet questions.",
    notationId,
    items,
    itemKey: "answerAst",
  }));

  worksheetRenderRoot.appendChild(wrapper);
  return Array.from(wrapper.querySelectorAll(".worksheet-page"));
}

function createWorksheetPage({ title, subtitle, notationId, items, itemKey }) {
  const page = document.createElement("section");
  page.className = "worksheet-page";

  const frame = document.createElement("div");
  frame.className = "worksheet-frame";
  page.appendChild(frame);

  const header = document.createElement("header");
  header.className = "worksheet-header";
  frame.appendChild(header);

  const heading = document.createElement("div");
  heading.className = "worksheet-heading";
  header.appendChild(heading);

  const titleElement = document.createElement("h1");
  titleElement.textContent = title;
  heading.appendChild(titleElement);

  const subtitleElement = document.createElement("p");
  subtitleElement.textContent = subtitle;
  heading.appendChild(subtitleElement);

  const meta = document.createElement("div");
  meta.className = "worksheet-meta";
  meta.innerHTML = `<span>${notationId === "logic" ? "OCR" : "AQA"} notation</span>`;
  header.appendChild(meta);

  const list = document.createElement("ol");
  list.className = "worksheet-list";
  frame.appendChild(list);

  for (const item of items) {
    const listItem = document.createElement("li");
    listItem.className = "worksheet-item";

    const number = document.createElement("span");
    number.className = "worksheet-item-number";
    number.textContent = `${item.number}.`;
    listItem.appendChild(number);

    const content = document.createElement("div");
    content.className = "worksheet-item-content";
    const expression = renderWorksheetExpression(item[itemKey], notationId);
    expression.classList.add("worksheet-expression");
    content.appendChild(expression);
    listItem.appendChild(content);

    const targetGateCount = document.createElement("span");
    targetGateCount.className = "worksheet-item-gates";
    targetGateCount.textContent = `Target: ≤ ${item.targetGateCount} gates`;
    listItem.appendChild(targetGateCount);

    list.appendChild(listItem);
  }

  const footer = document.createElement("footer");
  footer.className = "worksheet-footer";
  footer.innerHTML = "<span>Generated with Boolinator</span><span>https://www.korovatron.co.uk/boolinator/</span>";
  frame.appendChild(footer);

  return page;
}

function renderWorksheetExpression(ast, notationId) {
  return buildWorksheetExpressionNode(ast, notationId, 0, true);
}

function buildWorksheetExpressionNode(node, notationId, parentPrecedence = 0, isRoot = false) {
  const precedence = {
    const: 4,
    var: 4,
    not: 3,
    and: 2,
    or: 1,
  };

  let element;

  if (node.type === "const") {
    element = document.createElement("span");
    element.textContent = node.value ? "1" : "0";
    return element;
  }

  if (node.type === "var") {
    element = document.createElement("span");
    element.textContent = node.name;
    return element;
  }

  if (node.type === "not") {
    if (notationId === "aqa") {
      const overbar = document.createElement("span");
      overbar.className = "worksheet-overbar";

      const overbarContent = document.createElement("span");
      overbarContent.className = "worksheet-overbar-content";

      const shouldWrap = !isRoot && shouldWrapWorksheetAqaOverbar(node.expr);

      if (shouldWrap) {
        overbarContent.appendChild(wrapWorksheetExpression(
          buildWorksheetExpressionNode(node.expr, notationId, 0, false),
        ));
      } else {
        overbarContent.appendChild(buildWorksheetExpressionNode(node.expr, notationId, 0, false));
      }

      overbar.appendChild(overbarContent);

      return overbar;
    }

    element = document.createElement("span");
    element.append("¬");
    element.appendChild(buildWorksheetExpressionNode(node.expr, notationId, precedence.not, false));
    return element;
  }

  const children = flattenWorksheetExpression(node, node.type);
  element = document.createElement("span");

  children.forEach((child, index) => {
    if (index > 0) {
      element.append(node.type === "and"
        ? (notationId === "aqa" ? "." : " ∧ ")
        : (notationId === "aqa" ? " + " : " ∨ "));
    }
    element.appendChild(buildWorksheetExpressionNode(child, notationId, precedence[node.type], false));
  });

  if (precedence[node.type] < parentPrecedence) {
    return wrapWorksheetExpression(element);
  }

  return element;
}

function wrapWorksheetExpression(content) {
  const wrapper = document.createElement("span");
  wrapper.className = "worksheet-group";
  wrapper.append("(");
  wrapper.appendChild(content);
  wrapper.append(")");
  return wrapper;
}

function shouldWrapWorksheetAqaOverbar(node) {
  if (!node) {
    return false;
  }

  return node.type === "or";
}

function flattenWorksheetExpression(node, type) {
  if (node.type !== type) {
    return [node];
  }

  return [
    ...flattenWorksheetExpression(node.left, type),
    ...flattenWorksheetExpression(node.right, type),
  ];
}

function clearWorksheetRenderRoot() {
  if (worksheetRenderRoot) {
    worksheetRenderRoot.classList.remove("is-capturing");
    worksheetRenderRoot.innerHTML = "";
  }
}

async function waitForWorksheetRender() {
  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => {});
  }

  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function fitWorksheetPages(pages) {
  for (const page of pages) {
    let fontSize = 17;
    page.style.setProperty("--worksheet-font-size", `${fontSize}px`);
    fitWorksheetExpressions(page);

    while (page.scrollHeight > page.clientHeight && fontSize > 12) {
      fontSize -= 0.5;
      page.style.setProperty("--worksheet-font-size", `${fontSize}px`);
      fitWorksheetExpressions(page);
    }
  }
}

function fitWorksheetExpressions(page) {
  const expressionRows = page.querySelectorAll(".worksheet-item-content");

  for (const row of expressionRows) {
    const expression = row.querySelector(".worksheet-expression");
    if (!(expression instanceof HTMLElement)) {
      continue;
    }

    let scale = 1;
    expression.style.fontSize = `${scale}em`;

    while (row.scrollWidth > row.clientWidth && scale > 0.72) {
      scale -= 0.02;
      expression.style.fontSize = `${scale}em`;
    }
  }
}

function buildWorksheetFilename(notationId, worksheetTitle) {
  const stamp = new Date().toISOString().slice(0, 10);
  const titleSlug = slugifyWorksheetTitle(worksheetTitle);
  return `${titleSlug}-${notationId}-${stamp}.pdf`;
}

function normalizeWorksheetTitle(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || DEFAULT_WORKSHEET_TITLE;
}

function slugifyWorksheetTitle(value) {
  const normalized = normalizeWorksheetTitle(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "boolinator-worksheet";
}

function startNewChallenge(options = {}) {
  const { isInitialLoad = false } = options;
  cancelUnwrapMode();
  const previousChallenge = state.challenge;

  try {
    state.challenge = generateChallengeWithRetry(3);
  } catch (error) {
    console.error("Challenge generation failed", error);
    if (previousChallenge) {
      setFeedback("Could not generate a new challenge right now. Please try again.", "error", []);
      return;
    }

    if (isInitialLoad) {
      setFeedback("Loading your first challenge...", "info", []);
      setTimeout(() => {
        if (!state.challenge) {
          startNewChallenge({ isInitialLoad: true });
        }
      }, 250);
      return;
    }

    setFeedback("Could not start a challenge right now. Please try again.", "error", []);
    return;
  }

  state.solved = false;
  state.bestEquivalent = null;
  state.equivalentSubmissions = [];

  const startingExpression = formatAstForAnswerField(state.challenge.initialAst);
  setFieldValue(answerField, startingExpression);
  hintArea.classList.add("hidden");

  renderNotationMeta();
  renderChallengeExpression();
  renderSubmissionHistory();
  renderGateMetrics();
  renderTip();
  resetAppScrollToTop();

    if (!isInitialLoad) {
      setFeedback(
        "New challenge loaded. Enter an equivalent expression with fewer gates.",
        "info",
        [],
      );
    }

    if (!isTouchDevice) {
      requestAnimationFrame(() => {
        answerField.focus({ preventScroll: true });
      });
    }
}

function renderNotationMeta() {
  notationHelp.textContent = "";
}

function renderChallengeExpression() {
  const challengeLatex = formatAstForAnswerField(state.challenge.initialAst);
  setFieldValue(challengeField, challengeLatex);
  applyAdaptiveMathFieldScale(challengeField, challengeLatex, "challenge");
}

function renderSubmissionHistory() {
  submissionHistory.innerHTML = "";

  if (state.equivalentSubmissions.length === 0) {
    submissionHistory.classList.add("hidden");
    return;
  }

  submissionHistory.classList.remove("hidden");

  for (const ast of state.equivalentSubmissions) {
    const row = document.createElement("div");
    row.className = "submission-row";

    const symbol = document.createElement("span");
    symbol.className = "equiv-symbol";
    symbol.textContent = "≡";
    row.appendChild(symbol);

    const expressionField = document.createElement("math-field");
    expressionField.className = "submission-item";
    expressionField.setAttribute("default-mode", "math");
    expressionField.setAttribute("read-only", "");
    expressionField.setAttribute("math-virtual-keyboard-policy", "manual");
    row.appendChild(expressionField);

    const gateCount = gateCountAst(ast);
    const gateBadge = document.createElement("span");
    gateBadge.className = "submission-gate-count";
    gateBadge.innerHTML = `<span class="gate-label-full">${gateCount} gates</span><span class="gate-label-short">${gateCount}g</span>`;
    row.appendChild(gateBadge);

    submissionHistory.appendChild(row);

    const latex = formatAstForAnswerField(ast);
    renderReadonlyMathFieldLatex(expressionField, latex);
    applyAdaptiveMathFieldScale(expressionField, latex, "history");
    disableMathFieldContextMenu(expressionField);
    makeReadonlyMathFieldUnfocusable(expressionField);
  }
}

function addEquivalentSubmission(ast) {
  cancelUnwrapMode();
  const astSnapshot = JSON.parse(JSON.stringify(ast));
  state.equivalentSubmissions.push(astSnapshot);
  renderSubmissionHistory();
  requestAnimationFrame(() => {
    ensureAnswerPanelVisible();
  });
  hintArea.classList.add("hidden");
  hintField.classList.add("hidden");
  setFieldValue(hintField, "");
  hintText.textContent = "";
}

function ensureAnswerPanelVisible() {
  const target = answerPanel ?? answerField;
  const rect = target.getBoundingClientRect();
  const margin = 16;
  const isVisible = rect.top >= margin && rect.bottom <= window.innerHeight - margin;

  if (!isVisible) {
    target.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }
}

function renderReadonlyMathFieldLatex(field, latex) {
  const assignLatex = () => {
    try {
      if (typeof field.setValue === "function") {
        field.setValue(latex);
        return;
      }
      field.value = latex;
      field.setAttribute("value", latex);
    } catch {
      // If MathLive isn't mounted yet, later retries will populate content.
    }
  };

  assignLatex();

  queueMicrotask(assignLatex);
  // MathLive custom elements can upgrade asynchronously; set again after mount.
  requestAnimationFrame(() => {
    assignLatex();
    applyAdaptiveMathFieldScale(
      field,
      latex,
      field.classList.contains("submission-item") ? "history" : "generic",
    );
  });
}

function retranslateAnswerField() {
  const raw = getFieldValue(answerField).trim();
  if (!raw) return;

  const source = sanitizeLatex(raw);
  if (source !== raw) {
    setFieldValue(answerField, source);
  }

  try {
    const ast = parseBooleanExpression(source);
    setFieldValue(answerField, formatAstForAnswerField(ast));
  } catch {
    // If the current content can't be parsed, leave it unchanged
  }
}

function formatAstForAnswerField(ast) {
  const latex = astToLatex(ast, state.notationId);

  if (state.notationId !== "aqa") {
    return latex;
  }

  return latex.replace(/\\,?\\cdot\\,?/g, ".");
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatHintExpressionForNotation(expression, notationId) {
  if (notationId !== "logic") {
    return expression;
  }

  const withPrefixNot = expression.replace(/([A-Za-z0-9\)])'/g, "¬$1");
  return withPrefixNot
    .replace(/\s*\+\s*/g, " ∨ ")
    .replace(/\s*\.\s*/g, " ∧ ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatHintExpressionHtml(expression, notationId) {
  if (notationId === "logic") {
    return escapeHtml(formatHintExpressionForNotation(expression, notationId));
  }

  return buildAqaHintExpressionHtml(String(expression));
}

function buildAqaHintExpressionHtml(expression) {
  function readGroup(source, startIndex) {
    let depth = 0;
    for (let index = startIndex; index < source.length; index += 1) {
      if (source[index] === "(") {
        depth += 1;
      } else if (source[index] === ")") {
        depth -= 1;
        if (depth === 0) {
          return {
            endIndex: index,
            html: `(${buildAqaHintExpressionHtml(source.slice(startIndex + 1, index))})`,
          };
        }
      }
    }

    return {
      endIndex: startIndex,
      html: escapeHtml(source[startIndex]),
    };
  }

  let html = "";

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];

    if (char === "'") {
      continue;
    }

    let unitHtml = "";

    if (char === "(") {
      const group = readGroup(expression, index);
      unitHtml = group.html;
      index = group.endIndex;
    } else if (/[A-Za-z0-9]/.test(char)) {
      let endIndex = index + 1;
      while (endIndex < expression.length && /[A-Za-z0-9]/.test(expression[endIndex])) {
        endIndex += 1;
      }
      unitHtml = escapeHtml(expression.slice(index, endIndex));
      index = endIndex - 1;
    } else {
      html += escapeHtml(char);
      continue;
    }

    let primeIndex = index + 1;
    while (primeIndex < expression.length && expression[primeIndex] === "'") {
      unitHtml = `<span class="overbar-symbol">${unitHtml}</span>`;
      primeIndex += 1;
    }

    html += unitHtml;
    index = primeIndex - 1;
  }

  return html;
}

function formatHintMessageHtml(message, notationId) {
  const segments = String(message).split(/`([^`]+)`/g);
  return segments
    .map((segment, index) => {
      if (index % 2 === 1) {
        const formattedHtml = formatHintExpressionHtml(segment, notationId);
        return `<span class="hint-expression">${formattedHtml}</span>`;
      }
      return escapeHtml(segment);
    })
    .join("");
}

function renderHint() {
  const latestAst = state.equivalentSubmissions.at(-1) ?? null;
  const hintSourceAst = latestAst ?? state.challenge.initialAst;

  const latestGateCount = gateCountAst(hintSourceAst);
  if (latestAst && latestGateCount <= state.challenge.minimalGateCount) {
    hintField.classList.add("hidden");
    setFieldValue(hintField, "");
    hintText.innerHTML = formatHintMessageHtml(
      "Your latest correct line is already at the best possible gate count for this challenge.",
      state.notationId,
    );
    return;
  }

  const hint = findGateReductionHint(hintSourceAst);
  if (!hint) {
    hintField.classList.add("hidden");
    setFieldValue(hintField, "");
    hintText.innerHTML = formatHintMessageHtml(
      "Look for a redundant `0` or `1`, a complement pair, absorption, or a negated bracket that can be opened up.",
      state.notationId,
    );
    return;
  }

  if (hint.focusAst) {
    hintField.classList.remove("hidden");
    setFieldValue(hintField, astToLatex(hint.focusAst, state.notationId));
  } else {
    hintField.classList.add("hidden");
    setFieldValue(hintField, "");
  }

  hintText.innerHTML = formatHintMessageHtml(hint.message, state.notationId);
}

function findGateReductionHint(ast) {
  if (!ast) {
    return null;
  }

  if (ast.type === "not" && ast.expr?.type === "not") {
    return {
      focusAst: ast,
      message: "This part has a double negation. Remove the two `NOT`s together.",
    };
  }

  if (ast.type === "not") {
    const innerHint = findGateReductionHint(ast.expr);
    if (innerHint) {
      return innerHint;
    }

    if (ast.expr?.type === "or" || ast.expr?.type === "and") {
      return {
        focusAst: ast,
        message: "Apply De Morgan's law to this negated bracket. That should open a simpler next step.",
      };
    }

    return null;
  }

  if (ast.type === "or" || ast.type === "and") {
    const operands = flattenAssociative(ast, ast.type);

    if (ast.type === "or") {
      if (operands.some((operand) => operand.type === "const" && operand.value)) {
        return {
          focusAst: ast,
          message: "This bracket contains `+ 1`. The whole OR expression collapses to `1`.",
        };
      }

      if (operands.some((operand) => operand.type === "const" && !operand.value)) {
        return {
          focusAst: ast,
          message: "This part contains `+ 0`. Use the identity law to remove the `0` term.",
        };
      }
    }

    if (ast.type === "and") {
      if (operands.some((operand) => operand.type === "const" && !operand.value)) {
        return {
          focusAst: ast,
          message: "This bracket contains `.0`. The whole AND expression collapses to `0`.",
        };
      }

      if (operands.some((operand) => operand.type === "const" && operand.value)) {
        return {
          focusAst: ast,
          message: "This part contains `.1`. Use the identity law to remove the `1` term.",
        };
      }
    }

    const duplicateOperand = findDuplicateOperand(operands);
    if (duplicateOperand) {
      return {
        focusAst: ast,
        message: ast.type === "or"
          ? "This part repeats the same term in an OR. Use idempotent law: `X + X = X`."
          : "This part repeats the same term in an AND. Use idempotent law: `X.X = X`.",
      };
    }

    if (hasComplementPair(operands)) {
      return {
        focusAst: ast,
        message: ast.type === "or"
          ? "This part contains a complement pair. Use `X + X' = 1`."
          : "This part contains a complement pair. Use `X.X' = 0`.",
      };
    }

    const absorptionMatch = findAbsorptionMatch(operands, ast.type);
    if (absorptionMatch) {
      return {
        focusAst: ast,
        message: ast.type === "or"
          ? "This matches absorption. Use `X + X.Y = X`."
          : "This matches absorption. Use `X.(X + Y) = X`.",
      };
    }

    if (ast.type === "and") {
      const distributionMatch = findDistributiveComplementMatch(operands);
      if (distributionMatch) {
        return {
          focusAst: ast,
          message:
            "Two OR brackets share a common term, and the remaining terms are complements. Use distribution: `(X + Y).(X + Y') = X`.",
        };
      }
    }

    if (ast.type === "or") {
      const dualDistributionMatch = findDualDistributiveComplementMatch(operands);
      if (dualDistributionMatch) {
        return {
          focusAst: ast,
          message:
            "Two AND brackets share a common term, and the remaining terms are complements. Use distribution: `X.Y + X.Y' = X`.",
        };
      }
    }
  }

  if (ast.type === "and" || ast.type === "or") {
    return findGateReductionHint(ast.left) ?? findGateReductionHint(ast.right);
  }

  return null;
}

function flattenAssociative(node, kind) {
  if (!node || node.type !== kind) {
    return [node];
  }

  return [
    ...flattenAssociative(node.left, kind),
    ...flattenAssociative(node.right, kind),
  ];
}

function astEquals(left, right) {
  if (!left || !right || left.type !== right.type) {
    return false;
  }

  if (left.type === "const") {
    return left.value === right.value;
  }

  if (left.type === "var") {
    return left.name === right.name;
  }

  if (left.type === "not") {
    return astEquals(left.expr, right.expr);
  }

  return astEquals(left.left, right.left) && astEquals(left.right, right.right);
}

function isComplementPair(left, right) {
  if (left?.type === "not") {
    return astEquals(left.expr, right);
  }

  if (right?.type === "not") {
    return astEquals(right.expr, left);
  }

  return false;
}

function hasComplementPair(operands) {
  for (let leftIndex = 0; leftIndex < operands.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < operands.length; rightIndex += 1) {
      if (isComplementPair(operands[leftIndex], operands[rightIndex])) {
        return true;
      }
    }
  }

  return false;
}

function findDuplicateOperand(operands) {
  for (let leftIndex = 0; leftIndex < operands.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < operands.length; rightIndex += 1) {
      if (astEquals(operands[leftIndex], operands[rightIndex])) {
        return operands[leftIndex];
      }
    }
  }

  return null;
}

function findAbsorptionMatch(operands, outerKind) {
  const innerKind = outerKind === "or" ? "and" : "or";

  for (const operand of operands) {
    for (const other of operands) {
      if (operand === other || other?.type !== innerKind) {
        continue;
      }

      const innerOperands = flattenAssociative(other, innerKind);
      if (innerOperands.some((innerOperand) => astEquals(innerOperand, operand))) {
        return { keep: operand, drop: other };
      }
    }
  }

  return null;
}

function findDistributiveComplementMatch(operands) {
  for (let leftIndex = 0; leftIndex < operands.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < operands.length; rightIndex += 1) {
      const left = operands[leftIndex];
      const right = operands[rightIndex];

      if (left?.type !== "or" || right?.type !== "or") {
        continue;
      }

      const leftTerms = flattenAssociative(left, "or");
      const rightTerms = flattenAssociative(right, "or");

      for (let leftTermIndex = 0; leftTermIndex < leftTerms.length; leftTermIndex += 1) {
        for (let rightTermIndex = 0; rightTermIndex < rightTerms.length; rightTermIndex += 1) {
          if (!astEquals(leftTerms[leftTermIndex], rightTerms[rightTermIndex])) {
            continue;
          }

          const leftRemainder = leftTerms.filter((_, index) => index !== leftTermIndex);
          const rightRemainder = rightTerms.filter((_, index) => index !== rightTermIndex);

          if (leftRemainder.length !== 1 || rightRemainder.length !== 1) {
            continue;
          }

          if (isComplementPair(leftRemainder[0], rightRemainder[0])) {
            return {
              common: leftTerms[leftTermIndex],
              leftRemainder: leftRemainder[0],
              rightRemainder: rightRemainder[0],
            };
          }
        }
      }
    }
  }

  return null;
}

function findDualDistributiveComplementMatch(operands) {
  for (let leftIndex = 0; leftIndex < operands.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < operands.length; rightIndex += 1) {
      const left = operands[leftIndex];
      const right = operands[rightIndex];

      if (left?.type !== "and" || right?.type !== "and") {
        continue;
      }

      const leftTerms = flattenAssociative(left, "and");
      const rightTerms = flattenAssociative(right, "and");

      for (let leftTermIndex = 0; leftTermIndex < leftTerms.length; leftTermIndex += 1) {
        for (let rightTermIndex = 0; rightTermIndex < rightTerms.length; rightTermIndex += 1) {
          if (!astEquals(leftTerms[leftTermIndex], rightTerms[rightTermIndex])) {
            continue;
          }

          const leftRemainder = leftTerms.filter((_, index) => index !== leftTermIndex);
          const rightRemainder = rightTerms.filter((_, index) => index !== rightTermIndex);

          if (leftRemainder.length !== 1 || rightRemainder.length !== 1) {
            continue;
          }

          if (isComplementPair(leftRemainder[0], rightRemainder[0])) {
            return {
              common: leftTerms[leftTermIndex],
              leftRemainder: leftRemainder[0],
              rightRemainder: rightRemainder[0],
            };
          }
        }
      }
    }
  }

  return null;
}

function renderGateMetrics() {
  minimalGateCount.textContent = `Target gates: ≤ ${state.challenge.minimalGateCount}`;
}

function insertOverbarPlaceholder() {
  answerField.focus();

  const hasSelection = fieldHasSelection(answerField);
  const insertLatex = hasSelection ? "\\overline{#@}" : "\\overline{#?}";
  const selectionMode = hasSelection ? "after" : "placeholder";

  if (typeof answerField.executeCommand === "function") {
    const inserted = answerField.executeCommand([
      "insert",
      insertLatex,
      { selectionMode },
    ]);

    if (inserted) {
      return;
    }
  }

  if (typeof answerField.insert === "function") {
    answerField.insert(insertLatex, { selectionMode });
    return;
  }

  insertIntoAnswer("\\overline{}");
}

function renderTip() {
  inputTip.textContent = "";
}

function insertIntoAnswer(content) {
  answerField.focus();

  if (typeof answerField.executeCommand === "function") {
    const inserted = answerField.executeCommand([
      "insert",
      content,
      { format: "latex" },
    ]);

    if (inserted) {
      return;
    }
  }

  if (typeof answerField.insert === "function") {
    answerField.insert(content, { format: "latex" });
    return;
  }

  const current = getFieldValue(answerField);
  setFieldValue(answerField, `${current}${content}`);
}

function isUnwrapModeActive() {
  return state.unwrapCandidates.length > 0 && state.unwrapCandidateIndex >= 0;
}

function cycleUnwrapCandidate() {
  if (state.notationId !== "aqa") {
    cancelUnwrapMode();
    return false;
  }

  const source = isUnwrapModeActive()
    ? state.unwrapSource
    : sanitizeLatex(getFieldValue(answerField)).trim();
  if (!source) {
    cancelUnwrapMode();
    return false;
  }

  if (!isUnwrapModeActive() || state.unwrapSource !== source) {
    const candidates = collectUnwrapCandidates(source);
    if (candidates.length === 0) {
      cancelUnwrapMode();
      return false;
    }

    captureUnwrapFeedbackSnapshot();
    captureUnwrapSelectionSnapshot();
    state.unwrapSource = source;
    state.unwrapCandidates = candidates;
    state.unwrapCandidateIndex = 0;
  } else {
    state.unwrapCandidateIndex = (state.unwrapCandidateIndex + 1) % state.unwrapCandidates.length;
  }

  renderUnwrapCandidate();
  scheduleUnwrapModeTimeout();
  return true;
}

function confirmUnwrapCandidate() {
  if (!isUnwrapModeActive()) {
    return false;
  }

  const source = state.unwrapSource;
  if (!source) {
    cancelUnwrapMode();
    return false;
  }

  const candidate = state.unwrapCandidates[state.unwrapCandidateIndex];
  if (!candidate) {
    cancelUnwrapMode();
    return false;
  }

  let nextLatex = "";

  if (candidate.kind === "latex-overbar") {
    nextLatex = `${source.slice(0, candidate.start)}${source.slice(candidate.innerStart, candidate.end)}${source.slice(candidate.end + 1)}`;
  } else if (candidate.kind === "latex-wrap-target") {
    nextLatex = `${source.slice(0, candidate.start)}\\overline{${source.slice(candidate.start, candidate.end + 1)}}${source.slice(candidate.end + 1)}`;
  } else {
    const ast = parseCurrentAnswerAst(source);
    if (!ast) {
      cancelUnwrapMode();
      return false;
    }

    const nextAst = replaceNodeAtPath(ast, candidate.path, (node) => cloneBooleanAst(node.expr));
    nextLatex = formatAstForAnswerField(nextAst);
  }

  cancelUnwrapMode();
  setFieldValue(answerField, nextLatex);
  setFeedback(candidate.kind === "latex-overbar" ? "Removed one NOT layer." : "Added one NOT layer.", "info", []);
  renderTouchUnwrapActionButtons();
  return true;
}

function cancelUnwrapMode(options = {}) {
  const { restoreFeedback = false, restoreSelection = false } = options;
  const restoreSource = state.unwrapSource;

  if (state.unwrapTimeoutId !== null) {
    clearTimeout(state.unwrapTimeoutId);
  }

  if (restoreSource) {
    setAnswerFieldLatexSilently(restoreSource);
  }

  state.unwrapTimeoutId = null;
  state.unwrapCandidates = [];
  state.unwrapCandidateIndex = -1;
  state.unwrapSource = "";
  syncAnswerFieldUnwrapModeClass();

  if (restoreSelection) {
    restoreUnwrapSelectionSnapshot();
  } else {
    state.unwrapSelectionSnapshot = null;
    collapseAnswerSelection();
  }

  if (restoreFeedback) {
    restoreUnwrapFeedbackSnapshot();
  } else {
    state.unwrapFeedbackSnapshot = null;
  }

  renderTouchUnwrapActionButtons();
}

function scheduleUnwrapModeTimeout() {
  if (state.unwrapTimeoutId !== null) {
    clearTimeout(state.unwrapTimeoutId);
  }

  state.unwrapTimeoutId = setTimeout(() => {
    cancelUnwrapMode({ restoreFeedback: true });
  }, 5000);
}

function renderUnwrapCandidate() {
  if (!isUnwrapModeActive()) {
    cancelUnwrapMode();
    return;
  }

  const candidate = state.unwrapCandidates[state.unwrapCandidateIndex];
  if (!candidate) {
    cancelUnwrapMode();
    return;
  }

  syncAnswerFieldUnwrapModeClass();
  renderAnswerFieldWithUnwrapHighlight(candidate);
  setUnwrapFeedback();
  renderTouchUnwrapActionButtons();
}

function captureUnwrapFeedbackSnapshot() {
  if (state.unwrapFeedbackSnapshot !== null) {
    return;
  }

  state.unwrapFeedbackSnapshot = {
    summaryHtml: feedbackSummary.innerHTML,
    summaryClassName: feedbackSummary.className,
    detailsHtml: feedbackDetails.innerHTML,
  };
}

function restoreUnwrapFeedbackSnapshot() {
  if (state.unwrapFeedbackSnapshot === null) {
    return;
  }

  feedbackSummary.innerHTML = state.unwrapFeedbackSnapshot.summaryHtml;
  feedbackSummary.className = state.unwrapFeedbackSnapshot.summaryClassName;
  feedbackDetails.innerHTML = state.unwrapFeedbackSnapshot.detailsHtml;
  state.unwrapFeedbackSnapshot = null;
}

function setUnwrapFeedback() {
  const touchMode = shouldUseCustomTouchKeypad();
  feedbackSummary.innerHTML = touchMode
    ? `<span class="feedback-unwrap-highlight">Tap <kbd>Cycle</kbd> to cycle groups, <kbd>Toggle</kbd> to toggle NOT on/off</span>`
    : `<span class="feedback-unwrap-highlight">Press <kbd>&#92;</kbd> to cycle, <kbd>ENTER</kbd> to toggle NOT on/off, <kbd>ESC</kbd> to cancel</span>`;
  feedbackSummary.className = `${toneClass("info")} feedback-unwrap-active`;
  feedbackDetails.innerHTML = "";
}

function captureUnwrapSelectionSnapshot() {
  if (state.unwrapSelectionSnapshot !== null) {
    return;
  }

  const snapshot = getAnswerSelectionSnapshot();
  state.unwrapSelectionSnapshot = snapshot;
}

function restoreUnwrapSelectionSnapshot() {
  const snapshot = state.unwrapSelectionSnapshot;
  if (!snapshot) {
    return;
  }

  setAnswerSelection(snapshot.start, snapshot.end);
  state.unwrapSelectionSnapshot = null;
}

function getAnswerSelectionSnapshot() {
  const fallback = getFieldValue(answerField).length;
  const selection = answerField.selection;
  const ranges = selection?.ranges;

  if (!Array.isArray(ranges) || ranges.length === 0 || !Array.isArray(ranges[0])) {
    return { start: fallback, end: fallback };
  }

  const [rawStart, rawEnd] = ranges[0];
  const start = Number(rawStart);
  const end = Number(rawEnd);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { start: fallback, end: fallback };
  }

  return {
    start: Math.max(0, Math.min(start, end)),
    end: Math.max(start, end),
  };
}

function syncAnswerFieldUnwrapModeClass() {
  const active = isUnwrapModeActive() && state.notationId === "aqa";
  answerField.classList.toggle("answer-field-unwrap-mode", active);
}

function parseCurrentAnswerAst(source = sanitizeLatex(getFieldValue(answerField)).trim()) {
  if (!source) {
    return null;
  }

  try {
    return parseBooleanExpression(source);
  } catch {
    return null;
  }
}

function collectUnwrapCandidates(source) {
  if (state.notationId === "aqa") {
    return collectAqaToggleCandidates(source);
  }

  const ast = parseCurrentAnswerAst(source);
  if (!ast) {
    return [];
  }

  const candidates = [];

  function walk(node, path) {
    if (!node) {
      return;
    }

    if (node.type === "not") {
      candidates.push({
        kind: "ast-not",
        path,
        latex: formatAstForAnswerField(node),
      });
      walk(node.expr, [...path, "expr"]);
      return;
    }

    if (node.type === "and" || node.type === "or") {
      walk(node.left, [...path, "left"]);
      walk(node.right, [...path, "right"]);
    }
  }

  walk(ast, []);
  return candidates;
}

function collectAqaToggleCandidates(source) {
  if (!source) {
    return [];
  }

  const marker = "\\overline{";
  const leftParenMarker = "\\left(";
  const rightParenMarker = "\\right)";
  const candidates = [];
  const seenRanges = new Set();
  const overbarInnerRanges = new Set();

  const pushWrapTarget = (start, end) => {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= source.length) {
      return;
    }

    const innerKey = `${start}:${end}`;
    if (overbarInnerRanges.has(innerKey)) {
      return;
    }

    const key = innerKey;
    if (seenRanges.has(key)) {
      return;
    }

    seenRanges.add(key);
    candidates.push({
      kind: "latex-wrap-target",
      start,
      end,
      latex: source.slice(start, end + 1),
    });
  };

  function walk(start, end, suppressLeadingOverbar = false) {
    if (start > end) {
      return;
    }

    collectImplicitChainGroupCandidates(source, start, end, pushWrapTarget);
    const firstTokenIndex = skipAqaFormattingForward(source, start, end);

    for (let index = start; index <= end; index += 1) {
      const char = source[index];

      if (char === " " || char === "\t" || char === "\n") {
        continue;
      }

      if (source.startsWith(marker, index)) {
        const openBraceIndex = index + marker.length - 1;
        const closeBraceIndex = findMatchingLatexBrace(source, openBraceIndex);
        if (closeBraceIndex < 0 || closeBraceIndex > end) {
          continue;
        }

        // Reserve this inner span so we don't also offer it as an "add NOT"
        // target, which causes confusing duplicate/contradictory actions.
        overbarInnerRanges.add(`${openBraceIndex + 1}:${closeBraceIndex - 1}`);

        const isLeadingToken = index === firstTokenIndex;
        if (!(suppressLeadingOverbar && isLeadingToken)) {
          candidates.push({
            kind: "latex-overbar",
            start: index,
            innerStart: openBraceIndex + 1,
            end: closeBraceIndex,
            latex: source.slice(index, closeBraceIndex + 1),
          });
        }

        const innerStart = openBraceIndex + 1;
        const innerEnd = closeBraceIndex - 1;
        walk(innerStart, innerEnd, isRangeOnlyLeadingOverbar(source, innerStart, innerEnd));
        index = closeBraceIndex;
        continue;
      }

      if (source.startsWith(leftParenMarker, index)) {
        const closeLeftRightIndex = findMatchingLatexRightParen(source, index);
        if (closeLeftRightIndex < 0 || closeLeftRightIndex > end) {
          continue;
        }

        pushWrapTarget(index, closeLeftRightIndex);
        const innerStart = index + leftParenMarker.length;
        const innerEnd = closeLeftRightIndex - rightParenMarker.length;
        walk(innerStart, innerEnd, suppressLeadingOverbar);
        index = closeLeftRightIndex;
        continue;
      }

      if (char === "(") {
        const closeParenIndex = findMatchingParen(source, index);
        if (closeParenIndex < 0 || closeParenIndex > end) {
          continue;
        }

        pushWrapTarget(index, closeParenIndex);
        walk(index + 1, closeParenIndex - 1, suppressLeadingOverbar);
        index = closeParenIndex;
        continue;
      }

      if (/[A-Za-z0-9]/.test(char)) {
        let atomEnd = index;
        while (atomEnd + 1 <= end && /[A-Za-z0-9]/.test(source[atomEnd + 1])) {
          atomEnd += 1;
        }

        pushWrapTarget(index, atomEnd);
        index = atomEnd;
      }
    }
  }

  walk(0, source.length - 1, false);
  return candidates;
}

function isRangeOnlyLeadingOverbar(source, start, end) {
  const marker = "\\overline{";
  const firstToken = skipAqaFormattingForward(source, start, end);
  if (firstToken > end || !source.startsWith(marker, firstToken)) {
    return false;
  }

  const closeBrace = findMatchingLatexBrace(source, firstToken + marker.length - 1);
  if (closeBrace < 0 || closeBrace > end) {
    return false;
  }

  const remainderStart = skipAqaFormattingForward(source, closeBrace + 1, end);
  return remainderStart > end;
}

function collectImplicitChainGroupCandidates(source, start, end, pushWrapTarget) {
  const orTerms = splitTopLevelTermsByOperator(source, start, end, "or");
  pushContiguousTermGroups(source, orTerms, pushWrapTarget);

  for (const term of orTerms) {
    const andTerms = splitTopLevelTermsByOperator(source, term.start, term.end, "and");
    pushContiguousTermGroups(source, andTerms, pushWrapTarget);
  }
}

function pushContiguousTermGroups(source, terms, pushWrapTarget) {
  if (!Array.isArray(terms) || terms.length < 2) {
    return;
  }

  for (let left = 0; left < terms.length; left += 1) {
    for (let right = left + 1; right < terms.length; right += 1) {
      const start = terms[left].start;
      const end = terms[right].end;

      // Prefer explicit grouped targets like `(A+B)` or `\left(A+B\right)`
      // over duplicate implicit inner spans like `A+B`.
      if (isImmediatelyEnclosedByGroupDelimiters(source, start, end)) {
        continue;
      }

      pushWrapTarget(start, end);
    }
  }
}

function isImmediatelyEnclosedByGroupDelimiters(source, start, end) {
  if (start <= 0 || end >= source.length - 1) {
    return false;
  }

  if (source[start - 1] === "(" && source[end + 1] === ")") {
    return true;
  }

  const leftParenMarker = "\\left(";
  const rightParenMarker = "\\right)";
  const leftStart = start - leftParenMarker.length;

  if (leftStart < 0) {
    return false;
  }

  return source.startsWith(leftParenMarker, leftStart)
    && source.startsWith(rightParenMarker, end + 1);
}

function splitTopLevelTermsByOperator(source, start, end, operatorKind) {
  const terms = [];
  let termStart = skipAqaFormattingForward(source, start, end);
  let index = termStart;

  while (index <= end) {
    if (source.startsWith("\\overline{", index)) {
      const closeBrace = findMatchingLatexBrace(source, index + "\\overline{".length - 1);
      if (closeBrace < 0 || closeBrace > end) {
        break;
      }
      index = closeBrace + 1;
      continue;
    }

    if (source.startsWith("\\left(", index)) {
      const closeLeftRight = findMatchingLatexRightParen(source, index);
      if (closeLeftRight < 0 || closeLeftRight > end) {
        break;
      }
      index = closeLeftRight + 1;
      continue;
    }

    if (source[index] === "(") {
      const closeParen = findMatchingParen(source, index);
      if (closeParen < 0 || closeParen > end) {
        break;
      }
      index = closeParen + 1;
      continue;
    }

    const opLength = getTopLevelAqaOperatorLength(source, index, operatorKind);
    if (opLength > 0) {
      const termEnd = skipAqaFormattingBackward(source, index - 1, termStart);
      if (termStart <= termEnd) {
        terms.push({ start: termStart, end: termEnd });
      }

      index += opLength;
      termStart = skipAqaFormattingForward(source, index, end);
      index = termStart;
      continue;
    }

    index += 1;
  }

  const finalEnd = skipAqaFormattingBackward(source, end, termStart);
  if (termStart <= finalEnd) {
    terms.push({ start: termStart, end: finalEnd });
  }

  return terms;
}

function getTopLevelAqaOperatorLength(source, index, operatorKind) {
  if (operatorKind === "or") {
    if (source[index] === "+") {
      return 1;
    }
    if (source.startsWith("\\,+\\,", index)) {
      return "\\,+\\,".length;
    }
    if (source.startsWith("\\lor", index)) {
      return "\\lor".length;
    }
    return 0;
  }

  if (source[index] === ".") {
    return 1;
  }
  if (source.startsWith("\\cdot", index)) {
    return "\\cdot".length;
  }
  if (source.startsWith("\\,\\cdot\\,", index)) {
    return "\\,\\cdot\\,".length;
  }
  if (source.startsWith("\\land", index)) {
    return "\\land".length;
  }
  return 0;
}

function skipAqaFormattingForward(source, index, end) {
  let cursor = index;
  while (cursor <= end) {
    if (source[cursor] === " " || source[cursor] === "\t" || source[cursor] === "\n") {
      cursor += 1;
      continue;
    }
    if (source.startsWith("\\,", cursor)) {
      cursor += 2;
      continue;
    }
    break;
  }
  return cursor;
}

function skipAqaFormattingBackward(source, index, minIndex) {
  let cursor = index;
  while (cursor >= minIndex) {
    const char = source[cursor];
    if (char === " " || char === "\t" || char === "\n") {
      cursor -= 1;
      continue;
    }
    if (cursor >= minIndex + 1 && source[cursor] === "," && source[cursor - 1] === "\\") {
      cursor -= 2;
      continue;
    }
    break;
  }
  return cursor;
}

function collectOverbarCandidates(source) {
  const marker = "\\overline{";
  const candidates = [];

  for (let index = 0; index < source.length; index += 1) {
    const markerIndex = source.indexOf(marker, index);
    if (markerIndex < 0) {
      break;
    }

    const openBraceIndex = markerIndex + marker.length - 1;
    const closeBraceIndex = findMatchingLatexBrace(source, openBraceIndex);
    if (closeBraceIndex < 0) {
      index = markerIndex;
      continue;
    }

    candidates.push({
      kind: "latex-overbar",
      start: markerIndex,
      innerStart: openBraceIndex + 1,
      end: closeBraceIndex,
      latex: source.slice(markerIndex, closeBraceIndex + 1),
    });

    // Advance by one from the current match so nested overbars that start
    // immediately after '{' are still discovered on the next pass.
    index = markerIndex;
  }

  return candidates;
}

function renderAnswerFieldWithUnwrapHighlight(candidate) {
  if (!candidate || state.notationId !== "aqa") {
    setAnswerFieldLatexSilently(state.unwrapSource);
    return;
  }

  const start = Number.isInteger(candidate.start) ? candidate.start : -1;
  const end = Number.isInteger(candidate.end) ? candidate.end : -1;
  if (start < 0 || end < start || end >= state.unwrapSource.length) {
    setAnswerFieldLatexSilently(state.unwrapSource);
    return;
  }

  const highlightColor = state.themeId === "light" ? "#d100b8" : "#ffeb3b";
  const highlightedLatex = `${state.unwrapSource.slice(0, start)}\\textcolor{${highlightColor}}{${candidate.latex ?? state.unwrapSource.slice(start, end + 1)}}${state.unwrapSource.slice(end + 1)}`;
  setAnswerFieldLatexSilently(highlightedLatex);
}

function setAnswerFieldLatexSilently(latex) {
  state.suppressAnswerInputHandler = true;
  try {
    setFieldValue(answerField, latex);
  } finally {
    state.suppressAnswerInputHandler = false;
  }
}

function findMatchingLatexBrace(text, openBraceIndex) {
  if (openBraceIndex < 0 || text[openBraceIndex] !== "{") {
    return -1;
  }

  let depth = 0;
  for (let i = openBraceIndex; i < text.length; i += 1) {
    if (text[i] === "{") {
      depth += 1;
      continue;
    }

    if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function findMatchingParen(text, openParenIndex) {
  if (openParenIndex < 0 || text[openParenIndex] !== "(") {
    return -1;
  }

  let depth = 0;
  for (let i = openParenIndex; i < text.length; i += 1) {
    if (text[i] === "(") {
      depth += 1;
      continue;
    }

    if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function findMatchingLatexRightParen(text, leftMarkerIndex) {
  const leftParenMarker = "\\left(";
  const rightParenMarker = "\\right)";

  if (leftMarkerIndex < 0 || !text.startsWith(leftParenMarker, leftMarkerIndex)) {
    return -1;
  }

  let depth = 0;
  for (let i = leftMarkerIndex; i < text.length; i += 1) {
    if (text.startsWith(leftParenMarker, i)) {
      depth += 1;
      i += leftParenMarker.length - 1;
      continue;
    }

    if (text.startsWith(rightParenMarker, i)) {
      depth -= 1;
      if (depth === 0) {
        return i + rightParenMarker.length - 1;
      }
      i += rightParenMarker.length - 1;
    }
  }

  return -1;
}

function setAnswerSelection(start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return;
  }

  try {
    answerField.selection = {
      ranges: [[start, end]],
      direction: "forward",
    };
    return;
  } catch {
    // Fall through.
  }

  try {
    answerField.executeCommand?.(["setSelection", start, end]);
  } catch {
    // Ignore unavailable commands.
  }
}

function collapseAnswerSelection() {
  const length = getFieldValue(answerField).length;
  setAnswerSelection(length, length);
}

function replaceNodeAtPath(ast, path, replacer) {
  if (!Array.isArray(path) || path.length === 0) {
    return replacer(ast);
  }

  const [head, ...tail] = path;
  const cloned = cloneBooleanAst(ast);

  if (head === "expr") {
    cloned.expr = replaceNodeAtPath(cloned.expr, tail, replacer);
    return cloned;
  }

  if (head === "left") {
    cloned.left = replaceNodeAtPath(cloned.left, tail, replacer);
    return cloned;
  }

  if (head === "right") {
    cloned.right = replaceNodeAtPath(cloned.right, tail, replacer);
    return cloned;
  }

  return cloned;
}

function cloneBooleanAst(node) {
  if (!node) {
    return node;
  }

  if (node.type === "var") {
    return { type: "var", name: node.name };
  }

  if (node.type === "const") {
    return { type: "const", value: node.value };
  }

  if (node.type === "not") {
    return {
      type: "not",
      expr: cloneBooleanAst(node.expr),
    };
  }

  if (node.type === "and" || node.type === "or") {
    return {
      type: node.type,
      left: cloneBooleanAst(node.left),
      right: cloneBooleanAst(node.right),
    };
  }

  if (typeof structuredClone === "function") {
    return structuredClone(node);
  }

  return JSON.parse(JSON.stringify(node));
}

function sanitizeLatex(latex) {
  const emptyOverbar = /\\overline\{(\s|\\,)*\}/g;
  let prev;
  do {
    prev = latex;
    latex = latex.replace(emptyOverbar, "");
  } while (latex !== prev);
  return latex;
}

function checkAnswer() {
  const raw = getFieldValue(answerField).trim();
  if (!raw) {
    setFeedback("Enter an expression before checking.", "warn", []);
    return;
  }
  const source = sanitizeLatex(raw);
  if (source !== raw) setFieldValue(answerField, source);

  let ast;
  try {
    ast = parseBooleanExpression(source);
    setFieldValue(answerField, formatAstForAnswerField(ast));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not parse expression.";
    setFeedback("There is an error in your expression.", "error", [
      ["Hint", "Check your brackets and operators, then try again."],
      ["Details", message],
    ]);
    return;
  }

  const variables = [...extractVariables(ast)];
  const invalidVariables = variables.filter((name) => !state.challenge.variables.includes(name));

  if (invalidVariables.length > 0) {
    setFeedback("Expression uses variables not in this challenge.", "error", [
      ["Allowed variables", state.challenge.variables.join(", ")],
      ["Unexpected", invalidVariables.join(", ")],
    ]);
    return;
  }

  const evaluation = evaluateAgainstTruthTable(ast, state.challenge.variables, state.challenge.outputs);
  if (evaluation.error) {
    setFeedback("Expression could not be evaluated.", "error", [
      ["Details", evaluation.error],
    ]);
    return;
  }

  const equivalent = evaluation.equivalent;
  const studentGates = gateCountAst(ast);

  if (equivalent) {
    addEquivalentSubmission(ast);
    if (state.bestEquivalent === null || studentGates < state.bestEquivalent) {
      state.bestEquivalent = studentGates;
    }
  }

  renderGateMetrics();

  if (!equivalent) {
    setFeedback("Your expression is not equivalent.", "error", []);
    return;
  }

  if (studentGates <= state.challenge.minimalGateCount) {
    state.solved = true;
    setFeedback("Equivalent and minimal. You solved this challenge.", "success", []);
    hintArea.classList.remove("hidden");
    renderHint();
    return;
  }

  if (studentGates < state.challenge.initialGateCount) {
    setFeedback("Equivalent and simpler, but not yet minimal.", "good", []);
    return;
  }

  if (studentGates === state.challenge.initialGateCount) {
    setFeedback("Equivalent but same gate count. Try reducing further.", "warn", []);
    return;
  }

  setFeedback("Equivalent but uses more gates. Try another simplification path.", "warn", []);
}

function setFeedback(summary, tone, detailRows) {
  feedbackSummary.textContent = summary;
  feedbackSummary.className = toneClass(tone);

  feedbackDetails.innerHTML = detailRows
    .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function toneClass(tone) {
  switch (tone) {
      case "info":
        return "tone-info";
    case "success":
      return "tone-success";
    case "good":
      return "tone-good";
    case "warn":
      return "tone-warn";
    case "error":
      return "tone-error";
    default:
      return "tone-neutral";
  }
}

function setFieldValue(field, value) {
  if (typeof field.setValue === "function") {
    field.setValue(value);
  } else {
    field.value = value;
  }

  if (field === challengeField) {
    applyAdaptiveMathFieldScale(field, value, "challenge");
  }

  if (field === answerField) {
    applyAdaptiveMathFieldScale(field, value, "answer");
  }
}

function getFieldValue(field) {
  if (typeof field.getValue === "function") {
    return field.getValue("latex");
  }
  return String(field.value ?? "");
}

function fieldHasSelection(field) {
  if (typeof field.selectionIsCollapsed === "boolean") {
    return !field.selectionIsCollapsed;
  }

  if (typeof field.selectionIsCollapsed === "function") {
    return !field.selectionIsCollapsed();
  }

  const selection = field.selection;
  const ranges = selection?.ranges;

  if (!Array.isArray(ranges)) {
    return false;
  }

  return ranges.some((range) => {
    if (!Array.isArray(range) || range.length < 2) {
      return false;
    }

    return Number(range[0]) !== Number(range[1]);
  });
}

function refreshAdaptiveMathFieldSizes() {
  const challengeValue = getFieldValue(challengeField);
  applyAdaptiveMathFieldScale(challengeField, challengeValue, "challenge");

  const answerValue = getFieldValue(answerField);
  applyAdaptiveMathFieldScale(answerField, answerValue, "answer");

  const submissionFields = submissionHistory?.querySelectorAll?.(".submission-item") ?? [];
  for (const field of submissionFields) {
    const value = getFieldValue(field);
    applyAdaptiveMathFieldScale(field, value, "history");
  }
}

function applyAdaptiveMathFieldScale(field, latex, usage) {
  if (!field) {
    return;
  }

  const isNarrow = window.matchMedia?.("(max-width: 760px)")?.matches ?? false;
  if (!isNarrow) {
    setMathFieldScale(field, 1);
    return;
  }

  const minScale = usage === "answer" ? 0.62 : 0.56;

  const fit = () => {
    let scale = 1;
    setMathFieldScale(field, scale);

    const measureElement = getMathFieldMeasureElement(field);
    const isOverflowing = () => {
      const hostOverflow = (field.scrollWidth - field.clientWidth) > 1;
      const contentOverflow = measureElement
        ? (measureElement.scrollWidth - measureElement.clientWidth) > 1
        : false;
      return hostOverflow || contentOverflow;
    };

    let guard = 0;
    while (isOverflowing() && scale > minScale && guard < 30) {
      scale -= 0.02;
      setMathFieldScale(field, scale);
      guard += 1;
    }

    if (!isOverflowing()) {
      return;
    }

    const compactLength = estimateExpressionLength(latex);
    if (compactLength > 72) {
      scale = Math.min(scale, 0.6);
    } else if (compactLength > 62) {
      scale = Math.min(scale, 0.66);
    } else if (compactLength > 52) {
      scale = Math.min(scale, 0.72);
    } else if (compactLength > 44) {
      scale = Math.min(scale, 0.8);
    } else if (compactLength > 36) {
      scale = Math.min(scale, 0.88);
    }

    setMathFieldScale(field, Math.max(scale, minScale));
  };

  fit();
  requestAnimationFrame(fit);
}

function setMathFieldScale(field, scale) {
  const clamped = Math.max(0.6, Math.min(1, Number(scale) || 1));
  field.style.setProperty("--adaptive-scale", String(clamped));

  const root = field.shadowRoot;
  if (!root) {
    return;
  }

  const content = root.querySelector("[part='content']") || root.querySelector(".ML__content");
  if (content instanceof HTMLElement) {
    content.style.fontSize = `${clamped}em`;
  }
}

function estimateExpressionLength(latex) {
  return String(latex ?? "")
    .replace(/\\left|\\right|\\mathord|\\mathbin|\\,/g, "")
    .replace(/\\overline|\\lnot|\\land|\\lor|\\cdot/g, "X")
    .replace(/[{}\\\s]/g, "")
    .length;
}

function getMathFieldMeasureElement(field) {
  const root = field?.shadowRoot;
  if (!root) {
    return null;
  }

  return (
    root.querySelector("[part='content']")
    || root.querySelector(".ML__content")
    || root.querySelector("[part='container']")
  );
}


