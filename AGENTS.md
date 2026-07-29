# Travel Planner

Claude Code와 Codex에서 동일하게 동작하는 portable 여행 계획 하네스다.

## Routing

- 여행 계획, 여행지 추천, 일정, 맛집 동선, 교통 연결, 여행 보고서 요청에는 `skills/travel-planner/SKILL.md`를 읽고 따른다.
- 단순 지식 질문은 skill workflow를 실행하지 않고 직접 답한다.
- `.claude/skills/travel-planner/SKILL.md`와 `.agents/skills/travel-planner/SKILL.md`는 adapter이며 canonical 규칙은 `skills/travel-planner/SKILL.md` 한 곳에만 둔다.

## Invariants

- 장소·영업시간·날씨·이동시간은 provenance가 있는 evidence만 사용한다.
- requirements·evidence·plan·report 계약을 직접 읽어 검증하고 상태와 확인 작업을 표시하지 않은 보고서를 완료로 간주하지 않는다.
- 예약·결제·외부 mutation은 사용자 승인 전에 실행하지 않는다.
- `_workspace/**`는 실행 artifact이며 다른 여행의 파일을 사실 source로 재사용하지 않는다.
