import { AlgebraicKernel } from "../../L13-facade/index.ts";
import type { KernelModelDocument } from "../metamodel.ts";

export default async function registerMachines(input: {
  doc: KernelModelDocument;
  ak: AlgebraicKernel;
}): Promise<{ machineCount: number }> {
  for (const machine of Object.values(input.doc.machines)) input.ak.defineStateMachine(machine);
  return { machineCount: Object.keys(input.doc.machines).length };
}
