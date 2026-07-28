import { createGroundedTripPlan } from "./grounded-planner-service.js";
import { normalizeGroundedTripInput, renderGroundedTripPlan } from "./grounded-plan-output.js";
import { createGoogleDistanceMatrixCollector } from "./google-distance-matrix.js";
import { createGooglePlacesCollector } from "./google-places.js";
import { createOpenMeteoWeatherCollector } from "./open-meteo-weather.js";

export function createGroundedPlanGenerator({ collectors }) {
  return {
    async generate(input) {
      const trip = normalizeGroundedTripInput(input);
      const result = await createGroundedTripPlan({ trip, collectors });
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

export function createGoogleGroundedPlanGenerator({
  apiKey = process.env.GOOGLE_MAPS_API_KEY,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  const places = createGooglePlacesCollector({
    apiKey,
    fetchImpl,
    now,
    maxCandidates: 12,
    retryUnknownOpeningHours: true,
  });
  const weather = createOpenMeteoWeatherCollector({ fetchImpl, now });
  const travel = {
    collect(trip, candidates) {
      const mode = trip.travelMode === "driving" ? "driving" : "transit";
      return createGoogleDistanceMatrixCollector({ apiKey, fetchImpl, now, mode }).collect(trip, candidates);
    },
  };
  return createGroundedPlanGenerator({ collectors: { places, weather, travel } });
}
