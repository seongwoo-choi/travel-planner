function latestRevision(plan) {
  const revisions = Array.isArray(plan.revisions) ? plan.revisions : [];
  return revisions.find((item) => item.version === plan.latestVersion) || revisions.at(-1);
}

function safeText(value, fallback = "") {
  return String(value == null || value === "" ? fallback : value);
}

function toIcsDate(value) {
  const date = value ? new Date(value) : new Date();
  const pad = (item) => String(item).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function addDays(value, days) {
  const date = value ? new Date(value) : new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function escapeIcsText(value) {
  return safeText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function tripStatusText(plan) {
  const today = new Date();
  const start = new Date(`${safeText(plan.startDate)}T00:00:00`);
  const end = new Date(`${safeText(plan.endDate || plan.startDate)}T00:00:00`);
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayMs = 24 * 60 * 60 * 1000;
  const untilStart = Math.round((start - current) / dayMs);
  if (untilStart > 0) return `D-${untilStart}`;
  if (current <= end) return "여행 중";
  return "완료";
}

function llmAuditText(revision) {
  if (!revision?.llmAuthMode && !revision?.llmProvider && !revision?.model) return "";
  const modeLabels = {
    "server-default": "서버 기본 key",
    "user-api-key": "사용자 1회용 key",
  };
  const providerLabels = {
    anthropic: "Anthropic",
    auto: "자동",
    claude: "Anthropic",
    codex: "OpenAI",
    openai: "OpenAI",
  };
  const mode = modeLabels[revision.llmAuthMode] || revision.llmAuthMode || "인증 방식 미상";
  const provider = providerLabels[revision.llmProvider] || revision.llmProvider || "provider 미상";
  const parts = [mode, provider];
  if (revision.model) parts.push(revision.model);
  if (revision.llmModelOverride) parts.push("직접 모델");
  return ` / ${parts.join(" / ")}`;
}

function qualityAuditChecks(revision) {
  const section = safeText(revision?.planText).split("## 자동 품질 점검")[1] || "";
  if (!section) return [];
  const checks = [];
  for (const line of section.split("\n")) {
    if (line.startsWith("## ")) break;
    const match = line.match(/^-\s*(OK|확인)\s+([^:]+)(?::\s*(.*))?$/);
    if (!match) continue;
    checks.push({ ok: match[1] === "OK", label: match[2].trim() });
  }
  return checks;
}

function qualityAuditText(revision, previousRevision = null) {
  const checks = qualityAuditChecks(revision);
  if (checks.length === 0) return "";
  const warnings = checks.filter((item) => !item.ok);
  const trend = qualityTrendText(warnings.length, previousRevision);
  if (warnings.length === 0) return ` / 품질 OK${trend}`;
  const labels = warnings.map((item) => item.label).slice(0, 2).join(", ");
  const extra = warnings.length > 2 ? ` 외 ${warnings.length - 2}` : "";
  return ` / 품질 확인 ${warnings.length}${labels ? `: ${labels}${extra}` : ""}${trend}`;
}

function qualityTrendText(warningCount, previousRevision) {
  const previousChecks = qualityAuditChecks(previousRevision);
  if (previousChecks.length === 0) return "";
  const previousWarningCount = previousChecks.filter((item) => !item.ok).length;
  const delta = warningCount - previousWarningCount;
  if (delta < 0) return ` / 개선 ${Math.abs(delta)}`;
  if (delta > 0) return ` / 추가 ${delta}`;
  return "";
}

export function buildPlanMarkdown(plan) {
  const latest = latestRevision(plan);
  const title = `${safeText(plan.destination, "여행지")} 여행 플랜`;
  const personalNote = safeText(plan.personalNote).trim();
  const lines = [
    `# ${title}`,
    "",
    `- 플랜 ID: ${plan.id}`,
    `- 버전: v${plan.latestVersion || 1}`,
    `- 기간: ${safeText(plan.startDate, "미정")} ~ ${safeText(plan.endDate, "미정")}`,
    `- 상태: ${tripStatusText(plan)}`,
    `- 이동: ${safeText(plan.departure, "서울")} -> ${safeText(plan.destination, "미정")}`,
    `- 동행: ${safeText(plan.companions, "미정")} / ${safeText(plan.travelers, 2)}명`,
    `- 일정: ${safeText(plan.nights, 2)}박`,
    `- 범위: ${safeText(plan.scope, "domestic")}`,
    `- 교통 선호: ${safeText(plan.transportPref, "auto")}`,
    `- 숙박 선호: ${safeText(plan.accommodation, "미정")}`,
    "",
    "## 최종 플랜",
    "",
    safeText(latest?.planText, "플랜 본문이 없습니다."),
    "",
  ];

  if (personalNote) {
    lines.push("## 개인 메모", "", personalNote, "");
  }

  lines.push("## 버전 히스토리", "");

  const revisions = [...(plan.revisions || [])].sort((a, b) => a.version - b.version);
  if (revisions.length === 0) {
    lines.push("- 히스토리 없음");
  } else {
    revisions.forEach((revision, index) => {
      const feedback = revision.feedback ? ` / ${revision.feedback}` : "";
      lines.push(`- v${revision.version}${llmAuditText(revision)}${qualityAuditText(revision, revisions[index - 1])} / ${revision.createdAt || "날짜 미정"}${feedback}`);
    });
  }

  return `${lines.join("\n")}\n`;
}

export function buildShareText(plan) {
  const latest = latestRevision(plan);
  const body = safeText(latest?.planText, "플랜 본문이 없습니다.");
  const personalNote = safeText(plan.personalNote).trim();
  const preview = body.length > 700 ? `${body.slice(0, 700)}\n...` : body;
  const lines = [
    `${safeText(plan.destination, "여행지")} 여행 플랜`,
    `${safeText(plan.startDate, "미정")} ~ ${safeText(plan.endDate, "미정")} / ${safeText(plan.nights, 2)}박 / ${safeText(plan.travelers, 2)}명 / ${tripStatusText(plan)}`,
    `${safeText(plan.departure, "서울")} 출발 / ${safeText(plan.transportPref, "auto")}`,
    "",
    preview,
  ];
  if (personalNote) {
    lines.push("", `메모: ${personalNote}`);
  }
  return lines.join("\n");
}

export function buildPlanCalendar(plan) {
  const latest = latestRevision(plan);
  const start = toIcsDate(plan.startDate);
  const end = toIcsDate(addDays(plan.endDate || plan.startDate, 1));
  const title = `${safeText(plan.destination, "여행지")} 여행`;
  const description = buildShareText({
    ...plan,
    revisions: latest ? [{ ...latest, planText: safeText(latest.planText).slice(0, 1200) }] : [],
    latestVersion: latest?.version || plan.latestVersion,
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Travel Planner//Travel Planner//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:travel-plan-${plan.id}@travel-planner.local`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(safeText(plan.destination, ""))}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
