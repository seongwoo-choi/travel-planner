import { createGroundedTripPlan } from "./grounded-planner-service.js";
import { normalizeGroundedTripInput, renderGroundedTripPlan } from "./grounded-plan-output.js";
import { createGoogleDistanceMatrixCollector } from "./google-distance-matrix.js";
import { createGooglePlacesCollector } from "./google-places.js";
import { createOpenMeteoWeatherCollector } from "./open-meteo-weather.js";

export function createGroundedPlanGenerator({ collectors, now = () => new Date() }) {
  return {
    async generate(input) {
      const trip = normalizeGroundedTripInput(input);
      const result = await createGroundedTripPlan({ trip, collectors, now });
      return {
        model: "grounded-planner-v1",
        prompt: null,
        plan: renderGroundedTripPlan(result, trip),
        status: result.status,
        groundedPlan: result.plan,
        evidence: result.evidence,
      };
    },
  };
}

const GROUNDED_PROVIDER_MISSING =
  "GOOGLE_MAPS_API_KEY is not configured: grounded /plan is unavailable because places, opening hours and travel times cannot be verified. Set GOOGLE_MAPS_API_KEY in the environment and restart.";

export function assertGoogleGroundedPlanReady({ apiKey = process.env.GOOGLE_MAPS_API_KEY } = {}) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error(GROUNDED_PROVIDER_MISSING);
  }
}

// Exported so the collector's quota arithmetic can be tested against the limit production runs on.
export const GROUNDED_PLACES_OPTIONS = Object.freeze({ maxCandidates: 12, retryUnknownOpeningHours: true });

export function createGoogleGroundedPlanGenerator({
  apiKey = process.env.GOOGLE_MAPS_API_KEY,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  assertGoogleGroundedPlanReady({ apiKey });
  const places = createGooglePlacesCollector({ apiKey, fetchImpl, now, ...GROUNDED_PLACES_OPTIONS });
  const weather = createOpenMeteoWeatherCollector({ fetchImpl, now });
  const travel = {
    collect(trip, candidates) {
      // The local matrix follows the local mode only: how the trip reaches the destination is the
      // major leg's question and is decided inside the collector.
      const mode = (trip.localTravelMode ?? trip.travelMode) === "driving" ? "driving" : "transit";
      return createGoogleDistanceMatrixCollector({ apiKey, fetchImpl, now, mode }).collect(trip, candidates);
    },
  };
  return createGroundedPlanGenerator({ collectors: { places, weather, travel }, now });
}
