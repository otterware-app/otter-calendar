import { describe, expect, it } from "vite-plus/test";

import { attachmentFileExtension, toSafeThreadAttachmentSegment } from "./attachmentStore.ts";

describe("attachmentStore", () => {
  it("reduces thread ids to lowercase filesystem-safe segments", () => {
    expect(toSafeThreadAttachmentSegment("Thread.Folder/unsafe space")).toBe(
      "thread-folder-unsafe-space",
    );
    expect(toSafeThreadAttachmentSegment("  --  ")).toBeNull();
    expect(toSafeThreadAttachmentSegment("x".repeat(200))?.length).toBe(80);
  });

  it("keeps safe file extensions and falls back to .bin", () => {
    expect(attachmentFileExtension("report.PDF")).toBe(".pdf");
    expect(attachmentFileExtension("report")).toBe(".bin");
    expect(attachmentFileExtension("report.extensiontoolong")).toBe(".bin");
  });
});
