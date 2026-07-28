import { createOpenMeteoWeatherCollector } from "../src/planner/open-meteo-weather.js";
import { normalizeGroundedTripInput } from "../src/planner/grounded-plan-output.js";
import { createGroundedTripPlan } from "../src/planner/grounded-planner-service.js";

// A fixed, offline rehearsal of the international trip shape the providers cannot fully ground:
// a flight nobody here can route and a forecast Open-Meteo has not published yet. Every snapshot
// below is a fixture — no Google Places, Distance Matrix or Open-Meteo request is made — so the
// run is byte-identical on every machine and safe to keep in the test suite.
export const PHU_QUOC_NOW = () => new Date("2026-07-28T00:00:00Z");

const DATES = ["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"];

// Sao Beach and Sunset Town both sit at the south end of the island, so the fixture makes them a
// single day's pair: a morning on the sand and an evening in town, which is exactly the ordering
// the preferred windows have to produce.
const SHARED_DAY = "2026-10-10";

function hoursOn(dates, open, close) {
  return Object.fromEntries(dates.map((date) => [date, { open, close }]));
}

const PLACES = [
  {
    id: "sao-beach",
    name: "Sao Beach",
    category: "nature",
    outdoor: true,
    required: true,
    score: 95,
    durationMinutes: 150,
    openingHoursStatus: "verified",
    openingHours: hoursOn([SHARED_DAY], "08:00", "18:00"),
    preferredWindows: [{ start: "09:00", end: "12:00" }],
    coordinates: { latitude: 10.0546, longitude: 104.0293 },
  },
  {
    id: "sunset-town",
    name: "Sunset Town",
    category: "nightlife",
    outdoor: true,
    required: true,
    score: 90,
    durationMinutes: 90,
    openingHoursStatus: "verified",
    openingHours: hoursOn([SHARED_DAY], "15:00", "22:00"),
    preferredWindows: [{ start: "18:00", end: "21:00" }],
    coordinates: { latitude: 10.0388, longitude: 103.8368 },
  },
  {
    id: "pearl-farm",
    name: "Ngoc Hien Pearl Farm",
    category: "culture",
    outdoor: false,
    score: 70,
    durationMinutes: 90,
    openingHoursStatus: "verified",
    openingHours: hoursOn(DATES, "09:00", "17:00"),
    coordinates: { latitude: 10.1275, longitude: 103.9945 },
  },
  {
    id: "night-market",
    name: "Duong Dong Night Market",
    category: "meal",
    outdoor: true,
    score: 75,
    durationMinutes: 60,
    openingHoursStatus: "verified",
    openingHours: hoursOn(DATES, "17:00", "23:00"),
    coordinates: { latitude: 10.2154, longitude: 103.9591 },
  },
];

const TRAVEL_MINUTES = 15;

function travelMatrix(placeIds, baseLocationId) {
  const ids = [baseLocationId, ...placeIds];
  const matrix = {};
  for (const from of ids) {
    for (const to of ids) {
      if (from !== to) matrix[`${from}|${to}`] = TRAVEL_MINUTES;
    }
  }
  return matrix;
}

export function phuQuocDogfoodInput() {
  return {
    destination: "푸꾸옥",
    origin: "서울",
    travellers: 2,
    startDate: DATES[0],
    nights: 3,
    baseLocationId: "resort",
    timezone: "Asia/Ho_Chi_Minh",
    majorTransportMode: "flight",
    localTravelMode: "driving",
    dailyStartTime: "09:00",
    dailyEndTime: "21:00",
    arrivalTime: "14:00",
    arrivalBufferMinutes: 60,
    departureTime: "13:00",
    departureBufferMinutes: 120,
  };
}

export function phuQuocDogfoodCollectors() {
  const fetchedAt = PHU_QUOC_NOW().toISOString();
  const placeSnapshot = {
    source: "google-places-fixture",
    fetchedAt,
    status: "verified",
    destinationLocation: { latitude: 10.2289, longitude: 103.9573 },
    baseLocation: { latitude: 10.1899, longitude: 103.9663 },
    searchCoverage: [
      { key: "nature", status: "verified" },
      { key: "culture", status: "verified" },
      { key: "nightlife", status: "verified" },
      { key: "meal", status: "verified" },
    ],
    items: PLACES,
  };
  const travelSnapshot = {
    source: "google-distance-matrix-fixture",
    fetchedAt,
    status: "verified",
    localTransport: { mode: "driving", status: "verified", confidence: "high" },
    // No airline schedule provider is configured, so both air legs stay ungrounded on purpose.
    majorTransport: {
      outbound: {
        direction: "outbound",
        status: "unavailable",
        mode: "flight",
        origin: "서울",
        destination: "푸꾸옥",
        reason: "verified flight schedule and airport evidence is not configured, so the air leg cannot be grounded",
      },
      inbound: {
        direction: "inbound",
        status: "unavailable",
        mode: "flight",
        origin: "푸꾸옥",
        destination: "서울",
        reason: "verified flight schedule and airport evidence is not configured, so the air leg cannot be grounded",
      },
    },
    matrix: travelMatrix(PLACES.map((place) => place.id), "resort"),
  };
  return {
    places: { collect: async () => placeSnapshot },
    // The real collector, so the horizon lifecycle under test is the one that runs. Its fetch would
    // throw: a trip this far out must be answered without a request.
    weather: createOpenMeteoWeatherCollector({
      fetchImpl: async () => {
        throw new Error("the Phu Quoc dogfood must not reach the network");
      },
      now: PHU_QUOC_NOW,
    }),
    travel: { collect: async () => travelSnapshot },
  };
}

export async function runPhuQuocDogfood() {
  return createGroundedTripPlan({
    trip: normalizeGroundedTripInput(phuQuocDogfoodInput()),
    collectors: phuQuocDogfoodCollectors(),
    now: PHU_QUOC_NOW,
  });
}

export function phuQuocDogfoodMetrics(result) {
  const activities = result.plan.days.flatMap((day) =>
    day.activities.map((activity) => ({
      date: day.date,
      placeId: activity.placeId,
      startTime: activity.startTime,
      endTime: activity.endTime,
    }))
  );
  return {
    fixture: "phu-quoc-2026-10-09",
    evidence: "fixture snapshots — no live Google Places, Distance Matrix or Open-Meteo request",
    status: result.status,
    hardIssueCount: result.plan.validation.issues.length,
    scheduledCount: activities.length,
    dayDistribution: Object.fromEntries(result.plan.days.map((day) => [day.date, day.activities.length])),
    dayWindows: Object.fromEntries(
      result.plan.days.map((day) => [day.date, `${day.availableFrom}-${day.availableUntil}`])
    ),
    activityTimes: activities,
    taskCodes: result.plan.verificationTasks.map((task) => task.code),
    refreshAfter: Object.fromEntries(
      result.plan.verificationTasks
        .filter((task) => task.refreshAfter)
        .map((task) => [task.code, task.refreshAfter])
    ),
    verifiedOpeningRatio: result.plan.quality.verifiedPlaceRatio,
    totalTravelMinutes: result.plan.quality.totalTravelMinutes,
  };
}

if (import.meta.filename === process.argv[1]) {
  console.log(JSON.stringify(phuQuocDogfoodMetrics(await runPhuQuocDogfood()), null, 2));
}
