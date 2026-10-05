import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Bun 1.3 ignores `timeout` in bunfig.toml and applies its 5 s default unless --timeout is passed.
// A UI test that signs up and navigates can take longer than 5 s on a busy CI runner, and was then
// killed at exactly 5,000 ms with no assertion message (work item 005).
describe("test runner configuration", () => {
  const scripts = (JSON.parse(readFileSync(join(import.meta.dir, "../../package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  const bunTestScripts = Object.entries(scripts).filter(([, command]) => /\bbun test\b/.test(command));

  test("every script that runs bun test sets a per-test timeout of at least 30 s", () => {
    expect(bunTestScripts.map(([name]) => name).sort()).toEqual(["test", "test:integration", "test:security", "test:ui", "test:unit"]);
    for (const [name, command] of bunTestScripts) {
      const timeout = Number(command.match(/--timeout[= ](\d+)/)?.[1] ?? 0);
      expect({ name, timeout: timeout >= 30_000 }).toEqual({ name, timeout: true });
    }
  });

  test("the per-test timeout stays above Testing Library's 5 s wait, so a slow query fails with its own message", () => {
    const harness = readFileSync(join(import.meta.dir, "../ui/harness.tsx"), "utf8");
    const asyncWait = Number(harness.match(/asyncUtilTimeout:\s*(\d+)/)?.[1]);
    expect(asyncWait).toBe(5000);
    for (const [, command] of bunTestScripts) expect(Number(command.match(/--timeout[= ](\d+)/)?.[1] ?? 0)).toBeGreaterThan(asyncWait * 2);
  });
});
