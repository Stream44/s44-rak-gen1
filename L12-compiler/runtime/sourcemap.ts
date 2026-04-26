export interface SourceMapEntry {
  pc: number;
  path: string;
  nodeId: number;
}

export interface SourceMap {
  entries: SourceMapEntry[];
}
