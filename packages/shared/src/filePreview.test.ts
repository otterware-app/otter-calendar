import { describe, expect, it } from "vite-plus/test";

import { isWorkspaceImagePreviewPath } from "./filePreview.ts";

describe("isWorkspaceImagePreviewPath", () => {
  it.each([
    "icon.png",
    "photo.JPEG",
    "animation.gif",
    "vector.svg#mark",
    "texture.webp",
    "image.avif",
  ])("recognizes image preview path %s", (path) => {
    expect(isWorkspaceImagePreviewPath(path)).toBe(true);
  });

  it.each(["README.md", "src/index.ts", "image.png.ts", "png", "report.html"])(
    "rejects non-image path %s",
    (path) => {
      expect(isWorkspaceImagePreviewPath(path)).toBe(false);
    },
  );
});
