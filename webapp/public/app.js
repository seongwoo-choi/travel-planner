function parseJsonSafe(res) {
  return res.json().catch(() => ({}));
}

function escapeText(value) {
  return String(value == null ? "" : value).replace(/[&<>"]/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    return "&quot;";
  });
}

function toLocalDate(value) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getTripStatus(plan) {
  const today = toLocalDate();
  const start = toLocalDate(plan.startDate);
  const end = toLocalDate(plan.endDate || plan.startDate);
  const dayMs = 24 * 60 * 60 * 1000;
  const untilStart = Math.round((start - today) / dayMs);
  if (untilStart > 0) return `D-${untilStart}`;
  if (today <= end) return "여행 중";
  return "완료";
}

const MISSION_DAY_MS = 24 * 60 * 60 * 1000;

function dayDeltaFromToday(value) {
  if (!value) return null;
  const target = toLocalDate(value);
  const today = toLocalDate();
  const delta = Math.round((target - today) / MISSION_DAY_MS);
  return Number.isFinite(delta) ? delta : null;
}

function getTripMissionStatus(plan) {
  const startDelta = dayDeltaFromToday(plan?.startDate);
  if (!Number.isFinite(startDelta)) return "unknown";
  if (startDelta > 0) return "upcoming";
  const endDelta = dayDeltaFromToday(plan?.endDate || plan?.startDate);
  if (!Number.isFinite(endDelta) || endDelta >= 0) return "active";
  return "completed";
}

function formatMissionTiming(plan) {
  const status = getTripMissionStatus(plan);
  const startDelta = dayDeltaFromToday(plan?.startDate);
  const endDelta = dayDeltaFromToday(plan?.endDate || plan?.startDate);
  if (status === "upcoming") return `D-${startDelta}`;
  if (status === "active") {
    if (startDelta === 0) return "오늘 출발";
    if (endDelta === 0) return "오늘 마지막 날";
    if (Number.isFinite(endDelta) && endDelta > 0) return `${endDelta + 1}일 남음`;
    return "여행 중";
  }
  if (status === "completed" && Number.isFinite(endDelta)) return `${Math.abs(endDelta)}일 전 완료`;
  return "날짜 확인 필요";
}

function missionQualityScore(plan) {
  const priority = Number(plan?.qualityActionPriority || 0);
  if (priority > 0) return priority;
  const warningCount = Number(plan?.qualityWarningCount || 0);
  if (warningCount > 0) return 80 + warningCount;
  const checkCount = Number(plan?.qualityCheckCount || 0);
  if (checkCount <= 0) return 70;
  return 0;
}

function missionNeedsQuality(plan) {
  return missionQualityScore(plan) > 0;
}

function compareByDateField(field) {
  return (a, b) => {
    const aDelta = dayDeltaFromToday(a?.[field]);
    const bDelta = dayDeltaFromToday(b?.[field]);
    if (!Number.isFinite(aDelta)) return 1;
    if (!Number.isFinite(bDelta)) return -1;
    return aDelta - bDelta;
  };
}

function compareByUpdatedAt(a, b) {
  return String(a?.updatedAt || "") < String(b?.updatedAt || "") ? 1 : -1;
}

function selectMissionFocus(plans) {
  const active = plans.filter((plan) => getTripMissionStatus(plan) === "active").sort(compareByDateField("endDate"));
  if (active.length) {
    return {
      actionLabel: "현황 열기",
      detail: `${active[0].destination || "목적지 미정"} · ${formatMissionTiming(active[0])}. 오늘 일정과 다음 액션을 확인하세요.`,
      href: `/plans/${active[0].id}`,
      title: "오늘의 여행 미션",
    };
  }
  const upcoming = plans.filter((plan) => getTripMissionStatus(plan) === "upcoming").sort(compareByDateField("startDate"));
  if (upcoming.length) {
    return {
      actionLabel: "준비 열기",
      detail: `${upcoming[0].destination || "목적지 미정"} · ${formatMissionTiming(upcoming[0])}. 출발 전 체크리스트와 준비팩을 확인하세요.`,
      href: `/plans/${upcoming[0].id}`,
      title: "다가오는 여행 준비",
    };
  }
  const quality = plans.filter(missionNeedsQuality).sort((a, b) => missionQualityScore(b) - missionQualityScore(a));
  if (quality.length) {
    const needsAudit = planNeedsQualityAudit(quality[0]);
    return {
      actionLabel: needsAudit ? "점검 생성" : "품질 보강",
      detail: `${quality[0].destination || "목적지 미정"} · ${formatQualityActionReason(quality[0]).replace(/^후보:\s*/, "") || "품질 보강 필요"}.`,
      href: `/plans/${quality[0].id}${needsAudit ? "?qualityAudit=1" : ""}#qualityRefine`,
      title: "다음 고도화 미션",
    };
  }
  const completed = plans.filter((plan) => getTripMissionStatus(plan) === "completed").sort(compareByUpdatedAt);
  if (completed.length) {
    return {
      actionLabel: "회고 열기",
      detail: `${completed[0].destination || "목적지 미정"} · ${formatMissionTiming(completed[0])}. 메모와 회고를 정리하세요.`,
      href: `/plans/${completed[0].id}`,
      title: "여행 회고 미션",
    };
  }
  return null;
}

function missionStatButton(label, filter, count, currentFilter = "all") {
  const filterAction = count <= 0 ? "notice" : "refresh";
  const unavailableAttrs = count <= 0 ? ' aria-disabled="true" data-empty-stat="true"' : "";
  const safeLabel = escapeText(label);
  const isActive = currentFilter === filter;
  const isAllFilter = filter === "all";
  const statScopeLabel = isAllFilter ? "전체 상태" : safeLabel;
  const title = count > 0
    ? isActive
      ? `이미 선택된 ${statScopeLabel} 플랜 ${count}개입니다. 다시 누르면 중복 갱신 없이 현재 보기 상태를 알려줍니다.`
      : `${statScopeLabel} 플랜 ${count}개 목록으로 갱신합니다.`
    : `현재 검색/필터 범위에서는 ${statScopeLabel} 플랜이 없습니다. 누르면 현재 범위에 결과가 없다는 안내를 표시합니다. 목록이 생기면 이 필터를 사용할 수 있습니다.`;
  const ariaLabel = count > 0
    ? isActive
      ? `미션 보드 필터: 현재 선택된 ${statScopeLabel} 플랜 ${count}개. 다시 누르면 중복 갱신 없이 현재 보기 상태 알림`
      : `미션 보드 필터: ${statScopeLabel} 플랜 ${count}개 보기로 목록 갱신`
    : `미션 보드 필터: 현재 검색/필터 범위에 ${statScopeLabel} 플랜 없음. 누르면 현재 범위에 결과 없음 안내. 목록이 생기면 사용 가능`;
  const activeAttrs = ` aria-pressed="${isActive ? "true" : "false"}"${isActive ? ' data-active="true"' : ""}`;
  const activeText = isActive ? '<small aria-hidden="true">선택됨</small>' : "";
  return `<button type="button" class="mission-stat" data-mission-filter="${escapeText(filter)}" data-mission-filter-label="${safeLabel}" data-mission-filter-count="${count}" data-mission-filter-action="${filterAction}" title="${escapeText(title)}" aria-label="${escapeText(ariaLabel)}" aria-describedby="missionBoardFeedback"${activeAttrs}${unavailableAttrs}><span>${safeLabel}${activeText}</span><strong>${count}</strong></button>`;
}

const HOME_FILTER_LABELS = {
  all: "전체",
  pinned: "고정",
  "quality-action": "고도화 후보",
  "quality-urgent": "긴급 후보",
  quality: "품질 확인",
  "quality-ok": "품질 OK",
  "quality-unaudited": "품질 미점검",
  "quality-regression": "품질 악화",
  "quality-improved": "품질 개선",
  upcoming: "예정",
  active: "여행 중",
  completed: "완료",
};

function homeFilterLabel(filter = "all") {
  const normalized = String(filter || "all").trim() || "all";
  return HOME_FILTER_LABELS[normalized] || normalized;
}

function homeListUrl(context = {}) {
  const params = new URLSearchParams();
  const query = String(context.query || "").trim();
  const filter = String(context.filter || "all").trim();
  if (query) params.set("q", query);
  if (filter && filter !== "all") params.set("filter", filter);
  const suffix = params.toString();
  return `${window.location.origin}/${suffix ? `?${suffix}` : ""}`;
}

function missionBoardUrl(context = {}) {
  return `${homeListUrl(context)}#tripMissionBoard`;
}

function missionFocusHref(focus = {}) {
  const href = String(focus.href || "");
  if (!href || href.includes("#") || href.includes("?")) return href;
  if (href.startsWith("/plans/")) return `${href}#tripActionRunway`;
  return href;
}

function planIdFromMissionFocus(focus = {}) {
  const href = String(focus?.href || "");
  const match = href.match(/\/plans\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function missionFocusActionLabel(focus = {}) {
  const href = String(focus.href || "");
  if (href.startsWith("/plans/") && !href.includes("#") && !href.includes("?")) return "추천 액션 열기";
  return String(focus.actionLabel || "열기");
}

function missionFocusLinkNote(focus = {}) {
  const href = String(focus.href || "");
  if (href.startsWith("/plans/") && !href.includes("#") && !href.includes("?")) return "상세 액션 런웨이로 이동";
  return "";
}

function missionFocusDestinationBadge(focus = {}) {
  const note = missionFocusLinkNote(focus);
  if (note) return "상세 런웨이";
  const href = String(focus.href || "");
  if (href.includes("qualityAudit=1") || href.includes("#qualityRefine")) return "품질 보강";
  return "";
}

function missionFocusUrl(focus = {}) {
  return `${window.location.origin}${missionFocusHref(focus)}`;
}

function missionBoardScopeTags(context = {}) {
  const tags = [];
  const query = String(context.query || "").trim();
  const filter = String(context.filter || "all").trim();
  if (query) tags.push({ kind: "query", label: `검색: ${query}` });
  if (filter && filter !== "all") tags.push({ kind: "filter", label: `필터: ${homeFilterLabel(filter)}` });
  return tags;
}

function missionBoardScopeClearButton(tag, options = {}) {
  const dataPrefix = options.dataPrefix || "mission";
  const describedBy = options.describedBy || "missionBoardFeedback";
  const ariaPrefix = options.ariaPrefix || "미션 보드";
  const safeKind = escapeText(tag.kind);
  const safeLabel = escapeText(tag.label);
  const ariaLabel = escapeText(`${ariaPrefix} 범위 해제 후 목록 갱신: ${tag.label}`);
  return `<button type="button" data-${dataPrefix}-scope-clear="${safeKind}" data-${dataPrefix}-scope-label="${safeLabel}" title="${safeLabel} 범위를 해제하고 목록을 갱신합니다." aria-label="${ariaLabel}" aria-describedby="${describedBy}">${safeLabel} ×</button>`;
}

function missionBoardScopeResetButton(options = {}) {
  const dataAttr = options.dataAttr || "mission-board-reset";
  const describedBy = options.describedBy || "missionBoardFeedback";
  const ariaPrefix = options.ariaPrefix || "보드 공유";
  const scopeLabel = options.scopeLabel || "";
  const title = scopeLabel
    ? `${scopeLabel} 범위에서 검색어와 필터를 모두 해제하고 전체 미션 보드 목록을 갱신합니다.`
    : "검색어와 필터를 모두 해제하고 전체 미션 보드 목록을 갱신합니다.";
  const ariaLabel = scopeLabel
    ? `${ariaPrefix}: ${scopeLabel} 범위에서 검색어와 필터를 해제하고 전체 미션 보드 목록 갱신`
    : `${ariaPrefix}: 검색어와 필터를 해제하고 전체 미션 보드 목록 갱신`;
  return `<button type="button" class="secondary inline-action" data-${dataAttr} title="${escapeText(title)}" aria-label="${escapeText(ariaLabel)}" aria-describedby="${describedBy}">전체 미션 보기</button>`;
}

function missionBoardScopeLabel(context = {}) {
  const labels = missionBoardScopeTags(context).map((tag) => tag.label);
  return labels.length ? labels.join(", ") : "전체";
}

function missionBoardScopeDetail(context = {}) {
  const scopeText = context.query || (context.filter && context.filter !== "all")
    ? "현재 목록 기준"
    : "전체 저장 플랜 기준";
  const scopeLabel = missionBoardScopeLabel(context);
  return scopeLabel === "전체" ? scopeText : `${scopeText} (${scopeLabel})`;
}

function syncHomeListUrl(query = "", filter = "all") {
  if (!window.history?.replaceState) return;
  const next = new URL(window.location.href);
  const normalizedQuery = String(query || "").trim();
  const normalizedFilter = String(filter || "all").trim();
  if (normalizedQuery) next.searchParams.set("q", normalizedQuery);
  else next.searchParams.delete("q");
  if (normalizedFilter && normalizedFilter !== "all") next.searchParams.set("filter", normalizedFilter);
  else next.searchParams.delete("filter");
  window.history.replaceState(null, "", `${next.pathname}${next.search}${next.hash}`);
}

function buildMissionBoardShareText(plans, counts, focus, context = {}) {
  const scopeDetail = missionBoardScopeDetail(context);
  return [
    "Travel Planner 여행 미션 보드",
    `- 범위: ${scopeDetail}`,
    `- 전체: ${plans.length}`,
    `- 예정: ${counts.upcoming}`,
    `- 여행 중: ${counts.active}`,
    `- 완료: ${counts.completed}`,
    `- 품질 후보: ${counts.quality}`,
    focus ? `- 최우선 미션: ${focus.title}` : "- 최우선 미션: 없음",
    focus ? `- 안내: ${focus.detail}` : "",
    focus ? `- 최우선 링크: ${missionFocusUrl(focus)}` : "",
    `- 미션 보드 링크: ${missionBoardUrl(context)}`,
  ].filter(Boolean).join("\n");
}

function buildMissionBoardScopeShareText(context = {}, resultLabel = "") {
  return [
    "Travel Planner 미션 보드 범위",
    `- 범위: ${missionBoardScopeDetail(context)}`,
    resultLabel ? `- 결과: ${resultLabel}` : "",
    `- 링크: ${missionBoardUrl(context)}`,
  ].filter(Boolean).join("\n");
}

async function shareMissionBoardScopeText(button, context = {}, resultLabel = "") {
  const text = buildMissionBoardScopeShareText(context, resultLabel);
  const url = missionBoardUrl(context);
  if (navigator.share) {
    try {
      await navigator.share({
        title: "Travel Planner 미션 보드 범위",
        text,
        url,
      });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }
  await copyWithButtonFeedback(button, text, "현재 미션 보드 범위를 복사했습니다.");
  return "copied";
}

async function shareMissionBoardText(
  button,
  text,
  url,
  title = "Travel Planner 여행 미션 보드",
  fallbackMessage = "현재 여행 미션 보드를 복사했습니다."
) {
  if (navigator.share) {
    try {
      await navigator.share({
        title,
        text,
        url,
      });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }
  await copyWithButtonFeedback(button, text, fallbackMessage);
  return "copied";
}

function buildMissionFocusShareText(focus, context = {}) {
  const destinationBadge = missionFocusDestinationBadge(focus);
  const scopeDetail = missionBoardScopeDetail(context);
  return [
    "Travel Planner 최우선 미션",
    `- 범위: ${scopeDetail}`,
    `- 미션: ${focus.title}`,
    destinationBadge ? `- 목적지: ${destinationBadge}` : "",
    `- 안내: ${focus.detail}`,
    `- 액션: ${missionFocusActionLabel(focus)}`,
    missionFocusLinkNote(focus) ? `- 링크 안내: ${missionFocusLinkNote(focus)}` : "",
    `- 플랜 링크: ${missionFocusUrl(focus)}`,
    `- 미션 보드: ${missionBoardUrl(context)}`,
  ].filter(Boolean).join("\n");
}

function buildMissionFocusReasonText(focus, context = {}, destinationLabel = "최우선 플랜") {
  const destinationBadge = missionFocusDestinationBadge(focus);
  const scopeDetail = missionBoardScopeDetail(context);
  return [
    "Travel Planner 최우선 이유",
    `- 범위: ${scopeDetail}`,
    `- 목적지: ${destinationLabel || "최우선 플랜"}`,
    `- 미션: ${focus.title}`,
    `- 이유: ${focus.detail}`,
    `- 연결: ${destinationBadge || missionFocusActionLabel(focus)}`,
    `- 링크: ${missionFocusUrl(focus)}`
  ].join("\n");
}

async function runMissionButtonBusyAction(button, action) {
  if (button.disabled) return;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    await action();
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

function syncHomeStatusFilterShortcuts(activeFilter = "all") {
  document.querySelectorAll("[data-status-filter-shortcut]").forEach((button) => {
    const isActive = button.dataset.statusFilterShortcut === activeFilter;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function getTodayInputDate() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

function buildMissionBoardStarterPrompt(context = {}) {
  const query = String(context.query || "").trim();
  const filter = String(context.filter || "all").trim();
  const scopeHint = [
    query ? `검색어 ${query}와 관련된 여행` : "",
    filter && filter !== "all" ? `${homeFilterLabel(filter)} 상태의 여행` : "",
  ].filter(Boolean).join(", ");
  return [
    "Travel Planner 새 여행 플랜 요청",
    `- 목적지: ${query || "부산"}`,
    "- 출발지: 서울",
    `- 출발일: ${getTodayInputDate()}`,
    "- 일정: 2박 3일",
    "- 동행: 친구 2명",
    "- 여행 스타일: 맛집, 산책, 이동 짧게",
    "- 꼭 필요한 결과: 하루별 동선, 우천 대안, 예약 체크리스트, 예산 힌트",
    scopeHint ? `- 참고: 현재 빈 목록 범위는 ${scopeHint}입니다.` : "",
    `- 미션 보드: ${missionBoardUrl(context)}`,
  ].filter(Boolean).join("\n");
}

function fillMissionStarterForm(context = {}) {
  const form = document.getElementById("planForm");
  if (!form) return;
  const query = String(context.query || "").trim();
  const startDate = getTodayInputDate();
  const setValue = (name, value) => {
    const field = form.elements[name];
    if (field) field.value = value;
  };
  setValue("destination", query || "부산");
  setValue("departure", "서울");
  setValue("startDate", startDate);
  setValue("scope", "domestic");
  setValue("companions", "친구");
  setValue("travelers", "2");
  setValue("nights", "2");
  setValue("tripType", "맛집, 산책, 이동 짧게");
  setValue("accommodation", "호텔");
  setValue("transportPref", "auto");
  setValue("budgetPerPerson", "120000");
  setValue("highlights", query ? `${query}에서 꼭 가볼 만한 곳` : "해운대, 전포카페거리");
  setValue("notes", "하루별 동선, 우천 대안, 예약 체크리스트, 예산 힌트까지 포함해줘.");
  const formMessage = document.getElementById("planFormMessage");
  if (formMessage) {
    formMessage.className = "form-message";
    formMessage.textContent = `예시 여행 요청을 채웠습니다. 오늘 출발일(${startDate})과 목적지를 확인한 뒤 계획 생성을 눌러주세요.`;
  }
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.elements.destination?.focus();
}

window.fillMissionStarterForm = fillMissionStarterForm;

async function shareMissionStarterPrompt(button, text, url) {
  if (navigator.share) {
    try {
      await navigator.share({
        title: "Travel Planner 새 여행 플랜 요청",
        text,
        url,
      });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }
  await copyWithButtonFeedback(button, text, "새 여행 플랜 예시 요청을 복사했습니다.");
  return "copied";
}

async function shareMissionFocusText(button, text, url) {
  if (navigator.share) {
    try {
      await navigator.share({
        title: "Travel Planner 최우선 미션",
        text,
        url,
      });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
    }
  }
  await copyWithButtonFeedback(button, text, "최우선 미션을 복사했습니다.");
  return "copied";
}

function missionBoardFeedbackSummary(message, resultLabel) {
  const safeResultLabel = resultLabel || "0개 플랜";
  const detail = safeResultLabel === "목록 갱신 중"
    ? `상태: ${safeResultLabel}`
    : `결과: ${safeResultLabel}`;
  return {
    detail,
    text: message.includes("개") ? message : `${message} · ${safeResultLabel === "목록 갱신 중" ? detail : safeResultLabel}`,
  };
}

const MISSION_BOARD_LAST_ACTION_ORIGINS = {
  postLoadRestore: "post-load-restore",
  statusCountFeedback: "status-count-feedback",
};

function missionBoardLastActionOriginLabel(origin) {
  if (origin === MISSION_BOARD_LAST_ACTION_ORIGINS.statusCountFeedback) return "상태 카운트 즉시 feedback";
  if (origin === MISSION_BOARD_LAST_ACTION_ORIGINS.postLoadRestore) return "목록 갱신 후 복원";
  return "";
}

function buildMissionBoardLastActionShareText(boardFeedback, boardLink = "") {
  if (!boardFeedback?.dataset?.missionBoardLastActionSummary) return "";
  const {
    missionBoardLastAction,
    missionBoardLastActionLabel,
    missionBoardLastActionOrigin,
    missionBoardLastActionOriginLabel,
    missionBoardLastActionSummary,
    missionBoardLastActionTargetLabel,
    missionBoardLastActionScopeLabel,
    missionBoardLastActionResultLabel,
    missionBoardLastActionUpdatedAt,
    missionBoardLastActionUpdatedAtIso,
  } = boardFeedback.dataset;
  return [
    "Travel Planner 미션 보드 최근 동작",
    `요약: ${missionBoardLastActionSummary}`,
    missionBoardLastActionLabel ? `동작 라벨: ${missionBoardLastActionLabel}` : "",
    missionBoardLastAction ? `동작 코드: ${missionBoardLastAction}` : "",
    missionBoardLastActionTargetLabel ? `대상: ${missionBoardLastActionTargetLabel}` : "",
    missionBoardLastActionOriginLabel ? `출처: ${missionBoardLastActionOriginLabel}` : "",
    missionBoardLastActionOrigin ? `출처 코드: ${missionBoardLastActionOrigin}` : "",
    missionBoardLastActionScopeLabel ? `범위: ${missionBoardLastActionScopeLabel}` : "",
    missionBoardLastActionResultLabel ? `결과: ${missionBoardLastActionResultLabel}` : "",
    boardLink ? `링크: ${boardLink}` : "",
    missionBoardLastActionUpdatedAt ? `업데이트: ${missionBoardLastActionUpdatedAt}` : "",
    missionBoardLastActionUpdatedAtIso ? `업데이트 ISO: ${missionBoardLastActionUpdatedAtIso}` : "",
  ].filter(Boolean).join("\n");
}

function buildMissionBoardLastActionJsonText(boardFeedback, boardLink = "", context = {}, statusCounts = {}) {
  if (!boardFeedback?.dataset?.missionBoardLastActionSummary) return "";
  const { dataset } = boardFeedback;
  const boardQuery = String(context.query || "").trim();
  const boardFilter = String(context.filter || "all").trim() || "all";
  const hasQuery = Boolean(boardQuery);
  const hasStatusFilter = boardFilter !== "all";
  const scopeTags = missionBoardScopeTags(context);
  const generatedAtDate = new Date();
  const generatedAt = generatedAtDate.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const generatedAtIso = generatedAtDate.toISOString();
  return JSON.stringify({
    schemaVersion: 1,
    type: "travel-planner.mission-board.last-action",
    label: "Travel Planner 미션 보드 최근 동작",
    source: "webapp.home.mission-board.feedback",
    copiedFrom: "home.mission-board.recent-action-json",
    summary: dataset.missionBoardLastActionSummary || "",
    action: dataset.missionBoardLastAction || "",
    actionLabel: dataset.missionBoardLastActionLabel || "",
    origin: dataset.missionBoardLastActionOrigin || "",
    originLabel: dataset.missionBoardLastActionOriginLabel || "",
    targetLabel: dataset.missionBoardLastActionTargetLabel || "",
    scopeLabel: dataset.missionBoardLastActionScopeLabel || "",
    resultLabel: dataset.missionBoardLastActionResultLabel || "",
    updatedAt: dataset.missionBoardLastActionUpdatedAt || "",
    updatedAtIso: dataset.missionBoardLastActionUpdatedAtIso || "",
    generatedAt,
    generatedAtIso,
    boardLink,
    boardContext: {
      query: boardQuery,
      filter: boardFilter,
      filterLabel: homeFilterLabel(boardFilter),
      hasQuery,
      hasStatusFilter,
      scopeKind: hasQuery || hasStatusFilter ? "filtered" : "all",
      scopeKindLabel: hasQuery || hasStatusFilter ? "검색/필터 적용 범위" : "전체 범위",
      scopeDetail: missionBoardScopeDetail(context),
      scopeTags,
      scopeTagCount: scopeTags.length,
      activeScopeKinds: scopeTags.map((tag) => tag.kind),
      scopeTagSummary: scopeTags.length ? scopeTags.map((tag) => tag.label).join(", ") : "전체",
      scopeLabel: missionBoardScopeLabel(context),
      resultLabel: dataset.missionBoardActiveResultLabel || "",
      statusCounts: {
        total: Number(statusCounts.total || 0),
        upcoming: Number(statusCounts.upcoming || 0),
        active: Number(statusCounts.active || 0),
        completed: Number(statusCounts.completed || 0),
        quality: Number(statusCounts.quality || 0),
      },
      statusLabels: {
        total: "전체",
        upcoming: "예정",
        active: "여행 중",
        completed: "완료",
        quality: "품질 후보",
      },
      statusSummary: [
        `전체 ${Number(statusCounts.total || 0)}개`,
        `예정 ${Number(statusCounts.upcoming || 0)}개`,
        `여행 중 ${Number(statusCounts.active || 0)}개`,
        `완료 ${Number(statusCounts.completed || 0)}개`,
        `품질 후보 ${Number(statusCounts.quality || 0)}개`,
      ].join(" · "),
    },
  }, null, 2);
}

function restoreMissionBoardLastActionFeedback({ action, actionLabel, targetLabel, scopeLabel, resultLabel }) {
  const boardFeedback = document.querySelector("[data-mission-board-feedback]");
  if (!boardFeedback) return;
  const refreshedAtDate = new Date();
  const refreshedAt = refreshedAtDate.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const refreshedActionSummary = targetLabel ? `${actionLabel}: ${targetLabel}` : actionLabel;
  const refreshedOrigin = MISSION_BOARD_LAST_ACTION_ORIGINS.postLoadRestore;
  const refreshedOriginLabel = missionBoardLastActionOriginLabel(refreshedOrigin);
  const refreshedScopeLabel = boardFeedback.dataset.missionBoardActiveScopeLabel || scopeLabel || "전체";
  const refreshedResultLabel = boardFeedback.dataset.missionBoardActiveResultLabel || resultLabel || "0개 플랜";
  boardFeedback.textContent = `보드 준비 · ${refreshedResultLabel} · 최근: ${refreshedActionSummary} · 출처: ${refreshedOriginLabel}`;
  boardFeedback.dataset.missionBoardLastAction = action;
  boardFeedback.dataset.missionBoardLastActionLabel = actionLabel;
  boardFeedback.dataset.missionBoardLastActionOrigin = refreshedOrigin;
  boardFeedback.dataset.missionBoardLastActionOriginLabel = refreshedOriginLabel;
  boardFeedback.dataset.missionBoardLastActionSummary = refreshedActionSummary;
  if (targetLabel) {
    boardFeedback.dataset.missionBoardLastActionTargetLabel = targetLabel;
  } else {
    delete boardFeedback.dataset.missionBoardLastActionTargetLabel;
  }
  boardFeedback.dataset.missionBoardLastActionScopeLabel = refreshedScopeLabel;
  boardFeedback.dataset.missionBoardLastActionResultLabel = refreshedResultLabel;
  boardFeedback.dataset.missionBoardLastActionUpdatedAt = refreshedAt;
  boardFeedback.dataset.missionBoardLastActionUpdatedAtIso = refreshedAtDate.toISOString();
  boardFeedback.dataset.state = "ready";
  boardFeedback.dataset.updatedAt = refreshedAt;
  delete boardFeedback.dataset.missionBoardShowLastActionOnReady;
  delete boardFeedback.dataset.missionBoardActiveAction;
  delete boardFeedback.dataset.missionBoardNoticeTargetLabel;
  const refreshedFeedbackLabel = `미션 보드 대기 상태: 보드 준비 · 마지막 동작: ${refreshedActionSummary} · 출처: ${refreshedOriginLabel} (${refreshedAt}) · 현재 범위: ${refreshedScopeLabel} · 결과: ${refreshedResultLabel} (업데이트 ${refreshedAt})`;
  boardFeedback.title = refreshedFeedbackLabel;
  boardFeedback.setAttribute("aria-label", refreshedFeedbackLabel);
}

function renderTripMissionBoard(plans, context = {}) {
  const board = document.getElementById("tripMissionBoard");
  if (!board) return;
  const items = Array.isArray(plans) ? plans : [];
  if (!items.length) {
    const scopeTags = missionBoardScopeTags(context);
    const scopeTagMarkup = scopeTags.length
      ? `<div class="mission-scope-tags">${scopeTags.map((tag) => missionBoardScopeClearButton(tag, { dataPrefix: "empty-mission", describedBy: "emptyMissionFeedback", ariaPrefix: "빈 미션 보드" })).join("")}</div>`
      : "";
    const starterPrompt = buildMissionBoardStarterPrompt(context);
    const emptyActiveFilter = context.filter || "all";
    const emptyActiveFilterLabel = homeFilterLabel(emptyActiveFilter);
    const emptyActiveScopeLabel = missionBoardScopeLabel(context);
    const emptyScopeDetail = missionBoardScopeDetail(context);
    const emptyScopeActionLabel = `${emptyScopeDetail} · 0개 플랜`;
    board.innerHTML = `
      <div class="mission-board-header">
        <span>${escapeText(scopeTags.length ? emptyScopeDetail : "새 여행 미션 시작")}</span>
        <span>0개 플랜</span>
      </div>
      ${scopeTagMarkup}
      <div class="mission-focus">
        <span class="badge">시작하기</span>
        <strong>현재 범위에서 보여줄 여행 미션이 없습니다. 새 플랜을 만들거나 범위를 넓혀보세요.</strong>
      </div>
      <details class="mission-starter-preview">
        <summary>예시 요청 미리보기</summary>
        <pre>${escapeText(starterPrompt)}</pre>
      </details>
      <div class="runway-share-actions" role="group" aria-labelledby="emptyMissionActionLabel" aria-describedby="emptyMissionFeedback">
        <span id="emptyMissionActionLabel" class="mission-focus-action-label" title="빈 미션 보드에서 새 플랜 시작, 예시 채우기, 예시 요청 복사와 공유, 범위 복사와 공유를 실행합니다.">빈 보드 시작</span>
        <button type="button" class="secondary inline-action" data-empty-mission-form title="새 플랜 입력 폼으로 이동합니다." aria-label="빈 미션 보드: 새 플랜 입력 폼으로 이동" aria-describedby="emptyMissionFeedback">새 플랜 입력으로 이동</button>
        <button type="button" class="secondary inline-action" data-empty-mission-fill title="현재 검색어와 오늘 날짜 기준 예시 요청을 입력 폼에 채웁니다." aria-label="빈 미션 보드: 예시 요청으로 입력 폼 채우기" aria-describedby="emptyMissionFeedback">예시로 채우기</button>
        <button type="button" class="secondary inline-action" data-empty-mission-prompt-copy title="새 여행 플랜 예시 요청을 복사합니다." aria-label="빈 미션 보드: 예시 요청 복사" aria-describedby="emptyMissionFeedback">예시 요청 복사</button>
        <button type="button" class="secondary inline-action" data-empty-mission-prompt-share title="새 여행 플랜 예시 요청을 공유합니다." aria-label="빈 미션 보드: 예시 요청 공유" aria-describedby="emptyMissionFeedback">예시 요청 공유</button>
        ${scopeTags.length ? `<button type="button" class="secondary inline-action" data-empty-mission-scope-copy title="${escapeText(`${emptyScopeActionLabel} 범위만 복사합니다.`)}" aria-label="${escapeText(`빈 미션 보드: ${emptyScopeActionLabel} 범위 복사`)}" aria-describedby="emptyMissionFeedback">범위 복사</button>` : ""}
        ${scopeTags.length ? `<button type="button" class="secondary inline-action" data-empty-mission-scope-share title="${escapeText(`${emptyScopeActionLabel} 범위를 공유합니다.`)}" aria-label="${escapeText(`빈 미션 보드: ${emptyScopeActionLabel} 범위 공유`)}" aria-describedby="emptyMissionFeedback">범위 공유</button>` : ""}
        ${scopeTags.length ? missionBoardScopeResetButton({ dataAttr: "empty-mission-reset", describedBy: "emptyMissionFeedback", ariaPrefix: "빈 미션 보드", scopeLabel: emptyScopeActionLabel }) : ""}
        <span id="emptyMissionFeedback" class="mission-focus-feedback mission-board-feedback" role="status" aria-live="polite" aria-atomic="true" data-state="ready" data-empty-mission-active-filter="${escapeText(emptyActiveFilter)}" data-empty-mission-active-filter-label="${escapeText(emptyActiveFilterLabel)}" data-empty-mission-active-scope-label="${escapeText(emptyActiveScopeLabel)}" data-empty-mission-active-result-label="0개 플랜" title="${escapeText(`빈 미션 보드 대기 상태: 빈 보드 준비 · 현재 범위: ${emptyActiveScopeLabel} · 결과: 0개 플랜`)}" aria-label="${escapeText(`빈 미션 보드 대기 상태: 빈 보드 준비 · 현재 범위: ${emptyActiveScopeLabel} · 결과: 0개 플랜`)}" data-empty-mission-feedback>빈 보드 준비 · 0개 플랜</span>
      </div>
    `;
    const emptyFeedback = board.querySelector("[data-empty-mission-feedback]");
    let emptyFeedbackTimer = null;
    let emptyFeedbackResetToken = 0;
    const setEmptyMissionFeedback = (message, state = "ready", autoReset = state !== "ready" && state !== "working") => {
      if (!emptyFeedback) return;
      emptyFeedbackResetToken += 1;
      if (emptyFeedbackTimer) {
        window.clearTimeout(emptyFeedbackTimer);
        emptyFeedbackTimer = null;
      }
      const feedbackUpdatedAt = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
      const feedbackMode = autoReset ? "작업 결과" : state === "working" ? "진행 상태" : "대기 상태";
      const feedbackScopeLabel = emptyFeedback.dataset.emptyMissionActiveScopeLabel || emptyFeedback.dataset.emptyMissionActiveFilterLabel || "전체";
      const feedbackResultLabel = emptyFeedback.dataset.emptyMissionActiveResultLabel || "0개 플랜";
      const feedbackSummary = missionBoardFeedbackSummary(message, feedbackResultLabel);
      const feedbackLabel = `빈 미션 보드 ${feedbackMode}: ${message} · 현재 범위: ${feedbackScopeLabel} · ${feedbackSummary.detail} (업데이트 ${feedbackUpdatedAt})`;
      emptyFeedback.textContent = feedbackSummary.text;
      emptyFeedback.dataset.state = state;
      emptyFeedback.dataset.updatedAt = feedbackUpdatedAt;
      emptyFeedback.title = feedbackLabel;
      emptyFeedback.setAttribute("aria-label", feedbackLabel);
      if (autoReset) {
        const resetToken = emptyFeedbackResetToken;
        emptyFeedbackTimer = window.setTimeout(() => {
          if (resetToken !== emptyFeedbackResetToken) return;
          setEmptyMissionFeedback("빈 보드 준비", "ready", false);
        }, 2200);
      }
    };
    board.querySelector("[data-empty-mission-form]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      await runMissionButtonBusyAction(button, () => {
        setEmptyMissionFeedback("입력 이동", "success");
        const form = document.getElementById("planForm");
        const destinationInput = form?.querySelector('input[name="destination"]');
        form?.scrollIntoView({ behavior: "smooth", block: "start" });
        destinationInput?.focus();
      });
    });
    board.querySelector("[data-empty-mission-fill]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      await runMissionButtonBusyAction(button, () => {
        fillMissionStarterForm(context);
        setEmptyMissionFeedback("예시 채움", "success");
      });
    });
    board.querySelector("[data-empty-mission-prompt-copy]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      await runMissionButtonBusyAction(button, async () => {
        setEmptyMissionFeedback("복사 중", "working");
        await copyWithButtonFeedback(
          button,
          starterPrompt,
          "새 여행 플랜 예시 요청을 복사했습니다."
        );
        setEmptyMissionFeedback("복사됨", "success");
      });
    });
    board.querySelector("[data-empty-mission-prompt-share]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      await runMissionButtonBusyAction(button, async () => {
        setEmptyMissionFeedback("공유 중", "working");
        const shareResult = await shareMissionStarterPrompt(
          button,
          starterPrompt,
          missionBoardUrl(context)
        );
        if (shareResult === "cancelled") setEmptyMissionFeedback("공유 취소", "cancelled");
        else if (shareResult === "copied") setEmptyMissionFeedback("복사됨", "success");
        else setEmptyMissionFeedback("공유 완료", "success");
      });
    });
    board.querySelector("[data-empty-mission-scope-copy]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      await runMissionButtonBusyAction(button, async () => {
        setEmptyMissionFeedback("범위 복사 중", "working");
        await copyWithButtonFeedback(
          button,
          buildMissionBoardScopeShareText(context, "0개 플랜"),
          "현재 빈 미션 보드 범위를 복사했습니다."
        );
        setEmptyMissionFeedback("범위 복사됨", "success");
      });
    });
    board.querySelector("[data-empty-mission-scope-share]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      await runMissionButtonBusyAction(button, async () => {
        setEmptyMissionFeedback("범위 공유 중", "working");
        const shareResult = await shareMissionBoardScopeText(button, context, "0개 플랜");
        if (shareResult === "cancelled") setEmptyMissionFeedback("범위 공유 취소", "cancelled");
        else if (shareResult === "copied") setEmptyMissionFeedback("범위 복사됨", "success");
        else setEmptyMissionFeedback("범위 공유 완료", "success");
      });
    });
    board.querySelectorAll("[data-empty-mission-scope-clear]").forEach((button) => {
      button.addEventListener("click", (event) => {
        runMissionButtonBusyAction(event.currentTarget, async () => {
          const scopeLabel = button.dataset.emptyMissionScopeLabel || "범위";
          const searchInput = document.getElementById("searchInput");
          const statusFilter = document.getElementById("statusFilter");
          const nextQuery = button.dataset.emptyMissionScopeClear === "query" ? "" : (searchInput?.value.trim() || context.query || "");
          const nextFilter = button.dataset.emptyMissionScopeClear === "filter" ? "all" : (statusFilter?.value || context.filter || "all");
          if (emptyFeedback) {
            emptyFeedback.dataset.emptyMissionActiveFilter = nextFilter;
            emptyFeedback.dataset.emptyMissionActiveFilterLabel = homeFilterLabel(nextFilter);
            emptyFeedback.dataset.emptyMissionActiveScopeLabel = missionBoardScopeLabel({ query: nextQuery, filter: nextFilter });
            emptyFeedback.dataset.emptyMissionActiveResultLabel = "목록 갱신 중";
          }
          setEmptyMissionFeedback(scopeLabel + " 해제 갱신 중", "working");
          if (searchInput) searchInput.value = nextQuery;
          if (statusFilter) statusFilter.value = nextFilter;
          syncHomeStatusFilterShortcuts(nextFilter);
          await loadPlans(nextQuery, nextFilter);
          loadQualitySummary();
        });
      });
    });
    board.querySelector("[data-empty-mission-reset]")?.addEventListener("click", (event) => {
      runMissionButtonBusyAction(event.currentTarget, async () => {
        if (emptyFeedback) {
          emptyFeedback.dataset.emptyMissionActiveFilter = "all";
          emptyFeedback.dataset.emptyMissionActiveFilterLabel = homeFilterLabel("all");
          emptyFeedback.dataset.emptyMissionActiveScopeLabel = missionBoardScopeLabel({ query: "", filter: "all" });
          emptyFeedback.dataset.emptyMissionActiveResultLabel = "목록 갱신 중";
        }
        setEmptyMissionFeedback(`전체 보기 갱신 중 · ${emptyScopeActionLabel}`, "working");
        const searchInput = document.getElementById("searchInput");
        const statusFilter = document.getElementById("statusFilter");
        if (searchInput) searchInput.value = "";
        if (statusFilter) statusFilter.value = "all";
        syncHomeStatusFilterShortcuts("all");
        await loadPlans("", "all");
        loadQualitySummary();
      });
    });
    board.classList.toggle("is-anchor-target", window.location.hash === "#tripMissionBoard");
    if (window.location.hash === "#tripMissionBoard") {
      board.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return;
  }
  const counts = items.reduce((result, plan) => {
    const status = getTripMissionStatus(plan);
    if (status === "upcoming") result.upcoming += 1;
    if (status === "active") result.active += 1;
    if (status === "completed") result.completed += 1;
    if (missionNeedsQuality(plan)) result.quality += 1;
    return result;
  }, { upcoming: 0, active: 0, completed: 0, quality: 0 });
  const focus = selectMissionFocus(items);
  const scopeDetail = missionBoardScopeDetail(context);
  const scopeTags = missionBoardScopeTags(context);
  const scopeTagMarkup = scopeTags.length
    ? `<div class="mission-scope-tags">${scopeTags.map((tag) => missionBoardScopeClearButton(tag)).join("")}</div>`
    : "";
  const activeFilter = context.filter || "all";
  const activeFilterLabel = homeFilterLabel(activeFilter);
  const activeScopeLabel = missionBoardScopeLabel(context);
  const scopeActionLabel = `${scopeDetail} · ${items.length}개 플랜`;
  const focusDestinationBadge = focus ? missionFocusDestinationBadge(focus) : "";
  const focusMarkup = focus
    ? `<div class="mission-focus"><span class="badge">${escapeText(focus.title)}</span>${focusDestinationBadge ? `<span class="mission-destination-badge">${escapeText(focusDestinationBadge)}</span>` : ""}<strong>${escapeText(focus.detail)}</strong><a href="${escapeText(missionFocusHref(focus))}" title="${escapeText(missionFocusLinkNote(focus) || focus.actionLabel)}">${escapeText(missionFocusActionLabel(focus))}</a><span class="mission-focus-actions" role="group" aria-labelledby="missionFocusBoardActionLabel" aria-describedby="missionFocusBoardFeedback"><span id="missionFocusBoardActionLabel" class="mission-focus-action-label" title="미션 보드가 고른 최우선 플랜의 복사, 공유, 링크, 이유 액션입니다.">최우선 액션</span><button type="button" class="secondary inline-action" data-mission-focus-copy title="${escapeText(`${focus.title || "최우선 미션"} 안내를 복사합니다.`)}" aria-label="${escapeText(`최우선 액션: ${focus.title || "최우선 미션"} 안내 복사`)}" aria-describedby="missionFocusBoardFeedback">최우선 복사</button><button type="button" class="secondary inline-action" data-mission-focus-share title="${escapeText(`${focus.title || "최우선 미션"} 안내를 공유합니다.`)}" aria-label="${escapeText(`최우선 액션: ${focus.title || "최우선 미션"} 안내 공유`)}" aria-describedby="missionFocusBoardFeedback">최우선 공유</button><button type="button" class="secondary inline-action" data-mission-focus-link-copy title="${escapeText(`${focus.title || "최우선 미션"} 링크만 복사합니다.`)}" aria-label="${escapeText(`최우선 액션: ${focus.title || "최우선 미션"} 링크 복사`)}" aria-describedby="missionFocusBoardFeedback">최우선 링크</button><button type="button" class="secondary inline-action" data-mission-focus-reason-copy title="${escapeText(`${focus.title || "최우선 미션"} 선정 이유를 복사합니다.`)}" aria-label="${escapeText(`최우선 액션: ${focus.title || "최우선 미션"} 선정 이유 복사`)}" aria-describedby="missionFocusBoardFeedback">최우선 이유</button><span id="missionFocusBoardFeedback" class="mission-focus-feedback" role="status" aria-live="polite" aria-atomic="true" data-state="ready" data-mission-focus-feedback>액션 준비</span></span></div>`
    : '<div class="mission-focus"><span class="badge">정리 완료</span><strong>지금 바로 처리할 여행 미션이 없습니다.</strong></div>';
  board.innerHTML = `
    <div class="mission-board-header">
      <span>${escapeText(scopeDetail)}</span>
      <span>${items.length}개 플랜</span>
    </div>
    ${scopeTagMarkup}
    ${focusMarkup}
    <div class="mission-stats" role="group" aria-labelledby="missionStatsFilterLabel" aria-describedby="missionBoardFeedback">
      <span id="missionStatsFilterLabel" class="mission-focus-action-label" title="현재 미션 보드 목록을 상태별로 필터링합니다.">상태 필터</span>
      ${missionStatButton("전체", "all", items.length, context.filter)}
      ${missionStatButton("예정", "upcoming", counts.upcoming, context.filter)}
      ${missionStatButton("여행 중", "active", counts.active, context.filter)}
      ${missionStatButton("완료", "completed", counts.completed, context.filter)}
      ${missionStatButton("품질 후보", "quality-action", counts.quality, context.filter)}
    </div>
    <div class="runway-share-actions" role="group" aria-labelledby="missionBoardActionLabel" aria-describedby="missionBoardFeedback">
      <span id="missionBoardActionLabel" class="mission-focus-action-label" title="현재 미션 보드의 복사, 공유, 링크, 범위 복사/공유, 범위 초기화 액션입니다.">보드 공유</span>
      <button type="button" class="secondary inline-action" data-mission-board-copy title="${escapeText(`${activeScopeLabel} ${items.length}개 플랜 미션 보드 내용을 복사합니다.`)}" aria-label="${escapeText(`보드 공유: ${activeScopeLabel} ${items.length}개 플랜 미션 보드 내용 복사`)}" aria-describedby="missionBoardFeedback">미션 보드 복사</button>
      <button type="button" class="secondary inline-action" data-mission-board-share title="${escapeText(`${activeScopeLabel} ${items.length}개 플랜 미션 보드를 공유합니다.`)}" aria-label="${escapeText(`보드 공유: ${activeScopeLabel} ${items.length}개 플랜 미션 보드 공유`)}" aria-describedby="missionBoardFeedback">미션 보드 공유</button>
      <button type="button" class="secondary inline-action" data-mission-board-link-copy title="미션 보드 링크만 복사합니다." aria-label="보드 공유: 미션 보드 링크 복사" aria-describedby="missionBoardFeedback">미션 보드 링크</button>
      <button type="button" class="secondary inline-action" data-mission-board-last-action-preview title="최근 상태 카운트 동작 요약을 화면 피드백으로 다시 표시합니다." aria-label="보드 공유: 최근 상태 카운트 동작 보기" aria-describedby="missionBoardFeedback">최근 동작 보기</button>
      <button type="button" class="secondary inline-action" data-mission-board-last-action-clear title="최근 상태 카운트 동작 요약을 지웁니다." aria-label="보드 공유: 최근 상태 카운트 동작 지우기" aria-describedby="missionBoardFeedback">최근 동작 지우기</button>
      <button type="button" class="secondary inline-action" data-mission-board-last-action-copy title="${escapeText(`${activeScopeLabel} ${items.length}개 플랜 최근 동작 요약을 복사합니다.`)}" aria-label="${escapeText(`보드 공유: ${activeScopeLabel} ${items.length}개 플랜 최근 동작 복사`)}" aria-describedby="missionBoardFeedback">최근 동작 복사</button>
      <button type="button" class="secondary inline-action" data-mission-board-last-action-prime title="${escapeText(`${activeScopeLabel} ${items.length}개 플랜을 최근 동작으로 기록합니다.`)}" aria-label="${escapeText(`보드 공유: ${activeScopeLabel} ${items.length}개 플랜 최근 동작 기록`)}" aria-describedby="missionBoardFeedback">최근 동작 만들기</button>
      <details class="inline-tool-group mission-board-json-tools" aria-labelledby="missionBoardJsonToolsSummary" aria-describedby="missionBoardJsonToolsNote">
        <summary id="missionBoardJsonToolsSummary" title="JSON 도구가 접혀 있습니다. 열면 최근 상태 카운트 동작의 JSON 복사, 보기, 파일, 해시, 공유, 열림 초기화 도구 6개를 볼 수 있습니다." aria-label="보드 공유: 최근 동작 JSON 도구 6개: 복사, 보기, 파일, 해시, 공유, 열림 초기화. 열린 상태에서는 Escape로 접을 수 있습니다." aria-expanded="false" aria-describedby="missionBoardFeedback missionBoardJsonToolsNote">JSON 도구 <span class="mission-board-json-tool-count">6개</span><span class="mission-board-json-escape-hint" aria-hidden="true">Esc 닫기</span></summary>
        <span id="missionBoardJsonToolsNote" class="mission-board-json-tools-note">JSON 파일은 자동화 handoff, JSON 해시는 무결성 확인, JSON 공유는 전달용입니다. 비어 있으면 최근 동작 만들기로 현재 보드를 기록하세요.</span>
        <button type="button" class="secondary inline-action" data-mission-board-last-action-json-copy title="최근 상태 카운트 동작 metadata와 현재 보드 맥락을 JSON으로 복사합니다." aria-label="보드 공유: 최근 상태 카운트 동작 및 보드 맥락 JSON 복사" aria-describedby="missionBoardFeedback">최근 동작 JSON</button>
        <button type="button" class="secondary inline-action" data-mission-board-last-action-json-preview title="최근 상태 카운트 동작 metadata와 현재 보드 맥락 JSON 요약을 확인합니다." aria-label="보드 공유: 최근 상태 카운트 동작 및 보드 맥락 JSON 미리보기" aria-describedby="missionBoardFeedback">JSON 보기</button>
        <button type="button" class="secondary inline-action" data-mission-board-last-action-json-download title="최근 상태 카운트 동작 metadata와 현재 보드 맥락 JSON 파일을 다운로드합니다." aria-label="보드 공유: 최근 상태 카운트 동작 및 보드 맥락 JSON 파일 다운로드" aria-describedby="missionBoardFeedback">JSON 파일</button>
        <button type="button" class="secondary inline-action" data-mission-board-last-action-json-hash title="최근 상태 카운트 동작 metadata와 현재 보드 맥락 JSON의 SHA-256 해시를 복사합니다." aria-label="보드 공유: 최근 상태 카운트 동작 및 보드 맥락 JSON SHA-256 해시 복사" aria-describedby="missionBoardFeedback">JSON 해시</button>
        <button type="button" class="secondary inline-action" data-mission-board-last-action-json-share title="최근 상태 카운트 동작 metadata와 현재 보드 맥락 JSON을 공유합니다." aria-label="보드 공유: 최근 상태 카운트 동작 및 보드 맥락 JSON 공유" aria-describedby="missionBoardFeedback">JSON 공유</button>
        <button type="button" class="secondary inline-action" data-mission-board-json-tools-reset title="같은 탭에 저장된 JSON 도구 열림 상태를 지우고 접습니다." aria-label="보드 공유: 최근 동작 JSON 도구 열림 상태 초기화" aria-describedby="missionBoardFeedback">열림 초기화</button>
      </details>
      <button type="button" class="secondary inline-action" data-mission-board-last-action-share title="최근 상태 카운트 동작 요약을 공유합니다." aria-label="보드 공유: 최근 상태 카운트 동작 공유" aria-describedby="missionBoardFeedback">최근 동작 공유</button>
      ${scopeTags.length ? `<button type="button" class="secondary inline-action" data-mission-board-scope-copy title="${escapeText(`${scopeActionLabel} 범위만 복사합니다.`)}" aria-label="${escapeText(`보드 공유: ${scopeActionLabel} 범위 복사`)}" aria-describedby="missionBoardFeedback">범위 복사</button>` : ""}
      ${scopeTags.length ? `<button type="button" class="secondary inline-action" data-mission-board-scope-share title="${escapeText(`${scopeActionLabel} 범위를 공유합니다.`)}" aria-label="${escapeText(`보드 공유: ${scopeActionLabel} 범위 공유`)}" aria-describedby="missionBoardFeedback">범위 공유</button>` : ""}
      ${scopeTags.length ? missionBoardScopeResetButton({ scopeLabel: scopeActionLabel }) : ""}
      <span id="missionBoardFeedback" class="mission-focus-feedback mission-board-feedback" role="status" aria-live="polite" aria-atomic="true" data-state="ready" data-mission-board-active-filter="${escapeText(activeFilter)}" data-mission-board-active-filter-label="${escapeText(activeFilterLabel)}" data-mission-board-active-scope-label="${escapeText(activeScopeLabel)}" data-mission-board-active-result-label="${items.length}개 플랜" title="${escapeText(`미션 보드 대기 상태: 보드 준비 · 현재 범위: ${activeScopeLabel} · 결과: ${items.length}개 플랜`)}" aria-label="${escapeText(`미션 보드 대기 상태: 보드 준비 · 현재 범위: ${activeScopeLabel} · 결과: ${items.length}개 플랜`)}" data-mission-board-feedback>보드 준비 · ${items.length}개 플랜</span>
    </div>
  `;
  const boardFeedback = board.querySelector("[data-mission-board-feedback]");
  let boardFeedbackTimer = null;
  let boardFeedbackResetToken = 0;
  const jsonTools = board.querySelector(".mission-board-json-tools");
  const jsonToolsSummary = jsonTools?.querySelector("summary");
  const jsonToolsStorageKey = "travelPlannerMissionBoardJsonToolsOpen";
  let wasJsonToolsOpenRestored = false;
  let isJsonToolsResetting = false;
  const readMissionBoardJsonToolsOpen = () => {
    try {
      return window.sessionStorage?.getItem(jsonToolsStorageKey) === "true";
    } catch {
      return false;
    }
  };
  const writeMissionBoardJsonToolsOpen = (isOpen) => {
    try {
      window.sessionStorage?.setItem(jsonToolsStorageKey, isOpen ? "true" : "false");
    } catch {
      // Ignore browsers that block session storage; the tools still work for this render.
    }
  };
  const updateMissionBoardJsonToolsSummary = () => {
    if (!jsonToolsSummary) return;
    const isOpen = Boolean(jsonTools?.open);
    jsonToolsSummary.setAttribute("aria-expanded", isOpen ? "true" : "false");
    jsonToolsSummary.title = isOpen
      ? `JSON 도구가 열려 있습니다. 최근 상태 카운트 동작의 JSON 복사, 보기, 파일, 해시, 공유, 열림 초기화 도구 6개입니다. Escape로 접을 수 있습니다.${wasJsonToolsOpenRestored ? " 같은 탭에서 열린 상태가 유지되었습니다." : ""}`
      : "JSON 도구가 접혀 있습니다. 열면 최근 상태 카운트 동작의 JSON 복사, 보기, 파일, 해시, 공유, 열림 초기화 도구 6개를 볼 수 있습니다.";
  };
  wasJsonToolsOpenRestored = readMissionBoardJsonToolsOpen();
  if (jsonTools) jsonTools.open = wasJsonToolsOpenRestored;
  updateMissionBoardJsonToolsSummary();
  jsonTools?.addEventListener("toggle", () => {
    updateMissionBoardJsonToolsSummary();
    writeMissionBoardJsonToolsOpen(Boolean(jsonTools.open));
    if (isJsonToolsResetting) {
      isJsonToolsResetting = false;
      return;
    }
    setMissionBoardFeedback(
      jsonTools.open ? "JSON 도구 열림 · 복사/보기/파일/해시/공유/초기화 6개" : "JSON 도구 접힘 · 기본 보드 공유 액션 표시",
      "info"
    );
  });
  jsonTools?.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !jsonTools.open) return;
    event.preventDefault();
    event.stopPropagation();
    writeMissionBoardJsonToolsOpen(false);
    wasJsonToolsOpenRestored = false;
    isJsonToolsResetting = true;
    jsonTools.open = false;
    updateMissionBoardJsonToolsSummary();
    jsonToolsSummary?.focus();
    setMissionBoardFeedback("JSON 도구 Escape로 접힘 · 다음 갱신부터 접힘", "success");
  });
  const setMissionBoardFeedback = (message, state = "ready", autoReset = state !== "ready" && state !== "working") => {
    if (!boardFeedback) return;
    boardFeedbackResetToken += 1;
    if (boardFeedbackTimer) {
      window.clearTimeout(boardFeedbackTimer);
      boardFeedbackTimer = null;
    }
    const feedbackUpdatedDate = new Date();
    const feedbackUpdatedAt = feedbackUpdatedDate.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    const feedbackUpdatedAtIso = feedbackUpdatedDate.toISOString();
    const feedbackMode = autoReset ? "작업 결과" : state === "working" ? "진행 상태" : "대기 상태";
    const feedbackScopeLabel = boardFeedback.dataset.missionBoardActiveScopeLabel || boardFeedback.dataset.missionBoardActiveFilterLabel || "전체";
    const feedbackResultLabel = boardFeedback.dataset.missionBoardActiveResultLabel || `${items.length}개 플랜`;
    const feedbackAction = boardFeedback.dataset.missionBoardActiveAction || "";
    const feedbackActionLabel = feedbackAction === "notice"
      ? "안내 동작"
      : feedbackAction === "refresh"
      ? "목록 갱신 동작"
      : feedbackAction === "current"
      ? "현재 보기 안내"
      : "";
    const feedbackActionTargetLabel = feedbackAction
      ? boardFeedback.dataset.missionBoardNoticeTargetLabel || boardFeedback.dataset.missionBoardActiveFilterLabel || ""
      : "";
    const feedbackActionTargetText = feedbackActionTargetLabel ? ` (${feedbackActionTargetLabel})` : "";
    const feedbackActionOrigin = feedbackAction ? MISSION_BOARD_LAST_ACTION_ORIGINS.statusCountFeedback : "";
    const feedbackActionOriginLabel = feedbackActionOrigin ? missionBoardLastActionOriginLabel(feedbackActionOrigin) : "";
    const feedbackActionOriginText = feedbackActionOriginLabel ? ` · 출처: ${feedbackActionOriginLabel}` : "";
    const feedbackActionVisibleText = feedbackActionLabel ? `동작: ${feedbackActionLabel}${feedbackActionTargetText}${feedbackActionOriginText}` : "";
    const feedbackActionSummary = feedbackActionLabel
      ? feedbackActionTargetLabel
        ? `${feedbackActionLabel}: ${feedbackActionTargetLabel}`
        : feedbackActionLabel
      : "";
    const feedbackActionText = feedbackActionVisibleText ? ` · ${feedbackActionVisibleText}` : "";
    const showLastActionOnReady = !feedbackAction && state === "ready" && boardFeedback.dataset.missionBoardShowLastActionOnReady === "true";
    const feedbackLastActionSummary = showLastActionOnReady ? boardFeedback.dataset.missionBoardLastActionSummary || "" : "";
    const feedbackLastActionOriginLabel = showLastActionOnReady ? boardFeedback.dataset.missionBoardLastActionOriginLabel || "" : "";
    const feedbackLastActionUpdatedAt = showLastActionOnReady ? boardFeedback.dataset.missionBoardLastActionUpdatedAt || "" : "";
    const feedbackLastActionText = feedbackLastActionSummary
      ? ` · 마지막 동작: ${feedbackLastActionSummary}${feedbackLastActionOriginLabel ? ` · 출처: ${feedbackLastActionOriginLabel}` : ""}${feedbackLastActionUpdatedAt ? ` (${feedbackLastActionUpdatedAt})` : ""}`
      : "";
    const feedbackLastActionVisibleText = feedbackLastActionSummary
      ? `최근: ${feedbackLastActionSummary}${feedbackLastActionOriginLabel ? ` · 출처: ${feedbackLastActionOriginLabel}` : ""}`
      : "";
    const feedbackSummary = missionBoardFeedbackSummary(message, feedbackResultLabel);
    const feedbackLabel = `미션 보드 ${feedbackMode}: ${message}${feedbackActionText}${feedbackLastActionText} · 현재 범위: ${feedbackScopeLabel} · ${feedbackSummary.detail} (업데이트 ${feedbackUpdatedAt})`;
    boardFeedback.textContent = feedbackActionVisibleText
      ? `${feedbackSummary.text} · ${feedbackActionVisibleText}`
      : feedbackLastActionVisibleText
      ? `${feedbackSummary.text} · ${feedbackLastActionVisibleText}`
      : feedbackSummary.text;
    boardFeedback.dataset.state = state;
    boardFeedback.dataset.updatedAt = feedbackUpdatedAt;
    boardFeedback.title = feedbackLabel;
    boardFeedback.setAttribute("aria-label", feedbackLabel);
    if (showLastActionOnReady) {
      delete boardFeedback.dataset.missionBoardShowLastActionOnReady;
    }
    if (feedbackAction) {
      boardFeedback.dataset.missionBoardLastAction = feedbackAction;
      boardFeedback.dataset.missionBoardLastActionLabel = feedbackActionLabel;
      boardFeedback.dataset.missionBoardLastActionOrigin = feedbackActionOrigin;
      boardFeedback.dataset.missionBoardLastActionOriginLabel = feedbackActionOriginLabel;
      boardFeedback.dataset.missionBoardLastActionSummary = feedbackActionSummary;
      boardFeedback.dataset.missionBoardLastActionScopeLabel = feedbackScopeLabel;
      boardFeedback.dataset.missionBoardLastActionResultLabel = feedbackResultLabel;
      boardFeedback.dataset.missionBoardLastActionUpdatedAt = feedbackUpdatedAt;
      boardFeedback.dataset.missionBoardLastActionUpdatedAtIso = feedbackUpdatedAtIso;
      if (feedbackActionTargetLabel) {
        boardFeedback.dataset.missionBoardLastActionTargetLabel = feedbackActionTargetLabel;
      } else {
        delete boardFeedback.dataset.missionBoardLastActionTargetLabel;
      }
      if (autoReset) {
        boardFeedback.dataset.missionBoardShowLastActionOnReady = "true";
      } else {
        delete boardFeedback.dataset.missionBoardShowLastActionOnReady;
      }
      delete boardFeedback.dataset.missionBoardActiveAction;
      delete boardFeedback.dataset.missionBoardNoticeTargetLabel;
    } else if (state !== "ready") {
      delete boardFeedback.dataset.missionBoardShowLastActionOnReady;
    }
    if (autoReset) {
      const resetToken = boardFeedbackResetToken;
      boardFeedbackTimer = window.setTimeout(() => {
        if (resetToken !== boardFeedbackResetToken) return;
        setMissionBoardFeedback("보드 준비", "ready", false);
      }, 2200);
    }
  };
  if (wasJsonToolsOpenRestored) {
    setMissionBoardFeedback("JSON 도구 열림 유지 · 같은 탭에서 복원됨", "info");
  }
  board.querySelector("[data-mission-board-json-tools-reset]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      writeMissionBoardJsonToolsOpen(false);
      wasJsonToolsOpenRestored = false;
      const wasOpen = Boolean(jsonTools?.open);
      isJsonToolsResetting = wasOpen;
      if (jsonTools) jsonTools.open = false;
      if (!wasOpen) isJsonToolsResetting = false;
      updateMissionBoardJsonToolsSummary();
      setMissionBoardFeedback("JSON 도구 열림 상태 초기화됨 · 미션 보드 복사로 이동", "success");
      board.querySelector("[data-mission-board-copy]")?.focus();
    });
  });
  const focusFeedback = board.querySelector("[data-mission-focus-feedback]");
  let focusFeedbackTimer = null;
  let focusFeedbackResetToken = 0;
  const setMissionFocusFeedback = (message, state = "ready", autoReset = state !== "ready" && state !== "working") => {
    if (!focusFeedback) return;
    focusFeedbackResetToken += 1;
    if (focusFeedbackTimer) {
      window.clearTimeout(focusFeedbackTimer);
      focusFeedbackTimer = null;
    }
    const feedbackUpdatedAt = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    const feedbackMode = autoReset ? "작업 결과" : state === "working" ? "진행 상태" : "대기 상태";
    const feedbackLabel = `최우선 액션 ${feedbackMode}: ${message} (업데이트 ${feedbackUpdatedAt})`;
    focusFeedback.textContent = message;
    focusFeedback.dataset.state = state;
    focusFeedback.dataset.updatedAt = feedbackUpdatedAt;
    focusFeedback.title = feedbackLabel;
    focusFeedback.setAttribute("aria-label", feedbackLabel);
    if (autoReset) {
      const resetToken = focusFeedbackResetToken;
      focusFeedbackTimer = window.setTimeout(() => {
        if (resetToken !== focusFeedbackResetToken) return;
        setMissionFocusFeedback("액션 준비", "ready", false);
      }, 2200);
    }
  };
  board.querySelectorAll("[data-mission-filter]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const filterLabel = button.dataset.missionFilterLabel || button.textContent.trim() || "필터";
      const filterCount = button.dataset.missionFilterCount;
      const countSuffix = filterCount ? ` · ${filterCount}개 플랜` : "";
      const nextFilter = button.dataset.missionFilter || "all";
      const isAlreadyActive = context.filter === nextFilter;
      const filterAction = button.dataset.missionFilterAction || "refresh";
      if (filterAction === "notice") {
        const noticeScopeLabel = missionBoardScopeLabel(context);
        if (boardFeedback) {
          boardFeedback.dataset.missionBoardActiveFilter = context.filter || "all";
          boardFeedback.dataset.missionBoardActiveFilterLabel = homeFilterLabel(context.filter || "all");
          boardFeedback.dataset.missionBoardActiveScopeLabel = noticeScopeLabel;
          boardFeedback.dataset.missionBoardActiveResultLabel = `${filterLabel} 0개 플랜`;
          boardFeedback.dataset.missionBoardActiveAction = filterAction;
          boardFeedback.dataset.missionBoardNoticeTargetLabel = filterLabel;
        }
        setMissionBoardFeedback(`${filterLabel} · 0개 플랜 없음 · 현재 범위: ${noticeScopeLabel}`, "info");
        return;
      }
      if (boardFeedback) {
        boardFeedback.dataset.missionBoardActiveFilter = nextFilter;
        boardFeedback.dataset.missionBoardActiveFilterLabel = filterLabel;
        boardFeedback.dataset.missionBoardActiveScopeLabel = missionBoardScopeLabel({ ...context, filter: nextFilter });
        boardFeedback.dataset.missionBoardActiveResultLabel = `${filterCount || 0}개 플랜`;
        boardFeedback.dataset.missionBoardActiveAction = isAlreadyActive ? "current" : filterAction;
        delete boardFeedback.dataset.missionBoardNoticeTargetLabel;
      }
      setMissionBoardFeedback(isAlreadyActive ? `이미 ${filterLabel}${countSuffix} 보기 중` : `${filterLabel}${countSuffix} 보기 갱신 중`, isAlreadyActive ? "info" : "working");
      if (isAlreadyActive) return;
      await runMissionButtonBusyAction(event.currentTarget, async () => {
        const searchInput = document.getElementById("searchInput");
        const statusFilter = document.getElementById("statusFilter");
        const nextQuery = searchInput?.value.trim() || context.query || "";
        if (statusFilter) statusFilter.value = nextFilter;
        syncHomeStatusFilterShortcuts(nextFilter);
        await loadPlans(nextQuery, nextFilter);
        restoreMissionBoardLastActionFeedback({
          action: filterAction,
          actionLabel: "목록 갱신 동작",
          targetLabel: filterLabel,
          scopeLabel: missionBoardScopeLabel({ ...context, filter: nextFilter }),
          resultLabel: `${filterCount || 0}개 플랜`,
        });
        loadQualitySummary();
      });
    });
  });
  board.querySelector("[data-mission-board-copy]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      setMissionBoardFeedback("복사 중", "working");
      await copyWithButtonFeedback(
        button,
        buildMissionBoardShareText(items, counts, focus, context),
        "현재 여행 미션 보드를 복사했습니다."
      );
      setMissionBoardFeedback("미션 보드 복사됨 · 미션 보드 공유로 이동", "success");
      board.querySelector("[data-mission-board-share]")?.focus();
    });
  });
  board.querySelector("[data-mission-board-share]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      setMissionBoardFeedback("공유 중", "working");
      const shareResult = await shareMissionBoardText(
        button,
        buildMissionBoardShareText(items, counts, focus, context),
        missionBoardUrl(context)
      );
      if (shareResult === "cancelled") {
        setMissionBoardFeedback("공유 취소", "cancelled");
      } else {
        setMissionBoardFeedback(shareResult === "copied" ? "미션 보드 복사됨 · 미션 보드 링크로 이동" : "미션 보드 공유 완료 · 미션 보드 링크로 이동", "success");
        board.querySelector("[data-mission-board-link-copy]")?.focus();
      }
    });
  });
  board.querySelector("[data-mission-focus-copy]")?.addEventListener("click", async (event) => {
    if (!focus) return;
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      setMissionFocusFeedback("복사 중", "working");
      await copyWithButtonFeedback(
        button,
        buildMissionFocusShareText(focus, context),
        "최우선 미션을 복사했습니다."
      );
      setMissionFocusFeedback("복사됨", "success");
    });
  });
  board.querySelector("[data-mission-focus-share]")?.addEventListener("click", async (event) => {
    if (!focus) return;
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      setMissionFocusFeedback("공유 중", "working");
      const shareResult = await shareMissionFocusText(
        button,
        buildMissionFocusShareText(focus, context),
        missionFocusUrl(focus)
      );
      if (shareResult === "cancelled") setMissionFocusFeedback("공유 취소", "cancelled");
      else if (shareResult === "copied") setMissionFocusFeedback("복사됨", "success");
      else setMissionFocusFeedback("공유 완료", "success");
    });
  });
  board.querySelector("[data-mission-focus-link-copy]")?.addEventListener("click", async (event) => {
    if (!focus) return;
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      setMissionFocusFeedback("링크 복사 중", "working");
      await copyWithButtonFeedback(
        button,
        missionFocusUrl(focus),
        "최우선 미션 링크를 복사했습니다."
      );
      setMissionFocusFeedback("링크 복사됨", "success");
    });
  });
  board.querySelector("[data-mission-focus-reason-copy]")?.addEventListener("click", async (event) => {
    if (!focus) return;
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      setMissionFocusFeedback("이유 복사 중", "working");
      await copyWithButtonFeedback(
        button,
        buildMissionFocusReasonText(focus, context, focus.destination || "최우선 플랜"),
        "최우선 선정 이유를 복사했습니다."
      );
      setMissionFocusFeedback("이유 복사됨", "success");
    });
  });
  board.querySelector("[data-mission-board-link-copy]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      setMissionBoardFeedback("링크 복사 중", "working");
      await copyWithButtonFeedback(
        button,
        missionBoardUrl(context),
        "현재 여행 미션 보드 링크를 복사했습니다."
      );
      setMissionBoardFeedback("링크 복사됨", "success");
    });
  });
  const focusMissionBoardLastActionPrime = () => {
    board.querySelector("[data-mission-board-last-action-prime]")?.focus();
    setMissionBoardFeedback(`최근 동작 없음 · 최근 동작 만들기로 ${activeScopeLabel} ${items.length}개 플랜을 기록한 뒤 다시 시도`, "info", false);
  };
  board.querySelector("[data-mission-board-last-action-preview]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      const lastActionSummary = boardFeedback?.dataset?.missionBoardLastActionSummary || "";
      if (!lastActionSummary) {
        focusMissionBoardLastActionPrime();
        return;
      }
      const lastActionParts = [
        `최근 동작: ${lastActionSummary}`,
        boardFeedback.dataset.missionBoardLastActionTargetLabel ? `대상 ${boardFeedback.dataset.missionBoardLastActionTargetLabel}` : "",
        boardFeedback.dataset.missionBoardLastActionOriginLabel ? `출처 ${boardFeedback.dataset.missionBoardLastActionOriginLabel}` : "",
        boardFeedback.dataset.missionBoardLastActionResultLabel || "",
      ];
      setMissionBoardFeedback(lastActionParts.filter(Boolean).join(" · "), "info", false);
    });
  });
  board.querySelector("[data-mission-board-last-action-clear]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      if (!boardFeedback?.dataset?.missionBoardLastActionSummary) {
        focusMissionBoardLastActionPrime();
        return;
      }
      [
        "missionBoardLastAction",
        "missionBoardLastActionLabel",
        "missionBoardLastActionOrigin",
        "missionBoardLastActionOriginLabel",
        "missionBoardLastActionSummary",
        "missionBoardLastActionTargetLabel",
        "missionBoardLastActionScopeLabel",
        "missionBoardLastActionResultLabel",
        "missionBoardLastActionUpdatedAt",
        "missionBoardLastActionUpdatedAtIso",
        "missionBoardShowLastActionOnReady",
      ].forEach((key) => delete boardFeedback.dataset[key]);
      setMissionBoardFeedback("최근 동작 지움 · 복사/공유 비움", "success");
    });
  });
  board.querySelector("[data-mission-board-last-action-copy]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      const lastActionText = buildMissionBoardLastActionShareText(boardFeedback, missionBoardUrl(context));
      if (!lastActionText) {
        focusMissionBoardLastActionPrime();
        return;
      }
      setMissionBoardFeedback("최근 동작 복사 중", "working");
      await copyWithButtonFeedback(button, lastActionText, "최근 미션 보드 동작을 복사했습니다.");
      const jsonCopyButton = board.querySelector("[data-mission-board-last-action-json-copy]");
      if (jsonTools && !jsonTools.open) {
        isJsonToolsResetting = true;
        jsonTools.open = true;
      }
      writeMissionBoardJsonToolsOpen(true);
      updateMissionBoardJsonToolsSummary();
      setMissionBoardFeedback("최근 동작 복사됨 · JSON 복사로 이동", "success");
      jsonCopyButton?.focus();
    });
  });
  board.querySelector("[data-mission-board-last-action-prime]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      const currentFilter = context.filter || "all";
      const targetButton = Array.from(board.querySelectorAll("[data-mission-filter]"))
        .find((candidate) => (candidate.dataset.missionFilter || "all") === currentFilter)
        || board.querySelector("[data-mission-filter]");
      const targetLabel = targetButton?.dataset?.missionFilterLabel || targetButton?.textContent?.trim() || "현재 보기";
      const targetCount = currentFilter === "upcoming"
        ? counts.upcoming
        : currentFilter === "active"
          ? counts.active
          : currentFilter === "completed"
            ? counts.completed
            : currentFilter === "quality-action"
              ? counts.quality
              : items.length;
      const targetCountLabel = String(targetCount || 0);
      const nextActionButton = board.querySelector("[data-mission-board-last-action-copy]");
      if (boardFeedback) {
        boardFeedback.dataset.missionBoardActiveFilter = currentFilter;
        boardFeedback.dataset.missionBoardActiveFilterLabel = targetLabel;
        boardFeedback.dataset.missionBoardActiveScopeLabel = missionBoardScopeLabel(context);
        boardFeedback.dataset.missionBoardActiveResultLabel = `${targetCountLabel}개 플랜`;
        boardFeedback.dataset.missionBoardActiveAction = "current";
        delete boardFeedback.dataset.missionBoardNoticeTargetLabel;
      }
      setMissionBoardFeedback(`${targetLabel} ${targetCountLabel}개 플랜 · 최근 동작 기록됨 · 최근 동작 복사로 이동`, "success", false);
      nextActionButton?.focus();
    });
  });
  board.querySelector("[data-mission-board-last-action-json-copy]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      const lastActionJson = buildMissionBoardLastActionJsonText(
        boardFeedback,
        missionBoardUrl(context),
        context,
        {
          total: items.length,
          upcoming: counts.upcoming,
          active: counts.active,
          completed: counts.completed,
          quality: counts.quality,
        }
      );
      if (!lastActionJson) {
        focusMissionBoardLastActionPrime();
        return;
      }
      setMissionBoardFeedback("최근 동작+보드 맥락 JSON 복사 중", "working");
      await copyWithButtonFeedback(button, lastActionJson, "최근 미션 보드 동작과 보드 맥락 JSON을 복사했습니다.");
      setMissionBoardFeedback("최근 동작 JSON 복사됨 · JSON 파일/해시/공유도 가능", "success");
      board.querySelector("[data-mission-board-last-action-json-download]")?.focus();
    });
  });
  board.querySelector("[data-mission-board-last-action-json-preview]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      const lastActionJson = buildMissionBoardLastActionJsonText(
        boardFeedback,
        missionBoardUrl(context),
        context,
        {
          total: items.length,
          upcoming: counts.upcoming,
          active: counts.active,
          completed: counts.completed,
          quality: counts.quality,
        }
      );
      if (!lastActionJson) {
        focusMissionBoardLastActionPrime();
        return;
      }
      const payload = JSON.parse(lastActionJson);
      const boardContext = payload.boardContext || {};
      const actionLabel = payload.actionLabel || payload.action || payload.label || "최근 동작";
      const scopeLabel = boardContext.scopeLabel || boardContext.scopeDetail || "전체 미션";
      const resultLabel = boardContext.resultLabel || "결과 수 확인 불가";
      const statusSummary = boardContext.statusSummary ? ` · ${boardContext.statusSummary}` : "";
      setMissionBoardFeedback(`${actionLabel} JSON · ${scopeLabel} · ${resultLabel}${statusSummary}`, "info");
    });
  });
  board.querySelector("[data-mission-board-last-action-json-download]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      const lastActionJson = buildMissionBoardLastActionJsonText(
        boardFeedback,
        missionBoardUrl(context),
        context,
        {
          total: items.length,
          upcoming: counts.upcoming,
          active: counts.active,
          completed: counts.completed,
          quality: counts.quality,
        }
      );
      if (!lastActionJson) {
        focusMissionBoardLastActionPrime();
        return;
      }
      const payload = JSON.parse(lastActionJson);
      const fileStamp = String(payload.generatedAtIso || new Date().toISOString()).replace(/[:.]/g, "-");
      const blob = new Blob([`${lastActionJson}\n`], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `travel-planner-mission-board-last-action-${fileStamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMissionBoardFeedback("최근 동작 JSON 파일 저장됨 · JSON 해시로 무결성 확인 가능", "success");
      board.querySelector("[data-mission-board-last-action-json-hash]")?.focus();
    });
  });
  board.querySelector("[data-mission-board-last-action-json-hash]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      const lastActionJson = buildMissionBoardLastActionJsonText(
        boardFeedback,
        missionBoardUrl(context),
        context,
        {
          total: items.length,
          upcoming: counts.upcoming,
          active: counts.active,
          completed: counts.completed,
          quality: counts.quality,
        }
      );
      if (!lastActionJson) {
        focusMissionBoardLastActionPrime();
        return;
      }
      if (!window.crypto?.subtle) {
        setMissionBoardFeedback("이 브라우저는 JSON 해시 계산을 지원하지 않습니다.", "info");
        return;
      }
      setMissionBoardFeedback("최근 동작 JSON 해시 계산 중", "working");
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(lastActionJson));
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      await copyWithButtonFeedback(button, `sha256 ${hashHex}`, "최근 미션 보드 동작 JSON SHA-256 해시를 복사했습니다.");
      setMissionBoardFeedback(`최근 동작 JSON SHA-256 복사됨 · ${hashHex.slice(0, 12)}... · JSON 공유로 전달 가능`, "success");
      board.querySelector("[data-mission-board-last-action-json-share]")?.focus();
    });
  });
  board.querySelector("[data-mission-board-last-action-json-share]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      const lastActionJson = buildMissionBoardLastActionJsonText(
        boardFeedback,
        missionBoardUrl(context),
        context,
        {
          total: items.length,
          upcoming: counts.upcoming,
          active: counts.active,
          completed: counts.completed,
          quality: counts.quality,
        }
      );
      if (!lastActionJson) {
        focusMissionBoardLastActionPrime();
        return;
      }
      setMissionBoardFeedback("최근 동작 JSON 공유 중", "working");
      const shareResult = await shareMissionBoardText(
        button,
        lastActionJson,
        missionBoardUrl(context),
        "Travel Planner 미션 보드 최근 동작 JSON",
        "최근 미션 보드 동작과 보드 맥락 JSON을 복사했습니다."
      );
      if (shareResult === "cancelled") {
        setMissionBoardFeedback("공유 취소", "cancelled");
      } else {
        setMissionBoardFeedback(shareResult === "copied" ? "최근 동작 JSON 복사됨 · 열림 초기화 가능" : "최근 동작 JSON 공유 완료 · 열림 초기화 가능", "success");
        board.querySelector("[data-mission-board-json-tools-reset]")?.focus();
      }
    });
  });

  board.querySelector("[data-mission-board-last-action-share]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      const lastActionText = buildMissionBoardLastActionShareText(boardFeedback, missionBoardUrl(context));
      if (!lastActionText) {
        focusMissionBoardLastActionPrime();
        return;
      }
      setMissionBoardFeedback("최근 동작 공유 중", "working");
      const shareResult = await shareMissionBoardText(
        button,
        lastActionText,
        missionBoardUrl(context),
        "Travel Planner 미션 보드 최근 동작",
        "최근 미션 보드 동작을 복사했습니다."
      );
      if (shareResult === "cancelled") setMissionBoardFeedback("공유 취소", "cancelled");
      else if (shareResult === "copied") setMissionBoardFeedback("복사됨", "success");
      else setMissionBoardFeedback("최근 동작 공유 완료", "success");
    });
  });
  board.querySelector("[data-mission-board-scope-copy]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      setMissionBoardFeedback("범위 복사 중", "working");
      await copyWithButtonFeedback(
        button,
        buildMissionBoardScopeShareText(context, `${items.length}개 플랜`),
        "현재 미션 보드 범위를 복사했습니다."
      );
      setMissionBoardFeedback("범위 복사됨", "success");
    });
  });
  board.querySelector("[data-mission-board-scope-share]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await runMissionButtonBusyAction(button, async () => {
      setMissionBoardFeedback("범위 공유 중", "working");
      const shareResult = await shareMissionBoardScopeText(button, context, `${items.length}개 플랜`);
      if (shareResult === "cancelled") setMissionBoardFeedback("범위 공유 취소", "cancelled");
      else if (shareResult === "copied") setMissionBoardFeedback("범위 복사됨", "success");
      else setMissionBoardFeedback("범위 공유 완료", "success");
    });
  });
  board.querySelectorAll("[data-mission-scope-clear]").forEach((button) => {
    button.addEventListener("click", (event) => {
      runMissionButtonBusyAction(event.currentTarget, async () => {
        const scopeLabel = button.dataset.missionScopeLabel || "범위";
        const searchInput = document.getElementById("searchInput");
        const statusFilter = document.getElementById("statusFilter");
        const nextQuery = button.dataset.missionScopeClear === "query" ? "" : (searchInput?.value.trim() || context.query || "");
        const nextFilter = button.dataset.missionScopeClear === "filter" ? "all" : (statusFilter?.value || context.filter || "all");
        if (boardFeedback) {
          boardFeedback.dataset.missionBoardActiveFilter = nextFilter;
          boardFeedback.dataset.missionBoardActiveFilterLabel = homeFilterLabel(nextFilter);
          boardFeedback.dataset.missionBoardActiveScopeLabel = missionBoardScopeLabel({ query: nextQuery, filter: nextFilter });
          boardFeedback.dataset.missionBoardActiveResultLabel = "목록 갱신 중";
        }
        setMissionBoardFeedback(scopeLabel + " 해제 갱신 중", "working");
        if (searchInput) searchInput.value = nextQuery;
        if (statusFilter) statusFilter.value = nextFilter;
        syncHomeStatusFilterShortcuts(nextFilter);
        await loadPlans(nextQuery, nextFilter);
        loadQualitySummary();
      });
    });
  });
  board.querySelector("[data-mission-board-reset]")?.addEventListener("click", (event) => {
    runMissionButtonBusyAction(event.currentTarget, async () => {
      if (boardFeedback) {
        boardFeedback.dataset.missionBoardActiveFilter = "all";
        boardFeedback.dataset.missionBoardActiveFilterLabel = homeFilterLabel("all");
        boardFeedback.dataset.missionBoardActiveScopeLabel = missionBoardScopeLabel({ query: "", filter: "all" });
        boardFeedback.dataset.missionBoardActiveResultLabel = "목록 갱신 중";
      }
      setMissionBoardFeedback(`전체 보기 갱신 중 · ${scopeActionLabel}`, "working");
      const searchInput = document.getElementById("searchInput");
      const statusFilter = document.getElementById("statusFilter");
      if (searchInput) searchInput.value = "";
      if (statusFilter) statusFilter.value = "all";
      syncHomeStatusFilterShortcuts("all");
      await loadPlans("", "all");
      loadQualitySummary();
    });
  });
  board.classList.toggle("is-anchor-target", window.location.hash === "#tripMissionBoard");
  if (window.location.hash === "#tripMissionBoard") {
    board.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function formatLlmAudit(plan) {
  if (!plan.llmAuthMode && !plan.llmProvider && !plan.model) return "";
  const modeLabels = {
    "server-default": "서버 key",
    "user-api-key": "사용자 key",
  };
  const providerLabels = {
    anthropic: "Anthropic",
    auto: "자동",
    claude: "Anthropic",
    codex: "OpenAI",
    openai: "OpenAI",
  };
  const mode = modeLabels[plan.llmAuthMode] || plan.llmAuthMode || "LLM";
  const provider = providerLabels[plan.llmProvider] || plan.llmProvider || "";
  const parts = [provider ? `${mode}/${provider}` : mode];
  if (plan.model) parts.push(plan.model);
  if (plan.llmModelOverride) parts.push("직접 모델");
  return parts.join(" · ");
}

function formatQualityAudit(plan) {
  const warningCount = Number(plan?.qualityWarningCount || 0);
  const checkCount = Number(plan?.qualityCheckCount || 0);
  const delta = Number.isFinite(plan?.qualityWarningDelta) ? Number(plan.qualityWarningDelta) : null;
  const trend = delta < 0 ? ` · 개선 ${Math.abs(delta)}` : delta > 0 ? ` · 추가 ${delta}` : "";
  if (!checkCount) return "품질 미점검";
  if (!warningCount) return `품질 OK${trend}`;
  const labels = Array.isArray(plan.qualityWarnings) && plan.qualityWarnings.length
    ? `: ${plan.qualityWarnings.slice(0, 2).join(", ")}${plan.qualityWarnings.length > 2 ? " 외" : ""}`
    : "";
  return `품질 확인 ${warningCount}${labels}${trend}`;
}

function formatQualityActionReason(plan) {
  const storedReason = String(plan?.qualityActionReason || "").trim();
  if (storedReason) return storedReason.startsWith("후보:") ? storedReason : `후보: ${storedReason}`;
  const warningCount = Number(plan?.qualityWarningCount || 0);
  const checkCount = Number(plan?.qualityCheckCount || 0);
  const delta = Number.isFinite(plan?.qualityWarningDelta) ? Number(plan.qualityWarningDelta) : 0;
  if (delta > 0) return `후보: 악화 +${delta} 먼저 보강`;
  if (warningCount > 0) return `후보: 확인 ${warningCount} 보강`;
  if (checkCount <= 0) return "후보: 품질 점검 생성";
  return "";
}

function planNeedsQualityAudit(plan) {
  const nextAction = String(plan?.qualityNextAction || "").trim();
  if (nextAction) return nextAction === "quality-audit";
  return Number(plan?.qualityCheckCount || 0) <= 0;
}

function formatQualityActionPriority(plan) {
  const storedLabel = String(plan?.qualityActionPriorityLabel || "").trim();
  if (storedLabel) return storedLabel;
  const priority = Number(plan?.qualityActionPriority || 0);
  if (!priority) return "";
  if (priority >= 100) return `긴급 ${priority}`;
  if (priority >= 80) return `높음 ${priority}`;
  if (priority >= 70) return `점검 ${priority}`;
  return `낮음 ${priority}`;
}

function formatQualityActionBreakdown(summary = {}) {
  const urgent = Number(summary.qualityUrgent);
  const quality = Number(summary.quality);
  const unaudited = Number(summary.qualityUnaudited);
  const regression = Number(summary.qualityRegression);
  if (![quality, unaudited, regression].every(Number.isFinite)) return "";
  const regularWarnings = Math.max(0, quality - regression);
  const parts = [
    Number.isFinite(urgent) && urgent > 0 ? `긴급 ${urgent}` : "",
    regression > 0 ? `악화 ${regression}` : "",
    regularWarnings > 0 ? `확인 ${regularWarnings}` : "",
    unaudited > 0 ? `미점검 ${unaudited}` : "",
  ].filter(Boolean);
  return parts.length ? ` 후보 구성: ${parts.join(", ")}.` : "";
}

function buildQualityTodoText(summary = {}, topPlan = null) {
  const action = Number(summary.qualityAction);
  const reason = formatQualityActionReason(topPlan).replace(/^후보:\s*/, "");
  const needsAudit = planNeedsQualityAudit(topPlan);
  const priority = formatQualityActionPriority(topPlan);
  const breakdown = formatQualityActionBreakdown(summary)
    .replace(/^ 후보 구성:\s*/, "")
    .replace(/\.$/, "");
  const link = topPlan?.id
    ? `${window.location.origin}/plans/${topPlan.id}${needsAudit ? "?qualityAudit=1" : ""}#qualityRefine`
    : "";
  return [
    "Travel Planner 품질 고도화 TODO",
    Number.isFinite(action) ? `- 고도화 후보: ${action}${breakdown ? ` (${breakdown})` : ""}` : "",
    topPlan?.id ? `- 최우선 대상: ${qualityTargetLabel(topPlan)}` : "- 최우선 대상: 없음",
    priority ? `- 우선도: ${priority}` : "",
    reason ? `- 이유: ${reason}` : "",
    topPlan?.id ? `- 다음 액션: ${needsAudit ? "품질 점검 생성" : "품질 보강"}` : "",
    topPlan?.id ? `- 실행 힌트: ${qualityTodoExecutionHint(topPlan)}` : "",
    link ? `- 링크: ${link}` : "",
  ].filter(Boolean).join("\n");
}

function buildPlanQualityTodoText(plan) {
  if (!plan?.id) return "Travel Planner 품질 고도화 TODO\n- 복사할 플랜 데이터가 없습니다.";
  const needsAudit = planNeedsQualityAudit(plan);
  const reason = formatQualityActionReason(plan).replace(/^후보:\s*/, "");
  const priority = formatQualityActionPriority(plan);
  const link = `${window.location.origin}/plans/${plan.id}${needsAudit ? "?qualityAudit=1" : ""}#qualityRefine`;
  return [
    "Travel Planner 품질 고도화 TODO",
    `- 대상: ${qualityTargetLabel(plan)}`,
    priority ? `- 우선도: ${priority}` : "",
    reason ? `- 이유: ${reason}` : "- 이유: 품질 보강 필요",
    `- 다음 액션: ${needsAudit ? "품질 점검 생성" : "품질 보강"}`,
    `- 실행 힌트: ${qualityTodoExecutionHint(plan)}`,
    `- 링크: ${link}`,
  ].join("\n");
}

function qualityTodoExecutionHint(plan) {
  const needsAudit = planNeedsQualityAudit(plan);
  if (needsAudit) return "품질 점검 생성 링크를 열고 고도화 폼의 자동 점검 요청을 확인한 뒤 실행";
  return "품질 보강 링크를 열고 자동으로 채워진 우선순위 보강 문구를 확인한 뒤 실행";
}

function qualityTodoBundlePrompt(plans = []) {
  const count = plans.filter((plan) => plan?.id).length;
  if (!count) return "";
  return `- 묶음 실행 프롬프트: 상위 후보 ${count}개를 우선도 높은 순서대로 처리. 미점검은 품질 점검 생성, 품질 경고/악화는 이유에 맞춰 품질 보강.`;
}

function buildQualityTodoBundleText(plans = [], actionCount = null) {
  const items = Array.isArray(plans) ? plans.filter((plan) => plan?.id) : [];
  if (!items.length) return "Travel Planner 품질 고도화 TODO\n- 현재 복사할 고도화 후보가 없습니다.";
  const total = Number(actionCount);
  const countText = Number.isFinite(total) && total > items.length
    ? `${total} 중 상위 ${items.length}개`
    : String(items.length);
  return [
    "Travel Planner 품질 고도화 TODO",
    `- 고도화 후보: ${countText}`,
    qualityTodoBundlePrompt(items),
    ...items.map((plan, index) => {
      const needsAudit = planNeedsQualityAudit(plan);
      const reason = formatQualityActionReason(plan).replace(/^후보:\s*/, "") || "품질 보강 필요";
      const priority = formatQualityActionPriority(plan);
      const link = `${window.location.origin}/plans/${plan.id}${needsAudit ? "?qualityAudit=1" : ""}#qualityRefine`;
      return [
        `${index + 1}. ${qualityTargetLabel(plan) || "목적지 미정"}`,
        priority ? `- 우선도: ${priority}` : "",
        `- 이유: ${reason}`,
        `- 다음 액션: ${needsAudit ? "품질 점검 생성" : "품질 보강"}`,
        `- 실행 힌트: ${qualityTodoExecutionHint(plan)}`,
        `- 링크: ${link}`,
      ].join("\n");
    }),
  ].join("\n\n");
}

async function fetchQualityTodo(limit = 20, options = {}) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(50, Math.floor(Number(limit)))) : 20;
  const urgent = Boolean(options.urgent);
  const next = Boolean(options.next);
  const all = Boolean(options.all);
  const offset = Number.isFinite(Number(options.offset)) ? Math.max(0, Math.min(5000, Math.floor(Number(options.offset)))) : 0;
  const minPriority = Number.isFinite(Number(options.minPriority)) ? Math.max(0, Math.min(100, Math.floor(Number(options.minPriority)))) : 0;
  const pagingQuery = all ? `all=true&offset=${offset}` : `limit=${safeLimit}&offset=${offset}`;
  const modeQuery = next ? "&next=true" : "";
  const priorityQuery = urgent ? "&urgent=true" : minPriority > 0 ? `&minPriority=${minPriority}` : "";
  const res = await api(`/api/plans/quality-todo?${pagingQuery}${modeQuery}${priorityQuery}`);
  const todo = await parseJsonSafe(res);
  return {
    meta: todo?.meta || {},
    summary: todo?.summary || {},
    plans: Array.isArray(todo?.plans) ? todo.plans : [],
    nextPlan: todo?.nextPlan || null,
    todoText: String(todo?.todoText || ""),
  };
}

function buildPlanQualityTodoPreview(plan) {
  if (!plan?.id) return "대상: 없음 · 이유: 없음 · 다음 액션: 없음";
  const needsAudit = planNeedsQualityAudit(plan);
  const target = qualityTargetLabel(plan) || "목적지 미정";
  const reason = formatQualityActionReason(plan).replace(/^후보:\s*/, "") || "품질 보강 필요";
  const priority = formatQualityActionPriority(plan);
  const action = needsAudit ? "품질 점검 생성" : "품질 보강";
  const preview = `대상: ${target}${priority ? ` · 우선도: ${priority}` : ""} · 이유: ${reason} · 다음 액션: ${action}`;
  return preview.length > 120 ? `${preview.slice(0, 117)}...` : preview;
}

function updateQualityFilterShortcutCounts(summary = {}) {
  const counts = {
    "quality-action": summary.qualityAction,
    "quality-urgent": summary.qualityUrgent,
    quality: summary.quality,
    "quality-ok": summary.qualityOk,
    "quality-unaudited": summary.qualityUnaudited,
    "quality-regression": summary.qualityRegression,
    "quality-improved": summary.qualityImproved,
  };
  document.querySelectorAll("[data-status-filter-shortcut]").forEach((button) => {
    if (!button.dataset.statusFilterLabel) {
      button.dataset.statusFilterLabel = button.textContent.trim();
    }
    const count = Number(counts[button.dataset.statusFilterShortcut]);
    button.textContent = Number.isFinite(count)
      ? `${button.dataset.statusFilterLabel} ${count}`
      : button.dataset.statusFilterLabel;
    button.disabled = Number.isFinite(count) && count <= 0;
    button.title = button.disabled ? "해당 품질 목록에 플랜이 없습니다." : "";
  });
}

function qualityTargetLabel(plan) {
  if (!plan?.id) return "";
  return [
    plan.destination || "목적지 미정",
    plan.startDate || "",
    `#${plan.id}`,
  ].filter(Boolean).join(" · ");
}

function updateQualitySummaryPanel(summary = {}, topPlan = null) {
  const panel = document.getElementById("qualitySummary");
  if (!panel) return;
  const action = Number(summary.qualityAction);
  const urgent = Number(summary.qualityUrgent);
  const quality = Number(summary.quality);
  const audited = Number(summary.qualityAudited);
  const ok = Number(summary.qualityOk);
  const okRate = Number(summary.qualityOkRate);
  const unaudited = Number(summary.qualityUnaudited);
  const regression = Number(summary.qualityRegression);
  const improved = Number(summary.qualityImproved);
  const topWarnings = Array.isArray(summary.topQualityWarnings)
    ? summary.topQualityWarnings.filter((item) => item?.label && Number(item.count) > 0).slice(0, 3)
    : [];
  if (![action, urgent, quality, unaudited, regression, improved].every(Number.isFinite)) {
    panel.textContent = "품질 요약을 아직 불러오지 못했습니다.";
    panel.classList.remove("is-good", "needs-attention");
    return;
  }
  const nextFilter = String(summary.qualityNextFilter || "").trim();
  const nextFilterLabel = String(summary.qualityNextLabel || "").trim() || "다음 목록";
  const nextTodoTextPath = String(summary.qualityNextTodoTextPath || "").trim();
  const qualityGatesTextPath = String(summary.qualityGatesTextPath || "").trim();
  const qualityGatesCsvPath = String(summary.qualityGatesCsvPath || "").trim();
  const qualityGatesReportPath = String(summary.qualityGatesReportPath || "").trim();
  const qualityGatesMetricsPath = String(summary.qualityGatesMetricsPath || "").trim();
  const qualityGatesEventsPath = String(summary.qualityGatesEventsPath || "").trim();
  const qualityGatesAlertPath = String(summary.qualityGatesAlertPath || "").trim();
  const qualityGatesHealthPath = String(summary.qualityGatesHealthPath || "").trim();
  const qualityGatesRemediationPath = String(summary.qualityGatesRemediationPath || "").trim();
  const qualityGatesGateTextPath = String(summary.qualityGatesGateTextPath || "").trim();
  const qualityGatesGateCurlCommand = String(summary.qualityGatesGateCurlCommand || "").trim();
  const qualityGatesGateJsonCurlCommand = String(summary.qualityGatesGateJsonCurlCommand || "").trim();
  const qualityGatesCsvGateCurlCommand = String(summary.qualityGatesCsvGateCurlCommand || "").trim();
  const qualityGatesReportGateCurlCommand = String(summary.qualityGatesReportGateCurlCommand || "").trim();
  const qualityGatesMetricsGateCurlCommand = String(summary.qualityGatesMetricsGateCurlCommand || "").trim();
  const qualityGatesEventsGateCurlCommand = String(summary.qualityGatesEventsGateCurlCommand || "").trim();
  const qualityGatesAlertGateCurlCommand = String(summary.qualityGatesAlertGateCurlCommand || "").trim();
  const qualityGatesHealthCurlCommand = String(summary.qualityGatesHealthCurlCommand || "").trim();
  const qualityGatesRemediationGateCurlCommand = String(summary.qualityGatesRemediationGateCurlCommand || "").trim();
  const qualityGatesGateNpmCommand = String(summary.qualityGatesGateNpmCommand || "").trim();
  const qualityGatesGateJsonNpmCommand = String(summary.qualityGatesGateJsonNpmCommand || "").trim();
  const qualityGatesCsvGateNpmCommand = String(summary.qualityGatesCsvGateNpmCommand || "").trim();
  const qualityGatesReportGateNpmCommand = String(summary.qualityGatesReportGateNpmCommand || "").trim();
  const qualityGatesMetricsGateNpmCommand = String(summary.qualityGatesMetricsGateNpmCommand || "").trim();
  const qualityGatesEventsGateNpmCommand = String(summary.qualityGatesEventsGateNpmCommand || "").trim();
  const qualityGatesAlertGateNpmCommand = String(summary.qualityGatesAlertGateNpmCommand || "").trim();
  const qualityGatesHealthNpmCommand = String(summary.qualityGatesHealthNpmCommand || "").trim();
  const qualityGatesRemediationGateNpmCommand = String(summary.qualityGatesRemediationGateNpmCommand || "").trim();
  const qualityGatesCiGuidePath = String(summary.qualityGatesCiGuidePath || "").trim();
  const qualityGatesBadgeSvgPath = String(summary.qualityGatesBadgeSvgPath || "").trim();
  const qualityGatesBadgeMarkdownPath = String(summary.qualityGatesBadgeMarkdownPath || "").trim();
  const qualityGatesJunitPath = String(summary.qualityGatesJunitPath || "").trim();
  const qualityGatesJunitGatePath = String(summary.qualityGatesJunitGatePath || "").trim();
  const qualityGatesSarifPath = String(summary.qualityGatesSarifPath || "").trim();
  const qualityGatesSarifGatePath = String(summary.qualityGatesSarifGatePath || "").trim();
  const qualityGatesStepSummaryPath = String(summary.qualityGatesStepSummaryPath || "").trim();
  const qualityGatesStepSummaryGatePath = String(summary.qualityGatesStepSummaryGatePath || "").trim();
  const qualityGatesAnnotationsPath = String(summary.qualityGatesAnnotationsPath || "").trim();
  const qualityGatesAnnotationsGatePath = String(summary.qualityGatesAnnotationsGatePath || "").trim();
  const qualityGatesOutputsPath = String(summary.qualityGatesOutputsPath || "").trim();
  const qualityGatesOutputsGatePath = String(summary.qualityGatesOutputsGatePath || "").trim();
  const qualityGatesPrCommentPath = String(summary.qualityGatesPrCommentPath || "").trim();
  const qualityGatesPrCommentGatePath = String(summary.qualityGatesPrCommentGatePath || "").trim();
  const qualityGatesArtifactsPath = String(summary.qualityGatesArtifactsPath || "").trim();
  const qualityGatesArtifactsGatePath = String(summary.qualityGatesArtifactsGatePath || "").trim();
  const qualityGatesGateCommandBundle = String(summary.qualityGatesGateCommandBundle || "").trim() || [
    qualityGatesGateCurlCommand,
    qualityGatesGateJsonCurlCommand,
    qualityGatesCsvGateCurlCommand,
    qualityGatesReportGateCurlCommand,
    qualityGatesMetricsGateCurlCommand,
    qualityGatesEventsGateCurlCommand,
    qualityGatesAlertGateCurlCommand,
    qualityGatesHealthCurlCommand,
    qualityGatesRemediationGateCurlCommand,
    qualityGatesGateNpmCommand,
    qualityGatesGateJsonNpmCommand,
    qualityGatesCsvGateNpmCommand,
    qualityGatesReportGateNpmCommand,
    qualityGatesMetricsGateNpmCommand,
    qualityGatesEventsGateNpmCommand,
    qualityGatesAlertGateNpmCommand,
    qualityGatesHealthNpmCommand,
    qualityGatesRemediationGateNpmCommand,
  ].filter(Boolean).join("\n");
  const qualityGatesGateLocalShellPath = String(summary.qualityGatesGateLocalShellPath || "").trim();
  const qualityGatesGateGithubActionsPath = String(summary.qualityGatesGateGithubActionsPath || "").trim();
  const qualityGatesGateLocalShellExample = String(summary.qualityGatesGateLocalShellExample || "").trim();
  const qualityGatesGateGithubActionsExample = String(summary.qualityGatesGateGithubActionsExample || "").trim();
  const qualityGateTextPath = String(summary.qualityGateTextPath || "").trim();
  const qualitySoftGateTextPath = String(summary.qualitySoftGateTextPath || "").trim();
  const qualityUrgentGateTextPath = String(summary.qualityUrgentGateTextPath || "").trim();
  const qualityUrgentSoftGateTextPath = String(summary.qualityUrgentSoftGateTextPath || "").trim();
  const qualityNextGateTextPath = String(summary.qualityNextGateTextPath || "").trim();
  const qualityNextSoftGateTextPath = String(summary.qualityNextSoftGateTextPath || "").trim();
  const nextAction = String(summary.qualityNextReason || "").trim() || (regression > 0
    ? "먼저 품질 악화 플랜을 확인하세요."
    : quality > 0
    ? "품질 확인 플랜부터 보강하세요."
    : unaudited > 0
    ? "품질 미점검 플랜에 점검을 생성하세요."
    : "현재 보강할 품질 항목이 없습니다.");
  const focusText = topWarnings.length
    ? ` 많이 남은 항목: ${topWarnings.map((item) => `${item.label} ${Number(item.count)}`).join(", ")}.`
    : "";
  const gateText = ` 기본 게이트 ${action > 0 ? `실패(${action}개)` : "통과"}.`;
  const nextGateCount = nextFilter === "quality-urgent" ? urgent : nextFilter === "quality-regression" ? regression : nextFilter === "quality" ? quality : nextFilter === "quality-unaudited" ? unaudited : action;
  const nextGateText = nextFilter ? ` 다음 게이트 ${nextFilterLabel} ${nextGateCount}개.` : "";
  const okText = Number.isFinite(audited) && Number.isFinite(ok) && Number.isFinite(okRate)
    ? ` OK ${ok}/${audited} (${okRate}%).`
    : "";
  const breakdownText = formatQualityActionBreakdown(summary);
  panel.textContent = "";
  const summaryText = document.createElement("span");
  summaryText.textContent = `품질 요약: 고도화 후보 ${action}, 긴급 ${urgent}, 확인 ${quality}, 미점검 ${unaudited}, 악화 ${regression}, 개선 ${improved}.${okText}${breakdownText}${gateText}${nextGateText} ${nextAction}${focusText}`;
  panel.appendChild(summaryText);
  if (nextFilter) {
    const nextFilterButton = document.createElement("button");
    nextFilterButton.type = "button";
    nextFilterButton.className = "secondary inline-action";
    nextFilterButton.textContent = `${nextFilterLabel} 열기`;
    nextFilterButton.title = `${nextFilterLabel} 목록으로 전환합니다.`;
    nextFilterButton.addEventListener("click", () => {
      const statusFilter = document.getElementById("statusFilter");
      if (statusFilter) {
        statusFilter.value = nextFilter;
        statusFilter.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        loadPlans("", nextFilter);
      }
    });
    panel.append(" ");
    panel.appendChild(nextFilterButton);
  }
  if (nextTodoTextPath) {
    const nextTodoButton = document.createElement("button");
    nextTodoButton.type = "button";
    nextTodoButton.className = "secondary inline-action";
    nextTodoButton.textContent = "다음 TODO 복사";
    nextTodoButton.title = `${nextFilterLabel} 기준 품질 TODO 텍스트를 복사합니다.`;
    nextTodoButton.addEventListener("click", async () => {
      const todo = await fetchQualityTodo(10, { next: true });
      const text = String(todo.todoText || "").trim() || buildQualityTodoText(summary, topPlan);
      await copyWithButtonFeedback(nextTodoButton, text, "다음 품질 TODO를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(nextTodoButton);
    const nextTodoAllButton = document.createElement("button");
    nextTodoAllButton.type = "button";
    nextTodoAllButton.className = "secondary inline-action";
    nextTodoAllButton.textContent = "다음 TODO 전체";
    nextTodoAllButton.title = `${nextFilterLabel} 기준 전체 품질 TODO 텍스트를 복사합니다.`;
    nextTodoAllButton.addEventListener("click", async () => {
      const todo = await fetchQualityTodo(10, { next: true, all: true });
      const text = String(todo.todoText || "").trim() || buildQualityTodoText(summary, topPlan);
      await copyWithButtonFeedback(nextTodoAllButton, text, "다음 품질 TODO 전체를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(nextTodoAllButton);
  }
  if (qualityGateTextPath) {
    const gateButton = document.createElement("button");
    gateButton.type = "button";
    gateButton.className = "secondary inline-action";
    gateButton.textContent = "게이트 복사";
    gateButton.title = "전체 품질 게이트 결과 텍스트를 복사합니다.";
    gateButton.addEventListener("click", async () => {
      let text = "";
      try {
        const res = await api(qualityGateTextPath);
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      const fallback = `Travel Planner 품질 게이트\n\n- 게이트: 후보 ${action}개 / 허용 0개 · ${action > 0 ? "실패 (exit 3)" : "통과"}`;
      await copyWithButtonFeedback(gateButton, text || fallback, "품질 게이트 결과를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gateButton);
  }
  if (qualityGatesTextPath) {
    const gatesButton = document.createElement("button");
    gatesButton.type = "button";
    gatesButton.className = "secondary inline-action";
    gatesButton.textContent = "게이트 요약";
    gatesButton.title = "품질 게이트 매트릭스 결과 텍스트를 복사합니다.";
    gatesButton.addEventListener("click", async () => {
      let text = "";
      try {
        const res = await api(qualityGatesTextPath);
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      const fallback = `Travel Planner 품질 게이트 매트릭스\n\n- 전체 strict: 후보 ${action}개 / 허용 0개 · ${action > 0 ? "실패" : "통과"}\n- 전체 완화 5: 후보 ${action}개 / 허용 5개 · ${action > 5 ? "실패" : "통과"}\n- 긴급 strict: 후보 ${urgent}개 / 허용 0개 · ${urgent > 0 ? "실패" : "통과"}\n- 긴급 완화 5: 후보 ${urgent}개 / 허용 5개 · ${urgent > 5 ? "실패" : "통과"}`;
      await copyWithButtonFeedback(gatesButton, text || fallback, "품질 게이트 요약을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesButton);
  }
  if (qualityGatesCsvPath) {
    const gatesCsvButton = document.createElement("button");
    gatesCsvButton.type = "button";
    gatesCsvButton.className = "secondary inline-action";
    gatesCsvButton.textContent = "CSV";
    gatesCsvButton.title = "품질 게이트 매트릭스를 CSV로 복사합니다.";
    gatesCsvButton.addEventListener("click", async () => {
      let text = "";
      try {
        const res = await api(qualityGatesCsvPath);
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      await copyWithButtonFeedback(gatesCsvButton, text, "품질 게이트 CSV를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesCsvButton);
  }
  if (qualityGatesReportPath) {
    const gatesReportButton = document.createElement("button");
    gatesReportButton.type = "button";
    gatesReportButton.className = "secondary inline-action";
    gatesReportButton.textContent = "Report";
    gatesReportButton.title = "공유용 품질 게이트 Markdown 리포트를 복사합니다.";
    gatesReportButton.addEventListener("click", async () => {
      let text = "";
      try {
        const res = await api(qualityGatesReportPath);
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      await copyWithButtonFeedback(gatesReportButton, text, "품질 게이트 리포트를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesReportButton);
  }
  if (qualityGatesMetricsPath) {
    const gatesMetricsButton = document.createElement("button");
    gatesMetricsButton.type = "button";
    gatesMetricsButton.className = "secondary inline-action";
    gatesMetricsButton.textContent = "Metrics";
    gatesMetricsButton.title = "Prometheus 스타일 품질 게이트 metrics를 복사합니다.";
    gatesMetricsButton.addEventListener("click", async () => {
      let text = "";
      try {
        const res = await api(qualityGatesMetricsPath);
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      await copyWithButtonFeedback(gatesMetricsButton, text, "품질 게이트 metrics를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesMetricsButton);
  }
  if (qualityGatesEventsPath) {
    const gatesEventsButton = document.createElement("button");
    gatesEventsButton.type = "button";
    gatesEventsButton.className = "secondary inline-action";
    gatesEventsButton.textContent = "Events";
    gatesEventsButton.title = "품질 게이트 이벤트 NDJSON을 복사합니다.";
    gatesEventsButton.addEventListener("click", async () => {
      let text = "";
      try {
        const res = await api(qualityGatesEventsPath);
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      await copyWithButtonFeedback(gatesEventsButton, text, "품질 게이트 이벤트를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesEventsButton);
  }
  if (qualityGatesAlertPath) {
    const gatesAlertButton = document.createElement("button");
    gatesAlertButton.type = "button";
    gatesAlertButton.className = "secondary inline-action";
    gatesAlertButton.textContent = "Alert";
    gatesAlertButton.title = "외부 알림용 품질 게이트 alert JSON을 복사합니다.";
    gatesAlertButton.addEventListener("click", async () => {
      let text = "";
      try {
        const res = await api(qualityGatesAlertPath);
        text = JSON.stringify(await res.json(), null, 2);
      } catch (_err) {
        text = "";
      }
      await copyWithButtonFeedback(gatesAlertButton, text, "품질 게이트 alert JSON을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesAlertButton);
  }
  if (qualityGatesHealthPath || qualityGatesHealthCurlCommand) {
    const gatesHealthButton = document.createElement("button");
    gatesHealthButton.type = "button";
    gatesHealthButton.className = "secondary inline-action";
    gatesHealthButton.textContent = "Health";
    gatesHealthButton.title = "HTTP 200/503 품질 게이트 헬스체크 curl 명령을 복사합니다.";
    gatesHealthButton.addEventListener("click", async () => {
      const text = qualityGatesHealthCurlCommand || `curl -fsS ${qualityGatesHealthPath}`;
      await copyWithButtonFeedback(gatesHealthButton, text, "품질 게이트 헬스체크 명령을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesHealthButton);
  }
  if (qualityGatesRemediationPath) {
    const gatesRemediationButton = document.createElement("button");
    gatesRemediationButton.type = "button";
    gatesRemediationButton.className = "secondary inline-action";
    gatesRemediationButton.textContent = "Runbook";
    gatesRemediationButton.title = "품질 게이트 보강 Runbook Markdown을 복사합니다.";
    gatesRemediationButton.addEventListener("click", async () => {
      let text = "";
      try {
        const res = await api(qualityGatesRemediationPath);
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      await copyWithButtonFeedback(gatesRemediationButton, text, "품질 게이트 보강 Runbook을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesRemediationButton);
  }
  if (qualityGatesGateTextPath) {
    const gatesGateButton = document.createElement("button");
    gatesGateButton.type = "button";
    gatesGateButton.className = "secondary inline-action";
    gatesGateButton.textContent = "CI 게이트";
    gatesGateButton.title = "실패 시 HTTP 409를 반환하는 품질 게이트 매트릭스 텍스트를 복사합니다.";
    gatesGateButton.addEventListener("click", async () => {
      let text = "";
      try {
        const headers = typeof withAccessKeyHeaders === "function" ? withAccessKeyHeaders({}) : {};
        const res = await fetch(qualityGatesGateTextPath, { headers });
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      const fallback = `Travel Planner 품질 게이트 매트릭스 CI\n\n- 전체 strict: 후보 ${action}개 / 허용 0개 · ${action > 0 ? "실패 (HTTP 409)" : "통과"}\n- 전체 완화 5: 후보 ${action}개 / 허용 5개 · ${action > 5 ? "실패 (HTTP 409)" : "통과"}\n- 긴급 strict: 후보 ${urgent}개 / 허용 0개 · ${urgent > 0 ? "실패 (HTTP 409)" : "통과"}\n- 긴급 완화 5: 후보 ${urgent}개 / 허용 5개 · ${urgent > 5 ? "실패 (HTTP 409)" : "통과"}`;
      await copyWithButtonFeedback(gatesGateButton, text || fallback, "CI 품질 게이트를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesGateButton);
  }
  if (qualityGatesGateCurlCommand) {
    const gatesGateCommandButton = document.createElement("button");
    gatesGateCommandButton.type = "button";
    gatesGateCommandButton.className = "secondary inline-action";
    gatesGateCommandButton.textContent = "CI 명령";
    gatesGateCommandButton.title = "실패 시 non-zero로 종료하는 품질 게이트 curl 명령을 복사합니다.";
    gatesGateCommandButton.addEventListener("click", async () => {
      await copyWithButtonFeedback(gatesGateCommandButton, qualityGatesGateCurlCommand, "CI 품질 게이트 명령을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesGateCommandButton);
  }
  if (qualityGatesGateJsonCurlCommand) {
    const gatesGateJsonCommandButton = document.createElement("button");
    gatesGateJsonCommandButton.type = "button";
    gatesGateJsonCommandButton.className = "secondary inline-action";
    gatesGateJsonCommandButton.textContent = "CI JSON 명령";
    gatesGateJsonCommandButton.title = "실패 시 non-zero로 종료하는 품질 게이트 JSON curl 명령을 복사합니다.";
    gatesGateJsonCommandButton.addEventListener("click", async () => {
      await copyWithButtonFeedback(gatesGateJsonCommandButton, qualityGatesGateJsonCurlCommand, "CI 품질 게이트 JSON 명령을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesGateJsonCommandButton);
  }
  if (qualityGatesCsvGateCurlCommand) {
    const gatesCsvGateCommandButton = document.createElement("button");
    gatesCsvGateCommandButton.type = "button";
    gatesCsvGateCommandButton.className = "secondary inline-action";
    gatesCsvGateCommandButton.textContent = "CSV CI";
    gatesCsvGateCommandButton.title = "실패 시 non-zero로 종료하는 품질 게이트 CSV curl 명령을 복사합니다.";
    gatesCsvGateCommandButton.addEventListener("click", async () => {
      await copyWithButtonFeedback(gatesCsvGateCommandButton, qualityGatesCsvGateCurlCommand, "CI 품질 게이트 CSV 명령을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesCsvGateCommandButton);
  }
  if (qualityGatesReportGateCurlCommand) {
    const gatesReportGateCommandButton = document.createElement("button");
    gatesReportGateCommandButton.type = "button";
    gatesReportGateCommandButton.className = "secondary inline-action";
    gatesReportGateCommandButton.textContent = "Report CI";
    gatesReportGateCommandButton.title = "실패 시 non-zero로 종료하는 품질 게이트 Markdown 리포트 curl 명령을 복사합니다.";
    gatesReportGateCommandButton.addEventListener("click", async () => {
      await copyWithButtonFeedback(gatesReportGateCommandButton, qualityGatesReportGateCurlCommand, "CI 품질 게이트 리포트 명령을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesReportGateCommandButton);
  }
  if (qualityGatesMetricsGateCurlCommand) {
    const gatesMetricsGateCommandButton = document.createElement("button");
    gatesMetricsGateCommandButton.type = "button";
    gatesMetricsGateCommandButton.className = "secondary inline-action";
    gatesMetricsGateCommandButton.textContent = "Metrics CI";
    gatesMetricsGateCommandButton.title = "실패 시 non-zero로 종료하는 품질 게이트 metrics curl 명령을 복사합니다.";
    gatesMetricsGateCommandButton.addEventListener("click", async () => {
      await copyWithButtonFeedback(gatesMetricsGateCommandButton, qualityGatesMetricsGateCurlCommand, "CI 품질 게이트 metrics 명령을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesMetricsGateCommandButton);
  }
  if (qualityGatesEventsGateCurlCommand) {
    const gatesEventsGateCommandButton = document.createElement("button");
    gatesEventsGateCommandButton.type = "button";
    gatesEventsGateCommandButton.className = "secondary inline-action";
    gatesEventsGateCommandButton.textContent = "Events CI";
    gatesEventsGateCommandButton.title = "실패 시 non-zero로 종료하는 품질 게이트 이벤트 NDJSON curl 명령을 복사합니다.";
    gatesEventsGateCommandButton.addEventListener("click", async () => {
      await copyWithButtonFeedback(gatesEventsGateCommandButton, qualityGatesEventsGateCurlCommand, "CI 품질 게이트 이벤트 명령을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesEventsGateCommandButton);
  }
  if (qualityGatesAlertGateCurlCommand) {
    const gatesAlertGateCommandButton = document.createElement("button");
    gatesAlertGateCommandButton.type = "button";
    gatesAlertGateCommandButton.className = "secondary inline-action";
    gatesAlertGateCommandButton.textContent = "Alert CI";
    gatesAlertGateCommandButton.title = "실패 시 non-zero로 종료하는 품질 게이트 alert JSON curl 명령을 복사합니다.";
    gatesAlertGateCommandButton.addEventListener("click", async () => {
      await copyWithButtonFeedback(gatesAlertGateCommandButton, qualityGatesAlertGateCurlCommand, "CI 품질 게이트 alert 명령을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesAlertGateCommandButton);
  }
  if (qualityGatesRemediationGateCurlCommand) {
    const gatesRemediationGateCommandButton = document.createElement("button");
    gatesRemediationGateCommandButton.type = "button";
    gatesRemediationGateCommandButton.className = "secondary inline-action";
    gatesRemediationGateCommandButton.textContent = "Runbook CI";
    gatesRemediationGateCommandButton.title = "실패 시 non-zero로 종료하는 품질 게이트 보강 Runbook curl 명령을 복사합니다.";
    gatesRemediationGateCommandButton.addEventListener("click", async () => {
      await copyWithButtonFeedback(gatesRemediationGateCommandButton, qualityGatesRemediationGateCurlCommand, "CI 품질 게이트 보강 Runbook 명령을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesRemediationGateCommandButton);
  }
  if (qualityGatesGateNpmCommand) {
    const gatesGateNpmCommandButton = document.createElement("button");
    gatesGateNpmCommandButton.type = "button";
    gatesGateNpmCommandButton.className = "secondary inline-action";
    gatesGateNpmCommandButton.textContent = "npm CI";
    gatesGateNpmCommandButton.title = "실패 시 non-zero로 종료하는 품질 게이트 npm 명령을 복사합니다.";
    gatesGateNpmCommandButton.addEventListener("click", async () => {
      await copyWithButtonFeedback(gatesGateNpmCommandButton, qualityGatesGateNpmCommand, "npm CI 품질 게이트 명령을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesGateNpmCommandButton);
  }
  if (qualityGatesGateJsonNpmCommand) {
    const gatesGateJsonNpmCommandButton = document.createElement("button");
    gatesGateJsonNpmCommandButton.type = "button";
    gatesGateJsonNpmCommandButton.className = "secondary inline-action";
    gatesGateJsonNpmCommandButton.textContent = "npm CI JSON";
    gatesGateJsonNpmCommandButton.title = "실패 시 non-zero로 종료하는 품질 게이트 JSON npm 명령을 복사합니다.";
    gatesGateJsonNpmCommandButton.addEventListener("click", async () => {
      await copyWithButtonFeedback(gatesGateJsonNpmCommandButton, qualityGatesGateJsonNpmCommand, "npm CI 품질 게이트 JSON 명령을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesGateJsonNpmCommandButton);
  }
  if (qualityGatesCsvGateNpmCommand) {
    const gatesCsvGateNpmCommandButton = document.createElement("button");
    gatesCsvGateNpmCommandButton.type = "button";
    gatesCsvGateNpmCommandButton.className = "secondary inline-action";
    gatesCsvGateNpmCommandButton.textContent = "npm CSV";
    gatesCsvGateNpmCommandButton.title = "실패 시 non-zero로 종료하는 품질 게이트 CSV npm 명령을 복사합니다.";
    gatesCsvGateNpmCommandButton.addEventListener("click", async () => {
      await copyWithButtonFeedback(gatesCsvGateNpmCommandButton, qualityGatesCsvGateNpmCommand, "npm 품질 게이트 CSV 명령을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesCsvGateNpmCommandButton);
  }
  if (qualityGatesReportGateNpmCommand) {
    const gatesReportGateNpmCommandButton = document.createElement("button");
    gatesReportGateNpmCommandButton.type = "button";
    gatesReportGateNpmCommandButton.className = "secondary inline-action";
    gatesReportGateNpmCommandButton.textContent = "npm Report";
    gatesReportGateNpmCommandButton.title = "실패 시 non-zero로 종료하는 품질 게이트 Markdown 리포트 npm 명령을 복사합니다.";
    gatesReportGateNpmCommandButton.addEventListener("click", async () => {
      await copyWithButtonFeedback(gatesReportGateNpmCommandButton, qualityGatesReportGateNpmCommand, "npm 품질 게이트 리포트 명령을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesReportGateNpmCommandButton);
  }
  if (qualityGatesMetricsGateNpmCommand) {
    const gatesMetricsGateNpmCommandButton = document.createElement("button");
    gatesMetricsGateNpmCommandButton.type = "button";
    gatesMetricsGateNpmCommandButton.className = "secondary inline-action";
    gatesMetricsGateNpmCommandButton.textContent = "npm Metrics";
    gatesMetricsGateNpmCommandButton.title = "실패 시 non-zero로 종료하는 품질 게이트 metrics npm 명령을 복사합니다.";
    gatesMetricsGateNpmCommandButton.addEventListener("click", async () => {
      await copyWithButtonFeedback(gatesMetricsGateNpmCommandButton, qualityGatesMetricsGateNpmCommand, "npm 품질 게이트 metrics 명령을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesMetricsGateNpmCommandButton);
  }
  if (qualityGatesEventsGateNpmCommand) {
    const gatesEventsGateNpmCommandButton = document.createElement("button");
    gatesEventsGateNpmCommandButton.type = "button";
    gatesEventsGateNpmCommandButton.className = "secondary inline-action";
    gatesEventsGateNpmCommandButton.textContent = "npm Events";
    gatesEventsGateNpmCommandButton.title = "실패 시 non-zero로 종료하는 품질 게이트 이벤트 NDJSON npm 명령을 복사합니다.";
    gatesEventsGateNpmCommandButton.addEventListener("click", async () => {
      await copyWithButtonFeedback(gatesEventsGateNpmCommandButton, qualityGatesEventsGateNpmCommand, "npm 품질 게이트 이벤트 명령을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesEventsGateNpmCommandButton);
  }
  if (qualityGatesAlertGateNpmCommand) {
    const gatesAlertGateNpmCommandButton = document.createElement("button");
    gatesAlertGateNpmCommandButton.type = "button";
    gatesAlertGateNpmCommandButton.className = "secondary inline-action";
    gatesAlertGateNpmCommandButton.textContent = "npm Alert";
    gatesAlertGateNpmCommandButton.title = "실패 시 non-zero로 종료하는 품질 게이트 alert JSON npm 명령을 복사합니다.";
    gatesAlertGateNpmCommandButton.addEventListener("click", async () => {
      await copyWithButtonFeedback(gatesAlertGateNpmCommandButton, qualityGatesAlertGateNpmCommand, "npm 품질 게이트 alert 명령을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesAlertGateNpmCommandButton);
  }
  if (qualityGatesHealthNpmCommand) {
    const gatesHealthNpmCommandButton = document.createElement("button");
    gatesHealthNpmCommandButton.type = "button";
    gatesHealthNpmCommandButton.className = "secondary inline-action";
    gatesHealthNpmCommandButton.textContent = "npm Health";
    gatesHealthNpmCommandButton.title = "HTTP 200/503 품질 게이트 헬스체크 npm 명령을 복사합니다.";
    gatesHealthNpmCommandButton.addEventListener("click", async () => {
      await copyWithButtonFeedback(gatesHealthNpmCommandButton, qualityGatesHealthNpmCommand, "npm 품질 게이트 헬스체크 명령을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesHealthNpmCommandButton);
  }
  if (qualityGatesRemediationGateNpmCommand) {
    const gatesRemediationGateNpmCommandButton = document.createElement("button");
    gatesRemediationGateNpmCommandButton.type = "button";
    gatesRemediationGateNpmCommandButton.className = "secondary inline-action";
    gatesRemediationGateNpmCommandButton.textContent = "npm Runbook";
    gatesRemediationGateNpmCommandButton.title = "실패 시 non-zero로 종료하는 품질 게이트 보강 Runbook npm 명령을 복사합니다.";
    gatesRemediationGateNpmCommandButton.addEventListener("click", async () => {
      await copyWithButtonFeedback(gatesRemediationGateNpmCommandButton, qualityGatesRemediationGateNpmCommand, "npm 품질 게이트 보강 Runbook 명령을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesRemediationGateNpmCommandButton);
  }
  if (qualityGatesGateCommandBundle) {
    const gatesGateCommandBundleButton = document.createElement("button");
    gatesGateCommandBundleButton.type = "button";
    gatesGateCommandBundleButton.className = "secondary inline-action";
    gatesGateCommandBundleButton.textContent = "CI 묶음";
    gatesGateCommandBundleButton.title = "품질 게이트 CI 명령 전체를 한 번에 복사합니다.";
    gatesGateCommandBundleButton.addEventListener("click", async () => {
      await copyWithButtonFeedback(gatesGateCommandBundleButton, qualityGatesGateCommandBundle, "CI 품질 게이트 명령 묶음을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(gatesGateCommandBundleButton);
  }
  if (qualityGatesCiGuidePath) {
    const ciGuideButton = document.createElement("button");
    ciGuideButton.type = "button";
    ciGuideButton.className = "secondary inline-action";
    ciGuideButton.textContent = "CI 가이드";
    ciGuideButton.title = "품질 게이트 CI 가이드 Markdown을 복사합니다.";
    ciGuideButton.addEventListener("click", async () => {
      let text = "";
      try {
        const headers = typeof withAccessKeyHeaders === "function" ? withAccessKeyHeaders({}) : {};
        const res = await fetch(qualityGatesCiGuidePath, { headers });
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      await copyWithButtonFeedback(ciGuideButton, text, "CI 가이드 Markdown을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(ciGuideButton);
  }
  const qualityGatesJunitCopyPath = qualityGatesJunitGatePath || qualityGatesJunitPath;
  if (qualityGatesJunitCopyPath) {
    const junitButton = document.createElement("button");
    junitButton.type = "button";
    junitButton.className = "secondary inline-action";
    junitButton.textContent = "JUnit XML";
    junitButton.title = "품질 게이트 JUnit XML 리포트를 복사합니다.";
    junitButton.addEventListener("click", async () => {
      let text = "";
      try {
        const headers = typeof withAccessKeyHeaders === "function" ? withAccessKeyHeaders({}) : {};
        const res = await fetch(qualityGatesJunitCopyPath, { headers });
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      await copyWithButtonFeedback(junitButton, text, "품질 게이트 JUnit XML을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(junitButton);
  }
  const qualityGatesSarifCopyPath = qualityGatesSarifGatePath || qualityGatesSarifPath;
  if (qualityGatesSarifCopyPath) {
    const sarifButton = document.createElement("button");
    sarifButton.type = "button";
    sarifButton.className = "secondary inline-action";
    sarifButton.textContent = "SARIF";
    sarifButton.title = "품질 게이트 SARIF JSON 리포트를 복사합니다.";
    sarifButton.addEventListener("click", async () => {
      let text = "";
      try {
        const headers = typeof withAccessKeyHeaders === "function" ? withAccessKeyHeaders({}) : {};
        const res = await fetch(qualityGatesSarifCopyPath, { headers });
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      await copyWithButtonFeedback(sarifButton, text, "품질 게이트 SARIF JSON을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(sarifButton);
  }
  const qualityGatesStepSummaryCopyPath = qualityGatesStepSummaryGatePath || qualityGatesStepSummaryPath;
  if (qualityGatesStepSummaryCopyPath) {
    const stepSummaryButton = document.createElement("button");
    stepSummaryButton.type = "button";
    stepSummaryButton.className = "secondary inline-action";
    stepSummaryButton.textContent = "Step 요약";
    stepSummaryButton.title = "GitHub Actions Step Summary용 품질 게이트 Markdown을 복사합니다.";
    stepSummaryButton.addEventListener("click", async () => {
      let text = "";
      try {
        const headers = typeof withAccessKeyHeaders === "function" ? withAccessKeyHeaders({}) : {};
        const res = await fetch(qualityGatesStepSummaryCopyPath, { headers });
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      await copyWithButtonFeedback(stepSummaryButton, text, "품질 게이트 Step Summary를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(stepSummaryButton);
  }
  const qualityGatesAnnotationsCopyPath = qualityGatesAnnotationsGatePath || qualityGatesAnnotationsPath;
  if (qualityGatesAnnotationsCopyPath) {
    const annotationsButton = document.createElement("button");
    annotationsButton.type = "button";
    annotationsButton.className = "secondary inline-action";
    annotationsButton.textContent = "Annotations";
    annotationsButton.title = "GitHub Actions annotation용 품질 게이트 workflow command를 복사합니다.";
    annotationsButton.addEventListener("click", async () => {
      let text = "";
      try {
        const headers = typeof withAccessKeyHeaders === "function" ? withAccessKeyHeaders({}) : {};
        const res = await fetch(qualityGatesAnnotationsCopyPath, { headers });
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      await copyWithButtonFeedback(annotationsButton, text, "품질 게이트 Annotations를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(annotationsButton);
  }
  const qualityGatesOutputsCopyPath = qualityGatesOutputsGatePath || qualityGatesOutputsPath;
  if (qualityGatesOutputsCopyPath) {
    const outputsButton = document.createElement("button");
    outputsButton.type = "button";
    outputsButton.className = "secondary inline-action";
    outputsButton.textContent = "Outputs";
    outputsButton.title = "GitHub Actions GITHUB_OUTPUT용 품질 게이트 key-value를 복사합니다.";
    outputsButton.addEventListener("click", async () => {
      let text = "";
      try {
        const headers = typeof withAccessKeyHeaders === "function" ? withAccessKeyHeaders({}) : {};
        const res = await fetch(qualityGatesOutputsCopyPath, { headers });
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      await copyWithButtonFeedback(outputsButton, text, "품질 게이트 Outputs를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(outputsButton);
  }
  const qualityGatesPrCommentCopyPath = qualityGatesPrCommentGatePath || qualityGatesPrCommentPath;
  if (qualityGatesPrCommentCopyPath) {
    const prCommentButton = document.createElement("button");
    prCommentButton.type = "button";
    prCommentButton.className = "secondary inline-action";
    prCommentButton.textContent = "PR 댓글";
    prCommentButton.title = "GitHub PR 댓글용 품질 게이트 Markdown을 복사합니다.";
    prCommentButton.addEventListener("click", async () => {
      let text = "";
      try {
        const headers = typeof withAccessKeyHeaders === "function" ? withAccessKeyHeaders({}) : {};
        const res = await fetch(qualityGatesPrCommentCopyPath, { headers });
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      await copyWithButtonFeedback(prCommentButton, text, "품질 게이트 PR 댓글을 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(prCommentButton);
  }
  const qualityGatesArtifactsCopyPath = qualityGatesArtifactsGatePath || qualityGatesArtifactsPath;
  if (qualityGatesArtifactsCopyPath) {
    const artifactsButton = document.createElement("button");
    artifactsButton.type = "button";
    artifactsButton.className = "secondary inline-action";
    artifactsButton.textContent = "Artifacts";
    artifactsButton.title = "품질 게이트 산출물 매니페스트 JSON을 복사합니다.";
    artifactsButton.addEventListener("click", async () => {
      let text = "";
      try {
        const headers = typeof withAccessKeyHeaders === "function" ? withAccessKeyHeaders({}) : {};
        const res = await fetch(qualityGatesArtifactsCopyPath, { headers });
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      await copyWithButtonFeedback(artifactsButton, text, "품질 게이트 Artifacts를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(artifactsButton);
  }
  if (qualityGatesBadgeMarkdownPath) {
    const badgeMarkdownButton = document.createElement("button");
    badgeMarkdownButton.type = "button";
    badgeMarkdownButton.className = "secondary inline-action";
    badgeMarkdownButton.textContent = "배지 MD";
    badgeMarkdownButton.title = "README에 붙여넣을 품질 게이트 Markdown 배지 스니펫을 복사합니다.";
    badgeMarkdownButton.addEventListener("click", async () => {
      let text = "";
      try {
        const headers = typeof withAccessKeyHeaders === "function" ? withAccessKeyHeaders({}) : {};
        const res = await fetch(qualityGatesBadgeMarkdownPath, { headers });
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      await copyWithButtonFeedback(badgeMarkdownButton, text, "품질 게이트 Markdown 배지를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(badgeMarkdownButton);
  }
  if (qualityGatesBadgeSvgPath) {
    const badgeSvgButton = document.createElement("button");
    badgeSvgButton.type = "button";
    badgeSvgButton.className = "secondary inline-action";
    badgeSvgButton.textContent = "배지 SVG";
    badgeSvgButton.title = "품질 게이트 SVG 배지 원문을 복사합니다.";
    badgeSvgButton.addEventListener("click", async () => {
      let text = "";
      try {
        const headers = typeof withAccessKeyHeaders === "function" ? withAccessKeyHeaders({}) : {};
        const res = await fetch(qualityGatesBadgeSvgPath, { headers });
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      await copyWithButtonFeedback(badgeSvgButton, text, "품질 게이트 SVG 배지를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(badgeSvgButton);
  }
  if (qualityGatesGateLocalShellExample || qualityGatesGateLocalShellPath) {
    const localShellButton = document.createElement("button");
    localShellButton.type = "button";
    localShellButton.className = "secondary inline-action";
    localShellButton.textContent = "로컬 CI";
    localShellButton.title = "로컬 shell에서 품질 게이트를 실행하는 예시를 복사합니다.";
    localShellButton.addEventListener("click", async () => {
      let text = qualityGatesGateLocalShellExample;
      if (!text && qualityGatesGateLocalShellPath) {
        try {
          const headers = typeof withAccessKeyHeaders === "function" ? withAccessKeyHeaders({}) : {};
          const res = await fetch(qualityGatesGateLocalShellPath, { headers });
          text = String(await res.text()).trim();
        } catch (_err) {
          text = "";
        }
      }
      await copyWithButtonFeedback(localShellButton, text, "로컬 CI 예시를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(localShellButton);
  }
  if (qualityGatesGateGithubActionsExample || qualityGatesGateGithubActionsPath) {
    const githubActionsButton = document.createElement("button");
    githubActionsButton.type = "button";
    githubActionsButton.className = "secondary inline-action";
    githubActionsButton.textContent = "Actions CI";
    githubActionsButton.title = "GitHub Actions 품질 게이트 workflow 예시를 복사합니다.";
    githubActionsButton.addEventListener("click", async () => {
      let text = qualityGatesGateGithubActionsExample;
      if (!text && qualityGatesGateGithubActionsPath) {
        try {
          const headers = typeof withAccessKeyHeaders === "function" ? withAccessKeyHeaders({}) : {};
          const res = await fetch(qualityGatesGateGithubActionsPath, { headers });
          text = String(await res.text()).trim();
        } catch (_err) {
          text = "";
        }
      }
      await copyWithButtonFeedback(githubActionsButton, text, "GitHub Actions CI 예시를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(githubActionsButton);
  }
  if (qualitySoftGateTextPath) {
    const softGateButton = document.createElement("button");
    softGateButton.type = "button";
    softGateButton.className = "secondary inline-action";
    softGateButton.textContent = "완화 게이트";
    softGateButton.title = "전체 품질 후보 5개 이하 허용 게이트 결과 텍스트를 복사합니다.";
    softGateButton.addEventListener("click", async () => {
      let text = "";
      try {
        const res = await api(qualitySoftGateTextPath);
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      const fallback = `Travel Planner 품질 게이트\n\n- 게이트: 후보 ${action}개 / 허용 5개 · ${action > 5 ? "실패 (exit 3)" : "통과"}`;
      await copyWithButtonFeedback(softGateButton, text || fallback, "완화 품질 게이트 결과를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(softGateButton);
  }
  if (qualityUrgentGateTextPath) {
    const urgentGateButton = document.createElement("button");
    urgentGateButton.type = "button";
    urgentGateButton.className = "secondary inline-action";
    urgentGateButton.textContent = "긴급 게이트";
    urgentGateButton.title = "우선도 80 이상 긴급 품질 후보 게이트 결과 텍스트를 복사합니다.";
    urgentGateButton.addEventListener("click", async () => {
      let text = "";
      try {
        const res = await api(qualityUrgentGateTextPath);
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      const fallback = `Travel Planner 품질 게이트\n\n- 기준: 긴급 후보\n- 게이트: 후보 ${urgent}개 / 허용 0개 · ${urgent > 0 ? "실패 (exit 3)" : "통과"}`;
      await copyWithButtonFeedback(urgentGateButton, text || fallback, "긴급 품질 게이트 결과를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(urgentGateButton);
  }
  if (qualityUrgentSoftGateTextPath) {
    const urgentSoftGateButton = document.createElement("button");
    urgentSoftGateButton.type = "button";
    urgentSoftGateButton.className = "secondary inline-action";
    urgentSoftGateButton.textContent = "긴급 완화";
    urgentSoftGateButton.title = "우선도 80 이상 긴급 품질 후보 5개 이하 허용 게이트 결과 텍스트를 복사합니다.";
    urgentSoftGateButton.addEventListener("click", async () => {
      let text = "";
      try {
        const res = await api(qualityUrgentSoftGateTextPath);
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      const fallback = `Travel Planner 품질 게이트\n\n- 기준: 긴급 후보\n- 게이트: 후보 ${urgent}개 / 허용 5개 · ${urgent > 5 ? "실패 (exit 3)" : "통과"}`;
      await copyWithButtonFeedback(urgentSoftGateButton, text || fallback, "긴급 완화 품질 게이트 결과를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(urgentSoftGateButton);
  }
  if (qualityNextGateTextPath) {
    const nextGateButton = document.createElement("button");
    nextGateButton.type = "button";
    nextGateButton.className = "secondary inline-action";
    nextGateButton.textContent = "다음 게이트 복사";
    nextGateButton.title = `${nextFilterLabel} 기준 품질 게이트 결과 텍스트를 복사합니다.`;
    nextGateButton.addEventListener("click", async () => {
      let text = "";
      try {
        const res = await api(qualityNextGateTextPath);
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      const fallback = `Travel Planner 품질 게이트\n\n- 기준: ${nextFilterLabel}\n- 호출: ${qualityNextGateTextPath}`;
      await copyWithButtonFeedback(nextGateButton, text || fallback, "다음 품질 게이트 결과를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(nextGateButton);
  }
  if (qualityNextSoftGateTextPath) {
    const nextSoftGateButton = document.createElement("button");
    nextSoftGateButton.type = "button";
    nextSoftGateButton.className = "secondary inline-action";
    nextSoftGateButton.textContent = "다음 완화";
    nextSoftGateButton.title = `${nextFilterLabel} 기준 품질 후보 5개 이하 허용 게이트 결과 텍스트를 복사합니다.`;
    nextSoftGateButton.addEventListener("click", async () => {
      let text = "";
      try {
        const res = await api(qualityNextSoftGateTextPath);
        text = String(await res.text()).trim();
      } catch (_err) {
        text = "";
      }
      const fallback = `Travel Planner 품질 게이트\n\n- 기준: ${nextFilterLabel}\n- 게이트: 후보 ${nextGateCount}개 / 허용 5개 · ${nextGateCount > 5 ? "실패 (exit 3)" : "통과"}\n- 호출: ${qualityNextSoftGateTextPath}`;
      await copyWithButtonFeedback(nextSoftGateButton, text || fallback, "다음 완화 품질 게이트 결과를 복사했습니다.");
    });
    panel.append(" ");
    panel.appendChild(nextSoftGateButton);
  }
  if (topPlan?.id) {
    const target = document.createElement("span");
    target.className = "quality-target";
    const targetReason = formatQualityActionReason(topPlan);
    target.textContent = `최우선 대상: ${qualityTargetLabel(topPlan)}${urgent > 0 ? " · 긴급 후보 우선" : ""}${targetReason ? ` · ${targetReason}` : ""}`;
    panel.append(" ");
    panel.appendChild(target);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary inline-action";
    const needsAudit = Number(topPlan.qualityCheckCount || 0) <= 0;
    button.textContent = needsAudit ? "최우선 점검 생성 플랜 열기" : urgent > 0 ? "최우선 긴급 플랜 열기" : regression > 0 ? "최우선 악화 플랜 열기" : "최우선 보강 플랜 열기";
    button.title = `${topPlan.destination || "플랜"} ${needsAudit ? "품질 점검 생성" : "품질 보강"}으로 이동`;
    button.addEventListener("click", () => {
      const auditParam = needsAudit ? "&qualityAudit=1" : "";
      window.location.href = `/plan.html?id=${encodeURIComponent(topPlan.id)}${auditParam}#qualityRefine`;
    });
    panel.append(" ");
    panel.appendChild(button);
    if (action > 0) {
      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "secondary inline-action";
      copyButton.textContent = "TODO 복사";
      copyButton.title = "최우선 품질 고도화 TODO를 복사합니다.";
      copyButton.addEventListener("click", async () => {
        await copyWithButtonFeedback(copyButton, buildQualityTodoText(summary, topPlan), "품질 고도화 TODO를 복사했습니다.");
      });
      panel.append(" ");
      panel.appendChild(copyButton);

      [3, 5, 10].forEach((limit) => {
        const copyBundleButton = document.createElement("button");
        copyBundleButton.type = "button";
        copyBundleButton.className = "secondary inline-action";
        copyBundleButton.textContent = `TODO ${limit}`;
        copyBundleButton.title = `현재 고도화 후보 상위 ${limit}개 TODO를 복사합니다.`;
        copyBundleButton.addEventListener("click", async () => {
          const todo = await fetchQualityTodo(limit);
          const text = String(todo.todoText || "").trim() || buildQualityTodoBundleText(todo.plans, todo.summary?.qualityAction ?? action);
          await copyWithButtonFeedback(copyBundleButton, text, "품질 고도화 TODO 목록을 복사했습니다.");
        });
        panel.append(" ");
        panel.appendChild(copyBundleButton);
      });
      const copyAllButton = document.createElement("button");
      copyAllButton.type = "button";
      copyAllButton.className = "secondary inline-action";
      copyAllButton.textContent = "TODO 전체";
      copyAllButton.title = "현재 고도화 후보 전체 TODO를 복사합니다.";
      copyAllButton.addEventListener("click", async () => {
        const todo = await fetchQualityTodo(10, { all: true });
        const text = String(todo.todoText || "").trim() || buildQualityTodoBundleText(todo.plans, todo.summary?.qualityAction ?? action);
        await copyWithButtonFeedback(copyAllButton, text, "전체 품질 고도화 TODO를 복사했습니다.");
      });
      panel.append(" ");
      panel.appendChild(copyAllButton);
      const urgentButton = document.createElement("button");
      urgentButton.type = "button";
      urgentButton.className = "secondary inline-action";
      urgentButton.textContent = "긴급 TODO";
      urgentButton.title = "우선도 80 이상 품질 고도화 TODO를 복사합니다.";
      urgentButton.addEventListener("click", async () => {
        const todo = await fetchQualityTodo(10, { urgent: true });
        const text = String(todo.todoText || "").trim() || "Travel Planner 품질 고도화 TODO\n\n- 상태: 우선도 80 이상 후보가 없습니다.";
        await copyWithButtonFeedback(urgentButton, text, "긴급 품질 고도화 TODO를 복사했습니다.");
      });
      panel.append(" ");
      panel.appendChild(urgentButton);
      const urgentAllButton = document.createElement("button");
      urgentAllButton.type = "button";
      urgentAllButton.className = "secondary inline-action";
      urgentAllButton.textContent = "긴급 TODO 전체";
      urgentAllButton.title = "우선도 80 이상 품질 고도화 TODO 전체를 복사합니다.";
      urgentAllButton.addEventListener("click", async () => {
        const todo = await fetchQualityTodo(10, { urgent: true, all: true });
        const text = String(todo.todoText || "").trim() || "Travel Planner 품질 고도화 TODO\n\n- 상태: 우선도 80 이상 후보가 없습니다.";
        await copyWithButtonFeedback(urgentAllButton, text, "긴급 품질 고도화 TODO 전체를 복사했습니다.");
      });
      panel.append(" ");
      panel.appendChild(urgentAllButton);
    }
  }
  panel.classList.toggle("needs-attention", urgent > 0 || regression > 0 || quality > 0 || unaudited > 0);
  panel.classList.toggle("is-good", urgent <= 0 && regression <= 0 && quality <= 0 && unaudited <= 0);
}

async function loadTopQualityPlan(summary = {}) {
  const filter = String(summary.qualityNextFilter || "").trim() || (Number(summary.qualityUrgent) > 0
    ? "quality-urgent"
    : Number(summary.qualityRegression) > 0
    ? "quality-regression"
    : Number(summary.quality) > 0
    ? "quality"
    : Number(summary.qualityUnaudited) > 0
    ? "quality-unaudited"
    : "");
  if (!filter) return null;
  const res = await api(`/api/plans?filter=${encodeURIComponent(filter)}&limit=1`);
  const plans = await parseJsonSafe(res);
  return Array.isArray(plans) && plans.length ? plans[0] : null;
}

async function loadQualitySummary() {
  try {
    const res = await api("/api/plans/quality-summary");
    const summary = await parseJsonSafe(res);
    const topPlan = await loadTopQualityPlan(summary);
    updateQualityFilterShortcutCounts(summary);
    updateQualitySummaryPanel(summary, topPlan);
  } catch (err) {
    updateQualitySummaryPanel();
    console.debug("quality summary failed", err);
  }
}

const scheduleOperatorStatusRetry = typeof createOperatorStatusRetryScheduler === "function"
  ? createOperatorStatusRetryScheduler(() => loadStatus())
  : () => {};

function updateLlmModelHint() {
  const providerSelect = document.querySelector('select[name="llmProvider"]');
  const modelInput = document.querySelector('input[name="llmModel"]');
  if (!providerSelect || !modelInput) return;
  const operatorDetailsState = window.travelPlannerStatus?.operatorDetailsState || (window.travelPlannerStatus?.accessKeyRequired && window.travelPlannerStatus?.llmProvider === "hidden" ? "hidden" : "");
  if (operatorDetailsState === "rate-limited") {
    const retryAfter = Number(window.travelPlannerStatus?.operatorRetryAfterSeconds || 0);
    const retryText = retryAfter > 0 ? `${retryAfter}초 후` : "잠시 후";
    modelInput.placeholder = `${retryText} 기본 모델 확인`;
    modelInput.title = `요청 제한 중입니다. ${retryText} provider별 기본 모델을 다시 확인할 수 있습니다.`;
    return;
  }
  if (operatorDetailsState === "hidden") {
    const hasStoredAccessKey = typeof getAccessKey === "function" && Boolean(getAccessKey());
    modelInput.placeholder = hasStoredAccessKey ? "접근키 재입력 후 기본 모델 확인" : "접근키 저장 후 기본 모델 확인";
    modelInput.title = hasStoredAccessKey
      ? "저장된 접근키로 운영 세부 status를 확인하지 못했습니다. 접근키를 재입력한 뒤 provider별 기본 모델을 확인할 수 있습니다."
      : "보호 모드에서는 접근키를 저장한 뒤 provider별 기본 모델을 확인할 수 있습니다.";
    return;
  }
  const defaultModels = {
    anthropic: window.travelPlannerStatus?.llmDefaultModels?.anthropic || "claude-3-haiku-20240307",
    claude: window.travelPlannerStatus?.llmDefaultModels?.anthropic || "claude-3-haiku-20240307",
    codex: window.travelPlannerStatus?.llmDefaultModels?.openai || "gpt-4o-mini",
    openai: window.travelPlannerStatus?.llmDefaultModels?.openai || "gpt-4o-mini",
  };
  const defaultModel = defaultModels[providerSelect.value];
  modelInput.placeholder = defaultModel ? `비우면 ${defaultModel}` : "비우면 서버 기본 모델";
  modelInput.title = defaultModel ? `비우면 ${defaultModel} 모델을 사용합니다.` : "비우면 서버 .env의 기본 모델을 사용합니다.";
}

function renderShareSetupGuide(status) {
  const el = document.getElementById("shareSetupGuide");
  if (!el) return;
  if (!status.accessKeyRequired && !status.requireUserLlmKey) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  const hasStoredAccessKey = typeof getAccessKey === "function" && Boolean(getAccessKey());
  const accessStep = status.accessKeyRequired
    ? hasStoredAccessKey
      ? "접근 키가 이 브라우저에 저장되어 있습니다."
      : "오른쪽 아래 접근 키 설정으로 공유 접근 키를 먼저 저장합니다."
    : "공개 모드라 접근 키 없이 사용할 수 있습니다.";
  const billingStep = status.requireUserLlmKey
    ? "실행 방식을 OpenAI API key 또는 Anthropic API key로 고르고, 요청 1회용 API key를 붙여넣습니다."
    : "서버 기본 설정을 쓰거나, 사용자 provider API key를 요청 1회용으로 넣을 수 있습니다.";
  const modelStep = status.requireUserLlmKey
    ? "모델명은 비워도 되고, 직접 입력하면 히스토리에 직접 모델로 표시됩니다."
    : "provider/model 선택값은 브라우저에 기억되며, API key 값은 저장하지 않습니다.";
  const selectedProvider = document.querySelector('select[name="llmProvider"]')?.value || "server";
  const hasUserLlmApiKey = Boolean(document.querySelector('input[name="llmApiKey"]')?.value.trim());
  const selectedModel = document.querySelector('input[name="llmModel"]')?.value.trim() || "";
  const providerLabels = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    server: "서버 기본",
  };
  const selectedProviderLabel = providerLabels[selectedProvider] || selectedProvider;
  const llmInputReady = !status.requireUserLlmKey || (selectedProvider !== "server" && hasUserLlmApiKey);
  const selectedLlmInputSummary = selectedProvider === "server"
    ? "서버 기본"
    : `${selectedProviderLabel} ${hasUserLlmApiKey ? "key 입력됨" : "key 필요"}${selectedModel ? ` / 직접 모델 ${selectedModel}` : " / 기본 모델"}`;
  const selectedLlmGuideLine = status.requireUserLlmKey && selectedProvider === "server"
    ? "현재 선택: 서버 기본은 사용자 key 필수 모드에서 사용할 수 없으니 OpenAI 또는 Anthropic으로 바꾸세요."
    : `현재 선택: ${selectedLlmInputSummary}`;
  const providerKeyLinkLines = selectedProvider === "openai"
    ? ["OpenAI API key 발급: https://platform.openai.com/api-keys"]
    : selectedProvider === "anthropic"
    ? ["Anthropic API key 발급: https://console.anthropic.com/settings/keys"]
    : [
      "OpenAI API key 발급: https://platform.openai.com/api-keys",
      "Anthropic API key 발급: https://console.anthropic.com/settings/keys",
    ];
  const userGuideKeyPrepStep = !status.requireUserLlmKey
    ? "3. 서버 기본 설정을 쓰거나 본인 provider API key를 요청 1회용으로 입력할 수 있습니다."
    : selectedProvider === "openai"
    ? "3. OpenAI Platform에서 본인 API key를 발급합니다."
    : selectedProvider === "anthropic"
    ? "3. Anthropic Console에서 본인 API key를 발급합니다."
    : "3. OpenAI Platform 또는 Anthropic Console에서 본인 API key를 발급합니다.";
  const userGuideLlmInputStep = !status.requireUserLlmKey
    ? "4. 필요한 경우 실행 방식과 모델명을 선택합니다."
    : selectedProvider === "server"
    ? "4. 실행 방식을 OpenAI API key 또는 Anthropic API key로 선택하고, API key를 요청 1회용으로 붙여넣습니다."
    : `4. 실행 방식을 ${selectedProviderLabel} API key로 유지하고, API key를 요청 1회용으로 붙여넣습니다.`;
  const operatorDetailsState = status.operatorDetailsState || (!status.accessKeyRequired ? "public" : status.llmProvider === "hidden" ? "hidden" : "confirmed");
  const checks = [
    {
      ok: !status.accessKeyRequired || hasStoredAccessKey,
      label: status.accessKeyRequired ? "접근 키 저장" : "접근 키 불필요",
      detail: status.accessKeyRequired
        ? hasStoredAccessKey ? "저장됨" : "필요"
        : "공개 모드",
    },
    {
      ok: !status.accessKeyRequired || operatorDetailsState === "confirmed" || operatorDetailsState === "public",
      label: "운영 세부",
      detail: operatorDetailsState === "rate-limited"
        ? "제한 대기"
        : operatorDetailsState === "hidden"
        ? "숨김"
        : "확인됨",
    },
    {
      ok: Boolean(status.requireUserLlmKey),
      label: "웹 LLM 과금",
      detail: status.requireUserLlmKey ? "사용자 key 필수" : "서버 기본 허용",
    },
    {
      ok: llmInputReady,
      label: "LLM 입력",
      detail: status.requireUserLlmKey
        ? selectedProvider === "server"
          ? "provider 필요"
          : hasUserLlmApiKey
          ? `${selectedProviderLabel} key 입력됨`
          : "API key 필요"
        : "선택",
    },
    {
      ok: Boolean(status.apiRateLimit?.max),
      label: "API 제한",
      detail: status.apiRateLimit?.max
        ? `${status.apiRateLimit.max}회/${Math.round((status.apiRateLimit.windowMs || 60000) / 1000)}초`
        : "꺼짐",
    },
  ];
  const nextAction = status.accessKeyRequired && !hasStoredAccessKey
    ? "공유 접근 키를 먼저 저장하세요."
    : status.requireUserLlmKey && selectedProvider === "server"
    ? "실행 방식을 OpenAI API key 또는 Anthropic API key로 바꾸세요."
    : status.requireUserLlmKey && !hasUserLlmApiKey
    ? `${selectedProviderLabel || "선택한 provider"} API key를 요청 1회용으로 입력하세요.`
    : operatorDetailsState === "rate-limited"
    ? "잠시 후 운영 세부 상태를 다시 확인하세요."
    : "새 플랜 생성 또는 상세 고도화를 진행할 수 있습니다.";
  const checklist = checks.map((item) => `
    <li>
      <span class="share-check ${item.ok ? "ok" : "warn"}">${item.ok ? "OK" : "확인"}</span>
      <strong>${escapeText(item.label)}</strong>
      <span>${escapeText(item.detail)}</span>
    </li>
  `).join("");
  const actions = [
    status.accessKeyRequired && !hasStoredAccessKey ? '<button type="button" class="secondary share-access-key-button" title="공유 접근 키를 이 브라우저에 저장합니다.">접근 키 설정</button>' : "",
    status.requireUserLlmKey ? '<button type="button" class="secondary share-llm-options-button" title="LLM API key 입력 영역으로 이동합니다.">LLM 입력으로 이동</button>' : "",
    '<button type="button" class="secondary share-copy-env-button" title="공유 서버 운영자가 .env에 넣을 예시를 복사합니다.">운영 env 복사</button>',
    '<button type="button" class="secondary share-copy-url-button" title="사용자에게 보낼 접속 URL만 복사합니다.">사용자 URL 복사</button>',
    '<button type="button" class="secondary share-copy-user-guide-button" title="공유받은 사용자가 따라 할 전체 사용 순서를 복사합니다.">사용자 안내 복사</button>',
    '<button type="button" class="secondary share-copy-next-action-button" title="현재 상태에서 바로 할 일 한 줄만 복사합니다.">액션만 복사</button>',
    '<button type="button" class="secondary share-copy-checklist-button" title="운영/공유 준비도 전체 요약을 복사합니다.">전체 준비도 복사</button>',
  ].filter(Boolean).join("");
  el.classList.remove("hidden");
  el.innerHTML = `
    <h3>공유 서버 시작 순서</h3>
    <ol>
      <li>${escapeText(accessStep)}</li>
      <li>${escapeText(billingStep)}</li>
      <li>${escapeText(modelStep)}</li>
    </ol>
    <p class="share-next-action"><strong>다음 액션:</strong> ${escapeText(nextAction)}</p>
    <ul class="share-checklist">${checklist}</ul>
    <p>계획 생성 후 API key 입력칸은 비워지고, 플랜에는 인증 방식/provider/model 감사 정보만 남습니다.</p>
    ${actions ? `<div class="share-actions">${actions}</div>` : ""}
  `;
  el.querySelector(".share-access-key-button")?.addEventListener("click", () => {
    if (typeof promptAccessKey !== "function") return;
    promptAccessKey();
  });
  el.querySelector(".share-llm-options-button")?.addEventListener("click", () => {
    const providerSelect = document.querySelector('select[name="llmProvider"]');
    const apiKeyInput = document.querySelector('input[name="llmApiKey"]');
    if (status.requireUserLlmKey && providerSelect?.value === "server") {
      providerSelect.value = "openai";
      providerSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    document.querySelector(".byok-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (apiKeyInput && !apiKeyInput.value.trim()) {
      apiKeyInput.focus();
    } else {
      providerSelect?.focus();
    }
  });
  el.querySelector(".share-copy-env-button")?.addEventListener("click", async (event) => {
    await copyWithButtonFeedback(event.currentTarget, [
      "TRAVEL_ACCESS_KEY=공유_접근키",
      "TRAVEL_REQUIRE_USER_LLM_KEY=true",
      "TRAVEL_API_RATE_LIMIT_MAX=120",
      "TRAVEL_API_RATE_LIMIT_WINDOW_MS=60000",
    ].join("\n"), "공유 서버 운영 env 예시를 복사했습니다.");
  });
  el.querySelector(".share-copy-url-button")?.addEventListener("click", async (event) => {
    const shareUrl = await preferredShareUrlInfo();
    const text = shareUrl.fallback
      ? `${shareUrl.url}\n주의: 이 주소가 localhost라면 공유 전 Wi-Fi URL 표시를 누른 뒤 다시 복사해주세요.`
      : shareUrl.url;
    await copyWithButtonFeedback(event.currentTarget, text, "사용자 접속 URL을 복사했습니다.");
  });
  el.querySelector(".share-copy-user-guide-button")?.addEventListener("click", async (event) => {
    const shareUrl = await preferredShareUrlInfo();
    const lines = [
      "Travel Planner 공유 사용 순서",
      `웹 주소: ${shareUrl.url}`,
      ...(shareUrl.fallback ? ["주의: 이 주소가 localhost라면 공유 전 Wi-Fi URL 표시를 누른 뒤 다시 복사해주세요."] : []),
      selectedLlmGuideLine,
      `현재 다음 액션: ${nextAction}`,
      "1. 공유받은 웹 주소를 엽니다.",
      status.accessKeyRequired ? "2. 안내받은 접근 키를 저장합니다." : "2. 접근 키 없이 바로 사용할 수 있습니다.",
      userGuideKeyPrepStep,
      userGuideLlmInputStep,
      "5. 새 플랜 생성 또는 상세 고도화를 실행합니다.",
      ...providerKeyLinkLines,
      "참고: API key 값은 저장하지 않고 요청 직후 화면 입력칸에서 비웁니다.",
    ];
    await copyWithButtonFeedback(event.currentTarget, lines.join("\n"), "공유 사용자 안내문을 복사했습니다.");
  });
  el.querySelector(".share-copy-next-action-button")?.addEventListener("click", async (event) => {
    await copyWithButtonFeedback(
      event.currentTarget,
      `Travel Planner 다음 액션: ${nextAction}\n생성 시각: ${new Date().toLocaleString()}`,
      "현재 다음 액션을 복사했습니다."
    );
  });
  el.querySelector(".share-copy-checklist-button")?.addEventListener("click", async (event) => {
    const operatorDetailsVisible = operatorDetailsState !== "hidden" && operatorDetailsState !== "rate-limited";
    const lines = [
      "Travel Planner 공유 서버 준비도",
      `- 생성 시각: ${new Date().toLocaleString()}`,
      `- API 접근: ${status.accessKeyRequired ? "보호 모드" : "공개 모드"}`,
      `- 웹 LLM 정책: ${status.requireUserLlmKey ? "사용자 key 필수" : "서버 기본 허용"}`,
      `- 현재 웹 LLM 입력: ${selectedLlmInputSummary}`,
      `- LLM provider: ${operatorDetailsVisible ? status.llmProvider || "auto" : operatorDetailsState === "rate-limited" ? "제한 대기" : "접근키 필요"}`,
      `- OpenAI 기본: ${operatorDetailsVisible ? status.llmDefaultModels?.openai || "gpt-4o-mini" : "숨김"}`,
      `- Anthropic 기본: ${operatorDetailsVisible ? status.llmDefaultModels?.anthropic || "claude-3-haiku-20240307" : "숨김"}`,
      `- 다음 액션: ${nextAction}`,
      ...checks.map((item) => `- ${item.ok ? "OK" : "확인"} ${item.label}: ${item.detail}`),
    ];
    await copyWithButtonFeedback(event.currentTarget, lines.join("\n"), "공유 서버 준비도를 복사했습니다.");
  });
}

function refreshShareSetupGuide() {
  if (window.travelPlannerStatus) renderShareSetupGuide(window.travelPlannerStatus);
}

function renderByokPolicyMessage(status = window.travelPlannerStatus) {
  const byokPolicyMessage = document.getElementById("byokPolicyMessage");
  if (!byokPolicyMessage) return;
  if (!status?.requireUserLlmKey) {
    byokPolicyMessage.classList.add("hidden");
    byokPolicyMessage.textContent = "";
    return;
  }
  const provider = document.querySelector('select[name="llmProvider"]')?.value || "server";
  const hasApiKey = Boolean(document.querySelector('input[name="llmApiKey"]')?.value.trim());
  const providerLabels = {
    anthropic: "Anthropic Console",
    openai: "OpenAI Platform",
  };
  byokPolicyMessage.classList.remove("hidden");
  if (provider === "server") {
    byokPolicyMessage.textContent = "공유 모드가 켜져 있어 서버 기본 키로는 생성할 수 없습니다. OpenAI Platform 또는 Anthropic Console API key를 요청 1회용으로 입력해주세요.";
    return;
  }
  if (!hasApiKey) {
    byokPolicyMessage.textContent = `${providerLabels[provider] || "선택한 provider"} API key를 요청 1회용으로 입력하면 생성할 수 있습니다.`;
    return;
  }
  byokPolicyMessage.textContent = `${providerLabels[provider] || "선택한 provider"} API key 입력이 준비됐습니다. 생성 후 key 입력칸은 비워지고 key 값은 저장하지 않습니다.`;
}

async function copyText(value) {
  const text = String(value || "");
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  window.prompt("복사하세요.", text);
  return false;
}

async function copyWithButtonFeedback(button, value, successTitle) {
  const originalText = button.textContent;
  const originalTitle = button.title;
  try {
    const copied = await copyText(value);
    if (copied === false) {
      button.textContent = "수동 복사";
      button.title = "브라우저가 자동 복사를 막아 수동 복사 창을 열었습니다.";
    } else {
      button.textContent = "복사됨";
      button.title = successTitle;
    }
  } catch (err) {
    button.textContent = "복사 실패";
    button.title = "브라우저가 클립보드 복사를 허용하지 않았습니다.";
  }
  setTimeout(() => {
    button.textContent = originalText;
    button.title = originalTitle;
  }, 1200);
}

function lanUrlMarkup(url) {
  return `<span class="status-url"><span class="badge">Wi-Fi</span> <a href="${escapeText(url)}">${escapeText(url)}</a> <button type="button" class="secondary copy-url-button" data-url="${escapeText(url)}" title="이 Wi-Fi 접속 URL을 복사합니다.">복사</button></span>`;
}

async function preferredShareUrlInfo() {
  const visibleNetworkUrl = document.querySelector(".copy-url-button[data-url]")?.dataset.url;
  if (visibleNetworkUrl) {
    return { fallback: false, url: visibleNetworkUrl };
  }
  if (typeof optionalApi === "function" && typeof getAccessKey === "function" && getAccessKey()) {
    try {
      const res = await optionalApi("/api/network");
      if (res?.ok) {
        const body = await parseJsonSafe(res);
        const networkUrl = Array.isArray(body.lanUrls) ? body.lanUrls[0] : "";
        if (networkUrl) return { fallback: false, url: networkUrl };
      }
    } catch (err) {
      console.debug("share url lookup failed", err);
    }
  }
  return {
    fallback: true,
    url: window.location.origin,
  };
}

function attachCopyUrlButtons(root = document) {
  root.querySelectorAll(".copy-url-button").forEach((button) => {
    if (button.dataset.copyBound === "true") return;
    button.dataset.copyBound = "true";
    button.addEventListener("click", async () => {
      await copyWithButtonFeedback(button, button.dataset.url, "Wi-Fi 접속 URL을 복사했습니다.");
    });
  });
}

async function loadOperatorStatusIfAvailable(status) {
  if (!status.accessKeyRequired || typeof getAccessKey !== "function" || !getAccessKey()) return status;
  if (typeof optionalApi !== "function") return status;
  const res = await optionalApi("/api/operator-status");
  if (res?.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") || "");
    return {
      ...status,
      operatorDetailsState: "rate-limited",
      operatorRetryAfterSeconds: retryAfter > 0 ? Math.ceil(retryAfter) : 0,
    };
  }
  if (!res?.ok) return status;
  return { ...status, ...(await parseJsonSafe(res)) };
}

function markIosFirstRunChecklistItem(itemId) {
  try {
    const key = "travelPlannerIosFirstRunChecklist:v1";
    const state = JSON.parse(window.localStorage.getItem(key) || "{}");
    state[itemId] = true;
    state.updatedAt = new Date().toISOString();
    window.localStorage.setItem(key, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("travel-ios-first-run-checklist-change", {
      detail: { itemId, checked: true, source: "app" },
    }));
  } catch {
    // Best-effort iPhone first-run progress.
  }
}

const HOME_PLAN_SNAPSHOT_PREFIX = "travel-planner:home-plan-snapshot:v1:";

function normalizeHomePlanSnapshotContext(query = "", filter = "all") {
  return {
    filter: String(filter || "all").trim() || "all",
    query: String(query || "").trim(),
  };
}

function homePlanSnapshotKey(query = "", filter = "all") {
  const context = normalizeHomePlanSnapshotContext(query, filter);
  return `${HOME_PLAN_SNAPSHOT_PREFIX}${encodeURIComponent(context.filter)}:${encodeURIComponent(context.query)}`;
}

function parseHomePlanSnapshot(value) {
  if (!value) return null;
  try {
    const snapshot = JSON.parse(value);
    if (snapshot?.schemaVersion !== 1 || !Array.isArray(snapshot.plans)) return null;
    return snapshot;
  } catch {
    return null;
  }
}

function homePlanSnapshotMatchesQuery(plan, query = "") {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return true;
  return [
    plan?.destination,
    plan?.departure,
    plan?.country,
    plan?.scope,
    plan?.companions,
    plan?.tripType,
    plan?.highlights,
    plan?.notes,
  ].join(" ").toLowerCase().includes(normalized);
}

function homePlanSnapshotMatchesFilter(plan, filter = "all") {
  const normalized = String(filter || "all").trim() || "all";
  if (normalized === "all") return true;
  if (normalized === "pinned") return Boolean(plan?.pinned);
  if (normalized === "upcoming" || normalized === "active" || normalized === "completed") {
    return getTripMissionStatus(plan) === normalized;
  }
  if (normalized === "quality" || normalized === "quality-action") return missionNeedsQuality(plan);
  if (normalized === "quality-urgent") return Number(plan?.qualityActionPriority || 0) >= 90;
  if (normalized === "quality-ok") return Number(plan?.qualityCheckCount || 0) > 0 && Number(plan?.qualityWarningCount || 0) <= 0;
  if (normalized === "quality-unaudited") return Number(plan?.qualityCheckCount || 0) <= 0;
  if (normalized === "quality-regression") return Number(plan?.qualityWarningDelta || 0) > 0;
  if (normalized === "quality-improved") return Number(plan?.qualityWarningDelta || 0) < 0;
  return true;
}

function filterHomePlanSnapshot(snapshot, query = "", filter = "all") {
  const context = normalizeHomePlanSnapshotContext(query, filter);
  return {
    ...snapshot,
    derivedFromAll: true,
    filter: context.filter,
    query: context.query,
    plans: snapshot.plans.filter((plan) =>
      homePlanSnapshotMatchesQuery(plan, context.query)
      && homePlanSnapshotMatchesFilter(plan, context.filter)
    ),
  };
}

function readHomePlanSnapshot(query = "", filter = "all") {
  try {
    const exact = parseHomePlanSnapshot(localStorage.getItem(homePlanSnapshotKey(query, filter)));
    if (exact) return exact;
    const context = normalizeHomePlanSnapshotContext(query, filter);
    if (!context.query && context.filter === "all") return null;
    const allPlans = parseHomePlanSnapshot(localStorage.getItem(homePlanSnapshotKey("", "all")));
    return allPlans ? filterHomePlanSnapshot(allPlans, query, filter) : null;
  } catch {
    return null;
  }
}

function writeHomePlanSnapshot(plans, query = "", filter = "all") {
  if (!Array.isArray(plans)) return;
  const context = normalizeHomePlanSnapshotContext(query, filter);
  const snapshot = {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    filter: context.filter,
    query: context.query,
    count: plans.length,
    plans,
  };
  try {
    localStorage.setItem(homePlanSnapshotKey(context.query, context.filter), JSON.stringify(snapshot));
  } catch {
    // Best-effort iOS Home Screen cache. Quota/private-mode failures should not block live use.
  }
}

function renderHomePlanSnapshotNotice(listElement, snapshot) {
  const existing = document.getElementById("offlinePlanSnapshotNotice");
  if (!snapshot) {
    existing?.remove();
    return;
  }
  const notice = existing || document.createElement("p");
  notice.id = "offlinePlanSnapshotNotice";
  notice.className = "offline-snapshot-notice";
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  const savedAt = snapshot.savedAt
    ? new Date(snapshot.savedAt).toLocaleString("ko-KR", {
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
    })
    : "최근";
  const scope = missionBoardScopeLabel({ query: snapshot.query, filter: snapshot.filter });
  const derived = snapshot.derivedFromAll ? " · 전체 snapshot에서 현재 범위를 다시 걸렀습니다." : "";
  notice.textContent = `오프라인 snapshot 표시 중: ${scope} · ${snapshot.plans.length}개 · ${savedAt} 저장${derived}`;
  if (!existing && listElement.parentNode) {
    listElement.parentNode.insertBefore(notice, listElement);
  }
}

async function loadPlans(query = "", filter = "all") {
  syncHomeListUrl(query, filter);
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (filter && filter !== "all") params.set("filter", filter);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const ul = document.getElementById("planList");
  if (!ul) return;
  let plans = [];
  let offlineSnapshot = null;
  try {
    const res = await api(`/api/plans${suffix}`);
    if (!res.ok) throw new Error(`plans request failed: ${res.status}`);
    plans = await parseJsonSafe(res);
    writeHomePlanSnapshot(plans, query, filter);
  } catch {
    offlineSnapshot = readHomePlanSnapshot(query, filter);
    if (!offlineSnapshot) {
      renderTripMissionBoard([], { query, filter });
      renderHomePlanSnapshotNotice(ul, null);
      ul.innerHTML = `<li>${navigator.onLine === false ? "오프라인 상태이고 저장된 홈 목록 snapshot이 없습니다. 네트워크가 연결되면 다시 불러오세요." : "여행 목록을 불러오지 못했고 사용할 수 있는 홈 목록 snapshot이 없습니다."}</li>`;
      return;
    }
    plans = offlineSnapshot.plans;
    markIosFirstRunChecklistItem("offline-read");
  }
  renderHomePlanSnapshotNotice(ul, offlineSnapshot);
  renderTripMissionBoard(plans, { query, filter });
  ul.innerHTML = "";
  if (!Array.isArray(plans) || plans.length === 0) {
    const emptyMessage = filter === "quality"
      ? "품질 확인이 필요한 플랜이 없습니다."
      : filter === "quality-action"
      ? "고도화 후보 플랜이 없습니다."
      : filter === "quality-urgent"
      ? "긴급 품질 후보 플랜이 없습니다."
      : filter === "quality-ok"
      ? "품질 OK 플랜이 없습니다."
      : filter === "quality-unaudited"
      ? "품질 미점검 플랜이 없습니다."
      : filter === "quality-regression"
      ? "품질 확인 항목이 늘어난 플랜이 없습니다."
      : filter === "quality-improved"
      ? "품질 확인 항목이 줄어든 플랜이 없습니다."
      : query || filter !== "all"
      ? "조건에 맞는 플랜이 없습니다."
      : "아직 저장된 플랜이 없습니다.";
    ul.innerHTML = `<li>${escapeText(emptyMessage)}</li>`;
    return;
  }

  const listMissionFocus = selectMissionFocus(plans);
  const focusPlanId = planIdFromMissionFocus(listMissionFocus);
  plans.forEach((p) => {
    const li = document.createElement("li");
    const isMissionFocus = focusPlanId && String(p.id) === focusPlanId;
    const focusBadge = isMissionFocus ? '<span class="badge">최우선</span> ' : "";
    if (isMissionFocus) li.classList.add("is-mission-focus");
    const pinned = p.pinned ? '<span class="badge">고정</span> ' : "";
    const status = `<span class="badge">${escapeText(getTripStatus(p))}</span> `;
    const llmAudit = formatLlmAudit(p);
    const llmAuditBadge = llmAudit ? `<span class="badge">${escapeText(llmAudit)}</span> ` : "";
    const qualityAudit = formatQualityAudit(p);
    const qualityAuditBadge = qualityAudit ? `<span class="badge">${escapeText(qualityAudit)}</span> ` : "";
    const qualityReason = filter === "quality-action" || filter === "quality-urgent" ? formatQualityActionReason(p) : "";
    const qualityReasonBadge = qualityReason ? `<span class="badge">${escapeText(qualityReason)}</span> ` : "";
    const qualityAction = Number(p.qualityWarningCount || 0) > 0
      ? ` · <a href="/plans/${p.id}#qualityRefine">품질 보강</a>`
      : Number(p.qualityCheckCount || 0) <= 0
      ? ` · <a href="/plans/${p.id}?qualityAudit=1#qualityRefine">품질 점검 생성</a>`
      : "";
    li.innerHTML = `${focusBadge}${pinned}${status}${llmAuditBadge}${qualityAuditBadge}${qualityReasonBadge}<a href="/plans/${p.id}">${escapeText(p.destination)}</a> · ${escapeText(p.departure || "서울")} 출발 · ${escapeText(p.startDate)} ~ ${escapeText(p.endDate)} · v${p.latestVersion} · ${escapeText(p.scope)}${qualityAction}`;
    if (isMissionFocus && listMissionFocus) {
      const focusOpenButton = document.createElement("button");
      focusOpenButton.type = "button";
      focusOpenButton.className = "secondary inline-action mission-focus-list-action";
      focusOpenButton.textContent = missionFocusActionLabel(listMissionFocus);
      focusOpenButton.title = missionFocusLinkNote(listMissionFocus) || listMissionFocus.actionLabel || "최우선 미션을 엽니다.";
      focusOpenButton.setAttribute("aria-label", `최우선 액션: ${p.destination || "최우선 플랜"} ${missionFocusActionLabel(listMissionFocus)}`);
      focusOpenButton.addEventListener("click", () => {
        window.location.href = missionFocusHref(listMissionFocus);
      });
      const focusCopyButton = document.createElement("button");
      focusCopyButton.type = "button";
      focusCopyButton.className = "secondary inline-action mission-focus-list-copy";
      focusCopyButton.textContent = "최우선 복사";
      focusCopyButton.title = "미션 보드 최우선 플랜 안내를 복사합니다.";
      focusCopyButton.setAttribute("aria-label", `최우선 액션: ${p.destination || "최우선 플랜"} 최우선 미션 안내 복사`);
      const focusActionFeedback = document.createElement("span");
      focusActionFeedback.className = "mission-focus-list-feedback";
      focusActionFeedback.setAttribute("role", "status");
      focusActionFeedback.setAttribute("aria-live", "polite");
      focusActionFeedback.setAttribute("aria-atomic", "true");
      const focusActionFeedbackId = `missionFocusFeedback-${String(p.id || "focus").replace(/[^A-Za-z0-9_-]/g, "-")}`;
      const focusActionLabelId = `missionFocusActionLabel-${String(p.id || "focus").replace(/[^A-Za-z0-9_-]/g, "-")}`;
      focusActionFeedback.id = focusActionFeedbackId;
      focusOpenButton.setAttribute("aria-describedby", focusActionFeedbackId);
      focusCopyButton.setAttribute("aria-describedby", focusActionFeedbackId);
      let focusActionFeedbackTimer = null;
      let focusActionFeedbackResetToken = 0;
      const resetFocusActionFeedbackSoon = () => {
        const resetToken = focusActionFeedbackResetToken;
        if (focusActionFeedbackTimer) window.clearTimeout(focusActionFeedbackTimer);
        focusActionFeedbackTimer = window.setTimeout(() => {
          if (resetToken !== focusActionFeedbackResetToken) return;
          setFocusActionFeedback("액션 준비", "ready", false);
        }, 2200);
      };
      const setFocusActionFeedback = (message, state = "ready", autoReset = state !== "ready" && state !== "working") => {
        focusActionFeedbackResetToken += 1;
        if (focusActionFeedbackTimer) {
          window.clearTimeout(focusActionFeedbackTimer);
          focusActionFeedbackTimer = null;
        }
        focusActionFeedback.textContent = message;
        focusActionFeedback.dataset.state = state;
        focusActionFeedback.title = `최우선 액션 상태: ${message}`;
        focusActionFeedback.setAttribute("aria-label", `최우선 액션 상태: ${message}`);
        if (autoReset) resetFocusActionFeedbackSoon();
      };
      const runFocusBusyAction = async (button, action) => {
        if (button.disabled) return;
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        try {
          await action();
        } finally {
          button.disabled = false;
          button.removeAttribute("aria-busy");
        }
      };
      setFocusActionFeedback("액션 준비");
      focusOpenButton.addEventListener("click", () => {
        setFocusActionFeedback("최우선 열기", "open");
      });
      const focusLinkButton = document.createElement("button");
      focusLinkButton.type = "button";
      focusLinkButton.className = "secondary inline-action mission-focus-list-link";
      focusLinkButton.textContent = "최우선 링크";
      focusLinkButton.title = "미션 보드가 계산한 최우선 목적지 링크만 복사합니다.";
      focusLinkButton.setAttribute("aria-label", `최우선 액션: ${p.destination || "최우선 플랜"} 미션 보드 최우선 목적지 링크 복사`);
      focusLinkButton.setAttribute("aria-describedby", focusActionFeedbackId);
      focusLinkButton.addEventListener("click", async () => {
        await runFocusBusyAction(focusLinkButton, async () => {
          setFocusActionFeedback("링크 복사 중", "working");
          await copyWithButtonFeedback(
            focusLinkButton,
            missionFocusUrl(listMissionFocus),
            "최우선 미션 링크를 복사했습니다."
          );
          setFocusActionFeedback("링크 복사됨", "success");
        });
      });
      const focusReasonButton = document.createElement("button");
      focusReasonButton.type = "button";
      focusReasonButton.className = "secondary inline-action mission-focus-list-reason";
      focusReasonButton.textContent = "최우선 이유";
      focusReasonButton.title = "미션 보드가 이 플랜을 최우선으로 고른 이유를 짧게 복사합니다.";
      focusReasonButton.setAttribute("aria-label", `최우선 액션: ${p.destination || "최우선 플랜"} 최우선 선정 이유 복사`);
      focusReasonButton.setAttribute("aria-describedby", focusActionFeedbackId);
      focusReasonButton.addEventListener("click", async () => {
        await runFocusBusyAction(focusReasonButton, async () => {
          const reasonText = buildMissionFocusReasonText(listMissionFocus, { query, filter }, p.destination || "최우선 플랜");
          setFocusActionFeedback("이유 복사 중", "working");
          await copyWithButtonFeedback(focusReasonButton, reasonText, "최우선 선정 이유를 복사했습니다.");
          setFocusActionFeedback("이유 복사됨", "success");
        });
      });
      focusCopyButton.addEventListener("click", async () => {
        await runFocusBusyAction(focusCopyButton, async () => {
          setFocusActionFeedback("복사 중", "working");
          await copyWithButtonFeedback(
            focusCopyButton,
            buildMissionFocusShareText(listMissionFocus, { query, filter }),
            "최우선 미션을 복사했습니다."
          );
          setFocusActionFeedback("복사됨", "success");
        });
      });
      const focusShareButton = document.createElement("button");
      focusShareButton.type = "button";
      focusShareButton.className = "secondary inline-action mission-focus-list-share";
      focusShareButton.textContent = "최우선 공유";
      focusShareButton.title = "미션 보드 최우선 플랜 안내를 공유합니다.";
      focusShareButton.setAttribute("aria-label", `최우선 액션: ${p.destination || "최우선 플랜"} 최우선 미션 안내 공유`);
      focusShareButton.setAttribute("aria-describedby", focusActionFeedbackId);
      focusShareButton.addEventListener("click", async () => {
        if (focusShareButton.disabled) return;
        const text = buildMissionFocusShareText(listMissionFocus, { query, filter });
        const url = missionFocusUrl(listMissionFocus);
        const originalShareButtonLabel = focusShareButton.textContent;
        focusShareButton.disabled = true;
        focusShareButton.textContent = "공유 중";
        focusShareButton.setAttribute("aria-busy", "true");
        setFocusActionFeedback("공유 중", "working");
        try {
          if (navigator.share) {
            try {
              await navigator.share({ title: "Travel Planner 최우선 목적지", text, url });
              setFocusActionFeedback("공유 완료", "success");
              return;
            } catch (err) {
              if (err?.name === "AbortError") {
                setFocusActionFeedback("공유 취소", "cancelled");
                return;
              }
            }
          }
          setFocusActionFeedback("공유 대신 복사", "fallback");
          await copyWithButtonFeedback(focusShareButton, text, "최우선 미션을 복사했습니다.");
          setFocusActionFeedback("복사됨", "success");
        } finally {
          focusShareButton.disabled = false;
          focusShareButton.textContent = originalShareButtonLabel;
          focusShareButton.removeAttribute("aria-busy");
        }
      });
      const focusActionGroup = document.createElement("span");
      focusActionGroup.className = "mission-focus-list-actions";
      focusActionGroup.setAttribute("role", "group");
      focusActionGroup.setAttribute("aria-labelledby", focusActionLabelId);
      focusActionGroup.setAttribute("aria-describedby", focusActionFeedbackId);
      focusActionGroup.title = `${p.destination || "최우선 플랜"} 최우선 액션: 미션 보드가 계산한 목적지 열기, 링크 복사, 이유 복사, 안내 복사, 공유를 처리합니다.`;
      const focusActionLabel = document.createElement("span");
      focusActionLabel.id = focusActionLabelId;
      focusActionLabel.className = "mission-focus-list-action-label";
      focusActionLabel.textContent = "최우선 액션";
      focusActionLabel.title = "미션 보드가 고른 최우선 플랜의 열기, 링크 복사, 이유 복사, 안내 복사, 공유 액션입니다.";
      focusActionGroup.append(focusActionLabel, focusOpenButton, focusLinkButton, focusReasonButton, focusCopyButton, focusShareButton, focusActionFeedback);
      li.append(" ");
      li.appendChild(focusActionGroup);
    }
    if (filter === "quality-action" || filter === "quality-urgent") {
      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "secondary inline-action";
      copyButton.textContent = "TODO 복사";
      copyButton.title = `${escapeText(p.destination || "플랜")} 품질 고도화 TODO를 복사합니다.`;
      copyButton.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        await copyWithButtonFeedback(button, buildPlanQualityTodoText(p), "품질 고도화 TODO를 복사했습니다.");
      });
      li.append(" ");
      li.appendChild(copyButton);

      const preview = document.createElement("div");
      preview.className = "plan-todo-preview";
      preview.textContent = `TODO 미리보기: ${buildPlanQualityTodoPreview(p)}`;
      preview.title = buildPlanQualityTodoText(p);
      li.appendChild(preview);
    }
    ul.appendChild(li);
  });
}

async function loadStatus() {
  const el = document.getElementById("serverStatus");
  if (!el) return;
  const res = await api("/api/status");
  if (!res.ok) {
    el.innerHTML = '<span class="badge">오류</span><span>서버 상태를 불러오지 못했습니다.</span>';
    return;
  }
  let status = await parseJsonSafe(res);
  status = await loadOperatorStatusIfAvailable(status);
  window.travelPlannerStatus = status;
  scheduleOperatorStatusRetry(status);
  const protection = status.accessKeyRequired ? "보호 모드" : "공개 모드";
  const accessKeyStorage = typeof accessKeyStorageLabel === "function" ? accessKeyStorageLabel() : "확인 불가";
  const operatorDetailsState = status.operatorDetailsState || (!status.accessKeyRequired ? "public" : status.llmProvider === "hidden" ? "hidden" : "confirmed");
  const operatorDetailsHidden = operatorDetailsState === "hidden";
  const hasStoredAccessKey = typeof getAccessKey === "function" && Boolean(getAccessKey());
  const operatorRetryAfter = Number(status.operatorRetryAfterSeconds || 0);
  const operatorDetails = operatorDetailsState === "public" ? "공개" : operatorDetailsState === "rate-limited" ? operatorRetryAfter > 0 ? `제한 대기 ${operatorRetryAfter}초` : "제한 대기" : operatorDetailsHidden ? hasStoredAccessKey ? "키 확인 필요" : "숨김" : "확인됨";
  const defaultYear = status.defaultYear || "현재 연도";
  const byok = status.byokSupported ? "provider key 가능" : "서버 key만";
  const webLlmPolicy = status.webLlmPolicy === "user-key-required" ? "사용자 키 필수" : "서버 기본 허용";
  const rateLimit = status.apiRateLimit?.max
    ? `${status.apiRateLimit.max}회/${Math.round((status.apiRateLimit.windowMs || 60000) / 1000)}초`
    : "꺼짐";
  const llmProvider = operatorDetailsHidden ? "접근키 필요" : status.llmProvider || "auto";
  const openAiModel = operatorDetailsHidden ? "접근키 필요" : status.llmDefaultModels?.openai || "gpt-4o-mini";
  const anthropicModel = operatorDetailsHidden ? "접근키 필요" : status.llmDefaultModels?.anthropic || "claude-3-haiku-20240307";
  const lanUrls = Array.isArray(status.lanUrls) ? status.lanUrls : [];
  el.innerHTML = [
    `<span><span class="badge">${escapeText(protection)}</span> API 접근</span>`,
    `<span><span class="badge">${escapeText(accessKeyStorage)}</span> 접근 키 저장</span>`,
    `<span><span class="badge">${escapeText(operatorDetails)}</span> 운영 세부${operatorDetails === "키 확인 필요" ? ' <button type="button" class="secondary retry-access-key-button">접근 키 재입력</button>' : ""}${operatorDetailsState === "rate-limited" ? ' <button type="button" class="secondary retry-operator-status-button">상태 다시 확인</button>' : ""}</span>`,
    `<span><span class="badge">${escapeText(llmProvider)}</span> LLM</span>`,
    `<span><span class="badge">${escapeText(byok)}</span> LLM 인증</span>`,
    `<span><span class="badge">${escapeText(webLlmPolicy)}</span> 웹 LLM 정책</span>`,
    `<span><span class="badge">${escapeText(rateLimit)}</span> API 제한</span>`,
    `<span><span class="badge">${escapeText(openAiModel)}</span> OpenAI 기본</span>`,
    `<span><span class="badge">${escapeText(anthropicModel)}</span> Anthropic 기본</span>`,
    `<span><span class="badge">${escapeText(defaultYear)}</span> 날짜 해석</span>`,
    `<span><span class="badge">${escapeText(status.storage || "json")}</span> 저장소</span>`,
    ...(status.lanUrlsHidden ? ['<span class="status-url"><span class="badge">숨김</span> Wi-Fi URL <button type="button" class="secondary show-network-url-button">표시</button></span>'] : []),
    ...lanUrls.map(lanUrlMarkup),
  ].join("");

  attachCopyUrlButtons();
  document.querySelectorAll(".retry-access-key-button").forEach((button) => {
    button.addEventListener("click", () => {
      if (typeof retryAccessKeyWithBusyButton !== "function") return;
      retryAccessKeyWithBusyButton(button);
    });
  });
  document.querySelectorAll(".retry-operator-status-button").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "확인 중...";
      await loadStatus();
    });
  });
  document.querySelectorAll(".show-network-url-button").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "불러오는 중...";
      const res = await api("/api/network");
      if (!res.ok) {
        button.disabled = false;
        button.textContent = "표시";
        return;
      }
      const body = await parseJsonSafe(res);
      const urls = Array.isArray(body.lanUrls) ? body.lanUrls : [];
      const container = button.closest(".status-url");
      if (!urls.length) {
        button.textContent = "없음";
        return;
      }
      container.insertAdjacentHTML("afterend", urls.map(lanUrlMarkup).join(""));
      container.remove();
      attachCopyUrlButtons();
    });
  });
  renderShareSetupGuide(status);

  const providerSelect = document.querySelector('select[name="llmProvider"]');
  const serverOption = providerSelect?.querySelector('option[value="server"]');
  if (providerSelect && serverOption) {
    serverOption.disabled = Boolean(status.requireUserLlmKey);
    if (status.requireUserLlmKey && providerSelect.value === "server") {
      providerSelect.value = "openai";
    }
  }
  renderByokPolicyMessage(status);
  updateLlmModelHint();
}

window.addEventListener("travel-access-key-storage-change", () => {
  loadStatus();
});
window.addEventListener("travel-llm-api-key-inputs-cleared", () => {
  refreshShareSetupGuide();
  renderByokPolicyMessage();
});

const NEW_PLAN_DRAFT_STORAGE_KEY = "travelPlannerNewPlanDraft:v1";
const NEW_PLAN_DRAFT_FIELDS = [
  "destination",
  "departure",
  "country",
  "scope",
  "companions",
  "travelers",
  "startDate",
  "nights",
  "tripType",
  "accommodation",
  "transportPref",
  "budgetPerPerson",
  "highlights",
  "notes",
];
const NEW_PLAN_DRAFT_FIELD_LABELS = {
  destination: "목적지",
  departure: "출발지",
  country: "나라",
  scope: "국내/해외",
  companions: "동행",
  travelers: "인원",
  startDate: "출발일",
  nights: "몇 박",
  tripType: "여행 스타일",
  accommodation: "숙박 선호",
  transportPref: "교통 선호",
  budgetPerPerson: "1인 예산",
  highlights: "꼭 가고 싶은 곳",
  notes: "추가 요청",
};

function readNewPlanDraft() {
  try {
    const raw = window.localStorage?.getItem(NEW_PLAN_DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeNewPlanDraft(form) {
  if (!form) return;

  const draft = {};
  NEW_PLAN_DRAFT_FIELDS.forEach((name) => {
    const field = form.elements[name];
    if (field) draft[name] = field.value;
  });
  draft.updatedAt = new Date().toISOString();
  try {
    window.localStorage?.setItem(NEW_PLAN_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Draft persistence is best-effort only; form submission must still work.
  }
}

function clearNewPlanDraft() {
  try {
    window.localStorage?.removeItem(NEW_PLAN_DRAFT_STORAGE_KEY);
  } catch {
    // Draft cleanup is best-effort only.
  }
}

function updateNewPlanDraftStatus(message, hasDraft = false) {
  const status = document.getElementById("newPlanDraftStatus");
  const clearButton = document.getElementById("newPlanDraftClearButton");
  const actionGroup = document.getElementById("newPlanDraftActions");
  if (status) {
    status.className = message ? "form-message" : "form-message hidden";
    status.textContent = message || "";
    status.title = message || "";
    if (message) {
      status.setAttribute("aria-label", message);
    } else {
      status.removeAttribute("aria-label");
    }
  }
  if (clearButton) {
    clearButton.hidden = !hasDraft;
    if (hasDraft) {
      const savedAtText = newPlanDraftSavedAtText();
      const freshnessText = newPlanDraftFreshnessText();
      const description = `현재 입력값은 유지하고 이 기기 브라우저에 저장된 새 여행 플랜 초안만 삭제합니다. 초안 저장 시각: ${savedAtText}. ${freshnessText}`;
      clearButton.title = description;
      clearButton.setAttribute("aria-label", `이 기기 브라우저의 새 여행 플랜 저장 초안만 삭제. 초안 저장 시각: ${savedAtText}. ${freshnessText}`);
      clearButton.setAttribute("aria-describedby", "newPlanDraftStatus");
    } else {
      clearButton.title = "현재 입력값은 유지하고 이 기기 브라우저에 저장된 새 여행 플랜 초안만 삭제합니다.";
      clearButton.setAttribute("aria-label", "이 기기 브라우저의 새 여행 플랜 저장 초안만 삭제");
      clearButton.setAttribute("aria-describedby", "newPlanDraftStatus");
    }
  }
  if (actionGroup) {
    const groupDescription = hasDraft
      ? `현재 기기 브라우저 새 여행 플랜 draft 삭제, 복사, 공유, 붙여넣기 handoff. 초안 저장 시각: ${newPlanDraftSavedAtText()}. ${newPlanDraftFreshnessText()} LLM API key, provider, model 값은 포함하지 않습니다.`
      : "현재 기기 브라우저 새 여행 플랜 draft 복사, 공유, 붙여넣기 handoff. 저장된 초안이 생기면 삭제 액션도 표시됩니다. LLM API key, provider, model 값은 포함하지 않습니다.";
    actionGroup.title = groupDescription;
    actionGroup.setAttribute("aria-label", groupDescription);
    actionGroup.setAttribute("aria-describedby", "newPlanDraftPrivacyHint newPlanDraftStatus");
  }
}

function newPlanDraftSavedAtText(draft = readNewPlanDraft()) {
  const updatedAtMs = Date.parse(draft.updatedAt || "");
  return Number.isFinite(updatedAtMs)
    ? new Date(updatedAtMs).toLocaleString("ko-KR")
    : "저장 시각 없음";
}

function newPlanDraftFreshnessText(draft = readNewPlanDraft()) {
  const updatedAtMs = Date.parse(draft.updatedAt || "");
  if (!Number.isFinite(updatedAtMs)) return "저장 시각을 확인할 수 없는 초안입니다.";
  return Date.now() - updatedAtMs > 24 * 60 * 60 * 1000
    ? "24시간 이상 지난 오래된 초안입니다."
    : "최근 24시간 안에 저장된 초안입니다.";
}

function restoreNewPlanDraft(form) {
  if (!form) return false;

  const draft = readNewPlanDraft();
  let restored = false;
  NEW_PLAN_DRAFT_FIELDS.forEach((name) => {
    if (!Object.prototype.hasOwnProperty.call(draft, name)) return;
    const field = form.elements[name];
    if (!field) return;
    field.value = draft[name];
    restored = true;
  });
  return restored;
}

function bindNewPlanDraft(form) {
  if (!form || form.dataset.newPlanDraftBound === "true") return;

  form.dataset.newPlanDraftBound = "true";
  const saveDraft = () => {
    writeNewPlanDraft(form);
    updateNewPlanDraftStatus(`이 기기 브라우저에 새 여행 플랜 입력 초안을 자동 저장했습니다. 저장 시각: ${newPlanDraftSavedAtText()}. ${newPlanDraftFreshnessText()} LLM API key는 저장하지 않습니다.`, true);
  };
  NEW_PLAN_DRAFT_FIELDS.forEach((name) => {
    const field = form.elements[name];
    field?.addEventListener("input", saveDraft);
    field?.addEventListener("change", saveDraft);
  });
}

function bindNewPlanDraftClearButton(form) {
  const clearButton = document.getElementById("newPlanDraftClearButton");
  if (!form || !clearButton || clearButton.dataset.newPlanDraftClearBound === "true") return;

  clearButton.dataset.newPlanDraftClearBound = "true";
  clearButton.addEventListener("click", () => {
    clearNewPlanDraft();
    updateNewPlanDraftStatus("저장된 새 여행 플랜 초안을 삭제했습니다. 현재 입력 중인 값은 유지됩니다.", false);
  });
}

function newPlanDraftCopyText(form) {
  writeNewPlanDraft(form);
  const draft = readNewPlanDraft();
  const lines = [
    "Travel Planner 새 여행 플랜 입력 초안",
    `저장 시각: ${newPlanDraftSavedAtText(draft)}`,
    newPlanDraftFreshnessText(draft),
    "저장 범위: 현재 기기 브라우저 로컬 draft",
    "제외: LLM API key, provider, model",
    "",
    "입력값:",
  ];
  NEW_PLAN_DRAFT_FIELDS.forEach((name) => {
    const value = newPlanDraftDisplayValue(form, name, String(draft[name] || ""))
      .replace(/\s*\r?\n\s*/g, " / ")
      .trim();
    if (!value) return;
    lines.push(`- ${NEW_PLAN_DRAFT_FIELD_LABELS[name] || name}: ${value}`);
  });
  lines.push("", `앱 홈: ${new URL("/", window.location.href).toString()}#planForm`);
  return lines.join("\n");
}

function newPlanDraftDisplayValue(form, name, value) {
  const field = form?.elements[name];
  if (field?.tagName === "SELECT") {
    const option = [...field.options].find((candidate) => candidate.value === value);
    return option?.textContent?.trim() || value;
  }
  return value;
}

function newPlanDraftFieldValue(form, name, value) {
  const field = form?.elements[name];
  if (field?.tagName !== "SELECT") return value;

  const option = [...field.options].find((candidate) => (
    candidate.value === value || candidate.textContent?.trim() === value
  ));
  return option?.value ?? value;
}

async function withNewPlanDraftActionBusy(button, busyLabel, action) {
  if (!button || button.disabled) return;

  const originalLabel = button.textContent;
  const originalTitle = button.title;
  button.disabled = true;
  button.textContent = busyLabel;
  button.title = `${busyLabel} 중입니다.`;
  button.setAttribute("aria-busy", "true");
  try {
    await action();
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
    button.title = originalTitle;
    button.removeAttribute("aria-busy");
  }
}

function bindNewPlanDraftCopyButton(form) {
  const copyButton = document.getElementById("newPlanDraftCopyButton");
  if (!form || !copyButton || copyButton.dataset.newPlanDraftCopyBound === "true") return;

  copyButton.dataset.newPlanDraftCopyBound = "true";
  copyButton.addEventListener("click", async () => {
    await withNewPlanDraftActionBusy(copyButton, "초안 복사 중", async () => {
      const text = newPlanDraftCopyText(form);
      try {
        await navigator.clipboard.writeText(text);
        updateNewPlanDraftStatus(`새 여행 플랜 입력 초안을 비밀값 없이 복사했습니다. ${newPlanDraftFreshnessText()}`, true);
      } catch {
        updateNewPlanDraftStatus("새 여행 플랜 입력 초안 수동 복사 prompt를 열었습니다. LLM API key는 포함하지 않았습니다.", true);
        window.prompt("새 여행 플랜 입력 초안을 복사하세요.", text);
      }
    });
  });
}

function bindNewPlanDraftShareButton(form) {
  const shareButton = document.getElementById("newPlanDraftShareButton");
  if (!form || !shareButton || shareButton.dataset.newPlanDraftShareBound === "true") return;

  shareButton.dataset.newPlanDraftShareBound = "true";
  shareButton.addEventListener("click", async () => {
    await withNewPlanDraftActionBusy(shareButton, "초안 공유 중", async () => {
      const text = newPlanDraftCopyText(form);
      if (navigator.share) {
        try {
          await navigator.share({
            title: "Travel Planner 새 여행 플랜 초안",
            text,
          });
          updateNewPlanDraftStatus(`새 여행 플랜 입력 초안을 비밀값 없이 공유했습니다. ${newPlanDraftFreshnessText()}`, true);
          return;
        } catch (error) {
          if (error?.name === "AbortError") {
            updateNewPlanDraftStatus("새 여행 플랜 입력 초안 공유를 취소했습니다. 필요하면 다시 공유하세요.", true);
            return;
          }
        }
      }
      try {
        await navigator.clipboard.writeText(text);
        updateNewPlanDraftStatus(`공유를 열 수 없어 새 여행 플랜 입력 초안을 비밀값 없이 복사했습니다. ${newPlanDraftFreshnessText()}`, true);
      } catch {
        updateNewPlanDraftStatus("새 여행 플랜 입력 초안 공유 prompt를 열었습니다. LLM API key는 포함하지 않았습니다.", true);
        window.prompt("새 여행 플랜 입력 초안을 복사해 공유하세요.", text);
      }
    });
  });
}

function newPlanDraftFieldNameForLabel(label) {
  return Object.entries(NEW_PLAN_DRAFT_FIELD_LABELS)
    .find(([, fieldLabel]) => fieldLabel === label)?.[0] || "";
}

function applyNewPlanDraftText(form, text) {
  if (!form || !text) return { applied: 0, firstField: null };

  const parsed = {};
  String(text).split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*-\s*([^:]+):\s*(.*)$/);
    if (!match) return;
    const fieldName = newPlanDraftFieldNameForLabel(match[1].trim());
    if (!fieldName || !NEW_PLAN_DRAFT_FIELDS.includes(fieldName)) return;
    parsed[fieldName] = match[2].trim();
  });

  let applied = 0;
  let firstField = null;
  NEW_PLAN_DRAFT_FIELDS.forEach((name) => {
    if (!Object.prototype.hasOwnProperty.call(parsed, name)) return;
    const field = form.elements[name];
    if (!field) return;
    field.value = newPlanDraftFieldValue(form, name, parsed[name]);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    applied += 1;
    if (!firstField) firstField = field;
  });
  if (applied > 0) writeNewPlanDraft(form);
  return { applied, firstField };
}

function bindNewPlanDraftImportButton(form) {
  const importButton = document.getElementById("newPlanDraftImportButton");
  if (!form || !importButton || importButton.dataset.newPlanDraftImportBound === "true") return;

  importButton.dataset.newPlanDraftImportBound = "true";
  importButton.addEventListener("click", async () => {
    await withNewPlanDraftActionBusy(importButton, "초안 붙여넣는 중", async () => {
      let text = "";
      let sourceLabel = "직접 붙여넣은";
      if (navigator.clipboard?.readText) {
        try {
          text = await navigator.clipboard.readText();
          sourceLabel = "클립보드에서 읽은";
        } catch {
          text = "";
        }
      }
      if (!text) {
        const promptedText = window.prompt("복사해 둔 새 여행 플랜 입력 초안을 붙여넣으세요. LLM API key/provider/model은 가져오지 않습니다.", "");
        if (promptedText === null) {
          updateNewPlanDraftStatus("새 여행 플랜 초안 붙여넣기를 취소했습니다.", Boolean(readNewPlanDraft().updatedAt));
          return;
        }
        text = promptedText;
        sourceLabel = "직접 붙여넣은";
      }
      let importResult = applyNewPlanDraftText(form, text);
      if (importResult.applied === 0 && sourceLabel === "클립보드에서 읽은") {
        const promptedText = window.prompt("클립보드 텍스트에서 새 여행 플랜 초안 항목을 찾지 못했습니다. 복사해 둔 초안 텍스트를 직접 붙여넣으세요. LLM API key/provider/model은 가져오지 않습니다.", "");
        if (promptedText === null) {
          updateNewPlanDraftStatus("새 여행 플랜 초안 붙여넣기를 취소했습니다.", Boolean(readNewPlanDraft().updatedAt));
          return;
        }
        text = promptedText;
        sourceLabel = "직접 붙여넣은";
        importResult = applyNewPlanDraftText(form, text);
      }
      if (importResult.applied > 0) {
        importResult.firstField?.focus?.();
        updateNewPlanDraftStatus(`${sourceLabel} 새 여행 플랜 초안 ${importResult.applied}개 항목을 현재 폼에 적용하고 이 기기 브라우저 draft로 저장했습니다. 첫 적용 필드로 이동했습니다. ${newPlanDraftFreshnessText()} LLM API key는 가져오지 않았습니다.`, true);
      } else {
        updateNewPlanDraftStatus("붙여넣은 텍스트에서 적용할 새 여행 플랜 초안 항목을 찾지 못했습니다. 초안 복사 텍스트의 '- 항목: 값' 형식을 사용하세요.", Boolean(readNewPlanDraft().updatedAt));
      }
    });
  });
}

function bindNewPlanDraftLifecycleSave(form) {
  if (!form || form.dataset.newPlanDraftLifecycleBound === "true") return;

  form.dataset.newPlanDraftLifecycleBound = "true";
  const saveCurrentDraft = () => writeNewPlanDraft(form);
  window.addEventListener("pagehide", saveCurrentDraft);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveCurrentDraft();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("planForm");
  if (form) {
    loadStatus();
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const dateInput = form.querySelector('input[name="startDate"]');
    if (dateInput && !dateInput.value) dateInput.value = `${yyyy}-${mm}-${dd}`;
    const restoredNewPlanDraft = restoreNewPlanDraft(form);
    bindNewPlanDraft(form);
    bindNewPlanDraftClearButton(form);
    bindNewPlanDraftCopyButton(form);
    bindNewPlanDraftShareButton(form);
    bindNewPlanDraftImportButton(form);
    bindNewPlanDraftLifecycleSave(form);
    const providerSelect = form.querySelector('select[name="llmProvider"]');
    const apiKeyInput = form.querySelector('input[name="llmApiKey"]');
    if (typeof bindSecretInputToggle === "function") bindSecretInputToggle(apiKeyInput);
    if (typeof bindLlmFormPreferences === "function") {
      bindLlmFormPreferences(form, updateLlmModelHint);
    } else if (providerSelect) {
      providerSelect.addEventListener("change", updateLlmModelHint);
    }
    if (providerSelect) providerSelect.addEventListener("change", () => {
      refreshShareSetupGuide();
      renderByokPolicyMessage();
    });
    if (apiKeyInput) apiKeyInput.addEventListener("input", () => {
      refreshShareSetupGuide();
      renderByokPolicyMessage();
    });
    updateLlmModelHint();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formMessage = document.getElementById("planFormMessage");
      if (formMessage) {
        formMessage.className = "form-message hidden";
        formMessage.textContent = "";
      }
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      writeNewPlanDraft(form);
      if (typeof saveLlmFormPreferencesFromForm === "function") saveLlmFormPreferencesFromForm(form);
      const llmApiKey = String(payload.llmApiKey || "").trim();
      const llmProvider = String(payload.llmProvider || "server");
      const keyInput = form.querySelector('input[name="llmApiKey"]');
      const clearKey = () => {
        if (typeof clearLlmApiKeyInputs === "function") {
          clearLlmApiKeyInputs(form);
          return;
        }
        if (keyInput) keyInput.value = "";
      };
      if (window.travelPlannerStatus?.requireUserLlmKey && (!llmApiKey || llmProvider === "server")) {
        clearKey();
        const message = "공유 모드에서는 서버 기본 키를 사용할 수 없습니다. OpenAI Platform 또는 Anthropic Console API key를 요청 1회용으로 입력해주세요.";
        if (formMessage) {
          formMessage.className = "form-message error";
          formMessage.textContent = message;
        } else {
          alert(message);
        }
        return;
      }
      if (llmApiKey && llmProvider === "server") {
        clearKey();
        const message = "API 키를 입력했다면 실행 방식을 OpenAI Platform 또는 Anthropic Console로 선택해주세요.";
        if (formMessage) {
          formMessage.className = "form-message error";
          formMessage.textContent = message;
        } else {
          alert(message);
        }
        return;
      }
      if (!llmApiKey) {
        delete payload.llmProvider;
        delete payload.llmApiKey;
        delete payload.llmModel;
      } else {
        payload.llmApiKey = llmApiKey;
        payload.llmModel = String(payload.llmModel || "").trim();
        clearKey();
      }
      const submitButton = form.querySelector('button[type="submit"], button:not([type])');
      const originalLabel = submitButton ? submitButton.textContent : "";
      const originalTitle = submitButton ? submitButton.getAttribute("title") || "" : "";
      const originalAriaLabel = submitButton ? submitButton.getAttribute("aria-label") || "" : "";
      if (submitButton && formMessage) {
        submitButton.setAttribute("aria-describedby", formMessage.id);
      }
      const recordSubmitState = (result, feedback, failureKind = "") => {
        if (!submitButton) return;
        const now = new Date().toISOString();
        submitButton.dataset.iosHomeDockPlanSubmitButtonSubmitAttempted = "true";
        if (!submitButton.dataset.iosHomeDockPlanSubmitButtonSubmitAttemptedAt) {
          submitButton.dataset.iosHomeDockPlanSubmitButtonSubmitAttemptedAt = now;
        }
        submitButton.dataset.iosHomeDockPlanSubmitButtonSubmitResult = result;
        submitButton.dataset.iosHomeDockPlanSubmitButtonSubmitResultAt = now;
        submitButton.dataset.iosHomeDockPlanSubmitButtonSubmitFailureKind = failureKind;
        submitButton.dataset.iosHomeDockPlanSubmitButtonSubmitStatusFeedback = feedback;
      };
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.setAttribute("aria-busy", "true");
        submitButton.dataset.iosHomeDockPlanSubmitButtonBusy = "true";
        submitButton.textContent = "생성 중...";
        const busySubmitLabel = "첫 여행 플랜 생성 중입니다. 입력값과 LLM 비밀값은 진단에 복사하지 않습니다.";
        submitButton.setAttribute("title", busySubmitLabel);
        submitButton.setAttribute("aria-label", busySubmitLabel);
        recordSubmitState("pending", "첫 여행 플랜 생성을 요청했습니다. draftValues=excluded; llmSecrets=excluded");
      }
      if (formMessage) {
        formMessage.className = "form-message";
        formMessage.setAttribute("role", "status");
        formMessage.setAttribute("aria-live", "polite");
        formMessage.setAttribute("aria-atomic", "true");
        formMessage.textContent = "LLM으로 여행 플랜을 생성하고 있습니다.";
      }
      try {
        const res = await api("/api/plans", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const result = await parseJsonSafe(res);
        if (result && result.id) {
          const savedPlanPath = `/plans/${encodeURIComponent(result.id)}`;
          clearNewPlanDraft();
          updateNewPlanDraftStatus("첫 여행 플랜 생성이 완료되어 저장된 초안을 삭제했습니다.", false);
          markIosFirstRunChecklistItem("first-plan");
          if (formMessage) {
            formMessage.className = "form-message";
            formMessage.setAttribute("role", "status");
            formMessage.setAttribute("aria-live", "polite");
            formMessage.textContent = "첫 여행 플랜을 만들었습니다. 상세 화면으로 이동합니다.";
          }
          recordSubmitState("success", "첫 여행 플랜 생성에 성공했습니다. 상세 화면으로 이동합니다. draftValues=excluded; llmSecrets=excluded");
          const savedPlanRedirectPlannedAt = new Date().toISOString();
          try {
            sessionStorage.setItem("travel-planner:ios-first-plan-submit-redirect:v1", JSON.stringify({
              planned: true,
              route: "/plans/:id",
              plannedAt: savedPlanRedirectPlannedAt,
              source: "first-plan-submit",
            }));
          } catch {
            // Ignore storage failures; visible success feedback and redirect still proceed.
          }
          if (submitButton) {
            submitButton.dataset.iosHomeDockPlanSubmitButtonRedirectPlanned = "true";
            submitButton.dataset.iosHomeDockPlanSubmitButtonRedirectRoute = "/plans/:id";
            submitButton.dataset.iosHomeDockPlanSubmitButtonRedirectPlannedAt = savedPlanRedirectPlannedAt;
            submitButton.dataset.iosHomeDockPlanSubmitButtonRedirectFallbackLinkVisible = formMessage ? "true" : "false";
            submitButton.dataset.iosHomeDockPlanSubmitButtonRedirectFallbackRoute = "/plans/:id";
          }
          window.location.href = savedPlanPath;
        } else {
          const message = result?.error === "user llm api key required"
            ? "공유 모드에서는 OpenAI Platform 또는 Anthropic Console API key가 필요합니다."
            : result?.error === "llm provider required"
            ? "API key를 입력했다면 실행 방식을 OpenAI Platform 또는 Anthropic Console로 선택해주세요."
            : result?.error === "llm provider failed"
            ? "입력한 provider API key로 LLM 호출에 실패했습니다. 키, 모델명, provider 선택을 확인해주세요."
            : result?.error || "생성에 실패했습니다.";
          if (formMessage) {
            formMessage.className = "form-message error";
            formMessage.setAttribute("role", "alert");
            formMessage.setAttribute("aria-live", "assertive");
            formMessage.setAttribute("aria-atomic", "true");
            formMessage.textContent = message;
          } else {
            alert(message);
          }
          recordSubmitState("error", "첫 여행 플랜 생성에 실패했습니다. draftValues=excluded; llmSecrets=excluded", result?.error || "unknown");
        }
      } finally {
        clearKey();
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.removeAttribute("aria-busy");
          submitButton.dataset.iosHomeDockPlanSubmitButtonBusy = "false";
          submitButton.textContent = originalLabel;
          if (originalTitle) {
            submitButton.setAttribute("title", originalTitle);
          } else {
            submitButton.removeAttribute("title");
          }
          if (originalAriaLabel) {
            submitButton.setAttribute("aria-label", originalAriaLabel);
          } else {
            submitButton.removeAttribute("aria-label");
          }
        }
      }
    });

    if (restoredNewPlanDraft) {
      const restoredDraft = readNewPlanDraft();
      const restoredDraftSavedAt = newPlanDraftSavedAtText();
      const restoredDraftFreshness = newPlanDraftFreshnessText(restoredDraft);
      const formMessage = document.getElementById("planFormMessage");
      if (formMessage) {
        formMessage.className = "form-message";
        formMessage.textContent = `이 기기 브라우저에 남아 있던 새 여행 플랜 입력 초안을 복원했습니다. 저장 시각: ${restoredDraftSavedAt}. ${restoredDraftFreshness}`;
      }
      updateNewPlanDraftStatus(`이 기기 브라우저에 저장된 새 여행 플랜 입력 초안을 복원했습니다. 저장 시각: ${restoredDraftSavedAt}. ${restoredDraftFreshness} LLM API key는 저장하지 않습니다.`, true);
    }

    const searchForm = document.getElementById("searchForm");
    const searchInput = document.getElementById("searchInput");
    const statusFilter = document.getElementById("statusFilter");
    const clearSearchButton = document.getElementById("clearSearchButton");
    const filterShortcutButtons = document.querySelectorAll("[data-status-filter-shortcut]");
    const initialParams = new URLSearchParams(window.location.search);
    const initialQuery = String(initialParams.get("q") || "").trim();
    const initialFilter = String(initialParams.get("filter") || "all").trim() || "all";
    searchInput.value = initialQuery;
    if ([...statusFilter.options].some((option) => option.value === initialFilter)) {
      statusFilter.value = initialFilter;
    }
    const syncStatusFilterShortcuts = () => syncHomeStatusFilterShortcuts(statusFilter.value);
    syncStatusFilterShortcuts();
    loadPlans(searchInput.value.trim(), statusFilter.value);
    loadQualitySummary();
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      syncStatusFilterShortcuts();
      loadPlans(searchInput.value.trim(), statusFilter.value);
      loadQualitySummary();
    });
    statusFilter.addEventListener("change", () => {
      syncStatusFilterShortcuts();
      loadPlans(searchInput.value.trim(), statusFilter.value);
      loadQualitySummary();
    });
    filterShortcutButtons.forEach((button) => {
      button.addEventListener("click", () => {
        statusFilter.value = button.dataset.statusFilterShortcut || "all";
        syncStatusFilterShortcuts();
        loadPlans(searchInput.value.trim(), statusFilter.value);
        loadQualitySummary();
      });
    });
    clearSearchButton.addEventListener("click", () => {
      searchInput.value = "";
      statusFilter.value = "all";
      syncStatusFilterShortcuts();
      loadPlans();
      loadQualitySummary();
    });
    const backupButton = document.getElementById("backupButton");
    backupButton.addEventListener("click", () => {
      authDownload("/api/backup");
    });
  }
});
