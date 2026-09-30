/**
 * AgentStore - the SQLite side of the agent service (tables in `002_AgentThreads.ts`).
 *
 * Plain reads and writes; the service decides when to call them and holds the thread's lock
 * while it does. Every failure is logged and surfaces as an `AgentError` with code `failed`.
 *
 * @module AgentStore
 */
import {
  AgentError,
  AgentTurn,
  ModelSelection,
  OrchestrationV2ProviderThread,
  OrchestrationV2RuntimeRequest,
  OrchestrationV2TurnItem,
  RuntimeMode,
  ThreadId,
  type RunId,
  type RuntimeRequestId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

// `toCodecJson` turns the `DateTimeUtc` fields into ISO strings, as on the wire.
const jsonColumn = <S extends Schema.Top>(schema: S) =>
  Schema.fromJsonString(Schema.toCodecJson(schema));
const ModelSelectionJson = jsonColumn(ModelSelection);
const ProviderThreadJson = jsonColumn(OrchestrationV2ProviderThread);
const TurnItemJson = jsonColumn(OrchestrationV2TurnItem);
const RuntimeRequestJson = jsonColumn(OrchestrationV2RuntimeRequest);

const ThreadRow = Schema.Struct({
  threadId: ThreadId,
  title: Schema.String,
  modelSelection: ModelSelectionJson,
  runtimeMode: RuntimeMode,
  preview: Schema.String,
  providerThread: Schema.NullOr(ProviderThreadJson),
  providerTurnOrdinal: Schema.Number,
  pendingRequestCount: Schema.Number,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type ThreadRecord = typeof ThreadRow.Type;

const decodeThreads = Schema.decodeUnknownEffect(Schema.Array(ThreadRow));
const decodeTurns = Schema.decodeUnknownEffect(Schema.Array(AgentTurn));
const decodeItems = Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ item: TurnItemJson })));
const decodeRequests = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ threadId: ThreadId, request: RuntimeRequestJson })),
);
const encodeModelSelection = Schema.encodeEffect(ModelSelectionJson);
const encodeProviderThread = Schema.encodeEffect(ProviderThreadJson);
const encodeItem = Schema.encodeEffect(TurnItemJson);
const encodeRequest = Schema.encodeEffect(RuntimeRequestJson);

const failedTo =
  (action: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, AgentError, R> =>
    effect.pipe(
      Effect.tapCause((cause) =>
        Effect.logError(`Agent store could not ${action}.`, Cause.pretty(cause)),
      ),
      Effect.mapError(() => new AgentError({ code: "failed", detail: `Could not ${action}.` })),
    );

export const makeAgentStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const threadColumns = sql`
    t.thread_id AS "threadId",
    t.title AS "title",
    t.model_selection_json AS "modelSelection",
    t.runtime_mode AS "runtimeMode",
    t.preview AS "preview",
    t.provider_thread_json AS "providerThread",
    t.provider_turn_ordinal AS "providerTurnOrdinal",
    (
      SELECT COUNT(*) FROM agent_runtime_requests r
      WHERE r.thread_id = t.thread_id AND r.status = 'pending'
    ) AS "pendingRequestCount",
    t.created_at AS "createdAt",
    t.updated_at AS "updatedAt"
  `;

  const turnColumns = sql`
    turn_id AS "turnId", ordinal, status, started_at AS "startedAt",
    completed_at AS "completedAt", error
  `;

  const insertThread = (input: {
    readonly threadId: ThreadId;
    readonly title: string;
    readonly modelSelection: ModelSelection;
    readonly runtimeMode: RuntimeMode;
    readonly now: string;
  }) =>
    Effect.gen(function* () {
      const modelSelection = yield* encodeModelSelection(input.modelSelection);
      yield* sql`
        INSERT INTO agent_threads (
          thread_id, title, model_selection_json, runtime_mode, preview, created_at, updated_at
        )
        VALUES (
          ${input.threadId}, ${input.title}, ${modelSelection}, ${input.runtimeMode}, '',
          ${input.now}, ${input.now}
        )
      `;
    }).pipe(failedTo("create the conversation"));

  const getThread = (threadId: ThreadId) =>
    sql`SELECT ${threadColumns} FROM agent_threads t WHERE t.thread_id = ${threadId}`.pipe(
      Effect.flatMap(decodeThreads),
      Effect.map((rows) => Option.fromNullishOr(rows[0])),
      failedTo("load the conversation"),
    );

  const listThreads = sql`
    SELECT ${threadColumns} FROM agent_threads t ORDER BY t.updated_at DESC, t.thread_id
  `.pipe(Effect.flatMap(decodeThreads), failedTo("load the conversations"));

  const updateThread = (input: {
    readonly threadId: ThreadId;
    readonly title?: string | undefined;
    readonly modelSelection?: ModelSelection | undefined;
    readonly runtimeMode?: RuntimeMode | undefined;
    readonly preview?: string | undefined;
    readonly updatedAt?: string | undefined;
  }) =>
    Effect.gen(function* () {
      const modelSelection =
        input.modelSelection === undefined
          ? null
          : yield* encodeModelSelection(input.modelSelection);
      yield* sql`
        UPDATE agent_threads SET
          title = COALESCE(${input.title ?? null}, title),
          model_selection_json = COALESCE(${modelSelection}, model_selection_json),
          runtime_mode = COALESCE(${input.runtimeMode ?? null}, runtime_mode),
          preview = COALESCE(${input.preview ?? null}, preview),
          updated_at = COALESCE(${input.updatedAt ?? null}, updated_at)
        WHERE thread_id = ${input.threadId}
      `;
    }).pipe(failedTo("save the conversation"));

  /** The provider's own conversation to resume, and the ordinal of its last provider turn. */
  const setProviderThread = (
    threadId: ThreadId,
    providerThread: OrchestrationV2ProviderThread | null,
    providerTurnOrdinal: number,
  ) =>
    Effect.gen(function* () {
      const json = providerThread === null ? null : yield* encodeProviderThread(providerThread);
      yield* sql`
        UPDATE agent_threads
        SET provider_thread_json = ${json}, provider_turn_ordinal = ${providerTurnOrdinal}
        WHERE thread_id = ${threadId}
      `;
    }).pipe(failedTo("save the provider conversation"));

  const recordProviderTurnOrdinal = (threadId: ThreadId, ordinal: number) =>
    sql`
      UPDATE agent_threads SET provider_turn_ordinal = MAX(provider_turn_ordinal, ${ordinal})
      WHERE thread_id = ${threadId}
    `.pipe(failedTo("save the provider conversation"));

  const deleteThread = (threadId: ThreadId) =>
    sql`DELETE FROM agent_threads WHERE thread_id = ${threadId}`.pipe(
      failedTo("delete the conversation"),
    );

  const insertTurn = (threadId: ThreadId, turn: AgentTurn) =>
    sql`
      INSERT INTO agent_turns (turn_id, thread_id, ordinal, status, started_at, completed_at, error)
      VALUES (
        ${turn.turnId}, ${threadId}, ${turn.ordinal}, ${turn.status}, ${turn.startedAt},
        ${turn.completedAt}, ${turn.error}
      )
    `.pipe(failedTo("save the turn"));

  const updateTurn = (turn: AgentTurn) =>
    sql`
      UPDATE agent_turns
      SET status = ${turn.status}, completed_at = ${turn.completedAt}, error = ${turn.error}
      WHERE turn_id = ${turn.turnId}
    `.pipe(failedTo("save the turn"));

  const listTurns = (threadId: ThreadId) =>
    sql`SELECT ${turnColumns} FROM agent_turns WHERE thread_id = ${threadId} ORDER BY ordinal`.pipe(
      Effect.flatMap(decodeTurns),
      failedTo("load the turns"),
    );

  const listRunningTurns = sql<{ readonly threadId: ThreadId; readonly turnId: RunId }>`
    SELECT thread_id AS "threadId", turn_id AS "turnId" FROM agent_turns WHERE status = 'running'
  `.pipe(failedTo("load the turns"));

  const lastTurnOrdinal = (threadId: ThreadId) =>
    sql<{ readonly ordinal: number | null }>`
      SELECT MAX(ordinal) AS ordinal FROM agent_turns WHERE thread_id = ${threadId}
    `.pipe(
      Effect.map((rows) => rows[0]?.ordinal ?? 0),
      failedTo("load the turns"),
    );

  const turnOrdinalOf = (turnId: RunId) =>
    sql<{ readonly ordinal: number }>`
      SELECT ordinal FROM agent_turns WHERE turn_id = ${turnId}
    `.pipe(
      Effect.map((rows) => Option.fromNullishOr(rows[0]?.ordinal)),
      failedTo("load the turns"),
    );

  const upsertItem = (turnOrdinal: number, item: OrchestrationV2TurnItem) =>
    Effect.gen(function* () {
      const json = yield* encodeItem(item);
      yield* sql`
        INSERT INTO agent_turn_items (thread_id, item_id, turn_ordinal, item_ordinal, item_json)
        VALUES (${item.threadId}, ${item.id}, ${turnOrdinal}, ${item.ordinal}, ${json})
        ON CONFLICT (thread_id, item_id) DO UPDATE SET
          item_ordinal = excluded.item_ordinal,
          item_json = excluded.item_json
      `;
    }).pipe(failedTo("save the conversation"));

  const listItems = (threadId: ThreadId, turnOrdinal?: number) =>
    sql`
      SELECT item_json AS item FROM agent_turn_items
      WHERE thread_id = ${threadId}
        ${turnOrdinal === undefined ? sql`` : sql`AND turn_ordinal = ${turnOrdinal}`}
      ORDER BY turn_ordinal, item_ordinal, seq
    `.pipe(
      Effect.flatMap(decodeItems),
      Effect.map((rows) => rows.map((row) => row.item)),
      failedTo("load the conversation"),
    );

  const maxItemOrdinal = (threadId: ThreadId, turnOrdinal: number) =>
    sql<{ readonly ordinal: number | null }>`
      SELECT MAX(item_ordinal) AS ordinal FROM agent_turn_items
      WHERE thread_id = ${threadId} AND turn_ordinal = ${turnOrdinal}
    `.pipe(
      Effect.map((rows) => rows[0]?.ordinal ?? 0),
      failedTo("load the conversation"),
    );

  const upsertRequest = (threadId: ThreadId, request: OrchestrationV2RuntimeRequest) =>
    Effect.gen(function* () {
      const json = yield* encodeRequest(request);
      yield* sql`
        INSERT INTO agent_runtime_requests (thread_id, request_id, status, request_json)
        VALUES (${threadId}, ${request.id}, ${request.status}, ${json})
        ON CONFLICT (thread_id, request_id) DO UPDATE SET
          status = excluded.status,
          request_json = excluded.request_json
      `;
    }).pipe(failedTo("save the request"));

  const getRequest = (threadId: ThreadId, requestId: RuntimeRequestId) =>
    sql`
      SELECT thread_id AS "threadId", request_json AS request FROM agent_runtime_requests
      WHERE thread_id = ${threadId} AND request_id = ${requestId}
    `.pipe(
      Effect.flatMap(decodeRequests),
      Effect.map((rows) => Option.fromNullishOr(rows[0]?.request)),
      failedTo("load the request"),
    );

  /** Pending requests of one thread, or of every thread. */
  const listPendingRequests = (threadId?: ThreadId) =>
    sql`
      SELECT thread_id AS "threadId", request_json AS request FROM agent_runtime_requests
      WHERE status = 'pending'
        ${threadId === undefined ? sql`` : sql`AND thread_id = ${threadId}`}
      ORDER BY rowid
    `.pipe(Effect.flatMap(decodeRequests), failedTo("load the requests"));

  return {
    insertThread,
    getThread,
    listThreads,
    updateThread,
    setProviderThread,
    recordProviderTurnOrdinal,
    deleteThread,
    insertTurn,
    updateTurn,
    listTurns,
    listRunningTurns,
    lastTurnOrdinal,
    turnOrdinalOf,
    upsertItem,
    listItems,
    maxItemOrdinal,
    upsertRequest,
    getRequest,
    listPendingRequests,
  };
});

export type AgentStore = Effect.Success<typeof makeAgentStore>;
