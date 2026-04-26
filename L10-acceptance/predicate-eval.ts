type PredicateToken =
  | { kind: "identifier"; value: string; index: number }
  | { kind: "string"; value: string; index: number }
  | { kind: "number"; value: number; index: number }
  | { kind: "boolean"; value: boolean; index: number }
  | { kind: "keyword"; value: "and" | "or" | "not" | "in"; index: number }
  | { kind: "operator"; value: "==" | "!=" | ">=" | "<=" | ">" | "<"; index: number }
  | { kind: "punct"; value: "(" | ")" | "[" | "]" | ","; index: number }
  | { kind: "eof"; index: number };

type PredicateAst =
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "path"; segments: string[] }
  | { kind: "not"; value: PredicateAst }
  | { kind: "logical"; op: "and" | "or"; left: PredicateAst; right: PredicateAst }
  | {
      kind: "compare";
      op: "==" | "!=" | ">=" | "<=" | ">" | "<";
      left: PredicateAst;
      right: PredicateAst;
    }
  | { kind: "in"; left: PredicateAst; right: Array<string | number | boolean> };

function tokenizePredicate(expression: string): PredicateToken[] {
  const tokens: PredicateToken[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index] ?? "";
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "'") {
      let value = "";
      const start = index;
      index += 1;
      while (index < expression.length && expression[index] !== "'")
        value += expression[index++] ?? "";
      if (expression[index] !== "'") throw new Error(`Unterminated string at ${start}`);
      tokens.push({ kind: "string", value, index: start });
      index += 1;
      continue;
    }
    const two = expression.slice(index, index + 2);
    if (["==", "!=", ">=", "<="].includes(two)) {
      tokens.push({ kind: "operator", value: two as "==" | "!=" | ">=" | "<=", index });
      index += 2;
      continue;
    }
    if ([">", "<"].includes(char)) {
      tokens.push({ kind: "operator", value: char as ">" | "<", index });
      index += 1;
      continue;
    }
    if (["(", ")", "[", "]", ","].includes(char)) {
      tokens.push({ kind: "punct", value: char as "(" | ")" | "[" | "]" | ",", index });
      index += 1;
      continue;
    }
    const number = expression.slice(index).match(/^-?\d+(?:\.\d+)?/);
    if (number) {
      tokens.push({ kind: "number", value: Number(number[0]), index });
      index += number[0].length;
      continue;
    }
    const identifier = expression.slice(index).match(/^[A-Za-z_][A-Za-z0-9_.]*/);
    if (!identifier) throw new Error(`Unexpected token "${char}" at ${index}`);
    const value = identifier[0];
    if (value === "true" || value === "false")
      tokens.push({ kind: "boolean", value: value === "true", index });
    else if (value === "and" || value === "or" || value === "not" || value === "in")
      tokens.push({ kind: "keyword", value, index });
    else tokens.push({ kind: "identifier", value, index });
    index += value.length;
  }
  tokens.push({ kind: "eof", index: expression.length });
  return tokens;
}

function parsePredicate(expression: string): PredicateAst {
  const tokens = tokenizePredicate(expression);
  let index = 0;
  const current = (): PredicateToken => tokens[index] ?? { kind: "eof", index: expression.length };
  const advance = (): PredicateToken =>
    tokens[index++] ?? { kind: "eof", index: expression.length };
  const error = (message: string): never => {
    throw new Error(`${message} at ${current().index}`);
  };
  const matchKeyword = (keyword: "and" | "or" | "not" | "in"): boolean => {
    const token = current();
    if (token.kind !== "keyword" || token.value !== keyword) return false;
    advance();
    return true;
  };
  const matchOperator = (): ("==" | "!=" | ">=" | "<=" | ">" | "<") | null => {
    const token = current();
    if (token.kind !== "operator") return null;
    advance();
    return token.value;
  };
  const matchPunct = (punct: "(" | ")" | "[" | "]" | ","): boolean => {
    const token = current();
    if (token.kind !== "punct" || token.value !== punct) return false;
    advance();
    return true;
  };
  const parseList = (): Array<string | number | boolean> => {
    if (!matchPunct("[")) error("Expected '['");
    const values: Array<string | number | boolean> = [];
    while (!matchPunct("]")) {
      const token = advance();
      if (token.kind !== "string" && token.kind !== "number" && token.kind !== "boolean")
        error("Expected literal");
      const literal =
        token.kind === "string" || token.kind === "number" || token.kind === "boolean"
          ? token.value
          : error("Expected literal");
      values.push(literal);
      if (matchPunct("]")) break;
      if (!matchPunct(",")) error("Expected ','");
    }
    return values;
  };
  const parsePrimary = (): PredicateAst => {
    if (matchPunct("(")) {
      const value = parseOr();
      if (!matchPunct(")")) error("Expected ')'");
      return value;
    }
    const token = advance();
    if (token.kind === "identifier") return { kind: "path", segments: token.value.split(".") };
    if (token.kind === "string" || token.kind === "number" || token.kind === "boolean")
      return { kind: "literal", value: token.value };
    return error(`Unexpected token "${"value" in token ? token.value : token.kind}"`);
  };
  const parseUnary = (): PredicateAst =>
    matchKeyword("not") ? { kind: "not", value: parseUnary() } : parseComparison();
  const parseComparison = (): PredicateAst => {
    const left = parsePrimary();
    if (matchKeyword("in")) return { kind: "in", left, right: parseList() };
    const op = matchOperator();
    return op ? { kind: "compare", op, left, right: parsePrimary() } : left;
  };
  const parseAnd = (): PredicateAst => {
    let left = parseUnary();
    while (matchKeyword("and")) left = { kind: "logical", op: "and", left, right: parseUnary() };
    return left;
  };
  const parseOr = (): PredicateAst => {
    let left = parseAnd();
    while (matchKeyword("or")) left = { kind: "logical", op: "or", left, right: parseAnd() };
    return left;
  };
  const ast = parseOr();
  if (current().kind !== "eof") error("Unexpected trailing token");
  return ast;
}

function readPredicatePath(context: Record<string, unknown>, segments: string[]): unknown {
  return segments.reduce<unknown>(
    (value, segment) =>
      value != null && typeof value === "object"
        ? (value as Record<string, unknown>)[segment]
        : undefined,
    context,
  );
}

function evaluatePredicateAst(ast: PredicateAst, context: Record<string, unknown>): unknown {
  switch (ast.kind) {
    case "literal":
      return ast.value;
    case "path":
      return readPredicatePath(context, ast.segments);
    case "not":
      return !Boolean(evaluatePredicateAst(ast.value, context));
    case "logical":
      return ast.op === "and"
        ? Boolean(evaluatePredicateAst(ast.left, context)) &&
            Boolean(evaluatePredicateAst(ast.right, context))
        : Boolean(evaluatePredicateAst(ast.left, context)) ||
            Boolean(evaluatePredicateAst(ast.right, context));
    case "compare": {
      const left = evaluatePredicateAst(ast.left, context);
      const right = evaluatePredicateAst(ast.right, context);
      switch (ast.op) {
        case "==":
          return left === right;
        case "!=":
          return left !== right;
        case ">=":
          return typeof left === "number" && typeof right === "number" ? left >= right : false;
        case "<=":
          return typeof left === "number" && typeof right === "number" ? left <= right : false;
        case ">":
          return typeof left === "number" && typeof right === "number" ? left > right : false;
        case "<":
          return typeof left === "number" && typeof right === "number" ? left < right : false;
      }
    }
    case "in":
      return ast.right.includes(
        evaluatePredicateAst(ast.left, context) as string | number | boolean,
      );
  }
}

export function evaluatePredicate(expression: string, context: Record<string, unknown>): boolean {
  return Boolean(evaluatePredicateAst(parsePredicate(expression), context));
}
