import { getCurrentTripDay } from "./day-view.js";
import { buildNextAction } from "./next-action.js";

function won(value) {
  return `${Math.round(Number(value) || 0).toLocaleString("ko-KR")}원`;
}

function safeText(value, fallback = "") {
  const text = String(value == null || value === "" ? fallback : value).trim();
  return text || fallback;
}

function toYmd(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeBand(hour) {
  if (hour < 11) return "아침";
  if (hour < 18) return "낮";
  return "밤";
}

function recommendedCommands(plan, now) {
  return buildNextAction(plan, now)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("- /"))
    .slice(0, 4);
}

export function buildTripNow(plan, now = new Date()) {
  const current = getCurrentTripDay(plan, now);
  const today = toYmd(now);
  const expenses = Array.isArray(plan.expenses) ? plan.expenses : [];
  const travelers = Math.max(1, Number(plan.travelers) || 1);
  const days = Math.max(1, Number(plan.nights || 1) + 1);
  const budgetPerPerson = Number(plan.budgetPerPerson) || 0;
  const totalBudget = budgetPerPerson * travelers;
  const totalSpent = expenses.reduce((sum, expense) => sum + Math.max(0, Number(expense.amount) || 0), 0);
  const todaySpent = expenses
    .filter((expense) => safeText(expense.date) === today)
    .reduce((sum, expense) => sum + Math.max(0, Number(expense.amount) || 0), 0);
  const missingPayerCount = expenses.filter((expense) => !safeText(expense.paidBy)).length;
  const spentRate = totalBudget > 0 ? `${Math.round((totalSpent / totalBudget) * 100)}%` : "예산 미설정";
  const remaining = totalBudget > 0 ? totalBudget - totalSpent : 0;
  const commands = recommendedCommands(plan, now);
  const lines = [
    `플랜 #${plan.id} ${safeText(plan.destination, "여행지")} 지금 현황`,
    `${safeText(plan.startDate, "날짜 미정")} ~ ${safeText(plan.endDate, "날짜 미정")} / ${safeText(plan.companions, "동행 미정")} / ${travelers}명`,
    "",
    `- 현재: ${current.label}${current.status === "active" ? ` / 여행 ${current.day}일차` : ""}`,
    `- 시간대: ${timeBand(now.getHours())}`,
    `- 오늘 날짜: ${today}`,
    "",
    "## 지금 할 일",
  ];

  if (commands.length === 0) {
    lines.push("- `/nextaction`으로 다음 행동을 먼저 확인하세요.");
  } else {
    lines.push(...commands);
  }

  lines.push(
    "",
    "## 예산",
    budgetPerPerson > 0
      ? `- 총예산: ${won(totalBudget)} / 누적 지출: ${won(totalSpent)} (${spentRate}) / 남은 예산: ${won(remaining)}`
      : "- 1인 예산이 아직 없습니다. `/partybudget` 또는 웹 상세 화면에서 예산을 넣으면 소진율을 볼 수 있습니다.",
    `- 오늘 기록된 지출: ${won(todaySpent)}`,
    `- 하루 권장 예산: ${budgetPerPerson > 0 ? won(totalBudget / days) : "예산 미설정"}`,
    "",
    "## 지출/정산",
    `- 저장된 지출: ${expenses.length}건`,
    `- 결제자 미입력: ${missingPayerCount}건`,
    missingPayerCount > 0
      ? "- 정산 전 `/expense_edit paid_by:이름`으로 결제자를 보강하세요."
      : "- 정산 요청문을 만들 준비가 좋습니다. 필요하면 `/settlemessage`를 쓰세요.",
    "",
    "## 바로가기",
    "- `/brief` 오늘 일정/예산",
    "- `/todaycheck` 오늘 점검",
    "- `/expense` 지출 기록",
    "- `/nightcheck` 밤 점검"
  );

  return lines.join("\n");
}
