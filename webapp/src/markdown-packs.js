import { buildDailyBriefing, buildDayShareText, buildNightChecklist, buildTodayChecklist, buildTomorrowBriefing } from "./brief.js";
import { buildBudgetBriefing, buildCategoryBudgetStatus, buildDailyBudgetStatus, buildSpendingStatus } from "./budget.js";
import { buildChecklistText } from "./checklist.js";
import { buildTodayViewText, getCurrentTripDay } from "./day-view.js";
import { buildDepartureBriefing } from "./departure.js";
import { buildEmergencyCard } from "./emergency.js";
import { buildPlanMarkdown, buildShareText } from "./export.js";
import { buildMapLinks } from "./maps.js";
import { buildNextAction } from "./next-action.js";
import { buildTripNow } from "./now.js";
import { buildPackingList } from "./packing.js";
import { buildReadinessActionPlan, buildReadinessReport, buildReadinessShareText } from "./readiness.js";
import { buildTripRecap } from "./recap.js";
import { buildExpenseLedger, buildSettlementBriefing, buildSettlementMatrix, buildSettlementMessage, buildSettlementTransfers } from "./settlement.js";

export function buildSafetyPackMarkdown(plan) {
  const maps = buildMapLinks(plan);
  return [
    `# ${plan.destination || "여행"} 안전팩`,
    [
      `- 플랜: #${plan.id} v${plan.latestVersion || 1}`,
      `- 경로: ${plan.departure || "서울"} -> ${plan.destination || "미정"}`,
      plan.startDate ? `- 출발일: ${plan.startDate}` : "",
      plan.nights === 0 || plan.nights ? `- 박수: ${plan.nights}박` : "",
      plan.travelers ? `- 인원: ${plan.travelers}명` : "",
      `- 생성 시각: ${new Date().toISOString()}`,
    ].filter(Boolean).join("\n"),
    "## 비상 카드",
    buildEmergencyCard(plan, 4000),
    maps.length ? [
      "## 지도 링크",
      ...maps.map((item) => `- [${item.label}](${item.url})`),
    ].join("\n") : "",
    "## 출발 전 브리핑",
    buildDepartureBriefing(plan, 4000),
    "## 준비 체크리스트",
    buildChecklistText(plan, 4000),
    "## 짐싸기 목록",
    buildPackingList(plan, 4000),
    "## 개인 메모",
    String(plan.personalNote || "").trim() || "저장된 개인 메모가 없습니다.",
    "## 사용 순서",
    [
      "1. 출발 전 이 파일을 휴대폰 파일 앱이나 메모에 저장하세요.",
      "2. 비상 상황에서는 비상 카드와 지도 링크부터 확인하세요.",
      "3. 이동 직전에는 출발 전 브리핑과 준비 체크리스트를 확인하세요.",
      "4. 짐을 다시 꾸릴 때는 짐싸기 목록을 확인하세요.",
      "5. 동행에게 공유하기 어려운 개인 기록은 개인 메모에서 따로 확인하세요.",
    ].join("\n"),
  ].filter(Boolean).join("\n\n") + "\n";
}

export function buildDeparturePackMarkdown(plan) {
  const maps = buildMapLinks(plan);
  return [
    `# ${plan.destination || "여행"} 출발팩`,
    [
      `- 플랜: #${plan.id} v${plan.latestVersion || 1}`,
      `- 경로: ${plan.departure || "서울"} -> ${plan.destination || "미정"}`,
      plan.startDate ? `- 출발일: ${plan.startDate}` : "",
      plan.nights === 0 || plan.nights ? `- 박수: ${plan.nights}박` : "",
      plan.travelers ? `- 인원: ${plan.travelers}명` : "",
      `- 생성 시각: ${new Date().toISOString()}`,
    ].filter(Boolean).join("\n"),
    "## 준비도 리포트",
    buildReadinessReport(plan),
    "## 보강 액션 플랜",
    buildReadinessActionPlan(plan),
    "## 전체 플랜",
    buildPlanMarkdown(plan),
    "## 출발 전 브리핑",
    buildDepartureBriefing(plan, 4000),
    "## 체크리스트",
    buildChecklistText(plan, 4000),
    "## 짐싸기",
    buildPackingList(plan, 4000),
    "## 비상 카드",
    buildEmergencyCard(plan, 4000),
    maps.length ? [
      "## 지도 링크",
      ...maps.map((item) => `- [${item.label}](${item.url})`),
    ].join("\n") : "",
  ].filter(Boolean).join("\n\n") + "\n";
}

export function buildTodayPackMarkdown(plan) {
  const current = getCurrentTripDay(plan);
  return [
    `# ${plan.destination || "여행"} 오늘팩`,
    [
      `- 플랜: #${plan.id} v${plan.latestVersion || 1}`,
      `- 경로: ${plan.departure || "서울"} -> ${plan.destination || "미정"}`,
      plan.startDate ? `- 출발일: ${plan.startDate}` : "",
      current?.label ? `- 기준: ${current.label}` : "",
      `- 생성 시각: ${new Date().toISOString()}`,
    ].filter(Boolean).join("\n"),
    "## 지금 현황",
    buildTripNow(plan),
    "## 다음 액션",
    buildNextAction(plan),
    `## 오늘 일정 (${current.label})`,
    buildTodayViewText(plan),
    "## 하루 브리핑",
    buildDailyBriefing(plan),
    "## 오늘 점검표",
    buildTodayChecklist(plan),
    "## 동행 공유 요약",
    buildDayShareText(plan),
    "## 밤 점검표",
    buildNightChecklist(plan),
    "## 내일 브리핑",
    buildTomorrowBriefing(plan),
  ].filter(Boolean).join("\n\n") + "\n";
}

export function buildSharePackMarkdown(plan) {
  const maps = buildMapLinks(plan);
  return [
    `# ${plan.destination || "여행"} 공유팩`,
    [
      `- 플랜: #${plan.id} v${plan.latestVersion || 1}`,
      `- 경로: ${plan.departure || "서울"} -> ${plan.destination || "미정"}`,
      plan.startDate ? `- 출발일: ${plan.startDate}` : "",
      `- 생성 시각: ${new Date().toISOString()}`,
    ].filter(Boolean).join("\n"),
    "## 전체 플랜 공유",
    buildShareText(plan),
    "## 오늘 공유",
    buildDayShareText(plan),
    "## 준비 공유",
    buildReadinessShareText(plan),
    "## 메모 공유",
    String(plan.personalNote || "").trim() || "공유할 개인 메모가 없습니다.",
    "## 정산 요청문",
    buildSettlementMessage(plan),
    maps.length ? [
      "## 지도 링크",
      ...maps.map((item) => `- [${item.label}](${item.url})`),
    ].join("\n") : "",
  ].filter(Boolean).join("\n\n") + "\n";
}

export function buildMoneyPackMarkdown(plan) {
  return [
    `# ${plan.destination || "여행"} 돈팩`,
    [
      `- 플랜: #${plan.id} v${plan.latestVersion || 1}`,
      `- 경로: ${plan.departure || "서울"} -> ${plan.destination || "미정"}`,
      plan.startDate ? `- 출발일: ${plan.startDate}` : "",
      plan.travelers ? `- 인원: ${plan.travelers}명` : "",
      plan.budgetPerPerson ? `- 1인 예산: ${Number(plan.budgetPerPerson).toLocaleString("ko-KR")}원` : "",
      `- 생성 시각: ${new Date().toISOString()}`,
    ].filter(Boolean).join("\n"),
    "## 예산 브리핑",
    buildBudgetBriefing(plan),
    "## 예산 소진 현황",
    buildSpendingStatus(plan),
    "## 오늘 하루 예산",
    buildDailyBudgetStatus(plan),
    "## 카테고리별 예산",
    buildCategoryBudgetStatus(plan),
    "## 지출 원장",
    buildExpenseLedger(plan),
    "## 정산 요약",
    buildSettlementBriefing(plan),
    "## 정산 상세표",
    buildSettlementMatrix(plan),
    "## 송금 방향",
    buildSettlementTransfers(plan),
    "## 동행 요청문",
    buildSettlementMessage(plan),
  ].filter(Boolean).join("\n\n") + "\n";
}

export function buildFullPackMarkdown(plan) {
  const maps = buildMapLinks(plan);
  const current = getCurrentTripDay(plan);
  return [
    `# ${plan.destination || "여행"} 전체팩`,
    [
      `- 플랜: #${plan.id} v${plan.latestVersion || 1}`,
      `- 경로: ${plan.departure || "서울"} -> ${plan.destination || "미정"}`,
      plan.startDate ? `- 출발일: ${plan.startDate}` : "",
      plan.nights === 0 || plan.nights ? `- 박수: ${plan.nights}박` : "",
      plan.travelers ? `- 인원: ${plan.travelers}명` : "",
      current?.label ? `- 기준: ${current.label}` : "",
      `- 생성 시각: ${new Date().toISOString()}`,
    ].filter(Boolean).join("\n"),
    "## 전체 플랜",
    buildPlanMarkdown(plan),
    "## 준비도 리포트",
    buildReadinessReport(plan),
    "## 보강 액션 플랜",
    buildReadinessActionPlan(plan),
    "## 출발 브리핑",
    buildDepartureBriefing(plan),
    "## 체크리스트",
    buildChecklistText(plan),
    "## 짐싸기",
    buildPackingList(plan),
    "## 비상 카드",
    buildEmergencyCard(plan),
    maps.length ? [
      "## 지도 링크",
      ...maps.map((item) => `- [${item.label}](${item.url})`),
    ].join("\n") : "",
    `## 오늘 일정 (${current.label})`,
    buildTodayViewText(plan),
    "## 지금 현황",
    buildTripNow(plan),
    "## 다음 액션",
    buildNextAction(plan),
    "## 돈 관리",
    buildSpendingStatus(plan),
    "## 지출 원장",
    buildExpenseLedger(plan),
    "## 정산 요약",
    buildSettlementBriefing(plan),
    "## 동행 공유",
    buildShareText(plan),
    "## 개인 메모",
    String(plan.personalNote || "").trim() || "저장된 개인 메모가 없습니다.",
    "## 회고",
    buildTripRecap(plan),
  ].filter(Boolean).join("\n\n") + "\n";
}

export function buildMemoPackMarkdown(plan) {
  const note = String(plan.personalNote || "").trim();
  return [
    `# ${plan.destination || "여행"} 메모팩`,
    [
      `- 플랜: #${plan.id} v${plan.latestVersion || 1}`,
      `- 경로: ${plan.departure || "서울"} -> ${plan.destination || "미정"}`,
      plan.startDate ? `- 출발일: ${plan.startDate}` : "",
      `- 생성 시각: ${new Date().toISOString()}`,
    ].filter(Boolean).join("\n"),
    "## 개인 메모",
    note || "저장된 개인 메모가 없습니다.",
    "## 동행 공유문",
    note
      ? [
          `${plan.destination || "여행"} 메모 공유`,
          "",
          note,
          "",
          "필요한 내용만 골라 동행에게 전달하세요.",
        ].join("\n")
      : "동행에게 공유할 개인 메모가 없습니다.",
  ].filter(Boolean).join("\n\n") + "\n";
}

export function buildSettlementPackMarkdown(plan) {
  return [
    `# ${plan.destination || "여행"} 정산팩`,
    [
      `- 플랜: #${plan.id} v${plan.latestVersion || 1}`,
      `- 경로: ${plan.departure || "서울"} -> ${plan.destination || "미정"}`,
      plan.startDate ? `- 출발일: ${plan.startDate}` : "",
      plan.travelers ? `- 인원: ${plan.travelers}명` : "",
      `- 생성 시각: ${new Date().toISOString()}`,
    ].filter(Boolean).join("\n"),
    "## 지출 원장",
    buildExpenseLedger(plan),
    "## 정산 요약",
    buildSettlementBriefing(plan),
    "## 정산 상세표",
    buildSettlementMatrix(plan),
    "## 송금 방향",
    buildSettlementTransfers(plan),
    "## 동행 요청문",
    buildSettlementMessage(plan),
  ].filter(Boolean).join("\n\n") + "\n";
}

export function buildOfflinePackMarkdown(plan, { exportedAt = new Date().toISOString(), webUrl = "" } = {}) {
  const maps = buildMapLinks(plan);
  const offlineNights = plan.nights === 0 || plan.nights ? Number(plan.nights) : null;
  const offlineNightsLabel = Number.isFinite(offlineNights) ? `${offlineNights}박` : "미정";
  return [
    `# 여행 오프라인팩 - ${plan.destination || `플랜 #${plan.id}`}`,
    "iPhone 파일/노트에 저장해두고 Discord나 웹 상세 화면이 느릴 때 꺼내보는 핵심 요약입니다.",
    "## 먼저 이렇게 저장하세요",
    [
      "- 여행 전: 이 파일을 iPhone 파일 앱이나 메모 앱에 저장",
      "- 이동 중: Discord가 느릴 때 `지금 볼 것`과 `다음 액션`부터 확인",
      "- 비상 시: `비상 카드`와 `지도 링크`를 먼저 확인",
    ].join("\n"),
    "## 다시 저장해야 할 때",
    [
      "- 플랜을 고도화하거나 일정/인원/예산을 바꾼 뒤",
      "- 메모, 지출, 정산 정보가 크게 바뀐 뒤",
      "- 출발 전 마지막 점검을 끝낸 뒤",
    ].join("\n"),
    "## 최신 파일 확인",
    [
      "- 아래 `플랜 버전`과 `파일 생성` 시각이 마지막 변경 이후인지 확인",
      "- 헷갈리면 최신 오프라인팩을 다시 받아 파일을 교체",
    ].join("\n"),
    "## 기본 정보",
    [
      `- 플랜 ID: ${plan.id}`,
      `- 플랜 버전: v${plan.latestVersion || "?"}`,
      `- 파일 생성: ${exportedAt}`,
      `- 목적지: ${plan.destination || "미정"}`,
      `- 출발일: ${plan.startDate || "미정"}`,
      `- 박수: ${offlineNightsLabel}`,
      `- 인원: ${plan.travelers || 1}명`,
    ].join("\n"),
    "## 웹 상세 링크",
    webUrl || "웹 상세 링크를 확인할 수 없습니다.",
    "## 온라인 복귀 순서",
    [
      webUrl ? "- 웹이 다시 열리면 위 링크로 상세 화면에 복귀" : "- 웹 상세가 필요하면 온라인 상태에서 상세 화면을 다시 여세요.",
      "- Discord가 먼저 열리면 `/mobile`에서 `지금`, `돈`, `다음` 버튼 확인",
      "- 위치/동선은 `/maps` 또는 아래 `지도 링크` 확인",
    ].join("\n"),
    "## 전체 일정",
    buildPlanMarkdown(plan),
    "## 지금 볼 것",
    buildTripNow(plan),
    "## 다음 액션",
    buildNextAction(plan),
    "## 준비 체크리스트",
    buildChecklistText(plan),
    "## 비상 카드",
    buildEmergencyCard(plan),
    "## 돈 요약",
    buildBudgetBriefing(plan),
    buildSpendingStatus(plan),
    "## 정산 요약",
    buildSettlementBriefing(plan),
    "## 개인 메모",
    String(plan.personalNote || "").trim() || "저장된 개인 메모가 없습니다.",
    "## 지도 링크",
    maps.length
      ? ["지도 링크는 온라인일 때 열 수 있습니다.", ...maps.map((item) => `- [${item.label}](${item.url})`)].join("\n")
      : "저장된 지도 링크가 없습니다.",
  ].filter(Boolean).join("\n\n") + "\n";
}

export function buildFileGuideMarkdown(plan, { generatedAt = new Date().toISOString(), webUrl = "" } = {}) {
  const hasExpenses = Array.isArray(plan.expenses) && plan.expenses.length > 0;
  const hasPersonalNote = Boolean(String(plan.personalNote || "").trim());
  return [
    `# ${plan.destination || "여행"} 파일 사용 가이드`,
    [
      `- 플랜: #${plan.id} v${plan.latestVersion || 1}`,
      `- 경로: ${plan.departure || "서울"} -> ${plan.destination || "미정"}`,
      plan.startDate ? `- 출발일: ${plan.startDate}` : "",
      plan.nights === 0 || plan.nights ? `- 박수: ${plan.nights}박` : "",
      plan.travelers ? `- 인원: ${plan.travelers}명` : "",
      `- 생성 시각: ${generatedAt}`,
    ].filter(Boolean).join("\n"),
    "## 먼저 받을 파일",
    [
      "1. 이동/통신이 불안하면 `오프라인팩 Markdown`",
      "2. 출발 전 누락 방지가 필요하면 `출발팩 Markdown`",
      "3. 여행 당일에 바로 볼 파일은 `오늘팩 Markdown`",
      "4. 동행에게 보내려면 `공유팩 Markdown`",
      "5. 돈 정리는 `돈팩 Markdown` 또는 `정산팩 Markdown`",
    ].join("\n"),
    "## 현재 플랜 기준 추천",
    [
      plan.startDate
        ? "- 출발일이 잡혀 있으니 `출발팩 Markdown`과 `오프라인팩 Markdown`을 먼저 저장하세요."
        : "- 출발일이 아직 비어 있으면 `파일 가이드 Markdown`과 `출발팩 Markdown`으로 누락 정보를 먼저 정리하세요.",
      hasExpenses
        ? "- 지출 기록이 있으니 `돈팩 Markdown`과 `정산팩 Markdown`도 함께 저장하세요."
        : "- 지출 기록이 아직 없으면 `돈팩 Markdown`은 여행 중 지출을 입력한 뒤 다시 저장하세요.",
      hasPersonalNote
        ? "- 개인 메모가 있으니 `메모팩 Markdown` 또는 `전체팩 Markdown`으로 따로 보관하세요."
        : "- 개인 메모가 없으면 `메모팩 Markdown`은 나중에 받아도 됩니다.",
      "- 동행에게 보낼 때는 `공유팩 Markdown`을 먼저 확인하고 민감한 메모는 빼고 전달하세요.",
    ].join("\n"),
    "## 상황별 추천",
    [
      "- 여행 전날: 출발팩, 안전팩, 오프라인팩",
      "- 이동 중: 오늘팩, 오프라인팩",
      "- 동행 공유: 공유팩, 정산팩",
      "- 비용 확인: 돈팩, 정산팩, 지출 CSV",
      "- 여행 종료 후: 전체팩, 회고 Markdown, 정산팩",
      "- 개인 기록 보관: 메모팩, 전체팩",
    ].join("\n"),
    "## 파일별 역할",
    [
      "- `오프라인팩`: 웹 상세 화면 없이 핵심 일정/준비/비상/돈 정보를 저장",
      "- `출발팩`: 출발 전 준비도, 보강 액션, 체크리스트를 확인",
      "- `오늘팩`: 지금 현황, 다음 액션, 오늘 일정과 점검표를 확인",
      "- `안전팩`: 비상 카드, 지도 링크, 체크리스트를 빠르게 확인",
      "- `공유팩`: 동행에게 보낼 전체/오늘/준비/메모/정산 요약을 모음",
      "- `돈팩`: 예산, 지출, 정산 흐름을 한 번에 확인",
      "- `정산팩`: 동행 정산 근거와 송금 방향만 좁게 공유",
      "- `전체팩`: 전체 플랜, 준비, 오늘 실행, 돈, 공유, 메모, 회고를 보관",
      "- `메모팩`: 저장된 개인 메모와 공유용 문장을 보관",
    ].join("\n"),
    "## 저장 순서",
    [
      "1. 여행 전에는 오프라인팩을 먼저 저장",
      "2. 출발 직전에는 출발팩과 안전팩을 다시 저장",
      "3. 여행 중 매일 아침 오늘팩을 다시 저장",
      "4. 지출을 많이 입력한 뒤에는 돈팩과 정산팩을 다시 저장",
      "5. 여행이 끝나면 전체팩과 회고 Markdown을 보관",
    ].join("\n"),
    "## 다시 저장해야 할 때",
    [
      "- 플랜을 고도화하거나 일정/인원/예산을 바꾼 뒤",
      "- 개인 메모, 지출, 정산 정보가 크게 바뀐 뒤",
      "- 출발 전 마지막 점검을 끝낸 뒤",
      "- 여행 당일 일정이 바뀐 뒤",
    ].join("\n"),
    "## 웹 상세 링크",
    webUrl || "웹 상세 링크를 확인할 수 없습니다.",
  ].filter(Boolean).join("\n\n") + "\n";
}
