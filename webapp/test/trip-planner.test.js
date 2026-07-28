import test from "node:test";
import assert from "node:assert/strict";

import { buildTripDays, planTrip, validateTripPlan } from "../src/planner/trip-planner.js";

test("buildTripDays creates every calendar day and applies arrival and departure windows", () => {
  const days = buildTripDays({
    startDate: "2026-08-01",
    endDate: "2026-08-05",
    arrivalAt: "2026-08-01T13:20:00+09:00",
    departureAt: "2026-08-05T17:40:00+09:00",
    dailyStartTime: "09:00",
    dailyEndTime: "21:00",
    arrivalBufferMinutes: 40,
    departureBufferMinutes: 90,
  });

  assert.equal(days.length, 5);
  assert.deepEqual(days.map((day) => day.date), [
    "2026-08-01",
    "2026-08-02",
    "2026-08-03",
    "2026-08-04",
    "2026-08-05",
  ]);
  assert.deepEqual(days.map((day) => day.role), [
    "ARRIVAL_DAY",
    "FULL_DAY",
    "FULL_DAY",
    "FULL_DAY",
    "DEPARTURE_DAY",
  ]);
  assert.equal(days[0].availableFrom, "14:00");
  assert.equal(days[0].availableUntil, "21:00");
  assert.equal(days[1].availableFrom, "09:00");
  assert.equal(days[4].availableFrom, "09:00");
  assert.equal(days[4].availableUntil, "16:10");
});

test("buildTripDays supports a same-day trip with both arrival and departure constraints", () => {
  const [day] = buildTripDays({
    startDate: "2026-08-01",
    endDate: "2026-08-01",
    arrivalAt: "2026-08-01T10:00:00+09:00",
    departureAt: "2026-08-01T18:00:00+09:00",
    arrivalBufferMinutes: 30,
    departureBufferMinutes: 60,
  });

  assert.equal(day.role, "SINGLE_DAY");
  assert.equal(day.availableFrom, "10:30");
  assert.equal(day.availableUntil, "17:00");
});

test("buildTripDays rejects trips beyond the supported planning horizon", () => {
  assert.throws(
    () => buildTripDays({ startDate: "2026-08-01", endDate: "2026-09-01" }),
    /planning horizon is 31 calendar days/
  );
});

test("buildTripDays rejects negative travel buffers", () => {
  assert.throws(
    () => buildTripDays({
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      departureBufferMinutes: -30,
    }),
    /departureBufferMinutes must be a non-negative finite number/
  );
});

test("buildTripDays rejects a day with no usable time after travel buffers", () => {
  assert.throws(
    () => buildTripDays({
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      arrivalAt: "2026-08-01T18:00:00+09:00",
      departureAt: "2026-08-01T19:00:00+09:00",
      arrivalBufferMinutes: 60,
      departureBufferMinutes: 60,
    }),
    /2026-08-01 has no usable planning window/
  );
});

test("planTrip schedules high-value places within opening, travel, and return-time constraints", () => {
  const plan = planTrip({
    trip: {
      startDate: "2026-08-01",
      endDate: "2026-08-02",
      dailyStartTime: "09:00",
      dailyEndTime: "20:00",
      baseLocationId: "hotel",
    },
    places: [
      {
        id: "museum",
        name: "Museum",
        score: 100,
        durationMinutes: 120,
        openingHours: {
          "2026-08-01": { open: "10:00", close: "18:00" },
          "2026-08-02": { open: "10:00", close: "18:00" },
        },
      },
      {
        id: "market",
        name: "Market",
        score: 80,
        durationMinutes: 90,
        openingHours: {
          "2026-08-01": { open: "09:00", close: "20:00" },
          "2026-08-02": { open: "09:00", close: "20:00" },
        },
      },
      {
        id: "late-show",
        name: "Late show",
        score: 200,
        required: true,
        durationMinutes: 90,
        openingHours: {
          "2026-08-01": { open: "19:00", close: "21:00" },
          "2026-08-02": { open: "19:00", close: "21:00" },
        },
      },
    ],
    travelMinutes: {
      "hotel|museum": 30,
      "museum|market": 20,
      "market|hotel": 20,
      "hotel|market": 20,
      "market|museum": 20,
      "museum|hotel": 30,
      "hotel|late-show": 30,
      "late-show|hotel": 30,
      "museum|late-show": 30,
      "market|late-show": 30,
    },
  });

  assert.deepEqual(plan.days[0].activities.map((activity) => activity.placeId), ["museum", "market"]);
  assert.equal(plan.days[0].activities[0].startTime, "10:00");
  assert.equal(plan.days[0].activities[0].travelFromPrevious.durationMinutes, 30);
  assert.equal(plan.days[0].activities[1].startTime, "12:20");
  assert.deepEqual(plan.unscheduledPlaceIds, ["late-show"]);
  assert.deepEqual(plan.verificationTasks, [{
    code: "REQUIRED_PLACE_UNSCHEDULED",
    placeId: "late-show",
    message: "Late show cannot be scheduled without violating current constraints",
  }]);
  assert.deepEqual(plan.validation, { ok: true, issues: [] });
});

test("planTrip maximizes total place value instead of greedily taking one high-score place", () => {
  const plan = planTrip({
    trip: {
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      dailyStartTime: "09:00",
      dailyEndTime: "13:00",
      baseLocationId: "hotel",
    },
    places: [
      { id: "long", name: "Long", score: 100, durationMinutes: 220, openingHours: { "2026-08-01": { open: "09:00", close: "13:00" } } },
      { id: "short-a", name: "Short A", score: 60, durationMinutes: 90, openingHours: { "2026-08-01": { open: "09:00", close: "13:00" } } },
      { id: "short-b", name: "Short B", score: 60, durationMinutes: 90, openingHours: { "2026-08-01": { open: "09:00", close: "13:00" } } },
    ],
    travelMinutes: {
      "hotel|long": 10,
      "long|hotel": 10,
      "hotel|short-a": 10,
      "short-a|hotel": 10,
      "hotel|short-b": 10,
      "short-b|hotel": 10,
      "short-a|short-b": 10,
      "short-b|short-a": 10,
    },
  });

  assert.deepEqual(plan.days[0].activities.map((activity) => activity.placeId), ["short-a", "short-b"]);
  assert.deepEqual(plan.unscheduledPlaceIds, ["long"]);
});

test("planTrip can continue to a nearby place when returning to base from an intermediate stop is too slow", () => {
  const plan = planTrip({
    trip: {
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      dailyStartTime: "09:00",
      dailyEndTime: "13:00",
      baseLocationId: "hotel",
    },
    places: [
      { id: "trail", name: "Trail", score: 50, durationMinutes: 120, openingHours: { "2026-08-01": { open: "09:00", close: "13:00" } } },
      { id: "shuttle", name: "Shuttle", score: 50, durationMinutes: 30, openingHours: { "2026-08-01": { open: "09:00", close: "13:00" } } },
    ],
    travelMinutes: {
      "hotel|trail": 20,
      "trail|hotel": 120,
      "trail|shuttle": 10,
      "shuttle|hotel": 10,
    },
  });

  assert.deepEqual(plan.days[0].activities.map((activity) => activity.placeId), ["trail", "shuttle"]);
});

test("planTrip reserves a constrained day for a required place and moves a flexible place", () => {
  const plan = planTrip({
    trip: {
      startDate: "2026-08-01",
      endDate: "2026-08-02",
      dailyStartTime: "09:00",
      dailyEndTime: "11:00",
      baseLocationId: "hotel",
    },
    places: [
      {
        id: "required-tour",
        name: "Required tour",
        required: true,
        score: 10,
        durationMinutes: 90,
        openingHours: { "2026-08-01": { open: "09:00", close: "11:00" } },
      },
      {
        id: "flexible-museum",
        name: "Flexible museum",
        score: 100,
        durationMinutes: 90,
        openingHours: {
          "2026-08-01": { open: "09:00", close: "11:00" },
          "2026-08-02": { open: "09:00", close: "11:00" },
        },
      },
    ],
    travelMinutes: {
      "hotel|required-tour": 10,
      "required-tour|hotel": 10,
      "hotel|flexible-museum": 10,
      "flexible-museum|hotel": 10,
    },
  });

  assert.deepEqual(plan.days.map((day) => day.activities.map((activity) => activity.placeId)), [
    ["required-tour"],
    ["flexible-museum"],
  ]);
  assert.deepEqual(plan.verificationTasks, []);
});

test("planTrip maximizes value across days instead of spending a constrained day on a flexible place", () => {
  const plan = planTrip({
    trip: {
      startDate: "2026-08-01",
      endDate: "2026-08-02",
      dailyStartTime: "09:00",
      dailyEndTime: "11:00",
      baseLocationId: "hotel",
    },
    places: [
      {
        id: "day-one-tour",
        name: "Day one tour",
        score: 90,
        durationMinutes: 90,
        openingHours: { "2026-08-01": { open: "09:00", close: "11:00" } },
      },
      {
        id: "flexible-museum",
        name: "Flexible museum",
        score: 100,
        durationMinutes: 90,
        openingHours: {
          "2026-08-01": { open: "09:00", close: "11:00" },
          "2026-08-02": { open: "09:00", close: "11:00" },
        },
      },
    ],
    travelMinutes: {
      "hotel|day-one-tour": 10,
      "day-one-tour|hotel": 10,
      "hotel|flexible-museum": 10,
      "flexible-museum|hotel": 10,
    },
  });

  assert.deepEqual(plan.days.map((day) => day.activities.map((activity) => activity.placeId)), [
    ["day-one-tour"],
    ["flexible-museum"],
  ]);
  assert.deepEqual(plan.unscheduledPlaceIds, []);
});

test("planTrip rejects an unbounded place candidate set before running route search", () => {
  assert.throws(
    () => planTrip({
      trip: { startDate: "2026-08-01", endDate: "2026-08-01", baseLocationId: "hotel" },
      places: Array.from({ length: 51 }, (_, index) => ({ id: `place-${index}` })),
    }),
    /at most 50 place candidates/
  );
});

test("planTrip rejects duplicate place ids", () => {
  assert.throws(
    () => planTrip({
      trip: { startDate: "2026-08-01", endDate: "2026-08-01", baseLocationId: "hotel" },
      places: [{ id: "museum" }, { id: "museum" }],
    }),
    /place ids must be unique/
  );
});

test("planTrip rejects non-numeric place scores", () => {
  assert.throws(
    () => planTrip({
      trip: { startDate: "2026-08-01", endDate: "2026-08-01", baseLocationId: "hotel" },
      places: [{ id: "museum", score: "popular", durationMinutes: 60 }],
    }),
    /museum.score must be a finite number/
  );
});

test("validateTripPlan reports when consecutive activities ignore required travel time", () => {
  const result = validateTripPlan({
    plan: {
      days: [{
        date: "2026-08-01",
        availableFrom: "09:00",
        availableUntil: "20:00",
        activities: [
          { placeId: "museum", startTime: "10:00", endTime: "12:00" },
          { placeId: "market", startTime: "12:10", endTime: "13:40" },
        ],
      }],
    },
    places: [
      { id: "museum", openingHours: { "2026-08-01": { open: "10:00", close: "18:00" } } },
      { id: "market", openingHours: { "2026-08-01": { open: "09:00", close: "20:00" } } },
    ],
    travelMinutes: { "museum|market": 20 },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.issues, [{
    code: "TRAVEL_TIME_CONFLICT",
    date: "2026-08-01",
    activityId: "market",
    requiredStartTime: "12:20",
    actualStartTime: "12:10",
  }]);
});

test("validateTripPlan reports activities outside verified opening hours", () => {
  const result = validateTripPlan({
    plan: {
      days: [{
        date: "2026-08-01",
        availableFrom: "09:00",
        availableUntil: "20:00",
        activities: [{ placeId: "museum", startTime: "17:30", endTime: "19:00" }],
      }],
    },
    places: [{
      id: "museum",
      openingHours: { "2026-08-01": { open: "10:00", close: "18:00" } },
    }],
  });

  assert.deepEqual(result.issues, [{
    code: "OPENING_HOURS_CONFLICT",
    date: "2026-08-01",
    activityId: "museum",
    openingTime: "10:00",
    closingTime: "18:00",
    actualStartTime: "17:30",
    actualEndTime: "19:00",
  }]);
});

test("validateTripPlan does not silently accept missing travel evidence", () => {
  const result = validateTripPlan({
    plan: {
      days: [{
        date: "2026-08-01",
        availableFrom: "09:00",
        availableUntil: "20:00",
        activities: [
          { placeId: "museum", startTime: "10:00", endTime: "11:00" },
          { placeId: "market", startTime: "12:00", endTime: "13:00" },
        ],
      }],
    },
    places: [
      { id: "museum", openingHours: { "2026-08-01": { open: "09:00", close: "20:00" } } },
      { id: "market", openingHours: { "2026-08-01": { open: "09:00", close: "20:00" } } },
    ],
  });

  assert.deepEqual(result.issues, [{
    code: "MISSING_TRAVEL_TIME",
    date: "2026-08-01",
    activityId: "market",
    fromActivityId: "museum",
  }]);
});

test("validateTripPlan reports activities outside the usable day window", () => {
  const result = validateTripPlan({
    plan: {
      days: [{
        date: "2026-08-01",
        availableFrom: "09:00",
        availableUntil: "18:00",
        activities: [{ placeId: "museum", startTime: "08:30", endTime: "10:00" }],
      }],
    },
    places: [{ id: "museum", openingHours: { "2026-08-01": { open: "08:00", close: "20:00" } } }],
  });

  assert.deepEqual(result.issues, [{
    code: "DAY_WINDOW_CONFLICT",
    date: "2026-08-01",
    activityId: "museum",
    availableFrom: "09:00",
    availableUntil: "18:00",
    actualStartTime: "08:30",
    actualEndTime: "10:00",
  }]);
});

test("validateTripPlan reports missing place and opening-hours evidence", () => {
  const result = validateTripPlan({
    plan: {
      days: [{
        date: "2026-08-01",
        availableFrom: "09:00",
        availableUntil: "18:00",
        activities: [
          { placeId: "known", startTime: "10:00", endTime: "11:00" },
          { placeId: "unknown", startTime: "12:00", endTime: "13:00" },
        ],
      }],
    },
    places: [{ id: "known", openingHours: {} }],
    travelMinutes: { "known|unknown": 30 },
  });

  assert.deepEqual(result.issues, [
    { code: "MISSING_OPENING_HOURS", date: "2026-08-01", activityId: "known" },
    { code: "UNKNOWN_PLACE", date: "2026-08-01", activityId: "unknown" },
  ]);
});
