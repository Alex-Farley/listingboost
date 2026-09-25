export interface StoredObject {
  body: ReadableStream;
  contentType: string;
  size: number;
}

/** Private object storage. Keys are always generated server-side (see objectKeys). */
export interface ObjectStore {
  put(key: string, bytes: Uint8Array, options: { contentType: string }): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

export const objectKeys = {
  source: (organisationId: string, mediaId: string) => `org/${organisationId}/source/${mediaId}`,
  output: (organisationId: string, versionId: string) => `org/${organisationId}/output/${versionId}`,
};
