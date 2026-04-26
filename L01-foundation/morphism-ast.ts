// PP-27: confirmed L01 home — pure shape contract; consumers L05-L14.
export type MorphismAST =
  | RefNode
  | ComposeNode
  | ProductNode
  | SumNode
  | RestrictNode
  | ExtendNode
  | FmapNode
  | IterNode
  | CondNode
  | LiteralNode
  | GuardNode;

export interface RefNode {
  op: "ref";
  asset: string;
  props?: Record<string, unknown>;
  requires?: string[];
  requiresAny?: string[];
  fallback?: MorphismAST;
}

export interface ComposeNode {
  op: "compose";
  outer: MorphismAST;
  inner: MorphismAST;
}

export interface ProductNode {
  op: "product";
  left: MorphismAST;
  right: MorphismAST;
}

export interface SumNode {
  op: "sum";
  predicate: unknown;
  then: MorphismAST;
  else: MorphismAST;
}

export interface RestrictNode {
  op: "restrict";
  predicate: unknown;
  f: MorphismAST;
  fallback?: MorphismAST;
  _derivedFromGuard?: { requires?: string[]; requiresAny?: string[] };
  _derivedFromProjections?: true;
}

export interface ExtendNode {
  op: "extend";
  source: { name: string; spec: unknown };
  f: MorphismAST;
}

export interface FmapNode {
  op: "fmap";
  binding: unknown;
  f: MorphismAST;
  _derivedFromProjections?: true;
}

export interface IterNode {
  op: "iter";
  for: string;
  as?: string;
  template: MorphismAST;
  emptyFallback?: MorphismAST;
}

export interface CondNode {
  op: "cond";
  if: unknown;
  then: MorphismAST;
  else?: MorphismAST;
}

export interface LiteralNode {
  op: "literal";
  value: unknown;
}

export interface GuardNode {
  op: "guard";
  requires?: string[];
  requiresAny?: string[];
  f: MorphismAST;
  fallback?: MorphismAST;
}
