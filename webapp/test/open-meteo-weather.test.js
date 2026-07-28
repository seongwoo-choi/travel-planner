import test from "node:test";
import assert from "node:assert/strict";

import { createOpenMeteoWeatherCollector, FORECAST_HORIZON_DAYS } from "../src/planner/open-meteo-weather.js";

test("OpenMeteo collector returns dated weather evidence with source and fetch time", async () => {
  let requestedUrl;
  const collector = createOpenMeteoWeatherCollector({
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return {
        ok: true,
        json: async () => ({
          timezone: "Asia/Seoul",
          daily: {
            time: ["2026-08-01", "2026-08-02"],
            precipitation_probability_max: [20, 80],
            weather_code: [1, 63],
            temperature_2m_max: [30, 27],
            temperature_2m_min: [24, 22],
          },
        }),
      };
    },
    now: () => new Date("2026-07-28T10:00:00Z"),
  });

  const snapshot = await collector.collect({
    latitude: 35.1796,
    longitude: 129.0756,
    timezone: "Asia/Seoul",
    startDate: "2026-08-01",
    endDate: "2026-08-02",
  });

  assert.equal(requestedUrl.searchParams.get("start_date"), "2026-08-01");
  assert.equal(requestedUrl.searchParams.get("end_date"), "2026-08-02");
  assert.equal(requestedUrl.searchParams.get("timezone"), "Asia/Seoul");
  assert.equal(snapshot.source, "open-meteo");
  assert.equal(snapshot.timezone, "Asia/Seoul");
  assert.equal(snapshot.fetchedAt, "2026-07-28T10:00:00.000Z");
  assert.equal(snapshot.status, "verified");
  assert.equal(snapshot.confidence, "high");
  assert.equal(snapshot.expiresAt, "2026-07-28T11:00:00.000Z");
  assert.equal(snapshot.refreshAfter, undefined);
  assert.deepEqual(snapshot.missingDates, []);
  assert.deepEqual(snapshot.days, [
    { date: "2026-08-01", precipitationProbability: 20, weatherCode: 1, temperatureMax: 30, temperatureMin: 24 },
    { date: "2026-08-02", precipitationProbability: 80, weatherCode: 63, temperatureMax: 27, temperatureMin: 22 },
  ]);
});

test("OpenMeteo collector uses the requested timezone when the response omits it", async () => {
  const collector = createOpenMeteoWeatherCollector({
    fetchImpl: async () => ({ ok: true, json: async () => ({ daily: { time: ["2026-08-01"] } }) }),
  });
  const snapshot = await collector.collect({
    latitude: 35.1796,
    longitude: 129.0756,
    timezone: "Asia/Seoul",
    startDate: "2026-08-01",
    endDate: "2026-08-01",
  });
  assert.equal(snapshot.timezone, "Asia/Seoul");
});

test("OpenMeteo collector rejects an unresolved auto timezone", async () => {
  const collector = createOpenMeteoWeatherCollector({
    fetchImpl: async () => ({ ok: true, json: async () => ({ daily: { time: ["2026-08-01"] } }) }),
  });
  await assert.rejects(collector.collect({
    latitude: 35.1796,
    longitude: 129.0756,
    timezone: "auto",
    startDate: "2026-08-01",
    endDate: "2026-08-01",
  }), /timezone/);
});

test("OpenMeteo collector resolves an auto timezone without requesting the trip dates", async () => {
  let requestedUrl;
  const collector = createOpenMeteoWeatherCollector({
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return { ok: true, json: async () => ({ timezone: "Asia/Ho_Chi_Minh", utc_offset_seconds: 25200 }) };
    },
    now: () => new Date("2026-07-28T10:00:00Z"),
  });

  const resolved = await collector.resolveTimezone({
    latitude: 10.8231,
    longitude: 106.6297,
    timezone: "auto",
    startDate: "2027-06-01",
    endDate: "2027-06-03",
  });

  assert.equal(resolved.timezone, "Asia/Ho_Chi_Minh");
  assert.equal(resolved.source, "open-meteo");
  assert.equal(resolved.fetchedAt, "2026-07-28T10:00:00.000Z");
  assert.equal(requestedUrl.searchParams.get("timezone"), "auto");
  assert.equal(requestedUrl.searchParams.get("start_date"), null);
  assert.equal(requestedUrl.searchParams.get("end_date"), null);
});

test("OpenMeteo collector returns an explicit trip timezone without a network call", async () => {
  const collector = createOpenMeteoWeatherCollector({
    fetchImpl: async () => {
      throw new Error("resolveTimezone must not call the network for an explicit timezone");
    },
    now: () => new Date("2026-07-28T10:00:00Z"),
  });

  const resolved = await collector.resolveTimezone({
    latitude: 10.8231,
    longitude: 106.6297,
    timezone: "Asia/Seoul",
    startDate: "2027-06-01",
    endDate: "2027-06-03",
  });

  assert.equal(resolved.timezone, "Asia/Seoul");
  assert.equal(resolved.source, "trip");
});

test("OpenMeteo collector reports a trip beyond the forecast horizon without calling the provider", async () => {
  const collector = createOpenMeteoWeatherCollector({
    fetchImpl: async () => {
      throw new Error("a trip beyond the forecast horizon must not be requested");
    },
    now: () => new Date("2026-07-28T10:00:00Z"),
  });

  const snapshot = await collector.collect({
    latitude: 10.2289,
    longitude: 103.9573,
    timezone: "Asia/Ho_Chi_Minh",
    startDate: "2026-10-09",
    endDate: "2026-10-12",
  });

  assert.equal(snapshot.source, "open-meteo");
  assert.equal(snapshot.fetchedAt, "2026-07-28T10:00:00.000Z");
  assert.equal(snapshot.status, "forecast_horizon");
  assert.equal(snapshot.confidence, "low");
  assert.deepEqual(snapshot.days, []);
  assert.deepEqual(snapshot.missingDates, ["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"]);
  // The whole trip is covered once the end date enters the horizon: 2026-10-12 minus 15 days.
  assert.equal(snapshot.refreshAfter, "2026-09-27");
  assert.equal(snapshot.horizonDays, FORECAST_HORIZON_DAYS);
});

test("OpenMeteo collector fetches only through the horizon when a trip ends beyond it", async () => {
  let requestedUrl;
  const collector = createOpenMeteoWeatherCollector({
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return {
        ok: true,
        json: async () => ({
          timezone: "Asia/Seoul",
          daily: {
            time: ["2026-08-10", "2026-08-11", "2026-08-12"],
            precipitation_probability_max: [10, 20, 30],
            weather_code: [1, 2, 3],
            temperature_2m_max: [30, 31, 32],
            temperature_2m_min: [24, 25, 26],
          },
        }),
      };
    },
    now: () => new Date("2026-07-28T10:00:00Z"),
  });

  const snapshot = await collector.collect({
    latitude: 35.1796,
    longitude: 129.0756,
    timezone: "Asia/Seoul",
    startDate: "2026-08-10",
    endDate: "2026-08-15",
  });

  // Today plus 15 days is the last forecast date, so the request stops there instead of being
  // rejected wholesale for naming a date the provider cannot answer.
  assert.equal(requestedUrl.searchParams.get("start_date"), "2026-08-10");
  assert.equal(requestedUrl.searchParams.get("end_date"), "2026-08-12");
  assert.equal(snapshot.status, "partial_forecast_horizon");
  assert.equal(snapshot.confidence, "medium");
  assert.equal(snapshot.days.length, 3);
  assert.deepEqual(snapshot.missingDates, ["2026-08-13", "2026-08-14", "2026-08-15"]);
  assert.equal(snapshot.refreshAfter, "2026-07-31");
  assert.equal(snapshot.timezone, "Asia/Seoul");
});

// The 16 days the provider publishes are calendar days at the destination, so the horizon has to be
// counted from the date it is there — for most of every UTC day the UTC date is a different one.
test("OpenMeteo collector counts the horizon from the destination date when it is ahead of UTC", async () => {
  let requestedUrl;
  const collector = createOpenMeteoWeatherCollector({
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return { ok: true, json: async () => ({ timezone: "Asia/Seoul", daily: { time: ["2026-08-13"] } }) };
    },
    // 2026-07-29 08:30 in Seoul, still 2026-07-28 in UTC.
    now: () => new Date("2026-07-28T23:30:00Z"),
  });

  const snapshot = await collector.collect({
    latitude: 35.1796,
    longitude: 129.0756,
    timezone: "Asia/Seoul",
    startDate: "2026-08-13",
    endDate: "2026-08-13",
  });

  assert.equal(snapshot.horizonEnd, "2026-08-13", "2026-07-29 in Seoul plus 15 days");
  assert.equal(requestedUrl.searchParams.get("end_date"), "2026-08-13");
  assert.equal(snapshot.status, "verified");
  assert.deepEqual(snapshot.missingDates, []);
});

test("OpenMeteo collector counts the horizon from the destination date when it is behind UTC", async () => {
  const collector = createOpenMeteoWeatherCollector({
    fetchImpl: async () => {
      throw new Error("a trip beyond the destination-local horizon must not be requested");
    },
    // 2026-07-27 17:30 in Los Angeles, already 2026-07-28 in UTC.
    now: () => new Date("2026-07-28T00:30:00Z"),
  });

  const snapshot = await collector.collect({
    latitude: 34.0522,
    longitude: -118.2437,
    timezone: "America/Los_Angeles",
    startDate: "2026-08-12",
    endDate: "2026-08-12",
  });

  assert.equal(snapshot.horizonEnd, "2026-08-11", "2026-07-27 in Los Angeles plus 15 days");
  assert.equal(snapshot.status, "forecast_horizon");
  assert.deepEqual(snapshot.missingDates, ["2026-08-12"]);
  // The trip is fully forecastable once its last day enters the horizon, whatever today is.
  assert.equal(snapshot.refreshAfter, "2026-07-28");
});

test("OpenMeteo collector counts the horizon in UTC when no destination timezone is known yet", async () => {
  const collector = createOpenMeteoWeatherCollector({
    fetchImpl: async () => {
      throw new Error("a trip beyond the horizon must not be requested");
    },
    now: () => new Date("2026-07-28T23:30:00Z"),
  });

  const snapshot = await collector.collect({
    latitude: 35.1796,
    longitude: 129.0756,
    timezone: "auto",
    startDate: "2026-08-13",
    endDate: "2026-08-13",
  });

  assert.equal(snapshot.horizonEnd, "2026-08-12", "2026-07-28 in UTC plus 15 days");
  assert.equal(snapshot.status, "forecast_horizon");
});

test("OpenMeteo collector rejects trip dates it cannot plan a forecast window from", async () => {
  const collector = createOpenMeteoWeatherCollector({
    fetchImpl: async () => {
      throw new Error("invalid trip dates must not be requested");
    },
    now: () => new Date("2026-07-28T10:00:00Z"),
  });
  const trip = { latitude: 35.1796, longitude: 129.0756, timezone: "Asia/Seoul" };

  await assert.rejects(collector.collect({ ...trip, startDate: "2026-13-01", endDate: "2026-13-02" }), /startDate/);
  await assert.rejects(collector.collect({ ...trip, startDate: "2026-08-01", endDate: "not-a-date" }), /endDate/);
  await assert.rejects(collector.collect({ ...trip, startDate: "2026-08-05", endDate: "2026-08-01" }), /endDate/);
});

test("OpenMeteo collector keeps a provider failure a provider failure without leaking the request", async () => {
  const collector = createOpenMeteoWeatherCollector({
    fetchImpl: async () => ({ ok: false, status: 503 }),
    now: () => new Date("2026-07-28T10:00:00Z"),
  });

  await assert.rejects(
    collector.collect({
      latitude: 35.1796,
      longitude: 129.0756,
      timezone: "Asia/Seoul",
      startDate: "2026-08-01",
      endDate: "2026-08-02",
    }),
    (error) => {
      assert.match(error.message, /503/);
      assert.doesNotMatch(error.message, /api\.open-meteo\.com|latitude|http/);
      return true;
    }
  );
});

test("OpenMeteo collector rejects a timezone lookup that returns no timezone", async () => {
  const collector = createOpenMeteoWeatherCollector({
    fetchImpl: async () => ({ ok: true, json: async () => ({ utc_offset_seconds: 0 }) }),
  });

  await assert.rejects(
    collector.resolveTimezone({ latitude: 10.8231, longitude: 106.6297, timezone: "auto" }),
    /timezone/
  );
});
