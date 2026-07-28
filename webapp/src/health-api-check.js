#!/usr/bin/env node

const args = process.argv.slice(2);
const gate = args.includes("--gate");
const explicitHealthUrl = args.find((arg) => !arg.startsWith("--"));
const configuredHealthUrl = explicitHealthUrl || process.env.TRAVEL_HEALTH_URL || "";
const configuredBaseUrl = process.env.TRAVEL_PUBLIC_BASE_URL || "http://localhost:3000";
const timeoutMs = Math.max(1000, Number(process.env.TRAVEL_HEALTH_TIMEOUT_MS || 5000));
const evidenceEnabled = ["1", "true", "yes", "on"].includes(String(process.env.TRAVEL_HEALTH_EVIDENCE || "").trim().toLowerCase());

function buildHealthUrlFromBase(value) {
  const base = value.endsWith("/") ? value : `${value}/`;
  return new URL("api/health.txt", base);
}

function buildHealthUrlFromEndpoint(value) {
  const url = new URL(value);
  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = "/api/health.txt";
  }
  return url;
}

function buildHealthUrl() {
  if (configuredHealthUrl) return buildHealthUrlFromEndpoint(configuredHealthUrl);
  return buildHealthUrlFromBase(configuredBaseUrl);
}

function evidenceTarget(url = null) {
  return url?.toString?.() || configuredHealthUrl || configuredBaseUrl;
}

function writeEvidence({ url = null, status = "error" } = {}) {
  if (!evidenceEnabled) return;
  console.error(`healthCheckTarget=${evidenceTarget(url)}`);
  console.error(`healthCheckGate=${gate ? "true" : "false"}`);
  console.error(`healthCheckStatus=${status}`);
  console.error(`healthCheckElapsedMs=${Date.now() - startedAt}`);
}

const startedAt = Date.now();
let url;
try {
  url = buildHealthUrl();
} catch (error) {
  writeEvidence({ status: "error" });
  console.error(`health api check failed: invalid health URL (${error.message})`);
  process.exit(1);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);

let response;
let body = "";
try {
  response = await fetch(url, { signal: controller.signal });
  body = await response.text();
} catch (error) {
  writeEvidence({ url, status: "error" });
  console.error(`health api check failed: ${error.name === "AbortError" ? `timeout after ${timeoutMs}ms` : error.message}`);
  process.exit(1);
} finally {
  clearTimeout(timeout);
}

if (body) process.stdout.write(body.endsWith("\n") ? body : `${body}\n`);

writeEvidence({ url, status: response.status });

if (!response.ok) {
  console.error(`health api check failed: HTTP ${response.status} ${response.statusText}`);
  process.exit(1);
}
