import type { ProjectionModel } from "../../L01-foundation/projection-types.ts";
import type { WalkedTree } from "../compile-types.ts";

type Input = ProjectionModel & { doc?: ProjectionModel; manifest?: unknown };

export default function walkAst(
  input: Input,
): WalkedTree & ProjectionModel & { doc: ProjectionModel; ast: WalkedTree; manifest?: unknown } {
  const doc = input.doc ?? input;
  const ast: WalkedTree = doc.pages
    ? {
        kind: "pages",
        entries: Object.entries(doc.pages).map(([pageName, page]) => ({
          pageName,
          bindings: page.bind ?? {},
          children: page.children ?? [],
        })),
      }
    : { kind: "morphism", entries: [{ root: doc.morphism }] };
  return { ...doc, ...input, doc, ast, kind: ast.kind, entries: ast.entries } as WalkedTree &
    ProjectionModel & { doc: ProjectionModel; ast: WalkedTree; manifest?: unknown };
}
