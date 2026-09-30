/**
 * Migration runner with an inline loader.
 *
 * All migrations are statically imported - no dynamic file system loading.
 * `runMigrations` is called by the SQLite persistence layer at startup, so the
 * schema is always up to date before the application starts.
 *
 * Add a migration by creating `Migrations/NNN_Name.ts` and appending it to
 * `migrationEntries`. Never renumber or edit a shipped migration.
 */

import * as Migrator from "effect/unstable/sql/Migrator";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import Migration0001 from "./Migrations/001_Baseline.ts";
import Migration0002 from "./Migrations/002_AgentThreads.ts";
import Migration0003 from "./Migrations/003_Notes.ts";

const migrationEntries = [
  [1, "Baseline", Migration0001],
  [2, "AgentThreads", Migration0002],
  [3, "Notes", Migration0003],
] as const;

const loader = Migrator.fromRecord(
  Object.fromEntries(migrationEntries.map(([id, name, migration]) => [`${id}_${name}`, migration])),
);

const run = Migrator.make({});

/**
 * Runs every pending migration and returns the `[id, name]` pairs it ran.
 * The migrator records applied migrations in `effect_sql_migrations`.
 */
export const runMigrations = Effect.fn("runMigrations")(function* () {
  const executedMigrations = yield* run({ loader });
  const migrations = executedMigrations.map(([id, name]) => `${id}_${name}`);
  yield* migrations.length === 0
    ? Effect.logDebug("Database schema is current")
    : Effect.log("Migrations ran successfully").pipe(Effect.annotateLogs({ migrations }));

  // The migrator keys on migration_id: a database that recorded a different
  // migration under a shared id (local or fork builds) keeps that id and
  // silently skips this build's migration at it. Surface the divergence so the
  // skipped schema change is diagnosable.
  const sql = yield* SqlClient.SqlClient;
  const recorded = yield* sql<{
    readonly migration_id: number;
    readonly name: string;
  }>`SELECT migration_id, name FROM effect_sql_migrations`;
  const manifestNames = new Map<number, string>(migrationEntries.map(([id, name]) => [id, name]));
  const divergent = recorded.flatMap((row) => {
    const expected = manifestNames.get(row.migration_id);
    if (expected === undefined) {
      return [`${row.migration_id}:${row.name} (unknown to this build)`];
    }
    return expected === row.name
      ? []
      : [`${row.migration_id}:${row.name} (this build: ${expected})`];
  });
  if (divergent.length > 0) {
    yield* Effect.logWarning(
      "Database migration history diverges from this build; recorded migration ids are skipped, not reconciled by name.",
    ).pipe(Effect.annotateLogs({ divergent }));
  }
  return executedMigrations;
});
