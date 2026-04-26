import type { KernelExpression } from "../L04-expression/evaluator.ts";
import type { MorphismImpl, MorphismRegistry } from "../L05-morphism/registry.ts";
import type { AlgebraicKernel } from "../L13-facade/kernel.export.ts";
import { MORPHISM_DOCUMENT_ID } from "./morphism-document.ts";

export interface MorphismDocumentM1 {
  id: string;
  level: number;
  conformsTo: string;
  schema: object;
  discriminator: string;
  morphisms: Record<string, MorphismDocumentEntry>;
  name?: string;
  version?: string;
  description?: string;
  tags?: string[];
  refs?: unknown[];
  types?: Record<string, unknown>;
}

export interface MorphismDocumentEntry {
  id: string;
  input: string;
  output: string;
  category?: "pure" | "stateful";
  impl: MorphismImpl;
}

export function validateMorphismDocument(doc: MorphismDocumentM1): void {
  if (doc.conformsTo !== MORPHISM_DOCUMENT_ID) {
    throw new Error(
      `MorphismDocument validator: conformsTo must be "${MORPHISM_DOCUMENT_ID}", got "${doc.conformsTo}"`,
    );
  }
  if (typeof doc.discriminator !== "string" || doc.discriminator.length === 0) {
    throw new Error(
      `MorphismDocument validator: discriminator must be a non-empty string, got ${JSON.stringify(doc.discriminator)}`,
    );
  }
  if (typeof doc.morphisms !== "object" || doc.morphisms === null || Array.isArray(doc.morphisms)) {
    throw new Error(
      `MorphismDocument validator: morphisms must be an object, got ${typeof doc.morphisms}`,
    );
  }

  const ids = new Set<string>();
  for (const [shortName, entry] of Object.entries(doc.morphisms)) {
    if (typeof entry.id !== "string" || entry.id.length === 0) {
      throw new Error(`MorphismDocument validator: morphism "${shortName}" missing id`);
    }
    if (ids.has(entry.id)) {
      throw new Error(`MorphismDocument validator: duplicate morphism id "${entry.id}"`);
    }
    ids.add(entry.id);

    if (typeof entry.input !== "string" || entry.input.length === 0) {
      throw new Error(`MorphismDocument validator: morphism "${shortName}" missing input type`);
    }
    if (typeof entry.output !== "string" || entry.output.length === 0) {
      throw new Error(`MorphismDocument validator: morphism "${shortName}" missing output type`);
    }
    if (typeof entry.impl !== "object" || entry.impl === null || Array.isArray(entry.impl)) {
      throw new Error(`MorphismDocument validator: morphism "${shortName}" missing impl`);
    }

    if (entry.impl.kind === "algebra") {
      if (
        typeof entry.impl.ast !== "object" ||
        entry.impl.ast === null ||
        Array.isArray(entry.impl.ast)
      ) {
        throw new Error(
          `MorphismDocument validator: morphism "${shortName}" has impl.kind="algebra" but ast is missing or not an object`,
        );
      }
      continue;
    }

    if (entry.impl.kind === "module") {
      if (
        typeof entry.impl.uri !== "string" ||
        !entry.impl.uri.startsWith("module://") ||
        typeof entry.impl.export !== "string" ||
        entry.impl.export.length === 0
      ) {
        throw new Error(
          `MorphismDocument validator: morphism "${shortName}" has impl.kind="module" but uri (must start with module://) or export is missing/invalid`,
        );
      }
      continue;
    }

    const kind = (entry.impl as { kind?: unknown }).kind;
    throw new Error(
      `MorphismDocument validator: morphism "${shortName}" has unknown impl.kind "${kind}"`,
    );
  }
}

export function registerMorphismDocument(
  doc: MorphismDocumentM1,
  kernel: AlgebraicKernel,
  options?: { defaultContext?: Record<string, unknown> },
): void;
export function registerMorphismDocument(
  doc: MorphismDocumentM1,
  registry: MorphismRegistry,
  kernel: AlgebraicKernel,
  options?: { defaultContext?: Record<string, unknown> },
): void;
export function registerMorphismDocument(
  doc: MorphismDocumentM1,
  registryOrKernel: MorphismRegistry | AlgebraicKernel,
  maybeKernelOrOptions?: AlgebraicKernel | { defaultContext?: Record<string, unknown> },
  maybeOptions?: { defaultContext?: Record<string, unknown> },
): void {
  const hasKernelShape = (value: unknown): value is AlgebraicKernel =>
    typeof value === "object" && value !== null && "morphisms" in value && "resolveType" in value;
  const kernel = hasKernelShape(maybeKernelOrOptions)
    ? maybeKernelOrOptions
    : (registryOrKernel as AlgebraicKernel);
  const registry = hasKernelShape(maybeKernelOrOptions)
    ? (registryOrKernel as MorphismRegistry)
    : kernel.morphisms;
  const options = hasKernelShape(maybeKernelOrOptions)
    ? maybeOptions
    : (maybeKernelOrOptions as { defaultContext?: Record<string, unknown> } | undefined);
  const defaultContext = options?.defaultContext ?? {};
  validateMorphismDocument(doc);
  const evaluator = registry.getEvaluator();
  const siblingBindings: Record<string, (arg: unknown) => unknown> = {};
  const siblingCallLimit = (evaluator as unknown as { maxGas?: number }).maxGas ?? 100_000;
  let activeSiblingCalls = 0;
  for (const [shortName, entry] of Object.entries(doc.morphisms)) {
    const bindingKey = `$${shortName}Morphism`;
    const dispatchSibling = (arg: unknown) => {
      if (entry.impl.kind !== "algebra") {
        throw new Error(
          `Sibling ${entry.id}: module-backed siblings are not algebra-invocable via ${bindingKey}`,
        );
      }

      if (activeSiblingCalls >= siblingCallLimit) {
        throw new Error(`Sibling ${entry.id} dispatch failed: OutOfGas`);
      }

      activeSiblingCalls += 1;
      try {
        const result = evaluator.evaluate(entry.impl.ast as KernelExpression, {
          ...siblingBindings,
          ...defaultContext,
          $input: arg,
          $discriminator: doc.discriminator,
        });
        if (result.error) {
          throw new Error(`Sibling ${entry.id} dispatch failed: ${result.error}`);
        }
        return result.value;
      } finally {
        activeSiblingCalls -= 1;
      }
    };
    siblingBindings[bindingKey] = dispatchSibling;
    siblingBindings[`$${shortName}`] = dispatchSibling;
  }
  for (const [shortName, entry] of Object.entries(doc.morphisms)) {
    try {
      kernel.resolveType(entry.input);
    } catch (e) {
      throw new Error(
        `MorphismDocument adapter: morphism "${shortName}" has unresolved input type "${entry.input}": ${(e as Error).message}`,
      );
    }
    try {
      kernel.resolveType(entry.output);
    } catch (e) {
      throw new Error(
        `MorphismDocument adapter: morphism "${shortName}" has unresolved output type "${entry.output}": ${(e as Error).message}`,
      );
    }
    const version = parseMorphismVersion(entry.id) ?? "1.0";
    const placeholderExpr = { op: "var" as const, name: "$input" };
    registry.define(shortName, entry.input, entry.output, placeholderExpr, {
      id: entry.id,
      version,
      impl: entry.impl,
      defaultContext: {
        ...siblingBindings,
        ...defaultContext,
        $discriminator: doc.discriminator,
      },
    });
  }
}

function parseMorphismVersion(id: string): string | null {
  const match = id.match(/^morphism:\/\/[^/]+\/.+\/([^/]+)$/);
  return match ? match[1]! : null;
}
