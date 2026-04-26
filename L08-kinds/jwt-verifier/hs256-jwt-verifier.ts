import type { JwtVerifierInterface } from "./m1.ts";

type LoadedKey = ArrayBuffer | { keyBytes: ArrayBuffer; format?: string };
const te = new TextEncoder(),
  td = new TextDecoder(),
  b64e = (v: string | Uint8Array) =>
    Buffer.from(typeof v === "string" ? te.encode(v) : v).toString("base64url"),
  b64d = (v: string) => new Uint8Array(Buffer.from(v, "base64url"));
const eq = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
};
const hmac = async (keyBytes: ArrayBuffer, data: string) =>
  new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, [
        "sign",
      ]),
      te.encode(data),
    ),
  );

export default class HS256JwtVerifier implements JwtVerifierInterface {
  constructor(private readonly opts: { keyLoader: (ref: string) => Promise<LoadedKey> }) {}
  private async load(ref: string): Promise<ArrayBuffer> {
    const key = await this.opts.keyLoader(ref);
    return key instanceof ArrayBuffer ? key : key.keyBytes;
  }
  async verify(
    token: string,
    keyRef: string,
  ): Promise<{ valid: boolean; claims?: Record<string, unknown>; error?: string }> {
    try {
      const [header, payload, signature] = token.split(".");
      if (!header || !payload || !signature) return { valid: false, error: "invalid token" };
      const head = JSON.parse(td.decode(b64d(header))) as { alg?: string; typ?: string };
      if (head.alg !== "HS256" || head.typ !== "JWT")
        return { valid: false, error: "alg mismatch" };
      const claims = JSON.parse(td.decode(b64d(payload))) as Record<string, unknown>,
        signed = await hmac(await this.load(keyRef), `${header}.${payload}`);
      if (!eq(signed, b64d(signature))) return { valid: false, error: "signature mismatch" };
      if (typeof claims.exp === "number" && claims.exp <= Date.now() / 1000)
        return { valid: false, error: "expired" };
      return { valid: true, claims };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "verification failed",
      };
    }
  }
  async sign(claims: Record<string, unknown>, keyRef: string): Promise<{ token: string }> {
    const header = b64e(JSON.stringify({ alg: "HS256", typ: "JWT" })),
      payload = b64e(JSON.stringify(claims));
    const signature = b64e(await hmac(await this.load(keyRef), `${header}.${payload}`));
    return { token: `${header}.${payload}.${signature}` };
  }
}
