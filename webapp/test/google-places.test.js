import test from "node:test";
import assert from "node:assert/strict";

import { createGooglePlacesCollector } from "../src/planner/google-places.js";

const TRIP = {
  destination: "Busan",
  startDate: "2026-08-01",
  endDate: "2026-08-02",
  highlights: "Haeundae Beach",
};

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

function stubFetch(handlers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const href = String(url);
    calls.push({ url: href, init });
    const handler = href.includes("geocode") ? handlers.geocode : handlers.places;
    return handler(href, init);
  };
  return { fetchImpl, calls };
}

const okJson = (body) => async () => ({ ok: true, status: 200, json: async () => body });

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

  assert.equal(calls.length, 2);
  const geocodeUrl = new URL(calls[0].url);
  assert.equal(geocodeUrl.searchParams.get("address"), "Busan");
  assert.equal(geocodeUrl.searchParams.get("key"), "test-key");

  const searchRequest = calls[1];
  assert.equal(searchRequest.init.method, "POST");
  assert.equal(searchRequest.init.headers["X-Goog-Api-Key"], "test-key");
  assert.match(searchRequest.init.headers["X-Goog-FieldMask"], /places\.regularOpeningHours/);
  assert.match(searchRequest.init.headers["X-Goog-FieldMask"], /places\.userRatingCount/);
  const searchBody = JSON.parse(searchRequest.init.body);
  assert.match(searchBody.textQuery, /Busan/);
  assert.match(searchBody.textQuery, /Haeundae Beach/);
  assert.ok(searchBody.maxResultCount <= 20);
  assert.deepEqual(searchBody.locationBias.circle.center, { latitude: 35.1796, longitude: 129.0756 });

  assert.equal(snapshot.source, "google-places");
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
  assert.ok(beach.durationMinutes > 0);
  assert.deepEqual(beach.openingHours, {
    "2026-08-01": { open: "09:00", close: "18:00" },
    "2026-08-02": { open: "09:30", close: "17:00" },
  });

  assert.equal(museum.outdoor, false);
  assert.equal(museum.openingHoursStatus, "unknown");
  assert.equal("openingHours" in museum, false, "unknown hours must stay missing, never invented");
  assert.ok(museum.score > 0);

  assert.equal(market.openingHoursStatus, "unsupported");
  assert.equal("openingHours" in market, false, "overnight periods yield no same-day window");
  assert.equal(market.score, 0);
});

test("Google Places collector resolves a separate accommodation base location", async () => {
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
    places: okJson(PLACES_BODY),
  });

  const snapshot = await createGooglePlacesCollector({ apiKey: "test-key", fetchImpl }).collect({
    ...TRIP,
    baseLocation: "Gwangalli Hotel",
  });

  assert.equal(calls.filter((call) => call.url.includes("geocode")).length, 2);
  assert.deepEqual(snapshot.destinationLocation, { latitude: 35.1796, longitude: 129.0756 });
  assert.deepEqual(snapshot.baseLocation, { latitude: 35.1531, longitude: 129.1186 });
});

test("Google Places collector adds verified alternatives for candidates with unknown hours", async () => {
  let searchCount = 0;
  const { fetchImpl, calls } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: async () => {
      searchCount += 1;
      return {
        ok: true,
        status: 200,
        json: async () => searchCount === 1 ? PLACES_BODY : {
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
        },
      };
    },
  });

  const snapshot = await createGooglePlacesCollector({
    apiKey: "test-key",
    fetchImpl,
    maxCandidates: 3,
    retryUnknownOpeningHours: true,
  }).collect(TRIP);

  assert.equal(calls.filter((call) => !call.url.includes("geocode")).length, 2);
  assert.ok(snapshot.items.some((item) => item.id === "ChIJalternative" && item.openingHoursStatus === "verified"));
  assert.deepEqual(snapshot.alternativeSearch, { status: "verified", addedCount: 1 });
});

test("Google Places collector caps candidates at 20", async () => {
  const many = Array.from({ length: 25 }, (_, index) => ({
    id: `place-${index}`,
    displayName: { text: `Place ${index}` },
    location: { latitude: 35 + index / 1000, longitude: 129 },
    types: ["museum"],
  }));
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: okJson({ places: many }),
  });
  const collector = createGooglePlacesCollector({ apiKey: "test-key", fetchImpl });

  const snapshot = await collector.collect(TRIP);

  assert.equal(snapshot.items.length, 20);
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

test("Google Places collector fails on a non-ok search response", async () => {
  const { fetchImpl } = stubFetch({
    geocode: okJson(GEOCODE_BODY),
    places: async () => ({ ok: false, status: 403, json: async () => ({}) }),
  });
  const collector = createGooglePlacesCollector({ apiKey: "test-key", fetchImpl });

  await assert.rejects(collector.collect(TRIP), /403/);
});

test("Google Places collector fails when the search response carries no places", async () => {
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
