import type { ObjectStore, StoredObject } from "./object-store";

/** The R2 operations ListingBoost uses; the real R2Bucket binding satisfies it. */
export type R2BucketSubset = Pick<R2Bucket, "put" | "get" | "delete">;

export class R2ObjectStore implements ObjectStore {
  constructor(private readonly bucket: R2BucketSubset) {}

  async put(key: string, bytes: Uint8Array, options: { contentType: string }): Promise<void> {
    await this.bucket.put(key, bytes, { httpMetadata: { contentType: options.contentType } });
  }

  async get(key: string): Promise<StoredObject | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;
    return { body: object.body, contentType: object.httpMetadata?.contentType ?? "application/octet-stream", size: object.size };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}
