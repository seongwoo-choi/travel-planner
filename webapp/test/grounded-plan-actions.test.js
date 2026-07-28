import test from "node:test";
import assert from "node:assert/strict";

import {
  checkStoredGroundedPlan,
  moveStoredGroundedPlace,
  replaceStoredGroundedPlace,
  replanStoredGroundedPlan,
} from "../src/planner/grounded-plan-actions.js";

const places = [{
  id: "old",
  name: "Old Museum",
  score: 80,
  durationMinutes: 60,
  openingHoursStatus: "verified",
  openingHours: {
    "2026-08-01": { open: "09:00", close: "18:00" },
    "2026-08-02": { open: "09:00", close: "18:00" },
  },
  coordinates: { latitude: 35.1, longitude: 129.1 },
}, {
  id: "replacement",
  name: "Replacement Museum",
  score: 70,
  durationMinutes: 60,
  openingHoursStatus: "verified",
  openingHours: {
    "2026-08-01": { open: "09:00", close: "18:00" },
    "2026-08-02": { open: "09:00", close: "18:00" },
  },
  coordinates: { latitude: 35.2, longitude: 129.2 },
}];

const matrix = {
  "base|old": 10,
  "old|base": 10,
  "base|replacement": 10,
  "replacement|base": 10,
  "old|replacement": 10,
  "replacement|old": 10,
};

function record() {
  return {
    id: 1,
    destination: "부산",
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    nights: 1,
    latestVersion: 1,
    revisions: [{
      version: 1,
      input: {
        destination: "부산",
        startDate: "2026-08-01",
        endDate: "2026-08-02",
        nights: 1,
        baseLocationId: "base",
      },
      groundedPlan: {
        days: [{
          date: "2026-08-01",
          role: "ARRIVAL_DAY",
          availableFrom: "09:00",
          availableUntil: "21:00",
          activities: [{
            placeId: "old",
            name: "Old Museum",
            date: "2026-08-01",
            startTime: "09:10",
            endTime: "10:10",
            travelFromPrevious: { from: "base", to: "old", durationMinutes: 10 },
          }],
        }, {
          date: "2026-08-02",
          role: "DEPARTURE_DAY",
          availableFrom: "09:00",
          availableUntil: "21:00",
          activities: [],
        }],
        verificationTasks: [],
      },
      evidence: {
        places: {
          source: "places-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          location: { latitude: 35.1, longitude: 129.1 },
          items: places,
        },
        weather: {
          source: "weather-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          timezone: "Asia/Seoul",
          days: [
            { date: "2026-08-01", precipitationProbability: 10 },
            { date: "2026-08-02", precipitationProbability: 10 },
          ],
        },
        travel: { source: "travel-fixture", fetchedAt: "2026-07-28T10:00:00Z", matrix },
      },
    }],
  };
}

test("checkStoredGroundedPlan reruns validation from stored evidence", () => {
  const stored = structuredClone(record());
  delete stored.revisions[0].evidence.places.items[0].openingHours["2026-08-01"];

  const checked = checkStoredGroundedPlan(stored);

  assert.equal(checked.ok, false);
  assert.ok(checked.issues.some((issue) => issue.code === "MISSING_OPENING_HOURS"));
});

test("replanStoredGroundedPlan rebuilds a valid plan from stored evidence", async () => {
  const result = await replanStoredGroundedPlan(record());

  assert.equal(result.plan.validation.ok, true);
  assert.ok(result.plan.days.some((day) => day.activities.length > 0));
});

test("replaceStoredGroundedPlace removes the old place and requires its replacement", async () => {
  const result = await replaceStoredGroundedPlace(record(), "old", "replacement");
  const scheduled = result.plan.days.flatMap((day) => day.activities.map((activity) => activity.placeId));

  assert.ok(!scheduled.includes("old"));
  assert.ok(scheduled.includes("replacement"));
  assert.deepEqual(result.planningConstraints, [
    { type: "exclude", placeId: "old" },
    { type: "require", placeId: "replacement" },
  ]);
});

test("moveStoredGroundedPlace restricts the place to the requested verified date", async () => {
  const result = await moveStoredGroundedPlace(record(), "old", "2026-08-02");
  const oldDay = result.plan.days.find((day) =>
    day.activities.some((activity) => activity.placeId === "old")
  );

  assert.equal(oldDay.date, "2026-08-02");
  assert.deepEqual(result.planningConstraints, [
    { type: "move", placeId: "old", targetDate: "2026-08-02" },
  ]);
});

test("moveStoredGroundedPlace rejects a date outside the stored trip", async () => {
  await assert.rejects(
    moveStoredGroundedPlace(record(), "old", "2026-08-03"),
    /outside the stored trip/
  );
});
