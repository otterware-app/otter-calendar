import * as NodeModule from "node:module";
import * as NodeURL from "node:url";
import * as NodeCrypto from "node:crypto";
import * as NodeAssert from "node:assert/strict";

const root = process.argv[2];
const count = Number(process.argv[3] ?? 4);
const bytes = Number(process.argv[4] ?? 32768);
const require = NodeModule.createRequire(root + "/apps/server/package.json");
const load = (name) => import(NodeURL.pathToFileURL(require.resolve("effect/" + name)));
const [Effect, Stream, Deferred, Fiber] = await Promise.all(
  ["Effect", "Stream", "Deferred", "Fiber"].map(load),
);
const app = (file) => import(NodeURL.pathToFileURL(root + "/apps/server/src/" + file + ".ts"));
const Prefix = await app("rpcInitialItems");
const refs = [];
const fibers = [];
const checkpoints = [];
const deliveredCounts = [];

function history() {
  const value = JSON.parse(JSON.stringify({ text: NodeCrypto.randomBytes(bytes).toString("hex") }));
  refs.push(new WeakRef(value));
  return value;
}

function start(ready) {
  const index = deliveredCounts.push(0) - 1;
  const live = Stream.fromEffect(Deferred.succeed(ready, undefined)).pipe(
    Stream.drain,
    Stream.concat(Stream.never),
  );
  const stream = Effect.succeed(Stream.concat(Prefix.rpcInitialItems([history()]), live));
  let delivered = 0;
  return stream.pipe(
    Effect.flatMap((stream) =>
      stream.pipe(
        Stream.runForEach((item) =>
          Effect.sync(() => {
            NodeAssert.equal(item.text.length, bytes * 2);
            delivered++;
            deliveredCounts[index] = delivered;
          }),
        ),
        Effect.forkDetach,
      ),
    ),
  );
}

const result = await Effect.runPromise(
  Effect.gen(function* () {
    for (let i = 0; i < count; i++) {
      const ready = yield* Deferred.make();
      fibers.push(yield* start(ready));
      yield* Deferred.await(ready);
      NodeAssert.equal(deliveredCounts[i], 1);
      if (i === Math.floor(count / 2) - 1 || i === count - 1) {
        yield* Effect.promise(async () => {
          for (let j = 0; j < 3; j++) {
            await new Promise(setImmediate);
            global.gc();
          }
          checkpoints.push({
            subscriptions: fibers.length,
            retained: refs.filter((ref) => ref.deref()).length,
            payloadMiB: ((i + 1) * bytes * 2) / 1048576,
            heapMiB: Math.round(process.memoryUsage().heapUsed / 1048576),
          });
        });
      }
    }
    for (const fiber of fibers) yield* Fiber.interrupt(fiber);
    return { checkpoints };
  }),
);
console.log(JSON.stringify(result));
