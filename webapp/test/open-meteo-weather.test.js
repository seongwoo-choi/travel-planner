import test from "node:test";
import assert from "node:assert/strict";

import { createOpenMeteoWeatherCollector } from "../src/planner/open-meteo-weather.js";

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
