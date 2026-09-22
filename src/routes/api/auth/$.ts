import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "@/lib/bindings.server";
import { createListingBoostBetterAuth } from "@/lib/better-auth.server";

function authForRequest(request: Request) {
  const database = bindings().DB;
  const secret = bindings().BETTER_AUTH_SECRET;
  if (!database) throw new Error("Authentication storage is not available.");
  if (!secret) throw new Error("Authentication is not configured.");
  return createListingBoostBetterAuth({
    database,
    secret,
    baseURL: new URL(request.url).origin,
  });
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => authForRequest(request).handler(request),
      POST: async ({ request }) => authForRequest(request).handler(request),
    },
  },
});
