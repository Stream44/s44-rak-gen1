import type { KernelExpression } from "../../../L04-expression/evaluator.ts";
import type { DataRequirement } from "../../demand.ts";

export default function collectPreconditionRequirements(expr: KernelExpression): DataRequirement[] {
  const requirements: DataRequirement[] = [];
  const visit = (node: KernelExpression): void => {
    if (node.op === "get") {
      const parts = node.path.split("/").filter(Boolean);
      if (parts.length >= 2 && parts[0] === "external")
        requirements.push({ typeRef: "unknown", key: parts[1]! });
    }
    if ("args" in node && Array.isArray((node as { args?: KernelExpression[] }).args))
      for (const arg of (node as { args: KernelExpression[] }).args) visit(arg);
    if ("cond" in node) {
      visit((node as { cond: KernelExpression }).cond);
      visit((node as { then: KernelExpression }).then);
      visit((node as { else: KernelExpression }).else);
    }
    if (
      "body" in node &&
      typeof (node as { body?: unknown }).body === "object" &&
      (node as { body?: unknown }).body !== null &&
      "op" in (node as { body: object }).body
    )
      visit((node as { body: KernelExpression }).body);
    if (
      "value" in node &&
      typeof (node as { value?: unknown }).value === "object" &&
      (node as { value?: unknown }).value !== null &&
      "op" in (node as { value: object }).value
    )
      visit((node as { value: KernelExpression }).value);
  };
  visit(expr);
  return requirements;
}
