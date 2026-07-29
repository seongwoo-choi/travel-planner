#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

for file in \
  .claude-plugin/marketplace.json \
  .claude-plugin/plugin.json \
  skills/travel-planner/SKILL.md \
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

grep -Fq 'skill-first' README.md
grep -Fq 'npm install' README.md && exit 1 || true
grep -Fq 'npm run' README.md && exit 1 || true

echo 'skill-only contract passed'
