function safeText(value, fallback = "미정") {
  const text = String(value == null || value === "" ? fallback : value).trim();
  return text || fallback;
}

function truncateText(text, limit = 4000) {
  const value = String(text || "");
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 32)}\n\n...일부 내용을 줄였습니다.`;
}

export function buildEmergencyCard(plan, limit = 4000) {
  const isInternational = plan.scope === "international";
  const personalNote = safeText(plan.personalNote, "");
  const lines = [
    `# ${safeText(plan.destination, "여행지")} 여행 비상 카드`,
    "",
    `- 플랜 ID: #${plan.id}`,
    `- 기간: ${safeText(plan.startDate)} ~ ${safeText(plan.endDate)}`,
    `- 이동: ${safeText(plan.departure, "서울")} -> ${safeText(plan.destination)}`,
    `- 인원: ${safeText(plan.travelers, 2)}명 / 동행: ${safeText(plan.companions)}`,
    `- 교통 선호: ${safeText(plan.transportPref, "auto")}`,
    `- 숙박 선호: ${safeText(plan.accommodation)}`,
    "",
    "## 바로 확인할 것",
    "- 숙소 주소와 체크인 연락처를 메모/지도 앱에 저장",
    "- 대표자 1명에게 전체 일정과 숙소 정보를 공유",
    "- 신분증, 예약번호, 결제 카드, 보조배터리 위치 확인",
    "- 중요한 예약 화면은 오프라인에서도 볼 수 있게 캡처",
    "",
    "## 비상 연락 루틴",
    "- 길을 잃었을 때: 현재 위치 공유 -> 가까운 큰 건물/역/편의점 기준으로 대기",
    "- 동행과 흩어졌을 때: 마지막 합류 장소와 다음 합류 시간을 먼저 정하기",
    "- 지갑/휴대폰 분실: 카드 정지 -> 숙소/경찰/교통사 분실물 순서로 접수",
    "- 몸이 안 좋을 때: 무리해서 이동하지 말고 숙소/역/공항 안내 데스크에 도움 요청",
    "",
    "## 준비물 재확인",
    "- 신분증 또는 여권",
    "- 교통 티켓/예약 내역",
    "- 숙소 예약 내역",
    "- 상비약과 개인 복용약",
    "- 충전기, 보조배터리, 케이블",
  ];

  if (isInternational) {
    lines.push(
      "",
      "## 해외 여행 추가 확인",
      "- 여권 사본과 항공/숙소 예약 사본을 따로 저장",
      "- 현지 긴급전화, 한국 대사관/영사관 연락처를 출국 전 확인",
      "- 로밍/이심/오프라인 지도/번역 앱 준비",
      "- 카드 해외 사용 가능 여부와 분실 신고 번호 확인"
    );
  } else {
    lines.push(
      "",
      "## 국내 여행 빠른 연락",
      "- 긴급 신고: 112 또는 119",
      "- 교통/숙소 예약 앱의 고객센터 경로 미리 확인",
      "- 역/터미널/공항 이용 시 안내 데스크 위치 확인"
    );
  }

  if (personalNote) {
    lines.push("", "## 개인 메모", personalNote);
  }

  return truncateText(lines.join("\n"), limit);
}
