// Google Maps Platform travel-time evidence collector.
// Distance Matrix API: https://developers.google.com/maps/documentation/distance-matrix/distance-matrix
const DEFAULT_ENDPOINT = "https://maps.googleapis.com/maps/api/distancematrix/json";
// API quotas: at most 25 origins, 25 destinations and 100 elements per request.
const MAX_LOCATIONS = 25;
const MAX_ELEMENTS_PER_REQUEST = 100;

function finiteCoordinate(value, fieldName, limit) {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > limit) {
    throw new TypeError(`${fieldName} must be a finite number between -${limit} and ${limit}`);
  }
  return number;
}

function locationId(value, fieldName) {
  const id = String(value || "").trim();
  // `|` separates the two ids inside a matrix key, so it would make lookups ambiguous.
  if (!id || id.includes("|")) throw new TypeError(`${fieldName} must be a non-empty id without "|"`);
  return id;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function publicUrl(url) {
  const copy = new URL(url);
  copy.searchParams.delete("key");
  return copy.toString();
}

function toLocations(trip, places) {
  const base = {
    id: locationId(trip?.baseLocationId, "trip.baseLocationId"),
    coordinate: `${finiteCoordinate(trip?.latitude, "trip.latitude", 90)},${finiteCoordinate(trip?.longitude, "trip.longitude", 180)}`,
  };
  const rest = (places || []).map((place) => {
    const id = locationId(place?.id, "place.id");
    const latitude = finiteCoordinate(place?.coordinates?.latitude, `place ${id} latitude`, 90);
    const longitude = finiteCoordinate(place?.coordinates?.longitude, `place ${id} longitude`, 180);
    return { id, coordinate: `${latitude},${longitude}` };
  });

  const locations = [base, ...rest];
  if (new Set(locations.map((location) => location.id)).size !== locations.length) {
    throw new TypeError("location ids must be unique");
  }
  if (locations.length > MAX_LOCATIONS) {
    throw new RangeError(`Distance Matrix accepts at most ${MAX_LOCATIONS} locations per collection`);
  }
  return locations;
}

// Transit results depend on the departure moment, so convert the first planned local morning
// to an epoch using the destination timezone returned by the weather collector.
function zonedDateTimeSeconds(date, time, timezone) {
  const target = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(target)) return null;
  let guess = target;
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const parts = Object.fromEntries(
        formatter.formatToParts(new Date(guess)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
      );
      const represented = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second)
      );
      guess += target - represented;
    }
    return Math.floor(guess / 1000);
  } catch {
    throw new TypeError(`trip.timezone is not a valid IANA timezone: ${timezone}`);
  }
}

function departureTimeSeconds(trip, now) {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(trip?.startDate || ""))) return nowSeconds;
  const time = /^\d{2}:\d{2}$/.test(String(trip?.dailyStartTime || "")) ? trip.dailyStartTime : "09:00";
  const departure = zonedDateTimeSeconds(trip.startDate, time, trip.timezone || "UTC");
  if (departure === null) return nowSeconds;
  // The API rejects departure times in the past.
  return Math.max(nowSeconds, departure);
}

export function createGoogleDistanceMatrixCollector({
  apiKey = process.env.GOOGLE_MAPS_API_KEY,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  endpoint = DEFAULT_ENDPOINT,
  timeoutMs = 10_000,
  mode = "transit",
  language = "ko",
} = {}) {
  const key = String(apiKey || "").trim();
  if (!key) throw new TypeError("Google Maps API key is required (pass apiKey or set GOOGLE_MAPS_API_KEY)");
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");

  return {
    async collect(trip, places) {
      const locations = toLocations(trip, places);
      const departureTime = departureTimeSeconds(trip, now());
      const destinationSize = Math.min(MAX_LOCATIONS, locations.length);
      const originSize = Math.max(1, Math.floor(MAX_ELEMENTS_PER_REQUEST / destinationSize));

      const requests = [];
      for (const destinationChunk of chunk(locations, destinationSize)) {
        for (const originChunk of chunk(locations, originSize)) {
          const url = new URL(endpoint);
          url.searchParams.set("origins", originChunk.map((location) => location.coordinate).join("|"));
          url.searchParams.set("destinations", destinationChunk.map((location) => location.coordinate).join("|"));
          url.searchParams.set("mode", mode);
          url.searchParams.set("language", language);
          url.searchParams.set("departure_time", String(departureTime));
          url.searchParams.set("key", key);
          requests.push({ url, originChunk, destinationChunk });
        }
      }

      const batches = await Promise.all(requests.map(async ({ url, originChunk, destinationChunk }) => {
          const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
          if (!response.ok) throw new Error(`Distance Matrix request failed: ${response.status || "unknown"}`);
          const body = await response.json();
          if (body?.status !== "OK") throw new Error(`Distance Matrix request failed: ${body?.status || "unknown"}`);
          const rows = body.rows;
          if (!Array.isArray(rows) || rows.length !== originChunk.length) {
            throw new Error("Distance Matrix response rows do not match the requested origins");
          }
          return { rows, originChunk, destinationChunk };
      }));

      const matrix = {};
      for (const { rows, originChunk, destinationChunk } of batches) {
          originChunk.forEach((origin, originIndex) => {
            const elements = rows[originIndex]?.elements;
            if (!Array.isArray(elements) || elements.length !== destinationChunk.length) {
              throw new Error(`Distance Matrix response is missing elements for ${origin.id}`);
            }
            destinationChunk.forEach((destination, destinationIndex) => {
              if (origin.id === destination.id) return;
              const element = elements[destinationIndex];
              const seconds = Number(element?.duration?.value);
              if (element?.status !== "OK" || !Number.isFinite(seconds) || seconds < 0) {
                throw new Error(
                  `Distance Matrix has no ${mode} duration for ${origin.id} -> ${destination.id}: ${element?.status || "unknown"}`
                );
              }
              matrix[`${origin.id}|${destination.id}`] = Math.round(seconds / 60);
            });
          });
      }
      let majorLeg;
      const origin = String(trip?.departure || "").trim();
      const destination = String(trip?.destination || "").trim();
      if (origin && destination && trip?.destinationLatitude !== undefined && trip?.destinationLongitude !== undefined) {
        if (origin.includes("|")) {
          majorLeg = { status: "unavailable", origin, destination, mode, reason: "departure must not contain |" };
        } else if (trip.transportPref === "flight") {
          majorLeg = { status: "unavailable", origin, destination, mode: "flight", reason: "air travel is not supported by Distance Matrix" };
        } else {
          const majorUrl = new URL(endpoint);
          majorUrl.searchParams.set("origins", origin);
          majorUrl.searchParams.set(
            "destinations",
            `${finiteCoordinate(trip.destinationLatitude, "trip.destinationLatitude", 90)},${finiteCoordinate(trip.destinationLongitude, "trip.destinationLongitude", 180)}`
          );
          majorUrl.searchParams.set("mode", mode);
          majorUrl.searchParams.set("language", language);
          majorUrl.searchParams.set("departure_time", String(departureTime));
          majorUrl.searchParams.set("key", key);
          try {
            const response = await fetchImpl(majorUrl, { signal: AbortSignal.timeout(timeoutMs) });
            if (!response.ok) throw new Error(`request failed: ${response.status || "unknown"}`);
            const body = await response.json();
            const element = body?.rows?.[0]?.elements?.[0];
            const seconds = Number(element?.duration?.value);
            if (body?.status !== "OK" || element?.status !== "OK" || !Number.isFinite(seconds) || seconds < 0) {
              throw new Error(`route unavailable: ${element?.status || body?.status || "unknown"}`);
            }
            majorLeg = { status: "verified", origin, destination, mode, durationMinutes: Math.round(seconds / 60) };
          } catch (error) {
            majorLeg = { status: "unavailable", origin, destination, mode, reason: String(error?.message || error) };
          }
        }
      }
      const fetchedAt = now();

      return {
        source: "google-distance-matrix",
        sourceUrl: publicUrl(requests.at(-1)?.url || new URL(endpoint)),
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: new Date(fetchedAt.getTime() + 60 * 60 * 1000).toISOString(),
        status: "verified",
        confidence: "high",
        mode,
        matrix,
        majorLeg,
      };
    },
  };
}
