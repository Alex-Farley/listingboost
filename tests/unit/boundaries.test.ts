import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

async function importsOf(dir: string): Promise<Array<{ file: string; spec: string }>> {
  const out: Array<{ file: string; spec: string }> = [];
  for await (const file of new Glob(`${dir}/**/*.{ts,tsx}`).scan(".")) {
    const source = await Bun.file(file).text();
    for (const m of source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) out.push({ file, spec: m[1]! });
  }
  return out;
}

describe("architecture boundaries", () => {
  test("domain has no I/O dependencies and imports no other package", async () => {
    const bad = (await importsOf("packages/domain/src")).filter(({ spec }) => !spec.startsWith("./") && spec !== "zod");
    expect(bad).toEqual([]);
  });
});
