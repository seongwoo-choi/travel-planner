import test from "node:test";
import assert from "node:assert/strict";

import { generateGroundedPlan } from "../src/planner/grounded-plan-generator.js";

const FETCHED_AT = "2026-07-28T10:00:00Z";

function evidenceFixture() {
  return {
    places: {
      source: "fixture-places",
      fetchedAt: FETCHED_AT,
      expiresAt: "2026-12-31T23:59:59Z",
      status: "verified",
      destinationLocation: { latitude: 35.1796, longitude: 129.0756 },
      baseLocation: { latitude: 35.1796, longitude: 129.0756 },
      searchCoverage: [{ key: "fixture", status: "verified" }],
      items: [{
        id: "bistro",
        name: "Bistro",
        category: "meal",
        score: 60,
        durationMinutes: 60,
        openingHoursStatus: "verified",
        openingHours: { "2026-08-01": { open: "12:00", close: "14:00" } },
      }, {
        id: "museum",
        name: "Museum",
        category: "culture",
        score: 80,
        durationMinutes: 240,
        openingHoursStatus: "verified",
        openingHours: { "2026-08-01": { open: "09:00", close: "21:00" } },
      }],
    },
    weather: {
      source: "fixture-weather",
      fetchedAt: FETCHED_AT,
      expiresAt: "2026-12-31T23:59:59Z",
      status: "verified",
      timezone: "Asia/Seoul",
      days: [{ date: "2026-08-01", temperatureMin: 23, temperatureMax: 29, precipitationProbability: 10 }],
    },
    timezone: {
      source: "fixture-timezone",
      fetchedAt: FETCHED_AT,
      expiresAt: "2026-12-31T23:59:59Z",
      status: "verified",
      timezone: "Asia/Seoul",
    },
    travel: {
      source: "fixture-travel",
      fetchedAt: FETCHED_AT,
      expiresAt: "2026-12-31T23:59:59Z",
      status: "verified",
      localTransport: { mode: "transit", status: "verified" },
      matrix: {
        "base|bistro": 0,
        "bistro|base": 0,
        "base|museum": 0,
        "museum|base": 0,
        "bistro|museum": 0,
        "museum|bistro": 0,
      },
    },
  };
}

test("evidence-in pipeline returns structured plan and Markdown", async () => {
  const generation = await generateGroundedPlan({
    input: {
      destination: "부산",
      startDate: "2026-08-01",
      nights: 0,
      travelers: 2,
      companions: "연인",
      tripType: "커플 여행",
    },
    evidence: evidenceFixture(),
  });

  assert.equal(generation.model, "travel-planner-harness-v1");
  assert.equal(generation.status, "ready");
  assert.equal(generation.groundedPlan.validation.ok, true);
  assert.match(generation.plan, /# 부산 여행 플랜/);
  assert.match(generation.plan, /여행자: 2명 · 연인/);
  assert.match(generation.plan, /유효기한: 2026-12-31T23:59:59Z/);
  assert.equal(generation.evidence.places.source, "fixture-places");
});

test("evidence-in pipeline keeps a meal in its meal window", async () => {
  const generation = await generateGroundedPlan({
    input: { destination: "부산", startDate: "2026-08-01", nights: 0 },
    evidence: evidenceFixture(),
  });
  const byId = new Map(generation.groundedPlan.days[0].activities.map((activity) => [activity.placeId, activity]));

  assert.equal(byId.get("bistro").startTime, "12:00");
  assert.equal(byId.get("bistro").endTime, "13:00");
  assert.equal(byId.get("museum").startTime, "13:00");
  assert.equal(byId.get("museum").endTime, "17:00");
});

test("evidence-in pipeline fails closed when a snapshot is missing", async () => {
  const evidence = evidenceFixture();
  delete evidence.travel;

  await assert.rejects(
    generateGroundedPlan({
      input: { destination: "부산", startDate: "2026-08-01", nights: 0 },
      evidence,
    }),
    /evidence\.travel is required/
  );
});

test("evidence-in pipeline fails closed on an unknown snapshot status", async () => {
  const evidence = evidenceFixture();
  evidence.travel.status = "mystery";

  await assert.rejects(
    () => generateGroundedPlan({
      input: { destination: "부산", startDate: "2026-08-01", nights: 0 },
      evidence,
    }),
    /evidence\.travel\.status must be one of/
  );
});

test("evidence-in pipeline fails closed on malformed or expired freshness", async () => {
  const malformed = evidenceFixture();
  for (const expiresAt of ["later", "2026-12-31"]) {
    malformed.weather.expiresAt = expiresAt;
    await assert.rejects(
      () => generateGroundedPlan({
        input: { destination: "부산", startDate: "2026-08-01", nights: 0 },
        evidence: malformed,
      }),
      /evidence\.weather\.expiresAt must be an ISO timestamp/
    );
  }

  const expired = evidenceFixture();
  expired.travel.expiresAt = "2026-07-29T00:00:00Z";
  await assert.rejects(
    () => generateGroundedPlan({
      input: { destination: "부산", startDate: "2026-08-01", nights: 0 },
      evidence: expired,
      now: () => new Date("2026-07-29T00:00:00Z"),
    }),
    /evidence\.travel expired at 2026-07-29T00:00:00Z/
  );

  const future = evidenceFixture();
  future.travel.fetchedAt = "2026-07-29T01:00:00Z";
  await assert.rejects(
    () => generateGroundedPlan({
      input: { destination: "부산", startDate: "2026-08-01", nights: 0 },
      evidence: future,
      now: () => new Date("2026-07-29T00:00:00Z"),
    }),
    /evidence\.travel\.fetchedAt cannot be in the future/
  );
});

test("evidence-in pipeline fails closed on missing or malformed place search coverage", async () => {
  for (const searchCoverage of [undefined, [], [{ key: "fixture", status: "mystery" }]]) {
    const evidence = evidenceFixture();
    evidence.places.searchCoverage = searchCoverage;
    await assert.rejects(
      () => generateGroundedPlan({
        input: { destination: "부산", startDate: "2026-08-01", nights: 0 },
        evidence,
      }),
      /evidence\.places\.searchCoverage/
    );
  }
});

test("evidence-in pipeline rejects credential-bearing source URLs before writing artifacts", async () => {
  for (const [field, url] of [
    ["sourceUrl", "https://maps.example/place?key=TOPSECRET"],
    ["source", "https://maps.example/place?X-Goog-Signature=SIGNED"],
    ["sourceUrl", "https://maps.example/place?password=TOPSECRET"],
    ["sourceUrl", "https://maps.example/place?passwd=TOPSECRET"],
  ]) {
    const evidence = evidenceFixture();
    if (field === "sourceUrl") {
      evidence.places.items[0].sourceUrl = url;
    } else {
      evidence.places.source = url;
    }
    await assert.rejects(
      () => generateGroundedPlan({
        input: { destination: "부산", startDate: "2026-08-01", nights: 0 },
        evidence,
      }),
      /evidence contains a credential-bearing source URL/
    );
  }
});

test("unavailable place and travel snapshots cannot drive a ready itinerary", async () => {
  for (const name of ["places", "travel"]) {
    const evidence = evidenceFixture();
    evidence[name].status = "unavailable";
    const generation = await generateGroundedPlan({
      input: { destination: "부산", startDate: "2026-08-01", nights: 0 },
      evidence,
    });

    assert.equal(generation.status, "needs_review");
    assert.deepEqual(generation.groundedPlan.days[0].activities, []);
    assert.ok(generation.groundedPlan.verificationTasks.some(
      (task) => task.code === `${name.toUpperCase()}_EVIDENCE_UNAVAILABLE`
    ));
  }
});

test("degraded place and travel snapshots remain usable but require review", async () => {
  for (const name of ["places", "travel"]) {
    const evidence = evidenceFixture();
    evidence[name].status = "degraded";
    const generation = await generateGroundedPlan({
      input: { destination: "부산", startDate: "2026-08-01", nights: 0 },
      evidence,
    });

    assert.equal(generation.status, "needs_review");
    assert.ok(generation.groundedPlan.days[0].activities.length > 0);
    assert.ok(generation.groundedPlan.verificationTasks.some(
      (task) => task.code === `${name.toUpperCase()}_EVIDENCE_DEGRADED`
    ));
  }
});

test("degraded weather and non-verified timezone snapshots require review", async () => {
  const degradedWeather = evidenceFixture();
  degradedWeather.weather.status = "degraded";
  const weatherGeneration = await generateGroundedPlan({
    input: { destination: "부산", startDate: "2026-08-01", nights: 0 },
    evidence: degradedWeather,
  });
  assert.equal(weatherGeneration.status, "needs_review");
  assert.ok(weatherGeneration.groundedPlan.verificationTasks.some(
    (task) => task.code === "WEATHER_EVIDENCE_DEGRADED"
  ));

  for (const status of ["degraded", "unavailable"]) {
    const evidence = evidenceFixture();
    evidence.timezone.status = status;
    const generation = await generateGroundedPlan({
      input: { destination: "부산", startDate: "2026-08-01", nights: 0 },
      evidence,
    });
    assert.equal(generation.status, "needs_review");
    assert.notEqual(generation.evidence.timezone.status, "verified");
  }
});
