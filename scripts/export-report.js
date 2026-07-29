#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeHarnessRequirements } from "../src/harness-input.js";
import { exportReport } from "../src/report-exporter.js";
import { readFile } from "node:fs/promises";

function option(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function safeSegment(value) {
  return String(value || "미지정").trim().replace(/[\\/:*?"<>|]/g, "_");
}

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const requirementsPath = path.resolve(option("requirements", path.join(root, "_workspace/00_input/requirements.json")));
const markdownPath = path.resolve(option("markdown", path.join(root, "_workspace/02_plan/travel_plan.md")));
const htmlOnly = process.argv.includes("--html-only");

try {
  const requirements = normalizeHarnessRequirements(JSON.parse(await readFile(requirementsPath, "utf8")));
  const outputDir = path.resolve(option(
    "output-dir",
    path.join(root, "trips", safeSegment(requirements.country), safeSegment(requirements.destination))
  ));
  const outputs = await exportReport({
    markdownPath,
    outputDir,
    title: `${requirements.destination} 여행 플랜`,
    htmlOnly,
    chromeBin: option("chrome-bin", ""),
  });
  process.stdout.write(`${JSON.stringify(outputs)}\n`);
} catch (error) {
  process.stderr.write(`travel-report failed: ${error.message}\n`);
  process.exitCode = 1;
}
