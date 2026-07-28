import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";


import {
  createJsonErrorHandler,
  installExpressAsyncBoundary,
  wrapAsyncHandler,
} from "../src/express-async-boundary.js";

test("stored plan fields are not interpolated into innerHTML sinks", async () => {
  const [appSource, planSource] = await Promise.all([
    fs.readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    fs.readFile(new URL("../public/plan.js", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(appSource, /link\.innerHTML\s*=.*plan\.destination/);
  assert.doesNotMatch(planSource, /tripStatus\.innerHTML\s*=.*\$\{status\./);
});

test("wrapAsyncHandler forwards rejected route promises to Express", async () => {
  const failure = new Error("boom");
  const wrapped = wrapAsyncHandler(async () => {
    throw failure;
  });
  const forwarded = await new Promise((resolve) => {
    wrapped({}, {}, resolve);
  });

  assert.equal(forwarded, failure);
});

test("installExpressAsyncBoundary wraps handlers registered after installation", async () => {
  const registrations = {};
  const app = {};
  for (const method of ["use", "all", "get", "post", "put", "patch", "delete", "options", "head"]) {
    app[method] = (...args) => {
      registrations[method] = args;
      return app;
    };
  }
  installExpressAsyncBoundary(app);
  const failure = new Error("route rejected");
  app.get("/failure", async () => { throw failure; });

  const forwarded = await new Promise((resolve) => {
    registrations.get[1]({}, {}, resolve);
  });

  assert.equal(forwarded, failure);
});

test("central error middleware returns a generic JSON 500 without leaking details", () => {
  const calls = [];
  const response = {
    headersSent: false,
    status(code) {
      calls.push(["status", code]);
      return this;
    },
    json(body) {
      calls.push(["json", body]);
    },
  };
  const logged = [];
  const middleware = createJsonErrorHandler({ logger: (error) => logged.push(error) });

  middleware(new Error("private database path"), { method: "GET", originalUrl: "/api/plans" }, response, () => {});

  assert.deepEqual(calls, [
    ["status", 500],
    ["json", { error: "internal server error" }],
  ]);
  assert.equal(logged.length, 1);
});
