function safeText(value, fallback = "") {
  const text = String(value == null || value === "" ? fallback : value).trim();
  return text || fallback;
}

function truncateText(text, limit = 4000) {
  const value = String(text || "");
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 32)}\n\n...일부 내용을 줄였습니다.`;
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function buildPackingList(plan, limit = 4000) {
  const tripText = [plan.tripType, plan.highlights, plan.notes].filter(Boolean).join(" ");
  const isInternational = plan.scope === "international";
  const isLongTrip = Number(plan.nights || 1) >= 3;
  const isFlight = /flight|항공|비행/i.test(safeText(plan.transportPref));
  const isCar = /car|자차|렌트|운전/i.test(safeText(plan.transportPref));
  const natureTrip = hasAny(tripText, [/자연/, /등산/, /바다/, /해변/, /숲/, /공원/]);
  const foodTrip = hasAny(tripText, [/맛집/, /먹방/, /카페/, /식도락/]);
  const familyTrip = /가족|아이|자녀|부모/.test(safeText(plan.companions));
  const personalNote = safeText(plan.personalNote);
  const lines = [
    `# ${safeText(plan.destination, "여행지")} 여행 짐싸기 목록`,
    "",
    `- 기간: ${safeText(plan.startDate, "미정")} ~ ${safeText(plan.endDate, "미정")} / ${safeText(plan.nights, 1)}박`,
    `- 인원: ${safeText(plan.travelers, 2)}명 / 동행: ${safeText(plan.companions, "미정")}`,
    `- 교통: ${safeText(plan.transportPref, "auto")} / 숙박: ${safeText(plan.accommodation, "미정")}`,
    "",
    "## 필수",
    "- 신분증",
    "- 지갑, 결제 카드, 현금 소액",
    "- 휴대폰, 충전기, 보조배터리, 케이블",
    "- 예약 내역 캡처: 숙소, 교통, 식당",
    "- 개인 복용약, 상비약",
    "",
    "## 의류",
    "- 속옷과 양말: 여행 일수 + 여분 1세트",
    "- 상의/하의: 일정과 사진 동선을 고려해 최소화",
    "- 잠옷 또는 편한 실내복",
    "- 가벼운 겉옷",
    "- 비상용 접이식 우산 또는 얇은 우비",
    "",
    "## 세면/위생",
    "- 칫솔, 치약, 클렌저",
    "- 스킨케어, 선크림",
    "- 렌즈/안경/인공눈물",
    "- 마스크, 물티슈, 휴지",
    "- 빨래 봉투 또는 지퍼백",
  ];

  if (isInternational) {
    lines.push(
      "",
      "## 해외 여행",
      "- 여권과 여권 사본",
      "- 항공권/숙소 바우처",
      "- eSIM/로밍 설정 정보",
      "- 멀티 어댑터",
      "- 해외 결제 가능한 카드",
      "- 현지 통화 소액"
    );
  }

  if (isFlight) {
    lines.push(
      "",
      "## 항공 이동",
      "- 기내 반입 가능한 보조배터리",
      "- 액체류 지퍼백",
      "- 목베개 또는 얇은 겉옷",
      "- 수하물 태그"
    );
  }

  if (isCar) {
    lines.push(
      "",
      "## 자차/렌트 이동",
      "- 운전면허증",
      "- 차량 충전 케이블 또는 거치대",
      "- 간식과 생수",
      "- 주차 위치 메모"
    );
  }

  if (natureTrip) {
    lines.push(
      "",
      "## 자연/야외 일정",
      "- 걷기 편한 신발",
      "- 모자 또는 선글라스",
      "- 벌레 기피제",
      "- 작은 물병",
      "- 여분 양말"
    );
  }

  if (foodTrip) {
    lines.push(
      "",
      "## 맛집/카페 일정",
      "- 예약 식당 목록",
      "- 웨이팅 대비 보조배터리",
      "- 소화제",
      "- 포장용 작은 비닐 또는 지퍼백"
    );
  }

  if (familyTrip) {
    lines.push(
      "",
      "## 가족 여행",
      "- 동행자별 필수 약",
      "- 아이/부모님 개인 용품",
      "- 여분 간식과 물",
      "- 이동 중 볼거리 또는 이어폰"
    );
  }

  if (isLongTrip) {
    lines.push(
      "",
      "## 3박 이상",
      "- 세탁용 작은 세제 또는 빨래망",
      "- 여분 신발 또는 슬리퍼",
      "- 압축 파우치",
      "- 일정 중 재정비할 빈 시간 확보"
    );
  }

  if (personalNote) {
    lines.push("", "## 개인 메모 기반 확인", personalNote);
  }

  return truncateText(lines.join("\n"), limit);
}
