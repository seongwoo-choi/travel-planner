import test from "node:test";
import assert from "node:assert/strict";

import { generatePlan } from "../src/llm.js";

test("generatePlan uses the server provider when request LLM options are null", async () => {
  const previousProvider = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "mock";

  try {
    const generation = await generatePlan(
      {
        destination: "부산",
        departure: "서울",
        startDate: "2026-08-01",
        endDate: "2026-08-02",
        nights: 1,
        travelers: 1,
      },
      null,
      null,
      null
    );

    assert.equal(generation.model, "mock-template");
    assert.match(generation.plan, /부산/);
  } finally {
    if (previousProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = previousProvider;
  }
});