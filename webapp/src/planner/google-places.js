// Google Maps Platform evidence collector for attraction candidates.
// Geocoding API:      https://developers.google.com/maps/documentation/geocoding/requests-geocoding
// Places API (New):   https://developers.google.com/maps/documentation/places/web-service/text-search
const DEFAULT_GEOCODE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";
const DEFAULT_SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.types",
  "places.googleMapsUri",
  "places.regularOpeningHours",
].join(",");
// Text Search (New) returns at most 20 results per page and we never page.
const MAX_CANDIDATES = 20;
const MAX_TRIP_DAYS = 31;
const DAY_MS = 24 * 60 * 60 * 1000;
const OUTDOOR_TYPES = new Set([
  "amusement_park",
  "beach",
  "botanical_garden",
  "campground",
  "dog_park",
  "garden",
  "hiking_area",
  "marina",
  "national_park",
  "park",
  "state_park",
  "wildlife_park",
  "zoo",
]);

function parseDate(value, fieldName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) throw new TypeError(`${fieldName} must be YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${fieldName} must be a valid calendar date`);
  return date;
}

function tripDates(trip) {
  const start = parseDate(trip?.startDate, "startDate");
  const end = trip?.endDate ? parseDate(trip.endDate, "endDate") : start;
  const dayCount = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (dayCount < 1) throw new RangeError("endDate must be on or after startDate");
  if (dayCount > MAX_TRIP_DAYS) throw new RangeError(`planning horizon is ${MAX_TRIP_DAYS} calendar days`);
  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start.getTime() + index * DAY_MS);
    return { date: date.toISOString().slice(0, 10), weekday: date.getUTCDay() };
  });
}

function finiteCoordinate(value, fieldName, limit) {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > limit) {
    throw new TypeError(`${fieldName} must be between -${limit} and ${limit}`);
  }
  return number;
}

function publicUrl(url) {
  const copy = new URL(url);
  copy.searchParams.delete("key");
  return copy.toString();
}

function formatClock(part) {
  const hour = Number(part?.hour);
  const minute = Number(part?.minute ?? 0);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// Maps Google's weekly periods onto concrete trip dates. Anything we cannot express as a
// same-day open/close window (overnight periods, malformed times) is left out on purpose:
// a missing date means "hours unknown for that date", never a guessed window.
function openingHoursByDate(periods, dates) {
  const hours = {};
  for (const { date, weekday } of dates) {
    const sameDay = periods
      .filter((period) => Number(period?.open?.day) === weekday)
      .map((period) => {
        // A period without `close` is Google's "open 24 hours"; 23:59 is the widest
        // window the planner's HH:mm model can express.
        const open = formatClock(period.open);
        const close = period.close ? formatClock(period.close) : "23:59";
        const closesSameDay = !period.close || Number(period.close.day) === weekday;
        return open && close && closesSameDay && close > open ? { open, close } : null;
      })
      .filter(Boolean)
      .sort((left, right) => left.open.localeCompare(right.open));
    // ponytail: the planner models one window per day, so we keep the first real one
    // rather than merging split hours (e.g. a lunch break) into a fake continuous window.
    if (sameDay.length > 0) hours[date] = sameDay[0];
  }
  return hours;
}

function toItem(place, dates, defaultDurationMinutes, fallbackSourceUrl, highlights) {
  const id = String(place?.id || "").trim();
  const name = String(place?.displayName?.text || "").trim();
  // `|` is the travel-matrix key separator, so an id containing it would be ambiguous.
  if (!id || id.includes("|") || !name) return null;
  const latitude = Number(place?.location?.latitude);
  const longitude = Number(place?.location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const rating = Number(place?.rating);
  const ratingCount = Number(place?.userRatingCount);
  const periods = place?.regularOpeningHours?.periods;
  const hasPeriods = Array.isArray(periods) && periods.length > 0;
  const hours = hasPeriods ? openingHoursByDate(periods, dates) : {};
  const types = Array.isArray(place?.types) ? place.types : [];

  return {
    id,
    name,
    coordinates: { latitude, longitude },
    score: Number.isFinite(rating)
      ? Math.round(Math.min(100, rating * 16 + Math.min(20, Math.log10(Math.max(0, ratingCount) + 1) * 5)))
      : 0,
    durationMinutes: defaultDurationMinutes,
    openingHoursStatus: hasPeriods ? (Object.keys(hours).length > 0 ? "verified" : "unsupported") : "unknown",
    ...(Object.keys(hours).length > 0 ? { openingHours: hours } : {}),
    outdoor: types.some((type) => OUTDOOR_TYPES.has(type)),
    required: highlights.some((highlight) => name.toLocaleLowerCase().includes(highlight.toLocaleLowerCase())),
    sourceUrl: String(place?.googleMapsUri || fallbackSourceUrl),
  };
}

export function createGooglePlacesCollector({
  apiKey = process.env.GOOGLE_MAPS_API_KEY,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  geocodeEndpoint = DEFAULT_GEOCODE_ENDPOINT,
  searchEndpoint = DEFAULT_SEARCH_ENDPOINT,
  timeoutMs = 10_000,
  maxCandidates = MAX_CANDIDATES,
  // Google publishes no visit duration, so the planner needs an explicit default here.
  defaultDurationMinutes = 90,
  languageCode = "ko",
  searchRadiusMeters = 20_000,
  retryUnknownOpeningHours = false,
} = {}) {
  const key = String(apiKey || "").trim();
  if (!key) throw new TypeError("Google Maps API key is required (pass apiKey or set GOOGLE_MAPS_API_KEY)");
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");
  const limit = Math.min(MAX_CANDIDATES, Math.max(1, Math.floor(Number(maxCandidates) || MAX_CANDIDATES)));
  const duration = Number(defaultDurationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new TypeError("defaultDurationMinutes must be a positive number");
  }

  async function geocode(destination) {
    const url = new URL(geocodeEndpoint);
    url.searchParams.set("address", destination);
    url.searchParams.set("key", key);
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`Google Geocoding request failed: ${response.status || "unknown"}`);
    const body = await response.json();
    if (body?.status !== "OK" || !Array.isArray(body.results) || body.results.length === 0) {
      throw new Error(`Google Geocoding returned no result for "${destination}": ${body?.status || "unknown"}`);
    }
    const location = body.results[0]?.geometry?.location;
    return {
      latitude: finiteCoordinate(location?.lat, "geocoded latitude", 90),
      longitude: finiteCoordinate(location?.lng, "geocoded longitude", 180),
    };
  }

  return {
    async collect(trip) {
      const destination = String(trip?.destination || "").trim();
      if (!destination) throw new TypeError("trip.destination is required");
      const dates = tripDates(trip);
      const highlights = String(trip.highlights || "")
        .split(/[,/\n]/)
        .map((value) => value.trim())
        .filter(Boolean);
      const destinationLocation = await geocode(destination);
      const baseLocationName = String(trip.baseLocation || "").trim();
      const baseLocation = baseLocationName ? await geocode(baseLocationName) : destinationLocation;

      const searchUrl = new URL(searchEndpoint);
      const requestBody = {
        textQuery: [destination, ...highlights, trip.tripType, "관광 명소"].filter(Boolean).join(" "),
        languageCode,
        maxResultCount: limit,
        locationBias: { circle: { center: destinationLocation, radius: searchRadiusMeters } },
      };
      const response = await fetchImpl(searchUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`Google Places request failed: ${response.status || "unknown"}`);
      const body = await response.json();
      if (!Array.isArray(body?.places)) {
        throw new Error(`Google Places returned no places for "${destination}"`);
      }

      const sourceUrl = publicUrl(searchUrl);
      const items = body.places
        .slice(0, limit)
        .map((place) => toItem(place, dates, duration, sourceUrl, highlights))
        .filter(Boolean);
      let alternativeSearch;
      const unresolvedOpeningHours = items.filter((item) => item.openingHoursStatus !== "verified").length;
      if (retryUnknownOpeningHours && unresolvedOpeningHours > 0) {
        const alternativeBody = {
          ...requestBody,
          textQuery: `${destination} 영업시간 확인 가능한 관광 명소 박물관 실내`,
          maxResultCount: Math.min(limit, unresolvedOpeningHours),
        };
        try {
          const alternativeResponse = await fetchImpl(searchUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": key,
              "X-Goog-FieldMask": FIELD_MASK,
            },
            body: JSON.stringify(alternativeBody),
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!alternativeResponse.ok) throw new Error(`request failed: ${alternativeResponse.status || "unknown"}`);
          const alternativeResponseBody = await alternativeResponse.json();
          if (!Array.isArray(alternativeResponseBody?.places)) throw new Error("response contained no places");
          const existingIds = new Set(items.map((item) => item.id));
          const alternatives = alternativeResponseBody.places
            .map((place) => toItem(place, dates, duration, sourceUrl, highlights))
            .filter((item) => item?.openingHoursStatus === "verified" && !existingIds.has(item.id))
            .slice(0, unresolvedOpeningHours);
          for (const alternative of alternatives) {
            const replaceIndex = items.findLastIndex((item) => item.openingHoursStatus !== "verified");
            if (replaceIndex >= 0) items.splice(replaceIndex, 1, alternative);
            else if (items.length < limit) items.push(alternative);
          }
          alternativeSearch = { status: "verified", addedCount: alternatives.length };
        } catch (error) {
          alternativeSearch = { status: "unavailable", addedCount: 0, reason: String(error?.message || error) };
        }
      }
      const unmatchedHighlights = highlights.filter((highlight) =>
        !items.some((item) => item.required && item.name.toLocaleLowerCase().includes(highlight.toLocaleLowerCase()))
      );
      const fetchedAt = now();

      return {
        source: "google-places",
        sourceUrl,
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: new Date(fetchedAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        status: "verified",
        confidence: "high",
        location: destinationLocation,
        destinationLocation,
        baseLocation,
        items,
        alternativeSearch,
        unmatchedHighlights,
      };
    },
  };
}
