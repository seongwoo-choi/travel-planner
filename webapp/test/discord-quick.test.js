import test from "node:test";
import assert from "node:assert/strict";

import { buildPlanInput, commands, parseQuickRequest } from "../src/discord-bot.js";

test("parseQuickRequest converts calendar days to nights and supports day trips", () => {
  assert.equal(parseQuickRequest("2026-08-01 부산 당일치기").nights, 0);
  assert.equal(parseQuickRequest("2026-08-01 부산 3일 여행").nights, 2);
  assert.equal(parseQuickRequest("2026-08-01 부산 2박3일 여행").nights, 2);
});

test("parseQuickRequest preserves the required grounded planning date", () => {
  const request = parseQuickRequest("2026-08-01 부산 2박3일 친구랑 여행");
  assert.equal(request.startDate, "2026-08-01");
  assert.equal(request.destination, "부산");
});

test("parseQuickRequest defaults a missing date instead of crashing grounded generation", () => {
  assert.match(parseQuickRequest("부산 2박3일 여행").startDate, /^\d{4}-\d{2}-\d{2}$/);
});

test("buildPlanInput preserves accommodation base and arrival/departure windows", () => {
  const values = new Map([
    ["destination", "부산"],
    ["nights", 2],
    ["companions", "친구"],
    ["scope", "일정만"],
    ["base_location", "광안리 숙소"],
    ["arrival_time", "13:30"],
    ["departure_time", "17:10"],
  ]);
  const interaction = {
    options: {
      getString: (name) => values.get(name) ?? null,
      getInteger: (name) => values.get(name) ?? null,
    },
  };

  const input = buildPlanInput(interaction);

  assert.equal(input.baseLocation, "광안리 숙소");
  assert.equal(input.arrivalTime, "13:30");
  assert.equal(input.departureTime, "17:10");
});

test("Discord registers structured grounded plan operations", () => {
  const names = new Set(commands.map((command) => command.name));

  for (const name of ["check", "replace", "move", "replan", "refresh"]) {
    assert.ok(names.has(name), `${name} command must be registered`);
  }
});
