import { createFileRoute } from "@tanstack/react-router";
import { createListingBoostAuthService } from "@/lib/auth.server";
import { createLegacyFnfMediaStore } from "@/lib/media.server";
import { createR2MediaStore } from "@/lib/r2-media.server";
import { bindings } from "@/lib/bindings.server";

async function requireUserId(database: NonNullable<ReturnType<typeof bindings>["DB"]>) {
  const user = await createListingBoostAuthService(database).getCurrentUser();
  if (!user) throw new Error("Sign in to download media.");
  return user.id;
}

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
        const requestedType = type as "image" | "video" | "audio";
        if (!id || (type !== "image" && type !== "video" && type !== "audio")) return new Response("Invalid media request.", { status: 400 });
        try {
          // Downloads are authorized against ListingBoost campaign ownership;
          // retained media is served from ListingBoost-controlled R2 whenever
          // the standalone runtime has its STORAGE binding. The legacy FNF
          // adapter remains only as a prototype fallback during migration.
          const database = bindings().DB;
          if (!database) return new Response("Media storage is not available.", { status: 503 });
          const ownedAsset = await database.prepare(
            "SELECT ca.media_type FROM campaign_assets ca INNER JOIN campaigns c ON c.id=ca.campaign_id WHERE ca.generation_id=? AND c.auth_user_id=? LIMIT 1",
          ).bind(id, await requireUserId(database)).first();
          if (!ownedAsset || String((ownedAsset as Record<string, unknown>).media_type) !== type) {
            return new Response("Generation not found.", { status: 404 });
          }

          const storage = bindings().STORAGE;
          if (storage) {
            const media = await createR2MediaStore(storage).get(id, requestedType);
            if (!media) return new Response("Generation media is unavailable.", { status: 404 });
            const object = await createR2MediaStore(storage).getObject(`campaign-media/${requestedType}/${id}`);
            if (!object?.body) return new Response("Generation media is unavailable.", { status: 404 });
            const contentType = object.httpMetadata?.contentType ?? media.contentType ?? undefined;
            return new Response(object.body, {
              status: 200,
              headers: {
                "content-type": contentType ?? (requestedType === "video" ? "video/mp4" : requestedType === "audio" ? "audio/mpeg" : "image/jpeg"),
                "content-disposition": 'attachment; filename="' + safeFilename(requestedType, contentType ?? null) + '"',
                "cache-control": "private, no-store",
              },
            });
          }

          const media = await createLegacyFnfMediaStore().get(id, requestedType);
          if (!media) return new Response("Generation media is unavailable.", { status: 404 });
          const upstream = await fetch(media.downloadUrl);
          if (!upstream.ok || !upstream.body) return new Response("Generation media could not be downloaded.", { status: 502 });
          const contentType = upstream.headers.get("content-type") ?? undefined;
          return new Response(upstream.body, {
            status: 200,
            headers: {
              "content-type": contentType ?? (requestedType === "video" ? "video/mp4" : requestedType === "audio" ? "audio/mpeg" : "image/jpeg"),
              "content-disposition": 'attachment; filename="' + safeFilename(requestedType, contentType ?? null) + '"',
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
