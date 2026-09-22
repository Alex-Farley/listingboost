import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const required = [
  "LB_WORKER_NAME",
  "LB_D1_DATABASE_ID",
  "LB_D1_DATABASE_NAME",
  "LB_BETTER_AUTH_URL",
];

for (const name of required) {
  if (!process.env[name]?.trim()) {
    throw new Error(`Missing required standalone deployment variable: ${name}`);
  }
}

const outputPath = resolve(
  process.argv[2] ?? ".cloudflare/standalone.wrangler.json",
);

const configDirectory = dirname(outputPath);
const relativeToConfig = (targetPath) => {
  const value = relative(configDirectory, resolve(targetPath));
  return value.startsWith(".") ? value : `./${value}`;
};

const config = {
  "$schema": "node_modules/wrangler/config-schema.json",
  name: process.env.LB_WORKER_NAME,
  main: relativeToConfig("dist/server/server.js"),
  compatibility_date: "2025-05-01",
  compatibility_flags: ["nodejs_compat"],
  observability: { enabled: true },
  assets: {
    directory: relativeToConfig("dist/client"),
    binding: "ASSETS",
    not_found_handling: "none",
  },
  vars: {
    HF_ENV: process.env.LB_ENVIRONMENT ?? "preview",
    APP_SLUG: "listingboost",
    BETTER_AUTH_URL: process.env.LB_BETTER_AUTH_URL,
  },
  d1_databases: [
    {
      binding: "DB",
      database_name: process.env.LB_D1_DATABASE_NAME,
      database_id: process.env.LB_D1_DATABASE_ID,
    },
  ],
};

if (process.env.LB_R2_BUCKET_NAME?.trim()) {
  config.r2_buckets = [
    {
      binding: "STORAGE",
      bucket_name: process.env.LB_R2_BUCKET_NAME,
    },
  ];
}

if (process.env.LB_QUEUE_NAME?.trim()) {
  config.queues = {
    producers: [
      {
        binding: "GENERATION_QUEUE",
        queue: process.env.LB_QUEUE_NAME,
      },
    ],
    consumers: [
      {
        queue: process.env.LB_QUEUE_NAME,
      },
    ],
  };
}

if (process.env.LB_ROUTE?.trim()) {
  config.routes = [{ pattern: process.env.LB_ROUTE, zone_name: process.env.LB_ZONE_NAME }];
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(config, null, 2) + "\n");
console.log(`Wrote standalone Wrangler config to ${outputPath}`);
