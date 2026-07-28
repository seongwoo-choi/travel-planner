import { buildTripDays, planTrip } from "./trip-planner.js";

function requireCollector(collectors, name) {
  const collector = collectors?.[name];
  if (!collector || typeof collector.collect !== "function") {
    throw new TypeError(`${name} collector is required`);
  }
  return collector;
}

function requireEvidence(snapshot, name) {
  if (!snapshot || typeof snapshot !== "object") throw new TypeError(`${name} collector returned no evidence`);
  if (!String(snapshot.source || "").trim()) throw new TypeError(`${name} evidence source is required`);
  if (!String(snapshot.fetchedAt || "").trim() || Number.isNaN(Date.parse(snapshot.fetchedAt))) {
    throw new TypeError(`${name} evidence fetchedAt must be an ISO timestamp`);
  }
  return snapshot;
}

export async function createGroundedTripPlan({ trip, collectors }) {
  const placesCollector = requireCollector(collectors, "places");
  const weatherCollector = requireCollector(collectors, "weather");
  const travelCollector = requireCollector(collectors, "travel");

  const placeSnapshot = requireEvidence(await placesCollector.collect(trip), "places");
  if (!Array.isArray(placeSnapshot.items)) throw new TypeError("places evidence items must be an array");
  const destinationLocation = placeSnapshot.destinationLocation || placeSnapshot.location || {};
  const baseLocation = placeSnapshot.baseLocation || destinationLocation;
  const resolvedTrip = {
    ...trip,
    latitude: destinationLocation.latitude ?? trip.latitude,
    longitude: destinationLocation.longitude ?? trip.longitude,
  };

  let weatherSnapshot;
  try {
    weatherSnapshot = requireEvidence(await weatherCollector.collect(resolvedTrip), "weather");
  } catch (error) {
    weatherSnapshot = {
      source: "weather-unavailable",
      fetchedAt: new Date().toISOString(),
      status: "unavailable",
      timezone: resolvedTrip.timezone && resolvedTrip.timezone !== "auto" ? resolvedTrip.timezone : "UTC",
      days: [],
      error: String(error?.message || error || "weather collection failed"),
    };
  }
  const tripWithTimezone = {
    ...resolvedTrip,
    timezone: weatherSnapshot.timezone || resolvedTrip.timezone,
  };
  const tripWithBase = {
    ...tripWithTimezone,
    latitude: baseLocation.latitude ?? tripWithTimezone.latitude,
    longitude: baseLocation.longitude ?? tripWithTimezone.longitude,
    destinationLatitude: destinationLocation.latitude ?? tripWithTimezone.latitude,
    destinationLongitude: destinationLocation.longitude ?? tripWithTimezone.longitude,
  };
  const travelSnapshot = requireEvidence(
    await travelCollector.collect(tripWithBase, placeSnapshot.items),
    "travel"
  );
  if (!travelSnapshot.matrix || typeof travelSnapshot.matrix !== "object") {
    throw new TypeError("travel evidence matrix is required");
  }

  const dayWindows = buildTripDays(tripWithTimezone);
  const plan = planTrip({
    trip: tripWithTimezone,
    places: placeSnapshot.items,
    travelMinutes: travelSnapshot.matrix,
  });
  const placesById = new Map(placeSnapshot.items.map((place) => [place.id, place]));
  if (weatherSnapshot.status === "unavailable") {
    plan.verificationTasks.push({
      code: "WEATHER_UNAVAILABLE",
      message: `Weather forecast is unavailable: ${weatherSnapshot.error}`,
    });
  } else {
    const weatherDates = new Set((weatherSnapshot.days || []).map((day) => day.date));
    const missingDates = dayWindows.map((day) => day.date).filter((date) => !weatherDates.has(date));
    if (missingDates.length > 0) {
      plan.verificationTasks.push({
        code: "WEATHER_FORECAST_MISSING",
        dates: missingDates,
        message: `Weather forecast is missing for ${missingDates.join(", ")}`,
      });
    }
  }
  if (travelSnapshot.majorLeg?.status === "unavailable") {
    plan.verificationTasks.push({
      code: "MAJOR_TRANSPORT_UNAVAILABLE",
      message: `Major transport must be confirmed: ${travelSnapshot.majorLeg.origin} -> ${travelSnapshot.majorLeg.destination} (${travelSnapshot.majorLeg.reason || "route unavailable"})`,
    });
  }
  for (const place of placeSnapshot.items) {
    if (place.openingHoursStatus === "verified" || Object.keys(place.openingHours || {}).length > 0) continue;
    plan.verificationTasks.push({
      code: "MISSING_OPENING_HOURS",
      placeId: place.id,
      message: `${place.name || place.id} opening hours must be confirmed before scheduling`,
    });
  }
  for (const highlight of placeSnapshot.unmatchedHighlights || []) {
    plan.verificationTasks.push({
      code: "REQUIRED_PLACE_NOT_FOUND",
      highlight,
      message: `${highlight} could not be matched to a collected place`,
    });
  }
  const weatherByDate = new Map((weatherSnapshot.days || []).map((day) => [day.date, day]));
  for (const day of plan.days) {
    const precipitationProbability = Number(weatherByDate.get(day.date)?.precipitationProbability);
    if (!Number.isFinite(precipitationProbability) || precipitationProbability < 60) continue;
    for (const activity of day.activities) {
      const place = placesById.get(activity.placeId);
      if (!place?.outdoor) continue;
      plan.verificationTasks.push({
        code: "WEATHER_RISK",
        date: day.date,
        placeId: place.id,
        precipitationProbability,
        message: `${place.name || place.id} is outdoors with ${precipitationProbability}% precipitation probability`,
      });
    }
  }

  const activities = plan.days.flatMap((day) =>
    day.activities.map((activity) => ({ ...activity, date: day.date }))
  );
  const totalTravelMinutes = plan.days.reduce((total, day) => {
    const outbound = day.activities.reduce(
      (sum, activity) => sum + Number(activity.travelFromPrevious?.durationMinutes || 0),
      0
    );
    return total + outbound + Number(day.activities.at(-1)?.returnToBaseMinutes || 0);
  }, 0);
  const verifiedActivities = activities.filter((activity) => {
    const place = placesById.get(activity.placeId);
    if (place?.openingHoursStatus === "verified") return true;
    if (place?.openingHoursStatus) return false;
    return Boolean(place?.openingHours?.[activity.date]);
  }).length;
  const requiredPlaces = placeSnapshot.items.filter((place) => place.required);
  const scheduledIds = new Set(activities.map((activity) => activity.placeId));
  const ratio = (numerator, denominator) => denominator === 0 ? null : Number((numerator / denominator).toFixed(3));
  plan.quality = {
    hardConstraintViolations: plan.validation.issues.length,
    totalTravelMinutes,
    scheduledPlaceRatio: ratio(scheduledIds.size, placeSnapshot.items.length),
    verifiedActivityRatio: ratio(verifiedActivities, activities.length),
    requiredPlaceCoverage: ratio(requiredPlaces.filter((place) => scheduledIds.has(place.id)).length, requiredPlaces.length),
    confirmationCount: plan.verificationTasks.length,
  };

  return {
    status: !plan.validation.ok ? "conflict" : plan.verificationTasks.length > 0 ? "needs_review" : "ready",
    plan,
    evidence: {
      places: placeSnapshot,
      weather: weatherSnapshot,
      travel: travelSnapshot,
    },
  };
}
