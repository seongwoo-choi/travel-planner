#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dbPath = resolveDbPath(process.env.TRAVEL_DB_PATH || "data/plans.json");

function resolveDbPath(value) {
  return path.isAbsolute(value) ? value : path.join(webappDir, value);
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

async function canWriteParent(filePath) {
  try {
    await access(path.dirname(filePath), constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

const errors = [];
let db;

try {
  db = JSON.parse(await readFile(dbPath, "utf8"));
} catch (error) {
  if (error.code === "ENOENT") {
    const parentWritable = await canWriteParent(dbPath);
    console.log(
      JSON.stringify(
        {
          status: parentWritable ? "ok" : "failed",
          dbPath,
          dbState: "missing",
          parentWritable,
          planCount: 0,
          errors: parentWritable ? [] : ["db-parent-not-writable"],
        },
        null,
        2
      )
    );
    if (!parentWritable) process.exit(1);
    process.exit(0);
  }
  console.error(`storage integrity check failed: ${error.message}`);
  process.exit(1);
}

if (!db || typeof db !== "object" || Array.isArray(db)) {
  errors.push("db-root-must-be-object");
}

const plans = Array.isArray(db?.plans) ? db.plans : [];
if (!Array.isArray(db?.plans)) {
  errors.push("plans-must-be-array");
}

const planIds = new Set();
for (const [index, plan] of plans.entries()) {
  const label = `plans[${index}]`;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    errors.push(`${label}-must-be-object`);
    continue;
  }

  if (!hasValue(plan.id)) {
    errors.push(`${label}-missing-id`);
  } else if (planIds.has(String(plan.id))) {
    errors.push(`${label}-duplicate-id`);
  } else {
    planIds.add(String(plan.id));
  }

  if (!hasValue(plan.title)) errors.push(`${label}-missing-title`);
  if (!hasValue(plan.startDate)) errors.push(`${label}-missing-startDate`);

  if (plan.revisions !== undefined && !Array.isArray(plan.revisions)) {
    errors.push(`${label}-revisions-must-be-array`);
  }

  const revisions = Array.isArray(plan.revisions) ? plan.revisions : [];
  const revisionVersions = new Set();
  for (const [revisionIndex, revision] of revisions.entries()) {
    const revisionLabel = `${label}.revisions[${revisionIndex}]`;
    if (!revision || typeof revision !== "object" || Array.isArray(revision)) {
      errors.push(`${revisionLabel}-must-be-object`);
      continue;
    }
    if (!hasValue(revision.version)) {
      errors.push(`${revisionLabel}-missing-version`);
    } else if (revisionVersions.has(String(revision.version))) {
      errors.push(`${revisionLabel}-duplicate-version`);
    } else {
      revisionVersions.add(String(revision.version));
    }
  }

  if (hasValue(plan.latestVersion) && revisions.length > 0 && !revisionVersions.has(String(plan.latestVersion))) {
    errors.push(`${label}-latestVersion-missing-revision`);
  }
}

const payload = {
  status: errors.length === 0 ? "ok" : "failed",
  dbPath,
  dbState: "available",
  planCount: plans.length,
  errors,
};

console.log(JSON.stringify(payload, null, 2));
if (errors.length > 0) process.exit(1);
