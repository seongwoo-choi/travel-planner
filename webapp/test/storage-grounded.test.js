import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { createPlan, getPlan, getPlanForDiscordUser, listPlans } from "../src/storage.js";

function runWorker(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", script], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`storage worker exited ${code}: ${stderr}`));
    });
  });
}

test("createPlan preserves grounded itinerary and evidence on the revision", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "travel-planner-storage-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const dbPath = path.join(directory, "plans.json");
  const generation = {
    model: "grounded-planner-v1",
    prompt: null,
    plan: "# Grounded plan",
    status: "ready",
    groundedPlan: { days: [{ date: "2026-08-01", activities: [] }] },
    evidence: { weather: { source: "open-meteo", fetchedAt: "2026-07-28T10:00:00Z" } },
    planningConstraints: [{ type: "move", placeId: "museum", targetDate: "2026-08-02" }],
  };

  const created = await createPlan({
    destination: "부산",
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    nights: 1,
  }, generation, dbPath);
  const stored = await getPlan(created.id, dbPath);
  const revision = stored.revisions[0];

  assert.equal(revision.generationStatus, "ready");
  assert.deepEqual(revision.groundedPlan, generation.groundedPlan);
  assert.deepEqual(revision.evidence, generation.evidence);
  assert.deepEqual(revision.planningConstraints, generation.planningConstraints);
});

test("refinePlan rejects an ungrounded revision after a grounded plan", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "travel-planner-storage-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const dbPath = path.join(directory, "plans.json");
  const plan = await createPlan({ destination: "부산", startDate: "2026-08-01", nights: 1 }, {
    plan: "grounded",
    model: "grounded-planner-v1",
    prompt: null,
    groundedPlan: { days: [] },
    evidence: { places: {}, weather: {}, travel: {} },
  }, dbPath);
  const { refinePlan } = await import("../src/storage.js");

  await assert.rejects(
    refinePlan(plan.id, { plan: "llm text", model: "mock", prompt: null }, "change", dbPath),
    /grounded refinement/
  );
});

test("refinePlan rejects a stale grounded revision", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "travel-planner-storage-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const dbPath = path.join(directory, "plans.json");
  const plan = await createPlan({ destination: "부산", startDate: "2026-08-01", nights: 1 }, {
    plan: "grounded",
    model: "grounded-planner-v1",
    prompt: null,
    groundedPlan: { days: [] },
    evidence: { places: {}, weather: {}, travel: {} },
  }, dbPath);
  const { refinePlan } = await import("../src/storage.js");

  await assert.rejects(
    refinePlan(plan.id, {
      plan: "stale",
      model: "grounded-planner-v1",
      prompt: null,
      groundedPlan: { days: [] },
      evidence: { places: {}, weather: {}, travel: {} },
    }, "stale", dbPath, { expectedVersion: 0 }),
    /version conflict/
  );
});

test("createPlan persists a same-day trip without converting it to one night", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "travel-planner-storage-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const created = await createPlan({
    destination: "부산",
    startDate: "2026-08-01",
    nights: 0,
  }, { plan: "same day", model: "grounded-planner-v1", prompt: null }, path.join(directory, "plans.json"));

  assert.equal(created.nights, 0);
  assert.equal(created.endDate, "2026-08-01");
});

test("createPlan preserves accommodation base and arrival/departure windows", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "travel-planner-storage-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const dbPath = path.join(directory, "plans.json");

  const stored = await createPlan({
    destination: "부산",
    startDate: "2026-08-01",
    nights: 2,
    baseLocation: "광안리 숙소",
    arrivalTime: "13:30",
    departureTime: "17:10",
  }, { plan: "grounded", model: "fixture", prompt: null }, dbPath);

  assert.equal(stored.baseLocation, "광안리 숙소");
  assert.equal(stored.arrivalTime, "13:30");
  assert.equal(stored.departureTime, "17:10");
  assert.equal(stored.revisions[0].input.baseLocation, "광안리 숙소");
});

test("getPlanForDiscordUser fails closed for another user and ownerless plans", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "travel-planner-storage-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const dbPath = path.join(directory, "plans.json");
  const owned = await createPlan({
    destination: "부산",
    startDate: "2026-08-01",
    nights: 1,
    discordUserId: "owner-a",
  }, { plan: "owned", model: "fixture", prompt: null }, dbPath);
  const ownerless = await createPlan({
    destination: "서울",
    startDate: "2026-08-01",
    nights: 1,
  }, { plan: "ownerless", model: "fixture", prompt: null }, dbPath);

  assert.equal((await getPlanForDiscordUser(owned.id, "owner-a", dbPath)).id, owned.id);
  assert.equal(await getPlanForDiscordUser(owned.id, "owner-b", dbPath), null);
  assert.equal(await getPlanForDiscordUser(ownerless.id, "owner-a", dbPath), null);
});

test("createPlan rejects an unsupported planning horizon", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "travel-planner-storage-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await assert.rejects(
    createPlan({ destination: "부산", startDate: "2026-08-01", nights: 31 }, {
      plan: "too long",
      model: "grounded-planner-v1",
      prompt: null,
    }, path.join(directory, "plans.json")),
    /between 0 and 30/
  );
});

test("concurrent plan creation does not lose plans or reuse ids", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "travel-planner-storage-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const dbPath = path.join(directory, "plans.json");
  const created = await Promise.all(Array.from({ length: 10 }, (_, index) => createPlan({
    destination: `destination-${index}`,
    startDate: "2026-08-01",
    nights: 1,
  }, { plan: `plan-${index}`, model: "grounded-planner-v1", prompt: null }, dbPath)));

  assert.equal(new Set(created.map((plan) => plan.id)).size, 10);
  assert.equal((await listPlans(20, dbPath)).length, 10);
});

test("concurrent refine and create operations preserve both mutations", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "travel-planner-storage-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const dbPath = path.join(directory, "plans.json");
  const original = await createPlan({ destination: "부산", startDate: "2026-08-01", nights: 1 }, {
    plan: "v1", model: "grounded-planner-v1", prompt: null,
  }, dbPath);
  const { refinePlan } = await import("../src/storage.js");

  await Promise.all([
    refinePlan(original.id, { plan: "v2", model: "grounded-planner-v1", prompt: null }, "replan", dbPath),
    createPlan({ destination: "서울", startDate: "2026-08-01", nights: 1 }, {
      plan: "new", model: "grounded-planner-v1", prompt: null,
    }, dbPath),
  ]);

  assert.equal((await listPlans(20, dbPath)).length, 2);
  assert.equal((await getPlan(original.id, dbPath)).latestVersion, 2);
});

test("separate Node processes do not lose JSON storage mutations", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "travel-planner-storage-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const dbPath = path.join(directory, "plans.json");
  const moduleUrl = new URL("../src/storage.js", import.meta.url).href;
  const startAt = Date.now() + 300;
  const worker = (label) => `
    const { createPlan } = await import(${JSON.stringify(moduleUrl)});
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, ${startAt} - Date.now())));
    for (let index = 0; index < 10; index += 1) {
      await createPlan(
        { destination: ${JSON.stringify(label)} + index, startDate: "2026-08-01", nights: 0 },
        { plan: "worker", model: "fixture", prompt: null },
        ${JSON.stringify(dbPath)}
      );
    }
  `;

  await Promise.all([runWorker(worker("A")), runWorker(worker("B"))]);

  const plans = await listPlans(30, dbPath);
  assert.equal(plans.length, 20);
  assert.equal(new Set(plans.map((plan) => plan.id)).size, 20);
});
