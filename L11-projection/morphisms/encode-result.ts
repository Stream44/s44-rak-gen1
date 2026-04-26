export default function encodeResult(input: { intentResult?: unknown; [key: string]: unknown }) {
  return (input.intentResult ?? input) as typeof input;
}
