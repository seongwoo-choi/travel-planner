# Replan Review

## Request boundary

- [ ] target date/timezone, trigger, locked commitment를 replan request에서 직접 읽었다.
- [ ] 기존 plan/report에서 가져온 사실을 evidence 또는 이번 사용자 입력으로 다시 확인했다.
- [ ] 확정 여부를 알 수 없는 기존 예약을 locked commitment로 자동 취급하지 않았다.

## Replacement itinerary

- [ ] 변경된 각 활동은 현재 evidence의 영업시간·이동시간·날씨 조건을 통과했다.
- [ ] locked commitment, arrival/departure 가용 시간, 시간 겹침, 기준지 복귀를 다시 확인했다.
- [ ] 대체 장소가 없으면 빈 일정을 그럴듯하게 채우지 않고 `needs_review` 또는 `conflict`로 표시했다.

## Output

- [ ] `replan.json`과 `replan.md`에 trigger, evidence source/fetchedAt, 유지·교체·삭제 항목, 확인 작업을 기록했다.
- [ ] 사용자에게 기존 일정 대비 바뀐 항목과 유지해야 할 예약을 표시했다.
