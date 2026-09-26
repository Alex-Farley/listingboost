import type { SqlDatabase } from "@listingboost/database";
import type { JobQueue } from "@listingboost/generation";
import { R2ObjectStore, type R2BucketSubset } from "@listingboost/storage";
import { createApp, createGenerationService, type AppContext } from "./app";
import { internalErrorResponse, withApiHeaders } from "./http";
import { createProductionProviders } from "./providers";
import { RENDER_ASSETS } from "./render-assets";

const PRODUCTION_PROVIDERS = createProductionProviders(RENDER_ASSETS);

/** The subset of a Cloudflare Queue producer binding that ListingBoost uses. */
export type JobsQueueBinding = { send(body: { jobId: string }, options?: { delaySeconds?: number }): Promise<unknown> };

export interface Env {
  DB: SqlDatabase;
  MEDIA: R2BucketSubset;
  JOBS: JobsQueueBinding;
  APP_ORIGIN: string;
  MEDIA_SIGNING_SECRET: string;
}

type QueueMessageLike = { body: unknown; ack(): void; retry(): void };
type QueueBatchLike = { readonly queue: string; readonly messages: readonly QueueMessageLike[] };

class CloudflareJobQueue implements JobQueue {
  constructor(private readonly binding: JobsQueueBinding) {}
  async send(jobId: string, delaySeconds = 0): Promise<void> {
    await this.binding.send({ jobId }, delaySeconds > 0 ? { delaySeconds } : undefined);
  }
}

/** Bindings come from deployment configuration, so any of them may be missing at runtime. */
function validateEnv(env: Partial<Env>): { env: Env; problem: null } | { env: null; problem: string } {
  const { DB, MEDIA, JOBS, APP_ORIGIN, MEDIA_SIGNING_SECRET } = env;
  if (!DB || !MEDIA || !JOBS) return { env: null, problem: "DB, MEDIA and JOBS bindings are required" };
  if (!MEDIA_SIGNING_SECRET || MEDIA_SIGNING_SECRET.length < 32) return { env: null, problem: "MEDIA_SIGNING_SECRET must be set (>= 32 chars)" };
  try {
    if (!APP_ORIGIN || new URL(APP_ORIGIN).origin !== APP_ORIGIN) return { env: null, problem: "APP_ORIGIN must be a bare origin" };
  } catch {
    return { env: null, problem: "APP_ORIGIN must be a valid origin" };
  }
  return { env: { DB, MEDIA, JOBS, APP_ORIGIN, MEDIA_SIGNING_SECRET }, problem: null };
}


function contextFor(env: Env): AppContext {
  return {
    db: env.DB,
    storage: new R2ObjectStore(env.MEDIA),
    queue: new CloudflareJobQueue(env.JOBS),
    providers: PRODUCTION_PROVIDERS,
    config: { appOrigin: env.APP_ORIGIN, mediaSigningSecret: env.MEDIA_SIGNING_SECRET },
    now: () => new Date(),
  };
}

function requireEnv(rawEnv: Partial<Env>): Env {
  const { env, problem } = validateEnv(rawEnv);
  if (!env) {
    console.error(JSON.stringify({ level: "fatal", error: "invalid_configuration", detail: problem }));
    throw new Error("invalid_configuration");
  }
  return env;
}

export default {
  async fetch(request: Request, rawEnv: Partial<Env>): Promise<Response> {
    let env: Env;
    try {
      env = requireEnv(rawEnv);
    } catch {
      return withApiHeaders(internalErrorResponse());
    }
    return createApp(contextFor(env)).fetch(request);
  },

  async queue(batch: QueueBatchLike, rawEnv: Partial<Env>): Promise<void> {
    const generation = createGenerationService(contextFor(requireEnv(rawEnv)));
    for (const message of batch.messages) {
      const body = message.body as { jobId?: unknown } | null;
      if (!body || typeof body.jobId !== "string") {
        console.error(JSON.stringify({ level: "error", event: "malformed_job_message" }));
        message.ack();
        continue;
      }
      try {
        await generation.runJob(body.jobId);
        message.ack();
      } catch (error) {
        console.error(JSON.stringify({ level: "error", event: "job_processing_error", jobId: body.jobId, error: String(error) }));
        message.retry();
      }
    }
  },

  async scheduled(_controller: { cron: string; scheduledTime: number }, rawEnv: Partial<Env>): Promise<void> {
    const result = await createGenerationService(contextFor(requireEnv(rawEnv))).sweep();
    console.log(JSON.stringify({ level: "info", event: "generation_sweep", ...result }));
  },
};
