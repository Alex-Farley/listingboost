import { createFileRoute } from "@tanstack/react-router";
import { createListingBoostAuthService } from "@/lib/auth.server";
import { bindings } from "@/lib/bindings.server";

export const Route = createFileRoute("/api/user")({
  server: { handlers: {
    GET: async () => {
      const database = bindings().DB;
      if (!database) return new Response("Identity storage is not available.", { status: 503 });
      const user = await createListingBoostAuthService(database).getCurrentUser();
      return Response.json(user ? { id: user.id } : null, {
        status: user ? 200 : 401, headers: { "cache-control": "no-store" },
      });
    },
  }},
});
