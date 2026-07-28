import test from "node:test";
import assert from "node:assert/strict";

import { normalizeGroundedTripInput, renderGroundedTripPlan } from "../src/planner/grounded-plan-output.js";

test("normalizeGroundedTripInput derives an arbitrary end date from nights", () => {
  const trip = normalizeGroundedTripInput({
    destination: "부산",
    startDate: "2026-08-01",
    nights: 4,
    transportPref: "transit",
  });

  assert.equal(trip.endDate, "2026-08-05");
  assert.equal(trip.baseLocationId, "base");
  assert.equal(trip.dailyStartTime, "09:00");
  assert.equal(trip.dailyEndTime, "21:00");
  assert.equal(trip.travelMode, "transit");
});

test("normalizeGroundedTripInput reports an invalid calendar date as a type error", () => {
  assert.throws(
    () => normalizeGroundedTripInput({ destination: "부산", startDate: "2026-13-45", nights: 1 }),
    TypeError
  );
});

test("renderGroundedTripPlan exposes itinerary, evidence freshness, and confirmation tasks", () => {
  const text = renderGroundedTripPlan({
    status: "needs_review",
    plan: {
      days: [{
        date: "2026-08-01",
        role: "ARRIVAL_DAY",
        activities: [{
          name: "부산박물관",
          startTime: "10:00",
          endTime: "12:00",
          travelFromPrevious: { durationMinutes: 25 },
        }],
      }],
      validation: { ok: true, issues: [] },
      verificationTasks: [{ code: "WEATHER_RISK", message: "야외 일정 우천 가능" }],
      quality: {
        hardConstraintViolations: 0,
        totalTravelMinutes: 50,
        scheduledPlaceRatio: 1,
        verifiedActivityRatio: 1,
        requiredPlaceCoverage: null,
        confirmationCount: 1,
      },
    },
    evidence: {
      places: { source: "google-places", fetchedAt: "2026-07-28T10:00:00Z" },
      weather: {
        source: "open-meteo",
        fetchedAt: "2026-07-28T10:01:00Z",
        days: [{ date: "2026-08-01", precipitationProbability: 70, temperatureMin: 24, temperatureMax: 30 }],
      },
      travel: {
        source: "google-distance-matrix",
        fetchedAt: "2026-07-28T10:02:00Z",
        majorLeg: {
          status: "verified",
          origin: "서울역",
          destination: "부산",
          mode: "transit",
          durationMinutes: 180,
        },
      },
    },
  }, { destination: "부산" });

  assert.match(text, /# 부산 여행 플랜/);
  assert.match(text, /2026-08-01/);
  assert.match(text, /10:00–12:00 부산박물관/);
  assert.match(text, /날씨: 24–30°C · 강수확률 70%/);
  assert.match(text, /이동 25분/);
  assert.match(text, /야외 일정 우천 가능/);
  assert.match(text, /google-places · 2026-07-28T10:00:00Z/);
  assert.match(text, /시간·영업시간 충돌: 0건/);
  assert.match(text, /## 자동 품질 점검/);
  assert.match(text, /## 주요 교통/);
  assert.match(text, /서울역 → 부산 · transit · 180분/);
  assert.match(text, /- OK 하드 제약/);
  assert.match(text, /- 확인 확인 필요/);
});
