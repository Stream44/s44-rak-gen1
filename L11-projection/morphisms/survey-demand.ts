import type { ProjectionModel } from "../../L01-foundation/projection-types.ts";
import type { DataRequirement, WalkedTree } from "../compile-types.ts";

type Input = ProjectionModel &
  Partial<WalkedTree> & { doc?: ProjectionModel; ast?: WalkedTree; walkedTree?: WalkedTree };

export default function surveyDemand(
  input: Input,
): WalkedTree &
  ProjectionModel & { doc: ProjectionModel; ast: WalkedTree; dataReqs: DataRequirement[] } {
  const doc = input.doc ?? input;
  const ast = (input.walkedTree ?? input.ast ?? { kind: "morphism", entries: [] }) as WalkedTree;
  const dataReqs =
    ast.kind === "morphism"
      ? []
      : ast.entries.flatMap((page) =>
          Object.entries(page.bindings).flatMap(([name, value]) => {
            const match = typeof value === "string" && /^\$demand\.([^./]+)[./](.+)$/.exec(value);
            return match
              ? [
                  {
                    model: match[1],
                    selector: match[2],
                    nodePath: `pages.${page.pageName}.bind.${name}`,
                  },
                ]
              : [];
          }),
        );
  return {
    ...doc,
    ...input,
    doc,
    ast,
    dataReqs,
    kind: ast.kind,
    entries: ast.entries,
  } as WalkedTree &
    ProjectionModel & { doc: ProjectionModel; ast: WalkedTree; dataReqs: DataRequirement[] };
}
