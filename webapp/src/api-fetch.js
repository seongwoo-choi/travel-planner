#!/usr/bin/env node

import { mkdirSync } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const target = args.find((arg) => !arg.startsWith("--")) || "/api/status";
const outputArg = args.find((arg) => arg.startsWith("--output="));
const outputEnvArg = args.find((arg) => arg.startsWith("--output-env="));
const outputDefaultArg = args.find((arg) => arg.startsWith("--output-default="));
const outputDefaultEvidenceArg = args.find((arg) => arg.startsWith("--output-default-evidence="));
const outputEnvName = outputEnvArg ? outputEnvArg.slice("--output-env=".length) : "";
const outputDefaultPath = outputDefaultArg ? outputDefaultArg.slice("--output-default=".length) : "";
const outputDefaultEvidencePath = outputDefaultEvidenceArg
  ? path.join(
      process.env.TRAVEL_EVIDENCE_DIR || "reports",
      outputDefaultEvidenceArg.slice("--output-default-evidence=".length),
    )
  : "";
const outputPath = outputArg
  ? outputArg.slice("--output=".length)
  : outputEnvName
    ? process.env[outputEnvName] || outputDefaultPath || outputDefaultEvidencePath
    : outputDefaultPath || outputDefaultEvidencePath;
const baseUrl = process.env.TRAVEL_PUBLIC_BASE_URL || "http://localhost:3000";
const timeoutMs = Math.max(1000, Number(process.env.TRAVEL_API_FETCH_TIMEOUT_MS || 5000));
const evidenceEnabled = ["1", "true", "yes", "on"].includes(String(process.env.TRAVEL_API_FETCH_EVIDENCE || "").trim().toLowerCase());
const startedAt = Date.now();

function buildUrl(value) {
  if (/^https?:\/\//i.test(value)) return new URL(value);
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(value.replace(/^\//, ""), base);
}

function resolveOutputPath(value) {
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.join(webappDir, value);
}

let url;
try {
  url = buildUrl(target);
} catch (error) {
  if (evidenceEnabled) {
    console.error(`apiFetchTarget=${target}`);
    console.error(`apiFetchAccessKeyHeader=${process.env.TRAVEL_ACCESS_KEY ? "enabled" : "disabled"}`);
    console.error("apiFetchStatus=error");
    console.error(`apiFetchElapsedMs=${Date.now() - startedAt}`);
  }
  console.error(`api fetch failed: invalid URL (${error.message})`);
  process.exit(1);
}

const headers = {};
if (process.env.TRAVEL_ACCESS_KEY) {
  headers["X-Travel-Access-Key"] = process.env.TRAVEL_ACCESS_KEY;
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);

let response;
let body = "";
try {
  response = await fetch(url, { headers, signal: controller.signal });
  body = await response.text();
} catch (error) {
  if (evidenceEnabled) {
    console.error(`apiFetchTarget=${url.toString()}`);
    console.error(`apiFetchAccessKeyHeader=${process.env.TRAVEL_ACCESS_KEY ? "enabled" : "disabled"}`);
    console.error("apiFetchStatus=error");
    console.error(`apiFetchElapsedMs=${Date.now() - startedAt}`);
  }
  console.error(`api fetch failed: ${error.name === "AbortError" ? `timeout after ${timeoutMs}ms` : error.message}`);
  process.exit(1);
} finally {
  clearTimeout(timeout);
}

if (!response.ok) {
  if (!outputPath && body) process.stdout.write(body.endsWith("\n") ? body : `${body}\n`);
  console.error(`api fetch failed: HTTP ${response.status} ${response.statusText}`);
  process.exit(1);
}

if (outputPath) {
  const resolvedOutputPath = resolveOutputPath(outputPath);
  const tempOutputPath = `${resolvedOutputPath}.tmp-${process.pid}`;
  try {
    mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
    await writeFile(tempOutputPath, body.endsWith("\n") ? body : `${body}\n`, "utf8");
    await rename(tempOutputPath, resolvedOutputPath);
    console.error(`api fetch wrote ${resolvedOutputPath}`);
  } catch (error) {
    await rm(tempOutputPath, { force: true }).catch(() => {});
    console.error(`api fetch failed: ${resolvedOutputPath} (${error.message})`);
    process.exit(1);
  }
} else if (body) {
  process.stdout.write(body.endsWith("\n") ? body : `${body}\n`);
}

if (evidenceEnabled) {
  console.error(`apiFetchTarget=${url.toString()}`);
  console.error(`apiFetchAccessKeyHeader=${process.env.TRAVEL_ACCESS_KEY ? "enabled" : "disabled"}`);
  console.error(`apiFetchStatus=${response.status}`);
  console.error(`apiFetchElapsedMs=${Date.now() - startedAt}`);
}
