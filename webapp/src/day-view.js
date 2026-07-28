function latestRevision(plan) {
  const revisions = Array.isArray(plan.revisions) ? plan.revisions : [];
  return revisions.find((item) => item.version === plan.latestVersion) || revisions.at(-1);
}

function truncateText(text, limit = 3000) {
  const value = String(text || "");
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 32)}\n\n...일부 내용을 줄였습니다.`;
}

function dayHeadingNumber(line) {
  const normalized = String(line || "").trim();
  const match = normalized.match(/^(?:#{1,6}\s*)?(?:[-*]\s*)?(?:day\s*(\d+)|(\d+)\s*일차)\b/i);
  if (!match) return null;
  return Number(match[1] || match[2]);
}

function toLocalDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getCurrentTripDay(plan, now = new Date()) {
  const current = toLocalDate(now);
  const start = toLocalDate(plan.startDate);
  const end = toLocalDate(plan.endDate || plan.startDate);
  const dayMs = 24 * 60 * 60 * 1000;
  const untilStart = Math.round((start - current) / dayMs);
  const day = Math.round((current - start) / dayMs) + 1;
  const lastDay = Math.max(1, Number(plan.nights || 1) + 1);

  if (untilStart > 0) return { day: 1, status: "before", label: `D-${untilStart}` };
  if (current > end) return { day: lastDay, status: "after", label: "완료" };
  return { day: Math.max(1, day), status: "active", label: `${Math.max(1, day)}일차` };
}

export function getTripDayForDate(plan, dateValue) {
  const selected = toLocalDate(dateValue);
  const start = toLocalDate(plan.startDate);
  const end = toLocalDate(plan.endDate || plan.startDate);
  const dayMs = 24 * 60 * 60 * 1000;
  const untilStart = Math.round((start - selected) / dayMs);
  const day = Math.round((selected - start) / dayMs) + 1;
  const lastDay = Math.max(1, Number(plan.nights || 1) + 1);

  if (untilStart > 0) return { date: dateValue, day: 1, status: "before", label: `D-${untilStart}` };
  if (selected > end) return { date: dateValue, day: lastDay, status: "after", label: "완료" };
  return { date: dateValue, day: Math.max(1, day), status: "active", label: `${Math.max(1, day)}일차` };
}

export function buildDayViewText(plan, day, limit = 3000) {
  const dayNumber = Math.max(1, Number(day) || 1);
  const latest = latestRevision(plan);
  const planText = latest?.planText || "";
  const lines = planText.split(/\r?\n/);
  const headings = lines
    .map((line, index) => ({ index, day: dayHeadingNumber(line) }))
    .filter((item) => item.day);
  const start = headings.find((item) => item.day === dayNumber);

  if (!start) {
    return truncateText(
      `플랜 #${plan.id} ${dayNumber}일차 섹션을 찾지 못했습니다.\n\n플랜 본문에서 "1일차", "2일차", "Day 1" 같은 제목을 기준으로 잘라 보여줍니다.\n\n${planText || "플랜 본문이 없습니다."}`,
      limit
    );
  }

  const next = headings.find((item) => item.index > start.index && item.day !== dayNumber);
  const body = lines.slice(start.index, next ? next.index : undefined).join("\n").trim();
  return truncateText(
    `플랜 #${plan.id} ${plan.destination || "여행지"} ${dayNumber}일차\n${plan.startDate || "날짜 미정"} 출발 / ${plan.nights || 1}박\n\n${body}`,
    limit
  );
}

export function buildTodayViewText(plan, limit = 3000) {
  const current = getCurrentTripDay(plan);
  const intro =
    current.status === "before"
      ? `아직 출발 전입니다. ${current.label} 기준으로 1일차를 먼저 보여드립니다.`
      : current.status === "after"
        ? "이미 종료된 여행입니다. 마지막 일차를 보여드립니다."
        : `오늘은 ${current.label}입니다.`;
  return truncateText(`${intro}\n\n${buildDayViewText(plan, current.day, limit)}`, limit);
}

export function buildDateViewText(plan, dateValue, limit = 3000) {
  const selected = getTripDayForDate(plan, dateValue);
  const intro =
    selected.status === "before"
      ? `${dateValue}은 출발 전입니다. ${selected.label} 기준으로 1일차를 먼저 보여드립니다.`
      : selected.status === "after"
        ? `${dateValue}은 여행 종료 후입니다. 마지막 일차를 보여드립니다.`
        : `${dateValue}은 ${selected.label}입니다.`;
  return truncateText(`${intro}\n\n${buildDayViewText(plan, selected.day, limit)}`, limit);
}
