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
  "places.primaryType",
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

// The planner exempts `category: "meal"` places from meal breaks, so eating places have to carry
// that category or the default lunch/dinner breaks would push every restaurant out of mealtime.
const MEAL_TYPES = new Set(["restaurant", "cafe", "food", "bakery", "meal_takeaway", "ice_cream_shop"]);
const WELLNESS_TYPES = new Set(["spa", "sauna", "public_bath", "wellness_center", "massage", "hot_spring"]);
const CULTURE_TYPES = new Set([
  "museum",
  "art_gallery",
  "library",
  "performing_arts_theater",
  "historical_landmark",
  "historical_place",
  "cultural_landmark",
  "monument",
  "place_of_worship",
  "church",
  "hindu_temple",
  "mosque",
  "synagogue",
]);
const NIGHTLIFE_TYPES = new Set(["night_club", "bar", "pub", "wine_bar", "karaoke", "casino"]);
const SHOPPING_TYPES = new Set([
  "shopping_mall",
  "department_store",
  "market",
  "supermarket",
  "clothing_store",
  "book_store",
  "gift_shop",
  "store",
]);

// The provider's own types are the only category signal: guessing from a place name would be
// invented evidence. First matching set wins, so this order is the precedence. Nightlife comes
// before meals because a club that also serves food lists `restaurant`/`food` too, and calling it
// a meal stop would put it in the lunch break.
const CATEGORY_TYPES = [
  ["nightlife", NIGHTLIFE_TYPES],
  ["meal", MEAL_TYPES],
  ["nature", OUTDOOR_TYPES],
  ["wellness", WELLNESS_TYPES],
  ["culture", CULTURE_TYPES],
  ["shopping", SHOPPING_TYPES],
];

// `primaryType` is Google's own answer to "what is this place", so it beats the unordered `types`
// bag; the list above is only the fallback for a place the provider left unclassified.
const CATEGORY_BY_PRIMARY_TYPE = new Map();
for (const [category, set] of CATEGORY_TYPES) {
  for (const type of set) if (!CATEGORY_BY_PRIMARY_TYPE.has(type)) CATEGORY_BY_PRIMARY_TYPE.set(type, category);
}

// Google publishes no visit duration, so every category needs a conservative default; only the
// unmapped `attraction` fallback still uses the caller's defaultDurationMinutes.
const CATEGORY_DURATION_MINUTES = Object.freeze({
  meal: 75,
  nature: 150,
  culture: 90,
  wellness: 120,
  shopping: 120,
  nightlife: 120,
});

// Soft time-of-day hints, and only where the category itself carries the claim: a museum or a
// generic attraction says nothing about when it is best visited, so it gets no window.
const CATEGORY_PREFERRED_WINDOWS = Object.freeze({
  meal: Object.freeze([{ start: "11:30", end: "13:30" }, { start: "17:30", end: "20:00" }]),
  nature: Object.freeze([{ start: "09:00", end: "17:00" }]),
  shopping: Object.freeze([{ start: "13:00", end: "20:00" }]),
  nightlife: Object.freeze([{ start: "19:00", end: "23:59" }]),
});

// A fixed portfolio, not a model-authored query: provider cost stays bounded and two runs of the
// same trip collect the same mix. `zone` decides which location the search is biased at.
const SEARCH_PORTFOLIO = Object.freeze([
  Object.freeze({ key: "landmark", zone: "destination", terms: "관광 명소 박물관" }),
  Object.freeze({ key: "nature", zone: "destination", terms: "공원 자연 명소" }),
  Object.freeze({ key: "meal", zone: "base", terms: "맛집 카페" }),
]);
// Somewhere to eat is not one interest among several, so the meal spec is reserved out of the
// budget before the rest of the portfolio competes for it.
const MEAL_FIRST_PORTFOLIO = Object.freeze([
  ...SEARCH_PORTFOLIO.filter((spec) => spec.key === "meal"),
  ...SEARCH_PORTFOLIO.filter((spec) => spec.key !== "meal"),
]);
// Two separate bounds, because they are bought separately: the text-search portfolio below, and the
// opening-hours retry that runs after it on top of that budget rather than out of it. A collect()
// therefore costs at most MAX_PORTFOLIO_SEARCHES + MAX_ALTERNATIVE_SEARCHES searches, and every
// snapshot reports what it actually spent as `requestBudget`.
const MAX_PORTFOLIO_SEARCHES = 4;
const MAX_ALTERNATIVE_SEARCHES = 1;
// One request per highlight, and the reserved meal spec takes one of the four portfolio searches,
// so three is what a trip may name before it would buy places at the price of having nowhere to eat.
export const MAX_HIGHLIGHTS = MAX_PORTFOLIO_SEARCHES - 1;

export function parseHighlights(value) {
  return String(value ?? "")
    .split(/[,/\n]/)
    .map((highlight) => highlight.trim())
    .filter(Boolean);
}

function categoryOf(types, primaryType) {
  const primary = CATEGORY_BY_PRIMARY_TYPE.get(primaryType);
  if (primary) return primary;
  const found = CATEGORY_TYPES.find(([, set]) => types.some((type) => set.has(type)));
  return found ? found[0] : "attraction";
}

// Every highlight gets its own search — one merged query asks the provider for a place that is all
// of them at once and finds none of them. Highlights run first so user-required places are
// collected before the shared quota and survive the final cap, then the meal spec, then whatever
// named categories the remaining budget still buys. What it does not buy is reported, not dropped.
function buildSearchSpecs(destination, baseLocationName, highlights) {
  const highlightSpecs = highlights.slice(0, MAX_HIGHLIGHTS).map((highlight, index) => ({
    key: `highlight-${index + 1}`,
    zone: "destination",
    query: `${destination} ${highlight}`,
  }));
  const portfolio = (highlightSpecs.length > 0 ? MEAL_FIRST_PORTFOLIO : SEARCH_PORTFOLIO).map((spec) => ({
    key: spec.key,
    zone: spec.zone,
    query: `${spec.zone === "base" ? baseLocationName || destination : destination} ${spec.terms}`,
  }));
  const specs = [...highlightSpecs, ...portfolio].slice(0, MAX_PORTFOLIO_SEARCHES);
  const requested = new Set(specs.map((spec) => spec.key));
  return { specs, omitted: portfolio.filter((spec) => !requested.has(spec.key)) };
}

function parseDate(value, fieldName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) throw new TypeError(`${fieldName} must be YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00Z`);
  // `2026-02-30` parses — into March 2nd. Only the round trip catches a day the month never had,
  // and a trip planned from a date the traveller never named is worse than a rejected request.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${fieldName} must be a valid calendar date`);
  }
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

// A coordinate outside the globe is not a location, whoever sent it — and neither is `null`, `""`,
// `true` or a numeric string, every one of which `Number()` would quietly turn into a real point in
// the Gulf of Guinea. A missing coordinate has to read as missing.
function coordinate(value, limit) {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

function finiteCoordinate(value, fieldName, limit) {
  const number = coordinate(value, limit);
  if (number === null) throw new TypeError(`${fieldName} must be between -${limit} and ${limit}`);
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

// Google states "open 24/7" as one period that opens on day 0 at 00:00 and never closes, so it
// applies to every day of the trip rather than to Sundays only.
function isAlwaysOpen(periods) {
  const [period] = periods;
  return periods.length === 1
    && !period?.close
    && Number(period?.open?.day) === 0
    && formatClock(period?.open) === "00:00";
}

// Maps Google's weekly periods onto concrete trip dates. Anything we cannot express as a same-day
// window (malformed times) is left out on purpose: a missing date means "hours unknown for that
// date", never a guessed window.
function openingHoursByDate(periods, dates) {
  const hours = {};
  if (isAlwaysOpen(periods)) {
    for (const { date } of dates) hours[date] = { open: "00:00", close: "23:59" };
    return hours;
  }
  for (const { date, weekday } of dates) {
    const sameDay = periods
      .filter((period) => Number(period?.open?.day) === weekday)
      .map((period) => {
        // 23:59 is the widest window the planner's HH:mm model can express, so it stands both for
        // a period without `close` and for the schedulable part of one that closes after midnight.
        const open = formatClock(period.open);
        const closesSameDay = period.close && Number(period.close.day) === weekday;
        const close = closesSameDay ? formatClock(period.close) : "23:59";
        return open && close && close > open ? { open, close } : null;
      })
      .filter(Boolean)
      .sort((left, right) => left.open.localeCompare(right.open));
    // ponytail: the planner models one window per day, so we keep the first real one
    // rather than merging split hours (e.g. a lunch break) into a fake continuous window.
    if (sameDay.length > 0) hours[date] = sameDay[0];
  }
  return hours;
}

function toItem(place, { dates, defaultDurationMinutes, fallbackSourceUrl, zone }) {
  const id = String(place?.id || "").trim();
  const name = String(place?.displayName?.text || "").trim();
  // `|` is the travel-matrix key separator, so an id containing it would be ambiguous.
  if (!id || id.includes("|") || !name) return null;
  const latitude = coordinate(place?.location?.latitude, 90);
  const longitude = coordinate(place?.location?.longitude, 180);
  if (latitude === null || longitude === null) return null;

  const rating = Number(place?.rating);
  const ratingCount = Number(place?.userRatingCount);
  // A place can be rated without a published review count, and that must not erase its rating.
  const popularity = Number.isFinite(ratingCount) && ratingCount > 0
    ? Math.min(20, Math.log10(ratingCount + 1) * 5)
    : 0;
  const periods = place?.regularOpeningHours?.periods;
  const hasPeriods = Array.isArray(periods) && periods.length > 0;
  const hours = hasPeriods ? openingHoursByDate(periods, dates) : {};
  const types = Array.isArray(place?.types) ? place.types : [];
  const primaryType = String(place?.primaryType || "").trim();
  const category = categoryOf(types, primaryType);
  const preferredWindows = CATEGORY_PREFERRED_WINDOWS[category];

  return {
    id,
    name,
    coordinates: { latitude, longitude },
    zone,
    types,
    ...(primaryType ? { primaryType } : {}),
    score: Number.isFinite(rating) ? Math.round(Math.max(0, Math.min(100, rating * 16 + popularity))) : 0,
    category,
    durationMinutes: CATEGORY_DURATION_MINUTES[category] ?? defaultDurationMinutes,
    ...(preferredWindows ? { preferredWindows: preferredWindows.map((window) => ({ ...window })) } : {}),
    openingHoursStatus: hasPeriods ? (Object.keys(hours).length > 0 ? "verified" : "unsupported") : "unknown",
    ...(Object.keys(hours).length > 0 ? { openingHours: hours } : {}),
    outdoor: types.some((type) => OUTDOOR_TYPES.has(type)),
    // Which collected place answers a highlight is decided once, over the whole deduped set, by
    // selectRequiredIds — a single place cannot tell whether it is the best match for one.
    required: false,
    sourceUrl: String(place?.googleMapsUri || fallbackSourceUrl),
  };
}

// One highlight names one place. Marking every substring match required would let a broad highlight
// ("시장", "Museum") claim the whole candidate list and starve the rest of the portfolio — and once
// the required count passes the cap, the cap starts dropping the very places it exists to protect.
// So each highlight takes at most one place: the one its own search returned, since that request
// was issued for this highlight and nothing else, then the best-scored, then by name. Ties resolve
// on the id so two runs of the same trip pick the same place.
function selectRequiredIds(collected, highlights, specKeyById) {
  const requiredIds = new Set();
  highlights.forEach((highlight, index) => {
    const needle = highlight.toLocaleLowerCase();
    const specKey = `highlight-${index + 1}`;
    const best = collected
      .filter((item) => !requiredIds.has(item.id) && item.name.toLocaleLowerCase().includes(needle))
      .sort((left, right) => {
        const ownSearch = Number(specKeyById.get(right.id) === specKey) - Number(specKeyById.get(left.id) === specKey);
        return ownSearch
          || right.score - left.score
          || left.name.localeCompare(right.name)
          || left.id.localeCompare(right.id);
      })[0];
    if (best) requiredIds.add(best.id);
  });
  return requiredIds;
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

  // A transport-level failure quotes the request URL, and a geocode URL carries the key, so no
  // recorded reason may be passed through raw.
  const reasonOf = (error) => String(error?.message || error).split(key).join("[redacted]");

  const searchUrl = new URL(searchEndpoint);

  async function searchPlaces({ query, maxResultCount, center, destination }) {
    const response = await fetchImpl(searchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode,
        maxResultCount,
        locationBias: { circle: { center, radius: searchRadiusMeters } },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Google Places request failed: ${response.status || "unknown"}`);
    const body = await response.json();
    if (!Array.isArray(body?.places)) throw new Error(`Google Places returned no places for "${destination}"`);
    return body.places.slice(0, maxResultCount);
  }

  return {
    async collect(trip) {
      const destination = String(trip?.destination || "").trim();
      if (!destination) throw new TypeError("trip.destination is required");
      const dates = tripDates(trip);
      const highlights = parseHighlights(trip.highlights);
      let destinationLocation;
      try {
        destinationLocation = await geocode(destination);
      } catch (error) {
        // A transport-level failure quotes the request URL, and a geocode URL carries the key, so
        // the provider's own message may never be rethrown raw.
        throw new Error(`destination geocoding failed for "${destination}": ${reasonOf(error)}`);
      }
      const baseLocationName = String(trip.baseLocation || "").trim();
      // An accommodation is typed by a human ("광안리골목 단독주택"), so the geocoder failing on it is
      // ordinary. Biasing the meal search at the destination instead is a worse plan, not no plan.
      let baseLocation = destinationLocation;
      let baseLocationResolution;
      let baseQueryName = baseLocationName;
      if (baseLocationName) {
        try {
          baseLocation = await geocode(baseLocationName);
          baseLocationResolution = { status: "verified", query: baseLocationName };
        } catch (error) {
          // A name the geocoder could not place is not a name the text search can use either, so
          // the fallback has to reach the query text too, not just the bias centre.
          baseQueryName = "";
          baseLocationResolution = {
            status: "unavailable",
            query: baseLocationName,
            fallback: "destination",
            reason: reasonOf(error),
          };
        }
      }
      const sourceUrl = publicUrl(searchUrl);

      const { specs, omitted } = buildSearchSpecs(destination, baseQueryName, highlights);
      // A shared quota split evenly keeps the request count fixed while letting a thin category
      // borrow the slack from a rich one. The 1.5x headroom is bought inside those same requests so
      // duplicates and unusable results can be backfilled; the final cap below holds the total.
      const quota = Math.min(MAX_CANDIDATES, Math.ceil((limit / specs.length) * 1.5));
      const searched = await Promise.all(specs.map(async (spec) => {
        try {
          const places = await searchPlaces({
            query: spec.query,
            maxResultCount: quota,
            center: spec.zone === "base" ? baseLocation : destinationLocation,
            destination,
          });
          return { spec, places };
        } catch (error) {
          return { spec, error: reasonOf(error) };
        }
      }));

      const collected = [];
      const seenIds = new Set();
      const specKeyById = new Map();
      for (const { spec, places, error } of searched) {
        if (error) continue;
        for (const place of places) {
          const item = toItem(place, {
            dates,
            defaultDurationMinutes: duration,
            fallbackSourceUrl: sourceUrl,
            zone: spec.zone,
          });
          if (!item || seenIds.has(item.id)) continue;
          seenIds.add(item.id);
          specKeyById.set(item.id, spec.key);
          collected.push(item);
        }
      }
      const failedSpecs = searched.filter((entry) => entry.error);
      if (failedSpecs.length === searched.length) throw new Error(failedSpecs[0].error);

      // A place the user asked for is the one thing the cap may never drop, and there are at most
      // MAX_HIGHLIGHTS of them, so the cap can always hold every one.
      const requiredIds = selectRequiredIds(collected, highlights, specKeyById);
      const items = [
        ...collected.filter((item) => requiredIds.has(item.id)).map((item) => ({ ...item, required: true })),
        ...collected.filter((item) => !requiredIds.has(item.id)),
      ].slice(0, limit);
      let alternativeSearch;
      const unresolvedOpeningHours = items.filter((item) => item.openingHoursStatus !== "verified").length;
      if (retryUnknownOpeningHours && unresolvedOpeningHours > 0) {
        try {
          const alternativePlaces = await searchPlaces({
            query: `${destination} 영업시간 확인 가능한 관광 명소 박물관 실내`,
            maxResultCount: Math.min(limit, unresolvedOpeningHours),
            center: destinationLocation,
            destination,
          });
          const existingIds = new Set(items.map((item) => item.id));
          const alternatives = alternativePlaces
            .map((place) => toItem(place, {
              dates,
              defaultDurationMinutes: duration,
              fallbackSourceUrl: sourceUrl,
              zone: "destination",
            }))
            .filter((item) => item?.openingHoursStatus === "verified" && !existingIds.has(item.id))
            .slice(0, unresolvedOpeningHours);
          let addedCount = 0;
          for (const alternative of alternatives) {
            // A required highlight is never traded away for better-known hours: the user asked for
            // that place, so it stays and its hours stay an open question.
            const replaceIndex = items.findLastIndex(
              (item) => item.openingHoursStatus !== "verified" && !item.required
            );
            if (replaceIndex >= 0) items.splice(replaceIndex, 1, alternative);
            else if (items.length < limit) items.push(alternative);
            else break;
            addedCount += 1;
          }
          alternativeSearch = { status: "verified", addedCount };
        } catch (error) {
          alternativeSearch = { status: "unavailable", addedCount: 0, reason: reasonOf(error) };
        }
      }
      // One category failing must stay visible rather than passing as complete coverage, so the spec
      // is reported unavailable and the snapshot degrades; every category failing is fatal above.
      // `itemCount` is counted off the final list, so it never claims candidates the cap discarded.
      const searchCoverage = [
        ...searched.map(({ spec, error }) => ({
          key: spec.key,
          zone: spec.zone,
          query: spec.query,
          quota,
          ...(error
            ? { status: "unavailable", itemCount: 0, reason: error }
            : { status: "verified", itemCount: items.filter((item) => specKeyById.get(item.id) === spec.key).length }),
        })),
        // A category we never asked for is not a category that came back empty, and a missing key
        // would read as the latter.
        ...omitted.map((spec) => ({
          key: spec.key,
          zone: spec.zone,
          query: spec.query,
          quota: 0,
          status: "not_requested",
          itemCount: 0,
          reason: "request budget reserved for highlights",
        })),
      ];
      const unmatchedHighlights = highlights.filter((highlight) =>
        !items.some((item) => item.required && item.name.toLocaleLowerCase().includes(highlight.toLocaleLowerCase()))
      );
      // Anything the user cannot see is a silent hole in the evidence: a category we never got, a
      // base we could not place, or hours we could not resolve on a second pass.
      const degraded = failedSpecs.length > 0
        || omitted.length > 0
        || baseLocationResolution?.status === "unavailable"
        || alternativeSearch?.status === "unavailable";
      const fetchedAt = now();

      return {
        source: "google-places",
        sourceUrl,
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: new Date(fetchedAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        status: degraded ? "degraded" : "verified",
        confidence: degraded ? "low" : "high",
        location: destinationLocation,
        destinationLocation,
        baseLocation,
        baseLocationResolution,
        items,
        searchCoverage,
        alternativeSearch,
        // What the snapshot cost, against the two bounds it was allowed to spend, so a reader never
        // has to take a comment's word for how many provider requests a plan buys.
        requestBudget: {
          maxPortfolioSearches: MAX_PORTFOLIO_SEARCHES,
          maxAlternativeSearches: MAX_ALTERNATIVE_SEARCHES,
          portfolioSearches: specs.length,
          alternativeSearches: alternativeSearch ? 1 : 0,
        },
        unmatchedHighlights,
      };
    },
  };
}
