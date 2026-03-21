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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Service worker registration failed", error);
    });
  });
}

const root = document.querySelector("#app");

root.innerHTML = `
  <main class="shell">
    <div class="top-controls">
      <button id="themeToggle" class="mode-toggle" type="button" aria-label="Toggle theme mode">
        <span class="theme-dark">Dark</span>
        <span class="mode-divider">|</span>
        <span class="theme-light">Light</span>
      </button>
      <button id="notationToggle" class="mode-toggle" type="button" aria-label="Toggle notation mode" title="Switch notation to match exam board style (AQA or OCR)">
        <span class="mode-aqa">AQA</span>
        <span class="mode-divider">|</span>
        <span class="mode-ocr">OCR</span>
      </button>
    </div>

    <header class="hero panel">
      <div class="hero-copy">
        <h1>Boolinator</h1>
      </div>
      <img
        class="hero-logo hero-logo-dark"
        src="./images/theBoolinator.png"
        alt="Boolinator"
        decoding="async"
      />
      <img
        class="hero-logo hero-logo-light"
        src="./images/theBoolinatorLight.png"
        alt="Boolinator"
        decoding="async"
      />
    </header>

    <section class="panel challenge">
      <div class="tile-head">
        <h2>Simplify the following Boolean expression</h2>
        <button id="newChallengeBtn" class="ghost-btn">New Question</button>
      </div>
      <math-field id="challengeField" read-only></math-field>
      <div class="metrics">
        <span id="minimalGateCount"></span>
      </div>
      <div id="submissionHistory" class="submission-history hidden" aria-live="polite"></div>
    </section>

    <section class="panel answer">
      <div class="tile-head answer-head">
        <h2>Enter your simplified expression</h2>
      </div>
      <p id="notationHelp" class="notation-help"></p>
      <math-field id="answerField" default-mode="math"></math-field>
      <div class="actions">
        <button id="clearBtn" class="ghost-btn">Clear</button>
        <button id="hintBtn" class="ghost-btn">Hint</button>
        <button id="checkBtn" class="primary-btn">Submit</button>
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
`;

const themeToggle = document.querySelector("#themeToggle");
const notationToggle = document.querySelector("#notationToggle");
const notationHelp = document.querySelector("#notationHelp");
const challengeField = document.querySelector("#challengeField");
const answerPanel = document.querySelector(".panel.answer");
const answerField = document.querySelector("#answerField");
const inputTip = document.querySelector("#inputTip");
const feedbackSummary = document.querySelector("#feedbackSummary");
const feedbackDetails = document.querySelector("#feedbackDetails");
const minimalGateCount = document.querySelector("#minimalGateCount");
const hintArea = document.querySelector("#hintArea");
const hintField = document.querySelector("#hintField");
const hintText = document.querySelector("#hintText");
const submissionHistory = document.querySelector("#submissionHistory");
let isTouchDevice = detectTouchDevice();

const state = {
  themeId: "dark",
  notationId: "aqa",
  challenge: null,
  solved: false,
  bestEquivalent: null,
  equivalentSubmissions: [],
  pendingTemplateExit: false,
};

let _originalKeybindings = null;
let answerFieldReconnectToken = 0;
let lastOutsideBlurTimestamp = 0;
let lastReopenRequestTimestamp = 0;
let lastPointerReopenTimestamp = 0;
const VK_DEBUG_OVERLAY_VERSION = "v34";
const keyboardDebug = createKeyboardDebugOverlay();

function createKeyboardDebugOverlay() {
  if (typeof document === "undefined") {
    return {
      isEnabled: () => false,
      log: () => {},
    };
  }

  const maxLines = 200;
  const lines = [];
  let enabled = false;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "vk-debug-toggle";
  toggle.textContent = "VK Debug";
  toggle.setAttribute("aria-label", "Toggle keyboard debug panel");

  const panel = document.createElement("section");
  panel.className = "vk-debug-panel hidden";
  panel.innerHTML = `
    <header class="vk-debug-header">
      <strong>Keyboard Debug <span class="vk-debug-version">${VK_DEBUG_OVERLAY_VERSION}</span></strong>
      <div class="vk-debug-actions">
        <button type="button" data-vkdebug="copy">Copy</button>
        <button type="button" data-vkdebug="clear">Clear</button>
        <button type="button" data-vkdebug="close">Close</button>
      </div>
    </header>
    <pre class="vk-debug-log" aria-live="polite"></pre>
  `;

  const logEl = panel.querySelector(".vk-debug-log");

  const render = () => {
    logEl.textContent = lines.join("\n");
    logEl.scrollTop = logEl.scrollHeight;
  };

  const setEnabled = (next) => {
    enabled = Boolean(next);
    panel.classList.toggle("hidden", !enabled);
    toggle.classList.toggle("is-active", enabled);
    toggle.textContent = enabled ? "VK Debug ON" : "VK Debug";

    try {
      window.localStorage.setItem("boolinator-vk-debug", enabled ? "1" : "0");
    } catch {
      // Ignore storage errors.
    }
  };

  const appendLine = (line) => {
    lines.push(line);
    if (lines.length > maxLines) {
      lines.splice(0, lines.length - maxLines);
    }
    render();
  };

  toggle.addEventListener("click", () => {
    setEnabled(!enabled);
    if (enabled) {
      appendLine("--- debug panel opened ---");
    }
  });

  panel.addEventListener("click", async (event) => {
    const action = event.target?.getAttribute?.("data-vkdebug");
    if (!action) {
      return;
    }

    if (action === "clear") {
      lines.length = 0;
      render();
      appendLine("--- log cleared ---");
      return;
    }

    if (action === "close") {
      setEnabled(false);
      return;
    }

    if (action === "copy") {
      const payload = lines.join("\n");
      try {
        await navigator.clipboard.writeText(payload);
        appendLine("[info] copied log to clipboard");
      } catch {
        appendLine("[warn] clipboard copy failed");
      }
    }
  });

  document.body.append(toggle, panel);

  try {
    const saved = window.localStorage.getItem("boolinator-vk-debug") === "1";
    const forced = new URLSearchParams(window.location.search).get("vkdebug") === "1";
    if (saved || forced) {
      setEnabled(true);
      appendLine("--- debug panel auto-enabled ---");
    }
  } catch {
    // Ignore query/storage errors.
  }

  return {
    isEnabled: () => enabled,
    log: (eventName, details = null) => {
      if (!enabled) {
        return;
      }

      const stamp = new Date().toISOString().slice(11, 23);
      if (details && Object.keys(details).length > 0) {
        appendLine(`[${stamp}] ${eventName} ${JSON.stringify(details)}`);
        return;
      }
      appendLine(`[${stamp}] ${eventName}`);
    },
  };
}

function describeElement(element) {
  if (!element || !(element instanceof Element)) {
    return "none";
  }

  const tag = element.tagName?.toLowerCase?.() ?? "unknown";
  const id = element.id ? `#${element.id}` : "";
  const cls = typeof element.className === "string" && element.className
    ? `.${element.className.trim().split(/\s+/).slice(0, 2).join(".")}`
    : "";
  return `${tag}${id}${cls}`;
}

function getAnswerFieldDebugSnapshot() {
  const ranges = answerField?.selection?.ranges;
  return {
    hasFocus: Boolean(answerField?.hasFocus?.()),
    activeElement: describeElement(document.activeElement),
    vkVisible: Boolean(window.mathVirtualKeyboard?.visible),
    blurProtected: answerField?.getAttribute?.("data-blur-protected") === "true",
    valueLength: getFieldValue(answerField).length,
    selection: Array.isArray(ranges) ? ranges.slice(0, 2) : null,
  };
}

function logKeyboardDebug(eventName, details = null) {
  if (!keyboardDebug.isEnabled()) {
    return;
  }

  keyboardDebug.log(eventName, {
    ...getAnswerFieldDebugSnapshot(),
    ...(details ?? {}),
  });
}

function hasRealAnswerFieldFocus() {
  return document.activeElement === answerField;
}

/**
 * Protects math-field elements from auto-focus on iOS PWA
 * Prevents virtual keyboard from looping when dismissed
 * @param {number} duration - How long to maintain protection (ms)
 */
function protectFieldsFromAutoFocus(duration = 500) {
  const field = answerField;
  if (field) {
    // Set protection flag
    field.setAttribute("data-blur-protected", "true");
    
    // If field has focus, blur it first
    if (field.hasFocus && field.hasFocus()) {
      field.blur();
    }
    
    // Remove protection after specified duration
    setTimeout(() => {
      field.removeAttribute("data-blur-protected");
    }, duration);
  }
}

function closeMathKeyboardAndClearFocus(duration = 500) {
  const mathFields = document.querySelectorAll("math-field");

  mathFields.forEach((field) => {
    if (field.hasFocus && field.hasFocus()) {
      field.blur();
    }
    field.setAttribute("data-blur-protected", "true");
  });

  answerField.classList.remove("answer-field-focused");

  hideAnswerVirtualKeyboard();
  forceAnswerFieldBlurReset();

  setTimeout(() => {
    mathFields.forEach((field) => {
      field.removeAttribute("data-blur-protected");
    });
  }, duration);
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

function restoreAnswerFieldCaretToEnd() {
  if (!answerField) {
    return;
  }

  const applySelection = () => {
    try {
      answerField.selection = { ranges: [[Infinity, Infinity]] };
    } catch {
      // MathLive can reject selection updates during some transitions.
    }
  };

  queueMicrotask(applySelection);
  setTimeout(applySelection, 10);
}

function reconnectAnswerFieldInputTarget({ reopenKeyboard = true } = {}) {
  logKeyboardDebug("reconnect:start", { reopenKeyboard });

  if (!answerField || !shouldUseVirtualKeyboard()) {
    logKeyboardDebug("reconnect:skip", { reason: "keyboard unavailable" });
    return;
  }

  if (answerField.getAttribute("data-blur-protected") === "true") {
    logKeyboardDebug("reconnect:skip", { reason: "blur protected" });
    return;
  }

  const reconnectToken = ++answerFieldReconnectToken;

  const reconnect = (attempt = 0) => {
    if (reconnectToken !== answerFieldReconnectToken) {
      return;
    }

    if (answerField.getAttribute("data-blur-protected") === "true") {
      return;
    }

    // iOS can leave MathLive internally focused while DOM focus is on body.
    // Clear stale internal focus once before retrying focus acquisition.
    if (
      attempt === 0
      && answerField.hasFocus
      && answerField.hasFocus()
      && !hasRealAnswerFieldFocus()
    ) {
      forceAnswerFieldBlurReset();
    }

    answerField.classList.add("answer-field-focused");

    try {
      answerField.focus({ preventScroll: true });
    } catch {
      answerField.focus();
    }

    restoreAnswerFieldCaretToEnd();

    const realFocused = hasRealAnswerFieldFocus();
    logKeyboardDebug("reconnect:focus-check", { attempt, realFocused });

    if (!realFocused && attempt < 4) {
      setTimeout(() => reconnect(attempt + 1), 40 * (attempt + 1));
      return;
    }

    if (reopenKeyboard && realFocused) {
      showAnswerVirtualKeyboard({ requireRealFocus: true });
      return;
    }

    if (reopenKeyboard && !realFocused) {
      logKeyboardDebug("reconnect:skip-show", { reason: "real focus missing" });
    }
  };

  requestAnimationFrame(() => {
    reconnect();
  });
}

function showAnswerVirtualKeyboard(options = {}) {
  const { requireRealFocus = false } = options;

  if (!answerField || !shouldUseVirtualKeyboard() || !window.mathVirtualKeyboard) {
    logKeyboardDebug("keyboard:show:skip", { reason: "keyboard unavailable" });
    return;
  }

  if (!hasRealAnswerFieldFocus()) {
    try {
      answerField.focus({ preventScroll: true });
    } catch {
      answerField.focus();
    }

    restoreAnswerFieldCaretToEnd();

    if (requireRealFocus && !hasRealAnswerFieldFocus()) {
      logKeyboardDebug("keyboard:show:skip", { reason: "real focus missing" });
      return;
    }
  }

  try {
    window.mathVirtualKeyboard.update(answerField);
    logKeyboardDebug("keyboard:update", { ok: true });
  } catch {
    // Some MathLive builds may not expose update().
    logKeyboardDebug("keyboard:update", { ok: false });
  }

  if (typeof answerField.executeCommand === "function") {
    const shown = answerField.executeCommand("showVirtualKeyboard");
    logKeyboardDebug("keyboard:execute:showVirtualKeyboard", { shown });
    if (shown) {
      return;
    }
  }

  try {
    window.mathVirtualKeyboard.show({ animate: true });
    logKeyboardDebug("keyboard:show", { mode: "global-animate" });
  } catch {
    window.mathVirtualKeyboard.show();
    logKeyboardDebug("keyboard:show", { mode: "global" });
  }
}

function hideAnswerVirtualKeyboard() {
  if (!window.mathVirtualKeyboard) {
    logKeyboardDebug("keyboard:hide:skip", { reason: "keyboard unavailable" });
    return;
  }

  if (typeof answerField?.executeCommand === "function") {
    const hidden = answerField.executeCommand("hideVirtualKeyboard");
    logKeyboardDebug("keyboard:execute:hideVirtualKeyboard", { hidden });
  }

  try {
    window.mathVirtualKeyboard.hide({ animate: true });
    logKeyboardDebug("keyboard:hide", { mode: "global-animate" });
  } catch {
    window.mathVirtualKeyboard.hide();
    logKeyboardDebug("keyboard:hide", { mode: "global" });
  }
}

initializeTheme();
setupMathFields();
renderThemeToggle();
renderNotationToggle();
bindEvents();
startNewChallenge();

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

function applyTheme() {
  document.body.setAttribute("data-theme", state.themeId);
}

function setupMathFields() {
  isTouchDevice = detectTouchDevice();
  const useVirtualKeyboard = shouldUseVirtualKeyboard();

  challengeField.mathVirtualKeyboardPolicy = "manual";
  hintField.mathVirtualKeyboardPolicy = "manual";
  answerField.defaultMode = "math";
  answerField.setAttribute("default-mode", "math");
  answerField.mathVirtualKeyboardPolicy = "manual";
  answerField.setAttribute(
    "math-virtual-keyboard-policy",
    "manual",
  );
  answerField.setAttribute(
    "virtual-keyboard-mode",
    useVirtualKeyboard ? "onfocus" : "manual",
  );

  disableMathFieldContextMenu(challengeField);
  disableMathFieldContextMenu(answerField);
  disableMathFieldContextMenu(hintField);
  makeReadonlyMathFieldUnfocusable(challengeField);
  makeReadonlyMathFieldUnfocusable(hintField);

  notationHelp.classList.add("hidden");
  inputTip.classList.add("hidden");

  applyAnswerKeybindings();
  configureAnswerVirtualKeyboard();
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

function renderThemeToggle() {
  themeToggle.classList.toggle("theme-dark-active", state.themeId === "dark");
  themeToggle.classList.toggle("theme-light-active", state.themeId === "light");
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
    state.notationId = state.notationId === "aqa" ? "logic" : "aqa";
    renderNotationToggle();
    // Close keyboard on notation toggle
    if (answerField.hasFocus && answerField.hasFocus()) {
      answerField.blur();
    }
    applyNotationMode();
  });

  const applyNotationMode = () => {
    renderNotationMeta();
    renderChallengeExpression();
    renderSubmissionHistory();
    renderHint();
    renderTip();
    retranslateAnswerField();
    applyAnswerKeybindings();
    configureAnswerVirtualKeyboard();
  };

  document.querySelector("#newChallengeBtn").addEventListener("click", () => {
    // Protect against iOS PWA keyboard loop during major state change
    protectFieldsFromAutoFocus(300);
    startNewChallenge();
  });

  document.querySelector("#clearBtn").addEventListener("click", () => {
    // Protect against iOS PWA keyboard loop during field clear/refocus
    protectFieldsFromAutoFocus(300);
    setFieldValue(answerField, "");
    answerField.focus();
  });

  document.querySelector("#checkBtn").addEventListener("click", () => {
    checkAnswer();
    // Blur field to close keyboard after check
    if (answerField.hasFocus && answerField.hasFocus()) {
      closeMathKeyboardAndClearFocus();
    }
  });

  document.querySelector("#hintBtn").addEventListener("click", () => {
    // Protect against iOS PWA keyboard loop when panel state changes
    protectFieldsFromAutoFocus(300);
    hintArea.classList.remove("hidden");
    renderHint();
  });

  document.addEventListener("copy", handleClipboardEvent, true);
  document.addEventListener("cut", handleClipboardEvent, true);

  answerField.addEventListener("beforeinput", (event) => {
    logKeyboardDebug("answer:beforeinput", { inputType: event.inputType, data: event.data ?? null });
  });

  answerField.addEventListener("input", (event) => {
    logKeyboardDebug("answer:input", { inputType: event.inputType, data: event.data ?? null });
  });

  answerField.addEventListener("selection-change", () => {
    logKeyboardDebug("answer:selection-change");
  });

  answerField.addEventListener("keydown", (event) => {
    logKeyboardDebug("answer:keydown", { key: event.key, code: event.code });
  }, true);

  answerField.addEventListener("keydown", handleAnswerFieldKeydown, true);
  answerField.addEventListener("blur", () => {
    logKeyboardDebug("answer:blur");
    answerField.classList.remove("answer-field-focused");
  });

  // iOS PWA fix: Prevent virtual keyboard auto-open loop on focus
  // This happens when the app is installed as PWA on iOS Safari
  answerField.addEventListener("focusin", (e) => {
    // If blur protection is active, immediately blur to prevent keyboard auto-open
    if (answerField.getAttribute("data-blur-protected") === "true") {
      e.preventDefault();
      answerField.blur();
      return;
    }

    answerField.classList.add("answer-field-focused");
    restoreAnswerFieldCaretToEnd();
    logKeyboardDebug("answer:focusin");

    // Use explicit field-driven keyboard control to keep MathLive's target in sync.
    showAnswerVirtualKeyboard();
  });

  // If the field is still focused but keyboard was dismissed, a tap should reopen it.
  const reopenKeyboardIfFocused = (event) => {
    if (!window.mathVirtualKeyboard || !shouldUseVirtualKeyboard()) {
      return;
    }

    if (window.mathVirtualKeyboard.visible) {
      return;
    }

    const now = performance.now();
    const sourceType = event?.type ?? "unknown";

    if (sourceType === "click" && now - lastPointerReopenTimestamp < 350) {
      return;
    }

    if (sourceType === "pointerdown" || sourceType === "touchstart") {
      lastPointerReopenTimestamp = now;
    }

    if (now - lastReopenRequestTimestamp < 120) {
      return;
    }
    lastReopenRequestTimestamp = now;

    const hasMathLiveFocus = Boolean(answerField.hasFocus && answerField.hasFocus());
    if (hasMathLiveFocus || !hasRealAnswerFieldFocus()) {
      logKeyboardDebug("answer:reopen-request", { sourceType });

      // Keep this as a pure focus recovery path; showing keyboard without real focus
      // can produce iOS key sounds/error tones with no inserted text.
      if (hasMathLiveFocus && !hasRealAnswerFieldFocus()) {
        forceAnswerFieldBlurReset();
      }

      try {
        answerField.focus({ preventScroll: true });
      } catch {
        answerField.focus();
      }

      restoreAnswerFieldCaretToEnd();
      const realFocused = hasRealAnswerFieldFocus();

      logKeyboardDebug("answer:reopen-focus-attempt", {
        sourceType,
        realFocused,
      });

      if (!realFocused) {
        logKeyboardDebug("answer:reopen-fallback", {
          reason: "real focus missing",
          sourceType,
        });

        requestAnimationFrame(() => {
          try {
            answerField.focus({ preventScroll: true });
          } catch {
            answerField.focus();
          }

          restoreAnswerFieldCaretToEnd();
          const retryRealFocused = hasRealAnswerFieldFocus();
          logKeyboardDebug("answer:reopen-focus-retry", {
            sourceType,
            realFocused: retryRealFocused,
          });

          if (retryRealFocused) {
            showAnswerVirtualKeyboard({ requireRealFocus: true });
            return;
          }

          reconnectAnswerFieldInputTarget({ reopenKeyboard: true });
        });
        return;
      }

      showAnswerVirtualKeyboard({ requireRealFocus: true });
    }
  };

  answerField.addEventListener("pointerdown", reopenKeyboardIfFocused, true);
  answerField.addEventListener("touchstart", reopenKeyboardIfFocused, true);
  answerField.addEventListener("click", reopenKeyboardIfFocused, true);

  const recoverAnswerFieldAfterResume = () => {
    if (!shouldUseVirtualKeyboard()) {
      return;
    }

    if (!answerField.hasFocus || !answerField.hasFocus()) {
      return;
    }

    reconnectAnswerFieldInputTarget();
    logKeyboardDebug("app:resume-reconnect");
  };

  document.addEventListener("visibilitychange", () => {
    logKeyboardDebug("app:visibilitychange", { state: document.visibilityState });
    if (document.visibilityState === "visible") {
      setTimeout(recoverAnswerFieldAfterResume, 0);
    }
  });

  window.addEventListener("focus", () => {
    logKeyboardDebug("app:window-focus", { state: document.visibilityState });
    if (document.visibilityState === "visible") {
      setTimeout(recoverAnswerFieldAfterResume, 0);
    }
  });

  window.addEventListener("pageshow", () => {
    logKeyboardDebug("app:pageshow", { state: document.visibilityState });
    if (document.visibilityState === "visible") {
      setTimeout(recoverAnswerFieldAfterResume, 0);
    }
  });

  if (window.mathVirtualKeyboard?.addEventListener) {
    window.mathVirtualKeyboard.addEventListener("before-virtual-keyboard-toggle", (event) => {
      logKeyboardDebug("vk:before-toggle", { visible: event?.detail?.visible ?? null });
    });

    window.mathVirtualKeyboard.addEventListener("virtual-keyboard-toggle", (event) => {
      logKeyboardDebug("vk:toggle", { visible: event?.detail?.visible ?? null });
    });

    window.mathVirtualKeyboard.addEventListener("geometrychange", () => {
      logKeyboardDebug("vk:geometrychange", {
        height: Math.round(window.mathVirtualKeyboard.boundingRect?.height ?? 0),
      });
    });
  }

  // In installed PWAs, taps on non-focusable elements do not always blur MathLive.
  // Explicitly blur on true outside taps so keyboard closes consistently.
  const blurOnOutsideInteraction = (event) => {
    if (!answerField.hasFocus || !answerField.hasFocus()) {
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

    logKeyboardDebug("answer:outside-blur", { target: describeElement(event.target) });
    closeMathKeyboardAndClearFocus();
  };

  document.addEventListener("mouseup", blurOnOutsideInteraction, true);
  document.addEventListener("touchend", blurOnOutsideInteraction, true);
  document.addEventListener("click", blurOnOutsideInteraction, true);
}

function shouldUseVirtualKeyboard() {
  return detectTouchDevice() || isInstalledPwaMode();
}

function isInstalledPwaMode() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia?.("(display-mode: standalone)")?.matches
    || window.matchMedia?.("(display-mode: fullscreen)")?.matches
    || window.navigator.standalone === true;
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

    if (node.closest?.("#answerField, .ML__keyboard, .ML__keyboard-container, .ML__virtual-keyboard, .MLK__plate, .MLK__backdrop")) {
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
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }

  const key = event.key;
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
    if (key === "." && state.notationId === "aqa") {
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

function configureAnswerVirtualKeyboard() {
  if (typeof window === "undefined" || !window.mathVirtualKeyboard) {
    return;
  }

  const wasVisible = Boolean(window.mathVirtualKeyboard.visible);

  window.mathVirtualKeyboard.layouts = [
    createBooleanVirtualKeyboardLayout(state.notationId),
  ];

  if (shouldUseVirtualKeyboard()) {
    window.mathVirtualKeyboard.container = document.body;
  }

  if (wasVisible) {
    hideAnswerVirtualKeyboard();
    showAnswerVirtualKeyboard();
  }
}

function createBooleanVirtualKeyboardLayout(notationId) {
  const isLogic = notationId === "logic";

  return {
    label: isLogic ? "Logic" : "AQA",
    labelClass: "MLK__tex-math",
    tooltip: isLogic ? "Logic notation keyboard" : "AQA notation keyboard",
    rows: [
      [
        { insert: "A", label: "A" },
        { insert: "B", label: "B" },
        { insert: "C", label: "C" },
        { insert: "D", label: "D" },
        { insert: "0", label: "0" },
        { insert: "1", label: "1" },
      ],
      [
        { insert: isLogic ? "∧" : ".", label: "AND", class: "small" },
        { insert: isLogic ? "∨" : "+", label: "OR", class: "small" },
        {
          insert: isLogic ? "\\lnot\\," : "\\overline{#?}",
          label: "NOT",
          class: "small",
        },
        { insert: "(", label: "(" },
        { insert: ")", label: ")" },
      ],
      [
        "[left]",
        "[right]",
        { label: "[backspace]", width: 3 },
      ],
    ],
  };
}

function startNewChallenge() {
  state.challenge = randomChallenge();
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

    setFeedback(
      "New challenge loaded. Enter an equivalent expression with fewer gates.",
      "info",
      [],
    );

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
  const challengeLatex = astToLatex(state.challenge.initialAst, state.notationId);
  setFieldValue(challengeField, challengeLatex);
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
    submissionHistory.appendChild(row);

    const latex = astToLatex(ast, state.notationId);
    renderReadonlyMathFieldLatex(expressionField, latex);
    disableMathFieldContextMenu(expressionField);
    makeReadonlyMathFieldUnfocusable(expressionField);
  }
}

function addEquivalentSubmission(ast) {
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
  });
}

function retranslateAnswerField() {
  const latex = getFieldValue(answerField).trim();
  if (!latex) return;
  try {
    const ast = parseBooleanExpression(latex);
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

function formatHintMessageHtml(message, notationId) {
  const segments = String(message).split(/`([^`]+)`/g);
  return segments
    .map((segment, index) => {
      if (index % 2 === 1) {
        const formatted = formatHintExpressionForNotation(segment, notationId);
        return `<span class="hint-expression">${escapeHtml(formatted)}</span>`;
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
  minimalGateCount.textContent = `Target gates: ${state.challenge.minimalGateCount}`;
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
    setFeedback("Could not parse that expression.", "error", [
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
    return;
  }
  field.value = value;
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
