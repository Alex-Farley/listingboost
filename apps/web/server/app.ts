import { GenerationService } from "@listingboost/generation";
import type { AppContext } from "./context";
import { assertCsrf } from "./csrf";
import { errorResponse, HttpError, internalErrorResponse, notFound, withApiHeaders } from "./http";
import { Router } from "./router";
import { registerAuthRoutes } from "./routes/auth";
import { registerCampaignRoutes } from "./routes/campaigns";
import { registerFileRoutes } from "./routes/files";
import { registerMediaRoutes } from "./routes/media";
import { registerPackRoutes } from "./routes/pack";
import { registerPropertyRoutes } from "./routes/properties";
import { registerReviewRoutes } from "./routes/review";

export type { AppContext } from "./context";

export function createGenerationService(ctx: AppContext): GenerationService {
  return new GenerationService({ db: ctx.db, storage: ctx.storage, queue: ctx.queue, providers: ctx.providers, now: ctx.now });
}

export function createApp(ctx: AppContext) {
  const router = new Router<AppContext>();
  const generation = createGenerationService(ctx);
  registerAuthRoutes(router);
  registerPropertyRoutes(router);
  registerMediaRoutes(router);
  registerFileRoutes(router);
  registerCampaignRoutes(router, generation);
  registerReviewRoutes(router, generation);
  registerPackRoutes(router);

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) throw notFound();
    assertCsrf(request, ctx.config.appOrigin);
    const match = router.match(request.method, url.pathname);
    if (match === null) throw notFound();
    if (match === "method_not_allowed") throw new HttpError(405, "method_not_allowed", "Method not allowed.");
    return match.handler(request, match.params, ctx);
  }

  return {
    async fetch(request: Request): Promise<Response> {
      const requestId = crypto.randomUUID();
      let response: Response;
      try {
        response = await handle(request);
      } catch (error) {
        if (error instanceof HttpError) {
          response = errorResponse(error);
        } else {
          // Log the failure server-side only; the client gets a generic message.
          console.error(JSON.stringify({ level: "error", requestId, path: new URL(request.url).pathname, error: String(error) }));
          response = internalErrorResponse();
        }
      }
      response = withApiHeaders(response);
      response.headers.set("X-Request-Id", requestId);
      return response;
    },
  };
}
