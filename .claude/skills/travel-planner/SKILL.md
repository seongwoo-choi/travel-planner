---
name: travel-planner
description: "실제 장소·날씨·이동시간 근거로 여행 일정과 보고서를 만드는 portable travel planner. 여행 계획, 일정, 코스, 맛집 동선, 교통 연결 요청에 사용."
---

# Claude Code Adapter

이 파일은 canonical skill이 아니다. 여행 계획 reasoning이나 tool 호출 전에 현재 repository root의 `skills/travel-planner/SKILL.md`를 Read하고, 그 파일과 연결된 `references/`, `templates/`를 따른다. `~/.claude/skills/...`를 canonical 경로로 사용하지 않는다.

Claude 전용 team API는 필수가 아니며, 독립적인 read-only evidence 조사는 가능한 경우에만 병렬화한다.
