import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const expected = {
  "listingboost-example-campaign.jpg":
    "b58c8f5fb45c40cc92ce59634525e73021101394ff048aac61da6dab40148043",
  "listingboost-campaign-types.jpg":
    "a4adec7c553e0746f19cdcae8de1aabdf3b8269e9bf25e66efcddc3cabe56081",
  "listingboost-showcase-practice.jpg":
    "d16d169ee3989c5fe8393f59b44ff3bc209a2e3d570ca0b8f2295294059c7ea2",
  "listingboost-showcase-detail.jpg":
    "de31b3b200f3baf21d04df9c6c579d84fe0122350cb01a75a3ba415ceb1dfaa8",
};

for (const [name, expectedHash] of Object.entries(expected)) {
  const path = join(root, "public/assets/landing", name);
  if (!existsSync(path)) {
    throw new Error(`Missing canonical landing artwork: ${name}`);
  }
  const actualHash = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actualHash !== expectedHash) {
    throw new Error(`Landing artwork changed: ${name} (expected ${expectedHash}, got ${actualHash})`);
  }
}

console.log(`Verified ${Object.keys(expected).length} canonical landing artwork files.`);
