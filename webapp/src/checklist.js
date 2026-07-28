function truncateText(text, limit = 1900) {
  const value = String(text || "");
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 32)}\n\n...일부 항목을 줄였습니다.`;
}

export function buildChecklistText(plan, limit = 1900) {
  const destination = plan.destination || "여행지";
  const nights = Number(plan.nights) || 2;
  const days = nights + 1;
  const scope = plan.scope === "international" ? "international" : "domestic";
  const transport = String(plan.transportPref || "").toLowerCase();
  const tripType = String(plan.tripType || "");
  const items = [
    `플랜 #${plan.id} 첨부 파일 또는 메시지 저장`,
    `${destination} 숙소 예약 확인`,
    `${days}일치 의류와 여분 양말`,
    "충전기, 보조배터리, 케이블",
    "상비약, 개인 복용약, 밴드",
    "우산 또는 얇은 방수 겉옷",
    "현금 소액과 결제 카드",
  ];

  if (scope === "international") {
    items.push("여권, 비자/입국 서류, 해외 결제 카드");
    items.push("로밍/eSIM 또는 현지 유심 준비");
  } else {
    items.push("신분증");
  }

  if (/ktx|srt/.test(transport)) items.push("열차 승차권과 출발역 도착 시간 확인");
  if (/bus|버스/.test(transport)) items.push("버스 승차권과 터미널 위치 확인");
  if (/car|자차|운전/.test(transport)) items.push("차량 점검, 주차장, 주유/충전 위치 확인");
  if (/flight|항공|비행/.test(transport)) items.push("항공권, 수하물 규정, 공항 도착 시간 확인");
  if (/맛집|식도락|카페/.test(tripType)) items.push("예약 필요한 식당과 웨이팅 앱 확인");
  if (/자연|등산|바다|해변|숲/.test(tripType)) items.push("편한 신발, 자외선 차단제, 모자");
  if (/쇼핑|시장|아울렛|백화점/.test(tripType)) items.push("여분 가방 또는 접이식 장바구니");

  return truncateText(
    `플랜 #${plan.id} ${destination} 여행 체크리스트\n${plan.departure || "서울"} -> ${destination} / ${nights}박 ${days}일 / ${plan.travelers || 2}명\n\n${items
      .map((item) => `- [ ] ${item}`)
      .join("\n")}\n\n출발 전 마지막 점검: 예약, 교통, 날씨, 배터리.`,
    limit
  );
}
