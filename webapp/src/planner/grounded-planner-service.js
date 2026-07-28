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

// Only provider-verified opening hours may drive scheduling: an estimated or missing window
// would put a place on the itinerary on evidence we cannot stand behind.
function hasVerifiedOpeningHours(place) {
  return place?.openingHoursStatus === "verified";
}

const FALLBACK_TIMEZONE = "UTC";

// A forecast the provider has not published yet: the collector reached it, so the snapshot is
// evidence of a horizon, not of a failure, and it names the date it becomes collectable.
const WEATHER_HORIZON_STATUSES = ["forecast_horizon", "partial_forecast_horizon"];

// Only a road or rail leg is routed for a departure moment; an air leg carries no routed duration
// at all, so a fallback timezone has nothing to shift in it.
const DEPARTURE_TIME_MAJOR_MODES = ["driving", "transit"];
const MAJOR_TRANSPORT_TIMEZONE_REASON =
  `the destination timezone could not be resolved, so this duration was requested with ${FALLBACK_TIMEZONE} departure timing`;

// `majorLeg` is the pre-split single-direction field and is also mirrored into
// `majorTransport.outbound`, so a snapshot carrying both must not confirm the same leg twice.
function majorTransportSegments(travel) {
  const segments = travel?.majorTransport
    ? [travel.majorTransport.outbound, travel.majorTransport.inbound]
    : [travel?.majorLeg];
  return segments.filter(Boolean);
}

function timeShiftedSegment(segment) {
  if (segment?.status !== "verified" || !DEPARTURE_TIME_MAJOR_MODES.includes(segment.mode)) return segment;
  return { ...segment, status: "unverified", confidence: "low", reason: MAJOR_TRANSPORT_TIMEZONE_REASON };
}

// A major leg requested against the wrong departure moment is a guess, so it stops being verified
// evidence — the collected duration stays visible, it just no longer reads as fact.
function withTimeShiftedMajorTransport(travel) {
  return {
    ...travel,
    ...(travel.majorLeg ? { majorLeg: timeShiftedSegment(travel.majorLeg) } : {}),
    ...(travel.majorTransport
      ? {
          majorTransport: Object.fromEntries(
            Object.entries(travel.majorTransport).map(([direction, segment]) => [direction, timeShiftedSegment(segment)])
          ),
        }
      : {}),
  };
}

// A zone name only counts if the runtime can actually shift a time with it: the departure epoch
// is computed through Intl, so anything Intl rejects would throw inside travel collection.
function isRealTimezone(timezone) {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

// Provenance has to stay checkable, so a timestamp we cannot parse is replaced by the injected
// clock rather than carried into the evidence as-is.
function isoTimestamp(value, now) {
  const timestamp = String(value || "").trim();
  return timestamp && !Number.isNaN(Date.parse(timestamp)) ? timestamp : now().toISOString();
}

// Every departure time is anchored to the destination timezone, so resolve it on its own request
// instead of reading it off the forecast: a trip beyond the forecast horizon still has a real
// local time, and inventing UTC for it would silently shift the whole itinerary.
async function resolveTripTimezone(collector, trip, now) {
  const explicitTimezone = String(trip.timezone || "").trim();
  if (explicitTimezone && explicitTimezone !== "auto") {
    if (!isRealTimezone(explicitTimezone)) {
      return {
        timezone: null,
        source: "trip",
        fetchedAt: now().toISOString(),
        status: "unavailable",
        error: `trip timezone is not a valid IANA timezone: ${explicitTimezone}`,
      };
    }
    return { timezone: explicitTimezone, source: "trip", fetchedAt: now().toISOString(), status: "verified" };
  }
  try {
    if (typeof collector.resolveTimezone !== "function") {
      throw new TypeError("weather collector cannot resolve a timezone independently");
    }
    const resolved = await collector.resolveTimezone(trip);
    const timezone = String(resolved?.timezone || "").trim();
    if (!timezone || timezone === "auto") throw new TypeError("timezone lookup returned no IANA timezone");
    if (!isRealTimezone(timezone)) {
      throw new TypeError(`timezone lookup returned an invalid IANA timezone: ${timezone}`);
    }
    return {
      timezone,
      source: resolved.source || "timezone-lookup",
      fetchedAt: isoTimestamp(resolved.fetchedAt, now),
      status: "verified",
    };
  } catch (error) {
    return {
      timezone: null,
      fetchedAt: now().toISOString(),
      status: "unavailable",
      error: String(error?.message || error || "timezone lookup failed"),
    };
  }
}

export async function createGroundedTripPlan({ trip, collectors, now = () => new Date() }) {
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

  const timezoneEvidence = await resolveTripTimezone(weatherCollector, resolvedTrip, now);
  // A zone we rejected must not reach the forecast request either, so ask the provider to resolve
  // the location itself rather than forwarding a name we already know is unusable.
  const tripForWeather = { ...resolvedTrip, timezone: timezoneEvidence.timezone || "auto" };

  let weatherSnapshot;
  let collectedTimezone = null;
  try {
    weatherSnapshot = requireEvidence(await weatherCollector.collect(tripForWeather), "weather");
    collectedTimezone = String(weatherSnapshot.timezone || "").trim() || null;
  } catch (error) {
    weatherSnapshot = {
      source: "weather-unavailable",
      fetchedAt: now().toISOString(),
      status: "unavailable",
      timezone: timezoneEvidence.timezone || FALLBACK_TIMEZONE,
      days: [],
      error: String(error?.message || error || "weather collection failed"),
    };
  }
  // A forecast that came back already carries the provider's timezone, so it is a valid second
  // source — unless the caller named a zone we rejected, where quietly planning against a
  // different one would be worse than failing closed, or unless the snapshot itself reports the
  // forecast as unavailable, where the zone on it is a fallback nobody resolved. Only when neither
  // request yields a usable zone do we fall back, visibly, to UTC.
  const forecastTimezone = timezoneEvidence.source !== "trip"
    && weatherSnapshot.status !== "unavailable"
    && isRealTimezone(collectedTimezone)
    ? collectedTimezone
    : null;
  const timezone = timezoneEvidence.timezone || forecastTimezone;
  const timezoneSnapshot = timezoneEvidence.timezone
    ? timezoneEvidence
    : forecastTimezone
      ? {
          timezone: forecastTimezone,
          source: weatherSnapshot.source,
          fetchedAt: isoTimestamp(weatherSnapshot.fetchedAt, now),
          status: "degraded",
          lookupError: timezoneEvidence.error,
        }
      : { ...timezoneEvidence, timezone: FALLBACK_TIMEZONE, source: "fallback" };
  const tripWithTimezone = { ...resolvedTrip, timezone: timezone || FALLBACK_TIMEZONE };
  const tripWithBase = {
    ...tripWithTimezone,
    latitude: baseLocation.latitude ?? tripWithTimezone.latitude,
    longitude: baseLocation.longitude ?? tripWithTimezone.longitude,
    destinationLatitude: destinationLocation.latitude ?? tripWithTimezone.latitude,
    destinationLongitude: destinationLocation.longitude ?? tripWithTimezone.longitude,
  };
  // Evidence keeps every collected item so the user can inspect or replace them; only the
  // verified subset is offered to travel collection and to the planner, so an unverified place
  // never costs a matrix element nor fails the batch.
  const verifiedPlaces = placeSnapshot.items.filter(hasVerifiedOpeningHours);
  const unverifiedPlaces = placeSnapshot.items.filter((place) => !hasVerifiedOpeningHours(place));
  const collectedTravel = requireEvidence(
    await travelCollector.collect(tripWithBase, verifiedPlaces),
    "travel"
  );
  if (!collectedTravel.matrix || typeof collectedTravel.matrix !== "object") {
    throw new TypeError("travel evidence matrix is required");
  }
  // Travel durations are requested for a departure moment, so a fallback timezone makes them
  // time-shifted guesses: they must not keep claiming to be verified.
  const timeShiftedMajorLegs = !timezone && majorTransportSegments(collectedTravel).some(
    (segment) => timeShiftedSegment(segment) !== segment
  );
  const timezoneAdjustedTravel = timezone
    ? collectedTravel
    : {
        ...withTimeShiftedMajorTransport(collectedTravel),
        status: "unverified",
        confidence: "low",
        timezone: FALLBACK_TIMEZONE,
        // The local matrix is the part that was requested for a departure moment, so its own
        // status must not keep claiming verified while the snapshot around it says otherwise.
        ...(collectedTravel.localTransport
          ? { localTransport: { ...collectedTravel.localTransport, status: "unverified", confidence: "low" } }
          : {}),
      };
  // Getting to the destination is part of what a travel snapshot claims, so a missing major leg
  // degrades the snapshot as a whole. The local matrix keeps its own status: it was collected.
  const majorTransportUnavailable = majorTransportSegments(timezoneAdjustedTravel).some(
    (segment) => segment.status === "unavailable"
  );
  const travelSnapshot = majorTransportUnavailable && timezoneAdjustedTravel.status !== "unverified"
    ? { ...timezoneAdjustedTravel, status: "degraded", confidence: "low" }
    : timezoneAdjustedTravel;

  const dayWindows = buildTripDays(tripWithTimezone);
  const plan = planTrip({
    trip: tripWithTimezone,
    places: verifiedPlaces,
    travelMinutes: travelSnapshot.matrix,
  });
  plan.unscheduledPlaceIds = [...plan.unscheduledPlaceIds, ...unverifiedPlaces.map((place) => place.id)];
  const placesById = new Map(placeSnapshot.items.map((place) => [place.id, place]));
  if (weatherSnapshot.status === "unavailable") {
    plan.verificationTasks.push({
      code: "WEATHER_UNAVAILABLE",
      message: `Weather forecast is unavailable: ${weatherSnapshot.error}`,
    });
  } else {
    const weatherDates = new Set((weatherSnapshot.days || []).map((day) => day.date));
    const missingDates = dayWindows.map((day) => day.date).filter((date) => !weatherDates.has(date));
    // A trip the provider has not published a forecast for yet is a wait, not a hole: it carries
    // the date the forecast becomes collectable instead of asking anyone to chase it now.
    if (missingDates.length > 0 && WEATHER_HORIZON_STATUSES.includes(weatherSnapshot.status)) {
      plan.verificationTasks.push({
        code: "WEATHER_FORECAST_HORIZON",
        dates: missingDates,
        refreshAfter: weatherSnapshot.refreshAfter,
        message: `Weather forecast is not published yet for ${missingDates.join(", ")}; it can be refreshed from ${weatherSnapshot.refreshAfter}`,
      });
    } else if (missingDates.length > 0) {
      plan.verificationTasks.push({
        code: "WEATHER_FORECAST_MISSING",
        dates: missingDates,
        message: `Weather forecast is missing for ${missingDates.join(", ")}`,
      });
    }
  }
  // Only the departure-dependent requests are affected: itinerary times are already local labels,
  // it is the transit and travel durations that were asked for against the wrong moment.
  if (!timezone) {
    plan.verificationTasks.push({
      code: "TIMEZONE_UNAVAILABLE",
      timezone: FALLBACK_TIMEZONE,
      message: `Destination timezone could not be resolved (${timezoneSnapshot.error}), so time-dependent transit and travel durations were requested with ${FALLBACK_TIMEZONE} departure timing and must be confirmed`,
    });
  } else if (timezoneSnapshot.status === "degraded") {
    plan.verificationTasks.push({
      code: "TIMEZONE_LOOKUP_DEGRADED",
      timezone,
      message: `Independent timezone lookup failed (${timezoneSnapshot.lookupError}), so ${timezone} from ${timezoneSnapshot.source} was used for time-dependent transit departure timing and must be confirmed`,
    });
  }
  if (timeShiftedMajorLegs) {
    plan.verificationTasks.push({
      code: "MAJOR_TRANSPORT_TIMEZONE_UNVERIFIED",
      timezone: FALLBACK_TIMEZONE,
      message: `Major transport durations are no longer verified: ${MAJOR_TRANSPORT_TIMEZONE_REASON}, so they must be confirmed`,
    });
  }
  for (const segment of majorTransportSegments(travelSnapshot)) {
    if (segment.status !== "unavailable") continue;
    plan.verificationTasks.push({
      code: "MAJOR_TRANSPORT_UNAVAILABLE",
      ...(segment.direction ? { direction: segment.direction } : {}),
      message: `Major transport must be confirmed: ${segment.origin} -> ${segment.destination} (${segment.reason || "route unavailable"})`,
    });
  }
  for (const place of unverifiedPlaces) {
    const openingHoursStatus = place.openingHoursStatus || "missing";
    plan.verificationTasks.push({
      code: "MISSING_OR_UNVERIFIED_OPENING_HOURS",
      placeId: place.id,
      openingHoursStatus,
      message: `${place.name || place.id} opening hours are ${openingHoursStatus}, not provider-verified, so it cannot be scheduled`,
    });
  }
  for (const highlight of placeSnapshot.unmatchedHighlights || []) {
    plan.verificationTasks.push({
      code: "REQUIRED_PLACE_NOT_FOUND",
      highlight,
      message: `${highlight} could not be matched to a collected place`,
    });
  }
  // A category that failed or was never requested is a hole in the candidate pool the itinerary was
  // chosen from, so the plan may not read as ready while one is open.
  const incompleteCoverage = (placeSnapshot.searchCoverage || []).filter((entry) => entry?.status !== "verified");
  if (incompleteCoverage.length > 0) {
    plan.verificationTasks.push({
      code: "PLACE_SEARCH_COVERAGE_DEGRADED",
      categories: incompleteCoverage.map((entry) => entry.key),
      message: `Place search coverage is incomplete, so candidates are missing for ${incompleteCoverage
        .map((entry) => `${entry.key} (${entry.status}${entry.reason ? `: ${entry.reason}` : ""})`)
        .join(", ")}`,
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
  const requiredPlaces = placeSnapshot.items.filter((place) => place.required);
  const scheduledIds = new Set(activities.map((activity) => activity.placeId));
  const ratio = (numerator, denominator) => denominator === 0 ? null : Number((numerator / denominator).toFixed(3));
  plan.quality = {
    hardConstraintViolations: plan.validation.issues.length,
    totalTravelMinutes,
    scheduledPlaceRatio: ratio(scheduledIds.size, placeSnapshot.items.length),
    verifiedPlaceRatio: ratio(verifiedPlaces.length, placeSnapshot.items.length),
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
      timezone: timezoneSnapshot,
    },
  };
}
