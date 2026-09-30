import * as Effect from "effect/Effect";

import { runtime } from "../lib/runtime";
import * as MobilePreferences from "./mobile-preferences";

export type { Preferences } from "./mobile-preferences";
export { MobilePreferencesLoadError, MobilePreferencesSaveError } from "./mobile-preferences";

const runPreferences = <A, E>(
  use: (store: MobilePreferences.MobilePreferencesStore["Service"]) => Effect.Effect<A, E>,
) => runtime.runPromise(MobilePreferences.MobilePreferencesStore.pipe(Effect.flatMap(use)));

export const loadPreferences = () => runPreferences((store) => store.load);
export const savePreferencesPatch = (patch: Partial<MobilePreferences.Preferences>) =>
  runPreferences((store) => store.savePatch(patch));
export const updatePreferences = (
  transform: (current: MobilePreferences.Preferences) => Partial<MobilePreferences.Preferences>,
) => runPreferences((store) => store.update(transform));
