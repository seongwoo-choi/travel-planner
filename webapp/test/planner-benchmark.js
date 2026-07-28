import { planTrip } from "../src/planner/trip-planner.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// The documented input ceiling: 50 place candidates over 31 days, every place open every day and
// reachable from every other one, so the search hits its configured bounds on every day.
export function worstCasePlannerFixture() {
  const start = Date.UTC(2026, 7, 1);
  const dates = Array.from({ length: 31 }, (_, index) => new Date(start + index * DAY_MS).toISOString().slice(0, 10));
  const ids = Array.from({ length: 50 }, (_, index) => `place-${String(index + 1).padStart(2, "0")}`);
  const travelMinutes = {};
  for (const from of ["hotel", ...ids]) {
    for (const to of ["hotel", ...ids]) {
      if (from !== to) travelMinutes[`${from}|${to}`] = 10;
    }
  }
  return {
    trip: {
      startDate: dates[0],
      endDate: dates.at(-1),
      dailyStartTime: "09:00",
      dailyEndTime: "21:00",
      baseLocationId: "hotel",
    },
    places: ids.map((id, index) => ({
      id,
      name: id,
      score: 10 + (index % 7),
      required: index % 10 === 0,
      durationMinutes: 60,
      openingHours: Object.fromEntries(dates.map((date) => [date, { open: "09:00", close: "21:00" }])),
    })),
    travelMinutes,
  };
}

// Wall-clock is reported here, never asserted in the test suite, where a tight bound would be flaky.
if (import.meta.filename === process.argv[1]) {
  const fixture = worstCasePlannerFixture();
  const started = process.hrtime.bigint();
  const plan = planTrip(fixture);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  const scoreById = new Map(fixture.places.map((place) => [place.id, Number(place.score || 0)]));
  const scheduled = plan.days.flatMap((day) => day.activities.map((activity) => activity.placeId));
  console.log(JSON.stringify({
    elapsedMs: Number(elapsedMs.toFixed(1)),
    places: fixture.places.length,
    days: plan.days.length,
    totalScore: scheduled.reduce((total, id) => total + scoreById.get(id), 0),
    scheduledCount: scheduled.length,
    unscheduledPlaceIds: plan.unscheduledPlaceIds,
    dayDistribution: plan.days.map((day) => day.activities.length),
    scheduleQuality: plan.scheduleQuality,
    searchDiagnostics: plan.searchDiagnostics,
  }, null, 2));
}
