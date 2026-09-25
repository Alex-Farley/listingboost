import type { SqlDatabase } from "@listingboost/database";
import { R2ObjectStore, type R2BucketSubset } from "@listingboost/storage";
import { createApp } from "./app";
import { internalErrorResponse, withApiHeaders } from "./http";

export interface Env {
  DB: SqlDatabase;
  MEDIA: R2BucketSubset;
  APP_ORIGIN: string;
  MEDIA_SIGNING_SECRET: string;
}

/** Bindings come from deployment configuration, so any of them may be missing at runtime. */
function validateEnv(env: Partial<Env>): { env: Env; problem: null } | { env: null; problem: string } {
  const { DB, MEDIA, APP_ORIGIN, MEDIA_SIGNING_SECRET } = env;
  if (!DB || !MEDIA) return { env: null, problem: "DB and MEDIA bindings are required" };
  if (!MEDIA_SIGNING_SECRET || MEDIA_SIGNING_SECRET.length < 32) return { env: null, problem: "MEDIA_SIGNING_SECRET must be set (>= 32 chars)" };
  try {
    if (!APP_ORIGIN || new URL(APP_ORIGIN).origin !== APP_ORIGIN) return { env: null, problem: "APP_ORIGIN must be a bare origin" };
  } catch {
    return { env: null, problem: "APP_ORIGIN must be a valid origin" };
  }
  return { env: { DB, MEDIA, APP_ORIGIN, MEDIA_SIGNING_SECRET }, problem: null };
}

export default {
  async fetch(request: Request, rawEnv: Partial<Env>): Promise<Response> {
    const { env, problem } = validateEnv(rawEnv);
    if (!env) {
      console.error(JSON.stringify({ level: "fatal", error: "invalid_configuration", detail: problem }));
      return withApiHeaders(internalErrorResponse());
    }
    const app = createApp({
      db: env.DB,
      storage: new R2ObjectStore(env.MEDIA),
      config: { appOrigin: env.APP_ORIGIN, mediaSigningSecret: env.MEDIA_SIGNING_SECRET },
      now: () => new Date(),
    });
    return app.fetch(request);
  },
};
