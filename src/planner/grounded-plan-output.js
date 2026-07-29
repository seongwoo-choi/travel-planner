const DAY_MS = 24 * 60 * 60 * 1000;

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function localDateTime(date, value, fieldName) {
  const time = String(value ?? "").trim();
  if (!time) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new TypeError(`${fieldName} must be HH:MM`);
  return `${date}T${time}:00`;
}

// The planner reads arrival and departure as local wall-clock parts, so they are compared the same
// way here: a trip that departs before it arrives has no window to plan in and cannot be silently
// clamped into an empty one.
function localWallClock(value) {
  return String(value || "").match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)?.[0] || null;
}

// A real generated day should leave room to eat. An explicit `breakWindows: []` turns that off;
// anything else the caller supplies is passed through untouched so the planner can reject it.
export const DEFAULT_BREAK_WINDOWS = Object.freeze([
  Object.freeze({ start: "12:00", end: "13:00", kind: "meal" }),
  Object.freeze({ start: "18:00", end: "19:00", kind: "meal" }),
]);

// Getting to the destination and getting around it are different questions with different evidence:
// the local matrix is routed by Distance Matrix, the major leg may be an airline nobody here can
// verify. Only the local modes this integration actually requests are accepted.
const LOCAL_TRAVEL_MODES = ["driving", "transit"];
const MAJOR_TRANSPORT_MODES = ["driving", "transit", "flight"];

function transportMode(value, fieldName, allowed) {
  const mode = String(value).trim().toLowerCase();
  if (!allowed.includes(mode)) {
    throw new RangeError(`${fieldName} must be one of ${allowed.join(", ")} (got ${value})`);
  }
  return mode;
}

function transportModes(input) {
  const preference = String(input.transportPref || "").trim().toLowerCase();
  const legacy = preference === "flight"
    ? { major: "flight", local: "driving" }
    : preference === "car"
      ? { major: "driving", local: "driving" }
      : { major: "transit", local: "transit" };
  // `travelMode` predates the split and only ever named the local mode.
  const local = input.localTravelMode ?? input.travelMode;
  return {
    majorTransportMode: input.majorTransportMode === undefined
      ? legacy.major
      : transportMode(input.majorTransportMode, "majorTransportMode", MAJOR_TRANSPORT_MODES),
    localTravelMode: local === undefined
      ? legacy.local
      : transportMode(local, "localTravelMode", LOCAL_TRAVEL_MODES),
  };
}

export function normalizeGroundedTripInput(input) {
  if (!validDate(input.startDate)) throw new TypeError("startDate must be a valid YYYY-MM-DD date");
  const nights = Number(input.nights);
  if (!Number.isInteger(nights) || nights < 0 || nights > 30) {
    throw new RangeError("nights must be an integer between 0 and 30");
  }
  const start = new Date(`${input.startDate}T00:00:00Z`);
  const endDate = new Date(start.getTime() + nights * DAY_MS).toISOString().slice(0, 10);
  const arrivalAt = localDateTime(input.startDate, input.arrivalTime, "arrivalTime");
  const departureAt = localDateTime(endDate, input.departureTime, "departureTime");
  const { majorTransportMode, localTravelMode } = transportModes(input);
  const arrival = localWallClock(input.arrivalAt || arrivalAt);
  const departure = localWallClock(input.departureAt || departureAt);
  if (arrival && departure && arrival >= departure) {
    throw new RangeError(`departure ${departure} must be after arrival ${arrival}`);
  }
  return {
    ...input,
    nights,
    endDate,
    ...(arrivalAt && !input.arrivalAt ? { arrivalAt } : {}),
    ...(departureAt && !input.departureAt ? { departureAt } : {}),
    baseLocationId: input.baseLocationId || "base",
    dailyStartTime: input.dailyStartTime || "09:00",
    dailyEndTime: input.dailyEndTime || "21:00",
    breakWindows: input.breakWindows ?? DEFAULT_BREAK_WINDOWS,
    majorTransportMode,
    localTravelMode,
    travelMode: localTravelMode,
    timezone: input.timezone || "auto",
  };
}
function evidenceLine(label, snapshot, detail) {
  if (!snapshot) return `- ${label}: unavailable`;
  const parts = [
    detail,
    snapshot.source,
    snapshot.fetchedAt,
    snapshot.expiresAt ? `유효기한: ${snapshot.expiresAt}` : "",
    snapshot.status,
  ].filter(Boolean);
  return `- ${label}: ${parts.join(" · ")}`;
}

function tripOverviewLines(trip) {
  const lines = ["## 여행 한눈에 보기"];
  if (validDate(trip.startDate) && validDate(trip.endDate)) {
    const nights = Math.round((Date.parse(`${trip.endDate}T00:00:00Z`) - Date.parse(`${trip.startDate}T00:00:00Z`)) / DAY_MS);
    lines.push(`- 일정: ${trip.startDate} → ${trip.endDate} · ${nights}박 ${nights + 1}일`);
  }
  if (trip.travelers || trip.companions) {
    const party = [trip.travelers ? `${trip.travelers}명` : "", String(trip.companions || "").trim()].filter(Boolean);
    lines.push(`- 여행자: ${party.join(" · ")}`);
  }
  if (String(trip.tripType || "").trim()) lines.push(`- 여행 스타일: ${trip.tripType}`);
  if (String(trip.baseLocation || "").trim()) lines.push(`- 이동 기준지: ${trip.baseLocation}`);
  if (String(trip.accommodation || "").trim()) lines.push(`- 숙소 입력: ${trip.accommodation}`);
  if (Number.isFinite(Number(trip.budgetPerPerson)) && Number(trip.budgetPerPerson) > 0) {
    lines.push(`- 예산 상한: 1인 ${Number(trip.budgetPerPerson).toLocaleString("ko-KR")}원 · 사용자 입력`);
  }
  lines.push("- 비용 근거: 교통·입장료·식비 가격 데이터 미수집");
  return lines;
}

function scheduledActivities(plan) {
  const byPlaceId = new Map();
  for (const day of plan.days || []) {
    for (const activity of day.activities || []) {
      if (activity.placeId && !byPlaceId.has(activity.placeId)) byPlaceId.set(activity.placeId, { ...activity, date: day.date });
    }
  }
  return byPlaceId;
}

function openingWindow(place, date) {
  const window = place?.openingHours?.[date];
  return window?.open && window?.close ? `${window.open}–${window.close}` : null;
}

function experienceLines(result, trip) {
  const places = (result.evidence?.places?.items || []).filter(
    (place) => place?.openingHoursStatus === "verified"
  );
  if (places.length === 0) return [];
  const scheduled = scheduledActivities(result.plan);
  const lines = [];
  const highlights = places.filter((place) => place.required === true && scheduled.has(place.id)).slice(0, 3);
  if (highlights.length > 0) {
    const couple = /(여자친구|남자친구|연인|커플|배우자)/.test(String(trip.companions || ""));
    lines.push("", couple ? "## 커플 하이라이트" : "## 여행 하이라이트");
    for (const place of highlights) {
      const activity = scheduled.get(place.id);
      lines.push(`- ${activity.date} ${activity.startTime}–${activity.endTime} · ${place.name} · 사용자 지정 하이라이트`);
    }
  }

  const meals = places.filter((place) => {
    const activity = scheduled.get(place.id);
    return place.category === "meal" && activity && openingWindow(place, activity.date);
  }).slice(0, 4);
  if (meals.length > 0) {
    lines.push("", "## 식사·카페 후보");
    for (const place of meals) {
      const activity = scheduled.get(place.id);
      lines.push(`- ${place.name} · 일정 배치 ${activity.date} ${activity.startTime}–${activity.endTime} · 영업시간 ${openingWindow(place, activity.date)}`);
    }
  }

  const rainRiskDates = [...new Set((result.plan.verificationTasks || [])
    .filter((task) => task.code === "WEATHER_RISK" && validDate(task.date))
    .map((task) => task.date))];
  const indoorAlternatives = rainRiskDates.flatMap((date) => places
    .filter((place) => place.indoor === true
      && place.category !== "meal"
      && !scheduled.has(place.id)
      && openingWindow(place, date))
    .map((place) => ({ date, place }))).slice(0, 3);
  if (rainRiskDates.length > 0) {
    lines.push("", "## 우천 대안");
    if (indoorAlternatives.length === 0) {
      for (const date of rainRiskDates) {
        lines.push(`- ${date} · 검증된 실내 대안 미수집 · 재계획 필요`);
      }
    } else {
      for (const { date, place } of indoorAlternatives) {
        lines.push(`- ${date} · ${place.name} · ${place.category || "attraction"} · 실내 · 영업시간 ${openingWindow(place, date)} · 후보 · 재계획 필요`);
      }
    }
  }
  return lines;
}

export function renderGroundedTripPlan(result, trip) {
  const weatherByDate = new Map((result.evidence?.weather?.days || []).map((day) => [day.date, day]));
  const placeById = new Map((result.evidence?.places?.items || []).map((place) => [place.id, place]));
  const lines = [
    `# ${trip.destination} 여행 플랜`,
    "",
    ...tripOverviewLines(trip),
    "",
    `- 상태: ${result.status}`,
    `- 시간·영업시간 충돌: ${result.plan.validation?.issues?.length || 0}건`,
    "",
    "## 일정",
  ];

  for (const day of result.plan.days || []) {
    lines.push("", `### ${day.date} · ${day.role}`);
    const weather = weatherByDate.get(day.date);
    if (weather) {
      lines.push(`- 날씨: ${weather.temperatureMin}–${weather.temperatureMax}°C · 강수확률 ${weather.precipitationProbability}%`);
    }
    const activities = day.activities || [];
    const hasCompleteTravelEvidence = activities.every(
      (activity) => Number.isFinite(activity.travelFromPrevious?.durationMinutes)
    );
    const localTravelMinutes = hasCompleteTravelEvidence
      ? activities.reduce((total, activity) => total + activity.travelFromPrevious.durationMinutes, 0)
      : null;
    const usableWindow = day.availableFrom && day.availableUntil
      ? ` · 사용 가능 ${day.availableFrom}–${day.availableUntil}`
      : "";
    const localTravel = localTravelMinutes === null ? "미측정" : `${localTravelMinutes}분`;
    lines.push(`- 실행 요약: 활동 ${activities.length}개 · 현지 이동 ${localTravel}${usableWindow}`);
    if (!day.activities?.length) {
      lines.push("- 배치 가능한 검증 장소 없음");
      continue;
    }
    for (const activity of day.activities) {
      const travel = activity.travelFromPrevious?.durationMinutes;
      const place = placeById.get(activity.placeId);
      const hours = place?.openingHoursStatus === "verified" ? openingWindow(place, day.date) : null;
      const evidence = [
        Number.isFinite(travel) ? `이동 ${travel}분` : "",
        place?.category || "",
        hours ? `영업시간 ${hours}` : "",
        place?.sourceUrl ? `근거 ${place.sourceUrl}` : "",
      ].filter(Boolean);
      lines.push(`- ${activity.startTime}–${activity.endTime} ${activity.name}${evidence.length ? ` · ${evidence.join(" · ")}` : ""}`);
    }
  }

  lines.push(...experienceLines(result, trip));

  const travel = result.evidence?.travel;
  // A snapshot predating the local/major split described only the local matrix, so its top-level
  // mode and status are that matrix's own evidence.
  const localTransport = travel?.localTransport
    ?? (travel?.mode ? { mode: travel.mode, status: travel.status } : null);
  if (localTransport) {
    lines.push("", "## 현지 이동", `- 현지 이동 수단: ${localTransport.mode} · ${localTransport.status}`);
  }

  const majorSegments = travel?.majorTransport
    ? [["가는 편", travel.majorTransport.outbound], ["오는 편", travel.majorTransport.inbound]]
    : [["가는 편", travel?.majorLeg]];
  if (majorSegments.some(([, segment]) => segment)) {
    lines.push("", "## 주요 교통");
    for (const [label, segment] of majorSegments) {
      if (!segment) continue;
      lines.push(segment.status === "verified"
        ? `- ${label}: ${segment.origin} → ${segment.destination} · ${segment.mode} · ${segment.durationMinutes}분`
        : `- ${label}: ${segment.origin} → ${segment.destination} · ${segment.mode} · 확인 필요 — ${segment.reason || "경로 없음"}`);
    }
  }

  lines.push("", "## 확인 필요");
  if (!result.plan.verificationTasks?.length) {
    lines.push("- 없음");
  } else {
    // A task that is only waiting on a provider gets its date shown: it tells the reader when the
    // confirmation becomes possible instead of leaving it to be chased now.
    for (const task of result.plan.verificationTasks) {
      lines.push(`- [${task.code}] ${task.message}${task.refreshAfter ? ` · 재조회 가능: ${task.refreshAfter}` : ""}`);
    }
  }

  lines.push(
    "",
    "## 자동 품질 점검",
    `${result.plan.quality?.hardConstraintViolations === 0 ? "- OK" : "- 확인"} 하드 제약: ${result.plan.quality?.hardConstraintViolations ?? "미측정"}건`,
    `${result.plan.quality?.verifiedPlaceRatio === 1 ? "- OK" : "- 확인"} 영업시간 검증률: ${result.plan.quality?.verifiedPlaceRatio ?? "미측정"}`,
    `${result.plan.quality?.confirmationCount === 0 ? "- OK" : "- 확인"} 확인 필요: ${result.plan.quality?.confirmationCount ?? "미측정"}건`,
    "",
    "## 데이터 근거",
    evidenceLine("장소", result.evidence?.places),
    evidenceLine("날씨", result.evidence?.weather),
    evidenceLine("이동시간", result.evidence?.travel),
    evidenceLine("시간대", result.evidence?.timezone, result.evidence?.timezone?.timezone)
  );
  return lines.join("\n");
}
