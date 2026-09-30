import { type AgentTurnView, presentAgentTurns } from "@t3tools/client-runtime/agent-steps";
import type { AgentThreadDetail, AgentTurn, OrchestrationV2TurnItem } from "@t3tools/contracts";

interface CachedTurnView {
  readonly turn: AgentTurn;
  readonly items: ReadonlyArray<OrchestrationV2TurnItem>;
  readonly view: AgentTurnView;
}

export type TurnViewCache = ReadonlyMap<string, CachedTurnView>;

const EMPTY_ITEMS: ReadonlyArray<OrchestrationV2TurnItem> = [];

function sameItems(
  left: ReadonlyArray<OrchestrationV2TurnItem>,
  right: ReadonlyArray<OrchestrationV2TurnItem>,
) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

/**
 * Presents every turn, oldest first, reusing the previous view of each turn whose turn and
 * items did not change. Streaming text replaces one item at a time, so only the turn being
 * written gets a new view and memoized rows skip the rest.
 */
export function presentTurnsReusing(
  previous: TurnViewCache,
  detail: Pick<AgentThreadDetail, "turns" | "items">,
): { readonly views: ReadonlyArray<AgentTurnView>; readonly cache: TurnViewCache } {
  const itemsByTurn = new Map<string, OrchestrationV2TurnItem[]>();
  for (const item of detail.items) {
    if (item.runId === null) continue;
    const items = itemsByTurn.get(item.runId);
    if (items === undefined) itemsByTurn.set(item.runId, [item]);
    else items.push(item);
  }
  const cache = new Map<string, CachedTurnView>();
  const views = [...detail.turns]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((turn) => {
      const items = itemsByTurn.get(turn.turnId) ?? EMPTY_ITEMS;
      const cached = previous.get(turn.turnId);
      const view =
        cached !== undefined && cached.turn === turn && sameItems(cached.items, items)
          ? cached.view
          : presentAgentTurns({ turns: [turn], items })[0]!;
      cache.set(turn.turnId, { turn, items, view });
      return view;
    });
  return { views, cache };
}
