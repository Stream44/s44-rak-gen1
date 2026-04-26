import { authorizeRequirements, surveyCapabilityRequirements } from "./capability-enforcement.ts";
import type {
  AuthScope,
  AuthorizeVerdict,
  ProjectionModel,
} from "../L01-foundation/projection-types.ts";
import type { ProjectionSession } from "./session.ts";

type CapabilityEngine = Parameters<typeof authorizeRequirements>[3];

export const authorizeProjectionNodePath = (
  requires: string[] | undefined,
  session: ProjectionSession,
  ctx: { scope: AuthScope; nodePath: string; requiresAny?: string[] },
  capabilityEngine?: CapabilityEngine,
): AuthorizeVerdict =>
  capabilityEngine
    ? authorizeRequirements(requires, session, ctx, capabilityEngine)
    : (requires?.length ?? 0) === 0 && (ctx.requiresAny?.length ?? 0) === 0
      ? { outcome: "allow" }
      : {
          outcome: "deny",
          reason: "missing capabilities",
          missing: [
            ...(requires ?? []),
            ...((ctx.requiresAny?.length ?? 0) > 0
              ? [`requiresAny:[${(ctx.requiresAny ?? []).join(",")}]`]
              : []),
          ],
          scope: ctx.scope,
          nodePath: ctx.nodePath,
        };

export const surveyProjectionCapabilities = (doc: ProjectionModel | null) =>
  doc ? surveyCapabilityRequirements(doc) : [];
