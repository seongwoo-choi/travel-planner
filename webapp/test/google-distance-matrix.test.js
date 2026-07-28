import test from "node:test";
import assert from "node:assert/strict";

import { createGoogleDistanceMatrixCollector } from "../src/planner/google-distance-matrix.js";

const TRIP = {
  baseLocationId: "hotel",
  latitude: 35.1531,
  longitude: 129.1186,
  startDate: "2026-08-01",
  dailyStartTime: "09:00",
  timezone: "Asia/Seoul",
};

const PLACES = [
  { id: "beach", coordinates: { latitude: 35.1587, longitude: 129.1604 } },
  { id: "museum", coordinates: { latitude: 35.1304, longitude: 129.0919 } },
];

function matrixBody(url, { seconds = 600, elementStatus = "OK", status = "OK" } = {}) {
  const origins = new URL(url).searchParams.get("origins").split("|");
  const destinations = new URL(url).searchParams.get("destinations").split("|");
  return {
    status,
    rows: origins.map(() => ({
      elements: destinations.map(() => ({
        status: elementStatus,
        duration: elementStatus === "OK" ? { value: seconds, text: `${seconds / 60} mins` } : undefined,
      })),
    })),
  };
}

function stubFetch(bodyFor) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => bodyFor(String(url)) };
  };
  return { fetchImpl, calls };
}

test("Distance Matrix collector builds a transit matrix between the base and every place", async () => {
  const { fetchImpl, calls } = stubFetch((url) => matrixBody(url));
  const collector = createGoogleDistanceMatrixCollector({
    apiKey: "test-key",
    fetchImpl,
    now: () => new Date("2026-07-28T10:00:00Z"),
  });

  const snapshot = await collector.collect(TRIP, PLACES);

  assert.equal(calls.length, 1, "3 locations fit inside one bounded request");
  const requested = new URL(calls[0].url);
  assert.equal(requested.searchParams.get("mode"), "transit");
  assert.equal(requested.searchParams.get("key"), "test-key");
  assert.equal(
    requested.searchParams.get("origins"),
    "35.1531,129.1186|35.1587,129.1604|35.1304,129.0919"
  );
  assert.equal(requested.searchParams.get("origins"), requested.searchParams.get("destinations"));
  assert.equal(
    Number(requested.searchParams.get("departure_time")),
    Date.parse("2026-08-01T00:00:00Z") / 1000
  );

  assert.equal(snapshot.source, "google-distance-matrix");
  assert.equal(snapshot.mode, "transit");
  assert.equal(snapshot.fetchedAt, "2026-07-28T10:00:00.000Z");
  assert.ok(!snapshot.sourceUrl.includes("test-key"), "sourceUrl must not leak the API key");
  assert.deepEqual(snapshot.matrix, {
    "hotel|beach": 10,
    "hotel|museum": 10,
    "beach|hotel": 10,
    "beach|museum": 10,
    "museum|hotel": 10,
    "museum|beach": 10,
  });
});

test("Distance Matrix collector honours a driving mode override", async () => {
  const { fetchImpl, calls } = stubFetch((url) => matrixBody(url, { seconds: 900 }));
  const collector = createGoogleDistanceMatrixCollector({ apiKey: "test-key", fetchImpl, mode: "driving" });

  const snapshot = await collector.collect(TRIP, PLACES);

  assert.equal(new URL(calls[0].url).searchParams.get("mode"), "driving");
  assert.equal(snapshot.matrix["hotel|beach"], 15);
});

test("Distance Matrix collector records the major leg from departure to destination", async () => {
  const trip = {
    ...TRIP,
    departure: "Seoul Station",
    destination: "Busan",
    destinationLatitude: 35.1796,
    destinationLongitude: 129.0756,
  };
  const { fetchImpl, calls } = stubFetch((url) => {
    const origins = new URL(url).searchParams.get("origins");
    return matrixBody(url, { seconds: origins === "Seoul Station" ? 10_800 : 600 });
  });

  const snapshot = await createGoogleDistanceMatrixCollector({
    apiKey: "test-key",
    fetchImpl,
    now: () => new Date("2026-07-28T10:00:00Z"),
  }).collect(trip, PLACES);

  assert.equal(calls.length, 2);
  assert.deepEqual(snapshot.majorLeg, {
    status: "verified",
    origin: "Seoul Station",
    destination: "Busan",
    mode: "transit",
    durationMinutes: 180,
  });
});

test("Distance Matrix collector exposes the outbound major leg and omits the return it never requested", async () => {
  const trip = {
    ...TRIP,
    departure: "Seoul Station",
    destination: "Busan",
    destinationLatitude: 35.1796,
    destinationLongitude: 129.0756,
  };
  const { fetchImpl } = stubFetch((url) => {
    const origins = new URL(url).searchParams.get("origins");
    return matrixBody(url, { seconds: origins === "Seoul Station" ? 10_800 : 600 });
  });

  const snapshot = await createGoogleDistanceMatrixCollector({ apiKey: "test-key", fetchImpl }).collect(trip, PLACES);

  assert.deepEqual(snapshot.localTransport, { mode: "transit", status: "verified", confidence: "high" });
  assert.deepEqual(snapshot.majorTransport.outbound, {
    direction: "outbound",
    status: "verified",
    origin: "Seoul Station",
    destination: "Busan",
    mode: "transit",
    durationMinutes: 180,
  });
  assert.equal(
    snapshot.majorTransport.inbound,
    undefined,
    "a return nobody requested is left out, not reported as an unavailable leg"
  );
});

test("Distance Matrix collector reports both flight directions without a departure text or destination coordinates", async () => {
  const trip = { ...TRIP, destination: "", majorTransportMode: "flight", localTravelMode: "driving" };
  const { fetchImpl, calls } = stubFetch((url) => matrixBody(url));

  const snapshot = await createGoogleDistanceMatrixCollector({
    apiKey: "test-key",
    fetchImpl,
    mode: "driving",
  }).collect(trip, PLACES);

  assert.equal(calls.length, 1, "the air leg must never become a textual Distance Matrix request");
  assert.equal(snapshot.majorLeg, undefined, "a flight is not a Distance Matrix leg");
  for (const direction of ["outbound", "inbound"]) {
    const segment = snapshot.majorTransport[direction];
    assert.equal(segment.direction, direction);
    assert.equal(segment.mode, "flight");
    assert.equal(segment.status, "unavailable");
    assert.equal(segment.durationMinutes, undefined);
    assert.match(segment.reason, /flight schedule/);
    assert.ok(segment.origin && segment.destination, "a missing endpoint is labelled, never left blank");
  }
  assert.notEqual(
    snapshot.majorTransport.outbound.origin,
    snapshot.majorTransport.outbound.destination,
    "two unknown endpoints must not collapse into one label"
  );
});

test("Distance Matrix collector redacts the request URL from a major leg failure reason", async () => {
  const trip = {
    ...TRIP,
    departure: "Seoul Station",
    destination: "Busan",
    destinationLatitude: 35.1796,
    destinationLongitude: 129.0756,
  };
  const fetchImpl = async (url) => {
    if (new URL(url).searchParams.get("origins") === "Seoul Station") {
      throw new Error(`fetch failed for ${url}`);
    }
    return { ok: true, status: 200, json: async () => matrixBody(String(url)) };
  };

  const snapshot = await createGoogleDistanceMatrixCollector({
    apiKey: "super-secret-key",
    fetchImpl,
  }).collect(trip, PLACES);

  assert.equal(snapshot.majorLeg.status, "unavailable");
  assert.match(snapshot.majorLeg.reason, /fetch failed/);
  assert.ok(!snapshot.majorLeg.reason.includes("super-secret-key"), "the API key must never be persisted in a reason");
  assert.ok(!snapshot.majorLeg.reason.includes("?"), "the whole query string is dropped, not just the key");
});

test("Distance Matrix collector never routes a flight and never asks for a local transit matrix", async () => {
  const trip = {
    ...TRIP,
    departure: "서울",
    destination: "후쿠오카",
    destinationLatitude: 33.5902,
    destinationLongitude: 130.4017,
    transportPref: "flight",
    majorTransportMode: "flight",
    localTravelMode: "driving",
  };
  const { fetchImpl, calls } = stubFetch((url) => matrixBody(url));

  const snapshot = await createGoogleDistanceMatrixCollector({
    apiKey: "test-key",
    fetchImpl,
    mode: "driving",
  }).collect(trip, PLACES);

  assert.equal(calls.length, 1, "only the local matrix may be requested for a flight trip");
  for (const call of calls) {
    const params = new URL(call.url).searchParams;
    assert.equal(params.get("mode"), "driving");
    assert.ok(!params.get("origins").includes("서울"), "the textual origin must never be routed");
  }
  assert.deepEqual(snapshot.localTransport, { mode: "driving", status: "verified", confidence: "high" });
  assert.equal(snapshot.majorLeg, undefined, "a flight is not a Distance Matrix leg");
  for (const direction of ["outbound", "inbound"]) {
    const segment = snapshot.majorTransport[direction];
    assert.equal(segment.direction, direction);
    assert.equal(segment.mode, "flight");
    assert.equal(segment.status, "unavailable");
    assert.equal(segment.durationMinutes, undefined, "an unverified flight has no duration");
    assert.match(segment.reason, /flight schedule/);
    assert.match(segment.reason, /not configured/);
  }
  assert.deepEqual(
    [snapshot.majorTransport.outbound.origin, snapshot.majorTransport.outbound.destination],
    ["서울", "후쿠오카"]
  );
  assert.deepEqual(
    [snapshot.majorTransport.inbound.origin, snapshot.majorTransport.inbound.destination],
    ["후쿠오카", "서울"]
  );
});

test("Distance Matrix collector splits large location sets into bounded requests", async () => {
  const places = Array.from({ length: 19 }, (_, index) => ({
    id: `place-${index}`,
    coordinates: { latitude: 35 + index / 1000, longitude: 129 },
  }));
  const { fetchImpl, calls } = stubFetch((url) => matrixBody(url));
  const collector = createGoogleDistanceMatrixCollector({ apiKey: "test-key", fetchImpl });

  const snapshot = await collector.collect(TRIP, places);

  assert.ok(calls.length > 1, "20 locations exceed the 100-element request limit");
  for (const call of calls) {
    const params = new URL(call.url).searchParams;
    const elements = params.get("origins").split("|").length * params.get("destinations").split("|").length;
    assert.ok(elements <= 100, `request had ${elements} elements`);
  }
  assert.equal(Object.keys(snapshot.matrix).length, 20 * 19);
});

test("Distance Matrix collector fetches independent chunks concurrently", async () => {
  const places = Array.from({ length: 19 }, (_, index) => ({
    id: `place-${index}`,
    coordinates: { latitude: 35 + index / 1000, longitude: 129 },
  }));
  let active = 0;
  let maxActive = 0;
  const fetchImpl = async (url) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return { ok: true, status: 200, json: async () => matrixBody(String(url)) };
  };

  await createGoogleDistanceMatrixCollector({ apiKey: "test-key", fetchImpl }).collect(TRIP, places);

  assert.ok(maxActive > 1);
});

test("Distance Matrix collector rejects more locations than the API bound allows", async () => {
  const places = Array.from({ length: 25 }, (_, index) => ({
    id: `place-${index}`,
    coordinates: { latitude: 35 + index / 1000, longitude: 129 },
  }));
  const collector = createGoogleDistanceMatrixCollector({ apiKey: "test-key", fetchImpl: async () => ({}) });

  await assert.rejects(collector.collect(TRIP, places), RangeError);
});

test("Distance Matrix collector throws instead of fabricating an unroutable leg", async () => {
  const { fetchImpl } = stubFetch((url) => matrixBody(url, { elementStatus: "ZERO_RESULTS" }));
  const collector = createGoogleDistanceMatrixCollector({ apiKey: "test-key", fetchImpl });

  await assert.rejects(collector.collect(TRIP, PLACES), /hotel -> beach/);
});

test("Distance Matrix collector surfaces API level errors", async () => {
  const { fetchImpl } = stubFetch((url) => matrixBody(url, { status: "REQUEST_DENIED" }));
  const collector = createGoogleDistanceMatrixCollector({ apiKey: "test-key", fetchImpl });

  await assert.rejects(collector.collect(TRIP, PLACES), /REQUEST_DENIED/);
});

test("Distance Matrix collector requires base coordinates and place coordinates", async () => {
  const collector = createGoogleDistanceMatrixCollector({ apiKey: "test-key", fetchImpl: async () => ({}) });

  await assert.rejects(collector.collect({ ...TRIP, latitude: undefined }, PLACES), /latitude/);
  await assert.rejects(
    collector.collect(TRIP, [{ id: "beach" }]),
    /beach/
  );
});
