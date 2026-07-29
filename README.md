<div align="center">

# Travel Planner

Evidence-grounded itinerary planning for Claude Code and Codex.

[English](README.md) | [한국어](README.ko.md)

![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-D97757)
![Codex](https://img.shields.io/badge/Codex-compatible-111827)
![Status](https://img.shields.io/badge/status-experimental-orange)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

Travel Planner is a portable agent harness for building multi-day itineraries from explicit evidence. Claude Code and Codex share the same workflow, evidence contract, deterministic scheduler, validator, and report exporter.

The planner does not use an LLM as the source of truth for places, opening hours, weather, or travel time. Agents collect evidence; the core validates and schedules it.

## Why this exists

Travel plans often look polished while hiding weak assumptions: missing travel time becomes zero, unknown opening hours become all-day access, and future weather is written as if it were known. This project keeps those unknowns visible.

It provides:

- one canonical workflow for Claude Code and Codex
- a provider-neutral JSON evidence contract
- deterministic bounded itinerary search
- fail-closed validation for missing, unknown, malformed, stale, or expired evidence
- Markdown, self-contained HTML, and PDF reports
- explicit approval boundaries before booking, payment, or any external mutation

## How it works

```text
Natural-language trip request
            |
            v
skills/travel-planner/SKILL.md
            |
            v
requirements.json + evidence.json
            |
            v
validate -> deterministic plan -> Markdown
            |
            v
travel_plan.md + travel_plan.html + travel_plan.pdf
```

Claude Code loads `.claude/skills/travel-planner/SKILL.md`. Codex loads `.agents/skills/travel-planner/SKILL.md`. Both adapters point to `skills/travel-planner/SKILL.md`, which is the only canonical workflow.

## Safety model

The core applies the following rules:

- A place is schedulable only when its opening hours are verified for the assigned date.
- Missing travel-time evidence never becomes a zero-minute route.
- `outdoor: false` is not proof that a place is indoors.
- Unavailable evidence cannot produce a `ready` plan.
- Evidence snapshots need a recognized status, collection time, and expiry time.
- Forecast horizon and provider failure are different states.
- Bounded-search output is reported as approximate, not globally optimal.
- Booking and payment require a separate, explicit user approval.

See [the evidence contract](skills/travel-planner/references/evidence-contract.md) and [the report contract](skills/travel-planner/references/report-contract.md).

## Requirements

- Node.js 22 or later
- Claude Code 2.x or Codex CLI
- Google Chrome, Chromium, or `CHROME_BIN` for PDF export

The core has no runtime npm dependencies. Provider credentials are optional because agents can collect evidence with the web or map tools available in their runtime.

## Install as a plugin

Install the same Git marketplace in either runtime, then start a new session.

```bash
# Claude Code
claude plugin marketplace add seongwoo-choi/travel-planner
claude plugin install travel-planner@travel-planner

# Codex
codex plugin marketplace add seongwoo-choi/travel-planner
codex plugin add travel-planner@travel-planner
```

The plugin bundles the canonical skill and the JavaScript core. You do not need to copy skills, maintain runtime-specific planner code, or install a global npm package. Ask for a travel plan in natural language; the agent creates the trip workspace and runs the bundled validation, planning, and report commands.

## Run from source

```bash
git clone https://github.com/seongwoo-choi/travel-planner.git
cd travel-planner
npm install
```

## Quick start

Ask Claude Code or Codex for a trip plan in natural language:

```text
Plan a 4-day trip to Da Nang for two people.
We are flying from Incheon, staying near My Khe Beach,
and prefer a relaxed schedule with evening views.
```

The agent follows the canonical skill, writes workspace artifacts, validates the evidence, generates the plan, and exports the reports.

To run the deterministic pipeline directly:

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

trips/{country}/{destination}/
  travel_plan.md
  travel_plan.html
  travel_plan.pdf
```

`plan.json` and the evidence snapshots are the source of truth. Markdown, HTML, and PDF are derived outputs.

## Plan status

| Status | Meaning |
| --- | --- |
| `ready` | The current evidence passed validation. This does not mean anything has been booked. |
| `needs_review` | The plan is usable, but weather, transport, coverage, or another evidence item still needs confirmation. |
| `conflict` | The itinerary violates a hard constraint and must not be treated as complete. |

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Run contract, regression, integration, and bounded-search tests |
| `npm run validate` | Validate requirements and evidence without writing plan artifacts |
| `npm run plan` | Generate structured JSON and Markdown from evidence |
| `npm run report` | Export Markdown, self-contained HTML, and PDF |
| `npm run bench` | Run the 50-place, 31-day bounded-search benchmark |
| `npm run dogfood:offline` | Run the Da Nang fixture through plan and HTML report generation |

## Offline dogfood

`examples/danang/` contains a four-day Da Nang fixture used to exercise the portable pipeline. It is test data, not live travel advice. Weather has `forecast_horizon` status and flights are `unavailable`, so the expected status is `needs_review`.

## Project layout

```text
skills/travel-planner/          Canonical workflow and contracts
.claude/skills/travel-planner/  Claude Code adapter
.agents/skills/travel-planner/  Codex adapter
scripts/                        Validate, plan, and report CLIs
src/planner/                    Evidence lifecycle and scheduler
src/harness-*.js                Input normalization and artifact runner
src/report-exporter.js          Escaped HTML and PDF export
test/                           Contract and regression tests
examples/danang/                Offline acceptance fixture
```

## Limitations

- Evidence quality depends on the original sources and tools available to the agent.
- Live flight schedules, inventory, prices, and cancellation rules need separate confirmation.
- Forecasts outside the provider horizon remain `needs_review` until their refresh date.
- The core does not book transport, accommodation, restaurants, or activities.
- Search is bounded for predictable runtime, so the result is not guaranteed to be globally optimal.

## Development

```bash
npm test
npm run bench
npm run dogfood:offline
npm audit --audit-level=moderate
```

Keep changes surgical. New behavior needs tests, and bug fixes need a regression guard. Do not commit credentials, generated trip reports, or personal workspace data.

## Contributing

Issues and focused pull requests are welcome. Include:

- the user-visible problem
- a minimal reproduction or fixture
- tests for the changed behavior
- the commands used to verify the change

Avoid broad cleanup in the same pull request as a functional change.

## Security

Do not report credentials or personal travel data in a public issue. Remove API keys, tokens, signed query parameters, booking references, and traveler details from reproductions.

The project rejects credential-bearing `source` and `sourceUrl` values at the CLI boundary and escapes report content before generating HTML.

## License

Licensed under the [MIT License](LICENSE).
