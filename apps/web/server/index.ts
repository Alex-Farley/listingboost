import type { SqlDatabase } from "@listingboost/database";
import { createApp } from "./app";
import { internalErrorResponse, withApiHeaders } from "./http";

export interface Env {
  DB: SqlDatabase;
  APP_ORIGIN: string;
  MEDIA_SIGNING_SECRET: string;
}

function configError(env: Env): string | null {
  if (!env.MEDIA_SIGNING_SECRET || env.MEDIA_SIGNING_SECRET.length < 32) return "MEDIA_SIGNING_SECRET must be set (>= 32 chars)";
  try {
    if (new URL(env.APP_ORIGIN).origin !== env.APP_ORIGIN) return "APP_ORIGIN must be a bare origin";
  } catch {
    return "APP_ORIGIN must be a valid origin";
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const problem = configError(env);
    if (problem) {
      console.error(JSON.stringify({ level: "fatal", error: "invalid_configuration", detail: problem }));
      return withApiHeaders(internalErrorResponse());
    }
    const app = createApp({
      db: env.DB,
      config: { appOrigin: env.APP_ORIGIN, mediaSigningSecret: env.MEDIA_SIGNING_SECRET },
      now: () => new Date(),
    });
    return app.fetch(request);
  },
};
