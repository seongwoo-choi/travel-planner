import test from "node:test";
import assert from "node:assert/strict";

import { buildTripDays, planTrip, validateTripPlan } from "../src/planner/trip-planner.js";
import { worstCasePlannerFixture } from "./planner-benchmark.js";

function scheduledScore(plan, places) {
  const scoreById = new Map(places.map((place) => [place.id, Number(place.score || 0)]));
  return plan.days
    .flatMap((day) => day.activities)
    .reduce((total, activity) => total + scoreById.get(activity.placeId), 0);
}

// Two days that each hold exactly five 60-minute activities, ten places that only day one can use
// and one high-value place that either day can take.
function scarceDayFixture() {
  const lowIds = Array.from({ length: 10 }, (_, index) => `low-${String(index + 1).padStart(2, "0")}`);
  const travelMinutes = {};
  for (const from of ["hotel", "flexible", ...lowIds]) {
    for (const to of ["hotel", "flexible", ...lowIds]) {
      if (from !== to) travelMinutes[`${from}|${to}`] = 0;
    }
  }
  return {
    trip: {
      startDate: "2026-08-01",
      endDate: "2026-08-02",
      dailyStartTime: "09:00",
      dailyEndTime: "14:00",
      baseLocationId: "hotel",
    },
    places: [
      ...lowIds.map((id) => ({
        id,
        name: id,
        score: 10,
        durationMinutes: 60,
        openingHours: { "2026-08-01": { open: "09:00", close: "14:00" } },
      })),
      {
        id: "flexible",
        name: "Flexible",
        score: 100,
        durationMinutes: 60,
        openingHours: {
          "2026-08-01": { open: "09:00", close: "14:00" },
          "2026-08-02": { open: "09:00", close: "14:00" },
        },
      },
    ],
    travelMinutes,
  };
}

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

test("buildTripDays rejects fractional travel buffers", () => {
  assert.throws(
    () => buildTripDays({
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      arrivalAt: "2026-08-01T10:00:00+09:00",
      arrivalBufferMinutes: 30.5,
    }),
    /arrivalBufferMinutes must be a non-negative finite number of whole minutes/
  );
});

test("buildTripDays rejects a daily window that ends before it starts", () => {
  assert.throws(
    () => buildTripDays({
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      dailyStartTime: "21:00",
      dailyEndTime: "09:00",
    }),
    /dailyEndTime must be after dailyStartTime/
  );
});

test("buildTripDays collapses a same-day trip with crossing buffers into an empty window", () => {
  const [day] = buildTripDays({
    startDate: "2026-08-01",
    endDate: "2026-08-01",
    arrivalAt: "2026-08-01T18:00:00+09:00",
    departureAt: "2026-08-01T19:00:00+09:00",
    arrivalBufferMinutes: 60,
    departureBufferMinutes: 60,
  });

  assert.equal(day.role, "SINGLE_DAY");
  assert.equal(day.availableFrom, "18:00");
  assert.equal(day.availableUntil, "18:00");
  assert.deepEqual(day.activities, []);
});

test("buildTripDays clamps a late arrival to the daily end instead of throwing", () => {
  const days = buildTripDays({
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    arrivalAt: "2026-08-01T22:00:00+09:00",
    dailyStartTime: "09:00",
    dailyEndTime: "21:00",
  });

  assert.equal(days[0].availableFrom, "21:00");
  assert.equal(days[0].availableUntil, "21:00");
  assert.equal(days[1].availableFrom, "09:00");
  assert.equal(days[1].availableUntil, "21:00");
});

test("buildTripDays clamps an early departure to the daily start instead of throwing", () => {
  const days = buildTripDays({
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    departureAt: "2026-08-02T08:00:00+09:00",
    dailyStartTime: "09:00",
    dailyEndTime: "21:00",
  });

  assert.equal(days[0].availableFrom, "09:00");
  assert.equal(days[0].availableUntil, "21:00");
  assert.equal(days[1].availableFrom, "09:00");
  assert.equal(days[1].availableUntil, "09:00");
});

test("planTrip leaves a boundary day empty and still schedules the remaining days", () => {
  const plan = planTrip({
    trip: {
      startDate: "2026-08-01",
      endDate: "2026-08-02",
      arrivalAt: "2026-08-01T22:00:00+09:00",
      dailyStartTime: "09:00",
      dailyEndTime: "21:00",
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
    ],
    travelMinutes: { "hotel|museum": 30, "museum|hotel": 30 },
  });

  assert.deepEqual(plan.days[0].activities, []);
  assert.deepEqual(plan.days[1].activities.map((activity) => activity.placeId), ["museum"]);
  assert.deepEqual(plan.unscheduledPlaceIds, []);
  assert.deepEqual(plan.validation, { ok: true, issues: [] });
});

test("planTrip schedules high-value places within opening, travel, and return-time constraints", () => {
  const plan = planTrip({
    trip: {
      startDate: "2026-08-01",
      endDate: "2026-08-01",
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
        openingHours: { "2026-08-01": { open: "10:00", close: "18:00" } },
      },
      {
        id: "market",
        name: "Market",
        score: 80,
        durationMinutes: 90,
        openingHours: { "2026-08-01": { open: "09:00", close: "20:00" } },
      },
      {
        id: "late-show",
        name: "Late show",
        score: 200,
        required: true,
        durationMinutes: 90,
        openingHours: { "2026-08-01": { open: "19:00", close: "21:00" } },
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

test("planTrip prefers a start inside a preferred window over the earliest feasible slot", () => {
  const plan = planTrip({
    trip: {
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      dailyStartTime: "09:00",
      dailyEndTime: "21:00",
      baseLocationId: "hotel",
    },
    places: [
      {
        id: "sunset-town",
        name: "Sunset Town",
        score: 50,
        durationMinutes: 120,
        preferredWindows: [{ start: "16:00", end: "20:30" }],
        openingHours: { "2026-08-01": { open: "09:00", close: "21:00" } },
      },
      {
        id: "morning-market",
        name: "Morning Market",
        score: 50,
        durationMinutes: 120,
        openingHours: { "2026-08-01": { open: "09:00", close: "21:00" } },
      },
    ],
    travelMinutes: {
      "hotel|sunset-town": 10,
      "sunset-town|hotel": 10,
      "hotel|morning-market": 10,
      "morning-market|hotel": 10,
      "sunset-town|morning-market": 10,
      "morning-market|sunset-town": 10,
    },
  });

  const sunset = plan.days[0].activities.find((activity) => activity.placeId === "sunset-town");
  assert.equal(sunset.startTime, "16:00");
  assert.equal(sunset.preferredWindowMatched, true);
  assert.equal(plan.days[0].activities.length, 2);
  assert.equal(plan.scheduleQuality.preferredWindowMisses, 0);
});

test("planTrip still schedules a preferred-window place outside the window when no in-window start fits", () => {
  const plan = planTrip({
    trip: {
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      dailyStartTime: "09:00",
      dailyEndTime: "12:00",
      baseLocationId: "hotel",
    },
    places: [
      {
        id: "sunset-town",
        name: "Sunset Town",
        score: 50,
        durationMinutes: 120,
        preferredWindows: [{ start: "16:00", end: "20:30" }],
        openingHours: { "2026-08-01": { open: "09:00", close: "12:00" } },
      },
    ],
    travelMinutes: { "hotel|sunset-town": 0, "sunset-town|hotel": 0 },
  });

  assert.deepEqual(plan.days[0].activities.map((activity) => activity.placeId), ["sunset-town"]);
  assert.equal(plan.days[0].activities[0].startTime, "09:00");
  assert.equal(plan.days[0].activities[0].preferredWindowMatched, false);
  assert.equal(plan.scheduleQuality.preferredWindowMisses, 1);
});

test("planTrip rejects malformed preferred windows at the input boundary", () => {
  const trip = { startDate: "2026-08-01", endDate: "2026-08-01", baseLocationId: "hotel" };
  const place = { id: "museum", durationMinutes: 60, openingHours: {} };

  assert.throws(
    () => planTrip({ trip, places: [{ ...place, preferredWindows: "16:00-20:30" }] }),
    /museum.preferredWindows must be an array/
  );
  assert.throws(
    () => planTrip({ trip, places: [{ ...place, preferredWindows: [{ start: "16:00", end: "25:00" }] }] }),
    /museum.preferredWindows\[0\].end must be a valid time/
  );
  assert.throws(
    () => planTrip({ trip, places: [{ ...place, preferredWindows: [{ start: "20:00", end: "16:00" }] }] }),
    /museum.preferredWindows\[0\].end must be after/
  );
});

test("planTrip spreads places across usable days instead of packing the first day", () => {
  const placeIds = ["p1", "p2", "p3", "p4", "p5"];
  const dates = ["2026-08-01", "2026-08-02", "2026-08-03"];
  const travelMinutes = {};
  for (const from of ["hotel", ...placeIds]) {
    for (const to of ["hotel", ...placeIds]) {
      if (from !== to) travelMinutes[`${from}|${to}`] = 10;
    }
  }
  const plan = planTrip({
    trip: {
      startDate: "2026-08-01",
      endDate: "2026-08-03",
      dailyStartTime: "09:00",
      dailyEndTime: "21:00",
      baseLocationId: "hotel",
    },
    places: placeIds.map((id) => ({
      id,
      name: id,
      score: 10,
      durationMinutes: 60,
      openingHours: Object.fromEntries(dates.map((date) => [date, { open: "09:00", close: "21:00" }])),
    })),
    travelMinutes,
  });

  const counts = plan.days.map((day) => day.activities.length);
  assert.deepEqual([...counts].sort(), [1, 2, 2]);
  assert.deepEqual(plan.unscheduledPlaceIds, []);
  assert.equal(plan.scheduleQuality.emptyUsableDays, 0);
  assert.equal(plan.scheduleQuality.activityImbalance, 1);
});

test("planTrip keeps the higher-scoring schedule even when it is the more imbalanced one", () => {
  const dates = ["2026-08-01", "2026-08-02"];
  const ids = ["headliner", "a", "b", "c"];
  const travelMinutes = {};
  for (const from of ["hotel", ...ids]) {
    for (const to of ["hotel", ...ids]) {
      if (from !== to) travelMinutes[`${from}|${to}`] = 10;
    }
  }
  const plan = planTrip({
    trip: {
      startDate: "2026-08-01",
      endDate: "2026-08-02",
      dailyStartTime: "09:00",
      dailyEndTime: "21:00",
      baseLocationId: "hotel",
    },
    places: [
      // Fills day one on its own: taking it forces a 1/3 split, dropping it allows a 2/2 split.
      {
        id: "headliner",
        name: "headliner",
        score: 100,
        durationMinutes: 660,
        openingHours: { "2026-08-01": { open: "09:00", close: "21:00" } },
      },
      ...["a", "b", "c"].map((id) => ({
        id,
        name: id,
        score: 10,
        durationMinutes: 60,
        openingHours: Object.fromEntries(dates.map((date) => [date, { open: "09:00", close: "21:00" }])),
      })),
    ],
    travelMinutes,
  });

  assert.deepEqual(plan.days.map((day) => day.activities.length), [1, 3]);
  assert.equal(plan.days[0].activities[0].placeId, "headliner");
  assert.deepEqual(plan.unscheduledPlaceIds, []);
  assert.equal(plan.scheduleQuality.activityImbalance, 2);
});

test("planTrip does not count a boundary day without a usable window as an empty day", () => {
  const plan = planTrip({
    trip: {
      startDate: "2026-08-01",
      endDate: "2026-08-03",
      arrivalAt: "2026-08-01T22:00:00+09:00",
      dailyStartTime: "09:00",
      dailyEndTime: "21:00",
      baseLocationId: "hotel",
    },
    places: ["gallery", "garden"].map((id) => ({
      id,
      name: id,
      score: 10,
      durationMinutes: 60,
      openingHours: {
        "2026-08-02": { open: "09:00", close: "21:00" },
        "2026-08-03": { open: "09:00", close: "21:00" },
      },
    })),
    travelMinutes: {
      "hotel|gallery": 10,
      "gallery|hotel": 10,
      "hotel|garden": 10,
      "garden|hotel": 10,
      "gallery|garden": 10,
      "garden|gallery": 10,
    },
  });

  assert.deepEqual(plan.days.map((day) => day.activities.length), [0, 1, 1]);
  assert.equal(plan.scheduleQuality.emptyUsableDays, 0);
});

test("planTrip shifts a non-meal activity past a lunch break", () => {
  const plan = planTrip({
    trip: {
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      dailyStartTime: "09:00",
      dailyEndTime: "18:00",
      baseLocationId: "hotel",
      breakWindows: [{ start: "12:00", end: "13:00", kind: "meal" }],
    },
    places: [{
      id: "gallery",
      name: "Gallery",
      score: 50,
      durationMinutes: 180,
      openingHours: { "2026-08-01": { open: "09:00", close: "18:00" } },
    }],
    travelMinutes: { "hotel|gallery": 30, "gallery|hotel": 30 },
  });

  assert.equal(plan.days[0].activities[0].startTime, "13:00");
  assert.equal(plan.days[0].activities[0].endTime, "16:00");
  assert.deepEqual(plan.validation, { ok: true, issues: [] });
});

test("planTrip lets a meal place occupy a meal break but not another break kind", () => {
  const plan = planTrip({
    trip: {
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      dailyStartTime: "09:00",
      dailyEndTime: "20:00",
      baseLocationId: "hotel",
      breakWindows: [
        { start: "12:00", end: "13:00", kind: "meal" },
        { start: "15:00", end: "15:30", kind: "rest" },
      ],
    },
    places: [
      {
        id: "bistro",
        name: "Bistro",
        category: "meal",
        score: 50,
        durationMinutes: 60,
        preferredWindows: [{ start: "12:00", end: "13:00" }],
        openingHours: { "2026-08-01": { open: "09:00", close: "20:00" } },
      },
      {
        id: "teahouse",
        name: "Teahouse",
        category: "meal",
        score: 50,
        durationMinutes: 60,
        preferredWindows: [{ start: "15:00", end: "17:00" }],
        openingHours: { "2026-08-01": { open: "09:00", close: "20:00" } },
      },
    ],
    travelMinutes: {
      "hotel|bistro": 0,
      "bistro|hotel": 0,
      "hotel|teahouse": 0,
      "teahouse|hotel": 0,
      "bistro|teahouse": 0,
      "teahouse|bistro": 0,
    },
  });

  const byId = new Map(plan.days[0].activities.map((activity) => [activity.placeId, activity]));
  assert.equal(byId.get("bistro").startTime, "12:00");
  assert.equal(byId.get("teahouse").startTime, "15:30");
  assert.equal(plan.scheduleQuality.preferredWindowMisses, 0);
});

test("planTrip rejects malformed break windows at the input boundary", () => {
  const trip = { startDate: "2026-08-01", endDate: "2026-08-01", baseLocationId: "hotel" };

  assert.throws(
    () => planTrip({ trip: { ...trip, breakWindows: [{ start: "12:00", end: "13:00" }] }, places: [] }),
    /breakWindows\[0\].kind must be a non-empty string/
  );
  assert.throws(
    () => planTrip({ trip: { ...trip, breakWindows: [{ start: "13:00", end: "12:00", kind: "meal" }] }, places: [] }),
    /breakWindows\[0\].end must be after/
  );
  assert.throws(
    () => planTrip({ trip: { ...trip, breakWindows: { start: "12:00", end: "13:00", kind: "meal" } }, places: [] }),
    /breakWindows must be an array/
  );
});

test("planTrip persists the normalized break windows it planned against", () => {
  const trip = {
    startDate: "2026-08-01",
    endDate: "2026-08-01",
    baseLocationId: "hotel",
    breakWindows: [
      { start: "18:00", end: "19:00", kind: "meal" },
      { start: "12:00", end: "13:00", kind: "meal" },
    ],
  };

  assert.deepEqual(planTrip({ trip, places: [] }).breakWindows, [
    { start: "12:00", end: "13:00", kind: "meal" },
    { start: "18:00", end: "19:00", kind: "meal" },
  ]);
  assert.deepEqual(planTrip({ trip: { ...trip, breakWindows: [] }, places: [] }).breakWindows, []);
});

test("validateTripPlan reports a stored activity that overlaps a break window", () => {
  const plan = {
    breakWindows: [{ start: "12:00", end: "13:00", kind: "meal" }],
    days: [{
      date: "2026-08-01",
      availableFrom: "09:00",
      availableUntil: "20:00",
      activities: [{ placeId: "gallery", startTime: "11:30", endTime: "12:30" }],
    }],
  };

  const result = validateTripPlan({
    plan,
    places: [{ id: "gallery", openingHours: { "2026-08-01": { open: "09:00", close: "20:00" } } }],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.issues, [{
    code: "BREAK_WINDOW_CONFLICT",
    date: "2026-08-01",
    activityId: "gallery",
    breakKind: "meal",
    breakStart: "12:00",
    breakEnd: "13:00",
    actualStartTime: "11:30",
    actualEndTime: "12:30",
  }]);
});

test("validateTripPlan exempts a meal place from a meal break only", () => {
  const places = [{
    id: "bistro",
    category: "meal",
    openingHours: { "2026-08-01": { open: "09:00", close: "20:00" } },
  }];
  const day = (startTime, endTime) => ({
    date: "2026-08-01",
    availableFrom: "09:00",
    availableUntil: "20:00",
    activities: [{ placeId: "bistro", startTime, endTime }],
  });

  const inMealBreak = validateTripPlan({
    plan: { breakWindows: [{ start: "12:00", end: "13:00", kind: "meal" }], days: [day("12:00", "13:00")] },
    places,
  });
  const inRestBreak = validateTripPlan({
    plan: { breakWindows: [{ start: "15:00", end: "15:30", kind: "rest" }], days: [day("15:00", "16:00")] },
    places,
  });

  assert.deepEqual(inMealBreak, { ok: true, issues: [] });
  assert.equal(inRestBreak.ok, false);
  assert.deepEqual(inRestBreak.issues.map((issue) => issue.code), ["BREAK_WINDOW_CONFLICT"]);
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

test("planTrip does not spend a scarce day on a place a later day can still take", () => {
  const fixture = scarceDayFixture();
  const plan = planTrip(fixture);

  assert.deepEqual(plan.days.map((day) => day.activities.length), [5, 1]);
  assert.deepEqual(plan.days[1].activities.map((activity) => activity.placeId), ["flexible"]);
  assert.equal(plan.days[0].activities.every((activity) => activity.placeId.startsWith("low-")), true);
  assert.equal(scheduledScore(plan, fixture.places), 150);
  assert.deepEqual(plan.validation, { ok: true, issues: [] });
});

test("planTrip retains a required place whose only feasible day has more candidates than the beam width", () => {
  const flexibleIds = Array.from({ length: 10 }, (_, index) => `flex-${String(index + 1).padStart(2, "0")}`);
  const ids = ["required-parade", ...flexibleIds];
  const travelMinutes = {};
  for (const from of ["hotel", ...ids]) {
    for (const to of ["hotel", ...ids]) {
      if (from !== to) travelMinutes[`${from}|${to}`] = 0;
    }
  }
  const plan = planTrip({
    trip: {
      startDate: "2026-08-01",
      endDate: "2026-08-02",
      dailyStartTime: "09:00",
      dailyEndTime: "14:00",
      baseLocationId: "hotel",
    },
    places: [
      {
        id: "required-parade",
        name: "Required parade",
        required: true,
        score: 1,
        durationMinutes: 60,
        openingHours: { "2026-08-01": { open: "09:00", close: "14:00" } },
      },
      ...flexibleIds.map((id) => ({
        id,
        name: id,
        score: 100,
        durationMinutes: 60,
        openingHours: {
          "2026-08-01": { open: "09:00", close: "14:00" },
          "2026-08-02": { open: "09:00", close: "14:00" },
        },
      })),
    ],
    travelMinutes,
  });

  // The cap is saturated, so the required place survived a candidate set wider than the beam.
  assert.equal(
    plan.searchDiagnostics.survivors.maxDayCandidates,
    plan.searchDiagnostics.bounds.dayCandidateLimit
  );
  assert.deepEqual(
    plan.days[0].activities.map((activity) => activity.placeId).filter((id) => id === "required-parade"),
    ["required-parade"]
  );
  assert.deepEqual(plan.days.map((day) => day.activities.length), [5, 5]);
  assert.deepEqual(plan.verificationTasks, []);
  assert.deepEqual(plan.validation, { ok: true, issues: [] });
});

// Two days that hold three activities each, four zero-score places both days can take and twenty
// zero-score places only day one can take. Filling day one with day-one-only places keeps all four
// flexible places for day two, which is the only way to schedule six of them; every trip state
// ties on required places and score, so nothing but the count of places still reachable separates
// the state that spends the flexible places early from the one that saves them.
function flexibleSupplyFixture() {
  const flexibleIds = Array.from({ length: 4 }, (_, index) => `flex${String(index + 1).padStart(2, "0")}`);
  const firstDayOnlyIds = Array.from({ length: 20 }, (_, index) => `onlyfirst${String(index + 1).padStart(2, "0")}`);
  const travelMinutes = {};
  for (const from of ["hotel", ...flexibleIds, ...firstDayOnlyIds]) {
    for (const to of ["hotel", ...flexibleIds, ...firstDayOnlyIds]) {
      if (from !== to) travelMinutes[`${from}|${to}`] = 0;
    }
  }
  return {
    trip: {
      startDate: "2026-08-01",
      endDate: "2026-08-02",
      dailyStartTime: "09:00",
      dailyEndTime: "21:00",
      baseLocationId: "hotel",
    },
    places: [
      ...flexibleIds.map((id) => ({
        id,
        name: id,
        durationMinutes: 60,
        openingHours: {
          "2026-08-01": { open: "09:00", close: "12:00" },
          "2026-08-02": { open: "09:00", close: "12:00" },
        },
      })),
      ...firstDayOnlyIds.map((id) => ({
        id,
        name: id,
        durationMinutes: 60,
        openingHours: { "2026-08-01": { open: "09:00", close: "11:00" } },
      })),
    ],
    travelMinutes,
  };
}

test("planTrip keeps a tied trip state that can still reach more places on a later day", () => {
  const fixture = flexibleSupplyFixture();
  const plan = planTrip(fixture);
  const scheduled = plan.days.flatMap((day) => day.activities.map((activity) => activity.placeId));

  // The known feasible schedule: two day-one-only places plus one flexible on day one, and the
  // three remaining flexible places on day two.
  assert.equal(scheduled.length, 6);
  assert.deepEqual(plan.days.map((day) => day.activities.length), [3, 3]);
  assert.equal(scheduled.filter((id) => id.startsWith("flex")).length, 4);
  assert.deepEqual(plan.days[1].activities.every((activity) => activity.placeId.startsWith("flex")), true);
  assert.deepEqual(plan.validation, { ok: true, issues: [] });
});

test("planTrip reports its search as bounded and approximate instead of optimal", () => {
  const fixture = scarceDayFixture();
  const { searchDiagnostics } = planTrip(fixture);

  assert.equal(searchDiagnostics.approximate, true);
  assert.deepEqual(searchDiagnostics.bounds, {
    placeCandidateLimit: 50,
    planningDayLimit: 31,
    dayRouteFrontierLimit: 128,
    dayRouteScarceReserve: 32,
    dayCandidateObjectiveLimit: 32,
    dayCandidateScarceReserve: 32,
    dayCandidateLimit: 64,
    tripFrontierLimit: 32,
  });
  assert.equal(searchDiagnostics.survivors.maxDayRouteFrontier <= 128, true);
  assert.equal(searchDiagnostics.survivors.maxDayCandidates <= 64, true);
  assert.equal(searchDiagnostics.survivors.maxTripFrontier <= 32, true);
});

test("planTrip is deterministic for identical input", () => {
  const fixture = scarceDayFixture();

  assert.deepStrictEqual(planTrip(fixture), planTrip(fixture));
});

test("planTrip stays inside its configured bounds on the 50-candidate 31-day worst case", () => {
  const fixture = worstCasePlannerFixture();
  const plan = planTrip(fixture);
  const { bounds, survivors } = plan.searchDiagnostics;

  assert.equal(plan.days.length, 31);
  assert.equal(fixture.places.length, 50);
  assert.equal(survivors.maxDayRouteFrontier <= bounds.dayRouteFrontierLimit, true);
  assert.equal(survivors.maxDayCandidates <= bounds.dayCandidateLimit, true);
  assert.equal(survivors.maxTripFrontier <= bounds.tripFrontierLimit, true);
  assert.deepEqual(plan.verificationTasks, []);
  assert.deepEqual(plan.validation, { ok: true, issues: [] });
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
