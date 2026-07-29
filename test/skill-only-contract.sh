#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

for file in \
  .claude-plugin/marketplace.json \
  .claude-plugin/plugin.json \
  skills/travel-planner/SKILL.md \
  skills/travel-planner/references/requirements-contract.md \
  skills/travel-planner/references/evidence-contract.md \
  skills/travel-planner/references/replan-contract.md \
  skills/travel-planner/references/report-contract.md \
  skills/travel-planner/templates/evidence.json \
  skills/travel-planner/templates/replan-request.json \
  skills/travel-planner/templates/replan-review.md \
  skills/travel-planner/templates/plan-review.md \
  .claude/skills/travel-planner/SKILL.md \
  .agents/skills/travel-planner/SKILL.md; do
  test -f "$file"
done

test ! -e package.json
test ! -d src
test ! -d scripts

grep -Fq 'skills/travel-planner/SKILL.md' .claude/skills/travel-planner/SKILL.md
grep -Fq 'skills/travel-planner/SKILL.md' .agents/skills/travel-planner/SKILL.md
grep -Fq '직접 검증' skills/travel-planner/SKILL.md
grep -Fq '실제 파일' skills/travel-planner/SKILL.md
grep -Fq 'requirements-contract.md' skills/travel-planner/SKILL.md
grep -Fq 'replan-contract.md' skills/travel-planner/SKILL.md
grep -Fq '기존 일정 artifact는 사실 근거가 아니다' skills/travel-planner/SKILL.md

python3 -m json.tool .claude-plugin/plugin.json >/dev/null
python3 -m json.tool .claude-plugin/marketplace.json >/dev/null
python3 -m json.tool skills/travel-planner/templates/requirements.json >/dev/null
python3 -m json.tool skills/travel-planner/templates/evidence.json >/dev/null
python3 -m json.tool skills/travel-planner/templates/replan-request.json >/dev/null

grep -Fq 'skill-first' README.md
grep -Fq 'npm install' README.md && exit 1 || true
grep -Fq 'npm run' README.md && exit 1 || true

echo 'skill-only contract passed'
