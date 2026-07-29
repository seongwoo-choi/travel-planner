<div align="center">

# Travel Planner

Claude Code와 Codex를 위한 evidence 기반 여행 일정 플래너

[English](README.md) | [한국어](README.ko.md)

![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-D97757)
![Codex](https://img.shields.io/badge/Codex-compatible-111827)
![Status](https://img.shields.io/badge/status-experimental-orange)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

Travel Planner는 명시적인 evidence에서 여러 날의 여행 일정을 만드는 portable agent harness입니다. Claude Code와 Codex가 같은 workflow, evidence 계약, deterministic scheduler, validator, report exporter를 사용합니다.

LLM은 장소, 영업시간, 날씨, 이동시간의 사실 source가 아닙니다. agent가 evidence를 수집하고 core가 이를 검증해 일정에 배치합니다.

## 만든 이유

여행 계획은 보기에는 그럴듯하지만 약한 가정을 숨기기 쉽습니다. 누락된 이동시간을 0분으로 처리하거나, 모르는 영업시간을 종일 영업으로 바꾸거나, 아직 발표되지 않은 미래 날씨를 확정된 예보처럼 쓰는 식입니다. 이 프로젝트는 그런 미확인 항목을 숨기지 않습니다.

제공하는 기능:

- Claude Code와 Codex가 공유하는 단일 canonical workflow
- provider에 종속되지 않는 JSON evidence 계약
- deterministic bounded itinerary search
- 누락, unknown, malformed, stale, expired evidence의 fail-closed 검증
- Markdown, 자체완결 HTML, PDF 보고서
- 예약, 결제, 외부 변경 전 명시적인 승인 경계

## 동작 방식

```text
자연어 여행 요청
       |
       v
skills/travel-planner/SKILL.md
       |
       v
requirements.json + evidence.json
       |
       v
검증 -> deterministic plan -> Markdown
       |
       v
travel_plan.md + travel_plan.html + travel_plan.pdf
```

Claude Code는 `.claude/skills/travel-planner/SKILL.md`, Codex는 `.agents/skills/travel-planner/SKILL.md`를 읽습니다. 두 adapter 모두 유일한 canonical workflow인 `skills/travel-planner/SKILL.md`를 가리킵니다.

## 안전 모델

core는 다음 규칙을 적용합니다.

- 장소는 배치 날짜의 영업시간이 검증됐을 때만 일정 후보가 됩니다.
- 누락된 이동시간 evidence를 0분으로 처리하지 않습니다.
- `outdoor: false`만으로 실내 장소라고 판단하지 않습니다.
- unavailable evidence로 `ready` 상태를 만들 수 없습니다.
- evidence snapshot에는 허용된 status, 수집 시각, 만료 시각이 필요합니다.
- forecast horizon과 provider 실패를 다른 상태로 처리합니다.
- bounded search 결과를 전역 최적해라고 주장하지 않습니다.
- 예약과 결제는 별도의 명시적 사용자 승인이 필요합니다.

자세한 내용은 [evidence 계약](skills/travel-planner/references/evidence-contract.md)과 [report 계약](skills/travel-planner/references/report-contract.md)을 참고하세요.

## 요구 사항

- Node.js 22 이상
- Claude Code 2.x 또는 Codex CLI
- PDF 산출용 Google Chrome, Chromium 또는 `CHROME_BIN`

core에는 runtime npm dependency가 없습니다. provider credential도 필수가 아닙니다. agent runtime에서 사용할 수 있는 web 또는 map 도구로 evidence를 수집할 수 있습니다.

## plugin으로 설치

두 runtime에서 같은 Git marketplace를 설치한 뒤 새 세션을 시작합니다.

```bash
# Claude Code
claude plugin marketplace add seongwoo-choi/travel-planner
claude plugin install travel-planner@travel-planner

# Codex
codex plugin marketplace add seongwoo-choi/travel-planner
codex plugin add travel-planner@travel-planner
```

plugin에는 canonical skill과 JavaScript core가 함께 포함됩니다. skill을 복사하거나 runtime별 planner를 유지하거나 global npm package를 설치할 필요가 없습니다. 자연어로 여행을 요청하면 agent가 trip workspace를 만들고 bundled validation, planning, report command를 실행합니다.

## source에서 실행

```bash
git clone https://github.com/seongwoo-choi/travel-planner.git
cd travel-planner
npm install
```

## 빠른 시작

Claude Code나 Codex에 자연어로 요청합니다.

```text
2명이 다낭에서 보내는 3박 4일 여행 계획을 만들어줘.
인천에서 출발하고 미케 비치 근처에 머물 예정이야.
여유로운 일정과 야경을 선호해.
```

agent는 canonical skill에 따라 workspace artifact를 작성하고, evidence를 검증하고, 일정과 보고서를 생성합니다.

deterministic pipeline을 직접 실행할 수도 있습니다.

```bash
npm run validate -- \
  --requirements=examples/danang/requirements.json \
  --evidence=examples/danang/evidence.json

npm run plan -- \
  --requirements=examples/danang/requirements.json \
  --evidence=examples/danang/evidence.json \
  --output-dir=_workspace/02_plan

npm run report -- \
  --requirements=examples/danang/requirements.json \
  --markdown=_workspace/02_plan/travel_plan.md \
  --output-dir=_workspace/03_report
```

## Workspace 계약

```text
_workspace/
  00_input/
    requirements.json
  01_evidence/
    evidence.json
  02_plan/
    plan.json
    travel_plan.md

trips/{국가}/{목적지}/
  travel_plan.md
  travel_plan.html
  travel_plan.pdf
```

`plan.json`과 evidence snapshot이 source of truth입니다. Markdown, HTML, PDF는 파생 산출물입니다.

## Plan 상태

| 상태 | 의미 |
| --- | --- |
| `ready` | 현재 evidence가 검증을 통과했습니다. 예약 완료를 의미하지 않습니다. |
| `needs_review` | 일정은 사용할 수 있지만 날씨, 교통, coverage 또는 다른 evidence를 확인해야 합니다. |
| `conflict` | hard constraint 위반이 있어 완료된 일정으로 취급할 수 없습니다. |

## 명령

| 명령 | 용도 |
| --- | --- |
| `npm test` | contract, regression, integration, bounded-search 테스트 실행 |
| `npm run validate` | plan artifact를 쓰지 않고 requirements와 evidence 검증 |
| `npm run plan` | evidence에서 structured JSON과 Markdown 생성 |
| `npm run report` | Markdown, 자체완결 HTML, PDF 산출 |
| `npm run bench` | 장소 50개, 31일 bounded-search benchmark 실행 |
| `npm run dogfood:offline` | 다낭 fixture의 plan과 HTML report 생성 검증 |

## Offline dogfood

`examples/danang/`에는 portable pipeline을 검증하는 다낭 3박 4일 fixture가 있습니다. 테스트 데이터이며 실제 여행 정보가 아닙니다. 날씨는 `forecast_horizon`, 항공편은 `unavailable` 상태이므로 기대 상태는 `needs_review`입니다.

## 프로젝트 구조

```text
skills/travel-planner/          Canonical workflow와 계약
.claude/skills/travel-planner/  Claude Code adapter
.agents/skills/travel-planner/  Codex adapter
scripts/                        Validate, plan, report CLI
src/planner/                    Evidence lifecycle과 scheduler
src/harness-*.js                입력 정규화와 artifact runner
src/report-exporter.js          Escaped HTML과 PDF 산출
test/                           Contract와 regression 테스트
examples/danang/                Offline acceptance fixture
```

## 제한 사항

- evidence 품질은 agent가 접근할 수 있는 원본 source와 도구에 좌우됩니다.
- 실제 항공 운항, 좌석, 가격, 취소 조건은 별도 확인이 필요합니다.
- provider forecast horizon 밖 날짜는 갱신 시점까지 `needs_review`입니다.
- core는 교통, 숙소, 식당, 관광 상품을 예약하지 않습니다.
- 예측 가능한 실행시간을 위해 search를 제한하므로 전역 최적해를 보장하지 않습니다.

## 개발

```bash
npm test
npm run bench
npm run dogfood:offline
npm audit --audit-level=moderate
```

요청에 직접 연결된 범위만 변경하세요. 새 동작에는 테스트가 필요하고 bug fix에는 regression guard가 필요합니다. credential, 생성된 여행 보고서, 개인 workspace data를 commit하지 마세요.

## 기여

issue와 범위가 명확한 pull request를 받습니다. 다음 내용을 포함해 주세요.

- 사용자가 겪는 문제
- 최소 재현 또는 fixture
- 변경 동작을 검증하는 테스트
- 실제로 실행한 검증 명령

기능 변경과 무관한 대규모 cleanup을 같은 pull request에 섞지 마세요.

## 보안

credential이나 개인 여행 정보를 public issue에 올리지 마세요. 재현 자료에서 API key, token, signed query parameter, 예약번호, 여행자 정보를 제거해야 합니다.

프로젝트는 CLI 경계에서 credential이 포함된 `source`와 `sourceUrl`을 거부하고, HTML을 만들기 전에 report 문자열을 escape합니다.

## 라이선스

[MIT License](LICENSE)를 적용합니다.
