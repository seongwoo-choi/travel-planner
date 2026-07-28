const DEFAULT_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const DAILY_FIELDS = [
  "precipitation_probability_max",
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
].join(",");

function finiteCoordinate(value, fieldName, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new TypeError(`${fieldName} must be between ${min} and ${max}`);
  }
  return number;
}

function valueAt(values, index) {
  const value = Number(values?.[index]);
  return Number.isFinite(value) ? value : null;
}

export function createOpenMeteoWeatherCollector({
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  endpoint = DEFAULT_ENDPOINT,
  timeoutMs = 10_000,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");

  return {
    async collect(trip) {
      const latitude = finiteCoordinate(trip.latitude, "latitude", -90, 90);
      const longitude = finiteCoordinate(trip.longitude, "longitude", -180, 180);
      const requestedTimezone = String(trip.timezone || "auto");
      const url = new URL(endpoint);
      url.searchParams.set("latitude", String(latitude));
      url.searchParams.set("longitude", String(longitude));
      url.searchParams.set("start_date", trip.startDate);
      url.searchParams.set("end_date", trip.endDate);
      url.searchParams.set("timezone", requestedTimezone);
      url.searchParams.set("daily", DAILY_FIELDS);

      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`Open-Meteo request failed: ${response.status || "unknown"}`);
      const body = await response.json();
      const dates = body?.daily?.time;
      if (!Array.isArray(dates)) throw new Error("Open-Meteo response is missing daily.time");
      const resolvedTimezone = body.timezone || (requestedTimezone !== "auto" ? requestedTimezone : null);
      if (!resolvedTimezone) throw new Error("Open-Meteo response is missing the resolved timezone");
      const fetchedAt = now();

      return {
        source: "open-meteo",
        sourceUrl: url.toString(),
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: new Date(fetchedAt.getTime() + 60 * 60 * 1000).toISOString(),
        status: "verified",
        confidence: "high",
        timezone: String(resolvedTimezone),
        days: dates.map((date, index) => ({
          date,
          precipitationProbability: valueAt(body.daily.precipitation_probability_max, index),
          weatherCode: valueAt(body.daily.weather_code, index),
          temperatureMax: valueAt(body.daily.temperature_2m_max, index),
          temperatureMin: valueAt(body.daily.temperature_2m_min, index),
        })),
      };
    },
  };
}
