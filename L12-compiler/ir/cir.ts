export interface CirInstruction {
  op: string;
  dst?: number;
  operands: (number | string | number[])[];
  sourceNodeId?: number;
}

export interface Cir {
  instructions: CirInstruction[];
  constantPool: unknown[];
  registerCount: number;
  moduleRefs: string[];
  morphismRefs: string[];
  closures: { body: Cir; captures: number[] }[];
}
