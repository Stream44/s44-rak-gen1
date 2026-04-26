import type { ProjectionNode } from "../../L01-foundation/projection-types.ts";

export interface CliFrame {
  stream: "stdout" | "stderr";
  text: string;
  promptFor?: { name: string; type: "string" | "number" | "boolean" };
}

export interface StdoutOutput {
  stdout: string;
  exitCode: number;
  frames: CliFrame[];
}

export interface StdoutRenderOptions {
  ansi?: boolean;
}

export interface CliStdoutContext {
  ansi: boolean;
  renderChildren: (node: ProjectionNode) => string;
}

export const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}
