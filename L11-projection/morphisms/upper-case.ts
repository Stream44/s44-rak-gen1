/** Pure deterministic morphism: uppercases the msg field. */
export default function upperCase(input: { msg: string }): { msg: string } {
  return { msg: input.msg.toUpperCase() };
}
