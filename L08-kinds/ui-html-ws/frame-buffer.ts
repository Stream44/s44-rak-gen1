import type { ServerFrame } from "./wire-protocol.ts";

type BufferedFrame = { version: number; frame: ServerFrame; seq: number };

export class LastNFrameBuffer {
  private readonly entries: BufferedFrame[] = [];
  private seq = 0;

  constructor(private readonly capacity: number = 256) {}

  push(version: number, frame: ServerFrame): void {
    this.entries.push({ version, frame, seq: ++this.seq });
    if (this.entries.length > this.capacity) this.entries.shift();
  }

  sliceSince(seenVersion: number, currentVersion: number): ServerFrame[] {
    if (seenVersion === currentVersion) return [];
    return this.entries
      .filter((entry) => entry.version > seenVersion && entry.version <= currentVersion)
      .sort((left, right) => left.seq - right.seq)
      .map((entry) => entry.frame);
  }

  evictVersion(version: number): void {
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      if (this.entries[index]?.version === version) this.entries.splice(index, 1);
    }
  }

  latestSeq(): number {
    return this.seq;
  }

  replay(version: number, afterSeq: number, upToSeq = Number.POSITIVE_INFINITY): ServerFrame[] {
    return this.entries
      .filter((entry) => entry.version === version && entry.seq > afterSeq && entry.seq <= upToSeq)
      .sort((left, right) => left.seq - right.seq)
      .map((entry) => entry.frame);
  }
}
