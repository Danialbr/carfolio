/**
 * Persistence hooks, kept in their own module so nothing that merely wants to
 * save can drag a database driver in with it.
 *
 * On native these are no-ops: expo-sqlite has already written to the file by
 * the time a transaction returns. The web build replaces this file wholesale
 * (persist.web.ts) with the calls that move the in-memory database into
 * storage.
 *
 * The split matters for more than tidiness: state/store.ts calls persist() on
 * every write, and the node test project imports that store. Importing the
 * native client here would pull react-native into a plain-node test run.
 */

/** Schedules a save. No-op on native. */
export function persist(): void {}

/** Saves immediately. No-op on native. */
export function flush(): void {}
