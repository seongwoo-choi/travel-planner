function won(value) {
  return `${Math.round(Number(value) || 0).toLocaleString("ko-KR")}원`;
}

function safeText(value, fallback = "") {
  const text = String(value == null || value === "" ? fallback : value).trim();
  return text || fallback;
}

function calculateSettlementTransfers(plan) {
  const expenses = Array.isArray(plan.expenses) ? plan.expenses : [];
  const travelers = Math.max(1, Number(plan.travelers) || 1);
  const total = expenses.reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0);
  const share = total / travelers;
  const payerTotals = new Map();

  expenses.forEach((expense) => {
    const payer = safeText(expense.paidBy, "결제자 미입력");
    payerTotals.set(payer, (payerTotals.get(payer) || 0) + Math.max(0, Number(expense.amount) || 0));
  });

  const knownPayers = [...payerTotals.keys()].filter((name) => name !== "결제자 미입력");
  const participants = [...knownPayers];
  const unknownPaid = payerTotals.get("결제자 미입력") || 0;
  if (unknownPaid > 0) participants.push("결제자 미입력");
  while (participants.length < travelers) {
    participants.push(`이름 미입력 동행 ${participants.length - knownPayers.length + 1}`);
  }

  const balances = participants.map((name) => ({
    name,
    balance: (payerTotals.get(name) || 0) - share,
  }));
  const creditors = balances
    .filter((item) => item.balance > 0.5)
    .sort((a, b) => b.balance - a.balance);
  const debtors = balances
    .filter((item) => item.balance < -0.5)
    .map((item) => ({ name: item.name, balance: Math.abs(item.balance) }))
    .sort((a, b) => b.balance - a.balance);
  const transfers = [];

  let creditorIndex = 0;
  let debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.balance, debtor.balance);
    if (amount > 0.5) {
      transfers.push({ from: debtor.name, to: creditor.name, amount });
    }
    creditor.balance -= amount;
    debtor.balance -= amount;
    if (creditor.balance <= 0.5) creditorIndex += 1;
    if (debtor.balance <= 0.5) debtorIndex += 1;
  }

  return { expenses, travelers, total, share, participants, unknownPaid, transfers };
}

export function buildSettlementBriefing(plan, amount, paidBy = "") {
  const total = Math.max(0, Math.round(Number(String(amount || "").replace(/,/g, "")) || 0));
  const travelers = Math.max(1, Number(plan.travelers) || 1);
  const baseShare = Math.floor(total / travelers);
  const remainder = total % travelers;
  const payer = safeText(paidBy);
  const payerReceive = Math.max(0, total - baseShare);
  const lines = [
    `플랜 #${plan.id} ${safeText(plan.destination, "여행지")} 정산`,
    `${safeText(plan.startDate, "날짜 미정")} ~ ${safeText(plan.endDate, "날짜 미정")} / ${travelers}명`,
    "",
    `- 총 지출: ${won(total)}`,
    `- 1인 기준액: ${won(total / travelers)}`,
    `- 실무 정산: ${remainder > 0 ? `${remainder}명은 ${won(baseShare + 1)}, ${travelers - remainder}명은 ${won(baseShare)}` : `각자 ${won(baseShare)}`}`,
  ];

  if (payer) {
    lines.push(`- 결제자: ${payer}`, `- ${payer}가 전액 결제했다면 받을 금액: ${won(payerReceive)}`);
  } else {
    lines.push("- 결제자를 적어두면 한 사람이 전액 결제했을 때 받을 금액도 함께 볼 수 있습니다.");
  }

  lines.push(
    "",
    "정산 팁:",
    "- 카카오페이/토스 요청 전 총액과 인원 수를 한 번 더 확인",
    "- 숙소/교통처럼 큰 지출과 식비/카페 지출은 따로 정산하면 덜 헷갈립니다.",
    "- 이미 일부 사람이 냈다면 개인 메모에 먼저 기록해 두세요."
  );

  return lines.join("\n");
}

export function normalizeExpenseFilters(filters = {}) {
  return {
    category: safeText(filters.category).toLowerCase(),
    date: safeText(filters.date),
    paidBy: safeText(filters.paidBy || filters.paid_by).toLowerCase(),
  };
}

function expenseFilterText(filters) {
  const normalized = normalizeExpenseFilters(filters);
  return [
    normalized.category ? `카테고리=${normalized.category}` : "",
    normalized.date ? `날짜=${normalized.date}` : "",
    normalized.paidBy ? `결제자=${normalized.paidBy}` : "",
  ].filter(Boolean).join(" / ");
}

export function filterExpenses(expenses, filters = {}) {
  const normalized = normalizeExpenseFilters(filters);
  return (Array.isArray(expenses) ? expenses : []).filter((expense) => {
    const category = safeText(expense.category).toLowerCase();
    const date = safeText(expense.date);
    const paidBy = safeText(expense.paidBy).toLowerCase();
    return (!normalized.category || category === normalized.category)
      && (!normalized.date || date === normalized.date)
      && (!normalized.paidBy || paidBy === normalized.paidBy);
  });
}

export function buildExpenseLedger(plan, filters = {}) {
  const allExpenses = Array.isArray(plan.expenses) ? plan.expenses : [];
  const expenses = filterExpenses(allExpenses, filters);
  const filterText = expenseFilterText(filters);
  const travelers = Math.max(1, Number(plan.travelers) || 1);
  const total = expenses.reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0);
  const share = total / travelers;
  const payerTotals = new Map();
  const categoryTotals = new Map();
  const dateTotals = new Map();
  const lines = [
    `플랜 #${plan.id} ${safeText(plan.destination, "여행지")} 지출 기록`,
    `${safeText(plan.startDate, "날짜 미정")} ~ ${safeText(plan.endDate, "날짜 미정")} / ${travelers}명`,
    "",
  ];

  if (filterText) {
    lines.push(`필터: ${filterText}`, "");
  }

  if (expenses.length === 0) {
    if (allExpenses.length > 0 && filterText) {
      lines.push("조건에 맞는 지출이 없습니다.", "필터를 비우면 전체 지출을 다시 볼 수 있습니다.");
    } else {
      lines.push("아직 저장된 지출이 없습니다.", "웹 상세 화면 또는 Discord `/expense`로 지출을 추가할 수 있습니다.");
    }
    return lines.join("\n");
  }

  expenses.forEach((expense) => {
    const payer = expense.paidBy ? ` / 결제: ${expense.paidBy}` : "";
    const category = expense.category ? ` / 분류: ${expense.category}` : "";
    const date = expense.date ? ` / 날짜: ${expense.date}` : "";
    if (expense.paidBy) {
      payerTotals.set(expense.paidBy, (payerTotals.get(expense.paidBy) || 0) + Math.max(0, Number(expense.amount) || 0));
    }
    if (expense.category) {
      categoryTotals.set(expense.category, (categoryTotals.get(expense.category) || 0) + Math.max(0, Number(expense.amount) || 0));
    }
    if (expense.date) {
      dateTotals.set(expense.date, (dateTotals.get(expense.date) || 0) + Math.max(0, Number(expense.amount) || 0));
    }
    lines.push(`- #${expense.id} ${expense.label || "지출"}: ${won(expense.amount)}${date}${category}${payer}`);
  });

  lines.push(
    "",
    `- 누적 지출: ${won(total)}`,
    `- 1인 기준 누적 부담: ${won(total / travelers)}`,
    ""
  );

  if (payerTotals.size > 0) {
    lines.push("## 결제자별 정산 감각");
    [...payerTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([payer, paid]) => {
        const balance = paid - share;
        const action = balance >= 0 ? `받을 금액 약 ${won(balance)}` : `더 낼 금액 약 ${won(Math.abs(balance))}`;
        lines.push(`- ${payer}: 결제 ${won(paid)} / ${action}`);
      });
    if (payerTotals.size < travelers) {
      lines.push(`- 결제 기록이 없는 동행은 1인 기준 약 ${won(share)}를 내는 쪽으로 맞추면 됩니다.`);
    }
    lines.push("");
  }

  if (categoryTotals.size > 0) {
    lines.push("## 카테고리별 지출");
    [...categoryTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([category, amount]) => {
        lines.push(`- ${category}: ${won(amount)}`);
      });
    lines.push("");
  }

  if (dateTotals.size > 0) {
    lines.push("## 날짜별 지출");
    [...dateTotals.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([date, amount]) => {
        lines.push(`- ${date}: ${won(amount)}`);
      });
    lines.push("");
  }

  lines.push(
    "정산 팁:",
    "- 결제자 이름을 같은 표기로 계속 적으면 결제자별 받을/낼 금액이 더 깔끔해집니다.",
    "- 숙소/교통처럼 큰 지출과 식비/카페 지출은 따로 확인하면 덜 헷갈립니다.",
    "- 여행이 끝난 뒤 `/settle amount:총액`으로 최종 정산 문구를 다시 만들 수 있습니다."
  );

  return lines.join("\n");
}

export function buildSettlementMatrix(plan) {
  const expenses = Array.isArray(plan.expenses) ? plan.expenses : [];
  const travelers = Math.max(1, Number(plan.travelers) || 1);
  const total = expenses.reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0);
  const share = total / travelers;
  const payerTotals = new Map();
  const lines = [
    `플랜 #${plan.id} ${safeText(plan.destination, "여행지")} 정산 매트릭스`,
    `${safeText(plan.startDate, "날짜 미정")} ~ ${safeText(plan.endDate, "날짜 미정")} / ${travelers}명`,
    "",
  ];

  if (expenses.length === 0) {
    lines.push("아직 저장된 지출이 없습니다.", "먼저 `/expense` 또는 웹 상세 화면에서 지출을 기록해주세요.");
    return lines.join("\n");
  }

  expenses.forEach((expense) => {
    const payer = safeText(expense.paidBy, "결제자 미입력");
    payerTotals.set(payer, (payerTotals.get(payer) || 0) + Math.max(0, Number(expense.amount) || 0));
  });

  const knownPayers = [...payerTotals.keys()].filter((name) => name !== "결제자 미입력");
  const unnamedCount = Math.max(0, travelers - knownPayers.length);

  lines.push(
    `- 총 지출: ${won(total)}`,
    `- 1인 부담 기준: ${won(share)}`,
    `- 결제 기록 있는 이름: ${knownPayers.length}명`,
    unnamedCount > 0 ? `- 이름 미입력 동행 추정: ${unnamedCount}명` : "- 모든 동행이 결제자 이름으로 등장했습니다.",
    "",
    "## 결제자별 받을/낼 금액"
  );

  [...payerTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([payer, paid]) => {
      const balance = paid - share;
      if (payer === "결제자 미입력") {
        lines.push(`- ${payer}: 결제 ${won(paid)} / 결제자 이름을 보강해야 정확히 나눌 수 있습니다.`);
        return;
      }
      const action = balance >= 0 ? `받을 금액 약 ${won(balance)}` : `더 낼 금액 약 ${won(Math.abs(balance))}`;
      lines.push(`- ${payer}: 결제 ${won(paid)} / ${action}`);
    });

  if (unnamedCount > 0) {
    lines.push("", "## 결제 기록 없는 동행");
    lines.push(`- ${unnamedCount}명은 각자 약 ${won(share)}를 내는 쪽으로 맞추면 됩니다.`);
  }

  lines.push(
    "",
    "정산 체크:",
    "- 결제자 이름이 같은 사람인데 표기가 다르면 `/expense_edit paid_by:이름`으로 통일하세요.",
    "- 결제자 미입력 항목이 있으면 먼저 결제자를 채워야 받을/낼 금액이 정확해집니다.",
    "- 실제 송금 전에는 숙소/교통처럼 큰 지출이 누락되지 않았는지 확인하세요."
  );

  return lines.join("\n");
}

export function buildSettlementTransfers(plan) {
  const { expenses, travelers, total, share, participants, unknownPaid, transfers } = calculateSettlementTransfers(plan);
  const lines = [
    `플랜 #${plan.id} ${safeText(plan.destination, "여행지")} 정산 송금표`,
    `${safeText(plan.startDate, "날짜 미정")} ~ ${safeText(plan.endDate, "날짜 미정")} / ${travelers}명`,
    "",
  ];

  if (expenses.length === 0) {
    lines.push("아직 저장된 지출이 없습니다.", "먼저 `/expense` 또는 웹 상세 화면에서 지출을 기록해주세요.");
    return lines.join("\n");
  }

  lines.push(
    `- 총 지출: ${won(total)}`,
    `- 1인 부담 기준: ${won(share)}`,
    "",
    "## 송금 요청"
  );

  if (transfers.length === 0) {
    lines.push("- 이미 균등하게 맞춰졌거나 결제자 정보가 부족합니다.");
  } else {
    transfers.forEach((transfer) => {
      lines.push(`- ${transfer.from} -> ${transfer.to}: ${won(transfer.amount)}`);
    });
  }

  lines.push(
    "",
    "정산 전 확인:",
    unknownPaid > 0 ? `- 결제자 미입력 지출 ${won(unknownPaid)}이 있어 송금표가 부정확할 수 있습니다.` : "- 결제자 미입력 지출은 없습니다.",
    participants.length > travelers ? `- 결제자 이름 수가 인원 수(${travelers}명)보다 많습니다. 동명이인/표기 차이를 확인하세요.` : "- 인원 수와 결제자 이름 수가 크게 어긋나지 않습니다.",
    "- 송금 요청 전 `/settlematrix`로 결제자별 받을/낼 금액도 함께 확인하세요."
  );

  return lines.join("\n");
}

export function buildSettlementMessage(plan) {
  const { expenses, travelers, total, share, unknownPaid, transfers } = calculateSettlementTransfers(plan);
  const lines = [
    `${safeText(plan.destination, "여행")} 정산 요청문`,
    `${safeText(plan.startDate, "날짜 미정")} ~ ${safeText(plan.endDate, "날짜 미정")} / ${travelers}명`,
    "",
  ];

  if (expenses.length === 0) {
    lines.push("아직 저장된 지출이 없어 정산 요청문을 만들 수 없습니다.");
    return lines.join("\n");
  }

  lines.push(
    `총 지출은 ${won(total)}, 1인 부담 기준은 ${won(share)}입니다.`,
    "",
    "아래대로 보내면 정산이 맞습니다."
  );

  if (transfers.length === 0) {
    lines.push("- 현재 기록 기준으로 추가 송금이 거의 필요 없습니다.");
  } else {
    transfers.forEach((transfer) => {
      lines.push(`- ${transfer.from}님, ${transfer.to}님에게 ${won(transfer.amount)} 보내주세요.`);
    });
  }

  lines.push("");
  if (unknownPaid > 0) {
    lines.push(`참고: 결제자 미입력 지출 ${won(unknownPaid)}이 있어, 실제 송금 전 결제자 이름을 한 번 더 확인해주세요.`);
  } else {
    lines.push("참고: 결제자 미입력 지출은 없습니다. 송금 전 큰 지출 누락만 한 번 더 확인해주세요.");
  }

  return lines.join("\n");
}

function csvCell(value) {
  const text = String(value == null ? "" : value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildExpenseCsv(plan, filters = {}) {
  const expenses = filterExpenses(plan.expenses, filters);
  const rows = [
    ["expense_id", "date", "label", "category", "amount", "paid_by", "created_at", "updated_at", "plan_id", "destination"],
    ...expenses.map((expense) => [
      expense.id || "",
      expense.date || "",
      expense.label || "지출",
      expense.category || "",
      Math.round(Number(expense.amount) || 0),
      expense.paidBy || "",
      expense.createdAt || "",
      expense.updatedAt || "",
      plan.id || "",
      plan.destination || "",
    ]),
  ];
  return `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}
