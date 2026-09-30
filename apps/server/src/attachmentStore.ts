// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";

import type { ChatAttachment } from "@t3tools/contracts";

import { resolveAttachmentRelativePath } from "./attachmentPaths.ts";
import { inferImageExtension } from "./imageMime.ts";

const THREAD_SEGMENT_MAX_CHARS = 80;

/** A thread id reduced to a lowercase, filesystem-safe path segment, or null when nothing is left. */
export function toSafeThreadAttachmentSegment(threadId: string): string | null {
  const segment = threadId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, THREAD_SEGMENT_MAX_CHARS)
    .replace(/[-_]+$/g, "");
  return segment.length === 0 ? null : segment;
}

export function attachmentFileExtension(fileName: string): string {
  const extension = NodePath.extname(fileName).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : ".bin";
}

/** Null for attachment types this build does not know; callers skip those. */
export function attachmentRelativePath(attachment: ChatAttachment): string | null {
  switch (attachment.type) {
    case "image": {
      const extension = inferImageExtension({
        mimeType: attachment.mimeType,
        fileName: attachment.name,
      });
      return `${attachment.id}${extension}`;
    }
    case "file":
      return `${attachment.id}${attachmentFileExtension(attachment.name)}`;
    default:
      return null;
  }
}

export function resolveAttachmentPath(input: {
  readonly attachmentsDir: string;
  readonly attachment: ChatAttachment;
}): string | null {
  const relativePath = attachmentRelativePath(input.attachment);
  if (!relativePath) {
    return null;
  }
  return resolveAttachmentRelativePath({
    attachmentsDir: input.attachmentsDir,
    relativePath,
  });
}
