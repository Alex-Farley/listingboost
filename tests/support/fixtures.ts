import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dir, "fixtures", "images");

export function fixture(name: string): Uint8Array<ArrayBuffer> {
  const buffer = readFileSync(join(DIR, name));
  const bytes = new Uint8Array(new ArrayBuffer(buffer.byteLength));
  bytes.set(buffer);
  return bytes;
}

export function videoFixture(name: string): Uint8Array<ArrayBuffer> {
  const buffer = readFileSync(join(import.meta.dir, "fixtures", "videos", name));
  const bytes = new Uint8Array(new ArrayBuffer(buffer.byteLength));
  bytes.set(buffer);
  return bytes;
}
