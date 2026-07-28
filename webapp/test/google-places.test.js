import test from "node:test";
import assert from "node:assert/strict";

import { createGooglePlacesCollector } from "../src/planner/google-places.js";
import { GROUNDED_PLACES_OPTIONS } from "../src/planner/grounded-plan-generator.js";

const TRIP = {
  destination: "Busan",
  startDate: "2026-08-01",
  endDate: "2026-08-02",
  highlights: "Haeundae Beach",
};

const TRIP_WITHOUT_HIGHLIGHTS = { destination: "Busan", startDate: "2026-08-01", endDate: "2026-08-02" };

const GEOCODE_BODY = {
  status: "OK",
  results: [{ geometry: { location: { lat: 35.1796, lng: 129.0756 } } }],
};

const PLACES_BODY = {
  places: [
    {
      id: "ChIJbeach",
      displayName: { text: "Haeundae Beach" },
      location: { latitude: 35.1587, longitude: 129.1604 },
      rating: 4.5,
      userRatingCount: 12000,
      types: ["beach", "tourist_attraction"],
      googleMapsUri: "https://maps.google.com/?cid=1",
      regularOpeningHours: {
        periods: [
          { open: { day: 6, hour: 9, minute: 0 }, close: { day: 6, hour: 18, minute: 0 } },
          { open: { day: 0, hour: 9, minute: 30 }, close: { day: 0, hour: 17, minute: 0 } },
        ],
      },
    },
    {
      id: "ChIJmuseum",
      displayName: { text: "Busan Museum" },
      location: { latitude: 35.1304, longitude: 129.0919 },
      rating: 4.2,
      userRatingCount: 900,
      types: ["museum"],
    },
    {
      id: "ChIJnightmarket",
      displayName: { text: "Night Market" },
      location: { latitude: 35.1, longitude: 129.03 },
      types: ["market"],
      regularOpeningHours: {
        periods: [{ open: { day: 6, hour: 22, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } }],
      },
    },
  ],
};

// 2026-08-01 is a Saturday (Google weekday 6) and 2026-08-02 a Sunday (weekday 0).
const OPEN_BOTH_DAYS = {
  regularOpeningHours: {
    periods: [
      { open: { day: 6, hour: 9, minute: 0 }, close: { day: 6, hour: 18, minute: 0 } },
      { open: { day: 0, hour: 9, minute: 0 }, close: { day: 0, hour: 18, minute: 0 } },
    ],
  },
};

function stubFetch(handlers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const href = String(url);
    const query = init?.body ? JSON.parse(init.body).textQuery : null;
    calls.push({ url: href, init, query });
    const handler = href.includes("geocode") ? handlers.geocode : handlers.places;
    return handler(href, init);
  };
  return { fetchImpl, calls };
}

const okJson = (body) => async () => ({ ok: true, status: 200, json: async () => body });
const searchCalls = (calls) => calls.filter((call) => !call.url.includes("geocode"));
const place = (id, types, extra = {}) => ({
  id,
  displayName: { text: id },
  location: { latitude: 35.1, longitude: 129.1 },
  types,
  ...extra,
});

test("Google Places collector geocodes the destination and maps searched attractions", async () => {
  const { fetchImpl, calls } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson(PLACES_BODY),
  });
  const collector = createGooglePlacesCollector({
    apiKey: "test-key",
    fetchImpl,
    now: () => new Date("2026-07-28T10:00:00Z"),
  });

  const snapshot = await collector.collect(TRIP);

  const geocodeUrl = new URL(calls[0].url);
  assert.equal(geocodeUrl.searchParams.get("address"), "Busan");
  assert.equal(geocodeUrl.searchParams.get("key"), "test-key");

  const searchRequest = searchCalls(calls)[0];
  assert.equal(searchRequest.init.method, "POST");
  assert.equal(searchRequest.init.headers["X-Goog-Api-Key"], "test-key");
  assert.match(searchRequest.init.headers["X-Goog-FieldMask"], /places\.regularOpeningHours/);
  assert.match(searchRequest.init.headers["X-Goog-FieldMask"], /places\.userRatingCount/);
  assert.match(searchRequest.init.headers["X-Goog-FieldMask"], /places\.types/);
  const searchBody = JSON.parse(searchRequest.init.body);
  assert.match(searchBody.textQuery, /Busan/);
  assert.match(searchBody.textQuery, /Haeundae Beach/);
  assert.ok(searchBody.maxResultCount <= 20);
  assert.deepEqual(searchBody.locationBias.circle.center, { latitude: 35.1796, longitude: 129.0756 });

  assert.equal(snapshot.source, "google-places");
  assert.equal(snapshot.status, "verified");
  assert.equal(snapshot.fetchedAt, "2026-07-28T10:00:00.000Z");
  assert.deepEqual(snapshot.location, { latitude: 35.1796, longitude: 129.0756 });
  assert.ok(!snapshot.sourceUrl.includes("test-key"), "sourceUrl must not leak the API key");
  assert.deepEqual(snapshot.items.map((item) => item.id), ["ChIJbeach", "ChIJmuseum", "ChIJnightmarket"]);
  assert.deepEqual(snapshot.unmatchedHighlights, []);

  const [beach, museum, market] = snapshot.items;
  assert.equal(beach.name, "Haeundae Beach");
  assert.deepEqual(beach.coordinates, { latitude: 35.1587, longitude: 129.1604 });
  assert.ok(beach.score > museum.score);
  assert.equal(beach.outdoor, true);
  assert.equal(beach.required, true);
  assert.equal(beach.openingHoursStatus, "verified");
  assert.equal(beach.sourceUrl, "https://maps.google.com/?cid=1");
  assert.deepEqual(beach.types, ["beach", "tourist_attraction"], "provider types must survive collection");
  assert.deepEqual(beach.openingHours, {
    "2026-08-01": { open: "09:00", close: "18:00" },
    "2026-08-02": { open: "09:30", close: "17:00" },
  });

  assert.equal(museum.outdoor, false);
  assert.equal(museum.openingHoursStatus, "unknown");
  assert.equal("openingHours" in museum, false, "unknown hours must stay missing, never invented");
  assert.ok(museum.score > 0);

  assert.equal(market.openingHoursStatus, "verified");
  assert.deepEqual(
    market.openingHours,
    { "2026-08-01": { open: "22:00", close: "23:59" } },
    "an overnight period keeps its same-day schedulable segment instead of vanishing"
  );
  assert.equal(market.score, 0);
});

test("Google Places collector issues one bounded request per named portfolio spec", async () => {
  const { fetchImpl, calls } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({ places: [] }),
  });

  await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl }).collect(TRIP_WITHOUT_HIGHLIGHTS);

  const searches = searchCalls(calls);
  assert.equal(searches.length, 3, "landmark/culture, nature and meal specs — no model-authored queries");
  const queries = searches.map((call) => call.query);
  assert.equal(new Set(queries).size, 3, "each spec must ask a distinct question");
  assert.ok(queries.every((query) => query.includes("Busan")));
  assert.ok(queries.some((query) => /명소|박물관/.test(query)), "destination landmarks/culture spec is required");
  assert.ok(queries.some((query) => /공원|자연/.test(query)), "outdoor/nature spec is required");
  assert.ok(queries.some((query) => /맛집|카페/.test(query)), "meal/cafe spec is required");
});

test("Google Places collector issues one deterministic search per highlight, ordered first", async () => {
  const { fetchImpl, calls } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({ places: [] }),
  });

  await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl }).collect({
    ...TRIP,
    highlights: "Haeundae Beach, Gamcheon Village, Jagalchi Market",
  });

  const queries = searchCalls(calls).map((call) => call.query);
  assert.deepEqual(
    queries.slice(0, 3),
    ["Busan Haeundae Beach", "Busan Gamcheon Village", "Busan Jagalchi Market"],
    "one merged query cannot find three different places, so each highlight gets its own search"
  );
});

test("Google Places collector reserves the meal spec whenever highlights exist", async () => {
  const { fetchImpl, calls } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({ places: [] }),
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl })
    .collect({ ...TRIP, highlights: "Haeundae Beach" });

  const queries = searchCalls(calls).map((call) => call.query);
  assert.equal(queries.length, 4, "the portfolio stays capped at four searches");
  assert.equal(queries[0], "Busan Haeundae Beach");
  assert.ok(/맛집|카페/.test(queries[1]), "the meal/base spec is reserved right after the highlights");
  assert.deepEqual(
    snapshot.searchCoverage.map((entry) => [entry.key, entry.status]),
    [["highlight-1", "verified"], ["meal", "verified"], ["landmark", "verified"], ["nature", "verified"]],
    "one highlight still leaves room for every named category"
  );
  assert.equal(snapshot.status, "verified");
});

test("Google Places collector reports the categories highlights crowded out of the request budget", async () => {
  const { fetchImpl, calls } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({ places: [place("ChIJmuseum", ["museum"])] }),
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl })
    .collect({ ...TRIP, highlights: "Haeundae Beach, Gamcheon Village" });

  const queries = searchCalls(calls).map((call) => call.query);
  assert.equal(queries.length, 4, "the portfolio stays capped at four searches");
  assert.deepEqual(queries.slice(0, 2), ["Busan Haeundae Beach", "Busan Gamcheon Village"]);
  assert.ok(/맛집|카페/.test(queries[2]), "the meal spec is reserved before the remaining categories");
  assert.ok(/명소|박물관/.test(queries[3]), "landmark takes the one slot left");

  const omitted = snapshot.searchCoverage.filter((entry) => entry.status === "not_requested");
  assert.deepEqual(omitted.map((entry) => entry.key), ["nature"]);
  assert.equal(omitted[0].itemCount, 0);
  assert.match(omitted[0].reason, /budget/);
  assert.equal(snapshot.status, "degraded", "a category we never asked for is not verified coverage");
  assert.equal(snapshot.confidence, "low");
});

test("Google Places collector still reserves the meal spec at the highlight ceiling", async () => {
  const { fetchImpl, calls } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({ places: [place("ChIJmuseum", ["museum"])] }),
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl })
    .collect({ ...TRIP, highlights: "Haeundae Beach, Gamcheon Village, Jagalchi Market" });

  const queries = searchCalls(calls).map((call) => call.query);
  assert.equal(queries.length, 4);
  assert.ok(/맛집|카페/.test(queries[3]), "three highlights is the ceiling exactly because meal keeps the fourth slot");
  assert.deepEqual(
    snapshot.searchCoverage.filter((entry) => entry.status === "not_requested").map((entry) => entry.key),
    ["landmark", "nature"]
  );
  assert.equal(snapshot.status, "degraded");
  assert.equal(snapshot.confidence, "low");
});

test("Google Places collector biases the meal spec at the accommodation base and tags each item's zone", async () => {
  const hotelLocation = { lat: 35.1531, lng: 129.1186 };
  const { fetchImpl, calls } = stubFetch({
    geocode: async (url) => {
      const address = new URL(url).searchParams.get("address");
      return {
        ok: true,
        status: 200,
        json: async () => address === "Gwangalli Hotel"
          ? { status: "OK", results: [{ geometry: { location: hotelLocation } }] }
          : GEOCODE_BODY,
      };
    },
    places: async (_url, init) => {
      const isMeal = /맛집|카페/.test(JSON.parse(init.body).textQuery);
      return {
        ok: true,
        status: 200,
        json: async () => ({ places: [place(isMeal ? "ChIJdiner" : "ChIJmuseum", isMeal ? ["restaurant"] : ["museum"])] }),
      };
    },
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl }).collect({
    ...TRIP_WITHOUT_HIGHLIGHTS,
    baseLocation: "Gwangalli Hotel",
  });

  assert.equal(calls.filter((call) => call.url.includes("geocode")).length, 2);
  assert.deepEqual(snapshot.destinationLocation, { latitude: 35.1796, longitude: 129.0756 });
  assert.deepEqual(snapshot.baseLocation, { latitude: 35.1531, longitude: 129.1186 });
  assert.equal(snapshot.baseLocationResolution.status, "verified");

  const biasByQuery = new Map(
    searchCalls(calls).map((call) => [call.query, JSON.parse(call.init.body).locationBias.circle.center])
  );
  for (const [query, center] of biasByQuery) {
    const expected = /맛집|카페/.test(query)
      ? { latitude: 35.1531, longitude: 129.1186 }
      : { latitude: 35.1796, longitude: 129.0756 };
    assert.deepEqual(center, expected, `${query} must be biased at its own zone`);
  }

  const byId = new Map(snapshot.items.map((item) => [item.id, item]));
  assert.equal(byId.get("ChIJdiner").zone, "base");
  assert.equal(byId.get("ChIJmuseum").zone, "destination");
});

test("Google Places collector falls back to the destination when the accommodation cannot be geocoded", async () => {
  const { fetchImpl } = stubFetch({
    geocode: async (url) => ({
      ok: true,
      status: 200,
      json: async () => new URL(url).searchParams.get("address") === "Busan"
        ? GEOCODE_BODY
        : { status: "ZERO_RESULTS", results: [] },
    }),
    places: okJson({ places: [place("ChIJmuseum", ["museum"])] }),
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl })
    .collect({ ...TRIP_WITHOUT_HIGHLIGHTS, baseLocation: "광안리골목 단독주택" });

  assert.equal(snapshot.items.length, 1, "a fuzzy accommodation name must not abort the plan");
  assert.deepEqual(snapshot.baseLocation, snapshot.destinationLocation);
  assert.equal(snapshot.baseLocationResolution.status, "unavailable");
  assert.match(snapshot.baseLocationResolution.reason, /ZERO_RESULTS/);
  assert.equal(snapshot.status, "degraded", "planning from the wrong base must not claim verified coverage");
  assert.equal(snapshot.confidence, "low");
  assert.ok(!JSON.stringify(snapshot).includes("test-key"), "no snapshot field may carry the API key");
});

test("Google Places collector redacts the API key from a base geocode failure reason", async () => {
  const { fetchImpl } = stubFetch({
    geocode: async (url) => {
      if (new URL(url).searchParams.get("address") === "Busan") {
        return { ok: true, status: 200, json: async () => GEOCODE_BODY };
      }
      // A transport-level failure quotes the request URL, and that URL carries the key.
      throw new Error(`fetch failed: ${url}`);
    },
    places: okJson({ places: [place("ChIJmuseum", ["museum"])] }),
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl })
    .collect({ ...TRIP_WITHOUT_HIGHLIGHTS, baseLocation: "골목 단독주택" });

  assert.equal(snapshot.baseLocationResolution.status, "unavailable");
  assert.ok(!snapshot.baseLocationResolution.reason.includes("test-key"));
  assert.ok(!JSON.stringify(snapshot).includes("test-key"));
});

test("Google Places collector queries the meal spec by destination when the accommodation cannot be geocoded", async () => {
  const { fetchImpl, calls } = stubFetch({
    geocode: async (url) => ({
      ok: true,
      status: 200,
      json: async () => new URL(url).searchParams.get("address") === "Busan"
        ? GEOCODE_BODY
        : { status: "ZERO_RESULTS", results: [] },
    }),
    places: async (_url, init) => {
      const isMeal = /맛집|카페/.test(JSON.parse(init.body).textQuery);
      return {
        ok: true,
        status: 200,
        json: async () => ({ places: isMeal ? [place("ChIJdiner", ["restaurant"])] : [] }),
      };
    },
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl })
    .collect({ ...TRIP_WITHOUT_HIGHLIGHTS, baseLocation: "광안리골목 단독주택" });

  const mealRequest = searchCalls(calls).find((call) => /맛집|카페/.test(call.query));
  const body = JSON.parse(mealRequest.init.body);
  assert.equal(body.textQuery, "Busan 맛집 카페", "a name the geocoder could not place is not a searchable place name");
  assert.ok(!body.textQuery.includes("광안리골목"));
  assert.deepEqual(
    body.locationBias.circle.center,
    { latitude: 35.1796, longitude: 129.0756 },
    "the bias centre is the fallback destination"
  );

  const meal = snapshot.searchCoverage.find((entry) => entry.key === "meal");
  assert.equal(meal.zone, "base", "the spec is still the base-zone meal spec, only its text fell back");
  assert.equal(meal.query, "Busan 맛집 카페");
  assert.equal(snapshot.items[0].zone, "base");
});

test("Google Places collector redacts the API key when the destination geocode fails", async () => {
  const { fetchImpl } = stubFetch({
    // A transport-level failure quotes the request URL, and that URL carries the key.
    geocode: async (url) => { throw new Error(`fetch failed: ${url}`); },
    places: okJson(PLACES_BODY),
  });

  await assert.rejects(
    createGooglePlacesCollector({ apiKey: "test-key", fetchImpl }).collect(TRIP),
    (error) => {
      assert.ok(!error.message.includes("test-key"), `key leaked into: ${error.message}`);
      assert.match(error.message, /Busan/);
      return true;
    }
  );
});

test("Google Places collector rejects non-numeric coordinates instead of coercing them to zero", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({
      places: [
        { ...place("null-lat", ["museum"]), location: { latitude: null, longitude: 129.1 } },
        { ...place("blank-lng", ["museum"]), location: { latitude: 35.1, longitude: "" } },
        { ...place("boolean", ["museum"]), location: { latitude: true, longitude: false } },
        { ...place("string-number", ["museum"]), location: { latitude: "35.1", longitude: "129.1" } },
        { ...place("empty-location", ["museum"]), location: {} },
        place("good", ["museum"]),
      ],
    }),
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl }).collect(TRIP_WITHOUT_HIGHLIGHTS);

  assert.deepEqual(
    snapshot.items.map((item) => item.id),
    ["good"],
    "Number(null) is 0, and 0,0 in the Gulf of Guinea is not a Busan attraction"
  );
});

test("Google Places collector rejects a geocode result whose coordinates are not numbers", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson({ status: "OK", results: [{ geometry: { location: { lat: null, lng: "129.0756" } } }] }),
    places: okJson(PLACES_BODY),
  });

  await assert.rejects(
    createGooglePlacesCollector({ apiKey: "test-key", fetchImpl }).collect(TRIP_WITHOUT_HIGHLIGHTS),
    /geocoded latitude/
  );
});

test("Google Places collector splits the candidate quota across specs, dedupes by place id and caps the total", async () => {
  let call = 0;
  const { fetchImpl, calls } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: async () => {
      const index = call++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          // Every spec returns more than its quota, and every spec repeats `shared`.
          places: [
            place("shared", ["museum"]),
            ...Array.from({ length: 6 }, (_, offset) => place(`spec-${index}-${offset}`, ["museum"])),
          ],
        }),
      };
    },
  });

  const snapshot = await createGooglePlacesCollector({
    apiKey: "test-key",
    fetchImpl,
    maxCandidates: 10,
  }).collect(TRIP_WITHOUT_HIGHLIGHTS);

  const quotas = searchCalls(calls).map((request) => JSON.parse(request.init.body).maxResultCount);
  assert.deepEqual(quotas, [5, 5, 5], "10 candidates over 3 specs is a deterministic 4 each plus 1.5x headroom");
  assert.equal(snapshot.items.filter((item) => item.id === "shared").length, 1, "duplicate place ids collapse");
  assert.equal(snapshot.items.length, 10, "the final list is capped at maxCandidates");
  assert.equal(new Set(snapshot.items.map((item) => item.id)).size, 10);
});

test("Google Places collector asks for enough headroom that the production limit still fills", async () => {
  let call = 0;
  const { fetchImpl, calls } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: async (_url, init) => {
      const index = call++;
      const quota = JSON.parse(init.body).maxResultCount;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          places: [
            // Every spec repeats `shared` and returns one unusable result.
            place("shared", ["museum"], OPEN_BOTH_DAYS),
            { id: "bad|id", displayName: { text: "Pipe" }, location: { latitude: 35, longitude: 129 } },
            ...Array.from({ length: quota }, (_, offset) => place(`spec-${index}-${offset}`, ["museum"], OPEN_BOTH_DAYS)),
          ],
        }),
      };
    },
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl, ...GROUNDED_PLACES_OPTIONS })
    .collect(TRIP_WITHOUT_HIGHLIGHTS);

  const quotas = searchCalls(calls).map((request) => JSON.parse(request.init.body).maxResultCount);
  assert.deepEqual(quotas, [6, 6, 6], "headroom is bought inside the existing requests, never with extra ones");
  assert.equal(snapshot.items.length, 12, "duplicates and unusable results are backfilled up to the production limit");
});

test("Google Places collector never returns more than 20 candidates", async () => {
  let call = 0;
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: async () => {
      const index = call++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          places: Array.from({ length: 25 }, (_, offset) => place(`spec-${index}-${offset}`, ["museum"])),
        }),
      };
    },
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl, maxCandidates: 50 })
    .collect(TRIP_WITHOUT_HIGHLIGHTS);

  assert.equal(snapshot.items.length, 20);
});

test("Google Places collector maps provider types onto deterministic categories", async () => {
  // One chunk per spec, because each spec only takes its own share of the candidate quota.
  const chunks = [
    [
      place("restaurant", ["restaurant", "food"]),
      place("cafe", ["cafe", "point_of_interest"]),
      place("bakery", ["bakery"]),
      place("park", ["park"]),
      place("beach", ["beach", "tourist_attraction"]),
    ],
    [
      place("museum", ["museum"]),
      place("temple", ["place_of_worship", "tourist_attraction"]),
      place("spa", ["spa"]),
    ],
    [
      place("mall", ["shopping_mall"]),
      place("bar", ["bar", "night_club"]),
      place("landmark", ["tourist_attraction", "point_of_interest"]),
    ],
  ];
  let call = 0;
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: async () => ({ ok: true, status: 200, json: async () => ({ places: chunks[call++] || [] }) }),
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl }).collect(TRIP_WITHOUT_HIGHLIGHTS);
  const categoryOf = (id) => snapshot.items.find((item) => item.id === id)?.category;

  assert.equal(categoryOf("restaurant"), "meal");
  assert.equal(categoryOf("cafe"), "meal");
  assert.equal(categoryOf("bakery"), "meal");
  assert.equal(categoryOf("park"), "nature");
  assert.equal(categoryOf("beach"), "nature");
  assert.equal(categoryOf("museum"), "culture");
  assert.equal(categoryOf("temple"), "culture");
  assert.equal(categoryOf("spa"), "wellness");
  assert.equal(categoryOf("mall"), "shopping");
  assert.equal(categoryOf("bar"), "nightlife");
  assert.equal(categoryOf("landmark"), "attraction", "an unmapped type falls back to a plain attraction");
});

test("Google Places collector prefers primaryType over the generic type list when choosing a category", async () => {
  const { fetchImpl, calls } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({
      places: [
        place("dinner-club", ["night_club", "bar", "restaurant", "food"], { primaryType: "restaurant" }),
        place("club", ["night_club", "bar", "restaurant", "food"]),
        place("gallery", ["tourist_attraction", "museum", "point_of_interest"], { primaryType: "art_gallery" }),
        place("unmapped-primary", ["museum"], { primaryType: "tourist_attraction" }),
      ],
    }),
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl }).collect(TRIP_WITHOUT_HIGHLIGHTS);

  assert.match(searchCalls(calls)[0].init.headers["X-Goog-FieldMask"], /places\.primaryType/);
  const byId = new Map(snapshot.items.map((item) => [item.id, item]));
  assert.equal(byId.get("dinner-club").primaryType, "restaurant", "the provider's primary type must survive collection");
  assert.equal(byId.get("dinner-club").category, "meal");
  assert.equal(byId.get("club").category, "nightlife", "a club that also lists food is not a meal stop");
  assert.equal(byId.get("gallery").category, "culture");
  assert.equal(byId.get("unmapped-primary").category, "culture", "an unmapped primaryType falls back to the type list");
});

test("Google Places collector maps Google's always-open period onto every trip day", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({
      // Google states "open 24/7" as a single Sunday period with no close.
      places: [place("ChIJalways", ["museum"], { regularOpeningHours: { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] } })],
    }),
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl }).collect(TRIP_WITHOUT_HIGHLIGHTS);

  const [item] = snapshot.items;
  assert.equal(item.openingHoursStatus, "verified");
  assert.deepEqual(item.openingHours, {
    "2026-08-01": { open: "00:00", close: "23:59" },
    "2026-08-02": { open: "00:00", close: "23:59" },
  });
});

test("Google Places collector keeps the same-day segment of an overnight period", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({
      places: [place("ChIJbar", ["bar"], {
        regularOpeningHours: {
          periods: [{ open: { day: 6, hour: 22, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } }],
        },
      })],
    }),
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl }).collect(TRIP_WITHOUT_HIGHLIGHTS);

  const [item] = snapshot.items;
  assert.equal(item.openingHoursStatus, "verified");
  assert.deepEqual(item.openingHours, { "2026-08-01": { open: "22:00", close: "23:59" } });
});

test("Google Places collector scores a rating without a usable review count and drops off-globe coordinates", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({
      places: [
        { ...place("no-count", ["museum"]), rating: 4.6 },
        { ...place("bad-count", ["museum"]), rating: 4, userRatingCount: "many" },
        { ...place("off-globe", ["museum"]), location: { latitude: 95, longitude: 129.1 } },
        { ...place("off-meridian", ["museum"]), location: { latitude: 35.1, longitude: 200 } },
      ],
    }),
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl }).collect(TRIP_WITHOUT_HIGHLIGHTS);

  const byId = new Map(snapshot.items.map((item) => [item.id, item]));
  assert.ok(byId.get("no-count").score > 0, "a missing review count must not poison the score");
  assert.ok(byId.get("bad-count").score > 0);
  assert.deepEqual(
    snapshot.items.map((item) => item.id),
    ["no-count", "bad-count"],
    "coordinates outside the latitude/longitude range are not a place"
  );
});

test("Google Places collector gives each category its own default visit duration", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({
      places: [
        place("restaurant", ["restaurant"]),
        place("park", ["park"]),
        place("museum", ["museum"]),
        place("spa", ["spa"]),
        place("mall", ["shopping_mall"]),
        place("bar", ["night_club"]),
        place("landmark", ["tourist_attraction"]),
      ],
    }),
  });

  const snapshot = await createGooglePlacesCollector({
    apiKey: "test-key",
    fetchImpl,
    defaultDurationMinutes: 45,
  }).collect(TRIP_WITHOUT_HIGHLIGHTS);
  const durationOf = (id) => snapshot.items.find((item) => item.id === id)?.durationMinutes;

  assert.equal(durationOf("restaurant"), 75);
  assert.equal(durationOf("park"), 150);
  assert.equal(durationOf("museum"), 90);
  assert.equal(durationOf("spa"), 120);
  assert.equal(durationOf("mall"), 120);
  assert.equal(durationOf("bar"), 120);
  assert.equal(durationOf("landmark"), 45, "defaultDurationMinutes is the attraction fallback only");
});

test("Google Places collector attaches preferred windows only where the category meaning is strong", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({
      places: [
        place("restaurant", ["restaurant"]),
        place("park", ["park"]),
        place("mall", ["shopping_mall"]),
        place("bar", ["night_club"]),
        place("museum", ["museum"]),
        place("landmark", ["tourist_attraction"]),
        place("spa", ["spa"]),
      ],
    }),
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl }).collect(TRIP_WITHOUT_HIGHLIGHTS);
  const windowsOf = (id) => snapshot.items.find((item) => item.id === id)?.preferredWindows;

  assert.equal(windowsOf("restaurant").length, 2, "meals prefer lunch and dinner");
  assert.ok(windowsOf("restaurant").every((window) => window.start < window.end));
  assert.ok(windowsOf("restaurant").some((window) => window.start < "13:00" && window.end > "12:00"));
  assert.ok(windowsOf("restaurant").some((window) => window.start >= "17:00"));
  assert.deepEqual(windowsOf("bar"), [{ start: "19:00", end: "23:59" }]);
  assert.deepEqual(windowsOf("mall"), [{ start: "13:00", end: "20:00" }]);
  assert.deepEqual(windowsOf("park"), [{ start: "09:00", end: "17:00" }]);
  assert.equal(windowsOf("museum"), undefined, "culture carries no time-of-day claim");
  assert.equal(windowsOf("landmark"), undefined, "a plain attraction carries no time-of-day claim");
  assert.equal(windowsOf("spa"), undefined);
});

test("Google Places collector reports per-spec coverage and degrades when one category fails", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: async (_url, init) => {
      if (/공원|자연/.test(JSON.parse(init.body).textQuery)) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ places: [place("ChIJmuseum", ["museum"])] }) };
    },
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl }).collect(TRIP_WITHOUT_HIGHLIGHTS);

  assert.equal(snapshot.status, "degraded", "a missing category must not claim complete verified coverage");
  assert.equal(snapshot.confidence, "low");
  assert.equal(snapshot.searchCoverage.length, 3);
  const failed = snapshot.searchCoverage.filter((spec) => spec.status === "unavailable");
  assert.equal(failed.length, 1);
  assert.equal(failed[0].key, "nature");
  assert.equal(failed[0].itemCount, 0);
  assert.match(failed[0].reason, /500/);
  const verified = snapshot.searchCoverage.filter((entry) => entry.status === "verified");
  assert.deepEqual(verified.map((spec) => spec.key), ["landmark", "meal"]);
  for (const spec of verified) {
    assert.ok(spec.query.includes("Busan"));
    assert.ok(spec.quota > 0);
  }
  // The one place both surviving specs returned is counted once, by the spec that contributed it.
  assert.deepEqual(verified.map((spec) => spec.itemCount), [1, 0]);
  assert.equal(snapshot.items.length, 1);
});

test("Google Places collector reports full coverage when every spec answers", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({ places: [place("ChIJmuseum", ["museum"])] }),
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl }).collect(TRIP_WITHOUT_HIGHLIGHTS);

  assert.equal(snapshot.status, "verified");
  assert.equal(snapshot.confidence, "high");
  assert.ok(snapshot.searchCoverage.every((spec) => spec.status === "verified"));
});

test("Google Places collector keeps every user highlight matchable across the portfolio", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: async (_url, init) => {
      const query = JSON.parse(init.body).textQuery;
      const places = /Gamcheon/.test(query)
        ? [place("ChIJgamcheon", ["tourist_attraction"], { displayName: { text: "Gamcheon Culture Village" } })]
        : Array.from({ length: 6 }, (_, offset) => place(`filler-${query.length}-${offset}`, ["museum"]));
      return { ok: true, status: 200, json: async () => ({ places }) };
    },
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl, maxCandidates: 4 }).collect({
    ...TRIP,
    highlights: "Gamcheon Culture Village",
  });

  const required = snapshot.items.filter((item) => item.required);
  assert.deepEqual(required.map((item) => item.id), ["ChIJgamcheon"], "a required highlight must survive the final cap");
  assert.deepEqual(snapshot.unmatchedHighlights, []);
});

test("Google Places collector marks one place required per highlight, however many names match", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: async (_url, init) => {
      const query = JSON.parse(init.body).textQuery;
      const places = Array.from({ length: 3 }, (_, offset) => place(
        `${query.length}-${offset}`,
        ["museum"],
        { displayName: { text: `Museum ${query.length}-${offset}` }, rating: 4, userRatingCount: 100 }
      ));
      return { ok: true, status: 200, json: async () => ({ places }) };
    },
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl, maxCandidates: 2 })
    .collect({ ...TRIP, highlights: "Museum" });

  assert.equal(snapshot.items.length, 2);
  assert.equal(
    snapshot.items.filter((item) => item.required).length,
    1,
    "a broad highlight names one place, so it may not fill the whole cap with required items"
  );
  assert.deepEqual(snapshot.unmatchedHighlights, []);
});

test("Google Places collector prefers the candidate the highlight's own search returned", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: async (_url, init) => {
      const query = JSON.parse(init.body).textQuery;
      const isHighlight = query === "Busan Museum";
      return {
        ok: true,
        status: 200,
        json: async () => ({
          places: [place(
            isHighlight ? "ChIJhighlight" : `ChIJportfolio-${query.length}`,
            ["museum"],
            {
              displayName: { text: isHighlight ? "Small Museum" : "Grand Museum" },
              rating: isHighlight ? 3 : 5,
              userRatingCount: isHighlight ? 10 : 10_000,
            }
          )],
        }),
      };
    },
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl })
    .collect({ ...TRIP, highlights: "Museum" });

  assert.deepEqual(
    snapshot.items.filter((item) => item.required).map((item) => item.id),
    ["ChIJhighlight"],
    "the search issued for the highlight answers it, not a higher-scored place from another spec"
  );
});

test("Google Places collector answers each highlight with its own required place", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: async (_url, init) => {
      const query = JSON.parse(init.body).textQuery;
      if (query === "Busan Beach") {
        return { ok: true, status: 200, json: async () => ({ places: [place("ChIJbeach", ["beach"], { displayName: { text: "Haeundae Beach" } })] }) };
      }
      if (query === "Busan Museum") {
        return { ok: true, status: 200, json: async () => ({ places: [place("ChIJmuseum", ["museum"], { displayName: { text: "Busan Museum" } })] }) };
      }
      return { ok: true, status: 200, json: async () => ({ places: [place("ChIJdiner", ["restaurant"])] }) };
    },
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl })
    .collect({ ...TRIP, highlights: "Beach, Museum" });

  assert.deepEqual(
    snapshot.items.filter((item) => item.required).map((item) => item.id).sort(),
    ["ChIJbeach", "ChIJmuseum"]
  );
  assert.deepEqual(snapshot.unmatchedHighlights, []);
});

test("Google Places collector rejects a date that is not a real calendar date", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson(PLACES_BODY),
  });
  const collector = createGooglePlacesCollector({ apiKey: "test-key", fetchImpl });

  await assert.rejects(
    collector.collect({ ...TRIP, startDate: "2026-02-30", endDate: "2026-02-30" }),
    /startDate must be a valid calendar date/
  );
});

test("Google Places collector adds verified alternatives for candidates with unknown hours", async () => {
  let searchCount = 0;
  const { fetchImpl, calls } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: async (_url, init) => {
      searchCount += 1;
      const isRetry = /영업시간/.test(JSON.parse(init.body).textQuery);
      return {
        ok: true,
        status: 200,
        json: async () => isRetry ? {
          places: [{
            id: "ChIJalternative",
            displayName: { text: "Verified Art Museum" },
            location: { latitude: 35.14, longitude: 129.1 },
            types: ["museum"],
            regularOpeningHours: {
              periods: [
                { open: { day: 6, hour: 10, minute: 0 }, close: { day: 6, hour: 18, minute: 0 } },
                { open: { day: 0, hour: 10, minute: 0 }, close: { day: 0, hour: 18, minute: 0 } },
              ],
            },
          }],
        } : PLACES_BODY,
      };
    },
  });

  const snapshot = await createGooglePlacesCollector({
    apiKey: "test-key",
    fetchImpl,
    maxCandidates: 12,
    retryUnknownOpeningHours: true,
  }).collect(TRIP);

  assert.ok(snapshot.items.some((item) => item.id === "ChIJalternative" && item.openingHoursStatus === "verified"));
  assert.deepEqual(snapshot.alternativeSearch, { status: "verified", addedCount: 1 });
  // 4 portfolio specs + 1 replacement query is the documented ceiling for a highlighted trip.
  assert.equal(searchCalls(calls).length, 5);
  assert.equal(searchCount, 5);
});

test("Google Places collector never trades a required highlight for a verified alternative", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: async (_url, init) => {
      const query = JSON.parse(init.body).textQuery;
      if (/영업시간/.test(query)) {
        return { ok: true, status: 200, json: async () => ({ places: [place("ChIJalternative", ["museum"], OPEN_BOTH_DAYS)] }) };
      }
      const places = /Gamcheon/.test(query)
        // The required place is exactly the one whose hours the provider does not publish.
        ? [place("ChIJgamcheon", ["tourist_attraction"], { displayName: { text: "Gamcheon Culture Village" } })]
        : [place("ChIJmuseum", ["museum"], OPEN_BOTH_DAYS)];
      return { ok: true, status: 200, json: async () => ({ places }) };
    },
  });

  const snapshot = await createGooglePlacesCollector({
    apiKey: "test-key",
    fetchImpl,
    maxCandidates: 2,
    retryUnknownOpeningHours: true,
  }).collect({ ...TRIP, highlights: "Gamcheon Culture Village" });

  const gamcheon = snapshot.items.find((item) => item.id === "ChIJgamcheon");
  assert.ok(gamcheon, "a required highlight must survive the replacement pass");
  assert.equal(gamcheon.required, true);
  assert.equal(gamcheon.openingHoursStatus, "unknown", "an unresolved required place stays unresolved, it is not swapped");
  assert.equal(snapshot.items.length, 2);
  assert.equal(snapshot.alternativeSearch.addedCount, 0, "no non-required slot means nothing is replaced");
  assert.deepEqual(snapshot.unmatchedHighlights, []);
});

test("Google Places collector degrades when the opening-hours retry fails", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: async (_url, init) => {
      if (/영업시간/.test(JSON.parse(init.body).textQuery)) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ places: [place("ChIJmuseum", ["museum"])] }) };
    },
  });

  const snapshot = await createGooglePlacesCollector({
    apiKey: "test-key",
    fetchImpl,
    retryUnknownOpeningHours: true,
  }).collect(TRIP_WITHOUT_HIGHLIGHTS);

  assert.equal(snapshot.alternativeSearch.status, "unavailable");
  assert.equal(snapshot.alternativeSearch.addedCount, 0);
  assert.match(snapshot.alternativeSearch.reason, /503/);
  assert.equal(snapshot.status, "degraded", "an unresolved retry must not pass as complete coverage");
  assert.equal(snapshot.confidence, "low");
});

test("Google Places collector keeps total provider requests bounded", async () => {
  const { fetchImpl, calls } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({ places: [place("ChIJmuseum", ["museum"])] }),
  });

  await createGooglePlacesCollector({
    apiKey: "test-key",
    fetchImpl,
    retryUnknownOpeningHours: true,
  }).collect({ ...TRIP, baseLocation: "Gwangalli Hotel" });

  assert.equal(calls.filter((call) => call.url.includes("geocode")).length, 2, "destination + base geocode");
  assert.ok(searchCalls(calls).length <= 5, "at most 4 portfolio searches plus 1 opening-hours replacement");
  assert.ok(calls.length <= 7, "a plan costs at most 7 Google requests");
});

test("Google Places collector reports the two search bounds it actually spends", async () => {
  const { fetchImpl, calls } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({ places: [place("ChIJmuseum", ["museum"])] }),
  });

  const snapshot = await createGooglePlacesCollector({
    apiKey: "test-key",
    fetchImpl,
    retryUnknownOpeningHours: true,
  }).collect(TRIP);

  assert.deepEqual(snapshot.requestBudget, {
    maxPortfolioSearches: 4,
    maxAlternativeSearches: 1,
    portfolioSearches: 4,
    alternativeSearches: 1,
  }, "the opening-hours retry is bought on top of the portfolio, not out of it");
  assert.equal(searchCalls(calls).length, 5);
});

test("Google Places collector reports no alternative search when it never runs one", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({ places: [place("ChIJmuseum", ["museum"], OPEN_BOTH_DAYS)] }),
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl }).collect(TRIP);

  assert.equal(snapshot.requestBudget.alternativeSearches, 0);
  assert.equal(snapshot.requestBudget.portfolioSearches, 4);
});

test("Google Places collector requires an API key", () => {
  assert.throws(
    () => createGooglePlacesCollector({ apiKey: "", fetchImpl: async () => ({}) }),
    /API key/
  );
});

test("Google Places collector fails when geocoding returns no result", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson({ status: "ZERO_RESULTS", results: [] }),
    places: okJson(PLACES_BODY),
  });
  const collector = createGooglePlacesCollector({ apiKey: "test-key", fetchImpl });

  await assert.rejects(collector.collect(TRIP), /ZERO_RESULTS/);
});

test("Google Places collector fails when every portfolio search fails", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: async () => ({ ok: false, status: 403, json: async () => ({}) }),
  });
  const collector = createGooglePlacesCollector({ apiKey: "test-key", fetchImpl });

  await assert.rejects(collector.collect(TRIP), /403/);
});

test("Google Places collector fails when no search response carries places", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({}),
  });
  const collector = createGooglePlacesCollector({ apiKey: "test-key", fetchImpl });

  await assert.rejects(collector.collect(TRIP), /no places/);
});

test("Google Places collector drops results without a usable id, name or location", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({
      places: [
        { displayName: { text: "No id" }, location: { latitude: 35, longitude: 129 } },
        { id: "no-location", displayName: { text: "No location" } },
        { id: "bad|id", displayName: { text: "Pipe" }, location: { latitude: 35, longitude: 129 } },
        PLACES_BODY.places[1],
      ],
    }),
  });
  const collector = createGooglePlacesCollector({ apiKey: "test-key", fetchImpl });

  const snapshot = await collector.collect(TRIP);

  assert.deepEqual(snapshot.items.map((item) => item.id), ["ChIJmuseum"]);
});
