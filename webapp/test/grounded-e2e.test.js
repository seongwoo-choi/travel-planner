import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createGoogleGroundedPlanGenerator } from "../src/planner/grounded-plan-generator.js";
import { createPlan, getPlan } from "../src/storage.js";

function response(body) {
  return { ok: true, status: 200, json: async () => body };
}

test("grounded providers generate, validate, persist, and reload a structured trip plan", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "travel-planner-e2e-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const fetchImpl = async (request) => {
    const url = new URL(request);
    if (url.pathname.includes("/geocode/")) {
      return response({ status: "OK", results: [{ geometry: { location: { lat: 35.1796, lng: 129.0756 } } }] });
    }
    if (url.hostname === "places.googleapis.com") {
      return response({ places: [{
        id: "museum",
        displayName: { text: "부산박물관" },
        location: { latitude: 35.1304, longitude: 129.0919 },
        rating: 4.5,
        userRatingCount: 1000,
        types: ["museum"],
        googleMapsUri: "https://maps.google.com/?cid=museum",
        regularOpeningHours: { periods: [
          { open: { day: 6, hour: 9 }, close: { day: 6, hour: 18 } },
          { open: { day: 0, hour: 9 }, close: { day: 0, hour: 18 } },
        ] },
      }] });
    }
    if (url.hostname === "api.open-meteo.com") {
      return response({
        timezone: "Asia/Seoul",
        daily: {
          time: ["2026-08-01", "2026-08-02"],
          precipitation_probability_max: [10, 20],
          weather_code: [1, 2],
          temperature_2m_max: [30, 29],
          temperature_2m_min: [24, 23],
        },
      });
    }
    if (url.pathname.includes("/distancematrix/")) {
      const origins = url.searchParams.get("origins").split("|");
      const destinations = url.searchParams.get("destinations").split("|");
      return response({
        status: "OK",
        rows: origins.map(() => ({
          elements: destinations.map(() => ({ status: "OK", duration: { value: 1200 } })),
        })),
      });
    }
    throw new Error(`unexpected request: ${url.origin}${url.pathname}`);
  };
  const generator = createGoogleGroundedPlanGenerator({
    apiKey: "test-key",
    fetchImpl,
    now: () => new Date("2026-07-28T10:00:00Z"),
  });
  const input = { destination: "부산", startDate: "2026-08-01", nights: 1, transportPref: "auto" };

  const generation = await generator.generate(input);
  const created = await createPlan(input, generation, path.join(directory, "plans.json"));
  const stored = await getPlan(created.id, path.join(directory, "plans.json"));

  assert.equal(generation.status, "ready");
  assert.equal(generation.groundedPlan.validation.ok, true);
  assert.equal(generation.groundedPlan.days[0].activities[0].placeId, "museum");
  assert.match(generation.plan, /부산박물관/);
  assert.match(generation.plan, /날씨: 24–30°C/);
  assert.equal(stored.revisions[0].groundedPlan.days[0].activities[0].placeId, "museum");
  assert.equal(stored.revisions[0].evidence.travel.source, "google-distance-matrix");
});
