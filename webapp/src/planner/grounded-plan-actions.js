import { DEFAULT_BREAK_WINDOWS, normalizeGroundedTripInput } from "./grounded-plan-output.js";
import { createGroundedTripPlan } from "./grounded-planner-service.js";
import { validateTripPlan } from "./trip-planner.js";

function latestGroundedRevision(record) {
  const revision = record?.revisions?.[record.revisions.length - 1];
  if (!revision?.groundedPlan || !revision?.evidence) {
    throw new TypeError("stored plan does not contain grounded plan evidence");
  }
  return revision;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// The stored end date is what the trip was planned to, so nights is read back off the dates rather
// than trusted separately: the derived departure day has to land on the day the plan ends.
function storedNights(startDate, endDate, fallback) {
  const nights = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS;
  return Number.isInteger(nights) && nights >= 0 ? nights : fallback;
}

function tripFromRecord(record, revision) {
  // Breaks are a hard constraint the stored plan was built against, and the stored input does not
  // carry them, so replanning off the input alone would silently drop every break. The structured
  // plan is the record of what was actually planned — including an explicit `[]` — so it wins over
  // the input. A revision predating break windows recorded neither, and replanning it with no
  // breaks at all would book over every meal, so it falls back to the same defaults a new plan gets.
  const breakWindows = revision.groundedPlan?.breakWindows
    ?? revision.input?.breakWindows
    ?? DEFAULT_BREAK_WINDOWS;
  const startDate = record.startDate || revision.input?.startDate;
  const endDate = record.endDate || revision.input?.endDate;
  // Only the raw HH:MM arrival and departure are stored, so the boundary windows they narrow exist
  // solely in the derived trip. Rebuilding it through the same normalizer a new plan goes through
  // is what keeps a replan planning against the day the traveller actually has.
  return {
    ...normalizeGroundedTripInput({
      ...record,
      ...revision.input,
      startDate,
      nights: storedNights(startDate, endDate, revision.input?.nights ?? record.nights),
      // A stored timezone is only a fact if the lookup verified it. Handing back a UTC fallback as an
      // explicit trip timezone would promote it to verified on the replan and drop every task that
      // says the transport durations behind it were requested against the wrong departure moment, so
      // anything unverified is resolved again from the stored evidence instead.
      timezone: revision.evidence.timezone?.status === "verified"
        ? revision.evidence.timezone.timezone
        : "auto",
    }),
    breakWindows: structuredClone(breakWindows),
  };
}

function evidenceCollectors(evidence) {
  return {
    places: { collect: async () => evidence.places },
    weather: {
      // Replaying evidence must not resolve what the original run could not: only a verified
      // timezone answers, and anything else fails again with the reason it failed with.
      resolveTimezone: async () => {
        const stored = evidence.timezone;
        if (stored?.status === "verified") return stored;
        throw new Error(stored?.error || stored?.lookupError || "stored evidence has no verified timezone");
      },
      collect: async () => evidence.weather,
    },
    travel: { collect: async () => evidence.travel },
  };
}

function applyPlanningConstraints(items, constraints) {
  return constraints.reduce((current, constraint) => {
    if (constraint.type === "exclude") {
      return current.filter((item) => item.id !== constraint.placeId);
    }
    if (constraint.type === "require") {
      return current.map((item) => item.id === constraint.placeId ? { ...item, required: true } : item);
    }
    if (constraint.type === "move") {
      return current.map((item) => {
        if (item.id !== constraint.placeId) return item;
        const openingWindow = item.openingHours?.[constraint.targetDate];
        if (!openingWindow) {
          throw new Error(`place ${item.id} has no verified opening hours on ${constraint.targetDate}`);
        }
        return { ...item, required: true, openingHours: { [constraint.targetDate]: openingWindow } };
      });
    }
    throw new TypeError(`unsupported planning constraint: ${constraint.type}`);
  }, items);
}

// A constraint the planner cannot reapply is user intent silently dropped: `require` would match no
// item and `move` would narrow nothing, and the replan would look like a clean plan the traveller
// never asked for. Evidence is refreshed from live providers, so the place a constraint names can
// genuinely be gone or no longer provider-verified — that has to stop the replan, not survive it.
// An exclude still holds against a place that disappeared: it is already not schedulable.
// The message names the constraint and nothing the provider answered with.
function assertPlanningConstraintsApplicable(items, constraints) {
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const constraint of constraints) {
    if (constraint.type === "exclude") continue;
    const place = byId.get(constraint.placeId);
    if (!place) {
      throw new Error(`stored ${constraint.type} constraint for place ${constraint.placeId} cannot be reapplied: the place is no longer in the collected evidence`);
    }
    if (place.openingHoursStatus !== "verified") {
      throw new Error(`stored ${constraint.type} constraint for place ${constraint.placeId} cannot be reapplied: its opening hours are no longer provider-verified`);
    }
    if (constraint.type === "move" && !place.openingHours?.[constraint.targetDate]) {
      throw new Error(`stored move constraint for place ${constraint.placeId} cannot be reapplied: it has no verified opening hours on ${constraint.targetDate}`);
    }
  }
}

// Constraints accumulate across actions, but a place can only end in one state, so anything an
// action superseded is stale intent: a replace leaves its exclude behind the require it dropped,
// and a refresh replays that require against evidence where the traveller's own replace means the
// place may well be gone — a rejection over a place nobody asked to keep. Each place therefore
// collapses to the single constraint that still holds. An exclude or a move supersedes whatever
// came before it for that place; a later require undoes an exclude, but not a move, which already
// requires the place and narrows it further. The surviving constraint keeps the position that
// decided it, so the order the traveller asked for is the order the planner replays.
function canonicalizePlanningConstraints(constraints) {
  const effective = new Map();
  constraints.forEach((constraint, index) => {
    const current = effective.get(constraint.placeId);
    if (current?.constraint.type === "move" && constraint.type === "require") return;
    effective.set(constraint.placeId, { constraint, index });
  });
  return [...effective.values()]
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.constraint);
}

// A stored snapshot only reads as evidence while it says it was verified: `verified` is the only
// status that claims nothing is outstanding, so a status this file has never heard of — or none at
// all — reads as unverified rather than slipping through a list of known failures.
const VERIFIED_EVIDENCE_STATUS = "verified";

// Each subject names the task codes that already say what its status says, so a plan carrying the
// task is not reported twice for the same fact.
const EVIDENCE_SUBJECTS = [
  {
    subject: "weather",
    snapshot: (evidence) => evidence.weather,
    codes: ["WEATHER_UNAVAILABLE", "WEATHER_FORECAST_HORIZON", "WEATHER_FORECAST_MISSING"],
  },
  {
    subject: "timezone",
    snapshot: (evidence) => evidence.timezone,
    codes: ["TIMEZONE_UNAVAILABLE", "TIMEZONE_LOOKUP_DEGRADED"],
  },
  {
    subject: "places",
    snapshot: (evidence) => evidence.places,
    codes: ["MISSING_OR_UNVERIFIED_OPENING_HOURS", "REQUIRED_PLACE_NOT_FOUND", "PLACE_SEARCH_COVERAGE_DEGRADED"],
  },
  {
    subject: "localTransport",
    // A snapshot predating the local/major split described only the local matrix.
    snapshot: (evidence) => evidence.travel?.localTransport
      ? { ...evidence.travel.localTransport, source: evidence.travel.source }
      : evidence.travel,
    codes: ["MAJOR_TRANSPORT_TIMEZONE_UNVERIFIED", "LOCAL_TRANSPORT_UNAVAILABLE"],
  },
];

const MAJOR_TRANSPORT_CODES = ["MAJOR_TRANSPORT_UNAVAILABLE", "MAJOR_TRANSPORT_TIMEZONE_UNVERIFIED"];

// Two tasks describing the same fact about the same place, date, direction or highlight are one
// finding: the same code twice over the same subject is what a merged view has to collapse. A task
// for an unmatched highlight names no place — the highlight is its whole identity — so leaving it
// out merges two distinct missing places into one.
function taskKey(task) {
  return [task.code, task.placeId || "", task.date || "", task.direction || "", task.highlight || ""].join("|");
}

// `Date.parse` reads 2026-02-30 as March 2nd and 2027-02-29 as March 1st, so an expiry on a day the
// calendar never had would come back as a comfortable date in the future. The shape is checked
// first, then the calendar day is confirmed by round trip — the same way the planner reads a trip
// date — so only a timestamp that names a real instant reaches the comparison.
const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;

function isIsoTimestamp(value) {
  const match = ISO_TIMESTAMP.exec(value);
  if (!match) return false;
  const [, year, month, day, hours, minutes, seconds, offsetHours, offsetMinutes] = match;
  if (Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) > 59) return false;
  if (offsetHours !== undefined && (Number(offsetHours) > 23 || Number(offsetMinutes) > 59)) return false;
  const utc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return utc.toISOString().slice(0, 10) === `${year}-${month}-${day}`;
}

// A snapshot that declares no expiry never expires, so its absence is not a finding. An expiry
// nobody can read is a different thing entirely: treating it as "not expired yet" is the one
// answer the traveller has no way to check, so it fails closed instead.
function freshnessIssue(subject, snapshot, nowMs) {
  const expiresAt = String(snapshot.expiresAt || "").trim();
  if (!expiresAt) return null;
  const entry = { subject, source: snapshot.source, expiresAt };
  if (!isIsoTimestamp(expiresAt)) return { code: "EVIDENCE_FRESHNESS_INVALID", ...entry };
  const expiry = Date.parse(expiresAt);
  if (Number.isNaN(expiry)) return { code: "EVIDENCE_FRESHNESS_INVALID", ...entry };
  return expiry <= nowMs ? { code: "EVIDENCE_STALE", ...entry } : null;
}

// Pure and offline by construction: it reads the stored revision only. What a plan is still waiting
// on lives in three places — the hard-constraint check, the tasks the plan was saved with, and the
// evidence snapshots themselves — and a reader who sees only one of them reads a plan as settled
// while it is not.
export function diagnoseStoredGroundedPlan(record, { now = () => new Date() } = {}) {
  const revision = latestGroundedRevision(record);
  const evidence = revision.evidence;
  const nowMs = now().getTime();
  const hardIssues = validateTripPlan({
    plan: revision.groundedPlan,
    places: evidence.places?.items || [],
    travelMinutes: evidence.travel?.matrix || {},
  }).issues;

  const tasks = revision.groundedPlan.verificationTasks || [];
  const seenTaskKeys = new Set();
  const taskIssues = tasks.filter((task) => {
    const key = taskKey(task);
    if (seenTaskKeys.has(key)) return false;
    seenTaskKeys.add(key);
    return true;
  });
  const taskCodes = new Set(tasks.map((task) => task.code));

  const staleSources = [];
  const evidenceIssues = [...taskIssues];
  for (const { subject, snapshot, codes } of EVIDENCE_SUBJECTS) {
    const current = snapshot(evidence);
    // A subject the record never carried is not a subject that came back clean, and reading a
    // missing snapshot as "nothing to report" is exactly how an unevidenced plan reads as ready.
    if (!current || typeof current !== "object") {
      evidenceIssues.push({ code: "EVIDENCE_MISSING", subject });
      continue;
    }
    const freshness = freshnessIssue(subject, current, nowMs);
    if (freshness) {
      if (freshness.code === "EVIDENCE_STALE") staleSources.push({ subject, source: current.source, expiresAt: freshness.expiresAt });
      evidenceIssues.push(freshness);
    }
    if (current.status !== VERIFIED_EVIDENCE_STATUS && !codes.some((code) => taskCodes.has(code))) {
      evidenceIssues.push({
        code: "EVIDENCE_UNVERIFIED",
        subject,
        source: current.source,
        status: current.status || "unknown",
      });
    }
  }
  // Each direction is its own leg with its own evidence, so an unavailable outbound is not answered
  // by a verified inbound.
  const majorSegments = evidence.travel?.majorTransport
    ? Object.values(evidence.travel.majorTransport)
    : [evidence.travel?.majorLeg].filter(Boolean);
  // A task that names a direction speaks for that leg only, so an outbound task cannot answer for an
  // unavailable inbound. A task that names none either predates the split or covers every leg — as
  // the timezone task, emitted once for all of them, does — so it still answers for each.
  const majorTaskKeys = new Set(tasks.filter((task) => MAJOR_TRANSPORT_CODES.includes(task.code)).map(taskKey));
  const majorTaskAnswers = (direction) => MAJOR_TRANSPORT_CODES.some((code) =>
    majorTaskKeys.has(taskKey({ code, direction })) || majorTaskKeys.has(taskKey({ code }))
  );
  // A leg reads as confirmed only when it says so: a status this file has never heard of, and a leg
  // that states none at all, are both claims the plan is still resting on.
  for (const segment of majorSegments) {
    const status = segment?.status || "unknown";
    if (status === VERIFIED_EVIDENCE_STATUS) continue;
    if (majorTaskAnswers(segment?.direction)) continue;
    evidenceIssues.push({
      code: "EVIDENCE_UNVERIFIED",
      subject: "majorTransport",
      source: evidence.travel.source,
      status,
      ...(segment?.direction ? { direction: segment.direction } : {}),
    });
  }

  const hardConstraintsOk = hardIssues.length === 0;
  return {
    hardConstraintsOk,
    ready: hardConstraintsOk && evidenceIssues.length === 0 && revision.generationStatus !== "needs_review",
    hardIssues,
    evidenceIssues,
    staleSources,
  };
}

export function checkStoredGroundedPlan(record) {
  const revision = latestGroundedRevision(record);
  return validateTripPlan({
    plan: revision.groundedPlan,
    places: revision.evidence.places?.items || [],
    travelMinutes: revision.evidence.travel?.matrix || {},
  });
}

export async function replanStoredGroundedPlan(
  record,
  transformPlaces = (items) => items,
  additionalConstraints = []
) {
  const revision = latestGroundedRevision(record);
  const evidence = structuredClone(revision.evidence);
  const planningConstraints = canonicalizePlanningConstraints([
    ...(revision.planningConstraints || []),
    ...additionalConstraints,
  ]);
  // Constraints narrow what the planner may schedule — a move keeps a single day's opening hours —
  // so they are applied to a planner-only copy. The evidence that comes back is the collected one,
  // because a later action has to be able to move the place to a day this one ruled out.
  const transformed = transformPlaces(evidence.places?.items || []);
  assertPlanningConstraintsApplicable(transformed, planningConstraints);
  const plannerEvidence = {
    ...evidence,
    places: {
      ...evidence.places,
      items: applyPlanningConstraints(transformed, planningConstraints),
    },
  };
  const result = await createGroundedTripPlan({
    trip: tripFromRecord(record, revision),
    collectors: evidenceCollectors(plannerEvidence),
  });
  return {
    ...result,
    evidence: { ...result.evidence, places: evidence.places },
    planningConstraints,
  };
}

// A refresh replaces the evidence under a plan the traveller already shaped, so it replays the
// stored constraints against the freshly collected evidence through the same replan path every
// other action uses. Neither the record nor the generation is written to: the refreshed revision is
// assembled as a copy, so a rejection leaves the caller's objects exactly as they were.
export async function refreshStoredGroundedPlan(record, generation) {
  const revision = latestGroundedRevision(record);
  if (!generation?.groundedPlan || !generation?.evidence) {
    throw new TypeError("refreshed generation must contain a grounded plan and evidence");
  }
  return replanStoredGroundedPlan({
    ...record,
    revisions: [...record.revisions.slice(0, -1), {
      ...revision,
      groundedPlan: generation.groundedPlan,
      evidence: generation.evidence,
    }],
  });
}

export async function replaceStoredGroundedPlace(record, oldPlaceId, replacementPlaceId) {
  const oldId = String(oldPlaceId || "").trim();
  const replacementId = String(replacementPlaceId || "").trim();
  if (!oldId || !replacementId || oldId === replacementId) {
    throw new TypeError("old and replacement place ids must be different non-empty ids");
  }

  return replanStoredGroundedPlan(record, (items) => {
    const replacement = items.find((item) => item.id === replacementId);
    if (!replacement) throw new Error(`replacement place ${replacementId} is not present in stored evidence`);
    if (replacement.openingHoursStatus !== "verified") {
      throw new Error(`replacement place ${replacementId} has no verified opening hours`);
    }
    if (!items.some((item) => item.id === oldId)) throw new Error(`place ${oldId} is not present in stored evidence`);
    return items;
  }, [
    { type: "exclude", placeId: oldId },
    { type: "require", placeId: replacementId },
  ]);
}

export async function moveStoredGroundedPlace(record, placeId, targetDate) {
  const id = String(placeId || "").trim();
  const date = String(targetDate || "").trim();
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TypeError("place id and target date YYYY-MM-DD are required");
  }
  if (date < record.startDate || date > record.endDate) {
    throw new RangeError(`target date ${date} is outside the stored trip`);
  }

  return replanStoredGroundedPlan(record, (items) => {
    const place = items.find((item) => item.id === id);
    if (!place) throw new Error(`place ${id} is not present in stored evidence`);
    const openingWindow = place.openingHours?.[date];
    if (!openingWindow) throw new Error(`place ${id} has no verified opening hours on ${date}`);
    return items;
  }, [{ type: "move", placeId: id, targetDate: date }]);
}
