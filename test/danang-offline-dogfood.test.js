import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateFromFiles, writePlanArtifacts } from "../src/harness-runner.js";
import { exportReport } from "../src/report-exporter.js";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const REQUIREMENTS_PATH = path.join(ROOT, "examples/danang/requirements.json");
const EVIDENCE_PATH = path.join(ROOT, "examples/danang/evidence.json");

test("Da Nang offline fixture completes the portable plan and HTML report flow", async () => {
  const bundle = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
  const temporary = await mkdtemp(path.join(os.tmpdir(), "travel-planner-danang-test-"));
  try {
    const result = await generateFromFiles({
      requirementsPath: REQUIREMENTS_PATH,
      evidencePath: EVIDENCE_PATH,
      now: () => new Date(bundle.generatedAt),
    });
    const planOutputs = await writePlanArtifacts({ result, outputDir: path.join(temporary, "plan") });
    const reportOutputs = await exportReport({
      markdownPath: planOutputs.markdownPath,
      outputDir: path.join(temporary, "report"),
      title: "다낭 여행 플랜",
      htmlOnly: true,
    });
    const html = await readFile(reportOutputs.htmlOutput, "utf8");

    assert.equal(result.status, "needs_review");
    assert.equal(result.groundedPlan.validation.ok, true);
    assert.equal(result.groundedPlan.quality.hardConstraintViolations, 0);
    assert.equal(result.groundedPlan.unscheduledPlaceIds.length, 0);
    assert.equal(result.groundedPlan.days.flatMap((day) => day.activities).length, 5);
    assert.match(html, /다낭 여행 플랜/);
    assert.match(html, /WEATHER_FORECAST_HORIZON/);
    assert.match(html, /MAJOR_TRANSPORT_UNAVAILABLE/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
