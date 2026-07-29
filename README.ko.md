<div align="center">

# Travel Planner

**Claude Code와 Codex를 위한 근거 기반 skill-first 여행 계획 도구**

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

[![verify](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml/badge.svg)](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml)
![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-D97757)
![Codex](https://img.shields.io/badge/Codex-compatible-111827)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

Travel Planner는 자연어 여행 요청을 근거가 있는 일정으로 바꿉니다. 제품의 본체는 하나의 기준 skill, 근거·보고서 계약, workspace template입니다. 일정 계산 라이브러리나 실행 환경 전용 application이 아닙니다.

> LLM은 장소, 영업시간, 날씨, 이동시간의 사실 근거가 아닙니다. 에이전트가 출처를 수집하고 근거 데이터를 직접 읽어 검증하며, 불확실성은 확인 항목으로 남겨야 합니다.

## 막는 문제

| 대신 | Travel Planner의 기준 |
| --- | --- |
| 사실을 추정 | 출처·수집 시각·만료 시각이 있는 근거 데이터 |
| 누락된 이동시간을 0분 처리 | 해당 경로를 배치 불가로 처리 |
| 알 수 없는 영업시간을 영업 중으로 처리 | 배치 날짜의 확인된 영업시간 |
| 불확실성을 숨김 | `needs_review`와 구체적인 확인 항목 |
| 에이전트가 자율 예약 | 모든 외부 변경 전 명시적 승인 |

## 설치

> **현재 접근 조건:** 이 저장소는 private 상태입니다. 설치하려면 GitHub 인증과 저장소 접근 권한이 필요합니다. 접근 권한이 없는 사용자에게 공유하려면 먼저 public으로 전환해야 합니다.

```bash
# Claude Code
claude plugin marketplace add seongwoo-choi/travel-planner
claude plugin install travel-planner@travel-planner

# Codex
codex plugin marketplace add seongwoo-choi/travel-planner
codex plugin add travel-planner@travel-planner
```

plugin에는 기준 skill, 계약, template이 들어 있습니다. 설치 뒤 새 세션을 시작하세요.

### 갱신

```bash
claude plugin update travel-planner@travel-planner

codex plugin marketplace upgrade travel-planner
codex plugin remove travel-planner@travel-planner
codex plugin add travel-planner@travel-planner
```

## 여행 계획 만들기

```text
2명이 다낭에서 보내는 3박 4일 여행 계획을 만들어줘.
인천에서 출발하고 미케 비치 근처에 머물 예정이야.
여유로운 일정과 야경을 선호해.
```

에이전트는 workspace를 만들고 read-only 근거를 수집한 뒤 직접 검증합니다. 일정·보고서 artifact를 작성하고 다시 읽어 확인합니다. 예약은 수행하지 않습니다.

## 하루 일정 다시 짜기

비, 지연, 휴무, 피로, 선호 변경으로 오늘 또는 특정 날짜를 바꾸고 싶다면 자연어로 요청합니다.

```text
오후부터 비가 와. 2일차를 실내 중심으로 다시 짜되
19시 저녁 예약은 유지해줘.
```

에이전트는 기존 일정을 비교와 사용자 의도 기록으로만 취급합니다. 영향을 받는 근거를 다시 수집하고, 사용자가 명시적으로 확인한 약속만 유지하며, 유지·교체·미확인 활동을 표시합니다. 검증된 대안이 없으면 그럴듯한 일정을 꾸며내지 않습니다.

## 작업 흐름

```text
자연어 요청
    ↓
requirements.json + evidence.json
    ↓
근거와 일정의 직접 검증
    ↓
plan.json + Markdown + HTML + PDF (renderer 성공 시만)
```

기준 작업 절차는 [`skills/travel-planner/SKILL.md`](skills/travel-planner/SKILL.md)입니다. Claude Code와 Codex adapter는 모두 이 파일을 참조하며 어느 runtime도 별도 일정 계산 로직을 갖지 않습니다.

- [근거 데이터 계약](skills/travel-planner/references/evidence-contract.md)
- [보고서 계약](skills/travel-planner/references/report-contract.md)
- [요구사항 계약](skills/travel-planner/references/requirements-contract.md)
- [일정 재조정 계약](skills/travel-planner/references/replan-contract.md)

## Workspace 구조

```text
_workspace/
  00_input/requirements.json
  01_evidence/evidence.json
  02_plan/plan.json
  02_plan/travel_plan.md
  03_report/travel_plan.md
  03_report/travel_plan.html
  03_report/travel_plan.pdf
  04_replan/replan-request.json
  04_replan/replan.json
  04_replan/replan.md
```

근거 데이터와 `plan.json`이 기준 데이터입니다. Markdown, HTML, PDF는 결과물입니다. plugin cache는 배포용이므로 여행 artifact를 쓰면 안 됩니다.

## 상태

| 상태 | 의미 |
| --- | --- |
| `ready` | 에이전트가 현재 근거와 artifact를 직접 검증했습니다. 예약 완료는 아닙니다. |
| `needs_review` | 일정은 사용할 수 있지만 명시한 근거를 더 확인해야 합니다. |
| `conflict` | hard constraint를 위반했습니다. 완료된 일정으로 취급하면 안 됩니다. |

## Offline 예제

[`examples/danang/`](examples/danang/)은 skill을 점검하는 3박 4일 예제입니다. 실시간 여행 정보가 아닙니다. 날씨는 `forecast_horizon`, 항공편은 `unavailable`이므로 정상 결과는 `needs_review`입니다.

## 안전 범위

- 입력 JSON, timestamp, status, source URL, 영업시간, 이동시간, 일정을 직접 검증합니다.
- 누락된 근거를 추정이나 사실로 바꾸지 않습니다.
- 실제 renderer가 성공했을 때만 PDF를 제공합니다. 실패하면 검증된 HTML과 실패 원인을 제공합니다.
- 예약·결제·외부 변경 전에는 대상·조건·행위를 보여주고 명시적 승인을 받습니다.
- 인증 정보, 서명 URL, 예약번호, 여행자 데이터, 생성된 개인 보고서는 commit하지 마세요.

## 프로젝트 구조

```text
.claude-plugin/                 marketplace와 plugin manifest
skills/travel-planner/          기준 skill, 계약, template
.claude/skills/travel-planner/  Claude Code adapter
.agents/skills/travel-planner/  Codex adapter
examples/danang/                Offline 예제
test/skill-only-contract.sh     package와 adapter contract 점검
```

## 개발

```bash
bash test/skill-only-contract.sh
claude plugin validate . --strict
```

GitHub Actions는 skill-only package contract, strict plugin validation, Claude Code/Codex marketplace 설치를 확인합니다.

## 기여

변경 범위는 필요한 부분으로 제한하세요. 사용자 문제, 최소 예제 또는 재현, 실행한 검증, 관련 문서 변경을 함께 제출하세요.

## 라이선스

[MIT License](LICENSE)를 적용합니다.
