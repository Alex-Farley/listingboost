export function assertAuthorizedSourceImage(
  requestedId: string,
  media: { id?: string; type?: string } | null | undefined,
) {
  if (!media || media.id !== requestedId || media.type !== "image") {
    throw new Error("Source image not found.");
  }
  return { id: media.id, type: "image" as const };
}
