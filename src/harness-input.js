const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(value, fieldName) {
  const raw = String(value || "").trim();
  const normalized = /^\d{8}$/.test(raw)
    ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
    : raw;
  const date = new Date(`${normalized}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)
    || Number.isNaN(date.getTime())
    || date.toISOString().slice(0, 10) !== normalized) {
    throw new TypeError(`${fieldName} must be YYYY-MM-DD or YYYYMMDD`);
  }
  return normalized;
}

function transportPreference(value) {
  const preference = String(value || "").trim().toLowerCase();
  if (/(flight|air|항공)/.test(preference)) return "flight";
  if (/(car|drive|자차|렌터카)/.test(preference)) return "car";
  return "transit";
}

export function normalizeHarnessRequirements(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("requirements must be a JSON object");
  }
  const destination = String(raw.destination || "").trim();
  if (!destination) throw new TypeError("destination is required");
  const startDate = isoDate(raw.startDate ?? raw.start_date, "startDate");
  const explicitNights = raw.nights === undefined || raw.nights === null ? null : Number(raw.nights);
  let nights = explicitNights;
  if (nights === null) {
    const endDate = isoDate(raw.endDate ?? raw.end_date, "endDate");
    nights = Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS);
  }
  if (!Number.isInteger(nights) || nights < 0 || nights > 30) {
    throw new RangeError("nights must be an integer between 0 and 30");
  }
  const rawTravelers = raw.travelers ?? raw.passengers;
  if (!["number", "string"].includes(typeof rawTravelers)) {
    throw new TypeError("travelers must be a positive integer");
  }
  const travelers = Number(rawTravelers);
  if (!Number.isInteger(travelers) || travelers <= 0) {
    throw new RangeError("travelers must be a positive integer");
  }

  const travelStyle = Array.isArray(raw.travel_style) ? raw.travel_style.join(", ") : raw.travel_style;
  const highlights = Array.isArray(raw.highlights) ? raw.highlights.join(", ") : raw.highlights;
  return {
    destination,
    country: String(raw.country || "").trim() || undefined,
    origin: String(raw.origin ?? raw.departure ?? "").trim() || undefined,
    startDate,
    nights,
    travelers,
    companions: String(raw.companions ?? raw.party_type ?? raw.trip_type ?? "").trim() || undefined,
    tripType: String(raw.tripType ?? travelStyle ?? "").trim() || undefined,
    accommodation: String(raw.accommodation || "").trim() || undefined,
    budgetPerPerson: raw.budgetPerPerson ?? raw.budget_per_person ?? undefined,
    transportPref: transportPreference(raw.transportPref ?? raw.transport_pref),
    highlights: String(highlights || "").trim() || undefined,
    arrivalTime: String(raw.arrivalTime ?? raw.arrival_time ?? "").trim() || undefined,
    departureTime: String(raw.departureTime ?? raw.departure_time ?? "").trim() || undefined,
  };
}
