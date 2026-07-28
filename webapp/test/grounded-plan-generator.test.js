import test from "node:test";
import assert from "node:assert/strict";

import {
  assertGoogleGroundedPlanReady,
  createGroundedPlanGenerator,
  createGoogleGroundedPlanGenerator,
} from "../src/planner/grounded-plan-generator.js";
import { createGooglePlacesCollector } from "../src/planner/google-places.js";

function withoutMapsKey(fn) {
  const saved = process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = saved;
  }
}

test("grounded readiness fails when GOOGLE_MAPS_API_KEY is missing", () => {
  withoutMapsKey(() => {
    assert.throws(() => assertGoogleGroundedPlanReady(), (err) => {
      assert.match(err.message, /GOOGLE_MAPS_API_KEY/);
      assert.match(err.message, /\/plan/);
      return true;
    });
  });
});

test("grounded readiness fails when GOOGLE_MAPS_API_KEY is blank", () => {
  assert.throws(() => assertGoogleGroundedPlanReady({ apiKey: "   " }), /GOOGLE_MAPS_API_KEY/);
});

test("grounded readiness never echoes the configured key value", () => {
  const missing = withoutMapsKey(() => {
    try {
      assertGoogleGroundedPlanReady();
      return null;
    } catch (err) {
      return err.message;
    }
  });
  let blank = null;
  try {
    assertGoogleGroundedPlanReady({ apiKey: "  \t " });
  } catch (err) {
    blank = err.message;
  }
  // A constant message cannot leak the value it rejected.
  assert.equal(missing, blank);
});

test("grounded readiness passes when GOOGLE_MAPS_API_KEY is configured", () => {
  assert.doesNotThrow(() => assertGoogleGroundedPlanReady({ apiKey: "configured-key" }));
  withoutMapsKey(() => {
    process.env.GOOGLE_MAPS_API_KEY = "configured-key";
    assert.doesNotThrow(() => assertGoogleGroundedPlanReady());
  });
});

test("google grounded generator refuses to build without a configured key", () => {
  withoutMapsKey(() => {
    assert.throws(() => createGoogleGroundedPlanGenerator(), /GOOGLE_MAPS_API_KEY/);
  });
});

test("grounded generator keeps a meal place inside a default meal break and everything else out of it", async () => {
  const generator = createGroundedPlanGenerator({
    collectors: {
      places: { collect: async () => ({
        source: "places-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        items: [{
          id: "bistro",
          name: "Bistro",
          category: "meal",
          score: 60,
          durationMinutes: 60,
          openingHoursStatus: "verified",
          // Only open over lunch, so scheduling it at all means sitting inside the meal break.
          openingHours: { "2026-08-01": { open: "12:00", close: "14:00" } },
        }, {
          id: "museum",
          name: "Museum",
          score: 80,
          durationMinutes: 240,
          openingHoursStatus: "verified",
          openingHours: { "2026-08-01": { open: "09:00", close: "21:00" } },
        }],
      }) },
      weather: {
        resolveTimezone: async () => ({ timezone: "Asia/Seoul", source: "weather-fixture", fetchedAt: "2026-07-28T10:00:00Z" }),
        collect: async () => ({
          source: "weather-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          timezone: "Asia/Seoul",
          days: [{ date: "2026-08-01", precipitationProbability: 10 }],
        }),
      },
      travel: { collect: async () => ({
        source: "travel-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        matrix: {
          "base|bistro": 0,
          "bistro|base": 0,
          "base|museum": 0,
          "museum|base": 0,
          "bistro|museum": 0,
          "museum|bistro": 0,
        },
      }) },
    },
  });

  const generation = await generator.generate({ destination: "부산", startDate: "2026-08-01", nights: 0 });
  const byId = new Map(generation.groundedPlan.days[0].activities.map((activity) => [activity.placeId, activity]));

  assert.equal(byId.get("bistro").startTime, "12:00");
  assert.equal(byId.get("bistro").endTime, "13:00");
  assert.equal(byId.get("museum").startTime, "13:00");
  assert.equal(byId.get("museum").endTime, "17:00");
  assert.deepEqual(generation.groundedPlan.breakWindows, [
    { start: "12:00", end: "13:00", kind: "meal" },
    { start: "18:00", end: "19:00", kind: "meal" },
  ]);
  assert.deepEqual(generation.groundedPlan.validation, { ok: true, issues: [] });
});

test("grounded generator schedules a provider-mapped night club in its evening window and nature earlier", async () => {
  // 2026-08-01 is a Saturday, which is Google's weekday 6.
  const PROVIDER_PLACES = {
    places: [
      {
        id: "ChIJpark",
        displayName: { text: "Igidae Coastal Park" },
        location: { latitude: 35.13, longitude: 129.12 },
        types: ["park", "tourist_attraction"],
        regularOpeningHours: {
          periods: [{ open: { day: 6, hour: 9, minute: 0 }, close: { day: 6, hour: 18, minute: 0 } }],
        },
      },
      {
        id: "ChIJclub",
        displayName: { text: "Gwangalli Night Club" },
        location: { latitude: 35.15, longitude: 129.13 },
        types: ["night_club", "bar"],
        regularOpeningHours: {
          periods: [{ open: { day: 6, hour: 14, minute: 0 }, close: { day: 6, hour: 23, minute: 59 } }],
        },
      },
    ],
  };
  const fetchImpl = async (url, init) => {
    if (String(url).includes("geocode")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "OK", results: [{ geometry: { location: { lat: 35.1796, lng: 129.0756 } } }] }),
      };
    }
    assert.ok(init.body, "the places search must be a POST with a body");
    return { ok: true, status: 200, json: async () => PROVIDER_PLACES };
  };

  const matrix = {};
  for (const from of ["base", "ChIJpark", "ChIJclub"]) {
    for (const to of ["base", "ChIJpark", "ChIJclub"]) matrix[`${from}|${to}`] = 0;
  }
  const generator = createGroundedPlanGenerator({
    collectors: {
      places: createGooglePlacesCollector({ apiKey: "test-key", fetchImpl, now: () => new Date("2026-07-28T10:00:00Z") }),
      weather: {
        resolveTimezone: async () => ({ timezone: "Asia/Seoul", source: "weather-fixture", fetchedAt: "2026-07-28T10:00:00Z" }),
        collect: async () => ({
          source: "weather-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          timezone: "Asia/Seoul",
          days: [{ date: "2026-08-01", precipitationProbability: 10 }],
        }),
      },
      travel: { collect: async () => ({
        source: "travel-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        status: "verified",
        matrix,
      }) },
    },
  });

  const generation = await generator.generate({ destination: "부산", startDate: "2026-08-01", nights: 0 });
  const byId = new Map(generation.groundedPlan.days[0].activities.map((activity) => [activity.placeId, activity]));

  assert.equal(byId.get("ChIJclub").startTime, "19:00", "nightlife starts inside its provider-mapped evening window");
  assert.equal(byId.get("ChIJclub").endTime, "21:00");
  assert.equal(byId.get("ChIJclub").preferredWindowMatched, true);
  assert.equal(byId.get("ChIJpark").startTime, "09:00", "a nature place takes the daytime slot");
  assert.equal(byId.get("ChIJpark").endTime, "11:30", "and gets the nature visit duration, not a universal 90 minutes");
  assert.deepEqual(generation.groundedPlan.validation, { ok: true, issues: [] });
  assert.equal(generation.groundedPlan.quality.hardConstraintViolations, 0);
  assert.equal(generation.groundedPlan.scheduleQuality.preferredWindowMisses, 0);

  const evidenceById = new Map(generation.evidence.places.items.map((item) => [item.id, item]));
  assert.equal(evidenceById.get("ChIJclub").category, "nightlife");
  assert.deepEqual(evidenceById.get("ChIJclub").types, ["night_club", "bar"]);
  assert.deepEqual(evidenceById.get("ChIJclub").preferredWindows, [{ start: "19:00", end: "23:59" }]);
  assert.equal(evidenceById.get("ChIJpark").category, "nature");
  assert.equal(evidenceById.get("ChIJpark").durationMinutes, 150);
  for (const item of evidenceById.values()) {
    assert.equal(item.openingHoursStatus, "verified", "only provider-verified hours may reach the planner");
    assert.ok(item.openingHours["2026-08-01"]);
  }
  assert.equal(generation.evidence.places.status, "verified");
  assert.equal(generation.evidence.travel.source, "travel-fixture");
});

test("google grounded generator plans a flight trip with local driving inside the arrival window", async () => {
  const PLACES = {
    places: [{
      id: "museum",
      displayName: { text: "후쿠오카시박물관" },
      location: { latitude: 33.58, longitude: 130.35 },
      rating: 4.5,
      userRatingCount: 1000,
      types: ["museum"],
      regularOpeningHours: { periods: [
        { open: { day: 6, hour: 9 }, close: { day: 6, hour: 18 } },
        { open: { day: 0, hour: 9 }, close: { day: 0, hour: 18 } },
      ] },
    }],
  };
  const distanceMatrixCalls = [];
  const fetchImpl = async (request) => {
    const url = new URL(request);
    if (url.pathname.includes("/geocode/")) {
      return { ok: true, status: 200, json: async () => ({ status: "OK", results: [{ geometry: { location: { lat: 33.5902, lng: 130.4017 } } }] }) };
    }
    if (url.hostname === "places.googleapis.com") {
      return { ok: true, status: 200, json: async () => PLACES };
    }
    if (url.hostname === "api.open-meteo.com") {
      return { ok: true, status: 200, json: async () => ({
        timezone: "Asia/Tokyo",
        daily: {
          time: ["2026-08-01", "2026-08-02"],
          precipitation_probability_max: [10, 20],
          weather_code: [1, 2],
          temperature_2m_max: [31, 30],
          temperature_2m_min: [25, 24],
        },
      }) };
    }
    if (url.pathname.includes("/distancematrix/")) {
      distanceMatrixCalls.push(url);
      const origins = url.searchParams.get("origins").split("|");
      const destinations = url.searchParams.get("destinations").split("|");
      return { ok: true, status: 200, json: async () => ({
        status: "OK",
        rows: origins.map(() => ({ elements: destinations.map(() => ({ status: "OK", duration: { value: 1200 } })) })),
      }) };
    }
    throw new Error(`unexpected request: ${url.origin}${url.pathname}`);
  };

  const generation = await createGoogleGroundedPlanGenerator({
    apiKey: "test-key",
    fetchImpl,
    now: () => new Date("2026-07-28T10:00:00Z"),
  }).generate({
    destination: "후쿠오카",
    departure: "서울",
    startDate: "2026-08-01",
    nights: 1,
    transportPref: "flight",
    arrivalTime: "13:30",
    departureTime: "12:00",
  });

  assert.ok(distanceMatrixCalls.length > 0);
  for (const url of distanceMatrixCalls) {
    assert.equal(url.searchParams.get("mode"), "driving", "a flight trip drives locally, it does not take transit");
    assert.ok(!url.searchParams.get("origins").includes("서울"), "the airline leg must never be routed by road");
  }
  assert.equal(generation.evidence.travel.localTransport.mode, "driving");
  assert.equal(generation.evidence.travel.majorTransport.outbound.status, "unavailable");
  assert.equal(generation.evidence.travel.majorTransport.inbound.status, "unavailable");

  const [arrivalDay, departureDay] = generation.groundedPlan.days;
  assert.equal(arrivalDay.availableFrom, "13:30");
  assert.equal(departureDay.availableUntil, "12:00");
  for (const day of generation.groundedPlan.days) {
    for (const activity of day.activities) {
      assert.ok(activity.startTime >= day.availableFrom, `${activity.startTime} must not precede ${day.availableFrom}`);
      assert.ok(activity.endTime <= day.availableUntil, `${activity.endTime} must not exceed ${day.availableUntil}`);
    }
  }
  assert.equal(
    generation.groundedPlan.verificationTasks.filter((task) => task.code === "MAJOR_TRANSPORT_UNAVAILABLE").length,
    2
  );
  assert.equal(generation.status, "needs_review");
});

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
            openingHoursStatus: "verified",
            openingHours: {
              "2026-08-01": { open: "09:00", close: "18:00" },
              "2026-08-02": { open: "09:00", close: "18:00" },
              "2026-08-03": { open: "09:00", close: "18:00" },
            },
          }],
        };
      } },
      weather: {
        resolveTimezone: async () => ({ timezone: "Asia/Seoul", source: "weather-fixture", fetchedAt: "2026-07-28T10:00:00Z" }),
        collect: async () => ({
          source: "weather-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          timezone: "Asia/Seoul",
          days: ["2026-08-01", "2026-08-02", "2026-08-03"].map((date) => ({
            date,
            precipitationProbability: 20,
          })),
        }),
      },
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
