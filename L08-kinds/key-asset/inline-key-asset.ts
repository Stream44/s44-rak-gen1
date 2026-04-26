import type { KeyAssetInterface } from "./m1.ts";

export default class InlineKeyAsset implements KeyAssetInterface {
  constructor(private props: { bytesBase64: string; format: string }) {}
  async load(): Promise<{ keyBytes: ArrayBuffer; format: string }> {
    const bytes = Buffer.from(this.props.bytesBase64, "base64");
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
