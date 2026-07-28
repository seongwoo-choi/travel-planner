import test from "node:test";
import assert from "node:assert/strict";

import { authorizeApiRequest } from "../src/api-auth.js";

test("API auth allows only health/status routes when no access key is configured", () => {
  assert.deepEqual(authorizeApiRequest({ path: "/health", configuredKey: "", providedKey: "" }), { allowed: true });
  assert.deepEqual(authorizeApiRequest({ path: "/plans", configuredKey: "", providedKey: "" }), {
    allowed: false,
    status: 503,
    error: "access key is not configured",
  });
});

test("API auth compares a configured access key and fails closed", () => {
  assert.deepEqual(authorizeApiRequest({ path: "/plans", configuredKey: "secret-a", providedKey: "secret-a" }), { allowed: true });
  assert.deepEqual(authorizeApiRequest({ path: "/plans", configuredKey: "secret-a", providedKey: "secret-b" }), {
    allowed: false,
    status: 401,
    error: "access key required",
  });
});
