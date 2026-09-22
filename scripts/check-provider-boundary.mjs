#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const domainFiles = [
  "src/lib/generation-approval.ts",
  "src/lib/generation-job.ts",
  "src/lib/generation-orchestrator.ts",
  "src/lib/generation-provider.ts",
  "src/lib/generation-queue.ts",
  "src/lib/generation-worker.ts",
];
const forbiddenPatterns = [
  /@higgsfield(?:[\w/-]*)?/i,
  /fnf\.internal/i,
  /window\.hf\b/i,
];
const findings = [];

for (const relativePath of domainFiles) {
  const path = join(ROOT, relativePath);
  if (!existsSync(path)) {
    findings.push(`${relativePath} — provider-neutral domain file is missing`);
    continue;
  }

  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (forbiddenPatterns.some((pattern) => pattern.test(line))) {
      findings.push(`${relativePath}:${index + 1} — provider-specific runtime dependency found in domain code`);
    }
  });
}

if (findings.length > 0) {
  console.error("Provider-neutral generation boundary check failed:\n");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("Provider-neutral generation boundary check passed.");
