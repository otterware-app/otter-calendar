import { describe, expect, it } from "vite-plus/test";

import { filterCommandPaletteGroups, type CommandPaletteGroup } from "./CommandPalette.logic";

const action = (value: string, ...searchTerms: string[]) => ({
  kind: "action" as const,
  value,
  searchTerms,
  title: searchTerms[0],
  icon: null,
  run: () => undefined,
});

const groups: CommandPaletteGroup[] = [
  { value: "actions", label: "Actions", items: [action("new-note", "New note", "create")] },
  {
    value: "notes",
    label: "Notes",
    searchOnly: true,
    items: [action("n1", "Groceries", "milk eggs"), action("n2", "Notes on eggs", "")],
  },
];

describe("filterCommandPaletteGroups", () => {
  it("hides search-only groups until the user types", () => {
    expect(filterCommandPaletteGroups(groups, "").map((group) => group.value)).toEqual(["actions"]);
  });

  it("matches every token and ranks earlier search terms first", () => {
    const [notes] = filterCommandPaletteGroups(groups, "eggs");
    expect(notes?.items.map((item) => item.value)).toEqual(["n2", "n1"]);
    expect(filterCommandPaletteGroups(groups, "new create")[0]?.items[0]?.value).toBe("new-note");
    expect(filterCommandPaletteGroups(groups, "nothing matches")).toEqual([]);
  });
});
