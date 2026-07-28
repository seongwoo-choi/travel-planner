function safeText(value, fallback = "미정") {
  const text = String(value == null || value === "" ? fallback : value).trim();
  return text || fallback;
}

function toLocalDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function tripTiming(plan, now = new Date()) {
  const current = toLocalDate(now);
  const start = toLocalDate(plan.startDate);
  const end = toLocalDate(plan.endDate || plan.startDate);
  const dayMs = 24 * 60 * 60 * 1000;
  const untilStart = Math.round((start - current) / dayMs);
  const day = Math.round((current - start) / dayMs) + 1;

  if (untilStart > 0) return { status: "before", label: `D-${untilStart}`, day: 1 };
  if (current > end) return { status: "after", label: "완료", day: Math.max(1, Number(plan.nights || 1) + 1) };
  return { status: "active", label: `${Math.max(1, day)}일차`, day: Math.max(1, day) };
}

function truncateText(text, limit = 4000) {
  const value = String(text || "");
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 32)}\n\n...일부 내용을 줄였습니다.`;
}

export function buildDepartureBriefing(plan, limit = 4000) {
  const timing = tripTiming(plan);
  const transport = safeText(plan.transportPref, "auto");
  const accommodation = safeText(plan.accommodation);
  const personalNote = safeText(plan.personalNote, "");
  const lines = [
    `# ${safeText(plan.destination, "여행지")} 출발 전 브리핑`,
    "",
    `- 상태: ${timing.label}`,
    `- 기간: ${safeText(plan.startDate)} ~ ${safeText(plan.endDate)} / ${safeText(plan.nights, 1)}박`,
    `- 이동: ${safeText(plan.departure, "서울")} -> ${safeText(plan.destination)}`,
    `- 인원: ${safeText(plan.travelers, 2)}명 / 동행: ${safeText(plan.companions)}`,
    `- 교통: ${transport} / 숙박: ${accommodation}`,
    "",
  ];

  if (timing.status === "before") {
    lines.push(
      "## 지금 확인할 것",
      "- 출발 시간과 집에서 출발할 시간을 캘린더/알람에 등록",
      "- 교통 예약 내역과 숙소 예약 내역 캡처",
      "- 신분증, 결제 카드, 충전기, 보조배터리 위치 확인",
      "- 동행자에게 집합 시간과 장소 다시 공유",
      "- 짐싸기 목록에서 빠진 항목 확인",
      ""
    );
  } else if (timing.status === "active") {
    lines.push(
      "## 여행 중 오늘 확인할 것",
      "- 오늘 이동 전 휴대폰 배터리와 결제 수단 확인",
      "- 숙소/다음 목적지 주소를 지도 앱에 미리 열기",
      "- 동행자와 다음 합류 장소와 시간을 먼저 정하기",
      "- 무리한 일정은 바로 줄이고 핵심 장소부터 방문",
      ""
    );
  } else {
    lines.push(
      "## 여행 후 정리할 것",
      "- 영수증과 결제 내역 확인",
      "- 분실물 여부 확인",
      "- 좋았던 장소와 아쉬웠던 동선을 개인 메모에 남기기",
      "- 다음 여행용으로 이 플랜을 복제해 개선하기",
      ""
    );
  }

  if (/ktx|srt|bus|버스|항공|flight/i.test(transport)) {
    lines.push(
      "## 예약 교통 확인",
      "- 출발 터미널/역/공항과 탑승 위치 확인",
      "- 예매 QR/티켓 화면 캡처",
      "- 출발 30분 전 도착을 기준으로 역산",
      ""
    );
  }

  if (/car|자차|렌트|운전/i.test(transport)) {
    lines.push(
      "## 차량 이동 확인",
      "- 주차장과 도착지 하차 위치 확인",
      "- 주유/충전 상태 확인",
      "- 운전자 휴식 시간 확보",
      ""
    );
  }

  if (plan.scope === "international") {
    lines.push(
      "## 해외 출발 확인",
      "- 여권과 항공권 이름 일치 여부 확인",
      "- 로밍/eSIM/오프라인 지도 준비",
      "- 현지 결제 카드와 예비 결제 수단 확인",
      ""
    );
  }

  if (personalNote) {
    lines.push("## 개인 메모", personalNote, "");
  }

  lines.push("## 한 줄 결론", "출발 시간, 예약 캡처, 신분증/결제수단, 충전 상태만 확실히 잡으면 나머지는 현장에서 조정 가능합니다.");
  return truncateText(lines.join("\n"), limit);
}
