import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("app.manifest.json", "utf8"));
const wrangler = readFileSync("wrangler.jsonc", "utf8");

const failures = [];

if (wrangler.includes('"name": "listingboost"')) {
  failures.push("wrangler.jsonc must not contain a production worker name");
}

if (/^\s*"database_id"\s*:/m.test(wrangler)) {
  failures.push("wrangler.jsonc must not contain an active D1 database_id");
}

if (/^\s*"database_name"\s*:/m.test(wrangler)) {
  failures.push("wrangler.jsonc must not contain an active D1 database_name");
}

if (/^\s*"bucket_name"\s*:/m.test(wrangler)) {
  failures.push("wrangler.jsonc must not contain an active R2 bucket_name");
}

if (/^\s*"id"\s*:\s*"[0-9a-f]{32}"\s*$/m.test(wrangler)) {
  failures.push("wrangler.jsonc must not contain an active KV namespace id");
}

if (manifest.db !== true) {
  failures.push("app.manifest.json must explicitly declare D1 when the app requires DB");
}

if (manifest.r2 === true && !/"STORAGE"/.test(wrangler)) {
  failures.push("R2 is enabled in app.manifest.json but no STORAGE binding contract is documented");
}

if (failures.length) {
  console.error("Infrastructure isolation guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Infrastructure isolation guard passed: local deploy config contains no production resource identifiers.");
