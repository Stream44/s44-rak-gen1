export type GasTable = Partial<Record<string, number>>;

export class Gas {
  constructor(
    private budget: number,
    private readonly table: GasTable = {},
  ) {}

  charge(op: string, cost = this.table[op] ?? 1): void {
    this.budget -= cost;
    if (this.budget < 0) throw new GasExhaustedError(op, -this.budget);
  }

  remaining(): number {
    return this.budget;
  }
}

export class GasExhaustedError extends Error {
  constructor(
    public op: string,
    public overBudget: number,
  ) {
    super(`Gas exhausted at ${op} (over by ${overBudget} units)`);
    this.name = "GasExhaustedError";
  }
}
