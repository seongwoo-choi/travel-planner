import { DatabaseSync } from "node:sqlite";

function openDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY,
      owner_id TEXT,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_plans_owner_updated
      ON plans(owner_id, updated_at DESC);
    PRAGMA user_version = 1;
  `);
  return db;
}

export function isSqlitePath(dbPath) {
  return /\.(?:sqlite|sqlite3|db)$/i.test(String(dbPath || ""));
}

export function readSqliteDb(dbPath) {
  const db = openDatabase(dbPath);
  try {
    const plans = db.prepare("SELECT payload FROM plans ORDER BY id").all()
      .map((row) => JSON.parse(row.payload));
    return { plans };
  } finally {
    db.close();
  }
}

export function writeSqliteDb(state, dbPath) {
  const db = openDatabase(dbPath);
  try {
    db.exec("BEGIN IMMEDIATE");
    const upsert = db.prepare(`
      INSERT INTO plans(id, owner_id, updated_at, payload)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        owner_id = excluded.owner_id,
        updated_at = excluded.updated_at,
        payload = excluded.payload
    `);
    const plans = Array.isArray(state?.plans) ? state.plans : [];
    for (const plan of plans) {
      upsert.run(
        plan.id,
        plan.discordUserId || null,
        plan.updatedAt || plan.createdAt || new Date(0).toISOString(),
        JSON.stringify(plan)
      );
    }
    if (plans.length === 0) {
      db.exec("DELETE FROM plans");
    } else {
      const placeholders = plans.map(() => "?").join(", ");
      db.prepare(`DELETE FROM plans WHERE id NOT IN (${placeholders})`).run(...plans.map((plan) => plan.id));
    }
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The transaction may not have started.
    }
    throw error;
  } finally {
    db.close();
  }
}
