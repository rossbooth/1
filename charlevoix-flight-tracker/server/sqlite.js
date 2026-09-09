// Picks a SQLite driver at runtime.
//
// better-sqlite3 is the faster, more mature option, but it is a native module:
// on a Node release too new for its prebuilt binaries it tries to compile from
// source, which needs Xcode or build-essential installed. That is a poor thing
// to demand of someone who just wants to watch aeroplanes, so when it is not
// available we fall back to the SQLite built into Node itself (Node 22.5+).
//
// Set SQLITE_DRIVER=node or SQLITE_DRIVER=better to force one.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function tryRequire(name) {
  try {
    return require(name);
  } catch {
    return null;
  }
}

/** node:sqlite is experimental, and says so loudly on every start. */
function silenceSqliteExperimentalWarning() {
  const printed = process.listeners('warning');
  process.removeAllListeners('warning');
  process.on('warning', (warning) => {
    if (warning.name === 'ExperimentalWarning' && /SQLite/i.test(warning.message)) return;
    for (const listener of printed) listener(warning);
  });
}

/**
 * Wraps node:sqlite in the small slice of the better-sqlite3 API this app uses,
 * so the rest of the code does not care which driver it got.
 */
class NodeSqliteDatabase {
  constructor(DatabaseSync, filename) {
    this.db = new DatabaseSync(filename);
  }

  exec(sql) {
    this.db.exec(sql);
  }

  prepare(sql) {
    return this.db.prepare(sql);
  }

  pragma(statement) {
    this.db.exec(`PRAGMA ${statement}`);
  }

  /** better-sqlite3 style: returns a function that runs fn inside a transaction. */
  transaction(fn) {
    return (...args) => {
      this.db.exec('BEGIN');
      try {
        const result = fn(...args);
        this.db.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          // The rollback failing must not mask the original error.
        }
        throw err;
      }
    };
  }

  close() {
    this.db.close();
  }
}

let chosen = null;

/** Which driver is in use, for the startup banner. */
export function driverName() {
  return chosen;
}

export function createDatabase(filename) {
  const forced = process.env.SQLITE_DRIVER;

  if (forced !== 'node') {
    const BetterSqlite3 = tryRequire('better-sqlite3');
    if (BetterSqlite3) {
      chosen = 'better-sqlite3';
      return new BetterSqlite3(filename);
    }
    if (forced === 'better') throw new Error('better-sqlite3 was requested but is not installed');
  }

  const nodeSqlite = tryRequire('node:sqlite');
  if (nodeSqlite?.DatabaseSync) {
    silenceSqliteExperimentalWarning();
    chosen = 'node:sqlite';
    return new NodeSqliteDatabase(nodeSqlite.DatabaseSync, filename);
  }

  throw new Error(
    'No SQLite available. Either install the dependencies (npm install) or use Node 22.5 or newer.',
  );
}
