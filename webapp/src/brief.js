import { buildDailyBudgetStatus } from "./budget.js";
import { buildDateViewText, buildTodayViewText, getTripDayForDate } from "./day-view.js";
import { buildMapLinks } from "./maps.js";

function won(value) {
  return `${Math.round(Number(value) || 0).toLocaleString("ko-KR")}원`;
}

function toYmd(value = new Date()) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return toYmd(new Date());
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function tomorrowYmd() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return toYmd(date);
}

export function buildTodayChecklist(plan, dateInput = "") {
  const date = toYmd(dateInput || new Date());
  const selected = getTripDayForDate(plan, date);
  const dayLabel = selected.status === "active" ? `여행 ${selected.day}일차` : selected.label;
  const expenses = (Array.isArray(plan.expenses) ? plan.expenses : []).filter((expense) => expense.date === date);
  const spent = expenses.reduce((sum, expense) => sum + Math.max(0, Number(expense.amount) || 0), 0);
  const transport = plan.transportPref && plan.transportPref !== "auto" ? plan.transportPref : "오늘 이동수단";
  const accommodation = plan.accommodation && plan.accommodation !== "unspecified" ? plan.accommodation : "숙소/체크인 정보";

  return [
    `플랜 #${plan.id} ${plan.destination || "여행지"} 오늘 점검표`,
    `${date} / ${dayLabel}`,
    "",
    "## 나가기 전",
    "- [ ] 휴대폰, 지갑, 신분증, 보조배터리 확인",
    `- [ ] ${transport} 시간/승차 위치 확인`,
    `- [ ] ${accommodation} 예약/체크인 정보 확인`,
    "- [ ] 오늘 첫 장소까지 이동 시간 확인",
    "",
    "## 일정 운영",
    "- [ ] `/brief`로 오늘 일정과 예산을 함께 확인",
    "- [ ] 비 오거나 컨디션이 나쁘면 `/ask`로 대체 동선 질문",
    "- [ ] 늦어질 것 같은 일정 하나는 미리 포기 후보로 표시",
    "- [ ] 동행에게 오늘 핵심 동선 공유",
    "",
    "## 돈 관리",
    `- [ ] 오늘 기록된 지출 확인: ${expenses.length}건 / ${won(spent)}`,
    "- [ ] 큰 결제 직후 `/expense`로 바로 기록",
    "- [ ] `/dailybudget`으로 오늘 남은 예산 확인",
    "- [ ] 결제자 이름을 같은 표기로 기록",
    "",
    "## 안전/비상",
    "- [ ] `/emergency`로 비상 카드 확인",
    "- [ ] 숙소 주소와 마지막 대중교통 시간 확인",
    "- [ ] 여권/신분증/카드 분실 대비 위치 확인",
    "",
    "## 하루 마감",
    "- [ ] 누락 지출을 `/expenses`로 확인",
    "- [ ] 내일 일정이 빡빡하면 `/ask`로 조정안 만들기",
    "- [ ] 좋았던 장소나 예약번호를 `/note`에 남기기",
  ].join("\n");
}

export function buildDailyBriefing(plan, dateInput = "") {
  const date = toYmd(dateInput || new Date());
  const selected = getTripDayForDate(plan, date);
  const dayLabel = selected.status === "active" ? `여행 ${selected.day}일차` : selected.label;
  const scheduleText = dateInput ? buildDateViewText(plan, date, 1600) : buildTodayViewText(plan, 1600);
  const budgetText = buildDailyBudgetStatus(plan, date);

  return [
    `플랜 #${plan.id} ${plan.destination || "여행지"} 하루 브리핑`,
    `${date} / ${dayLabel}`,
    "",
    "## 오늘 일정",
    scheduleText,
    "",
    "## 오늘 예산",
    budgetText,
    "",
    "## 빠른 액션",
    "- 일정이 빡빡하면 이동 시간이 긴 구간부터 줄이세요.",
    "- 결제 직후 `/expense`로 금액을 남기면 밤 정산이 쉬워집니다.",
    "- 날씨나 컨디션이 흔들리면 `/ask`로 대체 동선을 물어보세요.",
  ].join("\n");
}

export function buildTomorrowBriefing(plan) {
  const date = tomorrowYmd();
  return [
    `플랜 #${plan.id} ${plan.destination || "여행지"} 내일 브리핑`,
    "",
    buildDailyBriefing(plan, date),
    "",
    "## 오늘 밤 준비",
    "- [ ] 내일 첫 이동 시간과 출발 장소 확인",
    "- [ ] 배터리/카메라/이어폰 충전",
    "- [ ] 내일 큰 지출 예정이면 `/dailybudget`으로 여유 확인",
    "- [ ] 빡빡한 일정은 하나를 포기 후보로 미리 정하기",
  ].join("\n");
}

export function buildDayShareText(plan, dateInput = "") {
  const date = toYmd(dateInput || new Date());
  const selected = getTripDayForDate(plan, date);
  const dayLabel = selected.status === "active" ? `${selected.day}일차` : selected.label;
  const expenses = (Array.isArray(plan.expenses) ? plan.expenses : []).filter((expense) => expense.date === date);
  const spent = expenses.reduce((sum, expense) => sum + Math.max(0, Number(expense.amount) || 0), 0);
  const map = buildMapLinks(plan)[0];

  return [
    `${plan.destination || "여행지"} ${date} 공유 요약`,
    `${plan.startDate || "날짜 미정"} ~ ${plan.endDate || "날짜 미정"} / ${dayLabel} / ${plan.travelers || 1}명`,
    "",
    "오늘 확인할 것",
    `- 일정: /brief date:${date}`,
    `- 점검: /todaycheck date:${date}`,
    `- 지출 기록: ${expenses.length}건 / ${won(spent)}`,
    map ? `- 지도: ${map.url}` : "",
    "",
    "동행 액션",
    "- 첫 이동 시간 확인",
    "- 큰 결제는 결제자 이름과 함께 바로 공유",
    "- 늦어지면 다음 장소 하나를 포기 후보로 두기",
  ].filter(Boolean).join("\n");
}

export function buildNightChecklist(plan, dateInput = "") {
  const date = toYmd(dateInput || new Date());
  const selected = getTripDayForDate(plan, date);
  const dayLabel = selected.status === "active" ? `여행 ${selected.day}일차` : selected.label;
  const expenses = (Array.isArray(plan.expenses) ? plan.expenses : []).filter((expense) => expense.date === date);
  const spent = expenses.reduce((sum, expense) => sum + Math.max(0, Number(expense.amount) || 0), 0);

  return [
    `플랜 #${plan.id} ${plan.destination || "여행지"} 밤 점검표`,
    `${date} / ${dayLabel}`,
    "",
    "## 오늘 정리",
    `- [ ] 오늘 지출 누락 확인: ${expenses.length}건 / ${won(spent)}`,
    "- [ ] 영수증/카드 승인 내역과 `/expenses` 대조",
    "- [ ] 결제자 이름이 섞여 있으면 `/expense_edit`로 통일",
    "- [ ] 좋았던 장소나 예약번호를 `/note`에 남기기",
    "",
    "## 내일 준비",
    "- [ ] `/tomorrow`로 내일 일정/예산 확인",
    "- [ ] 내일 첫 이동 시간과 출발 장소 확인",
    "- [ ] 내일 큰 결제 예정이면 `/dailybudget`으로 여유 확인",
    "- [ ] 빡빡한 일정 하나를 포기 후보로 정하기",
    "",
    "## 충전/짐",
    "- [ ] 휴대폰, 보조배터리, 카메라, 이어폰 충전",
    "- [ ] 지갑, 신분증, 여권, 카드 위치 확인",
    "- [ ] 젖은 옷/세탁물/쓰레기 분리",
    "- [ ] 내일 바로 들고 나갈 가방만 미리 정리",
    "",
    "## 공유/안전",
    "- [ ] 동행에게 내일 첫 집합 시간 공유",
    "- [ ] 숙소 주소와 비상 연락처 다시 확인",
    "- [ ] 늦은 이동이 있으면 마지막 대중교통/택시 대안 확인",
  ].join("\n");
}
