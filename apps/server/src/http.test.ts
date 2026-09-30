import { expect, it } from "@effect/vitest";
import { describe } from "vite-plus/test";
import * as NodeHttpPlatform from "@effect/platform-node/NodeHttpPlatform";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import {
  HttpClient,
  HttpClientRequest,
  HttpRouter,
  HttpServerResponse,
} from "effect/unstable/http";

import { ORCHESTRATION_PROTOCOL_HEADER } from "@t3tools/contracts";

import * as ServerConfig from "./config.ts";

import {
  browserApiCorsLayer,
  httpCompressionLayer,
  isLoopbackHostname,
  resolveDevRedirectUrl,
  staticAndDevRouteLayer,
} from "./http.ts";

describe("browser API CORS", () => {
  it("accepts protocol negotiation with authenticated browser headers", async () => {
    const routeLayer = Layer.effectDiscard(
      Effect.gen(function* () {
        const router = yield* HttpRouter.HttpRouter;
        yield* router.add("GET", "/api/environment", HttpServerResponse.empty());
      }),
    );
    const appLayer = Layer.merge(routeLayer, browserApiCorsLayer).pipe(
      Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "http-cors-test-" })),
      Layer.provide(NodeServices.layer),
    );
    const { handler, dispose } = HttpRouter.toWebHandler(appLayer, { disableLogger: true });

    try {
      const response = await handler(
        new Request("https://backend.example/api/environment", {
          method: "OPTIONS",
          headers: {
            origin: "https://app.example.test",
            "access-control-request-method": "GET",
            "access-control-request-headers": [
              ORCHESTRATION_PROTOCOL_HEADER,
              "authorization",
              "dpop",
            ].join(", "),
          },
        }),
      );

      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      const allowedHeaders = new Set(
        (response.headers.get("access-control-allow-headers") ?? "")
          .split(",")
          .map((header) => header.trim().toLowerCase()),
      );
      expect(allowedHeaders.has(ORCHESTRATION_PROTOCOL_HEADER)).toBe(true);
      expect(allowedHeaders.has("authorization")).toBe(true);
      expect(allowedHeaders.has("dpop")).toBe(true);
    } finally {
      await dispose();
    }
  });
});

const makeStaticRequest = Effect.fn("HttpTest.makeStaticRequest")(function* (staticDir: string) {
  const config = yield* ServerConfig.ServerConfig;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const appLayer = Layer.merge(staticAndDevRouteLayer, httpCompressionLayer).pipe(
    Layer.provideMerge(ServerConfig.layer({ ...config, staticDir })),
    Layer.provideMerge(NodeHttpPlatform.layer),
    Layer.provideMerge(Layer.succeed(FileSystem.FileSystem, fileSystem)),
    Layer.provideMerge(Layer.succeed(Path.Path, path)),
  );
  const services = yield* Layer.build(
    HttpRouter.serve(appLayer, { disableListenLog: true }).pipe(
      Layer.provideMerge(NodeHttpServer.layerTest),
    ),
  );
  const client = Context.get(services, HttpClient.HttpClient);
  return (resource: string, options?: HttpClientRequest.Options) =>
    client.execute(HttpClientRequest.make(options?.method ?? "GET")(resource, options));
});

it.layer(
  ServerConfig.layerTest(process.cwd(), { prefix: "t3-static-http-test-" }).pipe(
    Layer.provideMerge(NodeServices.layer),
  ),
)("static HTTP responses", (it) => {
  it.effect("revalidates non-HTML files and returns changed contents", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const staticDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-static-cache-" });
      const assetPath = path.join(staticDir, "app.js");
      yield* fs.writeFileString(assetPath, 'export const build = "first";');
      const request = yield* makeStaticRequest(staticDir);

      const initial = yield* request("/app.js");
      expect(initial.status).toBe(200);
      expect(yield* initial.text).toContain("first");
      const etag = initial.headers["etag"]!;
      const lastModified = initial.headers["last-modified"]!;
      expect(etag).toBeTruthy();
      expect(lastModified).toBeTruthy();
      for (const headers of [
        { "if-none-match": etag },
        { "if-none-match": etag.replace(/^W\//, "") },
        { "if-none-match": `"other", ${etag}` },
        { "if-none-match": "*" },
        { "if-modified-since": lastModified },
      ]) {
        const response = yield* request("/app.js", { headers });
        expect(response.status).toBe(304);
        expect(response.headers["etag"]).toBe(etag);
        expect(response.headers["cache-control"]).toBe("no-cache");
        expect(yield* response.text).toBe("");
      }
      const mismatched = yield* request("/app.js", {
        headers: { "if-none-match": '"another-build"', "if-modified-since": lastModified },
      });
      expect(mismatched.status).toBe(200);
      expect(yield* mismatched.text).toContain("first");

      yield* fs.writeFileString(assetPath, 'export const build = "the next build";');
      const changed = yield* request("/app.js", { headers: { "if-none-match": etag } });
      expect(changed.status).toBe(200);
      expect(changed.headers["etag"]).not.toBe(etag);
      expect(yield* changed.text).toContain("next build");
    }),
  );

  it.effect("serves changed HTML when deployments preserve its size and timestamp", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const staticDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-static-html-" });
      const indexPath = path.join(staticDir, "index.html");
      const modifiedAt = DateTime.toDateUtc(DateTime.makeUnsafe("1985-10-26T08:15:00.000Z"));
      yield* fs.writeFileString(indexPath, "<html>old build</html>");
      yield* fs.utimes(indexPath, modifiedAt, modifiedAt);
      const request = yield* makeStaticRequest(staticDir);
      const initial = yield* request("/");
      expect(yield* initial.text).toBe("<html>old build</html>");
      const previousEtag = initial.headers["etag"] ?? '"previous-html"';
      const nextHtml = "<html>new build</html>";
      yield* fs.writeFileString(indexPath, nextHtml);
      yield* fs.utimes(indexPath, modifiedAt, modifiedAt);

      for (const [resource, headers] of [
        ["/", { "if-none-match": previousEtag }],
        ["/threads/example", { "if-modified-since": modifiedAt.toUTCString() }],
        ["/", { "if-none-match": "*" }],
      ] as const) {
        const response = yield* request(resource, { headers });
        expect(response.status).toBe(200);
        expect(yield* response.text).toBe(nextHtml);
        expect(response.headers["cache-control"]).toBe("no-cache");
        expect(response.headers["etag"]).toBeUndefined();
        expect(response.headers["last-modified"]).toBeUndefined();
      }
      const head = yield* request("/", {
        method: "HEAD",
        headers: { "if-none-match": previousEtag, "accept-encoding": "identity" },
      });
      expect(head.status).toBe(200);
      expect(head.headers["content-length"]).toBe(String(Buffer.byteLength(nextHtml)));
      expect(yield* head.text).toBe("");
    }),
  );

  it.effect("closes static descriptors after GET, HEAD, 304, and request cancellation", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const staticDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-static-close-" });
      const filePath = path.join(staticDir, "app.txt");
      const body = "file content\n".repeat(1024);
      yield* fs.writeFileString(filePath, body);
      const closed = yield* Queue.unbounded<FileSystem.File>();
      const blocked = yield* Deferred.make<void>();
      const active = new Set<FileSystem.File>();
      let blockAfterOpen = false;
      let bodyReads = 0;
      const trackedFileSystem = FileSystem.FileSystem.of({
        ...fs,
        open: (candidate, options) =>
          Effect.gen(function* () {
            if (candidate !== filePath) return yield* fs.open(candidate, options);
            let opened: FileSystem.File | undefined;
            yield* Effect.addFinalizer(() =>
              Effect.gen(function* () {
                if (opened === undefined) return;
                active.delete(opened);
                yield* Queue.offer(closed, opened);
              }),
            );
            const file = yield* fs.open(candidate, options);
            opened = file;
            active.add(file);
            if (blockAfterOpen) {
              yield* Deferred.succeed(blocked, undefined);
              return yield* Effect.never;
            }
            return new Proxy(file, {
              get(target, key) {
                if (key === "readAlloc") {
                  return (size: number) => {
                    bodyReads += 1;
                    return target.readAlloc(size);
                  };
                }
                return Reflect.get(target, key, target);
              },
            });
          }),
      });
      const request = yield* makeStaticRequest(staticDir).pipe(
        Effect.provideService(FileSystem.FileSystem, trackedFileSystem),
      );

      const get = yield* request("/app.txt");
      expect(yield* get.text).toBe(body);
      yield* Queue.take(closed);
      expect(active.size).toBe(0);
      expect(bodyReads).toBeGreaterThan(0);
      const readsAfterGet = bodyReads;
      const head = yield* request("/app.txt", {
        method: "HEAD",
        headers: { "accept-encoding": "gzip" },
      });
      expect(head.status).toBe(200);
      expect(head.headers["content-encoding"]).toBe("gzip");
      expect(yield* head.text).toBe("");
      yield* Queue.take(closed);
      expect(active.size).toBe(0);
      expect(bodyReads).toBe(readsAfterGet);
      const unchanged = yield* request("/app.txt", {
        headers: { "if-none-match": get.headers["etag"]! },
      });
      expect(unchanged.status).toBe(304);
      yield* Queue.take(closed);
      expect(active.size).toBe(0);
      expect(bodyReads).toBe(readsAfterGet);

      blockAfterOpen = true;
      const cancelled = yield* request("/app.txt").pipe(Effect.forkChild);
      yield* Deferred.await(blocked);
      expect(active.size).toBe(1);
      yield* Fiber.interrupt(cancelled);
      yield* Queue.take(closed);
      expect(active.size).toBe(0);
    }),
  );
});

describe("http dev routing", () => {
  it("treats localhost and loopback addresses as local", () => {
    expect(isLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isLoopbackHostname("localhost")).toBe(true);
    expect(isLoopbackHostname("::1")).toBe(true);
    expect(isLoopbackHostname("[::1]")).toBe(true);
  });

  it("does not treat LAN addresses as local", () => {
    expect(isLoopbackHostname("192.168.86.35")).toBe(false);
    expect(isLoopbackHostname("10.0.0.24")).toBe(false);
    expect(isLoopbackHostname("example.local")).toBe(false);
  });

  it("preserves path and query when redirecting to the dev server", () => {
    const devUrl = new URL("http://127.0.0.1:5173/");
    const requestUrl = new URL("http://127.0.0.1:3774/pair?token=test-token");

    expect(resolveDevRedirectUrl(devUrl, requestUrl)).toBe(
      "http://127.0.0.1:5173/pair?token=test-token",
    );
  });
});
