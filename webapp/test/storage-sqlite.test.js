import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  createPlan,
  getPlanForDiscordUser,
  listPlans,
  migrateJsonPlansToSqlite,
} from "../src/storage.js";

test("SQLite storage persists plans transactionally with an owner index", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "travel-planner-sqlite-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const dbPath = path.join(directory, "plans.sqlite");

  const created = await createPlan({
    destination: "부산",
    startDate: "2026-08-01",
    nights: 1,
    discordUserId: "owner-a",
  }, { plan: "sqlite plan", model: "fixture", prompt: null }, dbPath);

  assert.equal((await getPlanForDiscordUser(created.id, "owner-a", dbPath)).id, created.id);
  assert.equal((await listPlans(10, dbPath)).length, 1);

  const db = new DatabaseSync(dbPath, { readOnly: true });
  t.after(() => db.close());
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'plans'").get();
  const ownerIndex = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_plans_owner_updated'").get();
  const row = db.prepare("SELECT id, owner_id FROM plans").get();

  assert.equal(table.name, "plans");
  assert.equal(ownerIndex.name, "idx_plans_owner_updated");
  assert.equal(row.id, created.id);
  assert.equal(row.owner_id, "owner-a");
});

test("JSON to SQLite migration preserves the source and refuses a non-empty target", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "travel-planner-sqlite-migrate-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const jsonPath = path.join(directory, "plans.json");
  const sqlitePath = path.join(directory, "plans.sqlite");
  const created = await createPlan({
    destination: "서울",
    startDate: "2026-08-01",
    nights: 1,
    discordUserId: "owner-a",
  }, { plan: "legacy", model: "fixture", prompt: null }, jsonPath);
  const sourceBefore = await fs.readFile(jsonPath, "utf8");

  const migrated = await migrateJsonPlansToSqlite(jsonPath, sqlitePath);

  assert.equal(migrated.planCount, 1);
  assert.equal((await getPlanForDiscordUser(created.id, "owner-a", sqlitePath)).id, created.id);
  assert.equal(await fs.readFile(jsonPath, "utf8"), sourceBefore);
  await assert.rejects(migrateJsonPlansToSqlite(jsonPath, sqlitePath), /target is not empty/);
});
