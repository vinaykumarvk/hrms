import { FoundationError } from "../../platform/types";

/**
 * PH-09A — BRD G10 FR-01 constrained expression DSL (Appendix 16.7, VAL-G10-DSL-TOKEN).
 *
 * Whitelist-only grammar: component-code identifiers, RATE() references, integer/decimal
 * literals, arithmetic (+ - * /), parentheses, commas, and the MIN/MAX/ROUND function set.
 * ANY other token rejects with ERR-G10-RULE-EXPR (422) carrying line/column detail.
 * There is NO eval of arbitrary strings — expressions are tokenised, validated against the
 * whitelist, parsed to an AST, and evaluated with deterministic integer-cents arithmetic.
 */

export const DSL_GRAMMAR_VERSION = "G10-DSL-1.0";

/** Functions the grammar admits (BRD FR-01: min/max/round; RATE resolves a rate-table ref). */
export const DSL_FUNCTION_WHITELIST = ["MIN", "MAX", "ROUND", "RATE"] as const;

type DslTokenType = "NUMBER" | "IDENTIFIER" | "FUNCTION" | "OPERATOR" | "LPAREN" | "RPAREN" | "COMMA";

export interface DslToken {
  type: DslTokenType;
  value: string;
  column: number;
}

function rejectExpression(message: string, column: number, token?: string): never {
  throw new FoundationError("ERR-G10-RULE-EXPR", message, {
    field: "formulaExpression",
    details: { validation: "VAL-G10-DSL-TOKEN", line: 1, column, token, dslGrammarVersion: DSL_GRAMMAR_VERSION },
  });
}

/** Tokenise a formula; any character or word outside the whitelist rejects (ERR-G10-RULE-EXPR). */
export function tokenizeExpression(expression: string): DslToken[] {
  const tokens: DslToken[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression.charAt(index);
    if (char === " " || char === "\t") {
      index += 1;
      continue;
    }
    const column = index + 1;
    if (char === "(") {
      tokens.push({ type: "LPAREN", value: char, column });
      index += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "RPAREN", value: char, column });
      index += 1;
      continue;
    }
    if (char === ",") {
      tokens.push({ type: "COMMA", value: char, column });
      index += 1;
      continue;
    }
    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ type: "OPERATOR", value: char, column });
      index += 1;
      continue;
    }
    if (char >= "0" && char <= "9") {
      let end = index;
      while (end < expression.length && isNumericChar(expression.charAt(end))) {
        end += 1;
      }
      const literal = expression.slice(index, end);
      if (literal.split(".").length > 2) {
        rejectExpression(`Malformed numeric literal '${literal}'`, column, literal);
      }
      tokens.push({ type: "NUMBER", value: literal, column });
      index = end;
      continue;
    }
    if (isWordStartChar(char)) {
      let end = index;
      while (end < expression.length && isWordChar(expression.charAt(end))) {
        end += 1;
      }
      const word = expression.slice(index, end);
      const isFunction = (DSL_FUNCTION_WHITELIST as readonly string[]).includes(word.toUpperCase());
      tokens.push({ type: isFunction ? "FUNCTION" : "IDENTIFIER", value: isFunction ? word.toUpperCase() : word, column });
      index = end;
      continue;
    }
    rejectExpression(`Token '${char}' is not in the DSL whitelist`, column, char);
  }
  return tokens;
}

function isNumericChar(char: string): boolean {
  return (char >= "0" && char <= "9") || char === ".";
}

function isWordStartChar(char: string): boolean {
  return (char >= "A" && char <= "Z") || (char >= "a" && char <= "z") || char === "_";
}

function isWordChar(char: string): boolean {
  return isWordStartChar(char) || (char >= "0" && char <= "9");
}

/**
 * Validate a formula expression against the pinned grammar and the set of known component
 * codes / rate-table refs. Rejects unknown references, unbalanced parens, and disallowed
 * tokens with ERR-G10-RULE-EXPR (BRD FR-01 AC2). Returns the token stream on success.
 */
export function validateExpression(expression: string, knownReferences: ReadonlySet<string>): DslToken[] {
  const trimmed = expression.trim();
  if (!trimmed) {
    rejectExpression("Formula expression must not be empty", 1);
  }
  const tokens = tokenizeExpression(trimmed);
  let depth = 0;
  for (const token of tokens) {
    if (token.type === "LPAREN") {
      depth += 1;
    }
    if (token.type === "RPAREN") {
      depth -= 1;
      if (depth < 0) {
        rejectExpression("Unbalanced parentheses", token.column, token.value);
      }
    }
    if (token.type === "IDENTIFIER" && !knownReferences.has(token.value)) {
      rejectExpression(`Unknown reference '${token.value}' — not a registered pay component or rate ref`, token.column, token.value);
    }
  }
  if (depth !== 0) {
    rejectExpression("Unbalanced parentheses", trimmed.length, trimmed[trimmed.length - 1]);
  }
  // Parse to prove the token stream forms a single well-formed expression (no eval).
  parseTokens(tokens);
  return tokens;
}

// -- AST + recursive-descent parser (precedence pinned: */ bind tighter than +-) ---------

type DslNode =
  | { kind: "number"; value: string }
  | { kind: "reference"; name: string }
  | { kind: "binary"; operator: "+" | "-" | "*" | "/"; left: DslNode; right: DslNode }
  | { kind: "call"; name: string; args: DslNode[] };

function parseTokens(tokens: DslToken[]): DslNode {
  let position = 0;

  function peek(): DslToken | undefined {
    return tokens[position];
  }

  function next(): DslToken {
    const token = tokens[position];
    if (!token) {
      const last = tokens[tokens.length - 1];
      rejectExpression("Unexpected end of expression", last ? last.column + last.value.length : 1);
    }
    position += 1;
    return token;
  }

  function parseExpressionLevel(): DslNode {
    let node = parseTermLevel();
    while (peek() && peek()!.type === "OPERATOR" && (peek()!.value === "+" || peek()!.value === "-")) {
      const operator = next().value as "+" | "-";
      node = { kind: "binary", operator, left: node, right: parseTermLevel() };
    }
    return node;
  }

  function parseTermLevel(): DslNode {
    let node = parsePrimary();
    while (peek() && peek()!.type === "OPERATOR" && (peek()!.value === "*" || peek()!.value === "/")) {
      const operator = next().value as "*" | "/";
      node = { kind: "binary", operator, left: node, right: parsePrimary() };
    }
    return node;
  }

  function parsePrimary(): DslNode {
    const token = next();
    if (token.type === "NUMBER") {
      return { kind: "number", value: token.value };
    }
    if (token.type === "IDENTIFIER") {
      return { kind: "reference", name: token.value };
    }
    if (token.type === "FUNCTION") {
      const open = next();
      if (open.type !== "LPAREN") {
        rejectExpression(`Function ${token.value} must be followed by '('`, open.column, open.value);
      }
      const args: DslNode[] = [parseExpressionLevel()];
      while (peek() && peek()!.type === "COMMA") {
        next();
        args.push(parseExpressionLevel());
      }
      const close = next();
      if (close.type !== "RPAREN") {
        rejectExpression(`Function ${token.value} arguments must close with ')'`, close.column, close.value);
      }
      return { kind: "call", name: token.value, args };
    }
    if (token.type === "LPAREN") {
      const inner = parseExpressionLevel();
      const close = next();
      if (close.type !== "RPAREN") {
        rejectExpression("Expected ')'", close.column, close.value);
      }
      return inner;
    }
    rejectExpression(`Unexpected token '${token.value}'`, token.column, token.value);
  }

  const root = parseExpressionLevel();
  const trailing = peek();
  if (trailing) {
    rejectExpression(`Unexpected trailing token '${trailing.value}'`, trailing.column, trailing.value);
  }
  return root;
}

/**
 * Evaluator skeleton: compute an expression over integer-cents inputs. Every value is held
 * as an INTEGER scaled by 10^4 (four pinned decimal places for rate factors); each step
 * checks integer safety and resolves half-up — no floating-point currency values, ever.
 */
export function evaluateExpression(expression: string, contextCents: ReadonlyMap<string, number>): number {
  const tokens = validateExpression(expression, new Set(contextCents.keys()));
  const root = parseTokens(tokens);
  const scaled = evaluateNode(root, contextCents);
  return Math.round(scaled / SCALE);
}

const SCALE = 10000;

function assertSafeInteger(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new FoundationError("ERR-G10-RULE-EXPR", "Formula expression overflows deterministic integer arithmetic", {
      field: "formulaExpression",
      details: { validation: "VAL-G10-DSL-TOKEN" },
    });
  }
  return value;
}

/** Evaluate to an integer scaled by 10^4 (cents x 10^4 for money terms). */
function evaluateNode(node: DslNode, contextCents: ReadonlyMap<string, number>): number {
  switch (node.kind) {
    case "number": {
      const [whole, fraction = ""] = node.value.split(".");
      const paddedFraction = fraction.padEnd(4, "0").slice(0, 4);
      return assertSafeInteger(Number(whole) * SCALE + Number(paddedFraction));
    }
    case "reference": {
      const value = contextCents.get(node.name);
      if (value === undefined || !Number.isInteger(value)) {
        throw new FoundationError("ERR-G10-RULE-EXPR", `Reference '${node.name}' did not resolve to integer cents`, {
          field: "formulaExpression",
          details: { validation: "VAL-G10-DSL-TOKEN", token: node.name },
        });
      }
      return assertSafeInteger(value * SCALE);
    }
    case "binary": {
      const left = evaluateNode(node.left, contextCents);
      const right = evaluateNode(node.right, contextCents);
      switch (node.operator) {
        case "+":
          return assertSafeInteger(left + right);
        case "-":
          return assertSafeInteger(left - right);
        case "*":
          // (a*10^4) * (b*10^4) / 10^4 keeps the 10^4 scale; half-up to stay integral.
          return assertSafeInteger(Math.round((assertSafeInteger(left * right) / SCALE)));
        case "/": {
          if (right === 0) {
            throw new FoundationError("ERR-G10-RULE-EXPR", "Division by zero in formula expression", {
              field: "formulaExpression",
              details: { validation: "VAL-G10-DSL-TOKEN" },
            });
          }
          return assertSafeInteger(Math.round(assertSafeInteger(left * SCALE) / right));
        }
      }
      break;
    }
    case "call": {
      const args = node.args.map((arg) => evaluateNode(arg, contextCents));
      const first = args[0];
      if (first === undefined) {
        throw new FoundationError("ERR-G10-RULE-EXPR", `Function '${node.name}' requires at least one argument`, {
          field: "formulaExpression",
          details: { validation: "VAL-G10-DSL-TOKEN", token: node.name },
        });
      }
      switch (node.name) {
        case "MIN":
          return Math.min(...args);
        case "MAX":
          return Math.max(...args);
        case "ROUND":
          // Round to whole cents within the pinned 10^4 scale.
          return assertSafeInteger(Math.round(first / SCALE) * SCALE);
        case "RATE":
          // RATE(ref) — the ref must already be resolved into the context (integer cents/bps).
          return first;
        default:
          throw new FoundationError("ERR-G10-RULE-EXPR", `Function '${node.name}' is not whitelisted`, {
            field: "formulaExpression",
            details: { validation: "VAL-G10-DSL-TOKEN", token: node.name },
          });
      }
    }
  }
  throw new FoundationError("INTERNAL", "Unreachable DSL evaluation state");
}
