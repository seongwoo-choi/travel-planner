---
name: travel-planner
description: "실제 장소·영업시간·날씨·이동시간 근거로 국내외 여행 일정을 만들고 검증하는 portable harness. 여행 계획, 일정, 코스, 맛집 동선, 교통 연결, 여행 보고서 요청에 사용."
---

# Travel Planner

Claude Code와 Codex에서 동일하게 실행하는 여행 계획 workflow다. agent runtime의 팀·메시지 API에 의존하지 않는다.

## 불변식

1. 장소·영업시간·날씨·이동시간은 source, 수집 시각, 유효기한이 있는 만료 전 evidence만 사실로 사용한다.
2. `openingHoursStatus: verified`와 해당 날짜 영업시간이 모두 있어야 일정에 배치한다.
3. 누락된 이동시간을 0분으로 간주하지 않는다.
4. forecast horizon 밖 날짜와 provider 실패를 구분한다.
5. bounded search 결과를 전역 최적해라고 주장하지 않는다.
6. 미확인 값은 추정하지 않고 `needs_review`와 확인 작업으로 남긴다.
7. 예약·결제·외부 mutation은 정확한 대상과 조건을 보여준 뒤 명시적 승인을 받는다.

## Workflow

### 1. 요구사항 수집

이미 제공된 값은 다시 묻지 않는다. 최소 필수값은 목적지, 시작일, 종료일 또는 숙박 수, 인원이다. 출발지, 예산, 동행 유형, 선호, 숙소, 주요 교통, 도착·출발 시각은 제공된 범위만 기록한다.

`templates/requirements.json`을 복사해 `_workspace/00_input/requirements.json`에 저장한다.

### 2. Evidence 수집

날씨·장소·이동은 독립적인 read-only 작업이므로 runtime이 지원하면 병렬 조사한다. 특정 subagent API는 필수가 아니다.

- 장소: 공식 사이트·지도 등 원본에 가까운 source, 좌표, 방문시간, 날짜별 영업시간
- 날씨: 날짜별 예보와 timezone; 예보 범위 밖이면 `forecast_horizon`
- 이동: 기준지↔장소와 장소↔장소 matrix; 주요 교통은 현지 이동과 분리
- 실내 여부: 양성 근거가 있을 때만 `indoor: true`; `outdoor: false`만으로 실내라고 단정하지 않는다.

`references/evidence-contract.md`를 따르고 `_workspace/01_evidence/evidence.json`에 저장한다. `generatedAt`과 각 snapshot의 `fetchedAt`, `expiresAt`을 ISO timestamp로 기록한다. 출처 URL에 credential, token, signature를 넣지 않는다.

### 3. 직접 검증 및 일정 생성

plugin cache는 read-only distribution이며 여행 artifact를 쓰는 위치가 아니다. 사용자가 선택한 workspace에 아래 파일을 직접 읽고 작성한다.

1. `_workspace/00_input/requirements.json`과 `_workspace/01_evidence/evidence.json`을 실제로 읽고 JSON parse 오류를 먼저 확인한다.
2. [Evidence Contract](references/evidence-contract.md)의 필수 field, timestamp 순서·만료, snapshot status, 공개 source URL 조건을 현재 시각 기준으로 직접 검증한다. `generatedAt`은 provenance일 뿐 freshness clock으로 사용하지 않는다.
3. 장소는 해당 날짜의 `openingHoursStatus: verified`와 영업시간이 있고, 필요한 이동시간이 측정된 경우에만 배치한다. 누락된 이동시간을 0분으로 추정하지 않는다. `unavailable` snapshot의 payload는 사용하지 않는다.
4. 각 날짜에 도착·출발 시각, 영업시간, 체류시간, 장소 간 이동시간, 식사·휴식 시간을 적용한다. 활동의 시간 겹침과 기준지 복귀 제약을 직접 점검한다.
5. `_workspace/02_plan/plan.json`에 requirements, 사용한 evidence source와 fetchedAt, 상태, 일별 활동, 이동시간, 확인 작업을 구조화해 작성한다. `_workspace/02_plan/travel_plan.md`에는 같은 내용을 사람이 읽을 수 있게 작성한다.
6. 작성한 두 artifact를 다시 읽어 JSON parse, 날짜·시간 일관성, evidence source, 상태와 확인 작업의 존재를 확인한다.

- `conflict`: hard constraint를 고치기 전 보고서를 확정하지 않는다.
- `needs_review`: 일정과 미확인 항목을 함께 제공한다.
- `ready`: 위 직접 검증을 통과한 현재 evidence 기준 상태일 뿐 예약 완료를 의미하지 않는다.

### 4. 보고서 생성

[Report Contract](references/report-contract.md)를 따라 `_workspace/03_report/travel_plan.md`와 `.html`을 실제 파일로 작성하고, 파일을 다시 읽어 내용이 비어 있지 않은지 확인한다. HTML에는 evidence나 사용자 입력을 raw HTML로 삽입하지 말고 escape한다.

PDF가 필요하면 headless Chrome 등 실제 renderer를 실행해 `_workspace/03_report/travel_plan.pdf`를 생성한 뒤, 파일 존재·크기·`%PDF` header를 확인한다. renderer가 없거나 실패하면 PDF를 꾸며내지 말고 HTML까지의 결과와 실패 원인을 보고한다. 세 파일이 모두 실제로 검증된 경우에만 3종 산출 완료라고 말한다.

### 5. 부분 재실행

사용자가 날씨·장소·교통 중 일부만 갱신해 달라고 하면 해당 evidence snapshot만 교체하고 검증·계획·보고서 단계를 다시 실행한다. 기존 artifact를 사실 source로 삼지 않는다.

### 6. 예약

조사와 실행을 분리한다. 예약 실행 직전에 편명/시설, 날짜·시각, 인원, 가격, 취소 조건, 수행할 외부 변경을 제시하고 승인을 받는다. 결제정보나 credential은 파일에 저장하지 않는다.

## 완료 조건

- requirements와 evidence JSON이 parse된다.
- plan validator가 실행됐다.
- plan status와 확인 작업을 사용자에게 표시했다.
- Markdown/HTML/PDF가 실제 생성·검증됐다.
- source가 없는 사실, 가짜 가격·영업시간·이동시간이 없다.
