<div align="center">

# Travel Planner

**Evidence-grounded itinerary planning for Claude Code and Codex.**

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

[![verify](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml/badge.svg)](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-D97757)
![Codex](https://img.shields.io/badge/Codex-compatible-111827)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

Travel Planner turns a natural-language trip request into an evidence-backed, multi-day itinerary. Claude Code and Codex share one workflow, one evidence contract, a deterministic scheduler, fail-closed validation, and portable reports.

> The LLM is not the source of truth for places, opening hours, weather, or travel time. Agents collect evidence; the core validates and schedules it.

## Why Travel Planner

A polished itinerary can hide dangerous assumptions: a missing route becomes zero minutes, unknown opening hours become all-day access, or an unpublished forecast becomes a fact. Travel Planner keeps uncertainty visible and actionable.

| Instead of | Travel Planner does |
| --- | --- |
| Inventing a fact | Requires sourced, dated, unexpired evidence |
| Treating missing travel time as zero | Rejects the route as unschedulable |
| Calling an unknown place “indoor” | Requires positive evidence for `indoor: true` |
| Hiding uncertainty | Produces `needs_review` with confirmation tasks |
| Letting an agent book autonomously | Requires explicit approval before any external mutation |

## Install

### As a plugin

Install the same Git marketplace in either runtime, then start a new session.

```bash
# Claude Code
claude plugin marketplace add seongwoo-choi/travel-planner
claude plugin install travel-planner@travel-planner

# Codex
codex plugin marketplace add seongwoo-choi/travel-planner
codex plugin add travel-planner@travel-planner
```

The plugin bundles the canonical skill and JavaScript core. No global planner package, skill copying, or runtime-specific implementation is required.

### Update an installed plugin

```bash
# Claude Code
claude plugin update travel-planner@travel-planner

# Codex
codex plugin marketplace upgrade travel-planner
codex plugin remove travel-planner@travel-planner
codex plugin add travel-planner@travel-planner
```

### Run from source

```bash
git clone https://github.com/seongwoo-choi/travel-planner.git
cd travel-planner
npm ci
```

Requirements: Node.js 22+, Claude Code 2.x or Codex CLI. PDF export additionally needs Google Chrome, Chromium, or `CHROME_BIN`.

## Plan a trip

Ask Claude Code or Codex in natural language:

```text
Plan a 4-day trip to Da Nang for two people.
We are flying from Incheon, staying near My Khe Beach,
and prefer a relaxed schedule with evening views.
```

The agent collects evidence, writes a trip workspace, validates it, creates the itinerary, and generates reports. It does not book anything.

## Run the deterministic pipeline directly

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

`npm run report` writes Markdown and self-contained HTML before PDF export. If Chrome is unavailable, it reports the PDF failure instead of fabricating a file.

## What the agent must prove

```text
Natural-language request
        ↓
requirements.json + evidence.json
        ↓
validate → deterministic plan → report
        ↓
plan.json + Markdown + HTML + PDF (when Chrome is available)
```

The canonical workflow is [`skills/travel-planner/SKILL.md`](skills/travel-planner/SKILL.md). Claude Code and Codex adapters point to that single source; there is no separate planner logic per runtime.

See the [evidence contract](skills/travel-planner/references/evidence-contract.md) and [report contract](skills/travel-planner/references/report-contract.md).

## Workspace contract

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

Evidence snapshots and `plan.json` are the source of truth. Markdown, HTML, and PDF are derived artifacts. Installed plugin caches are distribution-only and must never receive trip artifacts.

## Plan status

| Status | Meaning |
| --- | --- |
| `ready` | Current evidence passed validation. This does **not** mean anything is booked. |
| `needs_review` | The itinerary is usable, but weather, transport, coverage, or another evidence item needs confirmation. |
| `conflict` | A hard constraint is violated. Do not treat the itinerary as complete. |

## Offline example

[`examples/danang/`](examples/danang/) is a four-day fixture for exercising the pipeline. It is test data, not live travel advice. Its weather is `forecast_horizon` and flights are `unavailable`, so the expected result is `needs_review`.

```bash
npm run dogfood:offline
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Contract, regression, integration, and bounded-search tests |
| `npm run validate` | Validate requirements and evidence without writing a plan |
| `npm run plan` | Generate structured JSON and Markdown from evidence |
| `npm run report` | Export Markdown, HTML, and PDF when Chrome is available |
| `npm run bench` | Run the bounded 50-place, 31-day benchmark |
| `npm run dogfood:offline` | Run the offline Da Nang acceptance fixture |

## Safety and scope

- A place is schedulable only when opening hours are verified for its assigned date.
- Missing route evidence never becomes a zero-minute route.
- Evidence needs a recognized status, collection time, and expiry time.
- Forecast horizon and provider failure are distinct states.
- Search is bounded and approximate; it is not presented as globally optimal.
- The core never books transport, stays, restaurants, or activities.
- Before booking, payment, or another external mutation, an agent must present the exact target, terms, and action for explicit approval.

Do not commit credentials, signed URLs, booking references, traveler data, or generated personal trip reports.

## Project layout

```text
skills/travel-planner/          Canonical workflow and contracts
.claude/skills/travel-planner/  Claude Code adapter
.agents/skills/travel-planner/  Codex adapter
.claude-plugin/                 Shared marketplace and plugin manifests
scripts/                        Validate, plan, and report CLIs
src/planner/                    Evidence lifecycle and scheduler
src/report-exporter.js          Escaped HTML and PDF export
test/                           Contract and regression tests
examples/danang/                Offline acceptance fixture
```

## Development

```bash
npm ci
npm test
npm run bench
npm run dogfood:offline
npm audit --audit-level=moderate
```

The GitHub Actions workflow verifies tests, the benchmark, audit, strict plugin validation, and marketplace installation for both Claude Code and Codex.

## Contributing

Focused issues and pull requests are welcome. Include:

1. the user-visible problem;
2. a minimal reproduction or fixture;
3. a regression or behavior test; and
4. the commands used to verify the change.

Keep changes surgical. Do not mix unrelated cleanup into a behavior change.

## License

Licensed under the [MIT License](LICENSE).
