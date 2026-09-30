const IMAGE_PREVIEW_EXTENSIONS = [
  ".avif",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
] as const;

/** Whether a path, ignoring any query or fragment, names an image a client can show inline. */
export function isWorkspaceImagePreviewPath(path: string): boolean {
  const pathWithoutQuery = path.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  return IMAGE_PREVIEW_EXTENSIONS.some((extension) => pathWithoutQuery.endsWith(extension));
}
