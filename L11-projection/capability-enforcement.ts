/** Layer 27: capability enforcement helpers (spec §7.6, §9.3, §9.4). */

import type { AuthorizationResult } from "../L07-agency/capability.ts";
import type {
  ActionBindingDef,
  AuthScope,
  AuthorizeVerdict,
  CapabilityRequirement,
  ChildSpec,
  CompositeUseNode,
  IfNode,
  ListNode,
  PrimitiveNode,
  ProjectionModel,
} from "../L01-foundation/projection-types.ts";

type CapabilitySession = {
  currentUser: { id: string; capabilities: Record<string, string> };
};

type CapabilityEngine = {
  authorizeResource(
    capId: string,
    resourceId: string,
    subject: { id: string },
  ): AuthorizationResult;
};

type RequirementCarrier = {
  requires?: string[];
  requiresAny?: string[];
};

type ProjectionRequirementCarrier = RequirementCarrier & {
  projections?: unknown;
};

export function authorizeRequirements(
  requires: string[] | undefined,
  session: CapabilitySession,
  ctx: { scope: AuthScope; nodePath: string; requiresAny?: string[] },
  capabilityEngine: CapabilityEngine,
): AuthorizeVerdict {
  const missing: string[] = [];
  const requiresAll = requires ?? [];
  const requiresAny = ctx.requiresAny ?? [];

  if (requiresAll.length === 0 && requiresAny.length === 0) {
    return { outcome: "allow" };
  }

  for (const cap of requiresAll) {
    const held = session.currentUser.capabilities[cap];
    if (!held) {
      missing.push(cap);
      continue;
    }

    const result = capabilityEngine.authorizeResource(held, cap, { id: session.currentUser.id });
    if (!result.authorized) {
      missing.push(cap);
    }
  }

  if (requiresAny.length > 0) {
    let anyPassed = false;

    for (const cap of requiresAny) {
      const held = session.currentUser.capabilities[cap];
      if (!held) continue;

      const result = capabilityEngine.authorizeResource(held, cap, { id: session.currentUser.id });
      if (result.authorized) {
        anyPassed = true;
        break;
      }
    }

    if (!anyPassed) {
      missing.push(`requiresAny:[${requiresAny.join(",")}]`);
    }
  }

  if (missing.length === 0) {
    return { outcome: "allow" };
  }

  return {
    outcome: "deny",
    reason: "missing capabilities",
    missing,
    scope: ctx.scope,
    nodePath: ctx.nodePath,
  };
}

export function makeCapabilityGate(
  session: CapabilitySession,
  capabilityEngine: CapabilityEngine | undefined,
): (requires: string[] | undefined, requiresAny: string[] | undefined) => boolean {
  return (requires, requiresAny) => {
    const verdict = authorizeRequirements(
      requires,
      session,
      { scope: "binding", nodePath: "$capabilityCheck", requiresAny },
      capabilityEngine ?? {
        authorizeResource: () => ({ authorized: false, error: "no capabilityEngine" }),
      },
    );
    return verdict.outcome === "allow";
  };
}

export function surveyCapabilityRequirements(doc: ProjectionModel): CapabilityRequirement[] {
  const requirements: CapabilityRequirement[] = [];
  const pages = doc.pages ?? {};

  pushRequirements(requirements, doc, "projection", "$");

  for (const [index, route] of (doc.routes ?? []).entries()) {
    pushRequirements(requirements, route as RequirementCarrier, "route", `routes[${index}]`);
  }

  for (const [pageName, pageDef] of Object.entries(pages)) {
    const pagePath = `pages.${pageName}`;

    for (const [bindingName, spec] of Object.entries(pageDef.bind ?? {})) {
      if (typeof spec === "object" && spec !== null && !Array.isArray(spec)) {
        pushRequirements(
          requirements,
          spec as RequirementCarrier,
          "binding",
          `${pagePath}.bind.${bindingName}`,
        );
        pushProjectionRequirements(
          requirements,
          spec as ProjectionRequirementCarrier,
          `${pagePath}.bind.${bindingName}`,
        );
      }
    }

    for (const [regionName, region] of Object.entries(pageDef.regions ?? {})) {
      walkChild(requirements, region, `${pagePath}.regions.${regionName}`);
    }

    for (const [index, child] of (pageDef.children ?? []).entries()) {
      walkChild(requirements, child, `${pagePath}.children[${index}]`);
    }
  }

  return requirements;
}

function pushProjectionRequirements(
  requirements: CapabilityRequirement[],
  carrier: ProjectionRequirementCarrier,
  nodePath: string,
): void {
  if (!Array.isArray(carrier.projections)) return;

  for (const [index, entry] of carrier.projections.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    pushRequirements(
      requirements,
      entry as RequirementCarrier,
      "binding",
      `${nodePath}.projections[${index}]`,
    );
  }
}

function walkChild(requirements: CapabilityRequirement[], node: ChildSpec, nodePath: string): void {
  if (!node || typeof node !== "object") return;

  if ("component" in node) {
    const primitive = node as PrimitiveNode & RequirementCarrier;
    pushRequirements(requirements, primitive, "component", nodePath);
    pushActionRequirements(requirements, primitive.onClick, `${nodePath}.onClick`);
    pushActionRequirements(requirements, primitive.onSubmit, `${nodePath}.onSubmit`);

    for (const [index, child] of (primitive.children ?? []).entries()) {
      walkChild(requirements, child, `${nodePath}.children[${index}]`);
    }
    return;
  }

  if ("use" in node) {
    const composite = node as CompositeUseNode & RequirementCarrier;
    pushRequirements(requirements, composite, "component", nodePath);
    return;
  }

  if ("for" in node) {
    const list = node as ListNode;
    walkChild(requirements, list.template, `${nodePath}.template`);
    return;
  }

  if ("if" in node) {
    const conditional = node as IfNode;
    walkBranch(requirements, conditional.then, `${nodePath}.then`);
    walkBranch(requirements, conditional.else, `${nodePath}.else`);
  }
}

function walkBranch(
  requirements: CapabilityRequirement[],
  branch: ChildSpec | ChildSpec[] | undefined,
  nodePath: string,
): void {
  if (!branch) return;

  if (Array.isArray(branch)) {
    for (const [index, child] of branch.entries()) {
      walkChild(requirements, child, `${nodePath}[${index}]`);
    }
    return;
  }

  walkChild(requirements, branch, nodePath);
}

function pushActionRequirements(
  requirements: CapabilityRequirement[],
  binding: ActionBindingDef | undefined,
  nodePath: string,
): void {
  if (!binding) return;
  pushRequirements(
    requirements,
    binding as ActionBindingDef & RequirementCarrier,
    "action",
    nodePath,
  );
}

function pushRequirements(
  requirements: CapabilityRequirement[],
  carrier: RequirementCarrier,
  scope: AuthScope,
  nodePath: string,
): void {
  if (Array.isArray(carrier.requires) && carrier.requires.length > 0) {
    requirements.push({
      scope,
      nodePath,
      caps: carrier.requires,
      combinator: "all",
    });
  }

  if (Array.isArray(carrier.requiresAny) && carrier.requiresAny.length > 0) {
    requirements.push({
      scope,
      nodePath,
      caps: carrier.requiresAny,
      combinator: "any",
    });
  }
}
