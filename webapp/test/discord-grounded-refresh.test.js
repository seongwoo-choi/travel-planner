import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The handler needs a live Discord interaction and a Google-backed collector run, so the seam that
// keeps a rejected refresh out of storage is asserted statically: the refresh action is awaited
// before persistence and its rejection is not caught, so control never reaches the save.
const source = await readFile(new URL("../src/discord-bot.js", import.meta.url), "utf8");

function handlerBody(name) {
  const start = source.indexOf(`async function ${name}(interaction) {`);
  assert.ok(start >= 0, `${name} must exist`);
  const end = source.indexOf("\n}\n", start);
  assert.ok(end > start, `${name} must be a complete function`);
  return source.slice(start, end);
}

test("the refresh handler routes through the refresh action instead of a plain replan", () => {
  const body = handlerBody("handleGroundedRefresh");

  assert.match(body, /await refreshStoredGroundedPlan\(/);
  assert.doesNotMatch(body, /replanStoredGroundedPlan\(/);
  assert.match(source, /^\s+refreshStoredGroundedPlan,$/m);
});

test("a rejected refresh cannot reach persistence", () => {
  const body = handlerBody("handleGroundedRefresh");

  assert.ok(
    body.indexOf("await refreshStoredGroundedPlan(") < body.indexOf("persistGroundedResult("),
    "the refresh must be awaited before the result is persisted"
  );
  assert.doesNotMatch(body, /\bcatch\b/, "a rejected refresh must not be downgraded into a saved revision");
});

test("the refresh handler keeps the owner scope and expected-version flow", () => {
  const body = handlerBody("handleGroundedRefresh");

  assert.match(body, /const plan = await loadOwnedGroundedPlan\(interaction, planId\);\n  if \(!plan\) return;/);
  assert.match(body, /persistGroundedResult\(plan, result, "refresh grounded provider evidence"\)/);
});
