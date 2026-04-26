import type { ProjectionTree } from "../L01-foundation/projection-types.ts";

export interface RenderPass {
  name: string;
  run(tree: ProjectionTree, ctx: { isCompiledMode?: boolean }): unknown;
}

export class RenderPassRegistry {
  private readonly passes: RenderPass[] = [];

  register(pass: RenderPass): void {
    this.passes.push(pass);
  }

  byName(name: string): RenderPass[] {
    return this.passes.filter((pass) => pass.name === name);
  }

  clear(): void {
    this.passes.length = 0;
  }
}

export const renderPassRegistry = new RenderPassRegistry();
