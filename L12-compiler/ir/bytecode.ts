export interface BundleClosure {
  bodyOffset: number;
  registerCount: number;
  captureCount: number;
  bundle?: Bundle;
}

export interface Bundle {
  cid: string;
  compilerVersion: number;
  code: Uint32Array;
  constants: unknown[];
  registerCount: number;
  entryPoint: number;
  moduleTable: string[];
  calleeTable: string[];
  closureTable: BundleClosure[];
  sourceMap: Record<number, number>;
}

export type Bytecode = Bundle;
