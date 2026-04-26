/** Pure deterministic morphism: attaches the length of msg. */
export default function measure(input: { msg: string }): { msg: string; length: number } {
  return { msg: input.msg, length: input.msg.length };
}
