const DAY_MS = 24 * 60 * 60 * 1000;

// The search is bounded and approximate: these caps are what keeps the state space finite. They
// are reported with the plan (searchDiagnostics) rather than presented as a global optimum.
const PLACE_CANDIDATE_LIMIT = 50;
const PLANNING_DAY_LIMIT = 31;
const DAY_ROUTE_FRONTIER_LIMIT = 128;
const DAY_ROUTE_SCARCE_RESERVE = 32;
const DAY_CANDIDATE_OBJECTIVE_LIMIT = 32;
const DAY_CANDIDATE_SCARCE_RESERVE = 32;
const TRIP_FRONTIER_LIMIT = 32;

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
  // whole minutes only: a fractional buffer would leak into formatTime as "10:30.5"
  if (!Number.isInteger(number) || number < 0) {
    throw new TypeError(`${fieldName} must be a non-negative finite number of whole minutes`);
  }
  return number;
}

function clampToDay(minutes, dailyStart, dailyEnd) {
  return Math.min(Math.max(minutes, dailyStart), dailyEnd);
}

// Preferred windows and break windows are soft/hard scheduling hints, but a malformed one is a
// caller bug: reject it here rather than dropping it and planning against a silently smaller set.
function parseWindows(value, fieldName, { requireKind = false } = {}) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new TypeError(`${fieldName} must be an array of local time windows`);
  const windows = value.map((window, index) => {
    const label = `${fieldName}[${index}]`;
    const start = parseTime(window?.start, `${label}.start`);
    const end = parseTime(window?.end, `${label}.end`);
    if (end <= start) throw new RangeError(`${label}.end must be after ${label}.start`);
    if (!requireKind) return { start, end };
    const kind = String(window?.kind || "").trim();
    if (!kind) throw new TypeError(`${label}.kind must be a non-empty string`);
    return { start, end, kind };
  });
  return windows.sort((left, right) => left.start - right.start);
}

export function buildTripDays(input) {
  const start = parseDate(input.startDate, "startDate");
  const end = parseDate(input.endDate, "endDate");
  const dayCount = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (dayCount < 1) throw new RangeError("endDate must be on or after startDate");
  if (dayCount > PLANNING_DAY_LIMIT) throw new RangeError(`planning horizon is ${PLANNING_DAY_LIMIT} calendar days`);

  const dailyStart = parseTime(input.dailyStartTime || "09:00", "dailyStartTime");
  const dailyEnd = parseTime(input.dailyEndTime || "21:00", "dailyEndTime");
  if (dailyEnd <= dailyStart) throw new RangeError("dailyEndTime must be after dailyStartTime");
  const arrival = input.arrivalAt ? localDateTimeParts(input.arrivalAt, "arrivalAt") : null;
  const departure = input.departureAt ? localDateTimeParts(input.departureAt, "departureAt") : null;
  const arrivalBuffer = nonNegativeNumber(input.arrivalBufferMinutes, "arrivalBufferMinutes");
  const departureBuffer = nonNegativeNumber(input.departureBufferMinutes, "departureBufferMinutes");

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start.getTime() + index * DAY_MS).toISOString().slice(0, 10);
    const first = index === 0;
    const last = index === dayCount - 1;
    // ponytail: a boundary day with no usable time collapses to an empty window (from === until)
    // instead of aborting the whole trip; departure wins when the two constraints cross.
    const availableUntil = clampToDay(departure?.date === date ? departure.minutes - departureBuffer : dailyEnd, dailyStart, dailyEnd);
    const availableFrom = Math.min(clampToDay(arrival?.date === date ? arrival.minutes + arrivalBuffer : dailyStart, dailyStart, dailyEnd), availableUntil);
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

// A break is protected time: only a meal place may sit inside a meal break, and every other
// break kind stays blocked for everyone, meals included.
function breakBlocks(breakWindow, place) {
  return !(breakWindow.kind === "meal" && place.category === "meal");
}

// Breaks are sorted by start and the cursor only ever moves forward, so one pass settles chained
// breaks: an activity pushed out of lunch is re-checked against every later break.
function shiftPastBreaks(start, duration, breaks, place) {
  let current = start;
  for (const window of breaks) {
    if (!breakBlocks(window, place)) continue;
    if (current < window.end && current + duration > window.start) current = window.end;
  }
  return current;
}

// A preferred window is honoured on the start time, so the alternatives worth exploring are the
// earliest feasible start plus the first start inside each still-reachable preferred window.
function scheduleOptions({ place, date, cursor, previousLocationId, baseLocationId, availableUntil, breaks, travelMinutes }) {
  const hours = place.openingHours?.[date];
  if (!hours) return [];
  const travel = travelDuration(travelMinutes, previousLocationId, place.id);
  const returnTravel = travelDuration(travelMinutes, place.id, baseLocationId);
  if (travel === null) return [];

  const open = parseTime(hours.open, `openingHours.${date}.open`);
  const close = parseTime(hours.close, `openingHours.${date}.close`);
  const duration = Number(place.durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const preferred = place.preferredWindowMinutes || [];
  const earliest = Math.max(cursor + travel, open);
  const starts = new Set([earliest]);
  for (const window of preferred) {
    if (window.start > earliest) starts.add(window.start);
  }

  const optionsByStart = new Map();
  for (const candidate of starts) {
    const start = shiftPastBreaks(candidate, duration, breaks, place);
    const end = start + duration;
    if (end > close || end > availableUntil) continue;
    if (optionsByStart.has(start)) continue;
    optionsByStart.set(start, {
      place,
      travel,
      returnTravel,
      canReturnToBase: returnTravel !== null && end + returnTravel <= availableUntil,
      start,
      end,
      preferredWindowMiss: preferred.length > 0 && !preferred.some((window) => start >= window.start && start < window.end) ? 1 : 0,
    });
  }
  return [...optionsByStart.values()];
}

// The cheapest known hop in or out of a place: any real schedule pays at least this much around it,
// so using it keeps the feasibility check from ruling out a date some route could still use.
function cheapestTravel(placeId, neighbourIds, travelMinutes, incoming) {
  let cheapest = null;
  for (const neighbourId of neighbourIds) {
    if (neighbourId === placeId) continue;
    const minutes = incoming
      ? travelDuration(travelMinutes, neighbourId, placeId)
      : travelDuration(travelMinutes, placeId, neighbourId);
    if (minutes === null) continue;
    if (cheapest === null || minutes < cheapest) cheapest = minutes;
  }
  return cheapest;
}

// Optimistic by design: opening hours, the usable day window, a positive duration and the cheapest
// known travel evidence are the only inputs, and a date only drops out when no schedule at all
// could use it. A surviving date is never proof that the place actually fits.
function isOptimisticallyFeasible(place, day, minTravelIn, minTravelOut) {
  if (minTravelIn === null || minTravelOut === null) return false;
  const hours = place.openingHours?.[day.date];
  if (!hours) return false;
  const duration = Number(place.durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) return false;
  const open = parseTime(hours.open, `openingHours.${day.date}.open`);
  const close = parseTime(hours.close, `openingHours.${day.date}.close`);
  const availableFrom = parseTime(day.availableFrom, "availableFrom");
  const availableUntil = parseTime(day.availableUntil, "availableUntil");
  const end = Math.max(availableFrom + minTravelIn, open) + duration;
  return end <= close && end + minTravelOut <= availableUntil;
}

// A place whose last feasible date is this day is scarce here: skipping it now loses it for good.
function optimisticDateFeasibility({ places, days, baseLocationId, travelMinutes }) {
  const neighbourIds = [baseLocationId, ...places.map((place) => place.id)];
  const lastFeasibleDayIndex = new Map();
  const scarcePlaceIdsByDay = days.map(() => new Set());
  for (const place of places) {
    const minTravelIn = cheapestTravel(place.id, neighbourIds, travelMinutes, true);
    const minTravelOut = cheapestTravel(place.id, neighbourIds, travelMinutes, false);
    const lastIndex = days.reduce(
      (last, day, index) => (isOptimisticallyFeasible(place, day, minTravelIn, minTravelOut) ? index : last),
      -1
    );
    lastFeasibleDayIndex.set(place.id, lastIndex);
    if (lastIndex >= 0) scarcePlaceIdsByDay[lastIndex].add(place.id);
  }
  return { lastFeasibleDayIndex, scarcePlaceIdsByDay };
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
  if (left.preferredWindowMisses !== right.preferredWindowMisses) {
    return left.preferredWindowMisses - right.preferredWindowMisses;
  }
  const leftTravel = left.travel + (left.options.at(-1)?.returnTravel || 0);
  const rightTravel = right.travel + (right.options.at(-1)?.returnTravel || 0);
  if (leftTravel !== rightTravel) return leftTravel - rightTravel;
  return left.options.map((option) => option.place.id).join("|").localeCompare(right.options.map((option) => option.place.id).join("|"));
}

// Pruning priority, not the objective: a schedule that consumes a place no later day can take
// looks weak by score and is exactly what a pure-objective cut throws away.
function compareScarceFirst(left, right) {
  if (left.scarceCount !== right.scarceCount) return right.scarceCount - left.scarceCount;
  return compareScheduleStates(left, right);
}

// `states` must already be ordered by the objective: the best of them survive, and a small bounded
// reserve behind them is kept for scarce-day diversity.
function keepWithScarceReserve(states, objectiveLimit, scarceReserve) {
  const kept = states.slice(0, objectiveLimit);
  const keptStates = new Set(kept);
  const reserve = states
    .filter((state) => state.scarceCount > 0 && !keptStates.has(state))
    .sort(compareScarceFirst)
    .slice(0, scarceReserve);
  return [...kept, ...reserve];
}

function dayScheduleCandidates({ day, places, baseLocationId, breaks, travelMinutes, scarcePlaceIds }) {
  const availableFrom = parseTime(day.availableFrom, "availableFrom");
  const availableUntil = parseTime(day.availableUntil, "availableUntil");
  let frontier = [{ cursor: availableFrom, previousLocationId: baseLocationId, options: [], selected: new Set(), requiredCount: 0, score: 0, preferredWindowMisses: 0, travel: 0, scarceCount: 0 }];
  const candidates = [...frontier];
  let maxRouteFrontier = frontier.length;

  for (let depth = 0; depth < places.length && frontier.length > 0; depth += 1) {
    const next = [];
    for (const state of frontier) {
      for (const place of places) {
        if (state.selected.has(place.id)) continue;
        const options = scheduleOptions({
          place,
          date: day.date,
          cursor: state.cursor,
          previousLocationId: state.previousLocationId,
          baseLocationId,
          availableUntil,
          breaks,
          travelMinutes,
        });
        for (const option of options) {
          next.push({
            cursor: option.end,
            previousLocationId: place.id,
            options: [...state.options, option],
            selected: new Set([...state.selected, place.id]),
            requiredCount: state.requiredCount + (place.required ? 1 : 0),
            score: state.score + Number(place.score || 0),
            preferredWindowMisses: state.preferredWindowMisses + option.preferredWindowMiss,
            travel: state.travel + option.travel,
            scarceCount: state.scarceCount + (scarcePlaceIds.has(place.id) ? 1 : 0),
          });
        }
      }
    }
    next.sort(compareScheduleStates);
    frontier = keepWithScarceReserve(next, DAY_ROUTE_FRONTIER_LIMIT - DAY_ROUTE_SCARCE_RESERVE, DAY_ROUTE_SCARCE_RESERVE);
    maxRouteFrontier = Math.max(maxRouteFrontier, frontier.length);
    candidates.push(...frontier.filter((state) => state.options.at(-1)?.canReturnToBase));
  }

  const bestByPlaceSet = new Map();
  for (const candidate of candidates) {
    const key = [...candidate.selected].sort().join("|");
    const current = bestByPlaceSet.get(key);
    if (!current || compareScheduleStates(candidate, current) < 0) bestByPlaceSet.set(key, candidate);
  }
  const ranked = [...bestByPlaceSet.values()].sort(compareScheduleStates);
  return {
    schedules: keepWithScarceReserve(ranked, DAY_CANDIDATE_OBJECTIVE_LIMIT, DAY_CANDIDATE_SCARCE_RESERVE),
    maxRouteFrontier,
  };
}

// Coverage and value stay ahead of everything else; day shape is only allowed to break ties
// between schedules that already carry the same required places, score and place set.
function compareTripStates(left, right) {
  if (left.requiredCount !== right.requiredCount) return right.requiredCount - left.requiredCount;
  if (left.score !== right.score) return right.score - left.score;
  if (left.selected.size !== right.selected.size) return right.selected.size - left.selected.size;
  if (left.emptyUsableDays !== right.emptyUsableDays) return left.emptyUsableDays - right.emptyUsableDays;
  if (left.activityImbalance !== right.activityImbalance) return left.activityImbalance - right.activityImbalance;
  if (left.preferredWindowMisses !== right.preferredWindowMisses) {
    return left.preferredWindowMisses - right.preferredWindowMisses;
  }
  if (left.travel !== right.travel) return left.travel - right.travel;
  return [...left.selected].join("|").localeCompare([...right.selected].join("|"));
}

// An optimistic view of what a partial trip could still reach: every unselected place that has a
// feasible date left is assumed to be takeable. It only decides which states survive the beam and
// never reaches the reported plan, so overshooting is safe and undershooting would not be.
function withTripBounds(state, dayIndex, places, lastFeasibleDayIndex) {
  let requiredUpperBound = state.requiredCount;
  let scoreUpperBound = state.score;
  let selectedCountUpperBound = state.selected.size;
  for (const place of places) {
    if (state.selected.has(place.id)) continue;
    if (lastFeasibleDayIndex.get(place.id) <= dayIndex) continue;
    if (place.required) requiredUpperBound += 1;
    scoreUpperBound += Math.max(0, Number(place.score || 0));
    selectedCountUpperBound += 1;
  }
  return { ...state, requiredUpperBound, scoreUpperBound, selectedCountUpperBound };
}

// Coverage is compared the same way here as in the objective, only optimistically: a state holding
// fewer places but still able to reach more of them must outlive a state that already spent the
// places a later day could have used. Zero-score places move this bound and nothing above it.
function compareTripBeamStates(left, right) {
  if (left.requiredUpperBound !== right.requiredUpperBound) {
    return right.requiredUpperBound - left.requiredUpperBound;
  }
  if (left.scoreUpperBound !== right.scoreUpperBound) return right.scoreUpperBound - left.scoreUpperBound;
  if (left.selectedCountUpperBound !== right.selectedCountUpperBound) {
    return right.selectedCountUpperBound - left.selectedCountUpperBound;
  }
  return compareTripStates(left, right);
}

// A boundary day whose arrival or departure leaves no usable window is not an empty day anyone
// could have filled, so it must not drag the distribution around.
function usableActivityCounts(days) {
  return days.filter((day) => day.availableUntil > day.availableFrom).map((day) => day.activities.length);
}

function dayDistribution(days) {
  const counts = usableActivityCounts(days);
  return {
    emptyUsableDays: counts.filter((count) => count === 0).length,
    activityImbalance: counts.length === 0 ? 0 : Math.max(...counts) - Math.min(...counts),
  };
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
      ...(selected.place.preferredWindowMinutes?.length
        ? { preferredWindowMatched: selected.preferredWindowMiss === 0 }
        : {}),
    });
    previousLocationId = selected.place.id;
  }
  return { ...day, activities };
}

export function planTrip({ trip, places = [], travelMinutes = {} }) {
  if (places.length > PLACE_CANDIDATE_LIMIT) {
    throw new RangeError(`planner accepts at most ${PLACE_CANDIDATE_LIMIT} place candidates`);
  }
  if (new Set(places.map((place) => place.id)).size !== places.length) {
    throw new TypeError("place ids must be unique");
  }
  for (const place of places) {
    if (place.score !== undefined && !Number.isFinite(Number(place.score))) {
      throw new TypeError(`${place.id}.score must be a finite number`);
    }
  }
  const preparedPlaces = places.map((place) => ({
    ...place,
    preferredWindowMinutes: parseWindows(place.preferredWindows, `${place.id}.preferredWindows`),
  }));
  const breaks = parseWindows(trip.breakWindows, "breakWindows", { requireKind: true });
  const dayTemplates = buildTripDays(trip);
  const baseLocationId = String(trip.baseLocationId || "").trim();
  if (!baseLocationId) throw new TypeError("baseLocationId is required");
  const { lastFeasibleDayIndex, scarcePlaceIdsByDay } = optimisticDateFeasibility({
    places: preparedPlaces,
    days: dayTemplates,
    baseLocationId,
    travelMinutes,
  });
  const survivors = { maxDayRouteFrontier: 0, maxDayCandidates: 0, maxTripFrontier: 0 };
  const schedulesByDayAndPlaces = new Map();
  let tripFrontier = [{ days: [], selected: new Set(), requiredCount: 0, score: 0, emptyUsableDays: 0, activityImbalance: 0, preferredWindowMisses: 0, travel: 0 }];

  for (const [dayIndex, day] of dayTemplates.entries()) {
    // Two partial trips holding the same places have identical futures, so keeping only the best
    // of each place set spends the beam on genuinely different shapes instead of duplicates.
    const bestBySelection = new Map();
    for (const tripState of tripFrontier) {
      const remaining = preparedPlaces.filter((place) => !tripState.selected.has(place.id));
      const cacheKey = `${day.date}:${remaining.map((place) => place.id).sort().join("|")}`;
      let searched = schedulesByDayAndPlaces.get(cacheKey);
      if (!searched) {
        searched = dayScheduleCandidates({
          day,
          places: remaining,
          baseLocationId,
          breaks,
          travelMinutes,
          scarcePlaceIds: scarcePlaceIdsByDay[dayIndex],
        });
        schedulesByDayAndPlaces.set(cacheKey, searched);
      }
      survivors.maxDayRouteFrontier = Math.max(survivors.maxDayRouteFrontier, searched.maxRouteFrontier);
      survivors.maxDayCandidates = Math.max(survivors.maxDayCandidates, searched.schedules.length);
      for (const schedule of searched.schedules) {
        const selected = new Set([...tripState.selected, ...schedule.selected]);
        const days = [...tripState.days, materializeDay(day, schedule, baseLocationId)];
        const candidate = {
          days,
          selected,
          requiredCount: tripState.requiredCount + schedule.requiredCount,
          score: tripState.score + schedule.score,
          ...dayDistribution(days),
          preferredWindowMisses: tripState.preferredWindowMisses + schedule.preferredWindowMisses,
          travel: tripState.travel + schedule.travel + (schedule.options.at(-1)?.returnTravel || 0),
        };
        const key = [...selected].sort().join("|");
        const current = bestBySelection.get(key);
        if (!current || compareTripStates(candidate, current) < 0) bestBySelection.set(key, candidate);
      }
    }
    tripFrontier = [...bestBySelection.values()]
      .map((state) => withTripBounds(state, dayIndex, preparedPlaces, lastFeasibleDayIndex))
      .sort(compareTripBeamStates)
      .slice(0, TRIP_FRONTIER_LIMIT);
    survivors.maxTripFrontier = Math.max(survivors.maxTripFrontier, tripFrontier.length);
  }

  const bestTrip = tripFrontier.sort(compareTripStates)[0];
  const days = bestTrip.days;
  const remaining = places.filter((place) => !bestTrip.selected.has(place.id));

  const plan = {
    days,
    // Persisted so a stored plan can still be checked against the breaks it was planned against.
    breakWindows: breaks.map((window) => ({
      start: formatTime(window.start),
      end: formatTime(window.end),
      kind: window.kind,
    })),
    scheduleQuality: {
      emptyUsableDays: bestTrip.emptyUsableDays,
      activityImbalance: bestTrip.activityImbalance,
      preferredWindowMisses: bestTrip.preferredWindowMisses,
    },
    // Reported so a reader can see this is the best schedule the bounded search reached, not the
    // best schedule that exists.
    searchDiagnostics: {
      approximate: true,
      bounds: {
        placeCandidateLimit: PLACE_CANDIDATE_LIMIT,
        planningDayLimit: PLANNING_DAY_LIMIT,
        dayRouteFrontierLimit: DAY_ROUTE_FRONTIER_LIMIT,
        dayRouteScarceReserve: DAY_ROUTE_SCARCE_RESERVE,
        dayCandidateObjectiveLimit: DAY_CANDIDATE_OBJECTIVE_LIMIT,
        dayCandidateScarceReserve: DAY_CANDIDATE_SCARCE_RESERVE,
        dayCandidateLimit: DAY_CANDIDATE_OBJECTIVE_LIMIT + DAY_CANDIDATE_SCARCE_RESERVE,
        tripFrontierLimit: TRIP_FRONTIER_LIMIT,
      },
      survivors,
    },
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
  const breaks = parseWindows(plan.breakWindows, "breakWindows", { requireKind: true });
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
      // A break is a hard constraint, so a hand-edited or stored plan must be held to it too.
      for (const window of breaks) {
        if (!breakBlocks(window, place)) continue;
        if (start >= window.end || end <= window.start) continue;
        issues.push({
          code: "BREAK_WINDOW_CONFLICT",
          date: day.date,
          activityId: activity.placeId,
          breakKind: window.kind,
          breakStart: formatTime(window.start),
          breakEnd: formatTime(window.end),
          actualStartTime: activity.startTime,
          actualEndTime: activity.endTime,
        });
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
