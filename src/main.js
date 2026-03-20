import "mathlive";

import {
  NOTATIONS,
  astToLatex,
  astToNotationText,
  evaluateAgainstTruthTable,
  extractVariables,
  gateCountAst,
  parseBooleanExpression,
  randomChallenge,
} from "./booleanEngine.js";

const root = document.querySelector("#app");

root.innerHTML = `
  <main class="shell">
    <header class="hero panel">
      <p class="eyebrow">A Level Computer Science</p>
      <h1>Boolinator</h1>
      <p class="subtitle">
        Practise simplifying Boolean expressions by reducing gate count while staying logically equivalent.
      </p>
    </header>

    <section class="panel challenge">
      <div class="tile-head">
        <h2>Challenge expression</h2>
        <button id="newChallengeBtn" class="ghost-btn">New challenge</button>
      </div>
      <math-field id="challengeField" read-only></math-field>
      <div id="submissionHistory" class="submission-history hidden" aria-live="polite"></div>
      <div class="metrics">
        <span id="initialGateCount"></span>
        <span id="minimalGateCount"></span>
        <span id="equivalentBest"></span>
      </div>
    </section>

    <section class="panel answer">
      <div class="tile-head answer-head">
        <h2>Your simplified expression</h2>
        <div class="notation-inline">
          <label for="notationSelect">Notation</label>
          <select id="notationSelect"></select>
        </div>
      </div>
      <p id="notationHelp" class="notation-help"></p>
      <math-field id="answerField" default-mode="math"></math-field>
      <div class="actions">
        <button id="checkBtn" class="primary-btn">Check expression</button>
        <button id="clearBtn" class="ghost-btn">Clear</button>
        <button id="hintBtn" class="ghost-btn">Show one minimal form</button>
      </div>
      <p id="inputTip" class="notation-help"></p>
    </section>

    <section class="panel feedback" id="feedbackPanel">
      <h2>Feedback</h2>
      <p id="feedbackSummary">Enter an expression and press Check expression.</p>
      <div id="feedbackDetails" class="feedback-details"></div>
      <div id="hintArea" class="hint-area hidden">
        <p>One valid minimal form:</p>
        <math-field id="hintField" read-only></math-field>
        <p id="hintText" class="hint-text"></p>
      </div>
    </section>

    <p class="copyright">&copy; 2026 Neil Kendall</p>
    <p class="more-link">More @ <a href="https://www.korovatron.co.uk" target="_blank" rel="noopener noreferrer">www.korovatron.co.uk</a></p>
  </main>
`;

const notationSelect = document.querySelector("#notationSelect");
const notationHelp = document.querySelector("#notationHelp");
const challengeField = document.querySelector("#challengeField");
const answerField = document.querySelector("#answerField");
const inputTip = document.querySelector("#inputTip");
const feedbackSummary = document.querySelector("#feedbackSummary");
const feedbackDetails = document.querySelector("#feedbackDetails");
const initialGateCount = document.querySelector("#initialGateCount");
const minimalGateCount = document.querySelector("#minimalGateCount");
const equivalentBest = document.querySelector("#equivalentBest");
const hintArea = document.querySelector("#hintArea");
const hintField = document.querySelector("#hintField");
const hintText = document.querySelector("#hintText");
const submissionHistory = document.querySelector("#submissionHistory");
const isTouchDevice = detectTouchDevice();

const state = {
  notationId: "aqa",
  challenge: null,
  solved: false,
  bestEquivalent: null,
  equivalentSubmissions: [],
  pendingTemplateExit: false,
};

let _originalKeybindings = null;

setupMathFields();
populateNotationSelector();
bindEvents();
startNewChallenge();

function setupMathFields() {
  challengeField.mathVirtualKeyboardPolicy = "manual";
  hintField.mathVirtualKeyboardPolicy = "manual";
  answerField.defaultMode = "math";
  answerField.setAttribute("default-mode", "math");
  answerField.mathVirtualKeyboardPolicy = isTouchDevice ? "auto" : "manual";
  answerField.setAttribute(
    "math-virtual-keyboard-policy",
    isTouchDevice ? "auto" : "manual",
  );
  answerField.setAttribute(
    "virtual-keyboard-mode",
    isTouchDevice ? "onfocus" : "manual",
  );

  disableMathFieldContextMenu(challengeField);
  disableMathFieldContextMenu(answerField);
  disableMathFieldContextMenu(hintField);

  applyAnswerKeybindings();
  configureAnswerVirtualKeyboard();
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

function populateNotationSelector() {
  notationSelect.innerHTML = NOTATIONS.map(
    (notation) => `<option value="${notation.id}">${notation.label}</option>`,
  ).join("");

  notationSelect.value = state.notationId;
}

function bindEvents() {
  notationSelect.addEventListener("change", () => {
    state.notationId = notationSelect.value;
    renderNotationMeta();
    renderChallengeExpression();
    renderSubmissionHistory();
    renderHint();
    renderTip();
    retranslateAnswerField();
    applyAnswerKeybindings();
    configureAnswerVirtualKeyboard();
  });

  document.querySelector("#newChallengeBtn").addEventListener("click", () => {
    startNewChallenge();
  });

  document.querySelector("#clearBtn").addEventListener("click", () => {
    setFieldValue(answerField, "");
    answerField.focus();
  });

  document.querySelector("#checkBtn").addEventListener("click", () => {
    checkAnswer();
  });

  document.querySelector("#hintBtn").addEventListener("click", () => {
    hintArea.classList.remove("hidden");
    renderHint();
  });

  answerField.addEventListener("keydown", handleAnswerFieldKeydown, true);
  answerField.addEventListener("blur", () => {
    retranslateAnswerField();
  });
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

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(pointer: coarse)").matches;
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

  if (isTouchDevice) {
    window.mathVirtualKeyboard.container = document.body;
  }

  if (wasVisible) {
    window.mathVirtualKeyboard.hide();
    window.mathVirtualKeyboard.show();
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
    "neutral",
    [],
  );
}

function renderNotationMeta() {
  const notation = NOTATIONS.find((item) => item.id === state.notationId);
  notationHelp.textContent = notation?.help ?? "";
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
  }
}

function addEquivalentSubmission(ast) {
  const astSnapshot = JSON.parse(JSON.stringify(ast));
  state.equivalentSubmissions.push(astSnapshot);
  renderSubmissionHistory();
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

function renderHint() {
  const hintLatex = astToLatex(state.challenge.minimalAst, state.notationId);
  setFieldValue(hintField, hintLatex);
  hintText.textContent = astToNotationText(state.challenge.minimalAst, state.notationId);
}

function renderGateMetrics() {
  initialGateCount.textContent = `Challenge gates: ${state.challenge.initialGateCount}`;
  minimalGateCount.textContent = `Best possible: ${state.challenge.minimalGateCount}`;

  if (state.bestEquivalent === null) {
    equivalentBest.textContent = "Best equivalent so far: none";
  } else {
    equivalentBest.textContent = `Best equivalent so far: ${state.bestEquivalent}`;
  }
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
  if (state.notationId === "aqa") {
    inputTip.textContent = "Tip: Use overbar for NOT in AQA notation.";
    return;
  }

  inputTip.textContent = "Tip: You can type logic symbols directly or use the on-screen keypad.";
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

function checkAnswer() {
  const source = getFieldValue(answerField).trim();
  if (!source) {
    setFeedback("Enter an expression before checking.", "warn", []);
    return;
  }

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

  const details = [
    ["Equivalent", equivalent ? "Yes" : "No"],
    ["Your gate count", String(studentGates)],
    ["Challenge gate count", String(state.challenge.initialGateCount)],
    ["Best possible", String(state.challenge.minimalGateCount)],
  ];

  if (!equivalent) {
    setFeedback("Not equivalent yet. Keep the same truth table while simplifying.", "error", details);
    return;
  }

  if (studentGates <= state.challenge.minimalGateCount) {
    state.solved = true;
    setFeedback("Equivalent and minimal. You solved this challenge.", "success", details);
    hintArea.classList.remove("hidden");
    renderHint();
    return;
  }

  if (studentGates < state.challenge.initialGateCount) {
    setFeedback("Equivalent and simpler, but not yet minimal.", "good", details);
    return;
  }

  if (studentGates === state.challenge.initialGateCount) {
    setFeedback("Equivalent but same gate count. Try reducing further.", "warn", details);
    return;
  }

  setFeedback("Equivalent but uses more gates. Try another simplification path.", "warn", details);
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
