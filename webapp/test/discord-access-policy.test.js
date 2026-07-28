import test from "node:test";
import assert from "node:assert/strict";

import { configuredIdentityAllowed } from "../src/discord-access-policy.js";

test("Discord identity allowlists fail closed when unset", () => {
  assert.equal(configuredIdentityAllowed([], "user-a"), false);
  assert.equal(configuredIdentityAllowed(["user-a"], "user-a"), true);
  assert.equal(configuredIdentityAllowed(["user-a"], "user-b"), false);
});
