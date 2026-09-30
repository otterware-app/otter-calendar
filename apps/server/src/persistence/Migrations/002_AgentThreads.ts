import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * The in-app agent's conversations. Items and runtime requests keep the provider layer's encoded
 * JSON; `provider_thread_json` and `provider_turn_ordinal` are what the next session needs to
 * resume the provider's own conversation.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE agent_threads (
      thread_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model_selection_json TEXT NOT NULL,
      runtime_mode TEXT NOT NULL,
      preview TEXT NOT NULL,
      provider_thread_json TEXT,
      provider_turn_ordinal INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE agent_turns (
      turn_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES agent_threads(thread_id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      error TEXT,
      UNIQUE (thread_id, ordinal)
    )
  `;

  yield* sql`CREATE INDEX idx_agent_turns_status ON agent_turns(status)`;

  // `seq` keeps first-insert order for items that share an ordinal (a steer lands between them).
  yield* sql`
    CREATE TABLE agent_turn_items (
      seq INTEGER PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES agent_threads(thread_id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      turn_ordinal INTEGER NOT NULL,
      item_ordinal INTEGER NOT NULL,
      item_json TEXT NOT NULL,
      UNIQUE (thread_id, item_id)
    )
  `;

  yield* sql`
    CREATE INDEX idx_agent_turn_items_order
    ON agent_turn_items(thread_id, turn_ordinal, item_ordinal, seq)
  `;

  yield* sql`
    CREATE TABLE agent_runtime_requests (
      thread_id TEXT NOT NULL REFERENCES agent_threads(thread_id) ON DELETE CASCADE,
      request_id TEXT NOT NULL,
      status TEXT NOT NULL,
      request_json TEXT NOT NULL,
      PRIMARY KEY (thread_id, request_id)
    )
  `;

  yield* sql`CREATE INDEX idx_agent_runtime_requests_status ON agent_runtime_requests(status)`;
});
