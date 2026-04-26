// mirrors the prior capability-enforcement walker — flat output only
import type {
  ActionBindingDef,
  AuthScope,
  ChildSpec,
  ProjectionModel,
} from "../../L01-foundation/projection-types.ts";

export type FlatCarrier = {
  scope: AuthScope;
  nodePath: string;
  requires?: string[];
  requiresAny?: string[];
};

type Carrier = { requires?: string[]; requiresAny?: string[]; projections?: unknown[] };

export default function walkProjectionNodes(doc: ProjectionModel): FlatCarrier[] {
  const out: FlatCarrier[] = [];
  emit(out, doc as Carrier, "projection", "$");
  for (const [i, route] of (doc.routes ?? []).entries())
    emit(out, route as Carrier, "route", `routes[${i}]`);
  for (const [pageName, page] of Object.entries(doc.pages ?? {})) {
    const pagePath = `pages.${pageName}`;
    for (const [bindingName, spec] of Object.entries(page.bind ?? {})) {
      if (typeof spec === "object" && spec !== null && !Array.isArray(spec)) {
        emit(out, spec as Carrier, "binding", `${pagePath}.bind.${bindingName}`);
        for (const [i, entry] of ((spec as Carrier).projections ?? []).entries())
          if (entry && typeof entry === "object" && !Array.isArray(entry))
            emit(
              out,
              entry as Carrier,
              "binding",
              `${pagePath}.bind.${bindingName}.projections[${i}]`,
            );
      }
    }
    for (const [regionName, region] of Object.entries(page.regions ?? {}))
      walk(out, region, `${pagePath}.regions.${regionName}`);
    for (const [i, child] of (page.children ?? []).entries())
      walk(out, child, `${pagePath}.children[${i}]`);
  }
  return out;
}

function walk(out: FlatCarrier[], node: ChildSpec | undefined, nodePath: string): void {
  if (!node || typeof node !== "object") return;
  if ("component" in node) {
    emit(out, node as Carrier, "component", nodePath);
    pushAction(out, (node as { onClick?: ActionBindingDef }).onClick, `${nodePath}.onClick`);
    pushAction(out, (node as { onSubmit?: ActionBindingDef }).onSubmit, `${nodePath}.onSubmit`);
    pushAction(
      out,
      (node as { onEditStart?: ActionBindingDef }).onEditStart,
      `${nodePath}.onEditStart`,
    );
    pushAction(
      out,
      (node as { onEditCommit?: ActionBindingDef }).onEditCommit,
      `${nodePath}.onEditCommit`,
    );
    pushAction(
      out,
      (node as { onEditCancel?: ActionBindingDef }).onEditCancel,
      `${nodePath}.onEditCancel`,
    );
    pushAction(out, (node as { onEditEnd?: ActionBindingDef }).onEditEnd, `${nodePath}.onEditEnd`);
    for (const [i, child] of ((node as { children?: ChildSpec[] }).children ?? []).entries())
      walk(out, child, `${nodePath}.children[${i}]`);
    return;
  }
  if ("use" in node) return emit(out, node as Carrier, "component", nodePath);
  if ("for" in node) return walk(out, node.template, `${nodePath}.template`);
  if (!("if" in node)) return;
  const branch = (value: ChildSpec | ChildSpec[] | undefined, path: string) =>
    Array.isArray(value)
      ? value.forEach((child, i) => walk(out, child, `${path}[${i}]`))
      : walk(out, value, path);
  branch(node.then, `${nodePath}.then`);
  branch(node.else, `${nodePath}.else`);
}

function pushAction(
  out: FlatCarrier[],
  binding: ActionBindingDef | undefined,
  nodePath: string,
): void {
  if (binding) emit(out, binding as Carrier, "action", nodePath);
}

function emit(out: FlatCarrier[], carrier: Carrier, scope: AuthScope, nodePath: string): void {
  out.push({
    scope,
    nodePath,
    requires: carrier.requires ?? [],
    requiresAny: carrier.requiresAny ?? [],
  });
}
