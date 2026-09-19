import type { R2Bucket, R2ObjectBody } from "@cloudflare/workers-types";
import type { MediaKind, MediaStore, StoredMedia } from "./media.server";

export type OwnedMediaRecord = {
  id: string;
  objectKey: string;
  kind: MediaKind;
  contentType: string;
  byteSize?: number;
};

export interface OwnedMediaStore extends MediaStore {
  put(input: {
    id: string;
    objectKey: string;
    kind: MediaKind;
    body: ArrayBuffer | ArrayBufferView | ReadableStream;
    contentType: string;
    byteSize?: number;
  }): Promise<OwnedMediaRecord>;
  getObject(objectKey: string): Promise<R2ObjectBody | null>;
}

export function createR2MediaStore(bucket: R2Bucket): OwnedMediaStore {
  return {
    async put(input) {
      await bucket.put(input.objectKey, input.body, {
        httpMetadata: { contentType: input.contentType },
      });
      return {
        id: input.id,
        objectKey: input.objectKey,
        kind: input.kind,
        contentType: input.contentType,
        ...(input.byteSize === undefined ? {} : { byteSize: input.byteSize }),
      };
    },
    async get(id, type) {
      const prefix = `campaign-media/${type}/`;
      const listed = await bucket.list({ prefix });
      const match = listed.objects.find((object) => object.key.endsWith(`/${id}`));
      if (!match) return null;
      return {
        id,
        type,
        downloadUrl: `/api/media/download?id=${encodeURIComponent(id)}&type=${type}`,
        contentType: match.httpMetadata?.contentType,
      };
    },
    async getObject(objectKey) {
      return bucket.get(objectKey);
    },
  };
}
