/** Capability-gated echo morphism for smoke coverage. */
export default function guardedEcho(input: { msg: string }): { msg: string; length: number } {
  return { msg: input.msg.toUpperCase(), length: input.msg.length };
}
