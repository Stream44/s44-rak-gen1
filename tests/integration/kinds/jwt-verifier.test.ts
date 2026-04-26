import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { AssetRegistry } from "../../../L11-projection/asset-registry.ts";
import type { ProjectionAsset } from "../../../L01-foundation/projection-types.ts";
import {
  JWT_VERIFIER_M1,
  validateJwtVerifierM1,
  type JwtVerifierInterface,
} from "../../../L08-kinds/jwt-verifier/m1.ts";

type AssetWithProps = ProjectionAsset & { props?: Record<string, unknown> };
const loadAsset = (file: string) =>
  Bun.YAML.parse(
    readFileSync(new URL(`../../../L08-kinds/${file}`, import.meta.url), "utf-8"),
  ) as ProjectionAsset;
const tamper = (token: string, header: Record<string, unknown> | null = null) => {
  const [h, p] = token.split(".");
  return `${header ? Buffer.from(JSON.stringify(header)).toString("base64url") : h}.${p}.x`;
};

const RSA_PRIVATE_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC+CwGsUqsJ1KV/
VQzAxtUPxPBGyE77py/KzWxAqC91qDNlXkMqVsaib1vmEZNnFFPbZ+ru020sm2qy
K0755VzzeUcQasxNSSe9K0ycA4ptYzOhRmYOjXpyxWLmVI2bMxlrp+WJs8KGgQzb
FLVbywwCLDbJD4nIdhZtjr2poBpakDuHKs/Zm1x1AyIJkWOdriW8VUdkUPQzP5LR
lDcqRis/71JfdNWaxsZV/L2iU8GdE+2OFhK8b8EfrQZ3vzDcsVKLA+E2u+nKCNwL
qDHCqXjj21uRprhdgj+wEcccR1iklVGscQn3VgX91tu3jMk+Y7d7ZbRTI39VTc3d
dj7kWsJZAgMBAAECgf8WWvweauoykMW4V0lTt2sLdITo1KFuQiX3df0wTtXERDGv
ww7i9sQ59aJWdVI3+qEfFEOcrx3FipcwBQG23yEDuYk4pWNxiynsZzR3tmn8KHvO
sTus38gQNT74I1Umrh04BtejRzlnYQDAwxVZeifSIh1Qk8HcouZbg05UY/X99tQN
6jqxrvr41vF8/HNY/sro+L4JeC4r/APM86qwJR4hmT1Kmp0yFxos/efEMT9PwVwT
VkIDYjvmu7a7cMvGbix6I1BAITw1qJfP/dGZLzMSZG+6W3YUHmkWjBgpzMaL4Duf
KVJ/kr2uJyvd3jbJSbV9VbxiY8nF3hvqWcSoL2MCgYEA5tyjULGW3hMhGibr4qYa
ECwQj0SmgXndCw8hGrSvZI4qfI6Fk8cP2HlBTUSmkCnWUOf3bXyS4b7mrJ5kmcA6
DdX8glMXswctNbh9ySd3TndB105O23qtqnn4f1IRQGFMgUaGWI4FrNPUXgFvKnpu
t0dvdKS/BkgRKEF2i0FIEHcCgYEA0ryG691zlWebcHXhAevWj1Q5fy9VSVW3QFAk
Ei0cRnistuwfIEjHMROVXwwk76CExEjCsY0+HMvSgUzkifsCZlp2NSKxlLtYUlp0
OCfbcalNTkIo4jRHI/7dDnZXZ1HeZWxZw9nfHHpB20PotvwLHM+u1BRLbJyYt37C
A3DNx68CgYEA2GtMGnBw6vxp0rdb+FwYIML+PyBvKv+PzTdApGVv6scvYxbEeDVr
UFbTddj+gDUIOU5L8HKQy1mHq5jM3CmNAr1wesfkdqsqoaqzGGiL+p3ntiwt1qiZ
ty+iWdEYZQ8RhjsT5F43Sb5G3l1f1iVyNxSbknCCtyPGGcPMmlz3bp8CgYEAtbkB
F+/1NgcMEWR1TbTTZvGYS0bD4uNZjMoO8OWZlmOFfJANH0fjDTz39+h/CWyAUMr1
qSpFP4u70Og/w4SCw0SK3rM2My2CsjFyOuKT52W5VhzTKI0wM6gZc9k08dG1V/yh
Q7RjIymCFNRwnyqlYojtF9EQYW6AeuuB3nmt2d0CgYBg2TZ4sSF+p8WcIigWhRNC
E0FueUil4EKukDL2LSwEU/35MlSM+3jtJfrRgF0/fN1k9PTNRMESUvqzId+DMrds
fpdwqK33Drvbz5DVKhH8E2cEmdO6e3YDJtPjuJ7NIo+K94ACmoci2ALHOhCziPso
JIVCf4+Ui728Se9mISPYdA==
-----END PRIVATE KEY-----`;
const RSA_PUBLIC_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvgsBrFKrCdSlf1UMwMbV
D8TwRshO+6cvys1sQKgvdagzZV5DKlbGom9b5hGTZxRT22fq7tNtLJtqsitO+eVc
83lHEGrMTUknvStMnAOKbWMzoUZmDo16csVi5lSNmzMZa6flibPChoEM2xS1W8sM
Aiw2yQ+JyHYWbY69qaAaWpA7hyrP2ZtcdQMiCZFjna4lvFVHZFD0Mz+S0ZQ3KkYr
P+9SX3TVmsbGVfy9olPBnRPtjhYSvG/BH60Gd78w3LFSiwPhNrvpygjcC6gxwql4
49tbkaa4XYI/sBHHHEdYpJVRrHEJ91YF/dbbt4zJPmO3e2W0UyN/VU3N3XY+5FrC
WQIDAQAB
-----END PUBLIC KEY-----`;

const makeRegistry = () => {
  const registry = new AssetRegistry(),
    hs = loadAsset("jwt-verifier/MemoryHS256JwtVerifier.asset.yaml"),
    rs = loadAsset("jwt-verifier/MemoryRS256JwtVerifier.asset.yaml"),
    inline = loadAsset("key-asset/InlineKeyAsset.asset.yaml");
  registry.register({ ...hs, cid: "bafy-hs" });
  registry.register({ ...rs, cid: "bafy-rs" });
  registry.register({
    ...inline,
    cid: "bafy-hs-key",
    props: { bytesBase64: Buffer.from("super-secret").toString("base64"), format: "raw" },
  } as AssetWithProps);
  registry.register({
    ...inline,
    id: "asset://adk.example/key-asset/InlineKeyAssetPublic/1.0",
    name: "InlineKeyAssetPublic",
    cid: "bafy-rs-public",
    props: { bytesBase64: Buffer.from(RSA_PUBLIC_PEM).toString("base64"), format: "pem" },
  } as AssetWithProps);
  registry.register({
    ...inline,
    id: "asset://adk.example/key-asset/InlineKeyAssetPrivate/1.0",
    name: "InlineKeyAssetPrivate",
    cid: "bafy-rs-private",
    props: { bytesBase64: Buffer.from(RSA_PRIVATE_PEM).toString("base64"), format: "pem" },
  } as AssetWithProps);
  return registry;
};
async function instantiateKeyAsset(
  asset: AssetWithProps,
): Promise<{ load(): Promise<{ keyBytes: ArrayBuffer; format: string }> }> {
  return new (
    await import(
      new URL(
        `../../../L08-kinds/${asset.conformsToKind}/${asset.implementation.module.replace("./", "")}`,
        import.meta.url,
      ).pathname
    )
  ).default(asset.props ?? {});
}
async function instantiateVerifier(
  ref: string,
  registry: AssetRegistry,
): Promise<JwtVerifierInterface> {
  const asset = registry.resolve(ref, "jwt-verifier") as AssetWithProps,
    mod = await import(
      new URL(
        `../../../L08-kinds/jwt-verifier/${asset.implementation.module.replace("./", "")}`,
        import.meta.url,
      ).pathname
    );
  return new mod.default({
    keyLoader: async (keyRef: string) =>
      (await instantiateKeyAsset(registry.resolve(keyRef, "key-asset") as AssetWithProps)).load(),
  }) as JwtVerifierInterface;
}

describe("jwt-verifier kind", () => {
  test("HS256 sign and verify round-trip claims", async () => {
    expect(() => validateJwtVerifierM1(JWT_VERIFIER_M1)).not.toThrow();
    const verifier = await instantiateVerifier("MemoryHS256JwtVerifier/1.0", makeRegistry()),
      claims = { sub: "u1", role: "admin" },
      { token } = await verifier.sign(claims, "InlineKeyAsset/1.0");
    await expect(verifier.verify(token, "InlineKeyAsset/1.0")).resolves.toEqual({
      valid: true,
      claims,
    });
  });
  test("HS256 tampered signature returns signature error", async () => {
    const verifier = await instantiateVerifier("MemoryHS256JwtVerifier/1.0", makeRegistry()),
      { token } = await verifier.sign({ sub: "u1" }, "InlineKeyAsset/1.0");
    expect(await verifier.verify(tamper(token), "InlineKeyAsset/1.0")).toMatchObject({
      valid: false,
      error: expect.stringMatching(/signature/i),
    });
  });
  test("HS256 expired token returns expired error", async () => {
    const verifier = await instantiateVerifier("MemoryHS256JwtVerifier/1.0", makeRegistry()),
      { token } = await verifier.sign({ sub: "u1", exp: 0 }, "InlineKeyAsset/1.0");
    expect(await verifier.verify(token, "InlineKeyAsset/1.0")).toMatchObject({
      valid: false,
      error: expect.stringMatching(/expired/i),
    });
  });
  test("HS256 rejects alg mismatch headers", async () => {
    const verifier = await instantiateVerifier("MemoryHS256JwtVerifier/1.0", makeRegistry()),
      { token } = await verifier.sign({ sub: "u1" }, "InlineKeyAsset/1.0");
    expect(
      await verifier.verify(tamper(token, { alg: "RS256", typ: "JWT" }), "InlineKeyAsset/1.0"),
    ).toMatchObject({ valid: false, error: expect.stringMatching(/alg/i) });
  });
  test("HS256 wrong key returns signature error", async () => {
    const registry = makeRegistry(),
      inline = loadAsset("key-asset/InlineKeyAsset.asset.yaml");
    registry.register({
      ...inline,
      id: "asset://adk.example/key-asset/InlineKeyAssetAlt/1.0",
      name: "InlineKeyAssetAlt",
      cid: "bafy-hs-key-alt",
      props: { bytesBase64: Buffer.from("wrong-secret").toString("base64"), format: "raw" },
    } as AssetWithProps);
    const verifier = await instantiateVerifier("MemoryHS256JwtVerifier/1.0", registry),
      { token } = await verifier.sign({ sub: "u1" }, "InlineKeyAsset/1.0");
    expect(await verifier.verify(token, "InlineKeyAssetAlt/1.0")).toMatchObject({
      valid: false,
      error: expect.stringMatching(/signature/i),
    });
  });
  test("RS256 round-trip works with inline PEM fixtures", async () => {
    const verifier = await instantiateVerifier("MemoryRS256JwtVerifier/1.0", makeRegistry()),
      claims = { sub: "u2", scope: "orders" },
      { token } = await verifier.sign(claims, "InlineKeyAssetPrivate/1.0");
    await expect(verifier.verify(token, "InlineKeyAssetPublic/1.0")).resolves.toEqual({
      valid: true,
      claims,
    });
  });
  test("RS256 uses private key for signing and public key for verification", async () => {
    const registry = makeRegistry(),
      verifier = await instantiateVerifier("MemoryRS256JwtVerifier/1.0", registry);
    expect(registry.resolve("MemoryHS256JwtVerifier/1.0", "jwt-verifier")?.id).toBe(
      "asset://adk.example/jwt-verifier/MemoryHS256JwtVerifier/1.0",
    );
    expect(registry.resolve("MemoryRS256JwtVerifier/1.0", "jwt-verifier")?.id).toBe(
      "asset://adk.example/jwt-verifier/MemoryRS256JwtVerifier/1.0",
    );
    const { token } = await verifier.sign({ sub: "u3" }, "InlineKeyAssetPrivate/1.0");
    expect(await verifier.verify(token, "InlineKeyAssetPrivate/1.0")).toMatchObject({
      valid: false,
      error: expect.stringMatching(/signature|verify|usage|parameter|range/i),
    });
    expect(await verifier.verify(token, "InlineKeyAssetPublic/1.0")).toMatchObject({
      valid: true,
      claims: { sub: "u3" },
    });
  });
});
