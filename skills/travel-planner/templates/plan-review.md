# Plan Review

## Input and evidence

- [ ] requirements JSON을 읽고 [Requirements Contract](../references/requirements-contract.md)의 필수값을 확인했다.
- [ ] evidence JSON을 읽고 [Evidence Contract](../references/evidence-contract.md)의 status, source, freshness를 확인했다.
- [ ] 만료·미래·malformed snapshot, credential-bearing URL, `unavailable` payload를 사실이나 확정 일정 근거로 쓰지 않았다.

## Itinerary

- [ ] 각 활동의 날짜별 verified 영업시간, 체류시간, 이동시간, 도착·출발 가용 시간을 직접 확인했다.
- [ ] 누락된 이동시간을 0분으로 처리하지 않았고, 시간 겹침과 기준지 복귀 제약을 확인했다.
- [ ] `ready`, `needs_review`, `conflict` 중 상태를 정했고 확인 작업을 표시했다.

## Artifacts and approval

- [ ] `plan.json`과 `travel_plan.md`를 다시 읽어 내용과 상태가 일치하는지 확인했다.
- [ ] HTML/PDF가 있으면 실제 생성·검증 결과만 보고했고, PDF renderer 실패는 숨기지 않았다.
- [ ] 예약·결제·외부 변경은 명시적 승인 전에는 실행하지 않았다.
