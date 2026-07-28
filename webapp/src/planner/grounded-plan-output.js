const DAY_MS = 24 * 60 * 60 * 1000;

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizeGroundedTripInput(input) {
  if (!validDate(input.startDate)) throw new TypeError("startDate must be a valid YYYY-MM-DD date");
  const nights = Number(input.nights);
  if (!Number.isInteger(nights) || nights < 0 || nights > 30) {
    throw new RangeError("nights must be an integer between 0 and 30");
  }
  const start = new Date(`${input.startDate}T00:00:00Z`);
  const endDate = new Date(start.getTime() + nights * DAY_MS).toISOString().slice(0, 10);
  return {
    ...input,
    nights,
    endDate,
    baseLocationId: input.baseLocationId || "base",
    dailyStartTime: input.dailyStartTime || "09:00",
    dailyEndTime: input.dailyEndTime || "21:00",
    travelMode: input.travelMode || (input.transportPref === "car" ? "driving" : "transit"),
    timezone: input.timezone || "auto",
  };
}
function evidenceLine(label, snapshot) {
  if (!snapshot) return `- ${label}: unavailable`;
  return `- ${label}: ${snapshot.source} · ${snapshot.fetchedAt}${snapshot.status ? ` · ${snapshot.status}` : ""}`;
}

export function renderGroundedTripPlan(result, trip) {
  const weatherByDate = new Map((result.evidence?.weather?.days || []).map((day) => [day.date, day]));
  const lines = [
    `# ${trip.destination} 여행 플랜`,
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
    if (!day.activities?.length) {
      lines.push("- 배치 가능한 검증 장소 없음");
      continue;
    }
    for (const activity of day.activities) {
      const travel = activity.travelFromPrevious?.durationMinutes;
      lines.push(`- ${activity.startTime}–${activity.endTime} ${activity.name}${Number.isFinite(travel) ? ` · 이동 ${travel}분` : ""}`);
    }
  }

  const majorLeg = result.evidence?.travel?.majorLeg;
  if (majorLeg) {
    lines.push("", "## 주요 교통");
    if (majorLeg.status === "verified") {
      lines.push(`- ${majorLeg.origin} → ${majorLeg.destination} · ${majorLeg.mode} · ${majorLeg.durationMinutes}분`);
    } else {
      lines.push(`- 확인 필요: ${majorLeg.origin} → ${majorLeg.destination} · ${majorLeg.reason || "경로 없음"}`);
    }
  }

  lines.push("", "## 확인 필요");
  if (!result.plan.verificationTasks?.length) {
    lines.push("- 없음");
  } else {
    for (const task of result.plan.verificationTasks) lines.push(`- [${task.code}] ${task.message}`);
  }

  lines.push(
    "",
    "## 자동 품질 점검",
    `${result.plan.quality?.hardConstraintViolations === 0 ? "- OK" : "- 확인"} 하드 제약: ${result.plan.quality?.hardConstraintViolations ?? "미측정"}건`,
    `${result.plan.quality?.verifiedActivityRatio === 1 ? "- OK" : "- 확인"} 영업시간 검증률: ${result.plan.quality?.verifiedActivityRatio ?? "미측정"}`,
    `${result.plan.quality?.confirmationCount === 0 ? "- OK" : "- 확인"} 확인 필요: ${result.plan.quality?.confirmationCount ?? "미측정"}건`,
    "",
    "## 데이터 근거",
    evidenceLine("장소", result.evidence?.places),
    evidenceLine("날씨", result.evidence?.weather),
    evidenceLine("이동시간", result.evidence?.travel)
  );
  return lines.join("\n");
}
