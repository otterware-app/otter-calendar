import type { ClientSettings } from "@t3tools/contracts";

/**
 * Whether a key press in the composer sends the message, per the `sendShortcut` setting:
 * Enter always, Mod+Enter only for multiline prompts, or Mod+Enter always. Shift+Enter and
 * Alt+Enter insert a newline, and IME composition never sends.
 */
export function composerKeySends(
  event: {
    readonly key: string;
    readonly shiftKey: boolean;
    readonly altKey: boolean;
    readonly metaKey: boolean;
    readonly ctrlKey: boolean;
    readonly isComposing?: boolean;
  },
  sendShortcut: ClientSettings["sendShortcut"],
  prompt: string,
): boolean {
  if (event.key !== "Enter" || event.shiftKey || event.altKey || event.isComposing) return false;
  const requiresModifier =
    sendShortcut === "mod-enter" ||
    (sendShortcut === "mod-enter-multiline" && /[\r\n]/.test(prompt));
  return !requiresModifier || event.metaKey || event.ctrlKey;
}
