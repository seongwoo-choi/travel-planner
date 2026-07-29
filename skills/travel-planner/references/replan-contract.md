# Replan Contract

`_workspace/04_replan/replan-request.json`은 비, 지연, 휴무, 피로 또는 사용자 선호 변경으로 특정 날짜 일정을 다시 만들 때만 사용한다.

## Input

- `schemaVersion`: `1`
- `target.date`: 다시 계획할 `YYYY-MM-DD`
- `target.timezone`: IANA timezone
- `target.currentTime`, `target.currentLocation`: 당일 재계획이면 알려진 값만 기록
- `trigger`: `weather|delay|closure|fatigue|preference|other`
- `lockedCommitments`: 사용자가 확정·보존하라고 한 약속만 기록. 각 항목은 `title`, `startAt`, `endAt`을 가진다.
- `keepPreferences`, `avoid`, `notes`: 사용자가 제공한 요구만 기록

`lockedCommitments`에 기존 plan에서 추출한 예약·운영시간·이동시간을 자동으로 넣지 않는다. 확정 여부를 알 수 없으면 사용자에게 확인하거나 `needs_review`로 남긴다.

## Fact boundary

기존 일정 artifact는 사실 근거가 아니다. 기존 `plan.json`과 report는 사용자가 유지하고 싶은 활동, 변경 비교, 삭제 대상의 후보를 파악하는 데만 읽는다. 장소 영업시간, 날씨, 이동시간, 예약 상태는 현재 evidence 또는 사용자가 이번 replan request에서 명시한 값으로 다시 확인한다.

## Output

`_workspace/04_replan/replan.json`과 `replan.md`에는 다음을 기록한다.

- `status`: `ready|needs_review|conflict`
- trigger와 적용한 현재 evidence의 source/fetchedAt
- 유지한 locked commitment와 교체·삭제한 활동
- 재구성한 시간대별 일정과 각 활동의 evidence reference
- 대체안이 적용된 이유와 확인 작업

`ready`는 locked commitment를 포함한 새 일정의 모든 활동이 현재 evidence를 통과했을 때만 사용한다. 대체 장소가 없거나 locked commitment와 충돌하면 일정을 꾸며내지 말고 `needs_review` 또는 `conflict`로 끝낸다.
