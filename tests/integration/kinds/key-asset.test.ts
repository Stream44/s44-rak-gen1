import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { AssetRegistry } from "../../../L11-projection/asset-registry.ts";
import type { ProjectionAsset } from "../../../L01-foundation/projection-types.ts";
import EnvKeyAsset from "../../../L08-kinds/key-asset/env-key-asset.ts";
import InlineKeyAsset from "../../../L08-kinds/key-asset/inline-key-asset.ts";
import { KEY_ASSET_M1, validateKeyAssetM1 } from "../../../L08-kinds/key-asset/m1.ts";

type AssetWithProps = ProjectionAsset & { props?: Record<string, unknown> };
const instantiate = async (asset: AssetWithProps) =>
  new (
    await import(
      new URL(
        `../../../L08-kinds/key-asset/${asset.implementation.module.replace("./", "")}`,
        import.meta.url,
      ).pathname
    )
  ).default(asset.props ?? {}) as InlineKeyAsset | EnvKeyAsset;

describe("key-asset kind", () => {
  test("InlineKeyAsset registry resolve loads expected bytes", async () => {
    expect(() => validateKeyAssetM1(KEY_ASSET_M1)).not.toThrow();
    const registry = new AssetRegistry(),
      asset = Bun.YAML.parse(
        readFileSync(
          new URL("../../../L08-kinds/key-asset/InlineKeyAsset.asset.yaml", import.meta.url),
          "utf-8",
        ),
      ) as ProjectionAsset,
      bytesBase64 = Buffer.from("inline-key").toString("base64");
    registry.register({
      ...asset,
      cid: "bafy-inline-key",
      props: { bytesBase64, format: "raw" },
    } as AssetWithProps);
    const resolved = registry.resolve("InlineKeyAsset/1.0", "key-asset") as AssetWithProps,
      key = await instantiate(resolved),
      loaded = await key.load();
    expect(Buffer.from(loaded.keyBytes).toString()).toBe("inline-key");
  });

  test("EnvKeyAsset loads from process.env and missing env throws with the variable name", async () => {
    process.env.ADK_JWT_KEY = Buffer.from("env-key").toString("base64");
    const key = new EnvKeyAsset({ env: "ADK_JWT_KEY", format: "raw" }),
      loaded = await key.load();
    expect(Buffer.from(loaded.keyBytes).toString()).toBe("env-key");
    delete process.env.ADK_JWT_KEY;
    await expect(new EnvKeyAsset({ env: "ADK_JWT_KEY", format: "raw" }).load()).rejects.toThrow(
      "ADK_JWT_KEY",
    );
  });

  test("fingerprint is deterministic and changes with different inputs", async () => {
    const inlineA = new InlineKeyAsset({
        bytesBase64: Buffer.from("same").toString("base64"),
        format: "raw",
      }),
      inlineB = new InlineKeyAsset({
        bytesBase64: Buffer.from("same").toString("base64"),
        format: "raw",
      }),
      env = new EnvKeyAsset({ env: "ADK_JWT_KEY", format: "raw" });
    process.env.ADK_JWT_KEY = Buffer.from("different").toString("base64");
    expect(await inlineA.fingerprint()).toBe(await inlineB.fingerprint());
    expect(await inlineA.fingerprint()).not.toBe(await env.fingerprint());
    delete process.env.ADK_JWT_KEY;
  });
});
