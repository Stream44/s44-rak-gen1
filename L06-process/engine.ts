import { JsonEncoder } from "../L01-foundation/encoder.ts";
import type { KernelExpression, Pattern } from "../L04-expression/evaluator.ts";
import type { Morphism } from "../L05-morphism/registry.ts";
import type { AlgebraicKernel } from "../L13-facade/index.ts";
import { registerMorphismDocument } from "../L02-metamodels/morphism-document-adapter.ts";
import { buildStateMachineRegistryDoc, ensureStateMachineMorphismTypes } from "./m1.ts";

export interface StateMachineDef {
  id: string;
  name: string;
  stateType: string;
  eventType: string;
  initialState: unknown;
  transitions: Transition[];
  invariants?: KernelExpression[];
  cid?: string;
}
export interface Transition {
  from: Pattern;
  event: Pattern;
  to: KernelExpression;
  guard?: KernelExpression;
  label?: string;
}
export interface TransitionResult {
  success: boolean;
  newState?: unknown;
  matchedTransition?: Transition;
  error?: string;
}
export interface RunResult {
  finalState: unknown;
  trace: Array<{ state: unknown; event: unknown; result: TransitionResult }>;
  steps: number;
}
export interface InvariantVerificationResult {
  allHold: boolean;
  violations: Array<{ state: unknown; invariant: KernelExpression; error: string }>;
}

const ITERATION_RANGE = Array.from({ length: 1000 }, (_, i) => i);
// Machine CIDs use the shared encoder format: cid:sha256:<hex>.
const CID_ENCODER = new JsonEncoder();

export class StateMachineEngine {
  private readonly machines = new Map<string, StateMachineDef>();

  constructor(private readonly ak: AlgebraicKernel) {
    ensureStateMachineMorphismTypes(ak);
    registerMorphismDocument(buildStateMachineRegistryDoc(), ak);
  }

  define(def: StateMachineDef): StateMachineDef {
    const validation = this.ak.validate(def.stateType, def.initialState);
    if (!validation.valid)
      throw new Error(
        `Initial state does not conform to stateType: ${validation.errors.map((e) => e.message).join(", ")}`,
      );
    def.cid ??= CID_ENCODER.encodeAndHash({
      id: def.id,
      stateType: def.stateType,
      eventType: def.eventType,
      initialState: def.initialState,
      transitions: def.transitions,
      invariants: def.invariants,
    }).cid;
    this.machines.set(def.id, def);
    return def;
  }

  getMachineCid(id: string): string | null {
    return this.machines.get(id)?.cid ?? null;
  }

  resolve(id: string): StateMachineDef {
    const machine = this.machines.get(id);
    if (!machine) throw new Error(`State machine not found: ${id}`);
    return machine;
  }

  step(machineId: string, currentState: unknown, event: unknown): TransitionResult {
    const machine = this.resolve(machineId);
    try {
      const result = this.evaluate("step", { machine, currentState, event }) as TransitionResult & {
        matchedTransitionLabel?: string;
      };
      if (result.success) {
        const validation = this.ak.validate(machine.stateType, result.newState);
        if (!validation.valid)
          return {
            success: false,
            error: `New state does not conform to stateType: ${validation.errors.map((e) => e.message).join(", ")}`,
          };
      }
      return {
        success: result.success,
        newState: result.newState,
        matchedTransition: machine.transitions.find(
          (transition) => transition.label === result.matchedTransitionLabel,
        ),
        error: result.error,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  run(machineId: string, initialState: unknown, events: unknown[]): RunResult {
    const machine = this.resolve(machineId);
    const result = this.evaluate("run", { machine, initialState, events }) as {
      finalState: unknown;
      trace: Array<{
        state: unknown;
        event: unknown;
        result: TransitionResult & { matchedTransitionLabel?: string };
      }>;
      steps: number;
    };
    return {
      finalState: result.finalState,
      trace: result.trace.map((entry) => ({
        ...entry,
        result: {
          success: entry.result.success,
          newState: entry.result.newState,
          matchedTransition: machine.transitions.find(
            (transition) => transition.label === entry.result.matchedTransitionLabel,
          ),
          error: entry.result.error,
        },
      })),
      steps: result.steps,
    };
  }

  reachableStates(machineId: string): unknown[] {
    return this.evaluate("reachableStates", {
      machine: this.resolve(machineId),
      iterationRange: ITERATION_RANGE,
    }) as unknown[];
  }

  verifyInvariants(machineId: string): InvariantVerificationResult {
    const machine = this.resolve(machineId);
    return this.evaluate("verifyInvariants", {
      machine: { ...machine, invariants: machine.invariants ?? [] },
      iterationRange: ITERATION_RANGE,
    }) as InvariantVerificationResult;
  }

  private evaluate(name: string, input: unknown): unknown {
    const morphism = this.ak.morphisms.resolve(`morphism://adk/${name}/1.0`);
    if (morphism.impl?.kind !== "algebra")
      throw new Error(`State-machine morphism ${name} is not algebra`);
    const result = this.ak.evaluator.evaluate(
      morphism.impl.ast as KernelExpression,
      this.evaluationContext(morphism, input),
    );
    if (result.error)
      throw new Error(`Morphism ${morphism.id}: algebra evaluation failed: ${result.error}`);
    return result.value;
  }

  private evaluationContext(morphism: Morphism, input: unknown): Record<string, unknown> {
    return { ...morphism.defaultContext, $input: input };
  }
}
