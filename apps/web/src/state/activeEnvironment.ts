import { useAtomValue } from "@effect/atom-react";
import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import type { EnvironmentId } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import { environmentCatalog } from "../connection/catalog";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { primaryEnvironmentIdAtom } from "./primaryEnvironment";

const chosenEnvironmentIdAtom = Atom.make<EnvironmentId | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("web-chosen-environment-id"),
);

/**
 * The environment whose data the app shows: the one the user picked while it is still enabled,
 * else the primary (local) environment, else the first enabled saved one.
 */
const activeEnvironmentIdAtom = Atom.make((get): EnvironmentId | null => {
  const enabled = [...enabledEnvironmentIds(get(environmentCatalog.catalogValueAtom))];
  const chosen = get(chosenEnvironmentIdAtom);
  if (chosen !== null && enabled.includes(chosen)) return chosen;
  const primary = get(primaryEnvironmentIdAtom);
  if (primary !== null && enabled.includes(primary)) return primary;
  return enabled[0] ?? null;
}).pipe(Atom.withLabel("web-active-environment-id"));

export function useActiveEnvironmentId(): EnvironmentId | null {
  return useAtomValue(activeEnvironmentIdAtom);
}

export function readActiveEnvironmentId(): EnvironmentId | null {
  return appAtomRegistry.get(activeEnvironmentIdAtom);
}

export function setActiveEnvironmentId(environmentId: EnvironmentId | null): void {
  appAtomRegistry.set(chosenEnvironmentIdAtom, environmentId);
}
