# Report Contract

보고서는 structured plan과 evidence를 설명하는 산출물이며 새로운 사실 source가 아니다.

필수 구성:

1. 여행 개요: 기간, 인원, 동행, 선호, 숙소 입력, 예산 입력
2. 상태: `ready|needs_review|conflict`
3. 일별 일정: 시간, 장소, 체류시간, 이동시간, 해당 날짜 영업시간
4. 주요/현지 교통 분리
5. 날짜별 날씨와 forecast horizon
6. 예약·확인 필요 항목
7. 자동 품질 점검과 evidence source/fetchedAt
8. 우천 대안: 검증된 실내 장소만 표시하고 없으면 `미수집`

표현 규칙:

- 가격 data가 없으면 `미수집`; 통화나 금액을 추정하지 않는다.
- 숙소 입력은 예약 완료라고 표현하지 않는다.
- 미확인 주요 교통 duration을 확정값처럼 표시하지 않는다.
- 이동 evidence가 일부라도 없으면 일별 합계를 `미측정`으로 표시한다.
- `ready`는 예약·운항·날씨가 미래에도 유지된다는 보장이 아니다.

산출물:

- `travel_plan.md`: 기본 산출물인 source Markdown
- `travel_plan.html`: 사용 가능한 도구로 실제 생성·재검증했을 때의 self-contained UTF-8 HTML
- `travel_plan.pdf`: HTML을 실제 renderer로 변환하고 파일을 검사했을 때만 제공하는 PDF

Markdown은 항상 실제 파일로 작성·재검증한다. HTML/PDF는 runtime에 renderer가 있고 실제 생성·검증했을 때만 추가한다. renderer 실패나 미설치는 PDF 완료로 표현하지 않는다.
