import { Connection } from "@t3tools/client-runtime/connection";
import * as Layer from "effect/Layer";
import { Atom } from "effect/unstable/reactivity";

import { runtimeContextLayer } from "../lib/runtime";
import { backgroundActivityReporterLayer } from "../lib/backgroundActivityReporter";
import { connectionPlatformLayer } from "./platform";

const providedConnectionPlatformLayer = connectionPlatformLayer.pipe(
  Layer.provide(runtimeContextLayer),
);

type ConnectionLayerSource =
  | typeof Connection.layer
  | typeof runtimeContextLayer
  | typeof connectionPlatformLayer
  | typeof backgroundActivityReporterLayer;

const providedClientConnectionLayer = Connection.layerWithOptions({
  environmentThemes: true,
}).pipe(Layer.provideMerge(Layer.mergeAll(runtimeContextLayer, providedConnectionPlatformLayer)));

const connectionLayer = backgroundActivityReporterLayer.pipe(
  Layer.provideMerge(providedClientConnectionLayer),
);

export const connectionAtomRuntime: Atom.AtomRuntime<
  Layer.Success<ConnectionLayerSource>,
  Layer.Error<ConnectionLayerSource>
> = Atom.runtime(connectionLayer);
