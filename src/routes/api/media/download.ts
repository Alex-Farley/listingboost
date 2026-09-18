import { createFileRoute } from "@tanstack/react-router";
import { getRawUrl } from "@higgsfield/fnf/client";
import { createServerFnf } from "@/lib/fnf.server";
import { bindings } from "@/lib/bindings.server";

function safeFilename(type: "image" | "video" | "audio", contentType: string | null): string {
  const extension = type === "video" ? "mp4" : type === "audio" ? "mp3" : contentType?.includes("png") ? "png" : contentType?.includes("webp") ? "webp" : "jpg";
  return "listingboost-generation." + extension;
}

export const Route = createFileRoute("/api/media/download")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        const type = url.searchParams.get("type");
        if (!id || (type !== "image" && type !== "video" && type !== "audio")) return new Response("Invalid media request.", { status: 400 });
        try {
          // Downloads are only authorized for generations already attached to
          // a campaign owned by the authenticated user. The FNF getJob call is
          // then performed inside that authenticated FNF scope as a second check.
          const database = bindings().DB;
          if (!database) return new Response("Media storage is not available.", { status: 503 });
          const ownedAsset = await database.prepare(
            "SELECT ca.media_type FROM campaign_assets ca INNER JOIN campaigns c ON c.id=ca.campaign_id WHERE ca.generation_id=? AND c.user_id=? LIMIT 1",
          ).bind(id, (await createServerFnf().adapter.getUser() as { id?: string }).id).first();
          if (!ownedAsset || String((ownedAsset as Record<string, unknown>).media_type) !== type) {
            return new Response("Generation not found.", { status: 404 });
          }
          const generation = await createServerFnf().adapter.getJob(id) as import("@higgsfield/fnf/client").Generation;
          if (generation.id !== id || generation.type !== type) return new Response("Generation not found.", { status: 404 });
          const rawUrl = getRawUrl(generation);
          if (!rawUrl || !/^https:\/\//i.test(rawUrl)) return new Response("Generation media is unavailable.", { status: 404 });
          const upstream = await fetch(rawUrl);
          if (!upstream.ok || !upstream.body) return new Response("Generation media could not be downloaded.", { status: 502 });
          const contentType = upstream.headers.get("content-type") ?? undefined;
          return new Response(upstream.body, {
            status: 200,
            headers: {
              "content-type": contentType ?? (type === "video" ? "video/mp4" : type === "audio" ? "audio/mpeg" : "image/jpeg"),
              "content-disposition": 'attachment; filename="' + safeFilename(type, contentType ?? null) + '"',
              "cache-control": "private, no-store",
            },
          });
        } catch (error) {
          return new Response(error instanceof Error ? error.message : "Generation media could not be downloaded.", { status: 502 });
        }
      },
    },
  },
});
