import test from "node:test";
import assert from "node:assert/strict";

import {
  checkStoredGroundedPlan,
  diagnoseStoredGroundedPlan,
  moveStoredGroundedPlace,
  refreshStoredGroundedPlan,
  replaceStoredGroundedPlace,
  replanStoredGroundedPlan,
} from "../src/planner/grounded-plan-actions.js";
import { DEFAULT_BREAK_WINDOWS } from "../src/planner/grounded-plan-output.js";

const places = [{
  id: "old",
  name: "Old Museum",
  score: 80,
  durationMinutes: 60,
  openingHoursStatus: "verified",
  openingHours: {
    "2026-08-01": { open: "09:00", close: "18:00" },
    "2026-08-02": { open: "09:00", close: "18:00" },
  },
  coordinates: { latitude: 35.1, longitude: 129.1 },
}, {
  id: "replacement",
  name: "Replacement Museum",
  score: 70,
  durationMinutes: 60,
  openingHoursStatus: "verified",
  openingHours: {
    "2026-08-01": { open: "09:00", close: "18:00" },
    "2026-08-02": { open: "09:00", close: "18:00" },
  },
  coordinates: { latitude: 35.2, longitude: 129.2 },
}];

const matrix = {
  "base|old": 10,
  "old|base": 10,
  "base|replacement": 10,
  "replacement|base": 10,
  "old|replacement": 10,
  "replacement|old": 10,
};

function record() {
  return {
    id: 1,
    destination: "부산",
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    nights: 1,
    latestVersion: 1,
    revisions: [{
      version: 1,
      input: {
        destination: "부산",
        startDate: "2026-08-01",
        endDate: "2026-08-02",
        nights: 1,
        baseLocationId: "base",
      },
      groundedPlan: {
        days: [{
          date: "2026-08-01",
          role: "ARRIVAL_DAY",
          availableFrom: "09:00",
          availableUntil: "21:00",
          activities: [{
            placeId: "old",
            name: "Old Museum",
            date: "2026-08-01",
            startTime: "09:10",
            endTime: "10:10",
            travelFromPrevious: { from: "base", to: "old", durationMinutes: 10 },
          }],
        }, {
          date: "2026-08-02",
          role: "DEPARTURE_DAY",
          availableFrom: "09:00",
          availableUntil: "21:00",
          activities: [],
        }],
        verificationTasks: [],
      },
      evidence: {
        places: {
          source: "places-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          location: { latitude: 35.1, longitude: 129.1 },
          items: places,
        },
        weather: {
          source: "weather-fixture",
          fetchedAt: "2026-07-28T10:00:00Z",
          timezone: "Asia/Seoul",
          days: [
            { date: "2026-08-01", precipitationProbability: 10 },
            { date: "2026-08-02", precipitationProbability: 10 },
          ],
        },
        travel: { source: "travel-fixture", fetchedAt: "2026-07-28T10:00:00Z", matrix },
      },
    }],
  };
}

const BREAK_WINDOWS = [
  { start: "12:00", end: "13:00", kind: "meal" },
  { start: "18:00", end: "19:00", kind: "meal" },
];

function recordWithBreaks(breakWindows = BREAK_WINDOWS) {
  const stored = record();
  stored.revisions[0].groundedPlan.breakWindows = structuredClone(breakWindows);
  return stored;
}

// What Discord stored: a late arrival on the first day and an early departure on the last, as the
// raw HH:MM fields the payload keeps — never as the derived arrivalAt/departureAt.
function recordWithTravelWindows() {
  const stored = record();
  const windows = {
    arrivalTime: "19:00",
    departureTime: "10:30",
    arrivalBufferMinutes: 30,
    departureBufferMinutes: 30,
  };
  Object.assign(stored, windows);
  Object.assign(stored.revisions[0].input, windows);
  return stored;
}

function assertTravelWindows(plan) {
  assert.equal(plan.days[0].availableFrom, "19:30", "a late arrival still opens the first day");
  assert.equal(plan.days.at(-1).availableUntil, "10:00", "an early departure still closes the last day");
}

const UNRESOLVED_TIMEZONE_REASON =
  "the destination timezone could not be resolved, so this duration was requested with UTC departure timing";

// What a plan built without a resolvable timezone persisted: a UTC fallback nobody verified, a
// forecast that never arrived, and transport durations requested against UTC departure timing.
function recordWithUnresolvedTimezone() {
  const stored = record();
  const evidence = stored.revisions[0].evidence;
  evidence.timezone = {
    timezone: "UTC",
    source: "fallback",
    fetchedAt: "2026-07-28T10:00:00Z",
    status: "unavailable",
    error: "timezone lookup failed: 503",
  };
  evidence.weather = {
    source: "weather-unavailable",
    fetchedAt: "2026-07-28T10:00:00Z",
    status: "unavailable",
    timezone: "UTC",
    days: [],
    error: "Open-Meteo request failed: 400",
  };
  evidence.travel = {
    ...evidence.travel,
    status: "unverified",
    confidence: "low",
    timezone: "UTC",
    localTransport: { mode: "driving", status: "unverified", confidence: "low" },
    majorTransport: {
      outbound: {
        direction: "outbound",
        mode: "driving",
        origin: "서울",
        destination: "부산",
        durationMinutes: 300,
        status: "unverified",
        confidence: "low",
        reason: UNRESOLVED_TIMEZONE_REASON,
      },
      inbound: {
        direction: "inbound",
        mode: "driving",
        origin: "부산",
        destination: "서울",
        durationMinutes: 300,
        status: "unverified",
        confidence: "low",
        reason: UNRESOLVED_TIMEZONE_REASON,
      },
    },
  };
  return stored;
}

// Replaying the stored evidence must not turn a UTC fallback into a fact: the timezone stays
// unresolved, and everything that was requested against UTC departure timing stays unverified.
function assertTimezoneStaysUnresolved(result) {
  assert.equal(result.status, "needs_review");
  assert.notEqual(result.evidence.timezone.source, "trip");
  assert.notEqual(result.evidence.timezone.status, "verified");
  assert.deepEqual(
    [result.evidence.timezone.timezone, result.evidence.timezone.source, result.evidence.timezone.status],
    ["UTC", "fallback", "unavailable"]
  );
  const timezoneTask = result.plan.verificationTasks.find((task) => task.code === "TIMEZONE_UNAVAILABLE");
  assert.ok(timezoneTask, "the unresolved timezone must still be flagged");
  assert.match(timezoneTask.message, /timezone lookup failed: 503/);
  assert.match(timezoneTask.message, /transit and travel durations .* must be confirmed/);
  assert.equal(result.evidence.travel.status, "unverified");
  assert.equal(result.evidence.travel.localTransport.status, "unverified");
  for (const segment of Object.values(result.evidence.travel.majorTransport)) {
    assert.equal(segment.status, "unverified");
    assert.equal(segment.reason, UNRESOLVED_TIMEZONE_REASON);
  }
}

function scheduledActivities(plan) {
  return plan.days.flatMap((day) => day.activities);
}

function scheduledPlaceIds(plan) {
  return scheduledActivities(plan).map((activity) => activity.placeId);
}

// What the caller persists after an action: the returned plan, evidence and constraints become the
// stored revision the next action reads.
function recordFromResult(stored, result) {
  const next = structuredClone(stored);
  next.revisions = [{
    ...next.revisions[0],
    groundedPlan: structuredClone(result.plan),
    evidence: structuredClone(result.evidence),
    planningConstraints: structuredClone(result.planningConstraints),
  }];
  return next;
}

function openingHoursOf(evidence, placeId) {
  return evidence.places.items.find((item) => item.id === placeId)?.openingHours;
}

test("checkStoredGroundedPlan reruns validation from stored evidence", () => {
  const stored = structuredClone(record());
  delete stored.revisions[0].evidence.places.items[0].openingHours["2026-08-01"];

  const checked = checkStoredGroundedPlan(stored);

  assert.equal(checked.ok, false);
  assert.ok(checked.issues.some((issue) => issue.code === "MISSING_OPENING_HOURS"));
});

test("checkStoredGroundedPlan verifies the break windows the stored plan was planned against", () => {
  const stored = structuredClone(record());
  const plan = stored.revisions[0].groundedPlan;
  plan.breakWindows = [{ start: "12:00", end: "13:00", kind: "meal" }];
  plan.days[0].activities[0].startTime = "11:30";
  plan.days[0].activities[0].endTime = "12:30";

  const checked = checkStoredGroundedPlan(stored);

  assert.equal(checked.ok, false);
  assert.deepEqual(checked.issues, [{
    code: "BREAK_WINDOW_CONFLICT",
    date: "2026-08-01",
    activityId: "old",
    breakKind: "meal",
    breakStart: "12:00",
    breakEnd: "13:00",
    actualStartTime: "11:30",
    actualEndTime: "12:30",
  }]);
});

test("replanStoredGroundedPlan preserves the split transport semantics of a stored flight trip", async () => {
  const stored = record();
  stored.transportPref = "flight";
  stored.revisions[0].input.transportPref = "flight";
  stored.revisions[0].evidence.travel = {
    ...stored.revisions[0].evidence.travel,
    localTransport: { mode: "driving", status: "verified", confidence: "high" },
    majorTransport: {
      outbound: { direction: "outbound", mode: "flight", origin: "서울", destination: "부산", status: "unavailable", reason: "verified flight schedule and airport evidence is not configured" },
      inbound: { direction: "inbound", mode: "flight", origin: "부산", destination: "서울", status: "unavailable", reason: "verified flight schedule and airport evidence is not configured" },
    },
  };

  const result = await replanStoredGroundedPlan(stored);

  assert.equal(result.evidence.travel.localTransport.mode, "driving");
  assert.deepEqual(
    result.plan.verificationTasks.filter((task) => task.code === "MAJOR_TRANSPORT_UNAVAILABLE").map((task) => task.direction),
    ["outbound", "inbound"]
  );
});

test("replanStoredGroundedPlan rebuilds a valid plan from stored evidence", async () => {
  const result = await replanStoredGroundedPlan(record());

  assert.equal(result.plan.validation.ok, true);
  assert.ok(result.plan.days.some((day) => day.activities.length > 0));
});

test("replaceStoredGroundedPlace removes the old place and requires its replacement", async () => {
  const result = await replaceStoredGroundedPlace(record(), "old", "replacement");
  const scheduled = result.plan.days.flatMap((day) => day.activities.map((activity) => activity.placeId));

  assert.ok(!scheduled.includes("old"));
  assert.ok(scheduled.includes("replacement"));
  assert.deepEqual(result.planningConstraints, [
    { type: "exclude", placeId: "old" },
    { type: "require", placeId: "replacement" },
  ]);
});

test("moveStoredGroundedPlace restricts the place to the requested verified date", async () => {
  const result = await moveStoredGroundedPlace(record(), "old", "2026-08-02");
  const oldDay = result.plan.days.find((day) =>
    day.activities.some((activity) => activity.placeId === "old")
  );

  assert.equal(oldDay.date, "2026-08-02");
  assert.deepEqual(result.planningConstraints, [
    { type: "move", placeId: "old", targetDate: "2026-08-02" },
  ]);
});

test("moveStoredGroundedPlace rejects a date outside the stored trip", async () => {
  await assert.rejects(
    moveStoredGroundedPlace(record(), "old", "2026-08-03"),
    /outside the stored trip/
  );
});

test("replanStoredGroundedPlan carries the stored break windows into the new plan", async () => {
  const result = await replanStoredGroundedPlan(recordWithBreaks());

  assert.deepEqual(result.plan.breakWindows, BREAK_WINDOWS);
});

test("replanStoredGroundedPlan keeps an explicitly empty break window list empty", async () => {
  const result = await replanStoredGroundedPlan(recordWithBreaks([]));

  assert.deepEqual(result.plan.breakWindows, []);
});

test("replanStoredGroundedPlan falls back to the stored input break windows", async () => {
  const stored = record();
  stored.revisions[0].input.breakWindows = [{ start: "13:00", end: "14:00", kind: "meal" }];

  const result = await replanStoredGroundedPlan(stored);

  assert.deepEqual(result.plan.breakWindows, [{ start: "13:00", end: "14:00", kind: "meal" }]);
});

test("replanStoredGroundedPlan keeps scheduling out of the stored break windows", async () => {
  const stored = recordWithBreaks([{ start: "09:00", end: "13:00", kind: "rest" }]);

  const result = await replanStoredGroundedPlan(stored);
  const activities = scheduledActivities(result.plan);

  assert.ok(activities.length > 0);
  for (const activity of activities) {
    assert.ok(activity.startTime >= "13:00", `${activity.placeId} starts at ${activity.startTime}`);
  }
});

test("replaceStoredGroundedPlace carries the stored break windows into the new plan", async () => {
  const result = await replaceStoredGroundedPlace(recordWithBreaks(), "old", "replacement");

  assert.deepEqual(result.plan.breakWindows, BREAK_WINDOWS);
});

test("moveStoredGroundedPlace carries the stored break windows into the new plan", async () => {
  const result = await moveStoredGroundedPlace(recordWithBreaks(), "old", "2026-08-02");

  assert.deepEqual(result.plan.breakWindows, BREAK_WINDOWS);
});

test("moveStoredGroundedPlace keeps the full stored opening hours in the returned evidence", async () => {
  const stored = record();
  const openingHours = structuredClone(stored.revisions[0].evidence.places.items[0].openingHours);

  const result = await moveStoredGroundedPlace(stored, "old", "2026-08-02");

  assert.deepEqual(openingHoursOf(result.evidence, "old"), openingHours);
  assert.deepEqual(stored.revisions[0].evidence.places.items[0].openingHours, openingHours);
});

test("a moved place can be moved back because its evidence still carries both dates", async () => {
  const stored = record();
  const openingHours = structuredClone(stored.revisions[0].evidence.places.items[0].openingHours);

  const moved = await moveStoredGroundedPlace(stored, "old", "2026-08-02");
  const back = await moveStoredGroundedPlace(recordFromResult(stored, moved), "old", "2026-08-01");

  const day = back.plan.days.find((entry) => entry.activities.some((activity) => activity.placeId === "old"));
  assert.equal(day.date, "2026-08-01");
  assert.deepEqual(back.planningConstraints, [{ type: "move", placeId: "old", targetDate: "2026-08-01" }]);
  assert.deepEqual(openingHoursOf(back.evidence, "old"), openingHours);
});

test("accumulated constraints keep every other place's constraint effective", async () => {
  const stored = record();
  stored.revisions[0].planningConstraints = [{ type: "exclude", placeId: "replacement" }];

  const result = await moveStoredGroundedPlace(stored, "old", "2026-08-02");

  assert.deepEqual(result.planningConstraints, [
    { type: "exclude", placeId: "replacement" },
    { type: "move", placeId: "old", targetDate: "2026-08-02" },
  ]);
  assert.ok(!scheduledPlaceIds(result.plan).includes("replacement"));
});

test("a superseded move for another place stays superseded across replans", async () => {
  const stored = record();
  stored.revisions[0].planningConstraints = [
    { type: "move", placeId: "replacement", targetDate: "2026-08-01" },
    { type: "move", placeId: "replacement", targetDate: "2026-08-02" },
  ];

  const result = await replanStoredGroundedPlan(stored);

  assert.deepEqual(result.planningConstraints, [
    { type: "move", placeId: "replacement", targetDate: "2026-08-02" },
  ]);
  const day = result.plan.days.find((entry) =>
    entry.activities.some((activity) => activity.placeId === "replacement")
  );
  assert.equal(day.date, "2026-08-02");
});

// A replace chain needs somewhere to go: old → replacement → third.
function recordWithThirdPlace() {
  const stored = record();
  const evidence = stored.revisions[0].evidence;
  evidence.places.items = [...evidence.places.items, {
    ...structuredClone(places[1]),
    id: "third",
    name: "Third Museum",
    score: 60,
    coordinates: { latitude: 35.3, longitude: 129.3 },
  }];
  Object.assign(evidence.travel.matrix, {
    "base|third": 10,
    "third|base": 10,
    "old|third": 10,
    "third|old": 10,
    "replacement|third": 10,
    "third|replacement": 10,
  });
  return stored;
}

test("a later exclude drops the require it supersedes", async () => {
  const result = await replaceStoredGroundedPlace(
    storedWithConstraints([{ type: "require", placeId: "old" }]),
    "old",
    "replacement"
  );

  assert.deepEqual(result.planningConstraints, [
    { type: "exclude", placeId: "old" },
    { type: "require", placeId: "replacement" },
  ]);
});

test("a later exclude drops the move it supersedes", async () => {
  const result = await replaceStoredGroundedPlace(
    storedWithConstraints([{ type: "move", placeId: "old", targetDate: "2026-08-02" }]),
    "old",
    "replacement"
  );

  assert.deepEqual(result.planningConstraints, [
    { type: "exclude", placeId: "old" },
    { type: "require", placeId: "replacement" },
  ]);
});

test("a later require reintroduces the place an earlier exclude dropped", async () => {
  const result = await replaceStoredGroundedPlace(
    storedWithConstraints([
      { type: "exclude", placeId: "old" },
      { type: "require", placeId: "replacement" },
    ]),
    "replacement",
    "old"
  );

  assert.deepEqual(result.planningConstraints, [
    { type: "exclude", placeId: "replacement" },
    { type: "require", placeId: "old" },
  ]);
  const scheduled = scheduledPlaceIds(result.plan);
  assert.ok(scheduled.includes("old"));
  assert.ok(!scheduled.includes("replacement"));
});

test("a redundant require does not weaken the move it repeats", async () => {
  const result = await replanStoredGroundedPlan(storedWithConstraints([
    { type: "move", placeId: "old", targetDate: "2026-08-02" },
    { type: "require", placeId: "old" },
  ]));

  assert.deepEqual(result.planningConstraints, [
    { type: "move", placeId: "old", targetDate: "2026-08-02" },
  ]);
  const day = result.plan.days.find((entry) =>
    entry.activities.some((activity) => activity.placeId === "old")
  );
  assert.equal(day.date, "2026-08-02");
});

test("a replace chain leaves only its excludes and the place it ended on", async () => {
  const stored = recordWithThirdPlace();
  const first = await replaceStoredGroundedPlace(stored, "old", "replacement");
  const second = await replaceStoredGroundedPlace(recordFromResult(stored, first), "replacement", "third");

  assert.deepEqual(second.planningConstraints, [
    { type: "exclude", placeId: "old" },
    { type: "exclude", placeId: "replacement" },
    { type: "require", placeId: "third" },
  ]);
  const scheduled = scheduledPlaceIds(second.plan);
  assert.ok(scheduled.includes("third"));
  assert.ok(!scheduled.includes("old") && !scheduled.includes("replacement"));
});

test("checkStoredGroundedPlan passes on the evidence a move persisted", async () => {
  const stored = record();
  const moved = await moveStoredGroundedPlace(stored, "old", "2026-08-02");

  const checked = checkStoredGroundedPlan(recordFromResult(stored, moved));

  assert.deepEqual(checked.issues, []);
  assert.equal(checked.ok, true);
});

test("replanStoredGroundedPlan keeps the stored arrival and departure windows", async () => {
  const result = await replanStoredGroundedPlan(recordWithTravelWindows());

  assertTravelWindows(result.plan);
});

test("replaceStoredGroundedPlace keeps the stored arrival and departure windows", async () => {
  const result = await replaceStoredGroundedPlace(recordWithTravelWindows(), "old", "replacement");

  assertTravelWindows(result.plan);
});

test("moveStoredGroundedPlace keeps the stored arrival and departure windows", async () => {
  const result = await moveStoredGroundedPlace(recordWithTravelWindows(), "old", "2026-08-02");

  assertTravelWindows(result.plan);
});

test("a replan never schedules outside the stored arrival and departure windows", async () => {
  const result = await replanStoredGroundedPlan(recordWithTravelWindows());

  for (const day of result.plan.days) {
    for (const activity of day.activities) {
      assert.ok(activity.startTime >= day.availableFrom, `${activity.startTime} precedes ${day.availableFrom}`);
      assert.ok(activity.endTime <= day.availableUntil, `${activity.endTime} exceeds ${day.availableUntil}`);
    }
  }
  assert.equal(result.plan.validation.ok, true);
});

test("replanStoredGroundedPlan defaults a legacy revision to the standard break windows", async () => {
  const stored = record();
  delete stored.revisions[0].groundedPlan.breakWindows;
  delete stored.revisions[0].input.breakWindows;

  const result = await replanStoredGroundedPlan(stored);

  assert.deepEqual(result.plan.breakWindows, DEFAULT_BREAK_WINDOWS);
});

test("the default break windows cannot be mutated through a replan", async () => {
  assert.ok(Object.isFrozen(DEFAULT_BREAK_WINDOWS));

  const first = await replanStoredGroundedPlan(record());
  first.plan.breakWindows[0].start = "05:00";
  const second = await replanStoredGroundedPlan(record());

  assert.deepEqual(second.plan.breakWindows, DEFAULT_BREAK_WINDOWS);
});

test("replanStoredGroundedPlan keeps an unresolved stored timezone unresolved", async () => {
  assertTimezoneStaysUnresolved(await replanStoredGroundedPlan(recordWithUnresolvedTimezone()));
});

test("replaceStoredGroundedPlace keeps an unresolved stored timezone unresolved", async () => {
  assertTimezoneStaysUnresolved(
    await replaceStoredGroundedPlace(recordWithUnresolvedTimezone(), "old", "replacement")
  );
});

test("moveStoredGroundedPlace keeps an unresolved stored timezone unresolved", async () => {
  assertTimezoneStaysUnresolved(
    await moveStoredGroundedPlace(recordWithUnresolvedTimezone(), "old", "2026-08-02")
  );
});

test("replanStoredGroundedPlan reuses a verified stored timezone", async () => {
  const stored = record();
  stored.revisions[0].evidence.timezone = {
    timezone: "Asia/Seoul",
    source: "open-meteo",
    fetchedAt: "2026-07-28T10:00:00Z",
    status: "verified",
  };
  stored.revisions[0].evidence.weather.status = "verified";

  const result = await replanStoredGroundedPlan(stored);

  assert.equal(result.evidence.timezone.timezone, "Asia/Seoul");
  assert.equal(result.evidence.timezone.status, "verified");
  assert.deepEqual(result.plan.verificationTasks.filter((task) => task.code.startsWith("TIMEZONE_")), []);
});

test("replanStoredGroundedPlan keeps a degraded stored timezone degraded", async () => {
  const stored = record();
  stored.revisions[0].evidence.timezone = {
    timezone: "Asia/Seoul",
    source: "weather-fixture",
    fetchedAt: "2026-07-28T10:00:00Z",
    status: "degraded",
    lookupError: "timezone lookup failed: 503",
  };
  stored.revisions[0].evidence.weather.status = "verified";

  const result = await replanStoredGroundedPlan(stored);

  assert.equal(result.evidence.timezone.timezone, "Asia/Seoul");
  assert.equal(result.evidence.timezone.status, "degraded");
  assert.equal(result.evidence.travel.status, undefined, "a resolved timezone leaves travel evidence alone");
  const degraded = result.plan.verificationTasks.find((task) => task.code === "TIMEZONE_LOOKUP_DEGRADED");
  assert.ok(degraded, "the failed lookup must stay visible");
  assert.match(degraded.message, /timezone lookup failed: 503/);
});

// What /refresh hands the action: a freshly collected grounded plan and evidence for the same
// trip. The stored revision keeps the constraints the traveller asked for; only the evidence is new.
function freshGeneration(mutateEvidence = (evidence) => evidence, source = record()) {
  const revision = source.revisions[0];
  return {
    groundedPlan: structuredClone(revision.groundedPlan),
    evidence: mutateEvidence({
      ...structuredClone(revision.evidence),
      places: { ...structuredClone(revision.evidence.places), source: "places-refreshed" },
    }),
  };
}

function storedWithConstraints(constraints) {
  const stored = record();
  stored.revisions[0].planningConstraints = structuredClone(constraints);
  return stored;
}

function withoutPlace(placeId) {
  return (evidence) => ({
    ...evidence,
    places: { ...evidence.places, items: evidence.places.items.filter((item) => item.id !== placeId) },
  });
}

function withPatchedPlace(placeId, patch) {
  return (evidence) => ({
    ...evidence,
    places: {
      ...evidence.places,
      items: evidence.places.items.map((item) => item.id === placeId ? { ...item, ...patch } : item),
    },
  });
}

// A rejection may name what the traveller asked for and never what the provider answered with.
function assertRejectsWithoutProviderPayload(promise, expectations) {
  return assert.rejects(promise, (error) => {
    for (const expectation of expectations) assert.match(error.message, expectation);
    assert.doesNotMatch(error.message, /fixture|refreshed|fetchedAt|35\.1|129\.1|key/i);
    return true;
  });
}

async function assertRefreshLeavesInputsUntouched(stored, generation, expectations) {
  const storedBefore = structuredClone(stored);
  const generationBefore = structuredClone(generation);

  await assertRejectsWithoutProviderPayload(refreshStoredGroundedPlan(stored, generation), expectations);

  assert.deepEqual(stored, storedBefore, "the stored record must be left untouched");
  assert.deepEqual(generation, generationBefore, "the freshly collected evidence must be left untouched");
}

test("refreshStoredGroundedPlan rejects when a required place is gone from the refreshed evidence", async () => {
  await assertRefreshLeavesInputsUntouched(
    storedWithConstraints([{ type: "require", placeId: "replacement" }]),
    freshGeneration(withoutPlace("replacement")),
    [/require/, /replacement/]
  );
});

test("refreshStoredGroundedPlan rejects when a required place lost its verified opening hours", async () => {
  await assertRefreshLeavesInputsUntouched(
    storedWithConstraints([{ type: "require", placeId: "replacement" }]),
    freshGeneration(withPatchedPlace("replacement", { openingHoursStatus: "estimated" })),
    [/require/, /replacement/]
  );
});

test("refreshStoredGroundedPlan rejects when a replacement target disappeared", async () => {
  await assertRefreshLeavesInputsUntouched(
    storedWithConstraints([
      { type: "exclude", placeId: "old" },
      { type: "require", placeId: "replacement" },
    ]),
    freshGeneration(withoutPlace("replacement")),
    [/require/, /replacement/]
  );
});

test("refreshStoredGroundedPlan rejects when a moved place lost the target date hours", async () => {
  await assertRefreshLeavesInputsUntouched(
    storedWithConstraints([{ type: "move", placeId: "old", targetDate: "2026-08-02" }]),
    freshGeneration(withPatchedPlace("old", { openingHours: { "2026-08-01": { open: "09:00", close: "18:00" } } })),
    [/move/, /old/, /2026-08-02/]
  );
});

test("refreshStoredGroundedPlan rejects when a moved place provenance became estimated", async () => {
  await assertRefreshLeavesInputsUntouched(
    storedWithConstraints([{ type: "move", placeId: "old", targetDate: "2026-08-02" }]),
    freshGeneration(withPatchedPlace("old", { openingHoursStatus: "estimated" })),
    [/move/, /old/]
  );
});

test("refreshStoredGroundedPlan keeps an exclude constraint whose place disappeared", async () => {
  const result = await refreshStoredGroundedPlan(
    storedWithConstraints([{ type: "exclude", placeId: "old" }]),
    freshGeneration(withoutPlace("old"))
  );

  assert.deepEqual(result.planningConstraints, [{ type: "exclude", placeId: "old" }]);
  assert.ok(!scheduledPlaceIds(result.plan).includes("old"));
});

test("refreshStoredGroundedPlan reapplies applicable require and move constraints to the fresh evidence", async () => {
  const stored = storedWithConstraints([
    { type: "exclude", placeId: "replacement" },
    { type: "move", placeId: "old", targetDate: "2026-08-02" },
  ]);
  const generation = freshGeneration();
  const generationBefore = structuredClone(generation);

  const result = await refreshStoredGroundedPlan(stored, generation);

  assert.deepEqual(result.planningConstraints, stored.revisions[0].planningConstraints);
  assert.equal(result.evidence.places.source, "places-refreshed", "the refreshed evidence is what was planned");
  assert.ok(!scheduledPlaceIds(result.plan).includes("replacement"));
  const day = result.plan.days.find((entry) => entry.activities.some((activity) => activity.placeId === "old"));
  assert.equal(day.date, "2026-08-02");
  assert.deepEqual(generation, generationBefore, "the freshly collected evidence must be left untouched");
});

test("refreshStoredGroundedPlan canonicalizes only a superseded move", async () => {
  const result = await refreshStoredGroundedPlan(
    storedWithConstraints([
      { type: "move", placeId: "old", targetDate: "2026-08-01" },
      { type: "move", placeId: "old", targetDate: "2026-08-02" },
    ]),
    freshGeneration()
  );

  assert.deepEqual(result.planningConstraints, [{ type: "move", placeId: "old", targetDate: "2026-08-02" }]);
});

test("refreshStoredGroundedPlan succeeds when the places a replace chain excluded disappeared", async () => {
  const stored = recordWithThirdPlace();
  stored.revisions[0].planningConstraints = [
    { type: "exclude", placeId: "old" },
    { type: "require", placeId: "replacement" },
    { type: "exclude", placeId: "replacement" },
    { type: "require", placeId: "third" },
  ];

  const result = await refreshStoredGroundedPlan(
    stored,
    freshGeneration((evidence) => withoutPlace("replacement")(withoutPlace("old")(evidence)), stored)
  );

  assert.deepEqual(result.planningConstraints, [
    { type: "exclude", placeId: "old" },
    { type: "exclude", placeId: "replacement" },
    { type: "require", placeId: "third" },
  ]);
  assert.ok(scheduledPlaceIds(result.plan).includes("third"));
});

test("refreshStoredGroundedPlan leaves an unschedulable required place explicit instead of ready", async () => {
  const result = await refreshStoredGroundedPlan(
    storedWithConstraints([{ type: "require", placeId: "replacement" }]),
    // Longer than the day window the verified hours leave open, so it cannot be scheduled at all.
    freshGeneration(withPatchedPlace("replacement", { durationMinutes: 600 }))
  );

  assert.equal(result.status, "needs_review");
  assert.ok(result.plan.verificationTasks.some((task) =>
    task.code === "REQUIRED_PLACE_UNSCHEDULED" && task.placeId === "replacement"
  ));
  assert.deepEqual(result.planningConstraints, [{ type: "require", placeId: "replacement" }]);
});

test("a replanned plan is still checked against the break windows it was planned with", async () => {
  const stored = recordWithBreaks();
  const result = await replanStoredGroundedPlan(stored);
  const replanned = structuredClone(stored);
  replanned.revisions[0].groundedPlan = structuredClone(result.plan);
  const activity = scheduledActivities(replanned.revisions[0].groundedPlan)[0];
  activity.startTime = "11:30";
  activity.endTime = "12:30";

  const checked = checkStoredGroundedPlan(replanned);

  assert.equal(checked.ok, false);
  assert.ok(checked.issues.some((issue) =>
    issue.code === "BREAK_WINDOW_CONFLICT" && issue.activityId === activity.placeId
  ));
});

// --- integrated stored diagnostics -----------------------------------------------------------

// Diagnosis reads every required subject fail-closed, so the baseline a "clean plan" test rests on
// has to be a snapshot that actually says it was verified — including the timezone one.
function diagnosisRecord(mutate = (draft) => draft) {
  const draft = record();
  const evidence = draft.revisions[0].evidence;
  evidence.places.status = "verified";
  evidence.weather.status = "verified";
  evidence.travel.status = "verified";
  evidence.timezone = {
    source: "timezone-fixture",
    fetchedAt: "2026-07-28T10:00:00Z",
    timezone: "Asia/Seoul",
    status: "verified",
  };
  return mutate(draft);
}

const DIAGNOSIS_NOW = () => new Date("2026-07-28T12:00:00Z");

test("diagnoseStoredGroundedPlan reports a clean stored plan as ready", () => {
  const stored = diagnosisRecord();
  const before = structuredClone(stored);

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis, {
    hardConstraintsOk: true,
    ready: true,
    hardIssues: [],
    evidenceIssues: [],
    staleSources: [],
  });
  assert.deepEqual(stored, before, "diagnosis must not mutate the stored record");
});

test("diagnoseStoredGroundedPlan carries the stored verification tasks and dedups them", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].groundedPlan.verificationTasks = [
      { code: "MISSING_OR_UNVERIFIED_OPENING_HOURS", placeId: "old", message: "old hours are missing" },
      { code: "MISSING_OR_UNVERIFIED_OPENING_HOURS", placeId: "old", message: "old hours are missing" },
      { code: "MAJOR_TRANSPORT_UNAVAILABLE", direction: "outbound", message: "flight must be confirmed" },
      { code: "MAJOR_TRANSPORT_UNAVAILABLE", direction: "inbound", message: "flight must be confirmed" },
    ];
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.equal(diagnosis.hardConstraintsOk, true);
  assert.equal(diagnosis.ready, false);
  assert.deepEqual(diagnosis.evidenceIssues.map((issue) => `${issue.code}:${issue.placeId || issue.direction || ""}`), [
    "MISSING_OR_UNVERIFIED_OPENING_HOURS:old",
    "MAJOR_TRANSPORT_UNAVAILABLE:outbound",
    "MAJOR_TRANSPORT_UNAVAILABLE:inbound",
  ]);
});

test("diagnoseStoredGroundedPlan keeps two unmatched highlights apart", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].groundedPlan.verificationTasks = [
      { code: "REQUIRED_PLACE_NOT_FOUND", highlight: "감천문화마을", message: "감천문화마을 could not be matched" },
      { code: "REQUIRED_PLACE_NOT_FOUND", highlight: "해운대 스파랜드", message: "해운대 스파랜드 could not be matched" },
    ];
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues.map((issue) => issue.highlight), [
    "감천문화마을",
    "해운대 스파랜드",
  ]);
});

test("diagnoseStoredGroundedPlan dedups two tasks naming the same unmatched highlight", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].groundedPlan.verificationTasks = [
      { code: "REQUIRED_PLACE_NOT_FOUND", highlight: "감천문화마을", message: "감천문화마을 could not be matched" },
      { code: "REQUIRED_PLACE_NOT_FOUND", highlight: "감천문화마을", message: "감천문화마을 could not be matched" },
    ];
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues.map((issue) => issue.highlight), ["감천문화마을"]);
});

test("diagnoseStoredGroundedPlan reports evidence that expired before now", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].evidence.weather.expiresAt = "2026-07-28T11:00:00Z";
    draft.revisions[0].evidence.travel.expiresAt = "2026-07-28T23:00:00Z";
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.staleSources, [
    { subject: "weather", source: "weather-fixture", expiresAt: "2026-07-28T11:00:00Z" },
  ]);
  assert.deepEqual(diagnosis.evidenceIssues, [
    { code: "EVIDENCE_STALE", subject: "weather", source: "weather-fixture", expiresAt: "2026-07-28T11:00:00Z" },
  ]);
  assert.equal(diagnosis.ready, false);
});

// An expiry nobody can read is not an expiry in the future: reading it as fresh is the one answer
// the traveller cannot check.
test("diagnoseStoredGroundedPlan refuses to call an unreadable expiry fresh", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].evidence.places.expiresAt = "not-an-iso-timestamp";
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues, [{
    code: "EVIDENCE_FRESHNESS_INVALID",
    subject: "places",
    source: "places-fixture",
    expiresAt: "not-an-iso-timestamp",
  }]);
  assert.deepEqual(diagnosis.staleSources, []);
  assert.equal(diagnosis.ready, false);
});

// A snapshot that declares no expiry never expires, so its absence is not a freshness failure.
test("diagnoseStoredGroundedPlan accepts a snapshot that declares no expiry", () => {
  const diagnosis = diagnoseStoredGroundedPlan(diagnosisRecord(), { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues, []);
  assert.equal(diagnosis.ready, true);
});

test("diagnoseStoredGroundedPlan reports every required subject an empty evidence set never carried", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].evidence = {};
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(
    diagnosis.evidenceIssues.filter((issue) => issue.code === "EVIDENCE_MISSING"),
    [
      { code: "EVIDENCE_MISSING", subject: "weather" },
      { code: "EVIDENCE_MISSING", subject: "timezone" },
      { code: "EVIDENCE_MISSING", subject: "places" },
      { code: "EVIDENCE_MISSING", subject: "localTransport" },
    ],
    "a subject that is absent is not a subject that was verified"
  );
  assert.equal(diagnosis.ready, false);
});

test("diagnoseStoredGroundedPlan reports a snapshot that never stated a status", () => {
  const stored = diagnosisRecord((draft) => {
    delete draft.revisions[0].evidence.places.status;
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues, [
    { code: "EVIDENCE_UNVERIFIED", subject: "places", source: "places-fixture", status: "unknown" },
  ]);
  assert.equal(diagnosis.ready, false);
});

test("diagnoseStoredGroundedPlan reports an unverified snapshot no stored task represents", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].evidence.weather.status = "forecast_horizon";
    draft.revisions[0].evidence.timezone = {
      source: "fallback",
      fetchedAt: "2026-07-28T10:00:00Z",
      timezone: "UTC",
      status: "unavailable",
    };
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues, [
    { code: "EVIDENCE_UNVERIFIED", subject: "weather", source: "weather-fixture", status: "forecast_horizon" },
    { code: "EVIDENCE_UNVERIFIED", subject: "timezone", source: "fallback", status: "unavailable" },
  ]);
  assert.equal(diagnosis.ready, false);
});

test("diagnoseStoredGroundedPlan does not repeat an unverified snapshot its task already names", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].evidence.weather.status = "forecast_horizon";
    draft.revisions[0].evidence.weather.refreshAfter = "2026-09-25";
    draft.revisions[0].evidence.travel.localTransport = { mode: "driving", status: "unverified" };
    draft.revisions[0].groundedPlan.verificationTasks = [
      {
        code: "WEATHER_FORECAST_HORIZON",
        dates: ["2026-08-01"],
        refreshAfter: "2026-09-25",
        message: "not published yet",
      },
      { code: "MAJOR_TRANSPORT_TIMEZONE_UNVERIFIED", message: "durations were requested with UTC timing" },
    ];
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues.map((issue) => issue.code), [
    "WEATHER_FORECAST_HORIZON",
    "MAJOR_TRANSPORT_TIMEZONE_UNVERIFIED",
  ]);
  assert.equal(diagnosis.evidenceIssues[0].refreshAfter, "2026-09-25");
});

test("diagnoseStoredGroundedPlan reports an unavailable major transport segment with no task", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].evidence.travel.majorTransport = {
      outbound: { direction: "outbound", status: "unavailable", mode: "flight", origin: "서울", destination: "푸꾸옥" },
      inbound: { direction: "inbound", status: "verified", mode: "flight", origin: "푸꾸옥", destination: "서울" },
    };
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues, [
    {
      code: "EVIDENCE_UNVERIFIED",
      subject: "majorTransport",
      source: "travel-fixture",
      status: "unavailable",
      direction: "outbound",
    },
  ]);
});

// Each direction is confirmed on its own, so the task that names one answers for that one only.
function withUnavailableMajorTransport(draft) {
  draft.revisions[0].evidence.travel.majorTransport = {
    outbound: { direction: "outbound", status: "unavailable", mode: "flight", origin: "서울", destination: "푸꾸옥" },
    inbound: { direction: "inbound", status: "unavailable", mode: "flight", origin: "푸꾸옥", destination: "서울" },
  };
  return draft;
}

test("diagnoseStoredGroundedPlan reports the direction a stored major transport task does not cover", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].groundedPlan.verificationTasks = [
      { code: "MAJOR_TRANSPORT_UNAVAILABLE", direction: "outbound", message: "flight must be confirmed" },
    ];
    return withUnavailableMajorTransport(draft);
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues, [
    { code: "MAJOR_TRANSPORT_UNAVAILABLE", direction: "outbound", message: "flight must be confirmed" },
    {
      code: "EVIDENCE_UNVERIFIED",
      subject: "majorTransport",
      source: "travel-fixture",
      status: "unavailable",
      direction: "inbound",
    },
  ]);
});

test("diagnoseStoredGroundedPlan does not repeat a direction its own stored task already names", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].groundedPlan.verificationTasks = [
      { code: "MAJOR_TRANSPORT_UNAVAILABLE", direction: "outbound", message: "outbound must be confirmed" },
      { code: "MAJOR_TRANSPORT_UNAVAILABLE", direction: "inbound", message: "inbound must be confirmed" },
    ];
    return withUnavailableMajorTransport(draft);
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues.map((issue) => `${issue.code}:${issue.direction || ""}`), [
    "MAJOR_TRANSPORT_UNAVAILABLE:outbound",
    "MAJOR_TRANSPORT_UNAVAILABLE:inbound",
  ]);
});

test("diagnoseStoredGroundedPlan keeps a directionless legacy major leg answered by its directionless task", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].evidence.travel.majorLeg = {
      status: "unavailable",
      mode: "flight",
      origin: "서울",
      destination: "푸꾸옥",
    };
    draft.revisions[0].groundedPlan.verificationTasks = [
      { code: "MAJOR_TRANSPORT_UNAVAILABLE", message: "flight must be confirmed" },
    ];
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues, [
    { code: "MAJOR_TRANSPORT_UNAVAILABLE", message: "flight must be confirmed" },
  ]);
});

// A leg reads as confirmed only when it says so. A status this file has never heard of is not a
// status it may read as verified, and a leg that states none at all is the same claim with the word
// left out — both are reported, so a whitelist of known failures cannot let one through.
test("diagnoseStoredGroundedPlan reports a major transport status it has never heard of", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].evidence.travel.majorTransport = {
      outbound: { direction: "outbound", status: "mystery", mode: "flight", origin: "서울", destination: "푸꾸옥" },
      inbound: { direction: "inbound", status: "verified", mode: "flight", origin: "푸꾸옥", destination: "서울" },
    };
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues, [
    {
      code: "EVIDENCE_UNVERIFIED",
      subject: "majorTransport",
      source: "travel-fixture",
      status: "mystery",
      direction: "outbound",
    },
  ]);
  assert.equal(diagnosis.ready, false);
});

test("diagnoseStoredGroundedPlan reports a major transport segment that never stated a status", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].evidence.travel.majorTransport = {
      outbound: { direction: "outbound", mode: "flight", origin: "서울", destination: "푸꾸옥" },
      inbound: { direction: "inbound", status: "verified", mode: "flight", origin: "푸꾸옥", destination: "서울" },
    };
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues, [
    {
      code: "EVIDENCE_UNVERIFIED",
      subject: "majorTransport",
      source: "travel-fixture",
      status: "unknown",
      direction: "outbound",
    },
  ]);
});

test("diagnoseStoredGroundedPlan leaves a major transport pair that says it was verified alone", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].evidence.travel.majorTransport = {
      outbound: { direction: "outbound", status: "verified", mode: "flight", origin: "서울", destination: "푸꾸옥" },
      inbound: { direction: "inbound", status: "verified", mode: "flight", origin: "푸꾸옥", destination: "서울" },
    };
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues, []);
  assert.equal(diagnosis.ready, true);
});

test("diagnoseStoredGroundedPlan reports a legacy major leg that never stated a status", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].evidence.travel.majorLeg = { mode: "flight", origin: "서울", destination: "푸꾸옥" };
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues, [
    { code: "EVIDENCE_UNVERIFIED", subject: "majorTransport", source: "travel-fixture", status: "unknown" },
  ]);
});

// An expiry the calendar has no day for is not an expiry in the future. `Date.parse` rolls
// 2026-02-30 forward to 2026-03-02 and 2027-02-29 to 2027-03-01, so a plan resting on a date that
// never existed would read as fresh — the one answer the traveller has no way to check.
test("diagnoseStoredGroundedPlan refuses an expiry on a day the calendar never had", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].evidence.places.expiresAt = "2026-02-30T00:00:00Z";
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues, [{
    code: "EVIDENCE_FRESHNESS_INVALID",
    subject: "places",
    source: "places-fixture",
    expiresAt: "2026-02-30T00:00:00Z",
  }]);
  assert.deepEqual(diagnosis.staleSources, []);
});

test("diagnoseStoredGroundedPlan refuses a February 29th an ordinary year never had", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].evidence.places.expiresAt = "2027-02-29T00:00:00Z";
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues.map((issue) => issue.code), ["EVIDENCE_FRESHNESS_INVALID"]);
});

test("diagnoseStoredGroundedPlan refuses a clock and an offset no day carries", () => {
  for (const expiresAt of [
    "2026-07-28T25:00:00Z",
    "2026-07-28T12:60:00Z",
    "2026-07-28T12:00:61Z",
    "2026-07-28T12:00:00+25:00",
    "2026-07-28T12:00:00+09:60",
    "2026-07-28T12:00:00",
    "2026-07-28",
    "28/07/2026 12:00",
  ]) {
    const stored = diagnosisRecord((draft) => {
      draft.revisions[0].evidence.places.expiresAt = expiresAt;
      return draft;
    });

    const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

    assert.deepEqual(
      diagnosis.evidenceIssues,
      [{ code: "EVIDENCE_FRESHNESS_INVALID", subject: "places", source: "places-fixture", expiresAt }],
      `${expiresAt} is not a timestamp anyone can act on`
    );
  }
});

// The canonical form the collectors write, and the offset form a stored snapshot may carry, both
// stay readable: strict validation that rejected them would fail every fresh plan closed.
test("diagnoseStoredGroundedPlan reads the timestamps the system itself writes", () => {
  for (const expiresAt of [
    new Date("2026-07-28T13:00:00Z").toISOString(),
    "2026-07-28T13:00:00Z",
    "2026-07-28T23:00:00+09:00",
    "2026-07-28T13:00:00.500Z",
    "2028-02-29T00:00:00Z",
  ]) {
    const stored = diagnosisRecord((draft) => {
      draft.revisions[0].evidence.places.expiresAt = expiresAt;
      return draft;
    });

    const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

    assert.deepEqual(diagnosis.evidenceIssues, [], `${expiresAt} is a readable expiry in the future`);
  }
});

test("diagnoseStoredGroundedPlan still reads an offset expiry that has already passed as stale", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].evidence.places.expiresAt = "2026-07-28T20:00:00+09:00";
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues.map((issue) => issue.code), ["EVIDENCE_STALE"]);
});

test("diagnoseStoredGroundedPlan keeps a stored needs_review revision out of ready", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].generationStatus = "needs_review";
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.deepEqual(diagnosis.evidenceIssues, []);
  assert.equal(diagnosis.hardConstraintsOk, true);
  assert.equal(diagnosis.ready, false);
});

test("diagnoseStoredGroundedPlan surfaces hard constraint issues alongside evidence", () => {
  const stored = diagnosisRecord((draft) => {
    draft.revisions[0].groundedPlan.days[0].activities[0].endTime = "23:30";
    return draft;
  });

  const diagnosis = diagnoseStoredGroundedPlan(stored, { now: DIAGNOSIS_NOW });

  assert.equal(diagnosis.hardConstraintsOk, false);
  assert.equal(diagnosis.ready, false);
  assert.ok(diagnosis.hardIssues.length > 0);
  assert.equal(diagnosis.hardIssues[0].date, "2026-08-01");
});
