import test from "node:test";
import assert from "node:assert/strict";

import { main } from "../src/discord-bot.js";

// If the readiness gate ran after client.login(), main() would reject with a
// Discord token error (or hang on the network) instead of this message.
test("bot startup fails fast on missing GOOGLE_MAPS_API_KEY before logging in", async () => {
  const savedKey = process.env.GOOGLE_MAPS_API_KEY;
  const savedToken = process.env.DISCORD_BOT_TOKEN;
  delete process.env.GOOGLE_MAPS_API_KEY;
  process.env.DISCORD_BOT_TOKEN = "startup-test-token";
  try {
    await assert.rejects(main(), /GOOGLE_MAPS_API_KEY/);
  } finally {
    if (savedKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = savedKey;
    if (savedToken === undefined) delete process.env.DISCORD_BOT_TOKEN;
    else process.env.DISCORD_BOT_TOKEN = savedToken;
  }
});
