function won(value) {
  return `${Math.round(Number(value) || 0).toLocaleString("ko-KR")}원`;
}

function safeText(value, fallback = "") {
  const text = String(value == null || value === "" ? fallback : value).trim();
  return text || fallback;
}

function latestRevision(plan) {
  const revisions = Array.isArray(plan.revisions) ? plan.revisions : [];
  return revisions.find((item) => item.version === plan.latestVersion) || revisions.at(-1);
}

function localDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function tripStatus(plan) {
  const start = localDate(plan.startDate);
  const end = localDate(plan.endDate || plan.startDate);
  if (!start || !end) return "날짜 미정";

  const today = localDate(new Date().toISOString().slice(0, 10));
  const dayMs = 24 * 60 * 60 * 1000;
  if (today < start) {
    const days = Math.round((start - today) / dayMs);
    return `출발 전 D-${days}`;
  }
  if (today <= end) {
    const day = Math.round((today - start) / dayMs) + 1;
    return `여행 중 ${day}일차`;
  }
  const days = Math.round((today - end) / dayMs);
  return `여행 완료 D+${days}`;
}

function addTotal(map, key, amount) {
  const name = safeText(key);
  if (!name) return;
  map.set(name, (map.get(name) || 0) + Math.max(0, Number(amount) || 0));
}

function topLines(map, emptyText) {
  const entries = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (entries.length === 0) return [`- ${emptyText}`];
  return entries.map(([name, amount]) => `- ${name}: ${won(amount)}`);
}

function excerpt(text, limit = 280) {
  const value = safeText(text).replace(/\s+/g, " ");
  if (!value) return "";
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}...`;
}

export function buildTripRecap(plan) {
  const travelers = Math.max(1, Number(plan.travelers) || 1);
  const nights = Math.max(1, Number(plan.nights) || 1);
  const days = nights + 1;
  const expenses = Array.isArray(plan.expenses) ? plan.expenses : [];
  const totalSpent = expenses.reduce((sum, expense) => sum + Math.max(0, Number(expense.amount) || 0), 0);
  const budgetPerPerson = Math.max(0, Number(plan.budgetPerPerson) || 0);
  const totalBudget = budgetPerPerson * travelers;
  const remaining = totalBudget - totalSpent;
  const categoryTotals = new Map();
  const payerTotals = new Map();
  const dateTotals = new Map();
  const latest = latestRevision(plan);

  expenses.forEach((expense) => {
    addTotal(categoryTotals, expense.category || "미분류", expense.amount);
    addTotal(payerTotals, expense.paidBy || "결제자 미입력", expense.amount);
    addTotal(dateTotals, expense.date || "날짜 미입력", expense.amount);
  });

  const largestExpense = [...expenses]
    .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))[0];
  const ratio = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : null;
  const planMemo = excerpt(latest?.planText || "");
  const personalNote = excerpt(plan.personalNote || "", 220);

  const lines = [
    `플랜 #${plan.id} ${safeText(plan.destination, "여행지")} 여행 회고`,
    `${safeText(plan.startDate, "날짜 미정")} ~ ${safeText(plan.endDate, "날짜 미정")} / ${nights}박 ${days}일 / ${travelers}명 / ${tripStatus(plan)}`,
    "",
    "## 한눈에 보기",
    `- 출발지: ${safeText(plan.departure, "서울")}`,
    `- 동행: ${safeText(plan.companions, "미정")}`,
    `- 저장된 지출: ${expenses.length}건 / ${won(totalSpent)}`,
  ];

  if (totalBudget > 0) {
    lines.push(
      `- 총 예산: ${won(totalBudget)} / 소진율 ${ratio}%`,
      remaining >= 0 ? `- 남은 예산: ${won(remaining)}` : `- 초과 지출: ${won(Math.abs(remaining))}`
    );
  } else {
    lines.push("- 총 예산: 아직 1인 예산이 입력되지 않았습니다.");
  }

  if (largestExpense) {
    lines.push(`- 가장 큰 지출: #${largestExpense.id} ${largestExpense.label || "지출"} ${won(largestExpense.amount)}`);
  }

  lines.push("", "## 카테고리별 회고", ...topLines(categoryTotals, "아직 카테고리별 지출이 없습니다."));
  lines.push("", "## 날짜별 회고", ...topLines(dateTotals, "아직 날짜별 지출이 없습니다."));
  lines.push("", "## 결제자별 회고", ...topLines(payerTotals, "아직 결제자별 지출이 없습니다."));

  if (personalNote) {
    lines.push("", "## 개인 메모", personalNote);
  }

  if (planMemo) {
    lines.push("", "## 플랜 핵심", planMemo);
  }

  lines.push(
    "",
    "## 다음 액션",
    expenses.length > 0 ? "- `/expenses`로 누락된 지출이 없는지 확인" : "- 여행 중 결제한 항목을 `/expense` 또는 웹 상세 화면에서 기록",
    totalBudget > 0 ? "- 예산 초과/잔액을 기준으로 다음 여행 예산 조정" : "- `/partybudget` 또는 웹 상세 화면에서 1인 예산 입력",
    "- `/share`로 동행에게 요약 공유",
    "- `/expenses_export`로 CSV 백업 후 최종 정산"
  );

  return lines.join("\n");
}
