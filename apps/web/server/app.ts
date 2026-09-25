import type { AppContext } from "./context";
import { assertCsrf } from "./csrf";
import { errorResponse, HttpError, internalErrorResponse, notFound, withApiHeaders } from "./http";
import { Router } from "./router";
import { registerAuthRoutes } from "./routes/auth";

export type { AppContext } from "./context";

export function createApp(ctx: AppContext) {
  const router = new Router<AppContext>();
  registerAuthRoutes(router);

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
