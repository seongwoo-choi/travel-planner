import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { DISCORD_MESSAGE_LIMIT, formatStoredPlanDiagnosis } from "../src/discord-bot.js";

const source = await readFile(new URL("../src/discord-bot.js", import.meta.url), "utf8");

function diagnosis(overrides = {}) {
  return {
    hardConstraintsOk: true,
    ready: true,
    hardIssues: [],
    evidenceIssues: [],
    staleSources: [],
    ...overrides,
  };
}

test("a fully settled plan reports no conflicts and reads as ready", () => {
  const text = formatStoredPlanDiagnosis(7, diagnosis());

  assert.match(text, /플랜 #7/);
  assert.match(text, /충돌 없음/);
  assert.match(text, /준비 완료/);
});

test("hard constraint conflicts are listed with their codes", () => {
  const text = formatStoredPlanDiagnosis(7, diagnosis({
    hardConstraintsOk: false,
    ready: false,
    hardIssues: [
      { code: "DAY_WINDOW_CONFLICT", date: "2026-08-01", activityId: "old" },
      { code: "OPENING_HOURS_CONFLICT", date: "2026-08-02", activityId: "replacement" },
    ],
  }));

  assert.match(text, /하드 제약: 2건/);
  assert.match(text, /\[DAY_WINDOW_CONFLICT\] 2026-08-01 old/);
  assert.match(text, /\[OPENING_HOURS_CONFLICT\] 2026-08-02 replacement/);
  assert.doesNotMatch(text, /충돌 없음/);
});

test("unsettled evidence is never reported as only 충돌 없음", () => {
  const text = formatStoredPlanDiagnosis(7, diagnosis({
    ready: false,
    evidenceIssues: [
      {
        code: "WEATHER_FORECAST_HORIZON",
        dates: ["2026-10-09"],
        refreshAfter: "2026-09-27",
        message: "Weather forecast is not published yet",
      },
      { code: "EVIDENCE_UNVERIFIED", subject: "majorTransport", status: "unavailable", direction: "outbound" },
    ],
    staleSources: [{ subject: "weather", source: "open-meteo", expiresAt: "2026-07-28T11:00:00Z" }],
  }));

  assert.match(text, /확인 필요: 2건/);
  assert.match(text, /\[WEATHER_FORECAST_HORIZON\]/);
  assert.match(text, /재조회 가능: 2026-09-27/);
  assert.match(text, /\[EVIDENCE_UNVERIFIED\].*majorTransport/);
  assert.match(text, /만료된 근거/);
  assert.match(text, /weather.*2026-07-28T11:00:00Z/);
  assert.doesNotMatch(text, /준비 완료/);
  // 충돌 없음 may appear for the hard-constraint section, but it must not be the whole answer.
  assert.ok(text.split("\n").length > 2, "evidence findings must be reported beside the conflict line");
});

test("the reply stays inside the Discord message limit and says what it dropped", () => {
  const text = formatStoredPlanDiagnosis(7, diagnosis({
    hardConstraintsOk: false,
    ready: false,
    hardIssues: Array.from({ length: 80 }, (_, index) => ({
      code: "DAY_WINDOW_CONFLICT",
      date: "2026-08-01",
      activityId: `place-${index}`,
    })),
    evidenceIssues: Array.from({ length: 80 }, (_, index) => ({
      code: "MISSING_OR_UNVERIFIED_OPENING_HOURS",
      placeId: `place-${index}`,
      message: `place-${index} opening hours are missing, not provider-verified, so it cannot be scheduled`,
    })),
  }));

  assert.ok(text.length <= DISCORD_MESSAGE_LIMIT, `reply must fit Discord (was ${text.length})`);
  assert.match(text, /외 \d+건/);
  assert.match(text, /하드 제약: 80건/);
  assert.match(text, /확인 필요: 80건/);
});

test("the check handler routes through the integrated diagnosis and stays owner-scoped", () => {
  const start = source.indexOf("async function handleGroundedCheck(interaction) {");
  assert.ok(start >= 0, "handleGroundedCheck must exist");
  const body = source.slice(start, source.indexOf("\n}\n", start));

  assert.match(body, /diagnoseStoredGroundedPlan\(plan\)/);
  assert.doesNotMatch(body, /checkStoredGroundedPlan\(/);
  assert.match(body, /const plan = await loadOwnedGroundedPlan\(interaction, planId\);\n  if \(!plan\) return;/);
  assert.match(body, /deferReply\(\{ ephemeral: true \}\)/);
  assert.match(body, /formatStoredPlanDiagnosis\(planId, diagnosis\)/);
});
