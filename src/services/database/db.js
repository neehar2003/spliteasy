// SQLite-in-the-browser data layer. sql.js compiles SQLite to WebAssembly so
// the entire relational database runs client-side with no server. The
// database's exported bytes are persisted to IndexedDB after every write and
// restored from there on startup, so data survives reloads without any
// backend. Data lives only in this browser and is not synced across devices.

import initSqlJs from 'sql.js';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';
import { saveSnapshot, loadSnapshot, clearSnapshot } from './idbStore';

let sqlPromise = null;
let db = null;
let revision = 0;
let saveChain = Promise.resolve(); // serializes persistence writes

function getSqlJs() {
  if (!sqlPromise) {
    // Under Vitest (Node), let sql.js resolve its own wasm file from node_modules
    // via the filesystem; in the browser, serve it from the deployed base path.
    const isTest = import.meta.env?.MODE === 'test';
    // Resolve against document.baseURI (not a relative BASE_URL string) so the
    // wasm request lands on the deployed page's actual path even when the
    // requesting JS chunk itself lives under /assets/.
    sqlPromise = initSqlJs(
      isTest ? {} : { locateFile: (file) => new URL(file, document.baseURI).href }
    );
  }
  return sqlPromise;
}

export class DatabaseError extends Error {}

/** Initialize the database: restore from IndexedDB if present, else create fresh. */
export async function initDatabase() {
  const SQL = await getSqlJs();

  try {
    const snapshot = await loadSnapshot();
    if (snapshot?.bytes) {
      db = new SQL.Database(new Uint8Array(snapshot.bytes));
      revision = snapshot.revision || 0;
      migrateIfNeeded();
      return { restored: true };
    }
  } catch (err) {
    throw new DatabaseError(`Failed to restore saved data: ${err.message}`);
  }

  db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  db.run(SCHEMA_SQL);
  db.run('INSERT INTO schema_meta (key, value) VALUES (?, ?)', ['schema_version', String(SCHEMA_VERSION)]);
  return { restored: false };
}

function migrateIfNeeded() {
  db.run('PRAGMA foreign_keys = ON');
  // Ensure all tables/indexes exist even on an older snapshot (idempotent DDL).
  db.run(SCHEMA_SQL);
  const result = db.exec("SELECT value FROM schema_meta WHERE key = 'schema_version'");
  const currentVersion = result[0]?.values?.[0]?.[0];
  if (!currentVersion) {
    db.run('INSERT INTO schema_meta (key, value) VALUES (?, ?)', ['schema_version', String(SCHEMA_VERSION)]);
  }
  // Future schema migrations would branch on currentVersion here.
}

function assertReady() {
  if (!db) throw new DatabaseError('Database has not been initialized yet.');
}

/** Run a statement with no result rows expected (INSERT/UPDATE/DELETE/DDL). */
export function run(sql, params = []) {
  assertReady();
  db.run(sql, params);
}

/** Run a SELECT and return an array of plain row objects. */
export function query(sql, params = []) {
  assertReady();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/** Run several statements as a single transaction; rolls back on error. */
export function transaction(fn) {
  assertReady();
  db.run('BEGIN');
  try {
    fn();
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw new DatabaseError(`Transaction failed and was rolled back: ${err.message}`);
  }
}

/** Export current DB bytes and persist them to IndexedDB (debounced/serialized). */
export function persist() {
  assertReady();
  const bytes = db.export();
  revision += 1;
  const thisRevision = revision;
  // Chain onto the previous save so writes are applied in order, and an
  // older in-flight save can never clobber a newer one.
  saveChain = saveChain
    .then(() => saveSnapshot(bytes, thisRevision))
    .catch((err) => {
      console.error('Failed to persist database to IndexedDB:', err);
      throw new DatabaseError(`Could not save your changes locally: ${err.message}`);
    });
  return saveChain;
}

/** Export the raw database bytes (used for backup/export). */
export function exportBytes() {
  assertReady();
  return db.export();
}

/** Replace the entire database with the given bytes (used by import/restore). */
export async function replaceDatabase(bytes) {
  const SQL = await getSqlJs();
  const newDb = new SQL.Database(new Uint8Array(bytes));
  // Validate it actually has our schema before committing to it.
  const check = newDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='groups'");
  if (!check.length) {
    newDb.close();
    throw new DatabaseError('That file does not look like a valid SplitEasy backup.');
  }
  db?.close();
  db = newDb;
  await persist();
}

/** Wipe all data and start over with a fresh schema. */
export async function resetDatabase() {
  db?.close();
  await clearSnapshot();
  db = null;
  revision = 0;
  await initDatabase();
  await persist();
}

export function generateId() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}
