import { ApiJobError } from "@higgsfield/fnf/errors";
import { inferContentType } from "@higgsfield/fnf/media";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFnf } from "@/lib/fnf.server";
import { storeOwnedImage } from "@/lib/owned-media.server";
import { bindings } from "@/lib/bindings.server";
import { validateUploadRequestHeaders } from "@/lib/upload-request-security";
import { validateImageBytes } from "@/lib/image-upload-validation";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const Route = createFileRoute("/api/media/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const rejection = validateUploadRequestHeaders(request, MAX_UPLOAD_BYTES);
          if (rejection != null) {
            return Response.json(
              { ok: false, error: { code: rejection.code, message: rejection.message } },
              { status: rejection.status },
            );
          }

          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File)) {
            return Response.json(
              { ok: false, error: { code: "invalid_file", message: "Choose an image to upload." } },
              { status: 400 },
            );
          }

          if (file.size > MAX_UPLOAD_BYTES) {
            return Response.json(
              {
                ok: false,
                error: { code: "file_too_large", message: "Images must be 20 MB or smaller." },
              },
              { status: 413 },
            );
          }

          const bytes = new Uint8Array(await file.arrayBuffer());
          let image;
          try {
            image = validateImageBytes(bytes);
          } catch (error) {
            return Response.json(
              {
                ok: false,
                error: {
                  code: "invalid_image",
                  message: error instanceof Error ? error.message : "The uploaded file is not a valid image.",
                },
              },
              { status: 415 },
            );
          }

          const contentType = inferContentType(file.name, file.type);
          if (contentType !== image.contentType) {
            return Response.json(
              {
                ok: false,
                error: { code: "invalid_image_type", message: "The file type does not match its image content." },
              },
              { status: 415 },
            );
          }

          // Metadata is intentionally preserved for the source asset. The upload boundary
          // validates the bytes and dimensions but does not trust client MIME/type metadata.
          const validatedFile = new File([bytes], file.name, { type: image.contentType });
          if (bindings().STORAGE && bindings().DB) {
            const owned = await storeOwnedImage(validatedFile);
            return Response.json({ ok: true, ref: { id: owned.id, type: "media_input", url: owned.url }, url: owned.url });
          }

          const result = await createServerFnf().media.upload({
            source: bytes,
            type: "image",
            filename: file.name,
            contentType: image.contentType,
            forceIpCheck: true,
          });
          const url = result.url ?? result.ref.url;
          if (!url) {
            throw new ApiJobError("upload_missing_url", "Upload completed without a preview URL");
          }
          return Response.json({ ok: true, ref: result.ref, url });
        } catch (error) {
          const payload =
            error instanceof ApiJobError
              ? error.toJSON()
              : {
                  code: "upload_failed",
                  message: error instanceof Error ? error.message : String(error),
                };
          return Response.json({ ok: false, error: payload }, { status: payload.status ?? 500 });
        }
      },
    },
  },
});
