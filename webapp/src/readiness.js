import { getCurrentTripDay } from "./day-view.js";

function safeText(value, fallback = "") {
  const text = String(value == null || value === "" ? fallback : value).trim();
  return text || fallback;
}

function latestRevision(plan) {
  const revisions = Array.isArray(plan.revisions) ? plan.revisions : [];
  return revisions.find((item) => item.version === plan.latestVersion) || revisions.at(-1);
}

function addCheck(checks, ok, label, fix, weight) {
  checks.push({ ok, label, fix, weight });
}

function readinessSnapshot(plan) {
  const current = getCurrentTripDay(plan);
  const expenses = Array.isArray(plan.expenses) ? plan.expenses : [];
  const missingPayerCount = expenses.filter((expense) => !safeText(expense.paidBy)).length;
  const revision = latestRevision(plan);
  const checks = [];
  const accommodation = safeText(plan.accommodation);
  const transportPref = safeText(plan.transportPref);
  const budgetPerPerson = Number(plan.budgetPerPerson) || 0;

  addCheck(checks, Boolean(safeText(plan.destination)), "목적지가 정해져 있음", "/refine 또는 웹 상세에서 목적지를 보강", 10);
  addCheck(checks, Boolean(safeText(plan.startDate) && safeText(plan.endDate)), "여행 날짜가 정해져 있음", "/reschedule 또는 웹 상세에서 출발일/박수 입력", 12);
  addCheck(checks, Number(plan.travelers) > 0, "인원 수가 정해져 있음", "/partybudget travelers:인원 으로 보강", 8);
  addCheck(checks, Boolean(revision?.planText), "일정 본문이 있음", "/again feedback:일정 구체화 로 보강", 12);
  addCheck(checks, Boolean(transportPref && transportPref !== "auto"), "교통 선호가 정해져 있음", "/again feedback:교통편을 더 구체화해줘", 8);
  addCheck(checks, Boolean(accommodation && accommodation !== "unspecified" && accommodation !== "미지정"), "숙박 선호가 정해져 있음", "/again feedback:숙소 기준을 더 구체화해줘", 8);
  addCheck(checks, budgetPerPerson > 0, "1인 예산이 있음", "/partybudget budget_per_person:금액 으로 보강", 12);
  addCheck(checks, expenses.length > 0 || current.status === "before", "지출 기록 흐름이 있음", "/expense amount:금액 label:항목 paid_by:이름 으로 기록", 8);
  addCheck(checks, missingPayerCount === 0, "결제자 미입력 지출이 없음", "/expense_edit paid_by:이름 으로 결제자 보강", 8);
  addCheck(checks, Boolean(safeText(plan.personalNote)), "개인 메모/예약번호가 있음", "/note text:예약번호나 주의사항 으로 저장", 6);
  addCheck(checks, Boolean(plan.pinned), "자주 볼 플랜으로 고정됨", "플랜 카드의 고정 버튼 또는 /pinned 흐름 사용", 4);
  addCheck(checks, !plan.latestError, "최근 생성 오류가 없음", "/again 으로 다시 고도화하거나 LLM 설정 확인", 4);

  const totalWeight = checks.reduce((sum, item) => sum + item.weight, 0);
  const readyWeight = checks.filter((item) => item.ok).reduce((sum, item) => sum + item.weight, 0);
  const score = Math.round((readyWeight / totalWeight) * 100);
  const missing = checks.filter((item) => !item.ok);
  const status = score >= 85 ? "바로 여행 운영 가능" : score >= 65 ? "핵심은 준비됨, 몇 가지만 보강" : "출발 전 보강 권장";
  return { checks, current, missing, score, status };
}

export function buildReadinessReport(plan) {
  const { checks, current, missing, score, status } = readinessSnapshot(plan);
  const lines = [
    `플랜 #${plan.id} ${safeText(plan.destination, "여행지")} 준비도`,
    `${safeText(plan.startDate, "날짜 미정")} ~ ${safeText(plan.endDate, "날짜 미정")} / ${safeText(plan.companions, "동행 미정")} / ${Math.max(1, Number(plan.travelers) || 1)}명`,
    "",
    `- 준비도 점수: ${score}/100`,
    `- 상태: ${status}`,
    `- 여행 상태: ${current.label}`,
    "",
    "## 준비된 항목",
    ...checks.filter((item) => item.ok).map((item) => `- ${item.label}`),
    "",
    "## 보강할 항목",
  ];

  if (missing.length === 0) {
    lines.push("- 지금 기준으로 큰 빈칸은 없습니다.");
  } else {
    lines.push(...missing.map((item) => `- ${item.label}: ${item.fix}`));
  }

  lines.push(
    "",
    "추천 순서:",
    ...(missing.length === 0 ? ["1. /now 로 여행 중 현황만 확인하며 운영"] : missing.slice(0, 4).map((item, index) => `${index + 1}. ${item.fix}`)),
    "",
    "작은 팁: 준비도는 완벽 점수가 목적이 아니라, 출발 전 빠뜨리면 귀찮아지는 항목을 먼저 보이게 하는 안전망입니다."
  );

  return lines.join("\n");
}

export function buildReadinessActionPlan(plan) {
  const { missing, score, status } = readinessSnapshot(plan);
  const prioritized = [...missing].sort((a, b) => b.weight - a.weight).slice(0, 5);
  const lines = [
    `플랜 #${plan.id} ${safeText(plan.destination, "여행지")} 보강 플랜`,
    `${safeText(plan.startDate, "날짜 미정")} ~ ${safeText(plan.endDate, "날짜 미정")} / ${safeText(plan.companions, "동행 미정")} / ${Math.max(1, Number(plan.travelers) || 1)}명`,
    "",
    `- 현재 준비도: ${score}/100`,
    `- 상태: ${status}`,
    "",
    "## 지금 먼저 할 일",
  ];

  if (prioritized.length === 0) {
    lines.push(
      "- 큰 빈칸은 없습니다.",
      "- `/now`로 오늘 현황을 확인하면서 운영하면 됩니다.",
      "- 여행 후에는 `/recap`과 `/settlemessage`로 마무리하세요."
    );
    return lines.join("\n");
  }

  prioritized.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.label}`, `   - 실행: ${item.fix}`);
  });

  lines.push(
    "",
    "추천 진행:",
    "- 위에서부터 10분 안에 처리 가능한 것부터 닫기",
    "- 이동/숙소/예산처럼 여행 중 되돌리기 어려운 항목을 먼저 보강",
    "- 보강 후 `/readiness`로 점수가 올라갔는지 다시 확인"
  );

  return lines.join("\n");
}

export function buildReadinessShareText(plan) {
  const { missing, score, status } = readinessSnapshot(plan);
  const topMissing = [...missing].sort((a, b) => b.weight - a.weight).slice(0, 3);
  const lines = [
    `${safeText(plan.destination, "여행")} 준비 공유`,
    `${safeText(plan.startDate, "날짜 미정")} ~ ${safeText(plan.endDate, "날짜 미정")} / ${Math.max(1, Number(plan.travelers) || 1)}명`,
    "",
    `현재 준비도는 ${score}/100 (${status})입니다.`,
  ];

  if (topMissing.length === 0) {
    lines.push(
      "",
      "큰 빈칸은 없어서 이제 여행 중에는 현황판과 지출 기록만 챙기면 됩니다.",
      "여행 중에는 /now, 마무리할 때는 /recap 과 /settlemessage 를 보면 좋아요."
    );
    return lines.join("\n");
  }

  lines.push("", "출발 전 우선 보강할 것:");
  topMissing.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.label} - ${item.fix}`);
  });
  lines.push("", "이 세 가지만 먼저 닫고 다시 준비도를 확인하면 됩니다.");

  return lines.join("\n");
}
