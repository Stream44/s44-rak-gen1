import type { KeyAssetInterface } from "./m1.ts";

export default class EnvKeyAsset implements KeyAssetInterface {
  constructor(private props: { env: string; format: string }) {}
  async load(): Promise<{ keyBytes: ArrayBuffer; format: string }> {
    const value = process.env[this.props.env];
    if (!value) throw new Error(`Missing environment variable: ${this.props.env}`);
    const bytes = Buffer.from(value, "base64");
    return {
      keyBytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      format: this.props.format,
    };
  }
  async fingerprint(): Promise<string> {
    const { keyBytes } = await this.load(),
      hash = new Uint8Array(await crypto.subtle.digest("SHA-256", keyBytes));
    return Buffer.from(hash.slice(0, 16)).toString("base64url");
  }
}
