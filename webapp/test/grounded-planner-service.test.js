import test from "node:test";
import assert from "node:assert/strict";

import { createGroundedTripPlan } from "../src/planner/grounded-planner-service.js";

test("createGroundedTripPlan plans only from collected place and travel evidence", async () => {
  const trip = {
    destination: "Busan",
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    dailyStartTime: "09:00",
    dailyEndTime: "18:00",
    baseLocationId: "hotel",
  };
  const placeSnapshot = {
    source: "places-fixture",
    fetchedAt: "2026-07-28T10:00:00Z",
    location: { latitude: 35.1796, longitude: 129.0756 },
    destinationLocation: { latitude: 35.1796, longitude: 129.0756 },
    baseLocation: { latitude: 35.1531, longitude: 129.1186 },
    items: [{
      id: "museum",
      name: "Museum",
      score: 80,
      durationMinutes: 120,
      openingHoursStatus: "verified",
      openingHours: {
        "2026-08-01": { open: "10:00", close: "18:00" },
        "2026-08-02": { open: "10:00", close: "18:00" },
      },
    }],
  };
  const weatherSnapshot = {
    source: "weather-fixture",
    fetchedAt: "2026-07-28T10:00:00Z",
    timezone: "Asia/Seoul",
    days: [
      { date: "2026-08-01", precipitationProbability: 20 },
      { date: "2026-08-02", precipitationProbability: 20 },
    ],
  };
  const travelSnapshot = {
    source: "travel-fixture",
    fetchedAt: "2026-07-28T10:01:00Z",
    matrix: { "hotel|museum": 30, "museum|hotel": 30 },
  };
  let weatherCoordinates;
  let travelPlaceIds;
  let travelTimezone;
  let travelCoordinates;
  const result = await createGroundedTripPlan({
    trip,
    collectors: {
      places: { collect: async () => placeSnapshot },
      weather: {
        resolveTimezone: async () => ({ timezone: "Asia/Seoul", source: "weather-fixture", fetchedAt: "2026-07-28T10:00:00Z" }),
        collect: async (resolvedTrip) => {
          weatherCoordinates = [resolvedTrip.latitude, resolvedTrip.longitude];
          return weatherSnapshot;
        },
      },
      travel: {
        collect: async (resolvedTrip, places) => {
          travelTimezone = resolvedTrip.timezone;
          travelCoordinates = [resolvedTrip.latitude, resolvedTrip.longitude];
          travelPlaceIds = places.map((place) => place.id);
          return travelSnapshot;
        },
      },
    },
  });

  assert.deepEqual(weatherCoordinates, [35.1796, 129.0756]);
  assert.equal(travelTimezone, "Asia/Seoul");
  assert.deepEqual(travelCoordinates, [35.1531, 129.1186]);
  assert.deepEqual(travelPlaceIds, ["museum"]);
  assert.equal(result.status, "ready");
  assert.equal(result.plan.validation.ok, true);
  assert.equal(result.plan.days[0].activities[0].placeId, "museum");
  assert.deepEqual(result.plan.quality, {
    hardConstraintViolations: 0,
    totalTravelMinutes: 60,
    scheduledPlaceRatio: 1,
    verifiedPlaceRatio: 1,
    requiredPlaceCoverage: null,
    confirmationCount: 0,
  });
  assert.deepEqual(result.evidence, {
    places: placeSnapshot,
    weather: weatherSnapshot,
    travel: travelSnapshot,
    timezone: {
      timezone: "Asia/Seoul",
      source: "weather-fixture",
      fetchedAt: "2026-07-28T10:00:00Z",
      status: "verified",
    },
  });
});

test("createGroundedTripPlan flags scheduled outdoor activities exposed to forecast rain", async () => {
  const trip = {
    startDate: "2026-08-01",
    endDate: "2026-08-01",
    dailyStartTime: "09:00",
    dailyEndTime: "18:00",
    baseLocationId: "hotel",
  };
  const result = await createGroundedTripPlan({
    trip,
    collectors: {
      places: { collect: async () => ({
        source: "places-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        items: [{
          id: "beach",
          name: "Beach",
          outdoor: true,
          score: 80,
          durationMinutes: 120,
          openingHoursStatus: "verified",
          openingHours: { "2026-08-01": { open: "09:00", close: "18:00" } },
        }],
      }) },
      weather: {
        resolveTimezone: async () => ({ timezone: "Asia/Seoul", source: "weather-fixture", fetchedAt: "2026-07-28T10:00:00Z" }),
        collect: async () => ({
          source: "weather-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          timezone: "Asia/Seoul",
          days: [{ date: "2026-08-01", precipitationProbability: 80 }],
        }),
      },
      travel: { collect: async () => ({
        source: "travel-fixture",
        fetchedAt: "2026-07-28T10:01:00Z",
        matrix: { "hotel|beach": 20, "beach|hotel": 20 },
      }) },
    },
  });

  assert.equal(result.status, "needs_review");
  assert.deepEqual(result.plan.verificationTasks, [{
    code: "WEATHER_RISK",
    date: "2026-08-01",
    placeId: "beach",
    precipitationProbability: 80,
    message: "Beach is outdoors with 80% precipitation probability",
  }]);
});

test("createGroundedTripPlan keeps planning when weather is outside the forecast window", async () => {
  let travelTimezone;
  const result = await createGroundedTripPlan({
    trip: { startDate: "2026-10-01", endDate: "2026-10-01", baseLocationId: "hotel" },
    collectors: {
      places: { collect: async () => ({
        source: "places-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        location: { latitude: 35.1, longitude: 129.1 },
        items: [{
          id: "museum",
          name: "Museum",
          score: 70,
          durationMinutes: 60,
          openingHoursStatus: "verified",
          openingHours: { "2026-10-01": { open: "09:00", close: "18:00" } },
        }],
      }) },
      weather: { collect: async () => { throw new Error("forecast window exceeded"); } },
      travel: { collect: async (trip) => {
        travelTimezone = trip.timezone;
        return {
          source: "travel-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          matrix: { "hotel|museum": 10, "museum|hotel": 10 },
        };
      } },
    },
  });

  assert.equal(result.status, "needs_review");
  assert.equal(travelTimezone, "UTC");
  assert.deepEqual(result.plan.days[0].activities.map((activity) => activity.placeId), ["museum"]);
  assert.equal(result.evidence.weather.status, "unavailable");
  assert.equal(result.plan.verificationTasks[0].code, "WEATHER_UNAVAILABLE");
});

test("createGroundedTripPlan uses the independently resolved timezone when the forecast request fails", async () => {
  let travelTimezone;
  let resolveTimezoneTrip;
  const result = await createGroundedTripPlan({
    trip: { startDate: "2027-06-01", endDate: "2027-06-01", baseLocationId: "hotel", timezone: "auto" },
    now: () => new Date("2026-07-28T10:00:00Z"),
    collectors: {
      places: { collect: async () => ({
        source: "places-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        location: { latitude: 10.8231, longitude: 106.6297 },
        items: [{
          id: "museum",
          name: "Museum",
          score: 70,
          durationMinutes: 60,
          openingHoursStatus: "verified",
          openingHours: { "2027-06-01": { open: "09:00", close: "18:00" } },
        }],
      }) },
      weather: {
        resolveTimezone: async (trip) => {
          resolveTimezoneTrip = trip;
          return { timezone: "Asia/Ho_Chi_Minh", source: "open-meteo", fetchedAt: "2026-07-28T10:00:00Z" };
        },
        collect: async () => { throw new Error("Open-Meteo request failed: 400"); },
      },
      travel: { collect: async (trip) => {
        travelTimezone = trip.timezone;
        return {
          source: "travel-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          status: "verified",
          confidence: "high",
          matrix: { "hotel|museum": 10, "museum|hotel": 10 },
        };
      } },
    },
  });

  assert.deepEqual([resolveTimezoneTrip.latitude, resolveTimezoneTrip.longitude], [10.8231, 106.6297]);
  assert.equal(travelTimezone, "Asia/Ho_Chi_Minh");
  assert.equal(result.evidence.weather.status, "unavailable");
  assert.equal(result.evidence.weather.timezone, "Asia/Ho_Chi_Minh");
  assert.equal(result.evidence.travel.status, "verified");
  assert.deepEqual(result.evidence.timezone, {
    timezone: "Asia/Ho_Chi_Minh",
    source: "open-meteo",
    fetchedAt: "2026-07-28T10:00:00Z",
    status: "verified",
  });
  assert.deepEqual(result.plan.verificationTasks.map((task) => task.code), ["WEATHER_UNAVAILABLE"]);
});

test("createGroundedTripPlan keeps an explicit trip timezone without a timezone lookup", async () => {
  let resolveTimezoneCalls = 0;
  let travelTimezone;
  const result = await createGroundedTripPlan({
    trip: { startDate: "2027-06-01", endDate: "2027-06-01", baseLocationId: "hotel", timezone: "Asia/Seoul" },
    now: () => new Date("2026-07-28T10:00:00Z"),
    collectors: {
      places: { collect: async () => ({
        source: "places-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        items: [],
      }) },
      weather: {
        resolveTimezone: async () => { resolveTimezoneCalls += 1; return { timezone: "Asia/Ho_Chi_Minh" }; },
        collect: async () => { throw new Error("Open-Meteo request failed: 400"); },
      },
      travel: { collect: async (trip) => {
        travelTimezone = trip.timezone;
        return { source: "travel-fixture", fetchedAt: "2026-07-28T10:00:00Z", matrix: {} };
      } },
    },
  });

  assert.equal(resolveTimezoneCalls, 0);
  assert.equal(travelTimezone, "Asia/Seoul");
  assert.equal(result.evidence.timezone.source, "trip");
  assert.ok(!result.plan.verificationTasks.some((task) => task.code === "TIMEZONE_UNAVAILABLE"));
});

test("createGroundedTripPlan fails closed when the timezone itself cannot be resolved", async () => {
  let travelTimezone;
  const result = await createGroundedTripPlan({
    trip: { startDate: "2027-06-01", endDate: "2027-06-01", baseLocationId: "hotel", timezone: "auto" },
    now: () => new Date("2026-07-28T10:00:00Z"),
    collectors: {
      places: { collect: async () => ({
        source: "places-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        items: [],
      }) },
      weather: {
        resolveTimezone: async () => { throw new Error("timezone lookup failed: 503"); },
        collect: async () => { throw new Error("Open-Meteo request failed: 400"); },
      },
      travel: { collect: async (trip) => {
        travelTimezone = trip.timezone;
        return {
          source: "travel-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          status: "verified",
          confidence: "high",
          matrix: {},
        };
      } },
    },
  });

  assert.equal(travelTimezone, "UTC");
  assert.equal(result.status, "needs_review");
  assert.deepEqual(result.evidence.timezone, {
    timezone: "UTC",
    source: "fallback",
    fetchedAt: "2026-07-28T10:00:00.000Z",
    status: "unavailable",
    error: "timezone lookup failed: 503",
  });
  assert.equal(result.evidence.travel.status, "unverified");
  assert.equal(result.evidence.travel.confidence, "low");
  // The fallback only shifts what a departure moment means, so the task must name transit timing
  // instead of claiming every itinerary time was computed in UTC.
  assert.deepEqual(result.plan.verificationTasks.filter((task) => task.code === "TIMEZONE_UNAVAILABLE"), [{
    code: "TIMEZONE_UNAVAILABLE",
    timezone: "UTC",
    message: "Destination timezone could not be resolved (timezone lookup failed: 503), so time-dependent transit and travel durations were requested with UTC departure timing and must be confirmed",
  }]);
});

test("createGroundedTripPlan fails closed when the trip names an invalid IANA timezone", async () => {
  let travelTimezone;
  const result = await createGroundedTripPlan({
    trip: { startDate: "2026-08-01", endDate: "2026-08-01", baseLocationId: "hotel", timezone: "Asia/Seuol" },
    now: () => new Date("2026-07-28T10:00:00Z"),
    collectors: {
      places: { collect: async () => ({
        source: "places-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        items: [],
      }) },
      weather: {
        resolveTimezone: async () => { throw new Error("resolveTimezone must not run for an explicit timezone"); },
        collect: async () => ({
          source: "weather-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          timezone: "Asia/Seoul",
          days: [{ date: "2026-08-01", precipitationProbability: 10 }],
        }),
      },
      travel: { collect: async (trip) => {
        // Mirrors the Distance Matrix collector: an unreal zone throws when departure timing is computed.
        new Intl.DateTimeFormat("en-CA", { timeZone: trip.timezone });
        travelTimezone = trip.timezone;
        return {
          source: "travel-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          status: "verified",
          confidence: "high",
          matrix: {},
        };
      } },
    },
  });

  assert.equal(travelTimezone, "UTC");
  assert.equal(result.status, "needs_review");
  assert.equal(result.evidence.timezone.timezone, "UTC");
  assert.equal(result.evidence.timezone.status, "unavailable");
  assert.match(result.evidence.timezone.error, /Asia\/Seuol/);
  assert.equal(result.evidence.travel.status, "unverified");
  assert.equal(result.evidence.travel.confidence, "low");
  assert.ok(result.plan.verificationTasks.some((task) => task.code === "TIMEZONE_UNAVAILABLE"));
});

test("createGroundedTripPlan fails closed when the timezone lookup returns an unreal zone", async () => {
  const result = await createGroundedTripPlan({
    trip: { startDate: "2026-08-01", endDate: "2026-08-01", baseLocationId: "hotel", timezone: "auto" },
    now: () => new Date("2026-07-28T10:00:00Z"),
    collectors: {
      places: { collect: async () => ({
        source: "places-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        items: [],
      }) },
      weather: {
        resolveTimezone: async () => ({ timezone: "Mars/Olympus", source: "open-meteo" }),
        collect: async () => { throw new Error("Open-Meteo request failed: 400"); },
      },
      travel: { collect: async () => ({
        source: "travel-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        status: "verified",
        confidence: "high",
        matrix: {},
      }) },
    },
  });

  assert.equal(result.evidence.timezone.timezone, "UTC");
  assert.match(result.evidence.timezone.error, /Mars\/Olympus/);
  assert.equal(result.evidence.travel.status, "unverified");
  assert.ok(result.plan.verificationTasks.some((task) => task.code === "TIMEZONE_UNAVAILABLE"));
});

test("createGroundedTripPlan flags a degraded lookup when only the forecast carries the timezone", async () => {
  let travelTimezone;
  const result = await createGroundedTripPlan({
    trip: { startDate: "2026-08-01", endDate: "2026-08-01", baseLocationId: "hotel", timezone: "auto" },
    now: () => new Date("2026-07-28T10:00:00Z"),
    collectors: {
      places: { collect: async () => ({
        source: "places-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        items: [],
      }) },
      weather: {
        resolveTimezone: async () => { throw new Error("timezone lookup failed: 503"); },
        collect: async () => ({
          source: "weather-fixture",
          fetchedAt: "2026-07-28T10:00:30Z",
          timezone: "Asia/Seoul",
          days: [{ date: "2026-08-01", precipitationProbability: 10 }],
        }),
      },
      travel: { collect: async (trip) => {
        travelTimezone = trip.timezone;
        return {
          source: "travel-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          status: "verified",
          confidence: "high",
          matrix: {},
        };
      } },
    },
  });

  // The forecast timezone is real, so departure timing stays correct, but the failed lookup
  // behind it must stay visible in the evidence and in a task.
  assert.equal(travelTimezone, "Asia/Seoul");
  assert.equal(result.evidence.travel.status, "verified");
  assert.deepEqual(result.evidence.timezone, {
    timezone: "Asia/Seoul",
    source: "weather-fixture",
    fetchedAt: "2026-07-28T10:00:30Z",
    status: "degraded",
    lookupError: "timezone lookup failed: 503",
  });
  assert.deepEqual(result.plan.verificationTasks, [{
    code: "TIMEZONE_LOOKUP_DEGRADED",
    timezone: "Asia/Seoul",
    message: "Independent timezone lookup failed (timezone lookup failed: 503), so Asia/Seoul from weather-fixture was used for time-dependent transit departure timing and must be confirmed",
  }]);
});

test("createGroundedTripPlan does not read a timezone off an unavailable forecast snapshot", async () => {
  let travelTimezone;
  const result = await createGroundedTripPlan({
    trip: { startDate: "2026-08-01", endDate: "2026-08-01", baseLocationId: "hotel", timezone: "auto" },
    now: () => new Date("2026-07-28T10:00:00Z"),
    collectors: {
      places: { collect: async () => ({
        source: "places-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        items: [],
      }) },
      weather: {
        resolveTimezone: async () => { throw new Error("timezone lookup failed: 503"); },
        // A replayed snapshot from a failed forecast carries the UTC fallback it was written with,
        // which is not a second source: nobody resolved it.
        collect: async () => ({
          source: "weather-unavailable",
          fetchedAt: "2026-07-28T10:00:30Z",
          status: "unavailable",
          timezone: "UTC",
          days: [],
          error: "Open-Meteo request failed: 400",
        }),
      },
      travel: { collect: async (trip) => {
        travelTimezone = trip.timezone;
        return {
          source: "travel-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          status: "verified",
          confidence: "high",
          matrix: {},
        };
      } },
    },
  });

  assert.equal(travelTimezone, "UTC");
  assert.equal(result.status, "needs_review");
  assert.deepEqual(result.evidence.timezone, {
    timezone: "UTC",
    source: "fallback",
    fetchedAt: "2026-07-28T10:00:00.000Z",
    status: "unavailable",
    error: "timezone lookup failed: 503",
  });
  assert.equal(result.evidence.travel.status, "unverified");
  assert.deepEqual(result.plan.verificationTasks.map((task) => task.code), [
    "WEATHER_UNAVAILABLE",
    "TIMEZONE_UNAVAILABLE",
  ]);
});

test("createGroundedTripPlan replaces a malformed lookup timestamp with the injected clock", async () => {
  const result = await createGroundedTripPlan({
    trip: { startDate: "2027-06-01", endDate: "2027-06-01", baseLocationId: "hotel", timezone: "auto" },
    now: () => new Date("2026-07-28T10:00:00Z"),
    collectors: {
      places: { collect: async () => ({
        source: "places-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        items: [],
      }) },
      weather: {
        resolveTimezone: async () => ({ timezone: "Asia/Ho_Chi_Minh", source: "open-meteo", fetchedAt: "yesterday" }),
        collect: async () => { throw new Error("Open-Meteo request failed: 400"); },
      },
      travel: { collect: async () => ({
        source: "travel-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        matrix: {},
      }) },
    },
  });

  assert.deepEqual(result.evidence.timezone, {
    timezone: "Asia/Ho_Chi_Minh",
    source: "open-meteo",
    fetchedAt: "2026-07-28T10:00:00.000Z",
    status: "verified",
  });
});

test("createGroundedTripPlan exposes places whose opening hours could not be verified", async () => {
  const result = await createGroundedTripPlan({
    trip: { startDate: "2026-08-01", endDate: "2026-08-01", baseLocationId: "hotel" },
    collectors: {
      places: { collect: async () => ({
        source: "places-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        items: [{
          id: "gallery",
          name: "Gallery",
          score: 70,
          durationMinutes: 60,
          openingHoursStatus: "unknown",
          openingHours: {},
        }, {
          id: "night-market",
          name: "Night Market",
          score: 60,
          durationMinutes: 60,
          openingHoursStatus: "unsupported",
          openingHours: {},
        }],
      }) },
      weather: {
        resolveTimezone: async () => ({ timezone: "Asia/Seoul", source: "weather-fixture", fetchedAt: "2026-07-28T10:00:00Z" }),
        collect: async () => ({
          source: "weather-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          timezone: "Asia/Seoul",
          days: [{ date: "2026-08-01", precipitationProbability: 20 }],
        }),
      },
      travel: { collect: async () => ({
        source: "travel-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        matrix: { "hotel|gallery": 10, "gallery|hotel": 10 },
      }) },
    },
  });

  assert.equal(result.status, "needs_review");
  assert.deepEqual(result.plan.days[0].activities, []);
  assert.deepEqual(result.plan.verificationTasks, [{
    code: "MISSING_OR_UNVERIFIED_OPENING_HOURS",
    placeId: "gallery",
    openingHoursStatus: "unknown",
    message: "Gallery opening hours are unknown, not provider-verified, so it cannot be scheduled",
  }, {
    code: "MISSING_OR_UNVERIFIED_OPENING_HOURS",
    placeId: "night-market",
    openingHoursStatus: "unsupported",
    message: "Night Market opening hours are unsupported, not provider-verified, so it cannot be scheduled",
  }]);
});

test("createGroundedTripPlan refuses to schedule estimated opening hours", async () => {
  const result = await createGroundedTripPlan({
    trip: { startDate: "2026-08-01", endDate: "2026-08-01", baseLocationId: "hotel" },
    collectors: {
      places: { collect: async () => ({
        source: "places-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        items: [{
          id: "spa",
          name: "Spa",
          score: 70,
          durationMinutes: 60,
          openingHoursStatus: "estimated",
          openingHours: { "2026-08-01": { open: "09:00", close: "18:00" } },
        }],
      }) },
      weather: {
        resolveTimezone: async () => ({ timezone: "Asia/Seoul", source: "weather-fixture", fetchedAt: "2026-07-28T10:00:00Z" }),
        collect: async () => ({
          source: "weather-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          timezone: "Asia/Seoul",
          days: [{ date: "2026-08-01", precipitationProbability: 20 }],
        }),
      },
      travel: { collect: async () => ({
        source: "travel-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        matrix: { "hotel|spa": 10, "spa|hotel": 10 },
      }) },
    },
  });

  assert.equal(result.status, "needs_review");
  assert.deepEqual(result.plan.days[0].activities, []);
  assert.deepEqual(result.plan.unscheduledPlaceIds, ["spa"]);
  assert.deepEqual(result.plan.verificationTasks, [{
    code: "MISSING_OR_UNVERIFIED_OPENING_HOURS",
    placeId: "spa",
    openingHoursStatus: "estimated",
    message: "Spa opening hours are estimated, not provider-verified, so it cannot be scheduled",
  }]);
  assert.equal(result.plan.quality.scheduledPlaceRatio, 0);
  assert.equal(result.plan.quality.verifiedPlaceRatio, 0);
  assert.equal(result.evidence.places.items[0].openingHoursStatus, "estimated");
});

test("createGroundedTripPlan offers only verified places to the travel collector", async () => {
  let travelPlaceIds;
  const result = await createGroundedTripPlan({
    trip: { startDate: "2026-08-01", endDate: "2026-08-01", baseLocationId: "hotel" },
    collectors: {
      places: { collect: async () => ({
        source: "places-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        items: [{
          id: "museum",
          name: "Museum",
          score: 80,
          durationMinutes: 60,
          openingHoursStatus: "verified",
          openingHours: { "2026-08-01": { open: "09:00", close: "18:00" } },
        }, {
          id: "spa",
          name: "Spa",
          score: 70,
          durationMinutes: 60,
          openingHoursStatus: "estimated",
          openingHours: { "2026-08-01": { open: "09:00", close: "18:00" } },
        }],
      }) },
      weather: {
        resolveTimezone: async () => ({ timezone: "Asia/Seoul", source: "weather-fixture", fetchedAt: "2026-07-28T10:00:00Z" }),
        collect: async () => ({
          source: "weather-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          timezone: "Asia/Seoul",
          days: [{ date: "2026-08-01", precipitationProbability: 20 }],
        }),
      },
      travel: { collect: async (_trip, places) => {
        travelPlaceIds = places.map((place) => place.id);
        // No spa legs: an unverified place must never cost a matrix element.
        return {
          source: "travel-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          matrix: { "hotel|museum": 10, "museum|hotel": 10 },
        };
      } },
    },
  });

  assert.deepEqual(travelPlaceIds, ["museum"]);
  assert.equal(result.evidence.places.items.length, 2);
  assert.equal(result.status, "needs_review");
  assert.deepEqual(result.plan.days[0].activities.map((activity) => activity.placeId), ["museum"]);
  assert.deepEqual(result.plan.unscheduledPlaceIds, ["spa"]);
  assert.equal(result.plan.quality.scheduledPlaceRatio, 0.5);
  assert.equal(result.plan.quality.verifiedPlaceRatio, 0.5);
});

test("createGroundedTripPlan fails closed when openingHoursStatus is missing", async () => {
  let travelPlaceIds;
  const result = await createGroundedTripPlan({
    trip: { startDate: "2026-08-01", endDate: "2026-08-01", baseLocationId: "hotel" },
    collectors: {
      places: { collect: async () => ({
        source: "places-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        items: [{
          id: "cafe",
          name: "Cafe",
          score: 70,
          durationMinutes: 60,
          openingHours: { "2026-08-01": { open: "09:00", close: "18:00" } },
        }],
      }) },
      weather: {
        resolveTimezone: async () => ({ timezone: "Asia/Seoul", source: "weather-fixture", fetchedAt: "2026-07-28T10:00:00Z" }),
        collect: async () => ({
          source: "weather-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          timezone: "Asia/Seoul",
          days: [{ date: "2026-08-01", precipitationProbability: 20 }],
        }),
      },
      travel: { collect: async (_trip, places) => {
        travelPlaceIds = places.map((place) => place.id);
        return { source: "travel-fixture", fetchedAt: "2026-07-28T10:00:00Z", matrix: {} };
      } },
    },
  });

  assert.deepEqual(travelPlaceIds, []);
  assert.equal(result.status, "needs_review");
  assert.deepEqual(result.plan.days[0].activities, []);
  assert.deepEqual(result.plan.unscheduledPlaceIds, ["cafe"]);
  assert.deepEqual(result.plan.verificationTasks, [{
    code: "MISSING_OR_UNVERIFIED_OPENING_HOURS",
    placeId: "cafe",
    openingHoursStatus: "missing",
    message: "Cafe opening hours are missing, not provider-verified, so it cannot be scheduled",
  }]);
  assert.equal(result.plan.quality.verifiedPlaceRatio, 0);
});

test("createGroundedTripPlan exposes an unavailable major transport leg", async () => {
  const result = await createGroundedTripPlan({
    trip: { startDate: "2026-08-01", endDate: "2026-08-01", baseLocationId: "hotel" },
    collectors: {
      places: { collect: async () => ({
        source: "places-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        location: { latitude: 35.1796, longitude: 129.0756 },
        items: [],
      }) },
      weather: {
        resolveTimezone: async () => ({ timezone: "Asia/Seoul", source: "weather-fixture", fetchedAt: "2026-07-28T10:00:00Z" }),
        collect: async () => ({
          source: "weather-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          timezone: "Asia/Seoul",
          days: [{ date: "2026-08-01", precipitationProbability: 20 }],
        }),
      },
      travel: { collect: async () => ({
        source: "travel-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        matrix: {},
        majorLeg: {
          status: "unavailable",
          origin: "서울",
          destination: "부산",
          mode: "transit",
          reason: "ZERO_RESULTS",
        },
      }) },
    },
  });

  assert.ok(result.plan.verificationTasks.some((task) => task.code === "MAJOR_TRANSPORT_UNAVAILABLE"));
});

test("createGroundedTripPlan confirms each unavailable major transport segment exactly once", async () => {
  const flightSegment = (direction, origin, destination) => ({
    direction,
    mode: "flight",
    origin,
    destination,
    status: "unavailable",
    reason: "verified flight schedule and airport evidence is not configured",
  });
  const result = await createGroundedTripPlan({
    trip: { startDate: "2026-08-01", endDate: "2026-08-01", baseLocationId: "hotel" },
    collectors: {
      places: { collect: async () => ({
        source: "places-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        location: { latitude: 33.5902, longitude: 130.4017 },
        items: [],
      }) },
      weather: {
        resolveTimezone: async () => ({ timezone: "Asia/Tokyo", source: "weather-fixture", fetchedAt: "2026-07-28T10:00:00Z" }),
        collect: async () => ({
          source: "weather-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          timezone: "Asia/Tokyo",
          days: [{ date: "2026-08-01", precipitationProbability: 20 }],
        }),
      },
      travel: { collect: async () => ({
        source: "travel-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        matrix: {},
        localTransport: { mode: "driving", status: "verified", confidence: "high" },
        // A snapshot may still carry the compatibility field; it must not double-count.
        majorLeg: flightSegment("outbound", "서울", "후쿠오카"),
        majorTransport: {
          outbound: flightSegment("outbound", "서울", "후쿠오카"),
          inbound: flightSegment("inbound", "후쿠오카", "서울"),
        },
      }) },
    },
  });

  const tasks = result.plan.verificationTasks.filter((task) => task.code === "MAJOR_TRANSPORT_UNAVAILABLE");
  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks.map((task) => task.direction), ["outbound", "inbound"]);
  assert.match(tasks[0].message, /서울 -> 후쿠오카/);
  assert.match(tasks[0].message, /flight schedule/);
  assert.match(tasks[1].message, /후쿠오카 -> 서울/);
  assert.equal(result.status, "needs_review");
});

test("createGroundedTripPlan downgrades local transport evidence with the travel snapshot", async () => {
  const result = await createGroundedTripPlan({
    trip: { startDate: "2027-06-01", endDate: "2027-06-01", baseLocationId: "hotel", timezone: "auto" },
    now: () => new Date("2026-07-28T10:00:00Z"),
    collectors: {
      places: { collect: async () => ({ source: "places-fixture", fetchedAt: "2026-07-28T10:00:00Z", items: [] }) },
      weather: {
        resolveTimezone: async () => { throw new Error("timezone lookup failed: 503"); },
        collect: async () => { throw new Error("Open-Meteo request failed: 400"); },
      },
      travel: { collect: async () => ({
        source: "travel-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        status: "verified",
        confidence: "high",
        matrix: {},
        localTransport: { mode: "transit", status: "verified", confidence: "high" },
      }) },
    },
  });

  assert.equal(result.evidence.travel.status, "unverified");
  assert.deepEqual(result.evidence.travel.localTransport, {
    mode: "transit",
    status: "unverified",
    confidence: "low",
  });
});

test("createGroundedTripPlan cannot keep a road major leg verified under a fallback timezone", async () => {
  const result = await createGroundedTripPlan({
    trip: { startDate: "2027-06-01", endDate: "2027-06-01", baseLocationId: "hotel", timezone: "auto" },
    now: () => new Date("2026-07-28T10:00:00Z"),
    collectors: {
      places: { collect: async () => ({ source: "places-fixture", fetchedAt: "2026-07-28T10:00:00Z", items: [] }) },
      weather: {
        resolveTimezone: async () => { throw new Error("timezone lookup failed: 503"); },
        collect: async () => { throw new Error("Open-Meteo request failed: 400"); },
      },
      travel: { collect: async () => ({
        source: "travel-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        status: "verified",
        confidence: "high",
        matrix: {},
        localTransport: { mode: "transit", status: "verified", confidence: "high" },
        majorLeg: { status: "verified", origin: "서울", destination: "부산", mode: "transit", durationMinutes: 180 },
        majorTransport: {
          outbound: {
            direction: "outbound",
            status: "verified",
            origin: "서울",
            destination: "부산",
            mode: "transit",
            durationMinutes: 180,
          },
        },
      }) },
    },
  });

  const outbound = result.evidence.travel.majorTransport.outbound;
  assert.equal(outbound.status, "unverified");
  assert.equal(outbound.confidence, "low");
  assert.match(outbound.reason, /timezone/i);
  assert.equal(outbound.durationMinutes, 180, "the collected duration stays visible, it just stops being verified");
  assert.equal(result.evidence.travel.majorLeg.status, "unverified");
  assert.equal(
    result.plan.verificationTasks.filter((task) => task.code === "MAJOR_TRANSPORT_TIMEZONE_UNVERIFIED").length,
    1,
    "one confirmation covers the whole time-shifted major request"
  );
  assert.equal(
    result.plan.verificationTasks.filter((task) => task.code === "MAJOR_TRANSPORT_UNAVAILABLE").length,
    0,
    "a time-shifted leg is unverified, not missing"
  );
  assert.deepEqual(result.evidence.travel.localTransport, {
    mode: "transit",
    status: "unverified",
    confidence: "low",
  });
});

test("createGroundedTripPlan leaves an unavailable flight leg to its own confirmation under a fallback timezone", async () => {
  const flightSegment = (direction, origin, destination) => ({
    direction,
    mode: "flight",
    origin,
    destination,
    status: "unavailable",
    reason: "verified flight schedule and airport evidence is not configured",
  });
  const result = await createGroundedTripPlan({
    trip: { startDate: "2027-06-01", endDate: "2027-06-01", baseLocationId: "hotel", timezone: "auto" },
    now: () => new Date("2026-07-28T10:00:00Z"),
    collectors: {
      places: { collect: async () => ({ source: "places-fixture", fetchedAt: "2026-07-28T10:00:00Z", items: [] }) },
      weather: {
        resolveTimezone: async () => { throw new Error("timezone lookup failed: 503"); },
        collect: async () => { throw new Error("Open-Meteo request failed: 400"); },
      },
      travel: { collect: async () => ({
        source: "travel-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        matrix: {},
        localTransport: { mode: "driving", status: "verified", confidence: "high" },
        majorTransport: {
          outbound: flightSegment("outbound", "서울", "후쿠오카"),
          inbound: flightSegment("inbound", "후쿠오카", "서울"),
        },
      }) },
    },
  });

  assert.equal(
    result.plan.verificationTasks.filter((task) => task.code === "MAJOR_TRANSPORT_TIMEZONE_UNVERIFIED").length,
    0,
    "nothing was verified, so there is nothing for the timezone to downgrade"
  );
  assert.equal(
    result.plan.verificationTasks.filter((task) => task.code === "MAJOR_TRANSPORT_UNAVAILABLE").length,
    2
  );
});

test("createGroundedTripPlan degrades the travel snapshot when major transport is unavailable", async () => {
  const result = await createGroundedTripPlan({
    trip: { startDate: "2026-08-01", endDate: "2026-08-01", baseLocationId: "hotel" },
    collectors: {
      places: { collect: async () => ({ source: "places-fixture", fetchedAt: "2026-07-28T10:00:00Z", items: [] }) },
      weather: {
        resolveTimezone: async () => ({ timezone: "Asia/Seoul", source: "weather-fixture", fetchedAt: "2026-07-28T10:00:00Z" }),
        collect: async () => ({
          source: "weather-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          timezone: "Asia/Seoul",
          days: [{ date: "2026-08-01", precipitationProbability: 20 }],
        }),
      },
      travel: { collect: async () => ({
        source: "travel-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        status: "verified",
        confidence: "high",
        matrix: {},
        localTransport: { mode: "driving", status: "verified", confidence: "high" },
        majorTransport: {
          outbound: {
            direction: "outbound",
            mode: "flight",
            origin: "서울",
            destination: "후쿠오카",
            status: "unavailable",
            reason: "verified flight schedule and airport evidence is not configured",
          },
        },
      }) },
    },
  });

  assert.equal(result.evidence.travel.status, "degraded", "a snapshot missing its major leg is not verified travel");
  assert.equal(result.evidence.travel.confidence, "low");
  assert.deepEqual(
    result.evidence.travel.localTransport,
    { mode: "driving", status: "verified", confidence: "high" },
    "the local matrix was collected and stays verified on its own evidence"
  );
});

test("createGroundedTripPlan cannot be ready while place search coverage is omitted or failed", async () => {
  const collectorsWith = (searchCoverage) => ({
    places: { collect: async () => ({
      source: "places-fixture",
      fetchedAt: "2026-07-28T10:00:00Z",
      location: { latitude: 35.1796, longitude: 129.0756 },
      searchCoverage,
      items: [{
        id: "museum",
        name: "Museum",
        score: 80,
        durationMinutes: 120,
        openingHoursStatus: "verified",
        openingHours: { "2026-08-01": { open: "10:00", close: "18:00" } },
      }],
    }) },
    weather: {
      resolveTimezone: async () => ({ timezone: "Asia/Seoul", source: "weather-fixture", fetchedAt: "2026-07-28T10:00:00Z" }),
      collect: async () => ({
        source: "weather-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        timezone: "Asia/Seoul",
        days: [{ date: "2026-08-01", precipitationProbability: 20 }],
      }),
    },
    travel: { collect: async () => ({
      source: "travel-fixture",
      fetchedAt: "2026-07-28T10:00:00Z",
      matrix: { "hotel|museum": 10, "museum|hotel": 10 },
    }) },
  });
  const trip = { startDate: "2026-08-01", endDate: "2026-08-01", baseLocationId: "hotel" };

  const incomplete = await createGroundedTripPlan({
    trip,
    collectors: collectorsWith([
      { key: "highlight-1", zone: "destination", status: "verified", itemCount: 1 },
      { key: "meal", zone: "base", status: "verified", itemCount: 0 },
      { key: "landmark", zone: "destination", status: "unavailable", itemCount: 0, reason: "Google Places request failed: 500" },
      { key: "nature", zone: "destination", status: "not_requested", itemCount: 0, reason: "request budget reserved for highlights" },
    ]),
  });

  const task = incomplete.plan.verificationTasks.find((entry) => entry.code === "PLACE_SEARCH_COVERAGE_DEGRADED");
  assert.ok(task, "an omitted or failed category must be surfaced as a confirmation");
  assert.deepEqual(task.categories, ["landmark", "nature"]);
  assert.match(task.message, /landmark/);
  assert.match(task.message, /not_requested/);
  assert.notEqual(incomplete.status, "ready", "a plan built on partial category coverage is not ready");
  assert.equal(incomplete.status, "needs_review");

  const complete = await createGroundedTripPlan({
    trip,
    collectors: collectorsWith([
      { key: "landmark", zone: "destination", status: "verified", itemCount: 1 },
      { key: "nature", zone: "destination", status: "verified", itemCount: 0 },
      { key: "meal", zone: "base", status: "verified", itemCount: 0 },
    ]),
  });

  assert.equal(complete.plan.verificationTasks.length, 0);
  assert.equal(complete.status, "ready");
});

// --- forecast horizon lifecycle -------------------------------------------------------------

function horizonFixtureCollectors(weatherSnapshot) {
  const placeSnapshot = {
    source: "places-fixture",
    fetchedAt: "2026-07-28T10:00:00Z",
    destinationLocation: { latitude: 10.2289, longitude: 103.9573 },
    items: [{
      id: "beach",
      name: "Sao Beach",
      score: 90,
      durationMinutes: 120,
      openingHoursStatus: "verified",
      openingHours: {
        "2026-10-09": { open: "09:00", close: "18:00" },
        "2026-10-10": { open: "09:00", close: "18:00" },
      },
    }],
  };
  return {
    places: { collect: async () => placeSnapshot },
    weather: {
      resolveTimezone: async () => ({
        timezone: "Asia/Ho_Chi_Minh",
        source: "open-meteo",
        fetchedAt: "2026-07-28T10:00:00Z",
      }),
      collect: async () => {
        if (weatherSnapshot instanceof Error) throw weatherSnapshot;
        return weatherSnapshot;
      },
    },
    travel: {
      collect: async () => ({
        source: "travel-fixture",
        fetchedAt: "2026-07-28T10:01:00Z",
        matrix: { "hotel|beach": 20, "beach|hotel": 20 },
      }),
    },
  };
}

const HORIZON_TRIP = {
  destination: "Phu Quoc",
  startDate: "2026-10-09",
  endDate: "2026-10-10",
  dailyStartTime: "09:00",
  dailyEndTime: "21:00",
  baseLocationId: "hotel",
  breakWindows: [],
};

test("a forecast beyond the horizon is a dated refresh task, not a provider failure", async () => {
  const result = await createGroundedTripPlan({
    trip: HORIZON_TRIP,
    collectors: horizonFixtureCollectors({
      source: "open-meteo",
      fetchedAt: "2026-07-28T10:00:00Z",
      status: "forecast_horizon",
      confidence: "low",
      days: [],
      missingDates: ["2026-10-09", "2026-10-10"],
      refreshAfter: "2026-09-25",
    }),
    now: () => new Date("2026-07-28T10:00:00Z"),
  });

  const weatherTasks = result.plan.verificationTasks.filter((task) => task.code.startsWith("WEATHER_"));
  assert.deepEqual(weatherTasks, [{
    code: "WEATHER_FORECAST_HORIZON",
    dates: ["2026-10-09", "2026-10-10"],
    refreshAfter: "2026-09-25",
    message: "Weather forecast is not published yet for 2026-10-09, 2026-10-10; it can be refreshed from 2026-09-25",
  }]);
  assert.equal(result.status, "needs_review");
  // The timezone was resolved on its own request, so the missing forecast must not degrade it.
  assert.equal(result.evidence.timezone.status, "verified");
  assert.equal(result.evidence.timezone.timezone, "Asia/Ho_Chi_Minh");
  assert.equal(result.evidence.weather.status, "forecast_horizon");
  assert.equal(result.evidence.weather.refreshAfter, "2026-09-25");
  assert.ok(result.plan.days.some((day) => day.activities.length > 0), "the trip is still planned");
});

test("a partial forecast reports only the days beyond the horizon", async () => {
  const result = await createGroundedTripPlan({
    trip: HORIZON_TRIP,
    collectors: horizonFixtureCollectors({
      source: "open-meteo",
      fetchedAt: "2026-07-28T10:00:00Z",
      status: "partial_forecast_horizon",
      confidence: "medium",
      timezone: "Asia/Ho_Chi_Minh",
      days: [{ date: "2026-10-09", precipitationProbability: 10 }],
      missingDates: ["2026-10-10"],
      refreshAfter: "2026-09-25",
    }),
    now: () => new Date("2026-07-28T10:00:00Z"),
  });

  const weatherTasks = result.plan.verificationTasks.filter((task) => task.code.startsWith("WEATHER_"));
  assert.equal(weatherTasks.length, 1);
  assert.equal(weatherTasks[0].code, "WEATHER_FORECAST_HORIZON");
  assert.deepEqual(weatherTasks[0].dates, ["2026-10-10"]);
  assert.equal(weatherTasks[0].refreshAfter, "2026-09-25");
  assert.equal(result.status, "needs_review");
});

test("a provider exception stays WEATHER_UNAVAILABLE with no horizon task beside it", async () => {
  const result = await createGroundedTripPlan({
    trip: HORIZON_TRIP,
    collectors: horizonFixtureCollectors(new Error("Open-Meteo request failed: 503")),
    now: () => new Date("2026-07-28T10:00:00Z"),
  });

  const weatherTasks = result.plan.verificationTasks.filter((task) => task.code.startsWith("WEATHER_"));
  assert.deepEqual(weatherTasks.map((task) => task.code), ["WEATHER_UNAVAILABLE"]);
  assert.equal(result.evidence.timezone.status, "verified");
  assert.equal(result.plan.verificationTasks.some((task) => task.code.startsWith("TIMEZONE_")), false);
  assert.equal(result.status, "needs_review");
});
