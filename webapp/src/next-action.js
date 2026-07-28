import { getCurrentTripDay } from "./day-view.js";

function safeText(value, fallback = "") {
  const text = String(value == null || value === "" ? fallback : value).trim();
  return text || fallback;
}

function commandLine(command, webButton, reason) {
  return `- ${command} / 웹: ${webButton} - ${reason}`;
}

export function buildNextAction(plan, now = new Date()) {
  const current = getCurrentTripDay(plan, now);
  const hour = now.getHours();
  const destination = safeText(plan.destination, "여행지");
  const lines = [
    `플랜 #${plan.id} ${destination} 다음 액션`,
    `${safeText(plan.startDate, "날짜 미정")} ~ ${safeText(plan.endDate, "날짜 미정")} / ${safeText(plan.companions, "동행 미정")} / ${Math.max(1, Number(plan.travelers) || 1)}명`,
    "",
    `현재 상태: ${current.label}`,
    "",
  ];

  if (current.status === "before") {
    lines.push(
      "추천: 출발 준비를 먼저 잠그세요.",
      commandLine("/departure", "출발 브리핑", "출발 전 이동/예약/준비 흐름을 한 번에 확인"),
      commandLine("/checklist", "체크리스트", "빠뜨리기 쉬운 준비물과 예약 확인"),
      commandLine("/packing", "짐싸기", "날씨와 일정 기준 짐 목록 확인"),
      commandLine("/calendar", "캘린더 다운로드", "일정을 캘린더 앱 또는 Google Calendar에 넣기"),
      "",
      "작은 팁: 출발 전에는 새 기능보다 누락 방지가 이깁니다. 체크리스트를 먼저 닫고 세부 일정은 그 다음에 다듬는 편이 안전합니다."
    );
    return lines.join("\n");
  }

  if (current.status === "after") {
    lines.push(
      "추천: 회고와 최종 정산을 마무리하세요.",
      commandLine("/recap", "여행 회고", "총지출/일정/메모를 한 번에 정리"),
      commandLine("/settlemessage", "요청문", "동행 채팅방에 붙여넣을 정산 요청문 만들기"),
      commandLine("/expenses_export", "CSV 다운로드", "지출 기록을 파일로 보관"),
      commandLine("/backup", "전체 백업", "내 Discord 플랜 JSON 백업"),
      "",
      "작은 팁: 결제자 이름이 비어 있으면 `/expense_edit paid_by:이름`으로 먼저 보강한 뒤 정산 요청문을 보내는 게 깔끔합니다."
    );
    return lines.join("\n");
  }

  lines.push(`추천: 오늘은 여행 ${current.day}일차입니다.`);
  if (hour < 11) {
    lines.push(
      commandLine("/brief", "오늘 브리핑", "오늘 동선과 하루 예산을 같이 확인"),
      commandLine("/todaycheck", "오늘 점검", "나가기 전 준비/예약/비상 체크"),
      commandLine("/maps", "지도 열기", "목적지 지도 링크 빠르게 열기"),
      commandLine("/dailybudget", "오늘 예산", "오늘 쓸 수 있는 예산 감각 잡기"),
      "",
      "작은 팁: 아침에는 `/todaycheck`를 먼저 보고, 이동 중에는 `/brief`만 다시 보면 충분합니다."
    );
    return lines.join("\n");
  }

  if (hour < 18) {
    lines.push(
      commandLine("/today", "오늘 일정", "현재 일차 일정만 짧게 보기"),
      commandLine("/dayshare", "오늘 공유", "동행에게 보낼 오늘 요약 만들기"),
      commandLine("/expense", "지출 저장", "방금 쓴 돈을 잊기 전에 기록"),
      commandLine("/spending", "예산 소진", "전체 예산 흐름 점검"),
      "",
      "작은 팁: 낮에는 완벽한 정리보다 즉시 기록이 더 중요합니다. 택시/식비만 바로 적어도 밤 정산이 훨씬 쉬워집니다."
    );
    return lines.join("\n");
  }

  lines.push(
    commandLine("/nightcheck", "밤 점검", "오늘 지출 누락과 내일 준비 확인"),
    commandLine("/tomorrow", "내일 브리핑", "내일 동선/예산을 자기 전에 정리"),
    commandLine("/expenses", "내역 보기", "결제자별 지출 감각 확인"),
    commandLine("/settletransfers", "정산 송금표", "필요하면 중간 정산 방향 확인"),
    "",
    "작은 팁: 밤에는 새 일정을 크게 바꾸기보다 내일 첫 이동과 결제 누락만 잡아도 여행 피로가 확 줄어듭니다."
  );

  return lines.join("\n");
}
