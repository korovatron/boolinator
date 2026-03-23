import { all, create } from "mathjs";

const math = create(all, {});

const VARIABLE_POOL = ["A", "B", "C", "D"];

const TOKEN = {
  VAR: "VAR",
  CONST: "CONST",
  OR: "OR",
  AND: "AND",
  NOT: "NOT",
  LPAREN: "LPAREN",
  RPAREN: "RPAREN",
  PRIME: "PRIME",
};

export const NOTATIONS = [
  {
    id: "aqa",
    label: "A . (B + C)",
    help: "Use + for OR, . for AND, and overbar for NOT.",
  },
  {
    id: "logic",
    label: "A ∧ (B ∨ C)",
    help: "Use ∨ for OR, ∧ for AND, and ¬ for NOT.",
  },
];

const CHALLENGE_TIERS = [
  {
    initialMin: 10,
    initialMax: 15,
    minimalMin: 0,
    minimalMax: 5,
    minReduction: 5,
    attempts: 450,
  },
  {
    initialMin: 9,
    initialMax: 16,
    minimalMin: 0,
    minimalMax: 6,
    minReduction: 4,
    attempts: 400,
  },
  {
    initialMin: 8,
    initialMax: 17,
    minimalMin: 0,
    minimalMax: 7,
    minReduction: 3,
    attempts: 350,
  },
];

const STYLE_PROFILES = [
  {
    id: "aqa-demorgan",
    growOps: [
      "demorganInverseOr",
      "demorganInverseAnd",
      "doubleNegation",
      "distributeOr",
      "distributeAnd",
      "absorptionOr",
    ],
    fineOps: ["doubleNegation", "complementZero", "complementOne"],
    minConstants: 0,
    maxConstants: 1,
    minLongNots: 2,
    minNotDepth: 2,
    minIdentityPatterns: 0,
    maxIdentityPatterns: 1,
  },
  {
    id: "aqa-constants",
    growOps: [
      "complementZero",
      "complementOne",
      "distributeOr",
      "distributeAnd",
      "absorptionOr",
      "absorptionAnd",
      "addZero",
      "mulOne",
    ],
    fineOps: ["complementZero", "complementOne", "doubleNegation"],
    minConstants: 0,
    maxConstants: 1,
    minLongNots: 1,
    minNotDepth: 1,
    minIdentityPatterns: 0,
    maxIdentityPatterns: 1,
  },
  {
    id: "aqa-mixed",
    growOps: [
      "demorganInverseOr",
      "demorganInverseAnd",
      "distributeOr",
      "distributeAnd",
      "absorptionOr",
      "absorptionAnd",
      "complementZero",
      "complementOne",
    ],
    fineOps: ["doubleNegation", "complementZero", "complementOne"],
    minConstants: 0,
    maxConstants: 1,
    minLongNots: 1,
    minNotDepth: 2,
    minIdentityPatterns: 0,
    maxIdentityPatterns: 1,
  },
];

const DEMORGAN_TARGET_RATE = 0.95;
const A_PLUS_NOTAB_TARGET_RATE = 0.05;

export function randomChallenge() {
  let bestCandidate = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const requireDeMorgan = Math.random() < DEMORGAN_TARGET_RATE;
  const requireAPlusNotAB = Math.random() < A_PLUS_NOTAB_TARGET_RATE;

  for (const tier of CHALLENGE_TIERS) {
    for (let attempt = 0; attempt < tier.attempts; attempt += 1) {
      const styleProfile = randomStyleProfile();
      const variableCount = Math.random() < 0.85 ? 4 : 3;
      const variables = VARIABLE_POOL.slice(0, variableCount);
      const rowCount = 1 << variableCount;
      const minOneCount = Math.max(3, Math.floor(rowCount * 0.3));
      const maxOneCount = Math.min(rowCount - 3, Math.ceil(rowCount * 0.7));
      const oneCount = randomInt(minOneCount, maxOneCount);

      const selected = shuffledNumbers(rowCount).slice(0, oneCount);
      const outputs = Array.from({ length: rowCount }, () => false);
      for (const index of selected) {
        outputs[index] = true;
      }

      const minimal = minimalByGates(variables, outputs);
      if (!minimal) {
        continue;
      }

      if (minimal.gateCount > tier.minimalMax + 1) {
        continue;
      }

      const initialAst = buildStyledInitialAst(minimal.ast, variables, tier, styleProfile);
      if (!initialAst) {
        continue;
      }

      const initialGateCount = gateCountAst(initialAst);
      const reduction = initialGateCount - minimal.gateCount;

      if (reduction <= 0) {
        continue;
      }

      const candidate = {
        variables,
        outputs,
        initialAst,
        initialGateCount,
        minimalAst: minimal.ast,
        minimalGateCount: minimal.gateCount,
        minimalForm: minimal.form,
      };

      if (requireDeMorgan && !hasGroupedNotExpression(candidate.initialAst)) {
        continue;
      }

      if (requireDeMorgan && !hasDeMorganPriority(candidate.initialAst)) {
        continue;
      }

      if (requireAPlusNotAB && !hasAPlusNotABPattern(candidate.initialAst)) {
        continue;
      }

      const score =
        challengePenalty(candidate, tier) +
        stylePenalty(astStyleStats(candidate.initialAst), styleProfile);

      if (score < bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }

      if (score === 0) {
        return candidate;
      }
    }
  }

  if (bestCandidate) {
    return bestCandidate;
  }

  throw new Error("Could not build a non-trivial challenge. Try again.");
}

function challengePenalty(candidate, tier) {
  const initial = candidate.initialGateCount;
  const minimal = candidate.minimalGateCount;
  const reduction = initial - minimal;

  let penalty = 0;

  if (initial < tier.initialMin) {
    penalty += (tier.initialMin - initial) * 4;
  } else if (initial > tier.initialMax) {
    penalty += (initial - tier.initialMax) * 2;
  }

  if (minimal < tier.minimalMin) {
    penalty += (tier.minimalMin - minimal) * 6;
  } else if (minimal > tier.minimalMax) {
    penalty += (minimal - tier.minimalMax) * 8;
  }

  if (reduction < tier.minReduction) {
    penalty += (tier.minReduction - reduction) * 7;
  }

  return penalty;
}

function randomStyleProfile() {
  return STYLE_PROFILES[randomInt(0, STYLE_PROFILES.length - 1)];
}

function hasGroupedNotExpression(ast) {
  if (!ast) {
    return false;
  }

  if (ast.type === "not") {
    const expr = ast.expr;
    if (expr && (expr.type === "and" || expr.type === "or")) {
      return true;
    }
    return hasGroupedNotExpression(expr);
  }

  if (ast.type === "and" || ast.type === "or") {
    return hasGroupedNotExpression(ast.left) || hasGroupedNotExpression(ast.right);
  }

  return false;
}

function hasDeMorganPriority(ast) {
  const groupedNotCount = countGroupedNotExpressions(ast);
  if (groupedNotCount < 2) {
    return false;
  }

  const complexGroupedNotCount = countComplexGroupedNotExpressions(ast);
  if (complexGroupedNotCount < 1) {
    return false;
  }

  const styleStats = astStyleStats(ast);
  if (styleStats.identityPatternCount > 1) {
    return false;
  }

  const doubleNegationPairs = countDoubleNegationPairs(ast);
  if (doubleNegationPairs > 1) {
    return false;
  }

  const absorptionBypassCount = countGroupedNotAbsorptionBypass(ast);
  if (absorptionBypassCount > 0) {
    return false;
  }

  if (countGlobalAbsorptionBypass(ast) > 0) {
    return false;
  }

  const conjugateBypassCount = countConjugateBypassPatterns(ast);
  if (conjugateBypassCount > 0) {
    return false;
  }

  const easyNonDeMorganCount = countEasyNonDeMorganPatterns(ast);
  const deMorganPressure = groupedNotCount + (2 * complexGroupedNotCount);
  const shortcutPressure =
    easyNonDeMorganCount
    + (2 * styleStats.identityPatternCount)
    + doubleNegationPairs;

  // Ensure De Morgan opportunities dominate the likely shortcut paths.
  return deMorganPressure >= shortcutPressure + 1;
}

function countComplexGroupedNotExpressions(ast) {
  if (!ast) {
    return 0;
  }

  if (ast.type === "not") {
    const expr = ast.expr;
    let current = 0;

    if (expr && (expr.type === "and" || expr.type === "or")) {
      const operands = flatten(expr, expr.type);
      const hasNonLiteralOperand = operands.some((operand) => !isLiteralNode(operand));
      if (operands.length >= 2 && hasNonLiteralOperand) {
        current = 1;
      }
    }

    return current + countComplexGroupedNotExpressions(expr);
  }

  if (ast.type === "and" || ast.type === "or") {
    return countComplexGroupedNotExpressions(ast.left) + countComplexGroupedNotExpressions(ast.right);
  }

  return 0;
}

function countDoubleNegationPairs(ast) {
  if (!ast) {
    return 0;
  }

  if (ast.type === "not") {
    const current = ast.expr?.type === "not" ? 1 : 0;
    return current + countDoubleNegationPairs(ast.expr);
  }

  if (ast.type === "and" || ast.type === "or") {
    return countDoubleNegationPairs(ast.left) + countDoubleNegationPairs(ast.right);
  }

  return 0;
}

function countGlobalAbsorptionBypass(ast) {
  if (!ast) {
    return 0;
  }

  if (ast.type === "and" || ast.type === "or") {
    const current = isImmediateAbsorptionCandidateInChain(ast) ? 1 : 0;
    return current + countGlobalAbsorptionBypass(ast.left) + countGlobalAbsorptionBypass(ast.right);
  }

  if (ast.type === "not") {
    return countGlobalAbsorptionBypass(ast.expr);
  }

  return 0;
}

function countConjugateBypassPatterns(ast) {
  if (!ast) {
    return 0;
  }

  if (ast.type !== "and" && ast.type !== "or") {
    if (ast.type === "not") {
      return countConjugateBypassPatterns(ast.expr);
    }
    return 0;
  }

  let count = hasConjugateBypassInChain(ast) ? 1 : 0;
  count += countConjugateBypassPatterns(ast.left);
  count += countConjugateBypassPatterns(ast.right);
  return count;
}

function hasConjugateBypassInChain(node) {
  if (!node || (node.type !== "and" && node.type !== "or")) {
    return false;
  }

  const rootKind = node.type;
  const nestedKind = rootKind === "and" ? "or" : "and";
  const operands = flatten(node, rootKind);

  for (let i = 0; i < operands.length - 1; i += 1) {
    if (operands[i].type !== nestedKind) {
      continue;
    }

    for (let j = i + 1; j < operands.length; j += 1) {
      if (operands[j].type !== nestedKind) {
        continue;
      }

      if (areConjugateOperands(operands[i], operands[j], nestedKind)) {
        return true;
      }
    }
  }

  return false;
}

function areConjugateOperands(leftNode, rightNode, nestedKind) {
  const leftParts = flatten(leftNode, nestedKind).map((part) => astShapeKey(part));
  const rightParts = flatten(rightNode, nestedKind).map((part) => astShapeKey(part));
  const leftSet = new Set(leftParts);
  const rightSet = new Set(rightParts);

  let commonCount = 0;
  for (const key of leftSet) {
    if (rightSet.has(key)) {
      commonCount += 1;
    }
  }

  if (commonCount === 0) {
    return false;
  }

  for (const key of leftSet) {
    const complementKey = complementShapeKey(key);
    if (complementKey && rightSet.has(complementKey)) {
      return true;
    }
  }

  return false;
}

function complementShapeKey(key) {
  if (!key) {
    return null;
  }

  if (key === "c:1") {
    return "c:0";
  }

  if (key === "c:0") {
    return "c:1";
  }

  if (key.startsWith("n(") && key.endsWith(")")) {
    return key.slice(2, -1);
  }

  return `n(${key})`;
}

function countGroupedNotExpressions(ast) {
  if (!ast) {
    return 0;
  }

  if (ast.type === "not") {
    const current = ast.expr && (ast.expr.type === "and" || ast.expr.type === "or") ? 1 : 0;
    return current + countGroupedNotExpressions(ast.expr);
  }

  if (ast.type === "and" || ast.type === "or") {
    return countGroupedNotExpressions(ast.left) + countGroupedNotExpressions(ast.right);
  }

  return 0;
}

function countEasyNonDeMorganPatterns(ast) {
  if (!ast) {
    return 0;
  }

  if (ast.type === "not") {
    return countEasyNonDeMorganPatterns(ast.expr);
  }

  if (ast.type !== "and" && ast.type !== "or") {
    return 0;
  }

  const operands = flatten(ast, ast.type);
  let count = 0;

  if (ast.type === "or") {
    if (operands.some((operand) => operand.type === "const" && operand.value)) {
      count += 2;
    }
    if (operands.some((operand) => operand.type === "const" && !operand.value)) {
      count += 1;
    }
  }

  if (ast.type === "and") {
    if (operands.some((operand) => operand.type === "const" && !operand.value)) {
      count += 2;
    }
    if (operands.some((operand) => operand.type === "const" && operand.value)) {
      count += 1;
    }
  }

  count += countIdentityPatternsInChain(ast, ast.type);
  return count
    + countEasyNonDeMorganPatterns(ast.left)
    + countEasyNonDeMorganPatterns(ast.right);
}

function countGroupedNotAbsorptionBypass(ast) {
  if (!ast) {
    return 0;
  }

  if (ast.type === "not") {
    const current = isImmediateAbsorptionCandidateInChain(ast.expr) ? 1 : 0;
    return current + countGroupedNotAbsorptionBypass(ast.expr);
  }

  if (ast.type === "and" || ast.type === "or") {
    return countGroupedNotAbsorptionBypass(ast.left) + countGroupedNotAbsorptionBypass(ast.right);
  }

  return 0;
}

function isImmediateAbsorptionCandidateInChain(node) {
  if (!node || (node.type !== "and" && node.type !== "or")) {
    return false;
  }

  const rootKind = node.type;
  const nestedKind = rootKind === "or" ? "and" : "or";
  const operands = flatten(node, rootKind);
  const operandKeys = new Set(operands.map((operand) => astShapeKey(operand)));

  for (const operand of operands) {
    if (!operand || operand.type !== nestedKind) {
      continue;
    }

    const nestedOperands = flatten(operand, nestedKind);
    for (const nestedOperand of nestedOperands) {
      if (operandKeys.has(astShapeKey(nestedOperand))) {
        return true;
      }
    }
  }

  return false;
}

function astShapeKey(node) {
  if (!node) {
    return "?";
  }

  if (node.type === "var") {
    return `v:${node.name}`;
  }

  if (node.type === "const") {
    return node.value ? "c:1" : "c:0";
  }

  if (node.type === "not") {
    return `n(${astShapeKey(node.expr)})`;
  }

  if (node.type === "and" || node.type === "or") {
    const parts = flatten(node, node.type)
      .map((child) => astShapeKey(child))
      .sort();
    return `${node.type}[${parts.join(",")}]`;
  }

  return "unknown";
}

function hasAPlusNotABPattern(ast) {
  if (!ast) {
    return false;
  }

  if (ast.type === "or") {
    const operands = flatten(ast, "or");

    for (const operand of operands) {
      if (operand.type !== "var") {
        continue;
      }

      const variableName = operand.name;
      const hasCoverTerm = operands.some((otherOperand) => {
        if (otherOperand === operand) {
          return false;
        }
        return isAndTermContainingNegatedVariable(otherOperand, variableName);
      });

      if (hasCoverTerm) {
        return true;
      }
    }
  }

  if (ast.type === "not") {
    return hasAPlusNotABPattern(ast.expr);
  }

  if (ast.type === "and" || ast.type === "or") {
    return hasAPlusNotABPattern(ast.left) || hasAPlusNotABPattern(ast.right);
  }

  return false;
}

function isAndTermContainingNegatedVariable(node, variableName) {
  if (!node || node.type !== "and") {
    return false;
  }

  const factors = flatten(node, "and");
  const hasNegatedVariable = factors.some((factor) => (
    factor.type === "not"
    && factor.expr?.type === "var"
    && factor.expr.name === variableName
  ));

  if (!hasNegatedVariable) {
    return false;
  }

  return factors.some((factor) => !isNegatedVariableFactor(factor, variableName));
}

function isNegatedVariableFactor(node, variableName) {
  return Boolean(
    node
    && node.type === "not"
    && node.expr?.type === "var"
    && node.expr.name === variableName,
  );
}

function buildStyledInitialAst(minimalAst, variables, tier, styleProfile) {
  const targetInitial = randomInt(tier.initialMin, tier.initialMax);
  const hardUpperBound = tier.initialMax + 4;
  const hardNodeLimit = 42;

  let currentAst = normalizeNotRuns(cloneAst(minimalAst));
  let bestAst = currentAst;
  let bestPenalty = initialAstPenalty(bestAst, targetInitial, tier, styleProfile);

  const warmUpSteps = randomInt(1, 2);
  for (let step = 0; step < warmUpSteps; step += 1) {
    const warmedRaw = applyRandomEquivalentExpansion(currentAst, variables, styleProfile, "grow");
    const warmed = normalizeNotRuns(warmedRaw);
    if (!warmed) {
      continue;
    }

    const warmedGateCount = gateCountAst(warmed);
    if (warmedGateCount > hardUpperBound || astNodeCount(warmed) > hardNodeLimit) {
      continue;
    }

    currentAst = warmed;
    const warmedPenalty = initialAstPenalty(currentAst, targetInitial, tier, styleProfile);
    if (warmedPenalty < bestPenalty) {
      bestPenalty = warmedPenalty;
      bestAst = currentAst;
    }
  }

  for (let step = 0; step < 24; step += 1) {
    const currentGateCount = gateCountAst(currentAst);
    const mode = currentGateCount < targetInitial - 2 ? "grow" : "fine";
    const nextRaw = applyRandomEquivalentExpansion(currentAst, variables, styleProfile, mode);
    const nextAst = normalizeNotRuns(nextRaw);
    if (!nextAst) {
      continue;
    }

    const nextGateCount = gateCountAst(nextAst);
    if (nextGateCount > hardUpperBound || astNodeCount(nextAst) > hardNodeLimit) {
      continue;
    }

    currentAst = nextAst;
    const penalty = initialAstPenalty(currentAst, targetInitial, tier, styleProfile);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestAst = currentAst;
    }

    if (penalty === 0) {
      break;
    }
  }

  return normalizeNotRuns(bestAst);
}

function initialAstPenalty(ast, targetInitial, tier, styleProfile) {
  const gateCount = gateCountAst(ast);
  const nodeCount = astNodeCount(ast);
  let penalty = Math.abs(targetInitial - gateCount);

  if (gateCount < tier.initialMin) {
    penalty += (tier.initialMin - gateCount) * 6;
  } else if (gateCount > tier.initialMax) {
    penalty += (gateCount - tier.initialMax) * 6;
  }

  if (nodeCount > 34) {
    penalty += (nodeCount - 34) * 3;
  }

  penalty += stylePenalty(astStyleStats(ast), styleProfile);
  return penalty;
}

function stylePenalty(stats, styleProfile) {
  let penalty = 0;

  if (stats.constantCount < styleProfile.minConstants) {
    penalty += (styleProfile.minConstants - stats.constantCount) * 6;
  }

  if (stats.constantCount > styleProfile.maxConstants) {
    penalty += (stats.constantCount - styleProfile.maxConstants) * 12;
  }

  if (stats.longNotCount < styleProfile.minLongNots) {
    penalty += (styleProfile.minLongNots - stats.longNotCount) * 7;
  }

  if (stats.maxNotDepth < styleProfile.minNotDepth) {
    penalty += (styleProfile.minNotDepth - stats.maxNotDepth) * 7;
  }

  if (stats.identityPatternCount < styleProfile.minIdentityPatterns) {
    penalty += (styleProfile.minIdentityPatterns - stats.identityPatternCount) * 5;
  }

  if (stats.identityPatternCount > styleProfile.maxIdentityPatterns) {
    penalty += (stats.identityPatternCount - styleProfile.maxIdentityPatterns) * 16;
  }

  return penalty;
}

function astStyleStats(ast) {
  const stats = {
    constantCount: 0,
    longNotCount: 0,
    maxNotDepth: 0,
    identityPatternCount: 0,
  };

  function walk(node, notDepth, parentKind = null) {
    if (!node) {
      return;
    }

    if (node.type === "const") {
      stats.constantCount += 1;
      return;
    }

    if (node.type === "var") {
      return;
    }

    if (node.type === "not") {
      const nextDepth = notDepth + 1;
      if (nextDepth > stats.maxNotDepth) {
        stats.maxNotDepth = nextDepth;
      }
      if (node.expr.type !== "var") {
        stats.longNotCount += 1;
      }
      walk(node.expr, nextDepth);
      return;
    }

    if (node.type === "and" || node.type === "or") {
      // Count identity-pattern groups once per flattened chain root.
      if (parentKind !== node.type) {
        stats.identityPatternCount += countIdentityPatternsInChain(node, node.type);
      }

      walk(node.left, notDepth, node.type);
      walk(node.right, notDepth, node.type);
    }
  }

  walk(ast, 0, null);
  return stats;
}

function countIdentityPatternsInChain(node, kind) {
  const operands = flatten(node, kind);
  const literalCounts = new Map();

  for (const operand of operands) {
    if (!isLiteralNode(operand)) {
      continue;
    }
    const key = literalNodeKey(operand);
    literalCounts.set(key, (literalCounts.get(key) ?? 0) + 1);
  }

  let patternCount = 0;

  // Idempotence groups: A + A or A . A (count extra repeats).
  for (const count of literalCounts.values()) {
    if (count > 1) {
      patternCount += count - 1;
    }
  }

  // Complement pairs: A + A' or A . A'.
  const baseVariables = new Set();
  for (const key of literalCounts.keys()) {
    baseVariables.add(key.startsWith("!") ? key.slice(1) : key);
  }

  for (const variable of baseVariables) {
    const positiveCount = literalCounts.get(variable) ?? 0;
    const negativeCount = literalCounts.get(`!${variable}`) ?? 0;
    if (positiveCount > 0 && negativeCount > 0) {
      patternCount += Math.min(positiveCount, negativeCount);
    }
  }

  return patternCount;
}

function astNodeCount(ast) {
  if (!ast) {
    return 0;
  }

  if (ast.type === "var" || ast.type === "const") {
    return 1;
  }

  if (ast.type === "not") {
    return 1 + astNodeCount(ast.expr);
  }

  if (ast.type === "and" || ast.type === "or") {
    return 1 + astNodeCount(ast.left) + astNodeCount(ast.right);
  }

  return 1;
}

function normalizeNotRuns(ast) {
  if (!ast) {
    return ast;
  }

  if (ast.type === "var" || ast.type === "const") {
    return cloneAst(ast);
  }

  if (ast.type === "and" || ast.type === "or") {
    return {
      type: ast.type,
      left: normalizeNotRuns(ast.left),
      right: normalizeNotRuns(ast.right),
    };
  }

  if (ast.type === "not") {
    let depth = 0;
    let cursor = ast;

    while (cursor && cursor.type === "not") {
      depth += 1;
      cursor = cursor.expr;
    }

    let normalized = normalizeNotRuns(cursor);
    const keepNotCount = depth % 2 === 0 ? 2 : 1;

    for (let i = 0; i < keepNotCount; i += 1) {
      normalized = {
        type: "not",
        expr: normalized,
      };
    }

    return normalized;
  }

  return cloneAst(ast);
}

function applyRandomEquivalentExpansion(ast, variables, styleProfile, mode) {
  const paths = collectTransformPaths(ast);
  if (paths.length === 0) {
    return null;
  }

  const pool = mode === "grow" ? styleProfile.growOps : styleProfile.fineOps;

  for (let attempt = 0; attempt < 14; attempt += 1) {
    const path = paths[randomInt(0, paths.length - 1)];
    const node = nodeAtPath(ast, path);
    if (!node || node.type === "const") {
      continue;
    }

    const transformName = pool[randomInt(0, pool.length - 1)];
    const transformed = applyExpansionTransform(transformName, cloneAst(node), variables);
    if (!transformed) {
      continue;
    }

    return replaceNodeAtPath(ast, path, transformed);
  }

  return null;
}

function applyExpansionTransform(name, node, variables) {
  switch (name) {
    case "addZero":
      return {
        type: "or",
        left: node,
        right: { type: "const", value: false },
      };

    case "mulOne":
      return {
        type: "and",
        left: node,
        right: { type: "const", value: true },
      };

    case "doubleNegation":
      return {
        type: "not",
        expr: {
          type: "not",
          expr: node,
        },
      };

    case "complementZero": {
      const variable = randomVariableAst(variables);
      return {
        type: "or",
        left: node,
        right: {
          type: "and",
          left: variable,
          right: { type: "not", expr: cloneAst(variable) },
        },
      };
    }

    case "complementOne": {
      const variable = randomVariableAst(variables);
      return {
        type: "and",
        left: node,
        right: {
          type: "or",
          left: variable,
          right: { type: "not", expr: cloneAst(variable) },
        },
      };
    }

    case "absorptionOr": {
      const literal = randomLiteralAst(variables);
      return {
        type: "or",
        left: node,
        right: {
          type: "and",
          left: cloneAst(node),
          right: literal,
        },
      };
    }

    case "absorptionAnd": {
      const literal = randomLiteralAst(variables);
      return {
        type: "and",
        left: node,
        right: {
          type: "or",
          left: cloneAst(node),
          right: literal,
        },
      };
    }

    case "distributeOr": {
      const literal = randomLiteralAst(variables);
      const complement = complementLiteral(literal);
      return {
        type: "or",
        left: {
          type: "and",
          left: cloneAst(node),
          right: literal,
        },
        right: {
          type: "and",
          left: cloneAst(node),
          right: complement,
        },
      };
    }

    case "distributeAnd": {
      const literal = randomLiteralAst(variables);
      const complement = complementLiteral(literal);
      return {
        type: "and",
        left: {
          type: "or",
          left: cloneAst(node),
          right: literal,
        },
        right: {
          type: "or",
          left: cloneAst(node),
          right: complement,
        },
      };
    }

    case "demorganInverseAnd": {
      if (node.type !== "and") {
        return null;
      }

      const factors = flatten(node, "and").map((factor) => ({
        type: "not",
        expr: cloneAst(factor),
      }));

      return {
        type: "not",
        expr: chain(factors, "or"),
      };
    }

    case "demorganInverseOr": {
      if (node.type !== "or") {
        return null;
      }

      const terms = flatten(node, "or").map((term) => ({
        type: "not",
        expr: cloneAst(term),
      }));

      return {
        type: "not",
        expr: chain(terms, "and"),
      };
    }

    default:
      return null;
  }
}

export function parseBooleanExpression(input) {
  const tokens = tokenize(input);
  if (tokens.length === 0) {
    throw new Error("Expression is empty.");
  }

  let cursor = 0;

  function current() {
    return tokens[cursor] ?? null;
  }

  function match(type) {
    if (current() && current().type === type) {
      cursor += 1;
      return true;
    }
    return false;
  }

  function expect(type, message) {
    if (!match(type)) {
      throw new Error(message);
    }
  }

  function parseOr() {
    let node = parseAnd();
    while (match(TOKEN.OR)) {
      node = {
        type: "or",
        left: node,
        right: parseAnd(),
      };
    }
    return node;
  }

  function parseAnd() {
    let node = parseNot();
    while (match(TOKEN.AND)) {
      node = {
        type: "and",
        left: node,
        right: parseNot(),
      };
    }
    return node;
  }

  function parseNot() {
    if (match(TOKEN.NOT)) {
      return {
        type: "not",
        expr: parseNot(),
      };
    }

    let node = parsePrimary();
    while (match(TOKEN.PRIME)) {
      node = {
        type: "not",
        expr: node,
      };
    }
    return node;
  }

  function parsePrimary() {
    const token = current();
    if (!token) {
      throw new Error("Expression ended unexpectedly.");
    }

    if (match(TOKEN.VAR)) {
      return { type: "var", name: token.value };
    }

    if (match(TOKEN.CONST)) {
      return { type: "const", value: token.value };
    }

    if (match(TOKEN.LPAREN)) {
      let node = parseOr();
      expect(TOKEN.RPAREN, "Missing closing bracket.");
      while (match(TOKEN.PRIME)) {
        node = { type: "not", expr: node };
      }
      return node;
    }

    throw new Error(`Unexpected token: ${token.raw}`);
  }

  const ast = parseOr();
  if (cursor !== tokens.length) {
    throw new Error(`Unexpected token near '${tokens[cursor].raw}'.`);
  }

  return ast;
}

export function evaluateAgainstTruthTable(ast, variables, expectedOutputs) {
  try {
    const expression = astToMathJs(ast);
    const compiled = math.compile(expression);
    const fullScope = { A: false, B: false, C: false, D: false };

    for (let row = 0; row < expectedOutputs.length; row += 1) {
      const assignment = assignmentFromRow(row, variables);
      const scope = { ...fullScope, ...assignment };
      const result = Boolean(compiled.evaluate(scope));
      if (result !== expectedOutputs[row]) {
        return { equivalent: false };
      }
    }

    return { equivalent: true };
  } catch (error) {
    return {
      equivalent: false,
      error: error instanceof Error ? error.message : "Could not evaluate expression.",
    };
  }
}

export function gateCountAst(ast) {
  const negatedVariables = new Set();
  let gateCount = 0;

  function walk(node) {
    if (!node) {
      return;
    }

    if (node.type === "const" || node.type === "var") {
      return;
    }

    if (node.type === "not") {
      if (node.expr.type === "var") {
        negatedVariables.add(node.expr.name);
      } else {
        gateCount += 1;
      }
      walk(node.expr);
      return;
    }

    if (node.type === "and" || node.type === "or") {
      const operands = flatten(node, node.type);
      gateCount += binaryGateCountForOperands(operands.length);
      for (const operand of operands) {
        walk(operand);
      }
    }
  }

  walk(ast);
  return gateCount + negatedVariables.size;
}

export function extractVariables(ast) {
  const vars = new Set();
  function walk(node) {
    if (!node) {
      return;
    }
    if (node.type === "var") {
      vars.add(node.name);
      return;
    }
    if (node.type === "not") {
      walk(node.expr);
      return;
    }
    if (node.type === "and" || node.type === "or") {
      walk(node.left);
      walk(node.right);
    }
  }
  walk(ast);
  return vars;
}

export function astToLatex(ast, notationId) {
  const precedence = {
    const: 4,
    var: 4,
    not: 3,
    and: 2,
    or: 1,
  };

  function render(node, parentPrecedence = 0, isRoot = false) {
    if (node.type === "const") {
      return node.value ? "1" : "0";
    }

    if (node.type === "var") {
      return node.name;
    }

    if (node.type === "not") {
      if (notationId === "aqa") {
        const shouldWrap = !isRoot && shouldWrapAqaOverbarExpression(node.expr);
        const child = render(node.expr, 0, false);
        const wrappedChild = shouldWrap
          ? `\\left(${child}\\right)`
          : child;
        return `\\overline{${wrappedChild}}`;
      }

      const child = render(node.expr, precedence.not, false);
      const notSymbol = notationId === "code" ? "!" : "\\lnot\\,";
      return `${notSymbol}${child}`;
    }

    const kind = node.type;
    const children = flatten(node, kind);
    const childPieces = children.map((child) => render(child, precedence[kind], false));
    const connector = pickConnector(kind, notationId, true);
    let piece = childPieces.join(connector);

    if (precedence[kind] < parentPrecedence) {
      piece = `\\left(${piece}\\right)`;
    }
    return piece;
  }

  return render(ast, 0, true);
}

export function astToNotationText(ast, notationId) {
  const precedence = {
    const: 4,
    var: 4,
    not: 3,
    and: 2,
    or: 1,
  };

  function render(node, parentPrecedence = 0, isRoot = false) {
    if (node.type === "const") {
      return node.value ? "1" : "0";
    }

    if (node.type === "var") {
      return node.name;
    }

    if (node.type === "not") {
      const shouldWrap = !isRoot && shouldWrapAqaOverbarExpression(node.expr);
      const child = render(node.expr, 0, false);
      if (notationId === "aqa") {
        if (!shouldWrap) {
          return `${child}'`;
        }
        return `(${child})'`;
      }

      const notSymbol = notationId === "code" ? "!" : "¬";
      return `${notSymbol}${child}`;
    }

    const kind = node.type;
    const children = flatten(node, kind);
    const childPieces = children.map((child) => render(child, precedence[kind], false));
    const connector = pickConnector(kind, notationId, false);

    let piece = childPieces.join(connector);
    if (precedence[kind] < parentPrecedence) {
      piece = `(${piece})`;
    }
    return piece;
  }

  return render(ast, 0, true);
}

function shouldWrapAqaOverbarExpression(node) {
  if (!node) {
    return false;
  }

  return node.type === "or";
}

function astToMathJs(ast) {
  if (ast.type === "const") {
    return ast.value ? "true" : "false";
  }

  if (ast.type === "var") {
    return ast.name;
  }

  if (ast.type === "not") {
    return `(not (${astToMathJs(ast.expr)}))`;
  }

  if (ast.type === "and" || ast.type === "or") {
    const op = ast.type;
    const keyword = op === "and" ? " and " : " or ";
    return `(${flatten(ast, op).map((child) => astToMathJs(child)).join(keyword)})`;
  }

  throw new Error("Unknown AST node.");
}

function minimalByGates(variables, outputs) {
  const rowCount = outputs.length;
  const ones = [];
  const zeros = [];

  for (let index = 0; index < rowCount; index += 1) {
    if (outputs[index]) {
      ones.push(index);
    } else {
      zeros.push(index);
    }
  }

  if (ones.length === 0) {
    return {
      ast: { type: "const", value: false },
      gateCount: 0,
      literalCount: 0,
      form: "constant",
    };
  }

  if (zeros.length === 0) {
    return {
      ast: { type: "const", value: true },
      gateCount: 0,
      literalCount: 0,
      form: "constant",
    };
  }

  const sop = bestCover(ones, variables, rowCount, "sop");
  const pos = bestCover(zeros, variables, rowCount, "pos");

  const candidates = [sop, pos]
    .filter(Boolean)
    .map((candidate) => refineMinimalCandidate(candidate));

  if (candidates.length === 0) {
    return null;
  }

  const bestHeuristic = candidates.reduce((best, candidate) => {
    if (!best) {
      return candidate;
    }
    return isBetterMinimalCandidate(candidate, best) ? candidate : best;
  }, null);
  return bestHeuristic;
}

function isBetterMinimalCandidate(candidate, currentBest) {
  if (candidate.gateCount !== currentBest.gateCount) {
    return candidate.gateCount < currentBest.gateCount;
  }

  if (candidate.literalCount !== currentBest.literalCount) {
    return candidate.literalCount < currentBest.literalCount;
  }

  return astToNotationText(candidate.ast, "code").length
    <= astToNotationText(currentBest.ast, "code").length;
}

function refineMinimalCandidate(candidate) {
  const factoredAst = factorCommonLiterals(candidate.ast);
  const factoredGateCount = gateCountAst(factoredAst);

  if (factoredGateCount >= candidate.gateCount) {
    return candidate;
  }

  return {
    ...candidate,
    ast: factoredAst,
    gateCount: factoredGateCount,
    literalCount: literalOccurrenceCount(factoredAst),
  };
}

function factorCommonLiterals(ast) {
  let current = normalizeNotRuns(cloneAst(ast));

  for (let pass = 0; pass < 6; pass += 1) {
    const next = factorCommonLiteralsOnce(current);
    if (!next) {
      break;
    }

    const currentGates = gateCountAst(current);
    const nextGates = gateCountAst(next);
    if (nextGates >= currentGates) {
      break;
    }

    current = normalizeNotRuns(next);
  }

  return current;
}

function factorCommonLiteralsOnce(ast) {
  if (!ast || (ast.type !== "or" && ast.type !== "and")) {
    return null;
  }

  const rootKind = ast.type;
  const innerKind = rootKind === "or" ? "and" : "or";
  const operands = flatten(ast, rootKind);
  if (operands.length < 2) {
    return null;
  }

  const parsedOperands = operands.map((operand) => parseLiteralOperand(operand, innerKind));
  const baselineGateCount = gateCountAst(ast);

  let bestAst = null;
  let bestGateCount = baselineGateCount;

  for (let i = 0; i < operands.length - 1; i += 1) {
    if (!parsedOperands[i]) {
      continue;
    }

    for (let j = i + 1; j < operands.length; j += 1) {
      if (!parsedOperands[j]) {
        continue;
      }

      const candidate = buildFactoredPairAst(operands, parsedOperands, i, j, rootKind, innerKind);
      if (!candidate) {
        continue;
      }

      const candidateGateCount = gateCountAst(candidate);
      if (candidateGateCount < bestGateCount) {
        bestGateCount = candidateGateCount;
        bestAst = candidate;
      }
    }
  }

  return bestAst;
}

function buildFactoredPairAst(operands, parsedOperands, leftIndex, rightIndex, rootKind, innerKind) {
  const left = parsedOperands[leftIndex];
  const right = parsedOperands[rightIndex];
  const commonKeys = [];

  const rightKeySet = new Set(right.keys);
  for (const key of left.keys) {
    if (rightKeySet.has(key)) {
      commonKeys.push(key);
    }
  }

  if (commonKeys.length === 0) {
    return null;
  }

  const commonSet = new Set(commonKeys);
  const leftResidualKeys = left.keys.filter((key) => !commonSet.has(key));
  const rightResidualKeys = right.keys.filter((key) => !commonSet.has(key));

  const common = buildOperandFromLiteralKeys(commonKeys, innerKind);
  const leftResidual = buildOperandFromLiteralKeys(leftResidualKeys, innerKind);
  const rightResidual = buildOperandFromLiteralKeys(rightResidualKeys, innerKind);
  const mergedResidual = combineByKind(leftResidual, rightResidual, rootKind);
  const factoredOperand = combineByKind(common, mergedResidual, innerKind);

  const nextOperands = [];
  for (let index = 0; index < operands.length; index += 1) {
    if (index === leftIndex || index === rightIndex) {
      continue;
    }
    nextOperands.push(cloneAst(operands[index]));
  }
  nextOperands.push(factoredOperand);

  return chain(nextOperands, rootKind);
}

function parseLiteralOperand(node, innerKind) {
  const literalNodes = node.type === innerKind ? flatten(node, innerKind) : [node];
  if (literalNodes.length === 0) {
    return null;
  }

  const keys = [];
  const seen = new Set();
  for (const literal of literalNodes) {
    if (!isLiteralNode(literal)) {
      return null;
    }

    const key = literalNodeKey(literal);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }

  return { keys };
}

function buildOperandFromLiteralKeys(keys, innerKind) {
  if (keys.length === 0) {
    return {
      type: "const",
      value: innerKind === "and",
    };
  }

  const literals = keys.map((key) => literalNodeFromKey(key));
  return chain(literals, innerKind);
}

function combineByKind(left, right, kind) {
  if (kind === "and") {
    if (left.type === "const" && left.value === false) {
      return left;
    }
    if (right.type === "const" && right.value === false) {
      return right;
    }
    if (left.type === "const" && left.value === true) {
      return right;
    }
    if (right.type === "const" && right.value === true) {
      return left;
    }
    return {
      type: "and",
      left,
      right,
    };
  }

  if (left.type === "const" && left.value === true) {
    return left;
  }
  if (right.type === "const" && right.value === true) {
    return right;
  }
  if (left.type === "const" && left.value === false) {
    return right;
  }
  if (right.type === "const" && right.value === false) {
    return left;
  }
  return {
    type: "or",
    left,
    right,
  };
}

function isLiteralNode(node) {
  return node.type === "var" || (node.type === "not" && node.expr?.type === "var");
}

function literalNodeKey(node) {
  if (node.type === "var") {
    return node.name;
  }
  return `!${node.expr.name}`;
}

function literalNodeFromKey(key) {
  if (key.startsWith("!")) {
    return {
      type: "not",
      expr: {
        type: "var",
        name: key.slice(1),
      },
    };
  }

  return {
    type: "var",
    name: key,
  };
}

function literalOccurrenceCount(ast) {
  if (!ast) {
    return 0;
  }

  if (ast.type === "var") {
    return 1;
  }

  if (ast.type === "const") {
    return 0;
  }

  if (ast.type === "not") {
    if (ast.expr?.type === "var") {
      return 1;
    }
    return literalOccurrenceCount(ast.expr);
  }

  if (ast.type === "and" || ast.type === "or") {
    return literalOccurrenceCount(ast.left) + literalOccurrenceCount(ast.right);
  }

  return 0;
}

function bestCover(targetRows, variables, rowCount, form) {
  const implicants = primeImplicants(targetRows, rowCount, variables.length);
  if (implicants.length === 0) {
    return null;
  }

  const targets = [...targetRows];
  let best = null;
  const chosen = [];

  function coversAll(coveredRows) {
    for (const target of targets) {
      if (!coveredRows.has(target)) {
        return false;
      }
    }
    return true;
  }

  function compare(score, candidate) {
    if (!candidate) {
      return true;
    }
    if (score.gateCount !== candidate.gateCount) {
      return score.gateCount < candidate.gateCount;
    }
    if (score.literalCount !== candidate.literalCount) {
      return score.literalCount < candidate.literalCount;
    }
    if (score.termCount !== candidate.termCount) {
      return score.termCount < candidate.termCount;
    }
    return false;
  }

  function search(startIndex, coveredRows) {
    if (coversAll(coveredRows)) {
      const selectedImplicants = chosen.map((index) => implicants[index]);
      const score = scoreCover(selectedImplicants, variables, form);
      if (compare(score, best)) {
        best = {
          ...score,
          ast: buildFromCover(selectedImplicants, variables, form),
          form,
        };
      }
      return;
    }

    if (startIndex >= implicants.length) {
      return;
    }

    for (let index = startIndex; index < implicants.length; index += 1) {
      const nextCovered = new Set(coveredRows);
      for (const row of implicants[index].coveredRows) {
        nextCovered.add(row);
      }

      if (nextCovered.size === coveredRows.size) {
        continue;
      }

      chosen.push(index);
      search(index + 1, nextCovered);
      chosen.pop();
    }
  }

  search(0, new Set());
  return best;
}

function primeImplicants(targetRows, rowCount, bitCount) {
  const allPatterns = enumeratePatterns(bitCount);
  const targetSet = new Set(targetRows);

  const valid = [];
  for (const pattern of allPatterns) {
    const coveredRows = [];
    let invalid = false;

    for (let row = 0; row < rowCount; row += 1) {
      if (!matchesPattern(row, bitCount, pattern)) {
        continue;
      }

      if (targetSet.has(row)) {
        coveredRows.push(row);
      } else {
        invalid = true;
        break;
      }
    }

    if (!invalid && coveredRows.length > 0) {
      valid.push({
        pattern,
        coveredRows,
        literalCount: literalCount(pattern),
      });
    }
  }

  const unique = dedupeByPattern(valid);

  return unique.filter((candidate) => {
    return !unique.some((other) => {
      if (other.pattern === candidate.pattern) {
        return false;
      }
      return subsumes(other.pattern, candidate.pattern);
    });
  });
}

function buildFromCover(implicants, variables, form) {
  if (implicants.length === 0) {
    return { type: "const", value: form === "sop" ? false : true };
  }

  if (form === "sop") {
    const terms = implicants.map((implicant) => implicantToSopTerm(implicant.pattern, variables));
    return chain(terms, "or");
  }

  const clauses = implicants.map((implicant) => implicantToPosClause(implicant.pattern, variables));
  return chain(clauses, "and");
}

function scoreCover(implicants, variables, form) {
  if (implicants.length === 0) {
    return { gateCount: 0, literalCount: 0, termCount: 0 };
  }

  const negated = new Set();
  let literalTotal = 0;

  if (form === "sop") {
    let andGates = 0;
    for (const implicant of implicants) {
      literalTotal += implicant.literalCount;
      andGates += binaryGateCountForOperands(implicant.literalCount);
      for (let i = 0; i < implicant.pattern.length; i += 1) {
        if (implicant.pattern[i] === "0") {
          negated.add(variables[i]);
        }
      }
    }

    const orGate = binaryGateCountForOperands(implicants.length);
    return {
      gateCount: andGates + orGate + negated.size,
      literalCount: literalTotal,
      termCount: implicants.length,
    };
  }

  let orGates = 0;
  for (const implicant of implicants) {
    literalTotal += implicant.literalCount;
    orGates += binaryGateCountForOperands(implicant.literalCount);
    for (let i = 0; i < implicant.pattern.length; i += 1) {
      if (implicant.pattern[i] === "1") {
        negated.add(variables[i]);
      }
    }
  }

  const andGate = binaryGateCountForOperands(implicants.length);
  return {
    gateCount: orGates + andGate + negated.size,
    literalCount: literalTotal,
    termCount: implicants.length,
  };
}

function canonicalSopFromOutputs(variables, outputs) {
  const minterms = [];
  for (let row = 0; row < outputs.length; row += 1) {
    if (outputs[row]) {
      minterms.push(row);
    }
  }
  if (minterms.length === 0 || minterms.length === outputs.length) {
    return null;
  }

  const terms = minterms.map((row) => {
    const literals = variables.map((variable, position) => {
      const bit = (row >> (variables.length - position - 1)) & 1;
      if (bit === 1) {
        return { type: "var", name: variable };
      }
      return {
        type: "not",
        expr: { type: "var", name: variable },
      };
    });
    return chain(literals, "and");
  });

  return chain(terms, "or");
}

function canonicalPosFromOutputs(variables, outputs) {
  const maxterms = [];
  for (let row = 0; row < outputs.length; row += 1) {
    if (!outputs[row]) {
      maxterms.push(row);
    }
  }

  if (maxterms.length === 0 || maxterms.length === outputs.length) {
    return null;
  }

  const clauses = maxterms.map((row) => {
    const literals = variables.map((variable, position) => {
      const bit = (row >> (variables.length - position - 1)) & 1;
      if (bit === 0) {
        return { type: "var", name: variable };
      }
      return {
        type: "not",
        expr: { type: "var", name: variable },
      };
    });
    return chain(literals, "or");
  });

  return chain(clauses, "and");
}

function implicantToSopTerm(pattern, variables) {
  const literals = [];
  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern[i] === "-") {
      continue;
    }

    if (pattern[i] === "1") {
      literals.push({ type: "var", name: variables[i] });
    } else {
      literals.push({
        type: "not",
        expr: { type: "var", name: variables[i] },
      });
    }
  }

  if (literals.length === 0) {
    return { type: "const", value: true };
  }

  return chain(literals, "and");
}

function implicantToPosClause(pattern, variables) {
  const literals = [];
  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern[i] === "-") {
      continue;
    }

    if (pattern[i] === "0") {
      literals.push({ type: "var", name: variables[i] });
    } else {
      literals.push({
        type: "not",
        expr: { type: "var", name: variables[i] },
      });
    }
  }

  if (literals.length === 0) {
    return { type: "const", value: false };
  }

  return chain(literals, "or");
}

function tokenize(rawInput) {
  let source = String(rawInput ?? "");
  source = source.replace(/\u00a0/g, " ");
  source = source.trim();
  source = source.replace(/\$/g, "");
  source = normalizeMathLiveLatex(source);
  source = normalizePrimeSuperscripts(source);
  source = convertLatexOverbar(source);
  source = source.replace(/\\mathbin\s*\{([^{}]*)\}/g, "$1");
  source = source.replace(/\\left\.?/g, "");
  source = source.replace(/\\right\.?/g, "");
  source = source.replace(/\\,|\\;|\\:|\\!/g, "");
  source = source.replace(/\\quad|\\qquad|~/g, "");
  source = source.replace(/\\cdot|\\times/g, ".");
  source = source.replace(/\\land|\\wedge/g, "∧");
  source = source.replace(/\\lor|\\vee/g, "∨");
  source = source.replace(/\\mid/g, "|");
  source = source.replace(/\\neg|\\lnot/g, "!");
  source = source.replace(/[{}]/g, (char) => (char === "{" ? "(" : ")"));
  source = source.replace(/\s+/g, "");

  const tokens = [];

  let index = 0;
  while (index < source.length) {
    const char = source[index];

    if (/[A-Za-z]/.test(char)) {
      let end = index + 1;
      while (end < source.length && /[A-Za-z]/.test(source[end])) {
        end += 1;
      }
      const word = source.slice(index, end);
      tokens.push(...tokenizeAlphaWord(word));
      index = end;
      continue;
    }

    if (char === "0" || char === "1") {
      tokens.push({ type: TOKEN.CONST, value: char === "1", raw: char });
      index += 1;
      continue;
    }

    if (char === "(") {
      tokens.push({ type: TOKEN.LPAREN, raw: char });
      index += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ type: TOKEN.RPAREN, raw: char });
      index += 1;
      continue;
    }

    if (char === "+" || char === "=" || char === "|" || char === "∨") {
      tokens.push({ type: TOKEN.OR, raw: char });
      index += 1;
      continue;
    }

    if (char === "v" || char === "V") {
      tokens.push({ type: TOKEN.OR, raw: char });
      index += 1;
      continue;
    }

    if (char === "." || char === ">" || char === "*" || char === "&" || char === "∧" || char === "·" || char === "^" || char === "6") {
      tokens.push({ type: TOKEN.AND, raw: char });
      index += 1;
      continue;
    }

    if (char === "!" || char === "~" || char === "¬" || char === "-" || char === "_" || char === "`") {
      tokens.push({ type: TOKEN.NOT, raw: char });
      index += 1;
      continue;
    }

    if (char === "'" || char === "′") {
      tokens.push({ type: TOKEN.PRIME, raw: char });
      index += 1;
      continue;
    }

    throw new Error(`Unrecognized character '${char}'.`);
  }

  return injectImplicitAnd(tokens);
}

function normalizePrimeSuperscripts(input) {
  let working = input;

  // Convert LaTeX \prime forms and superscripted prime syntax to apostrophes.
  working = working.replace(/\\prime/g, "'");
  working = working.replace(/\^\s*\{\s*('+|′+)\s*\}/g, (_, primes) => {
    return primes.replace(/′/g, "'");
  });
  working = working.replace(/\^\s*('+|′+)/g, (_, primes) => {
    return primes.replace(/′/g, "'");
  });

  return working;
}

function tokenizeAlphaWord(word) {
  const upper = word.toUpperCase();
  const tokens = [];
  let index = 0;

  while (index < upper.length) {
    if (upper.startsWith("AND", index)) {
      tokens.push({ type: TOKEN.AND, raw: word.slice(index, index + 3) });
      index += 3;
      continue;
    }

    if (upper.startsWith("NOT", index)) {
      tokens.push({ type: TOKEN.NOT, raw: word.slice(index, index + 3) });
      index += 3;
      continue;
    }

    if (upper.startsWith("OR", index)) {
      tokens.push({ type: TOKEN.OR, raw: word.slice(index, index + 2) });
      index += 2;
      continue;
    }

    const variable = upper[index];
    if (VARIABLE_POOL.includes(variable)) {
      tokens.push({ type: TOKEN.VAR, value: variable, raw: word[index] });
      index += 1;
      continue;
    }

    throw new Error(`Unknown symbol '${word}'. Use variables A-D only.`);
  }

  return tokens;
}

function normalizeMathLiveLatex(input) {
  let working = input;

  working = working.replace(/\\overline\s*\{/g, "\\overline{");
  working = working.replace(/\\bar\s*\{/g, "\\bar{");
  working = working.replace(/\\left\.?|\\mleft\.?/g, "");
  working = working.replace(/\\right\.?|\\mright\.?/g, "");
  working = working.replace(/\\operatorname\s*\{\s*lnot\s*\}/gi, "\\lnot");
  working = working.replace(/\\operatorname\s*\{\s*neg\s*\}/gi, "\\neg");
  working = working.replace(/\\operatorname\s*\{\s*not\s*\}/gi, "NOT");
  working = working.replace(/\\operatorname\s*\{\s*cdot\s*\}/gi, "\\cdot");
  working = working.replace(/\\operatorname\s*\{\s*times\s*\}/gi, "\\times");
  working = working.replace(/\\mathord\s*\{\s*([ABCD01])\s*\}/g, "$1");
  working = working.replace(/\\mathrm\s*\{\s*([ABCD01])\s*\}/g, "$1");
  working = working.replace(/\\text\s*\{\s*([ABCD01])\s*\}/g, "$1");
  working = working.replace(/\\lnot\s*\{\s*\}/g, "\\lnot");
  working = working.replace(/\\neg\s*\{\s*\}/g, "\\neg");
  working = working.replace(/\\cdot\s*\{\s*\}/g, "\\cdot");
  working = working.replace(/\\times\s*\{\s*\}/g, "\\times");
  working = working.replace(/\\placeholder(?:\[[^\]]*\])?(?:\{[^{}]*\})+/g, "");
  working = working.replace(/\\cursor\b/g, "");

  return working;
}

function injectImplicitAnd(tokens) {
  const expanded = [];

  function isValueEnd(token) {
    return token.type === TOKEN.VAR || token.type === TOKEN.CONST || token.type === TOKEN.RPAREN || token.type === TOKEN.PRIME;
  }

  function canStartValue(token) {
    return token.type === TOKEN.VAR || token.type === TOKEN.CONST || token.type === TOKEN.LPAREN || token.type === TOKEN.NOT;
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const current = tokens[i];
    const next = tokens[i + 1];
    expanded.push(current);

    if (next && isValueEnd(current) && canStartValue(next)) {
      expanded.push({ type: TOKEN.AND, raw: "(implicit AND)" });
    }
  }

  return expanded;
}

function convertLatexOverbar(input) {
  let working = input;

  while (true) {
    const overlineIndex = working.indexOf("\\overline{");
    const barIndex = working.indexOf("\\bar{");

    let commandIndex = -1;
    let commandText = "";

    if (overlineIndex >= 0 && barIndex >= 0) {
      if (overlineIndex < barIndex) {
        commandIndex = overlineIndex;
        commandText = "\\overline{";
      } else {
        commandIndex = barIndex;
        commandText = "\\bar{";
      }
    } else if (overlineIndex >= 0) {
      commandIndex = overlineIndex;
      commandText = "\\overline{";
    } else if (barIndex >= 0) {
      commandIndex = barIndex;
      commandText = "\\bar{";
    }

    if (commandIndex < 0) {
      break;
    }

    const openBrace = commandIndex + commandText.length - 1;
    const closeBrace = findMatchingBrace(working, openBrace);
    if (closeBrace < 0) {
      break;
    }

    const inside = working.slice(openBrace + 1, closeBrace);
    const replacement = `(${inside})'`;
    working = `${working.slice(0, commandIndex)}${replacement}${working.slice(closeBrace + 1)}`;
  }

  return working;
}

function findMatchingBrace(text, openBraceIndex) {
  let depth = 0;
  for (let i = openBraceIndex; i < text.length; i += 1) {
    if (text[i] === "{") {
      depth += 1;
    } else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function flatten(node, kind) {
  if (!node) {
    return [];
  }
  if (node.type !== kind) {
    return [node];
  }
  return [...flatten(node.left, kind), ...flatten(node.right, kind)];
}

function chain(nodes, kind) {
  if (nodes.length === 0) {
    return kind === "and" ? { type: "const", value: true } : { type: "const", value: false };
  }

  if (nodes.length === 1) {
    return nodes[0];
  }

  return nodes.reduce((left, right) => ({ type: kind, left, right }));
}

function pickConnector(kind, notationId, forLatex) {
  if (kind === "and") {
    if (notationId === "aqa") {
      return forLatex ? "\\,\\cdot\\," : " . ";
    }
    if (notationId === "logic") {
      return forLatex ? "\\,\\land\\," : "∧";
    }
    return forLatex ? "\\mathbin{\\&}" : "&";
  }

  if (notationId === "aqa") {
    return forLatex ? "\\,+\\," : " + ";
  }
  if (notationId === "logic") {
    return forLatex ? "\\,\\lor\\," : "∨";
  }
  return forLatex ? "\\mid " : "|";
}

function assignmentFromRow(row, variables) {
  const assignment = {};
  for (let i = 0; i < variables.length; i += 1) {
    const bit = (row >> (variables.length - i - 1)) & 1;
    assignment[variables[i]] = bit === 1;
  }
  return assignment;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function binaryGateCountForOperands(operandCount) {
  if (operandCount <= 1) {
    return 0;
  }
  return operandCount - 1;
}

function cloneAst(node) {
  if (!node) {
    return node;
  }

  if (node.type === "var") {
    return {
      type: "var",
      name: node.name,
    };
  }

  if (node.type === "const") {
    return {
      type: "const",
      value: node.value,
    };
  }

  if (node.type === "not") {
    return {
      type: "not",
      expr: cloneAst(node.expr),
    };
  }

  if (node.type === "and" || node.type === "or") {
    return {
      type: node.type,
      left: cloneAst(node.left),
      right: cloneAst(node.right),
    };
  }

  throw new Error("Unknown AST node while cloning.");
}

function collectTransformPaths(node, path = [], paths = []) {
  if (!node || node.type === "const") {
    return paths;
  }

  paths.push(path);

  if (node.type === "not") {
    collectTransformPaths(node.expr, [...path, "expr"], paths);
    return paths;
  }

  if (node.type === "and" || node.type === "or") {
    collectTransformPaths(node.left, [...path, "left"], paths);
    collectTransformPaths(node.right, [...path, "right"], paths);
  }

  return paths;
}

function nodeAtPath(node, path) {
  let current = node;
  for (const key of path) {
    if (!current) {
      return null;
    }
    current = current[key];
  }
  return current;
}

function replaceNodeAtPath(node, path, replacement) {
  if (path.length === 0) {
    return replacement;
  }

  const [head, ...rest] = path;

  if (node.type === "not" && head === "expr") {
    return {
      type: "not",
      expr: replaceNodeAtPath(node.expr, rest, replacement),
    };
  }

  if ((node.type === "and" || node.type === "or") && (head === "left" || head === "right")) {
    return {
      type: node.type,
      left: head === "left" ? replaceNodeAtPath(node.left, rest, replacement) : cloneAst(node.left),
      right: head === "right" ? replaceNodeAtPath(node.right, rest, replacement) : cloneAst(node.right),
    };
  }

  throw new Error("Invalid AST replacement path.");
}

function randomVariableAst(variables) {
  const name = variables[randomInt(0, variables.length - 1)];
  return {
    type: "var",
    name,
  };
}

function randomLiteralAst(variables) {
  const variable = randomVariableAst(variables);
  if (Math.random() < 0.5) {
    return variable;
  }

  return {
    type: "not",
    expr: variable,
  };
}

function complementLiteral(literal) {
  if (literal.type === "var") {
    return {
      type: "not",
      expr: cloneAst(literal),
    };
  }

  if (literal.type === "not" && literal.expr.type === "var") {
    return cloneAst(literal.expr);
  }

  return {
    type: "not",
    expr: cloneAst(literal),
  };
}

function shuffledNumbers(size) {
  const values = Array.from({ length: size }, (_, index) => index);
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function enumeratePatterns(length) {
  const results = [];
  const symbols = ["0", "1", "-"];

  function build(prefix) {
    if (prefix.length === length) {
      if (prefix.some((symbol) => symbol !== "-")) {
        results.push(prefix.join(""));
      }
      return;
    }

    for (const symbol of symbols) {
      prefix.push(symbol);
      build(prefix);
      prefix.pop();
    }
  }

  build([]);
  return results;
}

function matchesPattern(row, bitCount, pattern) {
  for (let index = 0; index < bitCount; index += 1) {
    const bit = (row >> (bitCount - index - 1)) & 1;
    const expected = pattern[index];
    if (expected === "-") {
      continue;
    }
    if (expected === "1" && bit !== 1) {
      return false;
    }
    if (expected === "0" && bit !== 0) {
      return false;
    }
  }
  return true;
}

function literalCount(pattern) {
  let count = 0;
  for (const symbol of pattern) {
    if (symbol !== "-") {
      count += 1;
    }
  }
  return count;
}

function dedupeByPattern(implicants) {
  const seen = new Map();
  for (const implicant of implicants) {
    seen.set(implicant.pattern, implicant);
  }
  return [...seen.values()];
}

function subsumes(generalPattern, specificPattern) {
  for (let i = 0; i < generalPattern.length; i += 1) {
    const general = generalPattern[i];
    const specific = specificPattern[i];
    if (general === "-") {
      continue;
    }
    if (general !== specific) {
      return false;
    }
  }
  return true;
}



