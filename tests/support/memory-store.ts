import type { ObjectStore, StoredObject } from "@listingboost/storage";

/** In-memory ObjectStore for test isolation. The R2 adapter is tested separately against Miniflare's R2. */
export class MemoryObjectStore implements ObjectStore {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  async put(key: string, bytes: Uint8Array, options: { contentType: string }): Promise<void> {
    this.objects.set(key, { bytes: bytes.slice(), contentType: options.contentType });
  }

  async get(key: string): Promise<StoredObject | null> {
    const object = this.objects.get(key);
    if (!object) return null;
    return { body: new Blob([object.bytes.slice()]).stream(), contentType: object.contentType, size: object.bytes.length };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
