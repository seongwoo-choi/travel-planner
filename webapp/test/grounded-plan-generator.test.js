import test from "node:test";
import assert from "node:assert/strict";

import { createGroundedPlanGenerator } from "../src/planner/grounded-plan-generator.js";

test("grounded generator returns storage-compatible text plus structured evidence", async () => {
  let collectedTrip;
  const generator = createGroundedPlanGenerator({
    collectors: {
      places: { collect: async (trip) => {
        collectedTrip = trip;
        return {
          source: "places-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          items: [{
            id: "museum",
            name: "Museum",
            score: 80,
            durationMinutes: 60,
            openingHours: {
              "2026-08-01": { open: "09:00", close: "18:00" },
              "2026-08-02": { open: "09:00", close: "18:00" },
              "2026-08-03": { open: "09:00", close: "18:00" },
            },
          }],
        };
      } },
      weather: { collect: async () => ({
        source: "weather-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        days: ["2026-08-01", "2026-08-02", "2026-08-03"].map((date) => ({
          date,
          precipitationProbability: 20,
        })),
      }) },
      travel: { collect: async () => ({
        source: "travel-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        matrix: { "base|museum": 20, "museum|base": 20 },
      }) },
    },
  });

  const generation = await generator.generate({
    destination: "부산",
    startDate: "2026-08-01",
    nights: 2,
  });

  assert.equal(collectedTrip.endDate, "2026-08-03");
  assert.equal(generation.model, "grounded-planner-v1");
  assert.equal(generation.status, "ready");
  assert.match(generation.plan, /# 부산 여행 플랜/);
  assert.equal(generation.groundedPlan.days.length, 3);
  assert.equal(generation.evidence.places.source, "places-fixture");
});
