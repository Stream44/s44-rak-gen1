import { Buffer } from "node:buffer";
import type { Bundle } from "../ir/bytecode";

const encodeBase64 = (code: Uint32Array): string =>
  Buffer.from(code.buffer, code.byteOffset, code.byteLength).toString("base64");

const decodeBase64 = (value: string): Uint32Array => {
  const bytes = Uint8Array.from(Buffer.from(value, "base64"));
  if (bytes.byteLength % Uint32Array.BYTES_PER_ELEMENT !== 0)
    throw new Error("Invalid bundle code payload");
  return new Uint32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

export function serializeBundle(bundle: Bundle): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ ...bundle, code: encodeBase64(bundle.code) }));
}

export function deserializeBundle(bytes: Uint8Array): Bundle {
  const payload = JSON.parse(new TextDecoder().decode(bytes)) as Omit<Bundle, "code"> & {
    code: string;
  };
  return { ...payload, code: decodeBase64(payload.code) };
}
