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
      <math-field id="answerField"></math-field>
      <div id="keypad" class="keypad"></div>
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
  </main>
`;

const notationSelect = document.querySelector("#notationSelect");
const notationHelp = document.querySelector("#notationHelp");
const challengeField = document.querySelector("#challengeField");
const answerField = document.querySelector("#answerField");
const keypad = document.querySelector("#keypad");
const inputTip = document.querySelector("#inputTip");
const feedbackSummary = document.querySelector("#feedbackSummary");
const feedbackDetails = document.querySelector("#feedbackDetails");
const initialGateCount = document.querySelector("#initialGateCount");
const minimalGateCount = document.querySelector("#minimalGateCount");
const equivalentBest = document.querySelector("#equivalentBest");
const hintArea = document.querySelector("#hintArea");
const hintField = document.querySelector("#hintField");
const hintText = document.querySelector("#hintText");

const state = {
  notationId: "aqa",
  challenge: null,
  solved: false,
  bestEquivalent: null,
};

const keypadButtons = {
  aqa: [
    { label: "A", insert: "A" },
    { label: "B", insert: "B" },
    { label: "C", insert: "C" },
    { label: "D", insert: "D" },
    { label: "(", insert: "(" },
    { label: ")", insert: ")" },
    { label: "+", insert: "+" },
    { label: ".", insert: "." },
    { label: "!", insert: "!" },
    { label: "'", insert: "'" },
    { label: "overbar", action: "overbarPlaceholder" },
  ],
  logic: [
    { label: "A", insert: "A" },
    { label: "B", insert: "B" },
    { label: "C", insert: "C" },
    { label: "D", insert: "D" },
    { label: "(", insert: "(" },
    { label: ")", insert: ")" },
    { label: "∨", insert: "∨" },
    { label: "∧", insert: "∧" },
    { label: "¬", insert: "¬" },
  ],
  code: [
    { label: "A", insert: "A" },
    { label: "B", insert: "B" },
    { label: "C", insert: "C" },
    { label: "D", insert: "D" },
    { label: "(", insert: "(" },
    { label: ")", insert: ")" },
    { label: "|", insert: "|" },
    { label: "&", insert: "&" },
    { label: "!", insert: "!" },
  ],
};

setupMathFields();
populateNotationSelector();
bindEvents();
startNewChallenge();

function setupMathFields() {
  challengeField.mathVirtualKeyboardPolicy = "manual";
  hintField.mathVirtualKeyboardPolicy = "manual";
  answerField.mathVirtualKeyboardPolicy = "auto";
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
    renderHint();
    renderKeypad();
    renderTip();
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
}

function startNewChallenge() {
  state.challenge = randomChallenge();
  state.solved = false;
  state.bestEquivalent = null;

  setFieldValue(answerField, "");
  hintArea.classList.add("hidden");

  renderNotationMeta();
  renderChallengeExpression();
  renderKeypad();
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

function renderKeypad() {
  const buttons = keypadButtons[state.notationId] ?? keypadButtons.aqa;
  keypad.innerHTML = "";

  for (const buttonConfig of buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "key-btn";
    button.textContent = buttonConfig.label;

    button.addEventListener("click", () => {
      if (buttonConfig.action === "overbarPlaceholder") {
        insertOverbarPlaceholder();
        return;
      }
      insertIntoAnswer(buttonConfig.insert);
    });

    keypad.appendChild(button);
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
    inputTip.textContent = "Tip: AQA NOT can be entered as overbar, apostrophe (A'), superscript prime (A^{\\prime}), or !A.";
    return;
  }

  if (state.notationId === "logic") {
    inputTip.textContent = "Tip: You can type logic symbols directly or use the on-screen keypad.";
    return;
  }

  inputTip.textContent = "Tip: Programming notation accepts ! for NOT, & for AND, and | for OR.";
}

function insertIntoAnswer(content) {
  answerField.focus();

  if (typeof answerField.insert === "function") {
    answerField.insert(content);
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
    return field.getValue("latex-expanded");
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
