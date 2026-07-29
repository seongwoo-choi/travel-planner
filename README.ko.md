<div align="center">

# Travel Planner

**Claude Code와 Codex를 위한 evidence 기반 여행 일정 플래너**

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

[![verify](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml/badge.svg)](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-D97757)
![Codex](https://img.shields.io/badge/Codex-compatible-111827)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

Travel Planner는 자연어 여행 요청을 evidence 기반의 여러 날 일정으로 바꿉니다. Claude Code와 Codex가 하나의 workflow, evidence 계약, deterministic scheduler, fail-closed 검증, portable report를 공유합니다.

> LLM은 장소, 영업시간, 날씨, 이동시간의 사실 source가 아닙니다. agent가 evidence를 수집하고 core가 검증·일정 배치를 수행합니다.

## 왜 Travel Planner인가

그럴듯한 여행 일정은 위험한 가정을 숨기기 쉽습니다. 누락된 이동시간을 0분으로 처리하거나, 모르는 영업시간을 종일 영업으로 바꾸거나, 아직 발표되지 않은 예보를 사실처럼 쓰는 문제입니다. Travel Planner는 불확실성을 숨기지 않고 확인 작업으로 남깁니다.

| 대신 | Travel Planner가 하는 일 |
| --- | --- |
| 사실을 추정 | 출처·수집시각·만료시각이 있는 evidence 요구 |
| 누락된 이동시간을 0분 처리 | 해당 경로를 배치 불가로 처리 |
| 알 수 없는 장소를 실내로 단정 | `indoor: true`의 양성 evidence 요구 |
| 불확실성을 숨김 | 확인 작업이 있는 `needs_review` 생성 |
| agent가 자율 예약 | 외부 변경 전 명시적 승인 요구 |

## 설치

### plugin으로 설치

두 runtime에 같은 Git marketplace를 설치한 뒤 새 세션을 시작합니다.

```bash
# Claude Code
claude plugin marketplace add seongwoo-choi/travel-planner
claude plugin install travel-planner@travel-planner

# Codex
codex plugin marketplace add seongwoo-choi/travel-planner
codex plugin add travel-planner@travel-planner
```

plugin에는 canonical skill과 JavaScript core가 포함됩니다. global planner package, skill 복사, runtime별 구현이 필요하지 않습니다.

### 설치된 plugin 갱신

```bash
# Claude Code
claude plugin update travel-planner@travel-planner

# Codex
codex plugin marketplace upgrade travel-planner
codex plugin remove travel-planner@travel-planner
codex plugin add travel-planner@travel-planner
```

### source에서 실행

```bash
git clone https://github.com/seongwoo-choi/travel-planner.git
cd travel-planner
npm ci
```

Node.js 22 이상과 Claude Code 2.x 또는 Codex CLI가 필요합니다. PDF 산출에는 Google Chrome, Chromium 또는 `CHROME_BIN`도 필요합니다.

## 여행 계획 만들기

Claude Code나 Codex에 자연어로 요청합니다.

```text
2명이 다낭에서 보내는 3박 4일 여행 계획을 만들어줘.
인천에서 출발하고 미케 비치 근처에 머물 예정이야.
여유로운 일정과 야경을 선호해.
```

agent는 evidence를 수집하고 trip workspace를 작성·검증한 뒤 일정과 report를 만듭니다. 예약은 수행하지 않습니다.

## deterministic pipeline 직접 실행

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

`npm run report`는 PDF export 전에 Markdown과 자체완결 HTML을 작성합니다. Chrome을 찾지 못하면 PDF를 꾸며내지 않고 실패 원인을 보고합니다.

## agent가 증명해야 하는 흐름

```text
자연어 요청
    ↓
requirements.json + evidence.json
    ↓
validate → deterministic plan → report
    ↓
plan.json + Markdown + HTML + PDF (Chrome 사용 가능 시)
```

canonical workflow는 [`skills/travel-planner/SKILL.md`](skills/travel-planner/SKILL.md)입니다. Claude Code와 Codex adapter는 이 단일 source를 가리키며 runtime별 별도 planner logic은 없습니다.

[evidence 계약](skills/travel-planner/references/evidence-contract.md)과 [report 계약](skills/travel-planner/references/report-contract.md)을 참고하세요.

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
  03_report/
    travel_plan.md
    travel_plan.html
    travel_plan.pdf
```

Evidence snapshot과 `plan.json`이 source of truth입니다. Markdown, HTML, PDF는 파생 산출물입니다. 설치된 plugin cache는 distribution 전용이며 여행 artifact를 작성하면 안 됩니다.

## Plan 상태

| 상태 | 의미 |
| --- | --- |
| `ready` | 현재 evidence가 검증을 통과했습니다. 예약 완료를 의미하지 않습니다. |
| `needs_review` | 일정은 쓸 수 있지만 날씨, 교통, coverage 또는 다른 evidence를 확인해야 합니다. |
| `conflict` | hard constraint를 위반했습니다. 완료된 일정으로 취급하면 안 됩니다. |

## Offline 예제

[`examples/danang/`](examples/danang/)은 pipeline 실행용 3박 4일 fixture입니다. 실제 여행 정보가 아닌 test data입니다. 날씨는 `forecast_horizon`, 항공편은 `unavailable`이므로 기대 상태는 `needs_review`입니다.

```bash
npm run dogfood:offline
```

## 명령

| 명령 | 용도 |
| --- | --- |
| `npm test` | contract, regression, integration, bounded-search 테스트 |
| `npm run validate` | plan을 쓰지 않고 requirements와 evidence 검증 |
| `npm run plan` | evidence에서 structured JSON과 Markdown 생성 |
| `npm run report` | Chrome 사용 가능 시 Markdown, HTML, PDF 산출 |
| `npm run bench` | 50개 장소, 31일 bounded benchmark 실행 |
| `npm run dogfood:offline` | offline 다낭 acceptance fixture 실행 |

## 안전 범위

- 배치 날짜의 영업시간이 검증된 장소만 일정 후보가 됩니다.
- 누락된 경로 evidence는 0분 경로가 되지 않습니다.
- evidence에는 허용된 status, 수집 시각, 만료 시각이 필요합니다.
- forecast horizon과 provider 실패는 서로 다른 상태입니다.
- search는 bounded·approximate이며 전역 최적해라고 주장하지 않습니다.
- core는 교통, 숙소, 식당, 활동을 예약하지 않습니다.
- 예약·결제·외부 변경 전에는 대상·조건·행위를 보여주고 명시적 승인을 받아야 합니다.

credential, signed URL, 예약번호, 여행자 데이터, 생성된 개인 여행 report를 commit하지 마세요.

## 프로젝트 구조

```text
skills/travel-planner/          Canonical workflow와 계약
.claude/skills/travel-planner/  Claude Code adapter
.agents/skills/travel-planner/  Codex adapter
.claude-plugin/                 공통 marketplace와 plugin manifest
scripts/                        Validate, plan, report CLI
src/planner/                    Evidence lifecycle과 scheduler
src/report-exporter.js          Escaped HTML과 PDF export
test/                           Contract와 regression test
examples/danang/                Offline acceptance fixture
```

## 개발

```bash
npm ci
npm test
npm run bench
npm run dogfood:offline
npm audit --audit-level=moderate
```

GitHub Actions는 test, benchmark, audit, strict plugin validation, Claude Code/Codex marketplace install을 검증합니다.

## 기여

범위가 분명한 issue와 pull request를 환영합니다. 다음을 포함해 주세요.

1. 사용자가 보는 문제
2. 최소 재현 또는 fixture
3. regression 또는 behavior test
4. 실행한 검증 명령

변경은 surgical하게 유지하고, 무관한 cleanup을 behavior change에 섞지 마세요.

## 라이선스

[MIT License](LICENSE)를 적용합니다.
