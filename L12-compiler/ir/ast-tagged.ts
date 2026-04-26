export interface TaggedAstNode {
  op: string;
  // Monotonic and unique within a single normalize() invocation.
  nodeId: number;
  // Pre-order child list used by downstream compiler passes.
  children: TaggedAstNode[];
  [key: string]: unknown;
}

export interface AllocatedAstNode extends TaggedAstNode {
  reg: number;
  captures?: number[];
}

export interface AllocatedAst {
  root: AllocatedAstNode;
  registerCount: number;
}

export function createTaggedAstNode(
  nodeId: number,
  op: string,
  extras: Record<string, unknown> = {},
  children: TaggedAstNode[] = [],
): TaggedAstNode {
  return { ...extras, op, nodeId, children };
}

export function isTaggedAstNode(value: unknown): value is TaggedAstNode {
  return (
    !!value &&
    typeof value === "object" &&
    "op" in value &&
    "nodeId" in value &&
    "children" in value
  );
}
