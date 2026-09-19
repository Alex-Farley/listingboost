import { createFileRoute } from "@tanstack/react-router";
import { createLegacyFnfAuthService } from "@/lib/auth.server";

export const Route = createFileRoute("/api/user")({
  server: {
    handlers: {
      GET: async () => {
        const user = await createLegacyFnfAuthService().getCurrentUser();
        return Response.json(
          user ? { id: user.id } : null,
          { status: user ? 200 : 401, headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
