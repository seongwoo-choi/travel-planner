import test from "node:test";
import assert from "node:assert/strict";

import { phuQuocDogfoodMetrics, runPhuQuocDogfood } from "./phu-quoc-dogfood.js";
import { DEFAULT_BREAK_WINDOWS } from "../src/planner/grounded-plan-output.js";

const result = await runPhuQuocDogfood();
const metrics = phuQuocDogfoodMetrics(result);
const activityAt = (placeId) => metrics.activityTimes.find((activity) => activity.placeId === placeId);

test("the Phu Quoc dogfood plans every place without a hard violation or a duplicate", () => {
  assert.equal(result.plan.validation.ok, true);
  assert.equal(metrics.hardIssueCount, 0);
  assert.equal(metrics.scheduledCount, 4);
  assert.deepEqual(result.plan.unscheduledPlaceIds, []);
  const placeIds = metrics.activityTimes.map((activity) => activity.placeId);
  assert.equal(new Set(placeIds).size, placeIds.length, "no place may be scheduled twice");
  assert.equal(metrics.verifiedOpeningRatio, 1);
});

test("Sao Beach fills the morning before Sunset Town takes the evening of the same day", () => {
  const beach = activityAt("sao-beach");
  const town = activityAt("sunset-town");

  assert.ok(beach && town, "both preference-driven places must be scheduled");
  assert.equal(beach.date, town.date, "the pair shares the one day both are open");
  assert.ok(beach.endTime <= town.startTime, `${beach.endTime} must not run past ${town.startTime}`);
  assert.ok(beach.startTime < "12:00", `Sao Beach must keep its morning window (got ${beach.startTime})`);
  assert.ok(town.startTime >= "18:00", `Sunset Town must start in the evening (got ${town.startTime})`);
});

test("the arrival and departure days keep the windows the buffers leave", () => {
  // 14:00 arrival plus a 60 minute buffer, and a 13:00 departure less a 120 minute buffer.
  assert.equal(metrics.dayWindows["2026-10-09"], "15:00-21:00");
  assert.equal(metrics.dayWindows["2026-10-12"], "09:00-11:00");
  for (const activity of metrics.activityTimes) {
    const [from, until] = metrics.dayWindows[activity.date].split("-");
    assert.ok(activity.startTime >= from && activity.endTime <= until,
      `${activity.placeId} ${activity.startTime}-${activity.endTime} must sit inside ${from}-${until}`);
  }
});

test("the meal breaks stay protected from everything that is not a meal", () => {
  const categories = new Map(result.evidence.places.items.map((place) => [place.id, place.category]));
  for (const activity of metrics.activityTimes) {
    if (categories.get(activity.placeId) === "meal") continue;
    for (const window of DEFAULT_BREAK_WINDOWS) {
      assert.ok(activity.startTime >= window.end || activity.endTime <= window.start,
        `${activity.placeId} ${activity.startTime}-${activity.endTime} overlaps the ${window.start}-${window.end} break`);
    }
  }
});

test("the ungrounded flight legs and the unpublished forecast are explicit dated tasks", () => {
  assert.equal(metrics.status, "needs_review");
  assert.deepEqual(metrics.taskCodes.filter((code) => code === "MAJOR_TRANSPORT_UNAVAILABLE").length, 2);
  const flights = result.plan.verificationTasks.filter((task) => task.code === "MAJOR_TRANSPORT_UNAVAILABLE");
  assert.deepEqual(flights.map((task) => task.direction), ["outbound", "inbound"]);

  const weather = result.plan.verificationTasks.find((task) => task.code === "WEATHER_FORECAST_HORIZON");
  assert.ok(weather, "the unpublished forecast must be its own task");
  assert.deepEqual(weather.dates, ["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"]);
  // The trip ends 2026-10-12, so the whole trip enters the 16 day horizon on 2026-09-27.
  assert.equal(weather.refreshAfter, "2026-09-27");
  assert.equal(metrics.refreshAfter.WEATHER_FORECAST_HORIZON, "2026-09-27");
  assert.equal(result.evidence.weather.status, "forecast_horizon");
  assert.deepEqual(result.evidence.weather.days, []);
  // The timezone was given by the trip, so the missing forecast must not have degraded it.
  assert.equal(result.evidence.timezone.status, "verified");
  assert.equal(result.evidence.timezone.timezone, "Asia/Ho_Chi_Minh");
});

test("the dogfood run is deterministic and offline", async () => {
  const second = phuQuocDogfoodMetrics(await runPhuQuocDogfood());
  assert.deepEqual(second, metrics);
  assert.match(metrics.evidence, /no live Google Places, Distance Matrix or Open-Meteo request/);
});
