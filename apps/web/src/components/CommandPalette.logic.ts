import type { KeybindingCommand } from "@t3tools/contracts";
import type { ReactNode } from "react";

import { normalizeSearchText } from "../lib/utils";

export const ITEM_ICON_CLASS = "size-4 text-icon-muted";

export interface CommandPaletteItem {
  readonly kind: "action" | "submenu";
  readonly value: string;
  /** What the query matches against, most important first. */
  readonly searchTerms: ReadonlyArray<string>;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly timestamp?: string;
  readonly icon: ReactNode;
  readonly disabled?: boolean;
  readonly titleLeadingContent?: ReactNode;
  readonly titleTrailingContent?: ReactNode;
  readonly shortcutCommand?: KeybindingCommand;
}

export interface CommandPaletteActionItem extends CommandPaletteItem {
  readonly kind: "action";
  readonly run: () => Promise<void> | void;
}

export interface CommandPaletteSubmenuItem extends CommandPaletteItem {
  readonly kind: "submenu";
  readonly groups: ReadonlyArray<CommandPaletteGroup>;
}

export interface CommandPaletteGroup {
  readonly value: string;
  readonly label: string;
  readonly items: ReadonlyArray<CommandPaletteActionItem | CommandPaletteSubmenuItem>;
  /** Only listed once the user types, e.g. every note rather than the recent ones. */
  readonly searchOnly?: boolean;
}

function rankField(field: string, query: string, tokens: ReadonlyArray<string>): number | null {
  const normalized = normalizeSearchText(field);
  if (normalized.length === 0 || !tokens.every((token) => normalized.includes(token))) return null;
  if (normalized === query) return 3;
  if (normalized.startsWith(query)) return 2;
  return normalized.includes(query) ? 1 : 0;
}

function rankItem(item: CommandPaletteItem, query: string, tokens: ReadonlyArray<string>) {
  for (const [index, term] of item.searchTerms.entries()) {
    const rank = rankField(term, query, tokens);
    if (rank !== null) return 1_000 - index * 100 + rank;
  }
  const everything = normalizeSearchText(item.searchTerms.join(" "));
  return tokens.every((token) => everything.includes(token)) ? 0 : null;
}

/**
 * The groups to show for a query: everything but search-only groups when it is empty, else the
 * matching items of every group, best match first (earlier search terms outrank later ones).
 */
export function filterCommandPaletteGroups(
  groups: ReadonlyArray<CommandPaletteGroup>,
  query: string,
): CommandPaletteGroup[] {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) {
    return groups.filter((group) => !group.searchOnly && group.items.length > 0);
  }
  const tokens = normalizedQuery.split(" ").filter((token) => token.length > 0);
  return groups.flatMap((group) => {
    const items = group.items
      .flatMap((item, index) => {
        const rank = rankItem(item, normalizedQuery, tokens);
        return rank === null ? [] : [{ item, index, rank }];
      })
      .sort((left, right) => right.rank - left.rank || left.index - right.index)
      .map((entry) => entry.item);
    return items.length === 0 ? [] : [{ ...group, items }];
  });
}
