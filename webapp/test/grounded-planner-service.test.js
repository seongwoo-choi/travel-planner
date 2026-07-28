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
    verifiedActivityRatio: 1,
    requiredPlaceCoverage: null,
    confirmationCount: 0,
  });
  assert.deepEqual(result.evidence, {
    places: placeSnapshot,
    weather: weatherSnapshot,
    travel: travelSnapshot,
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
          openingHours: { "2026-08-01": { open: "09:00", close: "18:00" } },
        }],
      }) },
      weather: { collect: async () => ({
        source: "weather-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        days: [{ date: "2026-08-01", precipitationProbability: 80 }],
      }) },
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
      weather: { collect: async () => ({
        source: "weather-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        days: [{ date: "2026-08-01", precipitationProbability: 20 }],
      }) },
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
    code: "MISSING_OPENING_HOURS",
    placeId: "gallery",
    message: "Gallery opening hours must be confirmed before scheduling",
  }, {
    code: "MISSING_OPENING_HOURS",
    placeId: "night-market",
    message: "Night Market opening hours must be confirmed before scheduling",
  }]);
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
      weather: { collect: async () => ({
        source: "weather-fixture",
        fetchedAt: "2026-07-28T10:00:00Z",
        timezone: "Asia/Seoul",
        days: [{ date: "2026-08-01", precipitationProbability: 20 }],
      }) },
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
