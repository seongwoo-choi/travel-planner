import test from "node:test";
import assert from "node:assert/strict";

import { normalizeGroundedTripInput, renderGroundedTripPlan } from "../src/planner/grounded-plan-output.js";
import { buildTripDays } from "../src/planner/trip-planner.js";

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

test("normalizeGroundedTripInput splits a flight preference into a flight major leg and local driving", () => {
  const trip = normalizeGroundedTripInput({
    destination: "후쿠오카",
    startDate: "2026-08-01",
    nights: 2,
    transportPref: "flight",
  });

  // The regression: a flight trip used to become local `transit`, so the local matrix was requested
  // in a mode nobody chose and the airline leg was asked of a road router.
  assert.equal(trip.majorTransportMode, "flight");
  assert.equal(trip.localTravelMode, "driving");
  assert.equal(trip.travelMode, "driving", "travelMode stays a compatibility alias of localTravelMode");
});

test("normalizeGroundedTripInput maps the legacy transport preferences onto both modes", () => {
  const trip = (transportPref) =>
    normalizeGroundedTripInput({ destination: "부산", startDate: "2026-08-01", nights: 1, transportPref });

  assert.deepEqual(
    { major: trip("car").majorTransportMode, local: trip("car").localTravelMode },
    { major: "driving", local: "driving" }
  );
  for (const pref of ["auto", "transit", "KTX", "SRT", "bus", undefined]) {
    assert.deepEqual(
      { major: trip(pref).majorTransportMode, local: trip(pref).localTravelMode },
      { major: "transit", local: "transit" },
      `${pref} must stay a transit trip`
    );
  }
});

test("normalizeGroundedTripInput lets explicit transport modes override the legacy preference", () => {
  const trip = normalizeGroundedTripInput({
    destination: "후쿠오카",
    startDate: "2026-08-01",
    nights: 1,
    transportPref: "flight",
    localTravelMode: "transit",
  });

  assert.equal(trip.majorTransportMode, "flight");
  assert.equal(trip.localTravelMode, "transit");
  assert.equal(trip.travelMode, "transit");

  const driven = normalizeGroundedTripInput({
    destination: "부산",
    startDate: "2026-08-01",
    nights: 1,
    transportPref: "auto",
    majorTransportMode: "driving",
  });

  assert.equal(driven.majorTransportMode, "driving");
  assert.equal(driven.localTravelMode, "transit", "an explicit major mode does not move the local mode");
});

test("normalizeGroundedTripInput rejects transport modes the integration cannot ground", () => {
  const trip = { destination: "부산", startDate: "2026-08-01", nights: 1 };

  assert.throws(() => normalizeGroundedTripInput({ ...trip, localTravelMode: "walking" }), /localTravelMode/);
  assert.throws(() => normalizeGroundedTripInput({ ...trip, localTravelMode: "flight" }), /localTravelMode/);
  assert.throws(() => normalizeGroundedTripInput({ ...trip, travelMode: "bicycling" }), /localTravelMode/);
  assert.throws(() => normalizeGroundedTripInput({ ...trip, majorTransportMode: "teleport" }), /majorTransportMode/);
});

test("normalizeGroundedTripInput does not leak a removed provider search limit", () => {
  const trip = normalizeGroundedTripInput({
    destination: "부산",
    startDate: "2026-08-01",
    nights: 1,
    highlights: "해운대, 감천문화마을, 자갈치시장, 송도스카이워크",
  });

  assert.equal(trip.highlights, "해운대, 감천문화마을, 자갈치시장, 송도스카이워크");
});

test("normalizeGroundedTripInput reports an invalid calendar date as a type error", () => {
  assert.throws(
    () => normalizeGroundedTripInput({ destination: "부산", startDate: "2026-13-45", nights: 1 }),
    TypeError
  );
});

test("arrival/departure times narrow the first and last planner day windows", () => {
  const trip = normalizeGroundedTripInput({
    destination: "부산",
    startDate: "2026-08-01",
    nights: 2,
    arrivalTime: "13:30",
    departureTime: "17:10",
  });

  assert.equal(trip.arrivalAt, "2026-08-01T13:30:00");
  assert.equal(trip.departureAt, "2026-08-03T17:10:00");

  const days = buildTripDays(trip);
  assert.equal(days[0].availableFrom, "13:30");
  assert.equal(days[0].availableUntil, "21:00");
  assert.equal(days[1].availableFrom, "09:00");
  assert.equal(days[1].availableUntil, "21:00");
  assert.equal(days[2].availableFrom, "09:00");
  assert.equal(days[2].availableUntil, "17:10");
});

test("normalizeGroundedTripInput keeps explicit arrivalAt/departureAt over HH:MM fields", () => {
  const trip = normalizeGroundedTripInput({
    destination: "부산",
    startDate: "2026-08-01",
    nights: 1,
    arrivalTime: "13:30",
    departureTime: "17:10",
    arrivalAt: "2026-08-01T10:00:00+09:00",
    departureAt: "2026-08-02T20:00:00+09:00",
  });

  assert.equal(trip.arrivalAt, "2026-08-01T10:00:00+09:00");
  assert.equal(trip.departureAt, "2026-08-02T20:00:00+09:00");
});

test("normalizeGroundedTripInput rejects malformed arrival/departure times", () => {
  const trip = { destination: "부산", startDate: "2026-08-01", nights: 1 };

  assert.throws(() => normalizeGroundedTripInput({ ...trip, arrivalTime: "25:00" }), TypeError);
  assert.throws(() => normalizeGroundedTripInput({ ...trip, departureTime: "오후 5시" }), TypeError);
  assert.equal(normalizeGroundedTripInput({ ...trip, arrivalTime: "" }).arrivalAt, undefined);
});

test("normalizeGroundedTripInput rejects a trip that departs before it arrives", () => {
  const trip = { destination: "부산", startDate: "2026-08-01", nights: 0 };

  assert.throws(() => normalizeGroundedTripInput({ ...trip, arrivalTime: "18:00", departureTime: "10:00" }), RangeError);
  assert.throws(() => normalizeGroundedTripInput({ ...trip, arrivalTime: "10:00", departureTime: "10:00" }), RangeError);
  assert.throws(
    () => normalizeGroundedTripInput({
      ...trip,
      arrivalAt: "2026-08-01T18:00:00+09:00",
      departureAt: "2026-08-01T10:00:00+09:00",
    }),
    RangeError
  );
  assert.equal(
    normalizeGroundedTripInput({ ...trip, arrivalTime: "10:00", departureTime: "18:00" }).departureAt,
    "2026-08-01T18:00:00"
  );
});

test("normalizeGroundedTripInput defaults to lunch and dinner breaks", () => {
  const trip = normalizeGroundedTripInput({ destination: "부산", startDate: "2026-08-01", nights: 1 });

  assert.deepEqual(trip.breakWindows, [
    { start: "12:00", end: "13:00", kind: "meal" },
    { start: "18:00", end: "19:00", kind: "meal" },
  ]);
});

test("normalizeGroundedTripInput keeps explicit break windows, including an empty list", () => {
  const trip = { destination: "부산", startDate: "2026-08-01", nights: 1 };

  assert.deepEqual(normalizeGroundedTripInput({ ...trip, breakWindows: [] }).breakWindows, []);
  assert.deepEqual(
    normalizeGroundedTripInput({ ...trip, breakWindows: [{ start: "13:00", end: "14:00", kind: "meal" }] }).breakWindows,
    [{ start: "13:00", end: "14:00", kind: "meal" }]
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
        verifiedPlaceRatio: 1,
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
      timezone: {
        timezone: "Asia/Seoul",
        source: "open-meteo",
        fetchedAt: "2026-07-28T10:00:30Z",
        status: "degraded",
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
  assert.match(text, /시간대: Asia\/Seoul · open-meteo · 2026-07-28T10:00:30Z · degraded/);
  assert.match(text, /시간·영업시간 충돌: 0건/);
  assert.match(text, /## 자동 품질 점검/);
  assert.match(text, /## 주요 교통/);
  assert.match(text, /서울역 → 부산 · transit · 180분/);
  assert.match(text, /- OK 하드 제약/);
  assert.match(text, /- OK 영업시간 검증률: 1/);
  assert.match(text, /- 확인 확인 필요/);
});

test("renderGroundedTripPlan separates local transport from unavailable flight segments", () => {
  const text = renderGroundedTripPlan({
    status: "needs_review",
    plan: {
      days: [],
      validation: { ok: true, issues: [] },
      verificationTasks: [],
      quality: { hardConstraintViolations: 0, verifiedPlaceRatio: 1, confirmationCount: 2 },
    },
    evidence: {
      travel: {
        source: "google-distance-matrix",
        fetchedAt: "2026-07-28T10:02:00Z",
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
          inbound: {
            direction: "inbound",
            mode: "flight",
            origin: "후쿠오카",
            destination: "서울",
            status: "unavailable",
            reason: "verified flight schedule and airport evidence is not configured",
          },
        },
      },
    },
  }, { destination: "후쿠오카" });

  assert.match(text, /## 현지 이동/);
  assert.match(text, /- 현지 이동 수단: driving · verified/);
  assert.match(text, /## 주요 교통/);
  assert.match(text, /가는 편.*서울 → 후쿠오카 · flight · 확인 필요/s);
  assert.match(text, /오는 편.*후쿠오카 → 서울 · flight · 확인 필요/s);
  assert.match(text, /verified flight schedule and airport evidence is not configured/);
});

test("renderGroundedTripPlan still renders a legacy majorLeg-only travel snapshot", () => {
  const text = renderGroundedTripPlan({
    status: "ready",
    plan: { days: [], validation: { ok: true, issues: [] }, verificationTasks: [], quality: {} },
    evidence: {
      travel: {
        source: "google-distance-matrix",
        fetchedAt: "2026-07-28T10:02:00Z",
        majorLeg: { status: "verified", origin: "서울역", destination: "부산", mode: "transit", durationMinutes: 180 },
      },
    },
  }, { destination: "부산" });

  assert.match(text, /서울역 → 부산 · transit · 180분/);
});

test("renderGroundedTripPlan never prints an unverified major leg as a verified duration", () => {
  const text = renderGroundedTripPlan({
    status: "needs_review",
    plan: { days: [], validation: { ok: true, issues: [] }, verificationTasks: [], quality: {} },
    evidence: {
      travel: {
        source: "google-distance-matrix",
        fetchedAt: "2026-07-28T10:02:00Z",
        majorTransport: {
          outbound: {
            direction: "outbound",
            status: "unverified",
            confidence: "low",
            origin: "서울",
            destination: "부산",
            mode: "transit",
            durationMinutes: 180,
            reason: "destination timezone could not be resolved",
          },
        },
      },
    },
  }, { destination: "부산" });

  assert.ok(!text.includes("180분"), "a time-shifted duration must not be printed as fact");
  assert.match(text, /가는 편.*서울 → 부산 · transit · 확인 필요/s);
  assert.match(text, /destination timezone could not be resolved/);
  assert.ok(!text.includes("오는 편"), "a leg the collector never reported must not appear");
});

test("renderGroundedTripPlan infers the local mode of a legacy travel snapshot", () => {
  const text = renderGroundedTripPlan({
    status: "ready",
    plan: { days: [], validation: { ok: true, issues: [] }, verificationTasks: [], quality: {} },
    evidence: {
      travel: {
        source: "google-distance-matrix",
        fetchedAt: "2026-07-28T10:02:00Z",
        status: "verified",
        mode: "transit",
        matrix: {},
      },
    },
  }, { destination: "부산" });

  assert.match(text, /## 현지 이동/);
  assert.match(text, /- 현지 이동 수단: transit · verified/);
});

test("renderGroundedTripPlan reports partial opening-hours verification of collected places", () => {
  const text = renderGroundedTripPlan({
    status: "needs_review",
    plan: {
      days: [{
        date: "2026-08-01",
        role: "ARRIVAL_DAY",
        activities: [{ name: "부산박물관", startTime: "10:00", endTime: "12:00" }],
      }],
      validation: { ok: true, issues: [] },
      verificationTasks: [{ code: "MISSING_OR_UNVERIFIED_OPENING_HOURS", message: "스파 영업시간 미검증" }],
      quality: {
        hardConstraintViolations: 0,
        totalTravelMinutes: 20,
        scheduledPlaceRatio: 0.5,
        verifiedPlaceRatio: 0.5,
        requiredPlaceCoverage: null,
        confirmationCount: 1,
      },
    },
    evidence: {},
  }, { destination: "부산" });

  assert.match(text, /- 확인 영업시간 검증률: 0\.5/);
});

test("renderGroundedTripPlan shows when a not-yet-published forecast can be refreshed", () => {
  const text = renderGroundedTripPlan({
    status: "needs_review",
    plan: {
      days: [],
      validation: { ok: true, issues: [] },
      verificationTasks: [
        {
          code: "WEATHER_FORECAST_HORIZON",
          dates: ["2026-10-09"],
          refreshAfter: "2026-09-24",
          message: "Weather forecast is not published yet for 2026-10-09",
        },
        { code: "MAJOR_TRANSPORT_UNAVAILABLE", message: "flight must be confirmed" },
      ],
      quality: { hardConstraintViolations: 0, verifiedPlaceRatio: 1, confirmationCount: 2 },
    },
    evidence: {
      weather: {
        source: "open-meteo",
        fetchedAt: "2026-07-28T10:00:00Z",
        status: "forecast_horizon",
        refreshAfter: "2026-09-24",
        days: [],
      },
    },
  }, { destination: "푸꾸옥" });

  assert.match(text, /- \[WEATHER_FORECAST_HORIZON\] .*· 재조회 가능: 2026-09-24/);
  assert.match(text, /- \[MAJOR_TRANSPORT_UNAVAILABLE\] flight must be confirmed$/m);
  assert.match(text, /날씨: open-meteo · 2026-07-28T10:00:00Z · forecast_horizon/);
});

test("renderGroundedTripPlan opens with the user trip context instead of only planner status", () => {
  const text = renderGroundedTripPlan({
    status: "needs_review",
    plan: {
      days: [],
      validation: { ok: true, issues: [] },
      verificationTasks: [],
      quality: { hardConstraintViolations: 0, verifiedPlaceRatio: 1, confirmationCount: 0 },
    },
    evidence: {},
  }, {
    destination: "다낭",
    startDate: "2026-09-12",
    endDate: "2026-09-15",
    travelers: 2,
    companions: "여자친구",
    tripType: "휴양과 관광",
    accommodation: "미케 비치",
    budgetPerPerson: 900000,
  });

  assert.match(text, /## 여행 한눈에 보기/);
  assert.match(text, /2026-09-12 → 2026-09-15 · 3박 4일/);
  assert.match(text, /2명 · 여자친구/);
  assert.match(text, /여행 스타일: 휴양과 관광/);
  assert.match(text, /숙소 입력: 미케 비치/);
  assert.match(text, /예산 상한: 1인 900,000원 · 사용자 입력/);
  assert.match(text, /비용 근거: 교통·입장료·식비 가격 데이터 미수집/);
});

test("renderGroundedTripPlan derives couple highlights, meals, and rain alternatives only from verified place evidence", () => {
  const text = renderGroundedTripPlan({
    status: "needs_review",
    plan: {
      days: [{
        date: "2026-09-12",
        role: "FULL_DAY",
        availableFrom: "09:00",
        availableUntil: "21:00",
        activities: [
          { placeId: "beach", name: "미케 비치", startTime: "09:00", endTime: "11:30", travelFromPrevious: { durationMinutes: 10 } },
          { placeId: "dinner", name: "한강 레스토랑", startTime: "18:00", endTime: "19:15", travelFromPrevious: { durationMinutes: 20 } },
        ],
      }],
      validation: { ok: true, issues: [] },
      verificationTasks: [{ code: "WEATHER_RISK", date: "2026-09-12", placeId: "beach", message: "미케 비치 우천 가능" }],
      quality: { hardConstraintViolations: 0, verifiedPlaceRatio: 0.8, confirmationCount: 1 },
    },
    evidence: {
      places: {
        source: "google-places",
        fetchedAt: "2026-09-01T00:00:00Z",
        status: "verified",
        items: [
          { id: "beach", name: "미케 비치", category: "nature", outdoor: true, required: true, openingHoursStatus: "verified", openingHours: { "2026-09-12": { open: "00:00", close: "23:59" } }, sourceUrl: "https://maps.example/beach" },
          { id: "dinner", name: "한강 레스토랑", category: "meal", outdoor: false, openingHoursStatus: "verified", openingHours: { "2026-09-12": { open: "17:00", close: "22:00" } } },
          { id: "museum", name: "참 조각 박물관", category: "culture", indoor: true, outdoor: false, openingHoursStatus: "verified", openingHours: { "2026-09-12": { open: "09:00", close: "17:00" } }, sourceUrl: "https://maps.example/museum" },
          { id: "cafe", name: "검증 카페", category: "meal", outdoor: false, openingHoursStatus: "verified" },
          { id: "spa", name: "영업 미확인 스파", category: "wellness", outdoor: false, openingHoursStatus: "unknown" },
        ],
      },
    },
  }, { destination: "다낭", companions: "여자친구", travelers: 2 });

  assert.match(text, /## 커플 하이라이트/);
  assert.match(text, /실행 요약: 활동 2개 · 현지 이동 30분 · 사용 가능 09:00–21:00/);
  assert.match(text, /2026-09-12 09:00–11:30 · 미케 비치 · 사용자 지정 하이라이트/);
  assert.match(text, /09:00–11:30 미케 비치 · 이동 10분 · nature · 영업시간 00:00–23:59 · 근거 https:\/\/maps\.example\/beach/);
  assert.match(text, /## 식사·카페 후보/);
  assert.match(text, /한강 레스토랑 · 일정 배치 2026-09-12 18:00–19:15 · 영업시간 17:00–22:00/);
  assert.doesNotMatch(text, /검증 카페/);
  assert.match(text, /## 우천 대안/);
  assert.match(text, /2026-09-12 · 참 조각 박물관 · culture · 실내 · 영업시간 09:00–17:00 · 후보 · 재계획 필요/);
  assert.doesNotMatch(text, /영업 미확인 스파/);
  const rainSection = text.match(/## 우천 대안\n([\s\S]*?)(?:\n## |$)/)?.[1] || "";
  assert.doesNotMatch(rainSection, /미케 비치/);
});

test("renderGroundedTripPlan does not suggest an indoor replacement without a dated weather risk", () => {
  const text = renderGroundedTripPlan({
    status: "ready",
    plan: {
      days: [],
      validation: { ok: true, issues: [] },
      verificationTasks: [],
      quality: { hardConstraintViolations: 0, verifiedPlaceRatio: 1, confirmationCount: 0 },
    },
    evidence: {
      places: {
        source: "google-places",
        fetchedAt: "2026-09-01T00:00:00Z",
        items: [{
          id: "museum",
          name: "참 조각 박물관",
          category: "culture",
          outdoor: false,
          openingHoursStatus: "verified",
          openingHours: { "2026-09-12": { open: "09:00", close: "17:00" } },
        }],
      },
    },
  }, { destination: "다낭" });

  assert.doesNotMatch(text, /## 우천 대안/);
});

test("renderGroundedTripPlan does not upgrade missing legacy evidence into travel, meal, or indoor facts", () => {
  const text = renderGroundedTripPlan({
    status: "needs_review",
    plan: {
      days: [{
        date: "2026-09-12",
        role: "FULL_DAY",
        activities: [
          { placeId: "meal", name: "날짜 누락 식당", startTime: "12:00", endTime: "13:00" },
        ],
      }],
      validation: { ok: false, issues: [{ code: "MISSING_OPENING_HOURS" }] },
      verificationTasks: [{ code: "WEATHER_RISK", date: "2026-09-12", message: "우천 가능" }],
      quality: { hardConstraintViolations: 1, verifiedPlaceRatio: 1, confirmationCount: 1 },
    },
    evidence: {
      places: {
        source: "legacy-fixture",
        fetchedAt: "2026-09-01T00:00:00Z",
        items: [
          { id: "meal", name: "날짜 누락 식당", category: "meal", openingHoursStatus: "verified", openingHours: { "2026-09-13": { open: "12:00", close: "20:00" } } },
          { id: "unknown-outdoor", name: "야외 여부 불명", category: "culture", outdoor: false, openingHoursStatus: "verified", openingHours: { "2026-09-12": { open: "09:00", close: "17:00" } } },
        ],
      },
    },
  }, { destination: "다낭" });

  assert.match(text, /실행 요약: 활동 1개 · 현지 이동 미측정/);
  assert.doesNotMatch(text, /## 식사·카페 후보/);
  assert.match(text, /## 우천 대안/);
  assert.match(text, /2026-09-12 · 검증된 실내 대안 미수집 · 재계획 필요/);
  assert.doesNotMatch(text, /야외 여부 불명.*실내/);
  assert.doesNotMatch(text, /날짜 누락 식당.*영업시간 verified/);
});
