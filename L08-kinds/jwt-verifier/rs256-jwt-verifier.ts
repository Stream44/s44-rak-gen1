import type { JwtVerifierInterface } from "./m1.ts";

type LoadedKey = { keyBytes: ArrayBuffer; format: string };
const te = new TextEncoder(),
  td = new TextDecoder(),
  algo = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const,
  b64e = (v: string | Uint8Array) =>
    Buffer.from(typeof v === "string" ? te.encode(v) : v).toString("base64url"),
  b64d = (v: string) => new Uint8Array(Buffer.from(v, "base64url"));
const der = (pem: string) =>
  Buffer.from(pem.replace(/-----(BEGIN|END) [^-]+-----|\s+/g, ""), "base64");
async function importRsa(key: LoadedKey, usage: "sign" | "verify") {
  if (key.format === "jwk")
    return crypto.subtle.importKey(
      "jwk",
      JSON.parse(td.decode(new Uint8Array(key.keyBytes))),
      algo,
      false,
      [usage],
    );
  const pem = td.decode(new Uint8Array(key.keyBytes));
  return crypto.subtle.importKey(
    pem.includes("PRIVATE KEY") ? "pkcs8" : "spki",
    der(pem),
    algo,
    false,
    [usage],
  );
}

export default class RS256JwtVerifier implements JwtVerifierInterface {
  constructor(private readonly opts: { keyLoader: (ref: string) => Promise<LoadedKey> }) {}
  async verify(
    token: string,
    keyRef: string,
  ): Promise<{ valid: boolean; claims?: Record<string, unknown>; error?: string }> {
    try {
      const [header, payload, signature] = token.split(".");
      if (!header || !payload || !signature) return { valid: false, error: "invalid token" };
      const head = JSON.parse(td.decode(b64d(header))) as { alg?: string; typ?: string };
      if (head.alg !== "RS256" || head.typ !== "JWT")
        return { valid: false, error: "alg mismatch" };
      const claims = JSON.parse(td.decode(b64d(payload))) as Record<string, unknown>,
        key = await importRsa(await this.opts.keyLoader(keyRef), "verify");
      if (
        !(await crypto.subtle.verify(algo, key, b64d(signature), te.encode(`${header}.${payload}`)))
      )
        return { valid: false, error: "signature mismatch" };
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
    const header = b64e(JSON.stringify({ alg: "RS256", typ: "JWT" })),
      payload = b64e(JSON.stringify(claims)),
      key = await importRsa(await this.opts.keyLoader(keyRef), "sign");
    const signature = new Uint8Array(
      await crypto.subtle.sign(algo, key, te.encode(`${header}.${payload}`)),
    );
    return { token: `${header}.${payload}.${b64e(signature)}` };
  }
}
