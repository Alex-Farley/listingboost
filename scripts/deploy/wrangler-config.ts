/**
 * Builds the deploy-time Wrangler config from GitHub Environment variables, so
 * account-specific resource IDs never live in the repository.
 *
 * CLI: bun scripts/deploy/wrangler-config.ts <output.json>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

type Vars = Record<string, string | undefined>;

export type DeployConfig = {
  $schema: string;
  name: string;
  main: string;
  rules: Array<{ type: string; globs: string[]; fallthrough: boolean }>;
  compatibility_date: string;
  observability: { enabled: boolean };
  assets: { directory: string; not_found_handling: string; run_worker_first: string[] };
  d1_databases: Array<{ binding: string; database_name: string; database_id: string; migrations_dir: string }>;
  r2_buckets: Array<{ binding: string; bucket_name: string }>;
  queues: { producers: Array<{ binding: string; queue: string }>; consumers: Array<{ queue: string; max_batch_size: number; max_retries: number }> };
  triggers: { crons: string[] };
  vars: { APP_ORIGIN: string };
  routes?: Array<{ pattern: string; zone_name: string }>;
};

const REPO_ROOT = resolve(import.meta.dir, "../..");

function required(vars: Vars, name: string): string {
  const value = vars[name]?.trim();
  if (!value) throw new Error(`Missing required deployment variable: ${name}`);
  return value;
}

function appOrigin(vars: Vars): string {
  const raw = vars.LB_APP_ORIGIN?.trim() || vars.LB_BETTER_AUTH_URL?.trim();
  if (!raw) throw new Error("Missing required deployment variable: LB_APP_ORIGIN (or legacy LB_BETTER_AUTH_URL)");
  return new URL(raw).origin;
}

export function buildDeployConfig(vars: Vars, configDir: string, repoRoot = "/repo"): DeployConfig {
  const rel = (path: string) => {
    const value = relative(configDir, resolve(repoRoot, path));
    return value.startsWith(".") ? value : `./${value}`;
  };
  const name = required(vars, "LB_WORKER_NAME");
  const queue = vars.LB_QUEUE_NAME?.trim() || `${name}-jobs`;
  const config: DeployConfig = {
    $schema: rel("node_modules/wrangler/config-schema.json"),
    name,
    main: rel("apps/web/server/index.ts"),
    rules: [{ type: "Data", globs: ["**/*.woff"], fallthrough: true }],
    compatibility_date: "2026-09-01",
    observability: { enabled: true },
    assets: { directory: rel("dist/client"), not_found_handling: "single-page-application", run_worker_first: ["/api/*"] },
    d1_databases: [
      {
        binding: "DB",
        database_name: required(vars, "LB_D1_DATABASE_NAME"),
        database_id: required(vars, "LB_D1_DATABASE_ID"),
        migrations_dir: rel("migrations"),
      },
    ],
    r2_buckets: [{ binding: "MEDIA", bucket_name: required(vars, "LB_R2_BUCKET_NAME") }],
    queues: { producers: [{ binding: "JOBS", queue }], consumers: [{ queue, max_batch_size: 5, max_retries: 5 }] },
    triggers: { crons: ["*/5 * * * *"] },
    vars: { APP_ORIGIN: appOrigin(vars) },
  };
  const route = vars.LB_ROUTE?.trim();
  if (route) config.routes = [{ pattern: route, zone_name: required(vars, "LB_ZONE_NAME") }];
  return config;
}

if (import.meta.main) {
  const output = resolve(process.argv[2] ?? ".cloudflare/wrangler.deploy.json");
  const config = buildDeployConfig(process.env, dirname(output), REPO_ROOT);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Wrote ${output} (worker ${config.name}, queue ${config.queues.producers[0]!.queue}, origin ${config.vars.APP_ORIGIN})`);
}
