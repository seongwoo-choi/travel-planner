<div align="center">

# Travel Planner

**Claude Code와 Codex를 위한 근거 기반 여행 일정 플래너**

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

[![verify](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml/badge.svg)](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-D97757)
![Codex](https://img.shields.io/badge/Codex-compatible-111827)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

Travel Planner는 자연어 여행 요청을 확인 가능한 근거에 바탕을 둔 여러 날의 일정으로 바꿉니다. Claude Code와 Codex는 같은 작업 절차, 근거 데이터 형식, 일정 계산기, 검증 규칙, 보고서 생성기를 사용합니다.

> LLM은 장소, 영업시간, 날씨, 이동시간을 사실로 판단하는 근거가 아닙니다. 에이전트가 근거 데이터를 모으고, 핵심 엔진이 이를 검증해 일정에 반영합니다.

## 왜 Travel Planner인가

보기 좋은 여행 일정표도 위험한 가정을 숨기기 쉽습니다. 이동시간이 없으면 0분으로 처리하고, 영업시간을 모르면 종일 영업으로 간주하고, 아직 나온 적 없는 예보를 사실처럼 적는 식입니다. Travel Planner는 이런 불확실성을 감추지 않고 확인할 항목으로 남깁니다.

| 대신 | Travel Planner가 하는 일 |
| --- | --- |
| 사실을 추정 | 출처·수집 시각·만료 시각이 있는 근거 데이터 요구 |
| 누락된 이동시간을 0분 처리 | 해당 경로를 배치 불가로 처리 |
| 알 수 없는 장소를 실내로 단정 | `indoor: true`를 뒷받침하는 근거 데이터 요구 |
| 불확실성을 숨김 | 확인할 항목이 담긴 `needs_review` 생성 |
| 에이전트가 자율 예약 | 외부 변경 전 명시적 승인 요구 |

## 설치

> **현재 접근 조건:** 이 저장소는 private 상태입니다. 아래 명령을 실행하려면 GitHub 인증과 저장소 접근 권한이 필요합니다. 접근 권한이 없는 사용자에게 이 설치 방법을 공유하려면 먼저 저장소를 public으로 전환해야 합니다.

### plugin으로 설치

두 실행 환경에 같은 Git marketplace를 설치한 뒤 새 세션을 시작합니다.

```bash
# Claude Code
claude plugin marketplace add seongwoo-choi/travel-planner
claude plugin install travel-planner@travel-planner

# Codex
codex plugin marketplace add seongwoo-choi/travel-planner
codex plugin add travel-planner@travel-planner
```

plugin에는 기준이 되는 skill과 JavaScript core가 함께 들어 있습니다. 전역 planner package를 설치하거나 skill을 복사하거나 실행 환경별 구현을 따로 유지할 필요가 없습니다.

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

Node.js 22 이상과 Claude Code 2.x 또는 Codex CLI가 필요합니다. PDF를 만들려면 Google Chrome, Chromium 또는 `CHROME_BIN`도 필요합니다.

## 여행 계획 만들기

Claude Code나 Codex에 자연어로 요청합니다.

```text
2명이 다낭에서 보내는 3박 4일 여행 계획을 만들어줘.
인천에서 출발하고 미케 비치 근처에 머물 예정이야.
여유로운 일정과 야경을 선호해.
```

에이전트는 근거 데이터를 수집하고 여행 작업 폴더를 만든 뒤 검증을 거쳐 일정과 보고서를 생성합니다. 예약은 수행하지 않습니다.

## 일정 계산을 직접 실행하기

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

## 동작 흐름

```text
자연어 요청
    ↓
requirements.json + evidence.json
    ↓
validate → deterministic plan → report
    ↓
plan.json + Markdown + HTML + PDF (Chrome 사용 가능 시)
```

기준 작업 절차는 [`skills/travel-planner/SKILL.md`](skills/travel-planner/SKILL.md)에 있습니다. Claude Code와 Codex adapter는 모두 이 파일을 참조하며, 실행 환경에 따라 달라지는 별도 일정 계산 구현은 없습니다.

[근거 데이터 계약](skills/travel-planner/references/evidence-contract.md)과 [보고서 계약](skills/travel-planner/references/report-contract.md)을 참고하세요.

## Workspace 구조

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

수집한 근거 데이터와 `plan.json`이 기준 데이터입니다. Markdown, HTML, PDF는 여기서 만들어지는 결과물입니다. 설치된 플러그인 캐시는 배포용이므로 여행 artifact를 기록하면 안 됩니다.

## 일정 상태

| 상태 | 의미 |
| --- | --- |
| `ready` | 현재 근거 데이터가 검증을 통과했습니다. 예약 완료를 의미하지 않습니다. |
| `needs_review` | 일정은 사용할 수 있지만 날씨, 교통, 수집 범위 또는 다른 근거 데이터를 확인해야 합니다. |
| `conflict` | hard constraint를 위반했습니다. 완료된 일정으로 취급하면 안 됩니다. |

## Offline 예제

[`examples/danang/`](examples/danang/)은 3박 4일 다낭 일정을 실행해 볼 수 있는 예제 데이터입니다. 실제 여행 정보가 아닙니다. 날씨는 `forecast_horizon`, 항공편은 `unavailable` 상태이므로 결과는 `needs_review`가 정상입니다.

```bash
npm run dogfood:offline
```

## 명령

| 명령 | 용도 |
| --- | --- |
| `npm test` | 계약, 회귀, 통합, bounded-search 테스트 |
| `npm run validate` | plan을 쓰지 않고 requirements와 근거 데이터를 검증 |
| `npm run plan` | 근거 데이터에서 structured JSON과 Markdown 생성 |
| `npm run report` | Chrome 사용 가능 시 Markdown, HTML, PDF 생성 |
| `npm run bench` | 50개 장소, 31일 bounded benchmark 실행 |
| `npm run dogfood:offline` | offline 다낭 acceptance 예제 실행 |

## 안전 범위

- 배치 날짜의 영업시간이 확인된 장소만 일정 후보가 됩니다.
- 누락된 경로 근거 데이터는 0분 경로로 처리하지 않습니다.
- 근거 데이터에는 허용된 status, 수집 시각, 만료 시각이 필요합니다.
- forecast horizon과 provider 실패는 서로 다른 상태입니다.
- search는 bounded·approximate이며 전역 최적해라고 주장하지 않습니다.
- 핵심 엔진은 교통, 숙소, 식당, 활동을 예약하지 않습니다.
- 예약·결제·외부 변경 전에는 대상·조건·행위를 보여주고 명시적 승인을 받아야 합니다.

인증 정보, 서명 URL, 예약번호, 여행자 데이터, 생성된 개인 여행 보고서는 commit하지 마세요.

## 프로젝트 구조

```text
skills/travel-planner/          기준 작업 절차와 계약
.claude/skills/travel-planner/  Claude Code adapter
.agents/skills/travel-planner/  Codex adapter
.claude-plugin/                 공통 marketplace와 plugin manifest
scripts/                        Validate, plan, report CLI
src/planner/                    근거 데이터 수명주기와 일정 계산기
src/report-exporter.js          HTML escaping과 PDF export
test/                           계약과 회귀 테스트
examples/danang/                Offline acceptance 예제
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

1. 사용자가 겪는 문제
2. 최소 재현 사례 또는 예제 데이터
3. 회귀 또는 동작 테스트
4. 실제로 실행한 검증 명령

변경 범위는 필요한 부분으로 제한하고, 기능 변경과 무관한 정리는 같은 pull request에 섞지 마세요.

## 라이선스

[MIT License](LICENSE)를 적용합니다.
