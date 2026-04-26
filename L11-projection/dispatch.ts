/** Layer 27: Dispatch (spec §7.4, §13.2). */

import type { ModelBoot } from "../L09-demand/model-loader.ts";
import type { JsonSchema } from "../L01-foundation/types.ts";
import { SchemaValidator } from "../L01-foundation/validator.ts";
import type { ActionType } from "../L07-agency/intent.ts";
import { PrimitiveRegistry } from "./primitive-registry.ts";
import type {
  DispatchFrame,
  DispatchResult,
  ResolvedManifest,
  ResolvedManifestEntry,
} from "../L01-foundation/dispatch-types.ts";
import type {
  ActionBindingDef,
  ActionManifestEntry,
  ActionManifestEntryObject,
  ChildSpec,
  CompositeUseNode,
  IfNode,
  ListNode,
  PrimitiveNode,
  ProjectionModel,
} from "../L01-foundation/projection-types.ts";
import type { ProjectionSession } from "./session.ts";
export type {
  DispatchFrame,
  DispatchResult,
  ResolvedManifest,
  ResolvedManifestEntry,
} from "../L01-foundation/dispatch-types.ts";

type LegacyDispatchFrame = {
  ref: string;
  target?: string;
  payload?: Record<string, unknown>;
  capabilityId?: string;
  origin?: { kind: string; source?: unknown };
};

export function normalizeManifestEntry(raw: ActionManifestEntry): ActionManifestEntryObject {
  if (typeof raw === "string") {
    return { name: raw };
  }
  if (!raw || typeof raw !== "object" || typeof raw.name !== "string") {
    throw new Error(
      `Invalid action manifest entry: ${JSON.stringify(raw)} — expected a string or { name, kind? }.`,
    );
  }
  return raw;
}

export function buildManifest(
  doc: ProjectionModel,
  modelActions: Map<string, ActionType>,
): ResolvedManifest {
  const manifest: ResolvedManifest = {
    byName: new Map(),
    byUri: new Map(),
  };
  const modelByUri = new Map<string, ActionType>();
  for (const action of modelActions.values()) modelByUri.set(action.id, action);

  const errors: string[] = [];
  for (const raw of doc.actions ?? []) {
    let entry: ActionManifestEntryObject;
    try {
      entry = normalizeManifestEntry(raw);
    } catch (error) {
      errors.push((error as Error).message);
      continue;
    }

    const kind = entry.kind ?? "model";
    const ref = entry.name;
    if (kind === "model") {
      const action = ref.startsWith("action://") ? modelByUri.get(ref) : modelActions.get(ref);
      if (!action) {
        errors.push(`actions: "${ref}" (kind: model) — not found in bindsModel actions.`);
        continue;
      }
      const resolved: ResolvedManifestEntry = {
        name: action.name,
        kind: "model",
        action,
        payloadSchema: entry.payloadSchema,
      };
      manifest.byName.set(action.name, resolved);
      manifest.byUri.set(action.id, resolved);
      if (ref !== action.name) manifest.byName.set(ref, resolved);
      continue;
    }

    manifest.byName.set(ref, {
      name: ref,
      kind,
      payloadSchema: entry.payloadSchema,
    });
  }

  if (errors.length > 0) {
    throw new Error(`Projector manifest errors:\n  - ${errors.join("\n  - ")}`);
  }

  return manifest;
}

export function resolveManifestRef(
  manifest: ResolvedManifest,
  ref: string,
): ResolvedManifestEntry | null {
  return manifest.byName.get(ref) ?? manifest.byUri.get(ref) ?? null;
}

export function validateActionReferences(
  doc: ProjectionModel,
  primitives: PrimitiveRegistry,
  manifest: ResolvedManifest,
): void {
  const errors: string[] = [];
  const pages = doc.pages ?? {};

  for (const route of doc.routes ?? []) {
    if (doc.pages && !pages[route.page]) {
      errors.push(`route "${route.path}" references unknown page "${route.page}"`);
    }
  }

  const walkChild = (child: ChildSpec, path: string): void => {
    if (!child || typeof child !== "object") return;

    if ("component" in child) {
      const primitiveNode = child as PrimitiveNode;
      if (!primitives.has(primitiveNode.component) && !doc.components?.[primitiveNode.component]) {
        errors.push(
          `${path}: unknown component "${primitiveNode.component}" (not a registered primitive and not defined in components:)`,
        );
      }
      if (primitiveNode.onClick) {
        validateActionBinding(primitiveNode.onClick, `${path}.onClick`, manifest, errors);
      }
      if (primitiveNode.onSubmit) {
        validateActionBinding(primitiveNode.onSubmit, `${path}.onSubmit`, manifest, errors);
      }
      for (let index = 0; index < (primitiveNode.children ?? []).length; index++) {
        walkChild(primitiveNode.children![index], `${path}.children[${index}]`);
      }
      return;
    }

    if ("use" in child) {
      const compositeUse = child as CompositeUseNode;
      if (!doc.components?.[compositeUse.use]) {
        errors.push(`${path}: unknown composite "${compositeUse.use}"`);
      }
      return;
    }

    if ("for" in child) {
      const listNode = child as ListNode;
      walkChild(listNode.template, `${path}.for(${listNode.for})`);
      return;
    }

    if ("if" in child) {
      const ifNode = child as IfNode;
      const thenBranch = Array.isArray(ifNode.then)
        ? ifNode.then
        : ifNode.then
          ? [ifNode.then]
          : [];
      const elseBranch = Array.isArray(ifNode.else)
        ? ifNode.else
        : ifNode.else
          ? [ifNode.else]
          : [];
      thenBranch.forEach((entry, index) => walkChild(entry, `${path}.if.then[${index}]`));
      elseBranch.forEach((entry, index) => walkChild(entry, `${path}.if.else[${index}]`));
    }
  };

  for (const [pageName, page] of Object.entries(pages)) {
    for (let index = 0; index < (page.children ?? []).length; index++) {
      walkChild(page.children![index], `pages.${pageName}.children[${index}]`);
    }
  }
  for (const [componentName, componentDef] of Object.entries(doc.components ?? {})) {
    walkChild(componentDef.template as ChildSpec, `components.${componentName}.template`);
  }

  if (errors.length > 0) {
    throw new Error(`Projector compile errors:\n  - ${errors.join("\n  - ")}`);
  }
}

export async function dispatchFrame(opts: {
  manifest: ResolvedManifest;
  app: ModelBoot | null;
  session: ProjectionSession;
  validator: SchemaValidator;
  frame: DispatchFrame | LegacyDispatchFrame;
}): Promise<DispatchResult> {
  const actionRef = "actionRef" in opts.frame ? opts.frame.actionRef : opts.frame.ref;
  const target = opts.frame.target;
  const payload = opts.frame.payload;
  const capabilityId = opts.frame.capabilityId;

  const resolved = resolveManifestRef(opts.manifest, actionRef);
  if (!resolved) {
    return {
      kind: "error",
      success: false,
      error: `Unknown action ref: "${actionRef}" — not declared in actions:`,
    };
  }

  if (resolved.kind === "custom") {
    if (resolved.payloadSchema && payload) {
      const result = opts.validator.validate(payload, resolved.payloadSchema);
      if (!result.valid) {
        return {
          kind: "custom",
          success: false,
          name: resolved.name,
          error: `Payload validation failed: ${result.errors.map((entry) => entry.message).join("; ")}`,
        };
      }
    }
    return { kind: "custom", success: true, name: resolved.name, payload };
  }

  if (resolved.kind === "ephemeral") {
    opts.session.ephemeral.set(resolved.name, payload);
    return { kind: "ephemeral", success: true, name: resolved.name, payload };
  }

  if (!resolved.action) {
    return {
      kind: "error",
      success: false,
      error: `Manifest entry "${actionRef}" has no resolved ActionType.`,
    };
  }
  if (!opts.app) {
    return {
      kind: "error",
      success: false,
      error: `Cannot dispatch model action "${actionRef}": projector has no ModelBoot.`,
    };
  }

  const action = resolved.action as ActionType;
  const modelPayload = payload ?? {};
  if (action.inputSchema && typeof action.inputSchema === "object") {
    const result = opts.validator.validate(modelPayload, action.inputSchema);
    if (!result.valid) {
      return {
        kind: "model",
        success: false,
        error: `Payload validation failed: ${result.errors.map((entry) => entry.message).join("; ")}`,
      };
    }
  }

  const effectiveCapabilityId = capabilityId ?? opts.session.currentUser.capabilities[action.verb];
  const effectiveTarget = target ?? (modelPayload.id as string) ?? "";
  const intentResult = await opts.app.submit(
    action.verb,
    effectiveTarget,
    modelPayload,
    effectiveCapabilityId,
  );
  return {
    kind: "model",
    success: intentResult.success,
    intentResult,
    error: intentResult.error,
  };
}

export async function dispatchProjectionFrame(opts: {
  doc: unknown;
  manifest: ResolvedManifest;
  app: ModelBoot | null;
  session: ProjectionSession;
  validator: SchemaValidator;
  frame: DispatchFrame | LegacyDispatchFrame;
}): Promise<DispatchResult> {
  return opts.doc
    ? await dispatchFrame(opts)
    : { kind: "error", success: false, error: "No projector loaded." };
}

function validateActionBinding(
  binding: ActionBindingDef,
  path: string,
  manifest: ResolvedManifest,
  errors: string[],
): void {
  if (!binding.action || typeof binding.action !== "string") {
    errors.push(`${path}: missing or non-string "action" field`);
    return;
  }
  if (!binding.action.startsWith("$") && !resolveManifestRef(manifest, binding.action)) {
    errors.push(`${path}: unknown action "${binding.action}" — not declared in actions:`);
  }
  if (binding.onSuccess) {
    validateActionBinding(binding.onSuccess, `${path}.onSuccess`, manifest, errors);
  }
  if (binding.onError) {
    validateActionBinding(binding.onError, `${path}.onError`, manifest, errors);
  }
}
