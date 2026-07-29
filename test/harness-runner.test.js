import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { normalizeHarnessRequirements } from "../src/harness-input.js";
import { generateFromFiles } from "../src/harness-runner.js";
import { markdownToHtml } from "../src/report-exporter.js";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const FETCHED_AT = "2026-07-28T10:00:00Z";

test("normalizeHarnessRequirements accepts the legacy workspace shape", () => {
  const input = normalizeHarnessRequirements({
    destination: "삿포로",
    country: "일본",
    departure: "인천",
    start_date: "20260712",
    end_date: "20260715",
    passengers: 2,
    party_type: "커플",
    travel_style: ["맛집", "자연"],
    transport_pref: "항공(예약 완료)",
  });

  assert.equal(input.startDate, "2026-07-12");
  assert.equal(input.nights, 3);
  assert.equal(input.travelers, 2);
  assert.equal(input.companions, "커플");
  assert.equal(input.tripType, "맛집, 자연");
  assert.equal(input.transportPref, "flight");
});

test("normalizeHarnessRequirements rejects an impossible calendar date", () => {
  assert.throws(
    () => normalizeHarnessRequirements({ destination: "부산", start_date: "20260230", end_date: "20260301" }),
    /startDate/
  );
});

test("normalizeHarnessRequirements requires a positive integer traveler count", () => {
  for (const travelers of [undefined, 0, -2, 1.5, "abc", true, [2], { value: 2 }]) {
    assert.throws(
      () => normalizeHarnessRequirements({
        destination: "부산",
        startDate: "2026-08-01",
        nights: 1,
        ...(travelers === undefined ? {} : { travelers }),
      }),
      /travelers must be a positive integer/
    );
  }
});

test("generateFromFiles requires a valid generatedAt without using it as the freshness clock", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "travel-harness-generated-at-test-"));
  try {
    const requirementsPath = path.join(temporary, "requirements.json");
    const evidencePath = path.join(temporary, "evidence.json");
    await writeFile(requirementsPath, JSON.stringify({
      destination: "부산",
      startDate: "2026-08-01",
      nights: 0,
      travelers: 2,
    }));
    for (const generatedAt of ["not-a-date", "2026-07-28"]) {
      await writeFile(evidencePath, JSON.stringify({ generatedAt, evidence: {} }));
      await assert.rejects(
        () => generateFromFiles({ requirementsPath, evidencePath }),
        /evidence generatedAt must be an ISO timestamp/
      );
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("markdownToHtml escapes report content before rendering", () => {
  const html = markdownToHtml("# 계획\n- <script>alert(1)</script>", "<unsafe>");

  assert.match(html, /&lt;unsafe&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
});

test("plan-from-evidence CLI writes structured JSON and Markdown", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "travel-harness-test-"));
  try {
    const requirementsPath = path.join(temporary, "requirements.json");
    const evidencePath = path.join(temporary, "evidence.json");
    const outputDir = path.join(temporary, "out");
    await writeFile(requirementsPath, JSON.stringify({ destination: "부산", start_date: "20260801", end_date: "20260801", travelers: 2 }));
    await writeFile(evidencePath, JSON.stringify({
      generatedAt: FETCHED_AT,
      evidence: {
        places: {
          source: "fixture-places",
          fetchedAt: FETCHED_AT,
          expiresAt: "2026-12-31T23:59:59Z",
          status: "verified",
          destinationLocation: { latitude: 35.1796, longitude: 129.0756 },
          searchCoverage: [{ key: "fixture", status: "verified" }],
          items: [{
            id: "museum",
            name: "Museum",
            score: 80,
            durationMinutes: 60,
            openingHoursStatus: "verified",
            openingHours: { "2026-08-01": { open: "09:00", close: "18:00" } },
          }],
        },
        weather: {
          source: "fixture-weather",
          fetchedAt: FETCHED_AT,
          expiresAt: "2026-12-31T23:59:59Z",
          status: "verified",
          timezone: "Asia/Seoul",
          days: [{ date: "2026-08-01", temperatureMin: 23, temperatureMax: 29, precipitationProbability: 10 }],
        },
        timezone: { source: "fixture-timezone", fetchedAt: FETCHED_AT, expiresAt: "2026-12-31T23:59:59Z", status: "verified", timezone: "Asia/Seoul" },
        travel: {
          source: "fixture-travel",
          fetchedAt: FETCHED_AT,
          expiresAt: "2026-12-31T23:59:59Z",
          status: "verified",
          matrix: { "base|museum": 10, "museum|base": 10 },
        },
      },
    }));

    const run = spawnSync(process.execPath, [
      path.join(ROOT, "scripts/plan-from-evidence.js"),
      `--requirements=${requirementsPath}`,
      `--evidence=${evidencePath}`,
      `--output-dir=${outputDir}`,
    ], { encoding: "utf8" });

    assert.equal(run.status, 0, run.stderr);
    const summary = JSON.parse(run.stdout);
    const plan = JSON.parse(await readFile(path.join(outputDir, "plan.json"), "utf8"));
    const markdown = await readFile(path.join(outputDir, "travel_plan.md"), "utf8");
    assert.equal(summary.status, "ready");
    assert.equal(plan.schemaVersion, 1);
    assert.equal(plan.requirements.startDate, "2026-08-01");
    assert.match(markdown, /# 부산 여행 플랜/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("plan-from-evidence CLI does not trust generatedAt as its freshness clock", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "travel-harness-expired-test-"));
  try {
    const evidence = JSON.parse(await readFile(path.join(ROOT, "examples/danang/evidence.json"), "utf8"));
    evidence.generatedAt = "2026-01-01T00:00:00Z";
    for (const snapshot of Object.values(evidence.evidence)) {
      snapshot.fetchedAt = "2026-07-27T00:00:00Z";
      snapshot.expiresAt = "2026-07-28T00:00:00Z";
    }
    const evidencePath = path.join(temporary, "evidence.json");
    await writeFile(evidencePath, JSON.stringify(evidence));

    const run = spawnSync(process.execPath, [
      path.join(ROOT, "scripts/plan-from-evidence.js"),
      `--requirements=${path.join(ROOT, "examples/danang/requirements.json")}`,
      `--evidence=${evidencePath}`,
      `--output-dir=${path.join(temporary, "out")}`,
    ], { encoding: "utf8" });

    assert.equal(run.status, 1);
    assert.match(run.stderr, /expired at 2026-07-28T00:00:00Z/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
