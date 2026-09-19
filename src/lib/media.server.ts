export type MediaKind = "image" | "video" | "audio";

export type StoredMedia = {
  id: string;
  type: MediaKind;
  downloadUrl: string;
  contentType?: string;
};

export interface MediaStore {
  get(id: string, type: MediaKind): Promise<StoredMedia | null>;
}

/**
 * Temporary prototype adapter. Production must replace this with ListingBoost
 * R2-backed storage; domain/routes must not depend on FNF media types or URLs.
 */
export function createLegacyFnfMediaStore(): MediaStore {
  return {
    async get(id, type) {
      const { createServerFnf } = await import("./fnf.server");
      const { getRawUrl } = await import("@higgsfield/fnf/client");
      const generation = await createServerFnf().adapter.getJob(id) as {
        id?: string;
        type?: string;
        results?: Record<string, unknown>;
      };
      if (generation.id !== id || generation.type !== type) return null;
      const downloadUrl = getRawUrl(generation as never);
      if (!downloadUrl || !/^https:\/\//i.test(downloadUrl)) return null;
      const result = generation.results ?? {};
      const contentType =
        typeof result.contentType === "string" ? result.contentType : undefined;
      return { id, type, downloadUrl, ...(contentType ? { contentType } : {}) };
    },
  };
}
