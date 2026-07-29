<div align="center">

# Travel Planner

**Evidence-grounded, skill-first trip planning for Claude Code and Codex.**

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

[![verify](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml/badge.svg)](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml)
![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-D97757)
![Codex](https://img.shields.io/badge/Codex-compatible-111827)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

Travel Planner turns a natural-language trip request into an evidence-backed itinerary. Its product is one canonical skill, evidence and report contracts, and workspace templates—not a scheduler library or a runtime-specific application.

> The LLM is not the source of truth for places, opening hours, weather, or travel time. The agent must collect sources, inspect the evidence directly, and leave uncertainty visible.

## What it prevents

| Instead of | Travel Planner requires |
| --- | --- |
| Inventing a fact | Sourced, dated, unexpired evidence |
| Treating missing travel time as zero | Marking the route unschedulable |
| Treating unknown hours as open | Verified hours for the scheduled date |
| Hiding uncertainty | `needs_review` and concrete confirmation tasks |
| Autonomous booking | Explicit approval before every external mutation |

## Install

> **Current availability:** This repository is private. Installation requires GitHub authentication and repository access. Make it public before sharing these instructions with users who do not already have access.

```bash
# Claude Code
claude plugin marketplace add seongwoo-choi/travel-planner
claude plugin install travel-planner@travel-planner

# Codex
codex plugin marketplace add seongwoo-choi/travel-planner
codex plugin add travel-planner@travel-planner
```

The plugin bundles the canonical skill, contracts, and templates. Start a new session after installation.

### Update

```bash
claude plugin update travel-planner@travel-planner

codex plugin marketplace upgrade travel-planner
codex plugin remove travel-planner@travel-planner
codex plugin add travel-planner@travel-planner
```

## Plan a trip

Ask either runtime naturally:

```text
Plan a 4-day trip to Da Nang for two people.
We are flying from Incheon, staying near My Khe Beach,
and prefer a relaxed schedule with evening views.
```

The agent creates a workspace, collects read-only evidence, validates it directly, writes the itinerary and report artifacts, and reads them back to verify them. It never books anything.

## Replan a day

Ask to change today or a specific day when weather, delay, closure, fatigue, or preferences change:

```text
Rain starts this afternoon. Replan day 2 around indoor places,
but keep our 19:00 dinner reservation.
```

The agent treats the previous itinerary only as a comparison and intent record. It refreshes affected evidence, preserves only commitments you explicitly confirm, and reports the kept, replaced, and unresolved activities. It never invents a replacement when no verified option fits.

## Workflow

```text
Natural-language request
        ↓
requirements.json + evidence.json
        ↓
direct evidence and itinerary validation
        ↓
plan.json + Markdown + HTML + PDF (only when a renderer succeeds)
```

The canonical workflow is [`skills/travel-planner/SKILL.md`](skills/travel-planner/SKILL.md). Claude Code and Codex adapters both point to it; neither owns planner logic.

- [Evidence contract](skills/travel-planner/references/evidence-contract.md)
- [Report contract](skills/travel-planner/references/report-contract.md)
- [Requirements contract](skills/travel-planner/references/requirements-contract.md)
- [Replan contract](skills/travel-planner/references/replan-contract.md)

## Workspace contract

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

Evidence snapshots are the source of truth for travel facts; `plan.json` is the current itinerary. During replan, an earlier `plan.json` is only a comparison and user-intent record, never factual evidence. Markdown, HTML, and PDF are derived artifacts. Plugin caches are distribution-only and must never receive trip artifacts.

## Status

| Status | Meaning |
| --- | --- |
| `ready` | The agent directly validated the current evidence and artifacts. It does **not** mean anything is booked. |
| `needs_review` | The itinerary is usable, but specified evidence still needs confirmation. |
| `conflict` | A hard constraint is violated. Do not call the itinerary complete. |

## Offline fixture

[`examples/danang/`](examples/danang/) is a four-day fixture for exercising the skill. It is not live travel advice. Its weather is `forecast_horizon` and flights are `unavailable`, so a correct result remains `needs_review`.

## Safety and scope

- Verify input JSON, timestamps, status, source URLs, opening hours, travel times, schedules, and generated artifacts directly.
- Do not turn missing evidence into estimates or facts.
- Generate a PDF only after a renderer actually succeeds; otherwise report the failure and provide the verified HTML.
- Before booking, payment, or another external mutation, show the exact target, terms, and action and obtain explicit approval.
- Do not commit credentials, signed URLs, booking references, traveler data, or generated personal reports.

## Project layout

```text
.claude-plugin/                 Marketplace and plugin manifests
skills/travel-planner/          Canonical skill, contracts, and templates
.claude/skills/travel-planner/  Claude Code adapter
.agents/skills/travel-planner/  Codex adapter
examples/danang/                Offline fixture
test/skill-only-contract.sh     Package and adapter contract check
```

## Development

```bash
bash test/skill-only-contract.sh
claude plugin validate . --strict
```

GitHub Actions checks the skill-only package contract, strict plugin validation, and marketplace installation for Claude Code and Codex.

## Contributing

Keep changes surgical. Include the user-visible problem, a minimal fixture or reproduction, the verification you ran, and matching documentation changes.

## License

Licensed under the [MIT License](LICENSE).
