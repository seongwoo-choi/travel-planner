function won(value) {
  return `${Math.round(Number(value) || 0).toLocaleString("ko-KR")}원`;
}

const CATEGORY_BUDGETS = [
  { label: "숙소", categories: ["숙소"], ratio: 0.35 },
  { label: "식비/카페", categories: ["식비", "카페"], ratio: 0.3 },
  { label: "교통", categories: ["교통"], ratio: 0.2 },
  { label: "관광/쇼핑/기타", categories: ["관광", "쇼핑", "기타", "미분류"], ratio: 0.15 },
];

function budgetStatus(ratio) {
  if (ratio > 100) return "초과";
  if (ratio >= 90) return "위험";
  if (ratio >= 75) return "주의";
  return "안정";
}

function budgetBucket(category) {
  const normalized = String(category || "미분류").trim() || "미분류";
  return CATEGORY_BUDGETS.find((bucket) => bucket.categories.includes(normalized)) || CATEGORY_BUDGETS.at(-1);
}

function toYmd(value = new Date()) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return toYmd(new Date());
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toLocalDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function selectedTripDay(plan, date) {
  const start = toLocalDate(plan.startDate);
  const end = toLocalDate(plan.endDate || plan.startDate);
  const selected = toLocalDate(date);
  if (!start || !end || !selected || selected < start || selected > end) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((selected - start) / dayMs) + 1;
}

export function buildBudgetBriefing(plan) {
  const travelers = Math.max(1, Number(plan.travelers) || 1);
  const nights = Math.max(1, Number(plan.nights) || 1);
  const days = nights + 1;
  const budgetPerPerson = Number(plan.budgetPerPerson) || 0;
  const totalBudget = budgetPerPerson * travelers;

  if (!budgetPerPerson) {
    return [
      `플랜 #${plan.id} 예산 브리핑`,
      `${plan.destination || "여행지"} / ${nights}박 ${days}일 / ${travelers}명`,
      "",
      "아직 1인 예산이 입력되지 않았습니다.",
      "플랜 생성 시 `1인 예산`을 넣거나, 디스코드 `/quick`에서 `1인 20만원`처럼 적으면 총예산과 카테고리 가이드를 계산할 수 있습니다.",
      "",
      "기본 점검:",
      "- 교통비와 숙박비를 먼저 확정",
      "- 식비는 하루 단위로 상한 설정",
      "- 예비비는 총액의 10~15% 확보",
    ].join("\n");
  }

  return [
    `플랜 #${plan.id} 예산 브리핑`,
    `${plan.destination || "여행지"} / ${nights}박 ${days}일 / ${travelers}명`,
    "",
    `- 1인 예산: ${won(budgetPerPerson)}`,
    `- 총 예산: ${won(totalBudget)}`,
    `- 하루 전체 예산: ${won(totalBudget / days)}`,
    `- 1인 하루 예산: ${won(budgetPerPerson / days)}`,
    "",
    "권장 배분:",
    `- 숙박: ${won(totalBudget * 0.35)}`,
    `- 식비/카페: ${won(totalBudget * 0.3)}`,
    `- 교통: ${won(totalBudget * 0.2)}`,
    `- 예비비/입장권/쇼핑: ${won(totalBudget * 0.15)}`,
    "",
    "사용 팁:",
    "- 예약 결제 전에는 숙박+교통 합계가 총예산의 55~65%를 넘는지 확인",
    "- 현지 결제는 하루 예산 기준으로 끊어서 관리",
    "- 마지막 날은 이동/수하물 때문에 예비비를 조금 더 남겨두기",
  ].join("\n");
}

export function buildSpendingStatus(plan) {
  const travelers = Math.max(1, Number(plan.travelers) || 1);
  const nights = Math.max(1, Number(plan.nights) || 1);
  const days = nights + 1;
  const budgetPerPerson = Number(plan.budgetPerPerson) || 0;
  const totalBudget = budgetPerPerson * travelers;
  const expenses = Array.isArray(plan.expenses) ? plan.expenses : [];
  const spent = expenses.reduce((sum, expense) => sum + Math.max(0, Number(expense.amount) || 0), 0);
  const remaining = totalBudget - spent;
  const ratio = totalBudget > 0 ? Math.round((spent / totalBudget) * 100) : 0;
  const categoryTotals = new Map();

  expenses.forEach((expense) => {
    if (!expense.category) return;
    categoryTotals.set(expense.category, (categoryTotals.get(expense.category) || 0) + Math.max(0, Number(expense.amount) || 0));
  });

  const lines = [
    `플랜 #${plan.id} ${plan.destination || "여행지"} 예산 소진 현황`,
    `${nights}박 ${days}일 / ${travelers}명`,
    "",
    `- 저장된 지출: ${won(spent)}`,
  ];

  if (!totalBudget) {
    lines.push(
      "- 총 예산: 아직 1인 예산이 입력되지 않았습니다.",
      "",
      "예산을 넣으면 소진율과 남은 금액을 계산할 수 있습니다.",
      "웹 상세 화면의 `인원/예산 변경` 또는 Discord `/partybudget`으로 1인 예산을 설정하세요."
    );
  } else {
    lines.push(
      `- 총 예산: ${won(totalBudget)}`,
      `- 소진율: ${ratio}%`,
      remaining >= 0 ? `- 남은 예산: ${won(remaining)}` : `- 초과 지출: ${won(Math.abs(remaining))}`,
      `- 남은 1인 예산: ${won(remaining / travelers)}`,
      `- 하루 평균 지출: ${won(spent / days)}`
    );
  }

  if (categoryTotals.size > 0) {
    lines.push("", "카테고리별 소진:");
    [...categoryTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([category, amount]) => {
        lines.push(`- ${category}: ${won(amount)}`);
      });
  }

  lines.push(
    "",
    "사용 팁:",
    "- 여행 중에는 큰 지출을 바로 기록하면 마지막 날 정산이 훨씬 쉬워집니다.",
    "- 소진율이 80%를 넘으면 식비/카페/이동비 중 줄일 항목을 먼저 고르세요."
  );

  return lines.join("\n");
}

export function buildDailyBudgetStatus(plan, dateInput = "") {
  const travelers = Math.max(1, Number(plan.travelers) || 1);
  const nights = Math.max(1, Number(plan.nights) || 1);
  const days = nights + 1;
  const budgetPerPerson = Number(plan.budgetPerPerson) || 0;
  const totalBudget = budgetPerPerson * travelers;
  const dailyBudget = totalBudget / days;
  const date = toYmd(dateInput || new Date());
  const day = selectedTripDay(plan, date);
  const expenses = (Array.isArray(plan.expenses) ? plan.expenses : []).filter((expense) => expense.date === date);
  const spent = expenses.reduce((sum, expense) => sum + Math.max(0, Number(expense.amount) || 0), 0);
  const remaining = dailyBudget - spent;
  const ratio = dailyBudget > 0 ? Math.round((spent / dailyBudget) * 100) : 0;
  const categoryTotals = new Map();

  expenses.forEach((expense) => {
    const category = String(expense.category || "미분류").trim() || "미분류";
    categoryTotals.set(category, (categoryTotals.get(category) || 0) + Math.max(0, Number(expense.amount) || 0));
  });

  const lines = [
    `플랜 #${plan.id} ${plan.destination || "여행지"} 하루 예산`,
    `${date}${day ? ` / 여행 ${day}일차` : " / 여행 기간 밖"}`,
    "",
  ];

  if (!totalBudget) {
    lines.push(
      "아직 1인 예산이 입력되지 않았습니다.",
      "웹 상세 화면의 `인원/예산 변경` 또는 Discord `/partybudget`으로 예산을 먼저 입력하면 하루 예산을 계산할 수 있습니다."
    );
    return lines.join("\n");
  }

  lines.push(
    `- 하루 권장 예산: ${won(dailyBudget)}`,
    `- 오늘 기록 지출: ${won(spent)} / ${ratio}%`,
    remaining >= 0 ? `- 오늘 남은 예산: ${won(remaining)}` : `- 오늘 초과 지출: ${won(Math.abs(remaining))}`,
    `- 기록된 지출: ${expenses.length}건`
  );

  if (categoryTotals.size > 0) {
    lines.push("", "오늘 카테고리별 지출:");
    [...categoryTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([category, amount]) => {
        lines.push(`- ${category}: ${won(amount)}`);
      });
  } else {
    lines.push("", "아직 이 날짜로 기록된 지출이 없습니다.");
  }

  lines.push(
    "",
    "운영 팁:",
    !day ? "- 선택 날짜가 여행 기간 밖이면 실제 여행 날짜의 지출 기록 날짜를 확인하세요." : "- 이동이 많은 날은 교통비를 먼저 기록하고 남은 예산을 식비/카페에 배분하세요.",
    ratio >= 100 ? "- 이미 하루 권장 예산을 넘었습니다. 다음 식비/카페/쇼핑 지출을 줄이는 쪽이 안전합니다." : "- 70%를 넘기기 전까지 큰 지출을 먼저 기록해두면 저녁 예산 판단이 쉬워집니다."
  );

  return lines.join("\n");
}

export function buildCategoryBudgetStatus(plan) {
  const travelers = Math.max(1, Number(plan.travelers) || 1);
  const nights = Math.max(1, Number(plan.nights) || 1);
  const days = nights + 1;
  const budgetPerPerson = Number(plan.budgetPerPerson) || 0;
  const totalBudget = budgetPerPerson * travelers;
  const expenses = Array.isArray(plan.expenses) ? plan.expenses : [];
  const bucketTotals = new Map(CATEGORY_BUDGETS.map((bucket) => [bucket.label, 0]));

  expenses.forEach((expense) => {
    const bucket = budgetBucket(expense.category);
    bucketTotals.set(bucket.label, (bucketTotals.get(bucket.label) || 0) + Math.max(0, Number(expense.amount) || 0));
  });

  const lines = [
    `플랜 #${plan.id} ${plan.destination || "여행지"} 카테고리 예산 가드`,
    `${nights}박 ${days}일 / ${travelers}명`,
    "",
  ];

  if (!totalBudget) {
    lines.push(
      "아직 1인 예산이 입력되지 않았습니다.",
      "웹 상세 화면의 `인원/예산 변경` 또는 Discord `/partybudget`으로 예산을 먼저 입력하면 카테고리별 한도를 계산할 수 있습니다."
    );
    return lines.join("\n");
  }

  lines.push(
    `- 1인 예산: ${won(budgetPerPerson)}`,
    `- 총 예산: ${won(totalBudget)}`,
    ""
  );

  const warnings = [];
  CATEGORY_BUDGETS.forEach((bucket) => {
    const limit = totalBudget * bucket.ratio;
    const spent = bucketTotals.get(bucket.label) || 0;
    const ratio = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    const remaining = limit - spent;
    const status = budgetStatus(ratio);
    if (status !== "안정") warnings.push(`${bucket.label} ${status}`);
    lines.push(
      `## ${bucket.label}`,
      `- 권장 한도: ${won(limit)}`,
      `- 현재 지출: ${won(spent)} / ${ratio}% / ${status}`,
      remaining >= 0 ? `- 남은 한도: ${won(remaining)}` : `- 초과 금액: ${won(Math.abs(remaining))}`,
      ""
    );
  });

  lines.push(
    "운영 팁:",
    warnings.length > 0 ? `- 우선 확인: ${warnings.join(", ")}` : "- 현재는 모든 카테고리가 권장 한도 안에 있습니다.",
    "- 숙소/교통은 초반에 크게 빠지므로 예약 확정 뒤 다시 확인하세요.",
    "- 식비/카페는 하루 단위로 쪼개서 보면 과소비를 빨리 잡을 수 있습니다.",
    "- 관광/쇼핑/기타는 여행 후반 예비비 역할을 하도록 남겨두면 안전합니다."
  );

  return lines.join("\n");
}
