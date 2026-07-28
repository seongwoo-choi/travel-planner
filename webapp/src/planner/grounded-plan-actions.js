import { createGroundedTripPlan } from "./grounded-planner-service.js";
import { validateTripPlan } from "./trip-planner.js";

function latestGroundedRevision(record) {
  const revision = record?.revisions?.[record.revisions.length - 1];
  if (!revision?.groundedPlan || !revision?.evidence) {
    throw new TypeError("stored plan does not contain grounded plan evidence");
  }
  return revision;
}

function tripFromRecord(record, revision) {
  return {
    ...record,
    ...revision.input,
    startDate: record.startDate || revision.input?.startDate,
    endDate: record.endDate || revision.input?.endDate,
    baseLocationId: revision.input?.baseLocationId || "base",
    timezone: revision.evidence.weather?.timezone || revision.input?.timezone || "UTC",
  };
}

function evidenceCollectors(evidence) {
  return {
    places: { collect: async () => evidence.places },
    weather: { collect: async () => evidence.weather },
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
  const planningConstraints = [
    ...(revision.planningConstraints || []),
    ...additionalConstraints,
  ];
  evidence.places.items = applyPlanningConstraints(
    transformPlaces(evidence.places?.items || []),
    planningConstraints
  );
  const result = await createGroundedTripPlan({
    trip: tripFromRecord(record, revision),
    collectors: evidenceCollectors(evidence),
  });
  return { ...result, planningConstraints };
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
