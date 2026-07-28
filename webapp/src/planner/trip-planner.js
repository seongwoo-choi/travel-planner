const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value, fieldName) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new TypeError(`${fieldName} must be YYYY-MM-DD`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${fieldName} must be a valid calendar date`);
  }
  return date;
}

function parseTime(value, fieldName) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) throw new TypeError(`${fieldName} must be HH:mm`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new TypeError(`${fieldName} must be a valid time`);
  return hours * 60 + minutes;
}

function localDateTimeParts(value, fieldName) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) throw new TypeError(`${fieldName} must include a local date and time`);
  parseDate(match[1], fieldName);
  return { date: match[1], minutes: parseTime(match[2], fieldName) };
}

function formatTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function nonNegativeNumber(value, fieldName) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) {
    throw new TypeError(`${fieldName} must be a non-negative finite number`);
  }
  return number;
}

export function buildTripDays(input) {
  const start = parseDate(input.startDate, "startDate");
  const end = parseDate(input.endDate, "endDate");
  const dayCount = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (dayCount < 1) throw new RangeError("endDate must be on or after startDate");
  if (dayCount > 31) throw new RangeError("planning horizon is 31 calendar days");

  const dailyStart = parseTime(input.dailyStartTime || "09:00", "dailyStartTime");
  const dailyEnd = parseTime(input.dailyEndTime || "21:00", "dailyEndTime");
  const arrival = input.arrivalAt ? localDateTimeParts(input.arrivalAt, "arrivalAt") : null;
  const departure = input.departureAt ? localDateTimeParts(input.departureAt, "departureAt") : null;
  const arrivalBuffer = nonNegativeNumber(input.arrivalBufferMinutes, "arrivalBufferMinutes");
  const departureBuffer = nonNegativeNumber(input.departureBufferMinutes, "departureBufferMinutes");

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start.getTime() + index * DAY_MS).toISOString().slice(0, 10);
    const first = index === 0;
    const last = index === dayCount - 1;
    const availableFrom = arrival?.date === date ? Math.max(dailyStart, arrival.minutes + arrivalBuffer) : dailyStart;
    const availableUntil = departure?.date === date ? Math.min(dailyEnd, departure.minutes - departureBuffer) : dailyEnd;
    if (availableFrom >= availableUntil) throw new RangeError(`${date} has no usable planning window`);
    const role = first && last ? "SINGLE_DAY" : first ? "ARRIVAL_DAY" : last ? "DEPARTURE_DAY" : "FULL_DAY";
    return {
      date,
      role,
      availableFrom: formatTime(availableFrom),
      availableUntil: formatTime(availableUntil),
      activities: [],
    };
  });
}

function travelDuration(travelMinutes, fromId, toId) {
  if (fromId === toId) return 0;
  const value = Number(travelMinutes?.[`${fromId}|${toId}`]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function scheduleOption({ place, date, cursor, previousLocationId, baseLocationId, availableUntil, travelMinutes }) {
  const hours = place.openingHours?.[date];
  if (!hours) return null;
  const travel = travelDuration(travelMinutes, previousLocationId, place.id);
  const returnTravel = travelDuration(travelMinutes, place.id, baseLocationId);
  if (travel === null) return null;

  const open = parseTime(hours.open, `openingHours.${date}.open`);
  const close = parseTime(hours.close, `openingHours.${date}.close`);
  const duration = Number(place.durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) return null;

  const start = Math.max(cursor + travel, open);
  const end = start + duration;
  if (end > close || end > availableUntil) return null;
  return {
    place,
    travel,
    returnTravel,
    canReturnToBase: returnTravel !== null && end + returnTravel <= availableUntil,
    start,
    end,
  };
}

function compareScheduleStates(left, right) {
  if (left.requiredCount !== right.requiredCount) return right.requiredCount - left.requiredCount;
  if (left.score !== right.score) return right.score - left.score;
  const length = Math.min(left.options.length, right.options.length);
  for (let index = 0; index < length; index += 1) {
    const scoreDifference = Number(right.options[index].place.score || 0) - Number(left.options[index].place.score || 0);
    if (scoreDifference !== 0) return scoreDifference;
  }
  if (left.options.length !== right.options.length) return right.options.length - left.options.length;
  const leftTravel = left.travel + (left.options.at(-1)?.returnTravel || 0);
  const rightTravel = right.travel + (right.options.at(-1)?.returnTravel || 0);
  if (leftTravel !== rightTravel) return leftTravel - rightTravel;
  return left.options.map((option) => option.place.id).join("|").localeCompare(right.options.map((option) => option.place.id).join("|"));
}

function dayScheduleCandidates({ day, places, baseLocationId, travelMinutes }) {
  const availableFrom = parseTime(day.availableFrom, "availableFrom");
  const availableUntil = parseTime(day.availableUntil, "availableUntil");
  let frontier = [{ cursor: availableFrom, previousLocationId: baseLocationId, options: [], selected: new Set(), requiredCount: 0, score: 0, travel: 0 }];
  const candidates = [...frontier];

  for (let depth = 0; depth < places.length && frontier.length > 0; depth += 1) {
    const next = [];
    for (const state of frontier) {
      for (const place of places) {
        if (state.selected.has(place.id)) continue;
        const option = scheduleOption({
          place,
          date: day.date,
          cursor: state.cursor,
          previousLocationId: state.previousLocationId,
          baseLocationId,
          availableUntil,
          travelMinutes,
        });
        if (!option) continue;
        next.push({
          cursor: option.end,
          previousLocationId: place.id,
          options: [...state.options, option],
          selected: new Set([...state.selected, place.id]),
          requiredCount: state.requiredCount + (place.required ? 1 : 0),
          score: state.score + Number(place.score || 0),
          travel: state.travel + option.travel,
        });
      }
    }
    next.sort(compareScheduleStates);
    frontier = next.slice(0, 128);
    candidates.push(...frontier.filter((state) => state.options.at(-1)?.canReturnToBase));
  }

  const bestByPlaceSet = new Map();
  for (const candidate of candidates) {
    const key = [...candidate.selected].sort().join("|");
    const current = bestByPlaceSet.get(key);
    if (!current || compareScheduleStates(candidate, current) < 0) bestByPlaceSet.set(key, candidate);
  }
  return [...bestByPlaceSet.values()].sort(compareScheduleStates).slice(0, 32);
}

function compareTripStates(left, right) {
  if (left.requiredCount !== right.requiredCount) return right.requiredCount - left.requiredCount;
  if (left.score !== right.score) return right.score - left.score;
  if (left.selected.size !== right.selected.size) return right.selected.size - left.selected.size;
  if (left.travel !== right.travel) return left.travel - right.travel;
  return [...left.selected].join("|").localeCompare([...right.selected].join("|"));
}

function materializeDay(day, schedule, baseLocationId) {
  const activities = [];
  let previousLocationId = baseLocationId;
  for (const selected of schedule.options) {
    activities.push({
      placeId: selected.place.id,
      name: selected.place.name,
      startTime: formatTime(selected.start),
      endTime: formatTime(selected.end),
      travelFromPrevious: {
        fromLocationId: previousLocationId,
        durationMinutes: selected.travel,
      },
      returnToBaseMinutes: selected.returnTravel,
    });
    previousLocationId = selected.place.id;
  }
  return { ...day, activities };
}

export function planTrip({ trip, places = [], travelMinutes = {} }) {
  if (places.length > 50) throw new RangeError("planner accepts at most 50 place candidates");
  if (new Set(places.map((place) => place.id)).size !== places.length) {
    throw new TypeError("place ids must be unique");
  }
  for (const place of places) {
    if (place.score !== undefined && !Number.isFinite(Number(place.score))) {
      throw new TypeError(`${place.id}.score must be a finite number`);
    }
  }
  const dayTemplates = buildTripDays(trip);
  const baseLocationId = String(trip.baseLocationId || "").trim();
  if (!baseLocationId) throw new TypeError("baseLocationId is required");
  const schedulesByDayAndPlaces = new Map();
  let tripFrontier = [{ days: [], selected: new Set(), requiredCount: 0, score: 0, travel: 0 }];

  for (const day of dayTemplates) {
    const next = [];
    for (const tripState of tripFrontier) {
      const remaining = places.filter((place) => !tripState.selected.has(place.id));
      const cacheKey = `${day.date}:${remaining.map((place) => place.id).sort().join("|")}`;
      let schedules = schedulesByDayAndPlaces.get(cacheKey);
      if (!schedules) {
        schedules = dayScheduleCandidates({ day, places: remaining, baseLocationId, travelMinutes });
        schedulesByDayAndPlaces.set(cacheKey, schedules);
      }
      for (const schedule of schedules) {
        const selected = new Set([...tripState.selected, ...schedule.selected]);
        next.push({
          days: [...tripState.days, materializeDay(day, schedule, baseLocationId)],
          selected,
          requiredCount: tripState.requiredCount + schedule.requiredCount,
          score: tripState.score + schedule.score,
          travel: tripState.travel + schedule.travel + (schedule.options.at(-1)?.returnTravel || 0),
        });
      }
    }
    next.sort(compareTripStates);
    tripFrontier = next.slice(0, 32);
  }

  const bestTrip = tripFrontier.sort(compareTripStates)[0];
  const days = bestTrip.days;
  const remaining = places.filter((place) => !bestTrip.selected.has(place.id));

  const plan = {
    days,
    unscheduledPlaceIds: remaining.map((place) => place.id),
    verificationTasks: remaining
      .filter((place) => place.required)
      .map((place) => ({
        code: "REQUIRED_PLACE_UNSCHEDULED",
        placeId: place.id,
        message: `${place.name || place.id} cannot be scheduled without violating current constraints`,
      })),
  };
  plan.validation = validateTripPlan({ plan, places, travelMinutes });
  return plan;
}

export function validateTripPlan({ plan, places = [], travelMinutes = {} }) {
  const issues = [];
  const placesById = new Map(places.map((place) => [place.id, place]));
  for (const day of plan.days || []) {
    const activities = day.activities || [];
    for (const activity of activities) {
      const start = parseTime(activity.startTime, "activity.startTime");
      const end = parseTime(activity.endTime, "activity.endTime");
      const availableFrom = parseTime(day.availableFrom, "day.availableFrom");
      const availableUntil = parseTime(day.availableUntil, "day.availableUntil");
      if (start < availableFrom || end > availableUntil) {
        issues.push({
          code: "DAY_WINDOW_CONFLICT",
          date: day.date,
          activityId: activity.placeId,
          availableFrom: day.availableFrom,
          availableUntil: day.availableUntil,
          actualStartTime: activity.startTime,
          actualEndTime: activity.endTime,
        });
      }
      const place = placesById.get(activity.placeId);
      if (!place) {
        issues.push({ code: "UNKNOWN_PLACE", date: day.date, activityId: activity.placeId });
        continue;
      }
      const hours = place.openingHours?.[day.date];
      if (!hours) {
        issues.push({ code: "MISSING_OPENING_HOURS", date: day.date, activityId: activity.placeId });
        continue;
      }
      const open = parseTime(hours.open, `openingHours.${day.date}.open`);
      const close = parseTime(hours.close, `openingHours.${day.date}.close`);
      if (start < open || end > close) {
        issues.push({
          code: "OPENING_HOURS_CONFLICT",
          date: day.date,
          activityId: activity.placeId,
          openingTime: hours.open,
          closingTime: hours.close,
          actualStartTime: activity.startTime,
          actualEndTime: activity.endTime,
        });
      }
    }
    for (let index = 1; index < activities.length; index += 1) {
      const previous = activities[index - 1];
      const current = activities[index];
      const travel = travelDuration(travelMinutes, previous.placeId, current.placeId);
      if (travel === null) {
        issues.push({
          code: "MISSING_TRAVEL_TIME",
          date: day.date,
          activityId: current.placeId,
          fromActivityId: previous.placeId,
        });
        continue;
      }
      const requiredStart = parseTime(previous.endTime, "activity.endTime") + travel;
      const actualStart = parseTime(current.startTime, "activity.startTime");
      if (actualStart < requiredStart) {
        issues.push({
          code: "TRAVEL_TIME_CONFLICT",
          date: day.date,
          activityId: current.placeId,
          requiredStartTime: formatTime(requiredStart),
          actualStartTime: current.startTime,
        });
      }
    }
  }
  return { ok: issues.length === 0, issues };
}
