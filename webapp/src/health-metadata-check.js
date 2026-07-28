#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(webappDir, "public");
const healthPath = path.join(publicDir, "health.json");
const serviceWorkerPath = path.join(publicDir, "service-worker.js");

function extractCacheName(source) {
  return source.match(/const\s+CACHE_NAME\s*=\s*"([^"]+)"/)?.[1] ?? null;
}

function extractShellAssets(source) {
  const match = source.match(/const\s+SHELL_ASSETS\s*=\s*\[([\s\S]*?)\];/);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((asset) => asset[1]);
}

function surfaceFilePath(surfacePath) {
  if (surfacePath === "/") return path.join(publicDir, "index.html");
  if (!surfacePath.startsWith("/")) return null;
  return path.join(publicDir, surfacePath.slice(1));
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

const errors = [];
const health = JSON.parse(await readFile(healthPath, "utf8"));
const serviceWorker = await readFile(serviceWorkerPath, "utf8");
const cacheName = extractCacheName(serviceWorker);
const shellAssets = extractShellAssets(serviceWorker);

if (health.schemaVersion !== 1) {
  errors.push(`Expected schemaVersion 1, received ${health.schemaVersion}`);
}

if (!health.serviceWorkerCacheName) {
  errors.push("health.json is missing serviceWorkerCacheName");
} else if (health.serviceWorkerCacheName !== cacheName) {
  errors.push(
    `serviceWorkerCacheName mismatch: health.json=${health.serviceWorkerCacheName}, service-worker.js=${cacheName}`
  );
}

if (!shellAssets.includes("/health.json")) {
  errors.push("service-worker.js SHELL_ASSETS must include /health.json");
}

if (!Array.isArray(health.surfaces) || health.surfaces.length === 0) {
  errors.push("health.json must list at least one surface");
} else {
  for (const surface of health.surfaces) {
    const filePath = surfaceFilePath(surface.path);
    if (!filePath) {
      errors.push(`Surface ${surface.name ?? "(unnamed)"} has an invalid path`);
    } else if (!(await fileExists(filePath))) {
      errors.push(`Surface ${surface.name ?? surface.path} points to a missing file: ${surface.path}`);
    }
  }
}

if (!Array.isArray(health.operatorChecks) || health.operatorChecks.length === 0) {
  errors.push("health.json must list at least one operator check");
}

if (errors.length > 0) {
  console.error("Health metadata check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      cacheName,
      surfaces: health.surfaces.map((surface) => surface.path),
      shellAssets: shellAssets.length,
      operatorChecks: health.operatorChecks.length,
    },
    null,
    2
  )
);
