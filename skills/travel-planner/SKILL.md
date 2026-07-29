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

### 3. 검증 및 일정 생성

공통 진입점은 `scripts/plan-from-evidence.js`와 `scripts/validate-workspace.js`다.

```bash
npm run validate -- \
  --requirements=_workspace/00_input/requirements.json \
  --evidence=_workspace/01_evidence/evidence.json

npm run plan -- \
  --requirements=_workspace/00_input/requirements.json \
  --evidence=_workspace/01_evidence/evidence.json \
  --output-dir=_workspace/02_plan
```

- `conflict`: hard constraint를 고치기 전 보고서를 확정하지 않는다.
- `needs_review`: 일정과 미확인 항목을 함께 제공한다.
- `ready`: 현재 evidence 기준으로 자동 검증을 통과했다는 뜻이며 예약 완료를 의미하지 않는다.

### 4. 보고서 생성

```bash
npm run report -- \
  --requirements=_workspace/00_input/requirements.json \
  --markdown=_workspace/02_plan/travel_plan.md
```

`trips/{국가}/{도시}/travel_plan.md`, `.html`, `.pdf` 3종을 생성한다. Chrome을 찾지 못하면 PDF를 꾸며내지 말고 실패 원인을 보고한다. 구조는 `references/report-contract.md`를 따른다.

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
