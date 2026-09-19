import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

const legacyNames = [
  "listingboost-showcase-exterior.png",
  "listingboost-showcase-garden.png",
  "listingboost-showcase-interior.png",
  "listingboost-result.png",
  "listingboost-practice-property.png",
  "listingboost-practice-social.png",
  "listingboost-practice-launch.png",
];

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

const sourceFiles = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(tsx?|md|json)$/.test(entry.name)) sourceFiles.push(path);
  }
}
walk(join(root, "src"));

for (const file of sourceFiles) {
  const source = readFileSync(file, "utf8");
  for (const legacyName of legacyNames) {
    if (source.includes(legacyName)) {
      throw new Error(`Legacy landing artwork is still referenced: ${legacyName} in ${file}`);
    }
  }
}

console.log(`Verified ${Object.keys(expected).length} canonical landing artwork files and no legacy landing references.`);
