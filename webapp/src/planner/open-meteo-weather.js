const DEFAULT_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const DAILY_FIELDS = [
  "precipitation_probability_max",
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
].join(",");

// Open-Meteo answers 16 calendar days counting today, so today + 15 is the last date a dated
// request can name. A trip past it is not a provider failure — the forecast simply does not exist
// yet — so the horizon is modelled here rather than discovered as an HTTP error.
export const FORECAST_HORIZON_DAYS = 16;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseTripDate(value, fieldName) {
  const date = String(value || "");
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
  if (Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date) {
    throw new TypeError(`${fieldName} must be a valid YYYY-MM-DD date`);
  }
  return date;
}

function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function datesBetween(startDate, endDate) {
  const dates = [];
  for (let date = startDate; date <= endDate; date = shiftDate(date, 1)) dates.push(date);
  return dates;
}

// The 16 days the provider publishes are calendar days at the destination, so the horizon counts
// from the date it is there: reading it off the UTC clock puts it a day out for most of every day.
// `auto` names no zone to count in — the service resolves one before collect, and a direct caller
// gets the deterministic UTC reading rather than a guess. An unusable zone is rejected by the trip
// boundary and by the provider, so the horizon must not be what throws first.
function localToday(timezone, nowDate) {
  if (timezone === "auto") return nowDate.toISOString().slice(0, 10);
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(nowDate);
  } catch {
    return nowDate.toISOString().slice(0, 10);
  }
}

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
    // The timezone is knowable even when the forecast is not: a start date beyond the forecast
    // horizon rejects the dated request, so ask for the current range only and keep the trip dates out.
    async resolveTimezone(trip) {
      const requestedTimezone = String(trip.timezone || "auto");
      if (requestedTimezone !== "auto") {
        return { timezone: requestedTimezone, source: "trip", fetchedAt: now().toISOString() };
      }
      const url = new URL(endpoint);
      url.searchParams.set("latitude", String(finiteCoordinate(trip.latitude, "latitude", -90, 90)));
      url.searchParams.set("longitude", String(finiteCoordinate(trip.longitude, "longitude", -180, 180)));
      url.searchParams.set("timezone", "auto");
      url.searchParams.set("current", "temperature_2m");

      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`Open-Meteo timezone request failed: ${response.status || "unknown"}`);
      const body = await response.json();
      const timezone = String(body?.timezone || "").trim();
      if (!timezone) throw new Error("Open-Meteo response is missing the resolved timezone");

      return { timezone, source: "open-meteo", sourceUrl: url.toString(), fetchedAt: now().toISOString() };
    },

    async collect(trip) {
      const latitude = finiteCoordinate(trip.latitude, "latitude", -90, 90);
      const longitude = finiteCoordinate(trip.longitude, "longitude", -180, 180);
      const requestedTimezone = String(trip.timezone || "auto");
      const startDate = parseTripDate(trip.startDate, "startDate");
      const endDate = parseTripDate(trip.endDate, "endDate");
      if (endDate < startDate) throw new RangeError("endDate must be on or after startDate");

      const fetchedAtDate = now();
      const horizonEnd = shiftDate(localToday(requestedTimezone, fetchedAtDate), FORECAST_HORIZON_DAYS - 1);
      // The trip only becomes fully forecastable once its last day is inside the horizon.
      const refreshAfter = shiftDate(endDate, -(FORECAST_HORIZON_DAYS - 1));
      if (startDate > horizonEnd) {
        return {
          source: "open-meteo",
          fetchedAt: fetchedAtDate.toISOString(),
          status: "forecast_horizon",
          confidence: "low",
          horizonDays: FORECAST_HORIZON_DAYS,
          horizonEnd,
          days: [],
          missingDates: datesBetween(startDate, endDate),
          refreshAfter,
        };
      }
      const requestedEndDate = endDate > horizonEnd ? horizonEnd : endDate;
      const missingDates = endDate > horizonEnd ? datesBetween(shiftDate(horizonEnd, 1), endDate) : [];

      const url = new URL(endpoint);
      url.searchParams.set("latitude", String(latitude));
      url.searchParams.set("longitude", String(longitude));
      url.searchParams.set("start_date", startDate);
      url.searchParams.set("end_date", requestedEndDate);
      url.searchParams.set("timezone", requestedTimezone);
      url.searchParams.set("daily", DAILY_FIELDS);

      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`Open-Meteo request failed: ${response.status || "unknown"}`);
      const body = await response.json();
      const dates = body?.daily?.time;
      if (!Array.isArray(dates)) throw new Error("Open-Meteo response is missing daily.time");
      const resolvedTimezone = body.timezone || (requestedTimezone !== "auto" ? requestedTimezone : null);
      if (!resolvedTimezone) throw new Error("Open-Meteo response is missing the resolved timezone");
      const fetchedAt = fetchedAtDate;

      return {
        source: "open-meteo",
        sourceUrl: url.toString(),
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: new Date(fetchedAt.getTime() + 60 * 60 * 1000).toISOString(),
        status: missingDates.length > 0 ? "partial_forecast_horizon" : "verified",
        confidence: missingDates.length > 0 ? "medium" : "high",
        horizonDays: FORECAST_HORIZON_DAYS,
        horizonEnd,
        missingDates,
        ...(missingDates.length > 0 ? { refreshAfter } : {}),
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
