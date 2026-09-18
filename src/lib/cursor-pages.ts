import type { MediaListResult, MediaRef } from "@higgsfield/fnf/media";

/** Stop repeated backend cursors from becoming an endless client loop. */
export function getNextCursor<T extends { cursor?: string | number }>(
  lastPage: T,
  allPages: readonly T[],
): string | number | undefined {
  const cursor = lastPage.cursor;
  if (cursor === undefined) return undefined;
  return allPages.slice(0, -1).some((page) => page.cursor === cursor) ? undefined : cursor;
}

/** Keep the first ordering position while folding in the latest ref snapshot. */
export function flattenMediaPages(data: { pages: readonly MediaListResult[] }): MediaRef[] {
  const refs = new Map<string, MediaRef>();
  for (const page of data.pages) {
    for (const ref of page.items) refs.set(ref.id, ref);
  }
  return [...refs.values()];
}
