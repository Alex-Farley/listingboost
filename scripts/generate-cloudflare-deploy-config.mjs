import { mkdir, writeFile } from "node:fs/promises";

const required = [
  "LISTINGBOOST_WORKER_NAME",
  "LISTINGBOOST_D1_DATABASE_ID",
  "LISTINGBOOST_D1_DATABASE_NAME",
  "LISTINGBOOST_R2_BUCKET_NAME",
];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Missing required deployment variable: ${name}`);
  }
}

const workerName = process.env.LISTINGBOOST_WORKER_NAME;
const databaseId = process.env.LISTINGBOOST_D1_DATABASE_ID;
const databaseName = process.env.LISTINGBOOST_D1_DATABASE_NAME;
const bucketName = process.env.LISTINGBOOST_R2_BUCKET_NAME;

if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(workerName)) {
  throw new Error("LISTINGBOOST_WORKER_NAME must be a 3-63 character Cloudflare name using lowercase letters, digits and dashes");
}

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(databaseId)) {
  throw new Error("LISTINGBOOST_D1_DATABASE_ID must be a UUID");
}

if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(databaseName)) {
  throw new Error("LISTINGBOOST_D1_DATABASE_NAME must be a 3-63 character Cloudflare name using lowercase letters, digits and dashes");
}

if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucketName)) {
  throw new Error("LISTINGBOOST_R2_BUCKET_NAME must be a 3-63 character Cloudflare bucket name using lowercase letters, digits and dashes");
}

const config = {
  $schema: "node_modules/wrangler/config-schema.json",
  name: workerName,
  main: "dist/server/server.js",
  compatibility_date: "2025-05-01",
  compatibility_flags: ["nodejs_compat"],
  observability: { enabled: true },
  assets: {
    directory: "./dist/client",
    binding: "ASSETS",
    not_found_handling: "none",
  },
  d1_databases: [
    {
      binding: "DB",
      database_name: databaseName,
      database_id: databaseId,
    },
  ],
  r2_buckets: [
    {
      binding: "STORAGE",
      bucket_name: bucketName,
    },
  ],
};

await mkdir(".generated", { recursive: true });
await writeFile(".generated/wrangler.json", `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log("Generated standalone Cloudflare deployment configuration in .generated/wrangler.json");
