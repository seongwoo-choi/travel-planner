import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (relativePath) => readFileSync(path.join(ROOT, relativePath), "utf8");

test("portable harness has one canonical skill with thin Claude and Codex adapters", () => {
  const canonical = read("skills/travel-planner/SKILL.md");
  const claude = read(".claude/skills/travel-planner/SKILL.md");
  const codex = read(".agents/skills/travel-planner/SKILL.md");

  assert.match(canonical, /^---\nname: travel-planner\n/m);
  assert.match(canonical, /scripts\/plan-from-evidence\.js/);
  assert.doesNotMatch(canonical, /TeamCreate|TaskCreate|TaskGet|TeamDelete|SendMessage/);

  for (const adapter of [claude, codex]) {
    assert.match(adapter, /^---\nname: travel-planner\n/m);
    assert.match(adapter, /skills\/travel-planner\/SKILL\.md/);
  }
});

test("Git marketplace exposes the canonical travel-planner skill to Claude and Codex", () => {
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));

  assert.equal(plugin.name, "travel-planner");
  assert.equal(plugin.version, "1.0.0");
  assert.deepEqual(plugin.skills, ["./skills/travel-planner"]);

  assert.equal(marketplace.name, "travel-planner");
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, "travel-planner");
  assert.equal(marketplace.plugins[0].source, "./");
  assert.deepEqual(marketplace.plugins[0].skills, ["./skills/travel-planner"]);
});

test("portable harness exposes evidence-in planning without Discord or a web server", () => {
  const pkg = JSON.parse(read("package.json"));

  assert.equal(pkg.name, "travel-planner-harness");
  assert.equal(pkg.scripts.plan, "node scripts/plan-from-evidence.js");
  assert.equal(pkg.scripts.validate, "node scripts/validate-workspace.js");
  assert.equal(pkg.scripts.report, "node scripts/export-report.js");
  assert.equal(pkg.dependencies?.["discord.js"], undefined);
  assert.equal(pkg.dependencies?.express, undefined);

  assert.equal(existsSync(path.join(ROOT, "src/planner/trip-planner.js")), true);
  assert.equal(existsSync(path.join(ROOT, "scripts/plan-from-evidence.js")), true);
  assert.equal(existsSync(path.join(ROOT, "webapp/server.js")), false);
  assert.equal(existsSync(path.join(ROOT, "webapp/public")), false);
  assert.equal(existsSync(path.join(ROOT, "webapp/package.json")), false);
  assert.equal(existsSync(path.join(ROOT, ".claude/skills/travel-orchestrator/SKILL.md")), false);
});

test("project instructions route travel planning through the portable skill", () => {
  const agents = read("AGENTS.md");
  const claude = read("CLAUDE.md");

  assert.match(agents, /skills\/travel-planner\/SKILL\.md/);
  assert.match(agents, /Claude Code|Codex/);
  assert.match(claude, /AGENTS\.md/);
});

test("open-source documentation keeps English primary and Korean translation in sync", () => {
  const english = read("README.md");
  const korean = read("README.ko.md");
  const license = read("LICENSE");

  for (const readme of [english, korean]) {
    assert.match(readme, /\[English\]\(README\.md\) \| \[한국어\]\(README\.ko\.md\)/);
    assert.match(readme, /\[MIT License\]\(LICENSE\)/);
    assert.match(readme, /npm run dogfood:offline/);
    assert.match(readme, /examples\/danang\/requirements\.json/);
    assert.match(readme, /examples\/danang\/evidence\.json/);
    assert.match(readme, /`forecast_horizon`/);
    assert.match(readme, /`unavailable`/);
    assert.match(readme, /plugin marketplace add seongwoo-choi\/travel-planner/);
    assert.match(readme, /travel-planner@travel-planner/);
    assert.doesNotMatch(readme, /_workspace\/01_evidence\/evidence\.json/);
  }
  assert.match(english, /Evidence-grounded itinerary planning/);
  assert.match(korean, /evidence 기반 여행 일정 플래너/);
  assert.match(license, /^MIT License\n/);
});
