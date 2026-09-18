import { createFileRoute } from "@tanstack/react-router";
import { getRawUrl } from "@higgsfield/fnf/client";
import { createServerFnf } from "@/lib/fnf.server";

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
          const generation = await createServerFnf().adapter.getJob(id) as import("@higgsfield/fnf/client").Generation;
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
