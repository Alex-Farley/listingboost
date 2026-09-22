import { createCsrfMiddleware, createStart, createMiddleware } from "@tanstack/react-start";

import { bindings } from "./lib/bindings.server";
import { createListingBoostBetterAuth, isBetterAuthRequestPath } from "./lib/better-auth.server";
import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (
      error != null &&
      typeof error === "object" &&
      ("statusCode" in error || "status" in error || "code" in error)
    ) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
});

const betterAuthMiddleware = createMiddleware().server(async ({ request, next }) => {
  const pathname = new URL(request.url).pathname;
  if (!isBetterAuthRequestPath(pathname)) return next();

  const config = bindings();
  if (!config.DB) {
    return new Response("Authentication storage is not available.", { status: 503 });
  }
  if (!config.BETTER_AUTH_SECRET || !config.BETTER_AUTH_URL) {
    return new Response("Authentication is not configured.", { status: 503 });
  }

  const auth = createListingBoostBetterAuth({
    database: config.DB,
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
  });
  return auth.handler(request);
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, errorMiddleware, betterAuthMiddleware],
}));
